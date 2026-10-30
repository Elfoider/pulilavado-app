"use client";
import { useState } from "react";
import CashSavings from "@/features/cash/components/CashSavings";
import HelpTip from "@/shared/ui/HelpTip";
import SectionLink from "@/shared/navigation/SectionLink";
import { ArrowUpRight, Banknote, Coins, HandCoins, Plus, ShieldCheck, Wallet } from "lucide-react";
import { enqueueSnackbar } from "notistack";
import { useCollection } from "@/infrastructure/firebase/hooks/useCollection";
import {
  Data,
  CashSession,
  CashMovement,
  METHODS,
  isCashSession,
  cashSessionProblem,
  isLegacyCashSession,
} from "@/features/operations/domain/model";
import { newId, operations } from "@/features/operations";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/infrastructure/firebase/client";
import { movementKinds } from "@/features/reports/domain/cash";

export default function CashPanel() {
  const {
    data: rawSessions,
    error,
    loading,
  } = useCollection<Data & { id: string }>("cashSessions", "openedAt", 100);
  const [selectedId, setSelectedId] = useState(""),
    [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(""),
    [counted, setCounted] = useState(""),
    [notes, setNotes] = useState("");
  const washers = useCollection<Data & {id:string}>("washers");
  const [washerId, setWasherId] = useState("");
  const [move, setMove] = useState({
    amount: "",
    method: "Efectivo",
    kind: "expense" as "expense" | "income" | "withdrawal" | "advance",
    description: "",
  });
  const [openingId, setOpeningId] = useState(newId),
    [moveId, setMoveId] = useState(newId);
  const sessions = rawSessions.filter((s): s is Data & CashSession =>
    isCashSession(s),
  );
  const legacy = rawSessions.filter(isLegacyCashSession);
  const incompatible = rawSessions.filter((s) => !isCashSession(s) && !isLegacyCashSession(s));
  const blocked = incompatible.some((s) => s.status !== "closed") || legacy.some((s) => s.isOpen === true);
  const open = sessions.find((s) => s.status === "open");
  const session =
    sessions.find((s) => s.id === selectedId) ?? open ?? sessions[0];
  async function run(work: () => Promise<unknown>, legacyClosing = false) {
    if (busy || (blocked && !legacyClosing)) return;
    setBusy(true);
    try {
      await work();
      enqueueSnackbar("Operación de caja guardada.", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : "No se pudo guardar.", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cash-panel space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Caja</h1>
          <p className="text-gray-600">
            Apertura, cobros, gastos, vales, arqueo y cierre.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-center"><SectionLink href="/envelopes">Sobres</SectionLink><SectionLink href="/sales">Vender productos</SectionLink><SectionLink href="/movements">Movimientos</SectionLink><SectionLink href="/reports">Reportes</SectionLink></div>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {legacy.filter((s) => s.isOpen === true).map((s) => (
        <section key={s.id} className="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
          <h2 className="font-bold">Caja anterior · Abierta</h2>
          <p className="text-sm break-all">Registro: {s.id} · Responsable: {String(s.responsible)} · Fondo inicial: ${Number(s.initialAmount).toFixed(2)}</p>
          <p className="text-sm">Esta caja no registra saldos por método de pago. Su saldo final y la diferencia de arqueo no se pueden calcular. Sus datos y los cobros históricos se conservan.</p>
          {(
            <form className="space-y-3 max-w-lg" onSubmit={(e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              void run(() => operations.closeLegacyCash(s.id, Number(values.get("counted")), String(values.get("notes"))), true);
            }}>
              <p className="text-sm font-bold">Revise los cobros anteriores y cuente el efectivo antes de cerrar. El monto contado se guarda como constancia; no se trasladará automáticamente a una jornada nueva.</p>
              <label className="block text-sm">Efectivo contado ($)<input name="counted" required type="number" min="0" step="0.01" className="block border border-slate-200 rounded-lg p-2 w-full" /></label>
              <label className="block text-sm">Responsable de la revisión y observación<textarea name="notes" required className="block border border-slate-200 rounded-lg p-2 w-full" /></label>
              <label className="block text-sm"><input type="checkbox" required /> Revisé esta caja y confirmo su cierre para iniciar una jornada nueva.</label>
              <button disabled={busy} className="bg-gray-800 text-white px-5 py-2 rounded-lg disabled:opacity-50">Cerrar caja anterior</button>
            </form>
           )}
        </section>
      ))}
      {incompatible.length > 0 && (
        <section
          role="alert"
          className="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-2"
        >
          <h2 className="font-bold">
            Hay registros de caja con un formato anterior o incompleto
          </h2>
          <p className="text-sm">
            Se conservan sin modificar. No se muestran saldos que no se pueden
            verificar.
          </p>
          <ul className="text-sm space-y-1">
            {incompatible.map((s) => (
              <li key={s.id} className="break-all">
                Caja {s.id}: {cashSessionProblem(s)}
              </li>
            ))}
          </ul>
          {blocked && (
            <p className="text-sm font-bold">
              Antes de abrir, cobrar o mover dinero, revise el registro de caja
              abierto o de estado desconocido. La actualización no lo elimina ni
              reinicia sus importes.
            </p>
          )}
        </section>
      )}
      {!open && !loading && !error && !blocked && (
        <form
          className="bg-white border border-cyan-100 rounded-2xl p-6 max-w-lg space-y-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const id = await operations.openCash(Number(opening), openingId);
              setOpeningId(newId());
              setSelectedId(id);
              setCounted("");
              setNotes("");
            });
          }}
        >
          <div className="flex items-center gap-2 text-cyan-900"><Wallet className="h-5 w-5"/><h2 className="text-xl font-bold">Comenzar jornada</h2><HelpTip label="Fondo inicial">Registre el efectivo físico con el que empieza. No se cuenta como venta. Puede indicar 0 si no hay fondo.</HelpTip></div>
          <label className="block text-sm">
            Fondo inicial en efectivo ($)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={opening}
              onChange={(e) => {
                setOpening(e.target.value);
                setOpeningId(newId());
              }}
              className="block border border-slate-200 rounded-lg p-2 w-full"
            />
          </label>
          <button
            disabled={busy}
            className="bg-cyan-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            Abrir jornada
          </button>
        </form>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="cash-history" className="font-bold">
          Historial de cajas
        </label>
        <select
          id="cash-history"
          value={session?.id ?? ""}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setCounted("");
            setNotes("");
          }}
          className="border border-slate-200 rounded-lg p-2 bg-white max-w-full"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.openedAt
                ? new Date(s.openedAt.seconds * 1000).toLocaleString()
                : "..."}{" "}
              · {s.status === "open" ? "Abierta" : "Cerrada"}
            </option>
          ))}
        </select>
      </div>
      <HelpTip label="Consultar otra jornada">Se muestran las 100 cajas más recientes. Use Movimientos o Reportes para consultar por fechas. Los cobros históricos conservan sus datos.</HelpTip>
      {session && (
        <>
          <section className="bg-white border border-cyan-100 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">
                {session.status === "open" ? "Caja abierta" : "Cierre de caja"}
              </h2>
              <button className="text-cyan-700" onClick={() => window.print()}>
                Imprimir
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-cyan-950 p-5 text-white"><div className="flex items-center justify-between gap-2 text-cyan-100"><p className="text-xs font-bold uppercase tracking-wide">Efectivo esperado</p><Banknote className="h-5 w-5"/></div><p className="text-4xl font-black mt-3">${session.balances.Efectivo.toFixed(2)}</p><p className="text-xs text-cyan-100 mt-2">Incluye el fondo inicial</p></div>
              <CashSavings session={session}/>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{METHODS.filter(method=>method!=="Efectivo").map(method=><div key={method} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-bold text-slate-500">{method}</p><p className="text-xl font-bold text-slate-800 mt-1">${session.balances[method].toFixed(2)}</p></div>)}</div>
            <div className="flex flex-wrap gap-6 text-sm">
              <p>
                Fondo inicial: <b>${session.openingAmount.toFixed(2)}</b>
              </p>
              <p>
                Cobros netos (servicios y productos):{" "}
                <b>${session.receipts.toFixed(2)}</b>
              </p>
              <p>
                Propinas netas: <b>${session.tips.toFixed(2)}</b>
              </p>
              <p>
                Gastos: <b>${session.expenses.toFixed(2)}</b>
              </p>
            </div>
            <HelpTip label="Propinas y comisiones">
              Las propinas se incluyen en el saldo del método recibido y se
              muestran separadas de las ventas. Para entregarlas al lavador
              registre un retiro con su nombre. La comisión se registra en el
              servicio; solo afecta el efectivo al pagarla como retiro.
            </HelpTip>
            {session.status === "closed" && (
              <div className="border-t pt-4">
                <p>
                  Efectivo contado: <b>${session.countedAmount?.toFixed(2)}</b>{" "}
                  · Diferencia: <b>${session.difference?.toFixed(2)}</b>
                </p>
                <p className="text-sm text-gray-600">{session.notes}</p>
              </div>
            )}
          </section>
      {session.status === "open" && open?.id === session.id && !blocked && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (move.kind === "advance") await operations.registerAdvance(washerId, Number(move.amount), move.description, moveId);
              else await operations.cashMove(
                Number(move.amount),
                move.method,
                move.kind,
                move.description,
                moveId,
              );
              setMoveId(newId());
              setMove({ ...move, amount: "", description: "" });
            });
          }}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold text-slate-800">Registrar movimiento</h2><HelpTip label="Tipos de movimiento">Gasto: pagos del negocio. Retiro: entrega o salida de dinero. Vale: adelanto de nómina vinculado al lavador. Ingreso: fondos adicionales que no son ventas.</HelpTip></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">{([{kind:"expense",label:"Gasto",icon:ArrowUpRight},{kind:"withdrawal",label:"Retiro / pago",icon:HandCoins},{kind:"advance",label:"Vale",icon:Coins},{kind:"income",label:"Ingreso",icon:Plus}] as const).map(action=><button key={action.kind} type="button" aria-pressed={move.kind===action.kind} onClick={()=>{setMoveId(newId());setMove({...move,kind:action.kind,method:action.kind==="advance"?"Efectivo":move.method});}} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${move.kind===action.kind?"border-cyan-600 bg-cyan-700 text-white shadow-sm":"border-slate-200 bg-slate-50 text-slate-600 hover:bg-cyan-50"}`}><action.icon className="h-4 w-4"/>{action.label}</button>)}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              aria-label="Tipo de movimiento de caja"
              value={move.kind}
              onChange={(e) => {
                setMoveId(newId());
                setMove({ ...move, kind: e.target.value as typeof move.kind, method: e.target.value === "advance" ? "Efectivo" : move.method });
              }}
              className="border border-slate-200 rounded-lg p-2"
            >
              <option value="expense">Gasto</option>
              <option value="withdrawal">Retiro / pago a lavador</option>
              <option value="income">Ingreso adicional</option>
              <option value="advance">Vale / adelanto a lavador</option>
            </select>
            <select
              aria-label="Método del movimiento"
              disabled={move.kind === "advance"}
              value={move.method}
              onChange={(e) => {
                setMoveId(newId());
                setMove({ ...move, method: e.target.value });
              }}
              className="border border-slate-200 rounded-lg p-2"
            >
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              required
              aria-label="Monto del movimiento"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Monto $"
              value={move.amount}
              onChange={(e) => {
                setMoveId(newId());
                setMove({ ...move, amount: e.target.value });
              }}
              className="border border-slate-200 rounded-lg p-2"
            />
            <input
              required
              aria-label="Motivo del movimiento"
              placeholder="Motivo o beneficiario"
              value={move.description}
              onChange={(e) => {
                setMoveId(newId());
                setMove({ ...move, description: e.target.value });
              }}
              className="border border-slate-200 rounded-lg p-2"
            />
          </div>
          {move.kind === "advance" && <label className="block text-sm">Lavador del vale<select required value={washerId} onChange={e => {setWasherId(e.target.value);setMoveId(newId());}} aria-label="Lavador del vale" className="block border border-slate-200 rounded-lg p-2 w-full max-w-md"><option value="">Seleccione un lavador</option>{washers.data.filter(w=>w.active!==false).map(w=><option key={w.id} value={w.id}>{String(w.name ?? "Sin nombre")}</option>)}</select><span className="block text-xs text-cyan-700 mt-1">Se descontará de la nómina de este lavador.</span>{washers.error && <span role="alert" className="text-red-700">{washers.error}</span>}</label>}
          <button
            disabled={busy}
            className="bg-cyan-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
          >
            Guardar movimiento
          </button>
        </form>
      )}

          {session.status === "open" && !blocked && (
            <details className="rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer items-center gap-2 rounded-2xl p-5 font-bold text-slate-700 list-none"><ShieldCheck className="h-5 w-5 text-cyan-700"/>Arqueo y cierre<span className="ml-auto text-xs font-normal text-slate-500">Abrir / cerrar</span></summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !confirm(
                    "¿Cerrar esta caja? Los cobros de esta jornada quedarán bloqueados para correcciones y anulaciones.",
                  )
                )
                  return;
                void run(() =>
                  operations.closeCash(session.id, Number(counted), notes),
                );
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <h2 className="text-lg font-bold">Contar efectivo y cerrar</h2>
              {session.balances.Efectivo > session.openingAmount && <div className="flex flex-wrap items-center gap-2"><HelpTip label="Antes de cerrar">Si va a guardar el efectivo de la jornada en un sobre, registre ese traslado antes de cerrar esta caja.</HelpTip><SectionLink href="/envelopes">Guardar en sobre</SectionLink></div>}
              <label className="block text-sm">
                Efectivo físico contado ($)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  className="block border border-slate-200 rounded-lg p-2 max-w-xs"
                />
              </label>
              <p className="text-sm">
                Diferencia:{" "}
                {counted === ""
                  ? "—"
                  : `$${(Number(counted) - session.balances.Efectivo).toFixed(2)}`}
              </p>
              <textarea
                aria-label="Observaciones del cierre"
                placeholder="Observaciones del cierre"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border border-slate-200 rounded-lg p-2 w-full"
              />
              <button
                disabled={busy || counted === ""}
                className="bg-red-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
              >
                Cerrar caja
              </button>
            </form></details>
          )}
          <CashMovements key={session.id} sessionId={session.id} />
        </>
      )}
    </div>
  );
}

function CashMovements({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<CashMovement[]>([]),
    [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData>>(),
    [more, setMore] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    try {
      const base = [
        where("sessionId", "==", sessionId),
        orderBy("createdAt", "desc"),
        limit(100),
      ];
      const snap = await getDocs(
        query(
          collection(db, "cashMovements"),
          ...base,
          ...(cursor ? [startAfter(cursor)] : []),
        ),
      );
      setRows((prev) => [
        ...prev,
        ...snap.docs.map((d) => ({ ...d.data(), id: d.id }) as CashMovement),
      ]);
      setCursor(snap.docs.at(-1));
      setMore(snap.size === 100);
      setError("");
    } catch {
      setError(
        "No se pudo cargar el detalle. Verifique permisos e índice de movimientos de caja.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5">
      <h2 className="text-xl font-bold mb-3">Movimientos de esta caja</h2>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr>
              {["Fecha", "Tipo", "Método", "Monto", "Saldo método antes", "Saldo método después", "Efectivo antes", "Efectivo después", "Detalle / referencia"].map(
                (h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3">
                  {m.createdAt
                    ? new Date(m.createdAt.seconds * 1000).toLocaleString()
                    : "..."}
                </td>
                <td className="p-3">{movementKinds[m.kind] ?? m.kind}</td>
                <td className="p-3">{m.method}</td>
                <td className="p-3 font-bold">${m.amount.toFixed(2)}</td>
                {[m.balancesBefore?.[m.method], m.balancesAfter?.[m.method], m.balancesBefore?.Efectivo, m.balancesAfter?.Efectivo].map((value, index) => <td key={index} className="p-3 whitespace-nowrap">{typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "No registrado"}</td>)}
                <td className="p-3">
                  {m.description}
                  <p className="text-xs text-gray-400 break-all">
                    {m.referenceId}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button
          disabled={busy}
          onClick={() => void load()}
          className="mt-4 text-cyan-700 disabled:opacity-50"
        >
          {busy
            ? "Cargando..."
            : rows.length
              ? "Cargar más movimientos"
              : "Ver movimientos"}
        </button>
      )}
      <HelpTip label="Sobre este historial">
        Los saldos antes y después se registran desde esta versión. Los movimientos anteriores conservan sus datos. Los movimientos se cargan en grupos de 100. Vuelva a seleccionar la caja
        para actualizar el detalle.
      </HelpTip>
    </section>
  );
}
