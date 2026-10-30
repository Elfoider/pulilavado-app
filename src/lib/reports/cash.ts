import { CashMovement, CashSession, METHODS, emptyBalances, money } from "../operations/model";

export const movementKinds: Record<string, string> = {
  payroll_advance: "Vale a lavador", envelope_deposit: "Traslado a sobre", envelope_to_cash: "Refuerzo desde sobre",
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
export function detailMovements(rows: CashMovement[], session: CashSession | null): DetailedMovement[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
    return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0) || ((a.createdAt as { nanoseconds?: number })?.nanoseconds ?? 0) - ((b.createdAt as { nanoseconds?: number })?.nanoseconds ?? 0) || (relatedPair(a, b) ? (entryOrder[a.kind] - entryOrder[b.kind]) : a.id.localeCompare(b.id));
  });
  const totals = emptyBalances();
  let canRebuild = !!session && sorted.filter(m => m.kind === "opening").length === 1 && sorted[0]?.kind === "opening" && sorted[0].amount === session.openingAmount;
  const seen = new Map<string, CashMovement>();
  for (const row of sorted) {
    if (!METHODS.includes(row.method) || !Number.isFinite(row.amount) || !row.createdAt) { canRebuild = false; continue; }
    const key = `${row.createdAt.seconds}:${(row.createdAt as { nanoseconds?: number }).nanoseconds ?? 0}:${row.method}`;
    if (seen.has(key) && row.sequence == null && !relatedPair(seen.get(key)!, row)) canRebuild = false;
    seen.set(key, row);
    totals[row.method] = money(totals[row.method] + row.amount);
  }
  canRebuild &&= !!session && METHODS.every(m => Math.abs(totals[m] - session.balances[m]) < 0.005);
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
    if (row.kind === "expense" || row.kind === "withdrawal" || row.kind === "payroll_advance" || row.kind === "envelope_deposit") outgoing = money(outgoing - row.amount);
    else incoming = money(incoming + row.amount);
  }
  return { incoming, outgoing, net: money(session.balances.Efectivo - session.openingAmount), reconciled: Math.abs(session.openingAmount + incoming - outgoing - session.balances.Efectivo) < .005 };
}
import { type CashAdvance } from "../operations/treasury-model";
import { type TreasuryReport } from "./treasury";
export interface FinancialReport {
  periodCash?: PeriodCash;
  advanceRows?: CashAdvance[];
  advancesTotal?: number;
  payrollNet?: number;
  weekly?: TreasuryReport;
  period: string;
  generatedAt: string;
  sales: number;
  business: number;
  payroll: number;
  income: Record<string, number>;
  tips: Record<string, number>;
  session: CashSession | null;
  movements: DetailedMovement[];
  currentSessionMovements?: DetailedMovement[];
}


export interface PeriodCash {
  generated?: number;
  saved?: number;
  pending?: number;
  operatingOutgoing?: number;
  statusLabel?: string;
  opening: number | null;
  balance: number | null;
  incoming: number;
  outgoing: number;
  net: number;
  reconciled: boolean;
  sessionCount: number;
}
export function summarizePeriodCash(rows: DetailedMovement[]): PeriodCash {
  const groups = new Map<string, DetailedMovement[]>();
  for (const row of rows) {
    if (!METHODS.includes(row.method) || !Number.isFinite(row.amount)) throw new Error("Hay movimientos de caja inválidos en el período.");
    const group = groups.get(row.sessionId) ?? []; group.push(row); groups.set(row.sessionId, group);
  }
  let opening = 0, balance = 0, incoming = 0, outgoing = 0, known = true;
  for (const group of groups.values()) {
    const first = group[0], last = group[group.length - 1];
    const initial = group.find(row => row.kind === "opening");
    const base = initial ? initial.amount : first.balancesBefore?.Efectivo;
    const final = last.balancesAfter?.Efectivo;
    if (base == null || final == null) known = false;
    else { opening = money(opening + base); balance = money(balance + final); }
    for (const row of group) {
      if (row.method !== "Efectivo" || row.kind === "opening") continue;
      if (["expense", "withdrawal", "payroll_advance", "envelope_deposit"].includes(row.kind)) outgoing = money(outgoing - row.amount);
      else incoming = money(incoming + row.amount);
    }
  }
  const net = money(incoming - outgoing);
  return { opening: known ? opening : null, balance: known ? balance : null, incoming, outgoing, net, ...cashSavings(rows, net, outgoing),
    reconciled: known && Math.abs(opening + net - balance) < .005, sessionCount: groups.size };
}
export function cashSavings(rows: CashMovement[], net: number, outgoing: number) {
  let saved=0,refills=0,funding=0;
  for(const row of rows){
    if(row.method!=="Efectivo")continue;
    if(!Number.isFinite(row.amount))throw new Error("Movimiento de efectivo inválido.");
    if(row.kind==="envelope_deposit")saved=money(saved-row.amount);
    if(row.kind==="envelope_to_cash")refills=money(refills+row.amount);
    if(row.kind==="income")funding=money(funding+row.amount);
  }
  return {generated:money(net+saved-refills-funding),saved,pending:Math.max(0,net),operatingOutgoing:money(outgoing-saved)};
}
export function reportCashView(report: FinancialReport) {
  const rows=report.currentSessionMovements ?? report.movements;
  const cash=report.periodCash ?? (report.session ? { ...cashTotals(report.session, rows), opening: report.session.openingAmount, balance: report.session.balances.Efectivo, sessionCount: 1 } :
    { opening: 0, balance: 0, incoming: 0, outgoing: 0, net: 0, reconciled: true, sessionCount: 0 });
  return {...cash,...cashSavings(rows,cash.net,cash.outgoing)};
}


export function cashMovementBreakdown(rows: DetailedMovement[]) {
  const totals = { collections: 0, expenses: 0, withdrawals: 0, savedToEnvelopes: 0, fromEnvelopes: 0, funding: 0 };
  const collections = new Set(["sale", "sale_refund", "service_payment", "service_payment_tip", "service_correction", "service_correction_tip", "service_refund", "service_refund_tip"]);
  for (const row of rows) {
    if (row.method !== "Efectivo") continue;
    if (!Number.isFinite(row.amount)) throw new Error("Hay movimientos de efectivo inválidos.");
    if (collections.has(row.kind)) totals.collections = money(totals.collections + row.amount);
    else if (row.kind === "expense") totals.expenses = money(totals.expenses - row.amount);
    else if (row.kind === "withdrawal") totals.withdrawals = money(totals.withdrawals - row.amount);
    else if (row.kind === "envelope_deposit") totals.savedToEnvelopes = money(totals.savedToEnvelopes - row.amount);
    else if (row.kind === "envelope_to_cash") totals.fromEnvelopes = money(totals.fromEnvelopes + row.amount);
    else if (row.kind === "income") totals.funding = money(totals.funding + row.amount);
  }
  return totals;
}
