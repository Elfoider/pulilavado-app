"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { contractsEnvironment, getContractsClient } from "@/features/access/infrastructure/firebase-contracts";
import { loadFirestoreContext } from "@/features/access/infrastructure/firestore-context";
import { baselineRepository } from "@/features/access/infrastructure/firestore-baseline";
import { readAuthorizedBaseline, type Baseline } from "@/features/access/application/read-baseline";
import { effectivePermissions } from "@/features/access/domain/policy";
import type { AccessContext } from "@/features/access/domain/model";

const message = (error: unknown) => error instanceof Error && error.name === "AccessError" ? error.message : "No se pudo validar el acceso. Revise la cuenta, sus permisos y los emuladores locales.";
export default function AccessWorkbench() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [context, setContext] = useState<AccessContext | null>(null);
  const [branchId, setBranchId] = useState("");
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef({ generation: 0 });
  const refresh = useCallback(async (userId: string, preferred = "") => {
    const generation = ++request.current.generation;
    setContext(null); setBaseline(null); setError(""); setBusy(true);
    try {
      const client = getContractsClient();
      const next = await loadFirestoreContext(client.db, userId);
      const selected = next.branches.some(branch => branch.id === preferred) ? preferred : next.branches[0].id;
      // Read from the server on every change. Rules re-check grants and revocations.
      if (generation !== request.current.generation) return;
      setContext(next); setBranchId(selected);
      const data = await readAuthorizedBaseline(next, { organizationId: next.organization.id, branchId: selected }, baselineRepository(client.db));
      if (generation === request.current.generation) setBaseline(data);
    } catch (err) {
      if (generation === request.current.generation) { setContext(null); setBranchId(""); setError(message(err)); }
    } finally { if (generation === request.current.generation) setBusy(false); }
  }, []);
  useEffect(() => {
    if (!contractsEnvironment.enabled) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;
    const pending = request.current;
    const client = getContractsClient();
    client.ready.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(client.auth, user => {
        ++request.current.generation; setUid(user?.uid ?? null); setContext(null); setBaseline(null); setBranchId(""); setError(""); setBusy(false);
        if (user) void refresh(user.uid);
      });
    }).catch(() => { if (active) setError("No se pudo iniciar el laboratorio local de acceso."); });
    return () => { active = false; ++pending.generation; unsubscribe?.(); };
  }, [refresh]);
  async function login(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true); ++request.current.generation; setContext(null); setBaseline(null);
    try {
      const client = getContractsClient(); await client.ready;
      if (client.auth.currentUser) await signOut(client.auth);
      await signInWithEmailAndPassword(client.auth, email.trim(), password);
      setPassword("");
    } catch { setError("No se pudo iniciar sesión. Compruebe las credenciales de prueba y el emulador de Auth."); setBusy(false); }
  }
  async function logout() {
    ++request.current.generation; setContext(null); setBaseline(null); setBranchId(""); setUid(null); setError(""); setBusy(true);
    try { await signOut(getContractsClient().auth); } catch { setError("No se pudo cerrar la sesión local. Recargue la página."); } finally { setBusy(false); }
  }
  return <div className="max-w-4xl space-y-6 pb-10">
    <header className="space-y-2"><Link href="/migration" className="text-sm font-semibold text-cyan-800 underline">Volver al centro de migración</Link><h1 className="text-3xl font-black text-slate-900">Acceso y sedes V2</h1><p className="text-slate-600">Validación de usuarios, permisos y aislamiento con datos ficticios.</p></header>
    {!contractsEnvironment.enabled ? <section className="bg-white border rounded-2xl p-6 space-y-3"><h2 className="text-xl font-bold">Laboratorio local desactivado</h2><p>Consulte docs/migration/FASE_2_ACCESO.md para iniciar los emuladores y cargar las cuentas de ejemplo.</p><p className="text-sm text-slate-500">Active NEXT_PUBLIC_V2_CONTRACTS_SANDBOX=true y reinicie el servidor.</p></section> : <>
      <section className="rounded-2xl bg-slate-900 text-white p-5"><h2 className="font-bold">Entorno de prueba independiente</h2><p className="text-sm mt-2">Use las cuentas de ejemplo de la guía de fase 2. Los datos de esta pantalla son ficticios y no representan ventas ni saldos del negocio.</p></section>
      {!uid && <form onSubmit={login} className="bg-white border rounded-2xl p-6 space-y-4"><h2 className="text-xl font-bold">Iniciar sesión de prueba</h2><label className="block font-semibold text-sm">Correo<input aria-label="Correo de prueba" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="block border rounded-xl p-3 mt-1 w-full" /></label><label className="block font-semibold text-sm">Contraseña<input aria-label="Contraseña de prueba" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="block border rounded-xl p-3 mt-1 w-full" /></label><button disabled={busy} className="bg-cyan-800 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50">Entrar</button></form>}
      {uid && <div className="flex flex-wrap gap-3"><button onClick={() => void refresh(uid, branchId)} disabled={busy} className="border rounded-xl bg-white px-4 py-2 font-semibold disabled:opacity-50">Actualizar acceso</button><button onClick={() => void logout()} className="border rounded-xl bg-white px-4 py-2 font-semibold">Cerrar sesión</button></div>}
      {context && <section className="bg-white border rounded-2xl p-6 space-y-4"><h2 className="text-xl font-bold">Acceso validado</h2><p><strong>{context.profile.displayName}</strong> · {context.organization.name} · {context.role.name}</p><label className="block font-semibold text-sm">Sede autorizada<select aria-label="Sede autorizada" value={branchId} disabled={busy} onChange={e => { if (uid) void refresh(uid, e.target.value); }} className="block border rounded-xl p-3 mt-1 w-full">{context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <details><summary className="cursor-pointer text-sm font-semibold">Ver permisos efectivos</summary><ul className="mt-3 text-sm space-y-1">{Object.entries(effectivePermissions(context)).map(([permission, scope]) => <li key={permission}>{permission} · {scope === "organization" ? "Organización" : "Sede"}</li>)}</ul></details>
      </section>}
      {baseline && <section aria-label="Resumen de sede de prueba" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h2 className="text-lg font-bold">{baseline.label}</h2><p className="text-3xl font-black mt-2">{baseline.vehicles} vehículos ficticios</p><p className="text-sm mt-2">Organización: {baseline.organizationId} · Sede: {baseline.branchId}</p></section>}
    </>}
    {busy && <p role="status">Validando acceso…</p>}{error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
  </div>;
}
