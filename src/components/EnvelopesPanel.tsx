"use client";
import { useCallback, useEffect, useState } from "react";
import SectionLink from "./SectionLink";
import HelpTip from "./HelpTip";
import { enqueueSnackbar } from "notistack";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { newId, operations } from "@/lib/operations";
import { addDays, businessDay, weekOf } from "@/lib/operations/treasury-model";
import { useCurrentCash } from "@/lib/useCurrentCash";
import { loadTreasuryReport } from "@/lib/reports/loadTreasury";
import { TreasuryReport } from "@/lib/reports/treasury";
import { formatMoney } from "@/lib/utils";
export default function EnvelopesPanel() {
  const today = businessDay(),
    cash = useCurrentCash();
  const [anchor, setAnchor] = useState(today),
    [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      report: TreasuryReport | null;
      loading: boolean;
      error: string;
    }>({ report: null, loading: true, error: "" });
  const [initialDay, setInitialDay] = useState(today),
    [initialAmount, setInitialAmount] = useState(""),
    [initialReason, setInitialReason] = useState(""),
    [initialId, setInitialId] = useState(newId);
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [source, setSource] = useState(""),
    [destination, setDestination] = useState<"to_cash" | "expense">("to_cash"),
    [busy, setBusy] = useState(false),
    [actionId, setActionId] = useState(newId);
  const [withdrawForm, setWithdrawForm] = useState({
    amount: "",
    reason: "",
    id: newId(),
  });
  const start = weekOf(anchor);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "treasuryControl/current"),
        (snap) => setRevision(Number(snap.data()?.revision ?? 0)),
        () =>
          setState({
            report: null,
            loading: false,
            error: "No se pudo consultar el control de sobres.",
          }),
      ),
    [],
  );
  const refresh = useCallback(async () => {
    setState({ report: null, loading: true, error: "" });
    try {
      const report = await loadTreasuryReport(start);
      setState({ report, loading: false, error: "" });
    } catch (e) {
      setState({
        report: null,
        loading: false,
        error: e instanceof Error ? e.message : "No se pudo cargar la semana.",
      });
    }
  }, [start]);
  useEffect(() => {
    let current = true;
    loadTreasuryReport(start)
      .then((report) => {
        if (current) setState({ report, loading: false, error: "" });
      })
      .catch((e) => {
        if (current)
          setState({
            report: null,
            loading: false,
            error:
              e instanceof Error ? e.message : "No se pudo cargar la semana.",
          });
      });
    return () => {
      current = false;
    };
  }, [start, revision, cash.session?.movementSequence, cash.session?.id]);
  const report = state.report?.start === start ? state.report : null;
  const resetId = () => setActionId(newId());
  async function run(mode: "deposit" | "withdraw") {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "deposit")
        await operations.depositEnvelope(Number(amount), reason, actionId);
      else
        await operations.withdrawEnvelope(
          source,
          Number(withdrawForm.amount),
          destination,
          withdrawForm.reason,
          withdrawForm.id,
        );
      if (mode === "withdraw")
        setWithdrawForm({ amount: "", reason: "", id: newId() });
      else {
        setAmount("");
        setReason("");
        resetId();
      }
      enqueueSnackbar("Movimiento de sobre guardado.", { variant: "success" });
      await refresh();
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
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black">Sobres con dinero</h1>
          <p className="text-gray-600">
            Control de efectivo por día. Semanas de martes a lunes.
          </p>
        </div>
        <SectionLink href="/cash">Caja</SectionLink>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <button
          disabled={busy}
          onClick={() => setAnchor(addDays(start, -7))}
          className="border rounded-lg p-2"
        >
          Semana anterior
        </button>
        <label>
          Semana que contiene{" "}
          <input
            type="date"
            aria-label="Fecha de la semana de sobres"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="border rounded-lg p-2 ml-2"
          />
        </label>
        <button
          onClick={() => setAnchor(addDays(start, 7))}
          className="border rounded-lg p-2"
        >
          Semana siguiente
        </button>
        <button
          onClick={() => setAnchor(businessDay())}
          className="border rounded-lg p-2"
        >
          Semana actual
        </button>
        <button onClick={() => void refresh()} className="text-cyan-700">
          Actualizar
        </button>
      </div>
      <p className="font-bold">
        Del {start} al {addDays(start, 6)}
      </p>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {!report ? (
        <p>
          {state.error
            ? "Actualice para consultar importes verificables."
            : "Cargando semana…"}
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-4 gap-3">
            {[
              ["Efectivo neto generado en la semana", report.netGenerated],
              ["Vales entregados en la semana", report.advances],
              ["Gastos directos desde sobres", report.envelopeExpenses],
              [
                "Disponible hoy en los sobres de esta semana",
                report.envelopeBalance,
              ],
            ].map(([label, n]) => (
              <div
                key={String(label)}
                className="bg-white border rounded-xl p-5"
              >
                <p className="text-sm text-gray-500">{label}</p>
                <strong className="text-2xl">{formatMoney(Number(n))}</strong>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            El efectivo neto incluye cobros netos menos salidas de efectivo y
            gastos directos de sobres. Excluye fondos iniciales, aportes
            adicionales y traslados entre Caja y sobres. Es flujo de efectivo,
            antes de obligaciones aún no pagadas.
          </p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(start, i),
                envelope = report.envelopes.find((e) => e.day === day);
              return (
                <section key={day} className="border rounded-xl p-4 bg-white">
                  <h2 className="font-bold">
                    {new Date(day + "T12:00:00Z").toLocaleDateString("es", {
                      weekday: "long",
                      timeZone: "UTC",
                    })}{" "}
                    · {day}
                  </h2>
                  <p className="text-2xl font-black mt-2">
                    {envelope ? formatMoney(envelope.balance) : "Sin sobre"}
                  </p>
                  {envelope && (
                    <>
                      <p className="text-xs text-gray-500 mt-2">
                        Inicial: {formatMoney(envelope.initialAmount ?? 0)} ·
                        Guardado: {formatMoney(envelope.deposited)} · Gastos:{" "}
                        {formatMoney(envelope.spent)} · A Caja:{" "}
                        {formatMoney(envelope.toCash)}
                      </p>
                      <button
                        disabled={busy || envelope.balance <= 0}
                        onClick={() => {
                          setSource(day);
                          setWithdrawForm({
                            amount: "",
                            reason: "",
                            id: newId(),
                          });
                        }}
                        className="mt-3 text-cyan-700 disabled:opacity-50"
                      >
                        Usar dinero de este sobre
                      </button>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
      <section className="border rounded-xl p-5 bg-white space-y-3">
        <h2 className="text-xl font-bold">
          Guardar efectivo de hoy en su sobre
        </h2>
        <HelpTip label="Guardar efectivo">
          Se descuenta de Caja y se deposita en el sobre del {today},
          conservando el fondo inicial.
        </HelpTip>
        <p>
          Efectivo a guardar disponible:{" "}
          <b>
            {cash.session && !cash.loading && !cash.error
              ? formatMoney(
                  Math.max(
                    0,
                    cash.session.balances.Efectivo - cash.session.openingAmount,
                  ),
                )
              : cash.error
                ? "No disponible"
                : cash.loading
                  ? "Cargando…"
                  : "Sin caja abierta"}
          </b>
        </p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("deposit");
          }}
        >
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              resetId();
            }}
            aria-label="Monto a guardar en el sobre"
            placeholder="Monto $"
            className="border rounded-lg p-2"
          />
          <input
            required
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              resetId();
            }}
            aria-label="Motivo de guardado"
            placeholder="Motivo / responsable"
            className="border rounded-lg p-2 flex-1"
          />
          <button
            disabled={busy || cash.loading || !!cash.error || !cash.session}
            className="bg-emerald-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Guardar en sobre de hoy
          </button>
        </form>
      </section>
      {source && (
        <section className="border rounded-xl p-5 bg-white space-y-3">
          <h2 className="text-xl font-bold">Retirar del sobre {source}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("withdraw");
            }}
            className="grid md:grid-cols-2 gap-3"
          >
            <select
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value as typeof destination);
                setWithdrawForm({ ...withdrawForm, id: newId() });
              }}
              aria-label="Destino del retiro de sobre"
              className="border rounded-lg p-2"
            >
              <option value="to_cash">
                Pasar a Caja (refuerzo de efectivo)
              </option>
              <option value="expense">Gasto directo desde el sobre</option>
            </select>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={withdrawForm.amount}
              onChange={(e) =>
                setWithdrawForm({
                  ...withdrawForm,
                  amount: e.target.value,
                  id: newId(),
                })
              }
              aria-label="Monto a retirar del sobre"
              placeholder="Monto $"
              className="border rounded-lg p-2"
            />
            <input
              required
              value={withdrawForm.reason}
              onChange={(e) =>
                setWithdrawForm({
                  ...withdrawForm,
                  reason: e.target.value,
                  id: newId(),
                })
              }
              aria-label="Motivo del retiro de sobre"
              placeholder="Motivo y responsable"
              className="border rounded-lg p-2"
            />
            <button
              disabled={busy || (destination === "to_cash" && !cash.session)}
              className="bg-gray-800 text-white rounded-lg p-2 disabled:opacity-50"
            >
              Registrar retiro
            </button>
          </form>
          <p className="text-xs text-gray-500">
            Si pasa el dinero a Caja, registre allí el gasto cuando se utilice.
            El gasto directo sale del sobre y no pasa por Caja.
          </p>
        </section>
      )}
      <details className="border rounded-xl p-5 bg-white">
        <summary className="font-bold cursor-pointer">
          Registrar un sobre que ya tenía dinero
        </summary>
        <p className="text-sm text-gray-500 my-3">
          Solo para efectivo que ya está físicamente fuera de Caja. No crea un
          ingreso nuevo ni descuenta de Caja. Cada sobre admite un único saldo
          inicial.
        </p>
        <form
          className="grid md:grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              await operations.initializeEnvelope(
                initialDay,
                Number(initialAmount),
                initialReason,
                initialId,
              );
              setInitialAmount("");
              setInitialReason("");
              setInitialId(newId());
              enqueueSnackbar("Sobre inicial registrado.", {
                variant: "success",
              });
              await refresh();
            } catch (error) {
              enqueueSnackbar(
                error instanceof Error ? error.message : "No se pudo guardar.",
                { variant: "error" },
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Día del sobre
            <input
              required
              type="date"
              max={today}
              value={initialDay}
              onChange={(e) => {
                setInitialDay(e.target.value);
                setInitialId(newId());
              }}
              className="border rounded-lg p-2 block"
            />
          </label>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={initialAmount}
            onChange={(e) => {
              setInitialAmount(e.target.value);
              setInitialId(newId());
            }}
            placeholder="Efectivo ya guardado $"
            aria-label="Saldo inicial del sobre"
            className="border rounded-lg p-2"
          />
          <input
            required
            value={initialReason}
            onChange={(e) => {
              setInitialReason(e.target.value);
              setInitialId(newId());
            }}
            placeholder="Responsable / motivo"
            aria-label="Motivo del sobre inicial"
            className="border rounded-lg p-2"
          />
          <label className="text-sm">
            <input type="checkbox" required /> Confirmo que este dinero ya está
            en el sobre y no forma parte de Caja.
          </label>
          <button
            disabled={busy}
            className="bg-gray-800 text-white rounded-lg p-2 disabled:opacity-50"
          >
            Registrar sobre existente
          </button>
        </form>
      </details>
      {report && (
        <section className="bg-white border rounded-xl p-5 overflow-x-auto">
          <h2 className="text-xl font-bold mb-3">
            Movimientos de sobres realizados en esta semana
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Sobre de origen / destino",
                  "Movimiento",
                  "Monto",
                  "Antes",
                  "Después",
                  "Motivo / responsable",
                ].map((h) => (
                  <th key={h} className="p-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.envelopeMovements.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2">{m.day}</td>
                  <td className="p-2">{m.envelopeDay}</td>
                  <td className="p-2">
                    {m.kind === "opening"
                      ? "Saldo inicial declarado"
                      : m.kind === "deposit"
                        ? "Guardado"
                        : m.kind === "to_cash"
                          ? "A Caja"
                          : "Gasto directo"}
                  </td>
                  <td className="p-2">{formatMoney(m.amount)}</td>
                  <td className="p-2">{formatMoney(m.balanceBefore)}</td>
                  <td className="p-2">{formatMoney(m.balanceAfter)}</td>
                  <td className="p-2">{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.envelopeMovements.length && (
            <p className="text-sm text-gray-500">
              Sin movimientos de sobres en esta semana.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
