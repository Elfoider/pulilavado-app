"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { enqueueSnackbar } from "notistack";
import { useCollection } from "@/lib/useCollection";
import {
  Data,
  CashSession,
  CashMovement,
  METHODS,
  isCashSession,
  cashSessionProblem,
  cashBusinessBalances,
  isLegacyCashSession,
} from "@/lib/operations/model";
import { newId, operations } from "@/lib/operations";
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
import { db } from "@/lib/firebase";

export default function CashPanel() {
  const {
    data: rawSessions,
    error,
    loading,
  } = useCollection<Data & { id: string }>("cashSessions", "openedAt", 100);
  const [selectedId, setSelectedId] = useState(""),
    [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState("0"),
    [counted, setCounted] = useState(""),
    [notes, setNotes] = useState("");
  const [move, setMove] = useState({
    amount: "",
    method: "Efectivo",
    kind: "expense" as "expense" | "income" | "withdrawal",
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
  const [tipError, setTipError] = useState("");
  useEffect(() => {
    if (!open || open.tipsByMethod) return;
    let active = true;
    operations.prepareCashSession(open.id).catch((error: unknown) => {
      if (active) setTipError(error instanceof Error ? error.message : "No se pudieron separar las propinas.");
    });
    return () => { active = false; };
  }, [open]);
  const cashReady = !!session && (session.status === "closed" && !session.cashCountExcludesTips || !!session.tipsByMethod);
  const displayBalances = cashReady && session
    ? (session.status === "closed" && !session.cashCountExcludesTips ? session.balances : cashBusinessBalances(session))
    : null;

  async function run(work: () => Promise<unknown>, legacyClosing = false) {
    if (busy || (blocked && !legacyClosing) || (!legacyClosing && open && !open.tipsByMethod)) return;
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
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Caja</h1>
          <p className="text-gray-600">
            Apertura, cobros, gastos, arqueo y cierre.
          </p>
        </div>
        <Link href="/sales" className="text-cyan-700 font-bold self-center">
          Vender productos →
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {open && !open.tipsByMethod && <p role="status" className="text-sm text-gray-600">{tipError || "Separando las propinas de la caja…"}</p>}
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
              <label className="block text-sm">Efectivo contado ($)<input name="counted" required type="number" min="0" step="0.01" className="block border rounded-lg p-2 w-full" /></label>
              <label className="block text-sm">Responsable de la revisión y observación<textarea name="notes" required className="block border rounded-lg p-2 w-full" /></label>
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
          className="bg-white border rounded-2xl p-5 max-w-lg space-y-3"
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
          <h2 className="text-xl font-bold">Abrir caja</h2>
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
              className="block border rounded-lg p-2 w-full"
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
      {open && !!open.tipsByMethod && !blocked && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await operations.cashMove(
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
          className="bg-white border rounded-2xl p-5 space-y-3"
        >
          <h2 className="text-xl font-bold">Registrar gasto o movimiento</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              aria-label="Tipo de movimiento de caja"
              value={move.kind}
              onChange={(e) => {
                setMoveId(newId());
                setMove({ ...move, kind: e.target.value as typeof move.kind });
              }}
              className="border rounded-lg p-2"
            >
              <option value="expense">Gasto</option>
              <option value="withdrawal">Retiro / pago a lavador</option>
              <option value="income">Ingreso adicional</option>
            </select>
            <select
              aria-label="Método del movimiento"
              value={move.method}
              onChange={(e) => {
                setMoveId(newId());
                setMove({ ...move, method: e.target.value });
              }}
              className="border rounded-lg p-2"
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
              className="border rounded-lg p-2"
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
              className="border rounded-lg p-2"
            />
          </div>
          <button
            disabled={busy}
            className="bg-gray-800 text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            Guardar movimiento
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
          className="border rounded-lg p-2 bg-white max-w-full"
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
      <p className="text-sm text-gray-500">
        Las 100 cajas más recientes. Los cobros anteriores a esta actualización
        permanecen en Historial y Reportes.
      </p>
      {session && displayBalances && (
        <>
          <section className="bg-white border rounded-2xl p-5 space-y-4">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">
                {session.status === "open" ? "Caja abierta" : "Cierre de caja"}
              </h2>
              <button className="text-cyan-700" onClick={() => window.print()}>
                Imprimir
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {METHODS.map((m) => (
                <div className="border rounded-xl p-4 bg-gray-50" key={m}>
                  <p className="text-sm text-gray-500">
                    {m === "Efectivo" ? "Efectivo esperado" : m}
                  </p>
                  <p className="text-2xl font-black">
                    ${displayBalances[m].toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
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
            <p className="text-xs text-gray-500">
              {session.status === "closed" && !session.cashCountExcludesTips
                ? "Este cierre anterior conserva el cálculo original, que incluía las propinas."
                : "Las propinas están fuera de los saldos del negocio y del arqueo. Cuente únicamente el efectivo del negocio, sin propinas. No registre un retiro de caja para entregar estas propinas. Las comisiones sí se registran como retiro al pagarlas."}
            </p>
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
          {session.status === "open" && !blocked && (
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
              className="bg-white border rounded-2xl p-5 space-y-3"
            >
              <h2 className="text-xl font-bold">Arqueo y cierre</h2>
              <label className="block text-sm">
                Efectivo físico contado ($)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  className="block border rounded-lg p-2 max-w-xs"
                />
              </label>
              <p className="text-sm">
                Diferencia:{" "}
                {counted === ""
                  ? "—"
                  : `$${(Number(counted) - displayBalances.Efectivo).toFixed(2)}`}
              </p>
              <textarea
                aria-label="Observaciones del cierre"
                placeholder="Observaciones del cierre"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded-lg p-2 w-full"
              />
              <button
                disabled={busy || counted === ""}
                className="bg-red-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
              >
                Cerrar caja
              </button>
            </form>
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
  async function load(reset = false) {
    if (busy) return;
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
          ...(!reset && cursor ? [startAfter(cursor)] : []),
        ),
      );
      setRows((prev) => [
        ...(reset ? [] : prev),
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
  const sortedRows = [...rows].sort((a, b) => {
    const seconds = (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
    if (seconds) return seconds;
    const nanos = (b.createdAt?.nanoseconds ?? 0) - (a.createdAt?.nanoseconds ?? 0);
    return nanos || ((b.sequence ?? 0) - (a.sequence ?? 0));
  });
  const recordedAmount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "No registrado";
  const kinds: Record<string, string> = {
    opening: "Apertura",
    expense: "Gasto",
    withdrawal: "Retiro",
    income: "Ingreso",
    sale: "Venta",
    sale_refund: "Anulación venta",
    service_payment: "Cobro servicio",
    service_payment_tip: "Propina",
    service_correction: "Reversión cobro",
    service_correction_tip: "Reversión propina",
    service_refund: "Anulación servicio",
    service_refund_tip: "Devolución propina",
  };
  return (
    <section className="bg-white border rounded-2xl p-5">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3"><h2 className="text-xl font-bold">Movimientos de esta caja</h2><button disabled={busy} onClick={() => void load(true)} className="text-cyan-700 disabled:opacity-50">Actualizar movimientos</button></div>
      <p className="text-sm text-gray-600 mb-3">Saldos del negocio sin propinas. «Saldo del método» corresponde al medio de pago del movimiento; «Efectivo de caja» muestra el dinero esperado en efectivo.</p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr>
              {["Fecha", "Tipo", "Método", "Monto", "Saldo del método antes", "Saldo del método después", "Efectivo de caja antes", "Efectivo de caja después", "Detalle / referencia"].map(
                (h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3">
                  {m.createdAt
                    ? new Date(m.createdAt.seconds * 1000).toLocaleString()
                    : "..."}
                </td>
                <td className="p-3">{kinds[m.kind] ?? m.kind}</td>
                <td className="p-3">{m.method}</td>
                <td className="p-3 font-bold whitespace-nowrap">{recordedAmount(m.amount)}{String(m.kind).endsWith("_tip") && <p className="font-normal text-xs text-gray-500">Propina · no afecta caja</p>}</td>
                <td className="p-3 whitespace-nowrap">{recordedAmount(m.balanceBefore)}</td>
                <td className="p-3 whitespace-nowrap">{recordedAmount(m.balanceAfter)}</td>
                <td className="p-3 whitespace-nowrap">{recordedAmount(m.cashBefore)}</td>
                <td className="p-3 whitespace-nowrap">{recordedAmount(m.cashAfter)}</td>
                <td className="p-3">
                  {m.description}
                  <p className="text-xs text-gray-400 break-all">
                    Referencia: {m.referenceId}
                    {m.sequence !== undefined && <> · Movimiento #{m.sequence}</>}
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
      <p className="text-xs text-gray-500 mt-2">
        Los movimientos se cargan en grupos de 100. Los anteriores a esta versión
        pueden mostrar «No registrado»: sus saldos históricos no se inventan.
        Use «Actualizar movimientos» para consultar las operaciones recientes.
      </p>
    </section>
  );
}
