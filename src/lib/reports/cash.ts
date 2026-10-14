import { CashMovement, CashSession, METHODS, emptyBalances, money } from "../operations/model";

export const movementKinds: Record<string, string> = {
  opening: "Apertura", expense: "Gasto", withdrawal: "Retiro / pago", income: "Ingreso adicional",
  sale: "Venta", sale_refund: "Anulación venta", service_payment: "Cobro servicio",
  service_payment_tip: "Propina recibida", service_correction: "Reversión cobro",
  service_correction_tip: "Reversión propina", service_refund: "Anulación servicio",
  service_refund_tip: "Devolución propina",
};
export type DetailedMovement = CashMovement & { balanceSource: "Registrado" | "Reconstruido" | "No disponible" };
const validBalances = (value: unknown): value is CashSession["balances"] => !!value && typeof value === "object" && METHODS.every(m => typeof (value as CashSession["balances"])[m] === "number" && Number.isFinite((value as CashSession["balances"])[m]));
const entryOrder: Record<string, number> = {service_correction: 0, service_correction_tip: 1, service_payment: 2, service_payment_tip: 3, service_refund: 4, service_refund_tip: 5};
const relatedPair = (a: CashMovement, b: CashMovement) => a.referenceId === b.referenceId && a.kind !== b.kind && a.kind in entryOrder && b.kind in entryOrder;
export function detailMovements(rows: CashMovement[], session: CashSession): DetailedMovement[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
    return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0) || ((a.createdAt as { nanoseconds?: number })?.nanoseconds ?? 0) - ((b.createdAt as { nanoseconds?: number })?.nanoseconds ?? 0) || (relatedPair(a, b) ? (entryOrder[a.kind] - entryOrder[b.kind]) : a.id.localeCompare(b.id));
  });
  const totals = emptyBalances();
  let canRebuild = sorted.filter(m => m.kind === "opening").length === 1 && sorted[0]?.kind === "opening" && sorted[0].amount === session.openingAmount;
  const seen = new Map<string, CashMovement>();
  for (const row of sorted) {
    if (!METHODS.includes(row.method) || !Number.isFinite(row.amount) || !row.createdAt) { canRebuild = false; continue; }
    const key = `${row.createdAt.seconds}:${(row.createdAt as { nanoseconds?: number }).nanoseconds ?? 0}:${row.method}`;
    if (seen.has(key) && row.sequence == null && !relatedPair(seen.get(key)!, row)) canRebuild = false;
    seen.set(key, row);
    totals[row.method] = money(totals[row.method] + row.amount);
  }
  canRebuild &&= METHODS.every(m => Math.abs(totals[m] - session.balances[m]) < 0.005);
  const running = emptyBalances();
  return sorted.map(row => {
    const before = { ...running };
    if (METHODS.includes(row.method) && Number.isFinite(row.amount)) running[row.method] = money(running[row.method] + row.amount);
    if (validBalances(row.balancesBefore) && validBalances(row.balancesAfter) && METHODS.every(m => Math.abs(row.balancesAfter![m] - money(row.balancesBefore![m] + (m === row.method ? row.amount : 0))) < 0.005))
      return { ...row, balanceSource: "Registrado" };
    return canRebuild ? { ...row, balancesBefore: before, balancesAfter: { ...running }, balanceSource: "Reconstruido" } : { ...row, balancesBefore: undefined, balancesAfter: undefined, balanceSource: "No disponible" };
  });
}
export function cashTotals(session: CashSession, rows: CashMovement[]) {
  let incoming = 0, outgoing = 0;
  for (const row of rows) {
    if (row.method !== "Efectivo" || row.kind === "opening") continue;
    if (row.kind === "expense" || row.kind === "withdrawal") outgoing = money(outgoing - row.amount);
    else incoming = money(incoming + row.amount);
  }
  return { incoming, outgoing, net: money(session.balances.Efectivo - session.openingAmount), reconciled: Math.abs(session.openingAmount + incoming - outgoing - session.balances.Efectivo) < .005 };
}
export interface FinancialReport {
  period: string;
  generatedAt: string;
  sales: number;
  business: number;
  payroll: number;
  income: Record<string, number>;
  tips: Record<string, number>;
  session: CashSession | null;
  movements: DetailedMovement[];
}
