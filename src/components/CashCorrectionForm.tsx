"use client";

import { useRef, useState, type FormEvent } from "react";
import type { CashMovement } from "@/lib/operations/model";

export default function CashCorrectionForm({ movement, onSaved }: { movement: CashMovement; onSaved: () => void }) {
  const [mode, setMode] = useState<"amount" | "void">("amount");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = form.elements.namedItem("cashKey") as HTMLInputElement;
    const key = String(values.get("cashKey") ?? "").trim();
    password.value = "";
    if (!/^[0-9a-f]{48}$/.test(key)) { setError("Verifique la clave de Caja."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/cash/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ movementId: movement.id, mode, reason: values.get("reason"), ...(mode === "amount" ? { amount: Number(values.get("amount")) } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) { setError(typeof result.message === "string" ? result.message : "No se pudo guardar la corrección."); return; }
      form.reset();
      onSaved();
    } catch {
      setError("No se pudo confirmar el resultado. Actualice el historial antes de volver a intentarlo.");
    } finally { pending.current = false; setBusy(false); }
  }
  return <details className="mt-2">
    <summary className="cursor-pointer font-semibold text-cyan-800">Corregir o anular</summary>
    <form onSubmit={submit} className="mt-2 min-w-56 space-y-2 rounded-lg border bg-slate-50 p-3">
      <p className="text-xs text-slate-600">Original: ${Math.abs(movement.amount).toFixed(2)} · {movement.method}. Se conservará en el historial.</p>
      <label className="block">Acción<select value={mode} disabled={busy} onChange={e => setMode(e.target.value === "void" ? "void" : "amount")} className="block w-full rounded border bg-white p-2"><option value="amount">Corregir monto</option><option value="void">Anular movimiento</option></select></label>
      {mode === "amount" && <label className="block">Monto correcto ($)<input name="amount" type="number" min="0.01" step="0.01" required disabled={busy} className="block w-full rounded border bg-white p-2" /></label>}
      {mode === "void" && movement.kind === "payroll_advance" && <p className="text-xs text-amber-900">Confirme que el vale es duplicado o que el dinero no salió. El vale anulado dejará de descontarse en nómina.</p>}
      <label className="block">Motivo<input name="reason" minLength={3} maxLength={240} required disabled={busy} className="block w-full rounded border bg-white p-2" /></label>
      <label className="block">Clave de Caja<input name="cashKey" type="password" autoComplete="off" required disabled={busy} className="block w-full rounded border bg-white p-2" /></label>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      <button disabled={busy} className="rounded bg-cyan-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : mode === "void" ? "Confirmar anulación" : "Guardar corrección"}</button>
    </form>
  </details>;
}
