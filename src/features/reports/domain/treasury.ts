import { CashMovement, money } from "../../operations/domain/model";
import {
  addDays,
  CashAdvance,
  CashEnvelope,
  EnvelopeMovement,
  isEnvelope,
  weekOf,
} from "../../operations/domain/treasury-model";
export interface TreasuryReport {
  start: string;
  end: string;
  cashReceipts: number;
  additionalFunding?: number;
  cashOutgoings: number;
  advances: number;
  netGenerated: number;
  deposited: number;
  envelopeExpenses: number;
  toCash: number;
  envelopeBalance: number;
  envelopes: CashEnvelope[];
  envelopeMovements: EnvelopeMovement[];
  advanceRows: CashAdvance[];
}
export function summarizeTreasury(
  anchor: string,
  cash: CashMovement[],
  envelopes: CashEnvelope[],
  envelopeMovements: EnvelopeMovement[],
  advances: CashAdvance[],
): TreasuryReport {
  const start = weekOf(anchor),
    end = addDays(start, 6);
  if (envelopes.some((e) => !isEnvelope(e)))
    throw new Error("Hay sobres con saldos incompatibles.");
  let cashReceipts = 0,
    cashOutgoings = 0,
    additionalFunding = 0;
  for (const m of cash) {
    if (
      m.method !== "Efectivo" ||
      ["opening", "envelope_deposit", "envelope_to_cash"].includes(m.kind)
    )
      continue;
    if (!Number.isFinite(m.amount))
      throw new Error("Movimiento de caja inválido.");
    if (m.kind === "income") {
      additionalFunding = money(additionalFunding + m.amount);
      continue;
    }
    if (["expense", "withdrawal", "payroll_advance"].includes(m.kind))
      cashOutgoings = money(cashOutgoings - m.amount);
    else if (
      [
        "sale",
        "sale_refund",
        "service_payment",
        "service_payment_tip",
        "service_correction",
        "service_correction_tip",
        "service_refund",
        "service_refund_tip",
      ].includes(m.kind)
    )
      cashReceipts = money(cashReceipts + m.amount);
    else throw new Error("Tipo de movimiento de caja desconocido.");
  }
  let deposited = 0,
    envelopeExpenses = 0,
    toCash = 0;
  for (const m of envelopeMovements) {
    if (
      !Number.isFinite(m.amount) ||
      !Number.isFinite(m.balanceBefore) ||
      !Number.isFinite(m.balanceAfter) ||
      m.balanceBefore < 0 ||
      m.balanceAfter < 0 ||
      (["opening", "deposit"].includes(m.kind)
        ? m.amount <= 0
        : m.amount >= 0) ||
      Math.abs(money(m.balanceBefore + m.amount) - m.balanceAfter) > 0.005
    )
      throw new Error("Movimiento de sobre inválido.");
    if (m.kind === "deposit") deposited = money(deposited + m.amount);
    else if (m.kind === "expense")
      envelopeExpenses = money(envelopeExpenses - m.amount);
    else if (m.kind === "to_cash") toCash = money(toCash - m.amount);
    else if (m.kind !== "opening")
      throw new Error("Destino del retiro desconocido.");
  }
  if (
    advances.some(
      (a) => !a.washerId || !Number.isFinite(a.amount) || a.amount <= 0,
    )
  )
    throw new Error("Hay vales con datos inválidos.");
  return {
    start,
    end,
    cashReceipts,
    cashOutgoings,
    additionalFunding,
    advances: money(advances.reduce((s, a) => s + a.amount, 0)),
    netGenerated: money(cashReceipts - cashOutgoings - envelopeExpenses),
    deposited,
    envelopeExpenses,
    toCash,
    envelopeBalance: money(envelopes.reduce((s, e) => s + e.balance, 0)),
    envelopes: [...envelopes].sort((a, b) => a.day.localeCompare(b.day)),
    envelopeMovements: [...envelopeMovements].sort(
      (a, b) =>
        (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0) ||
        a.id.localeCompare(b.id),
    ),
    advanceRows: advances,
  };
}
