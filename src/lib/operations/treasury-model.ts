import { money } from "./model";
export const BUSINESS_TIME_ZONE = "America/Caracas";
export function businessDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function dateDay(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new Error("Fecha inválida.");
  return value;
}
export function addDays(day: string, count: number) {
  const d = new Date(dateDay(day) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function weekOf(day: string) {
  const date = new Date(dateDay(day) + "T12:00:00Z");
  return addDays(day, -((date.getUTCDay() + 5) % 7));
}
export function dayStart(day: string) {
  return new Date(dateDay(day) + "T00:00:00-04:00");
}
export interface CashAdvance {
  id: string;
  washerId: string;
  washerName: string;
  amount: number;
  day: string;
  weekStart: string;
  sessionId: string;
  description: string;
  createdAt?: { seconds: number };
}
export interface CashEnvelope {
  id: string;
  day: string;
  weekStart: string;
  balance: number;
  deposited: number;
  spent: number;
  toCash: number;
  revision: number;
  initialAmount?: number;
}
export interface EnvelopeMovement {
  id: string;
  envelopeDay: string;
  day: string;
  weekStart: string;
  kind: "opening" | "deposit" | "to_cash" | "expense";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  sessionId?: string;
  createdAt?: { seconds: number };
}
export function isEnvelope(value: unknown): value is CashEnvelope {
  if (!value || typeof value !== "object") return false;
  const e = value as CashEnvelope;
  try {
    dateDay(e.day);
    if (e.weekStart !== weekOf(e.day)) return false;
  } catch {
    return false;
  }
  return (
    [e.balance, e.deposited, e.spent, e.toCash, e.initialAmount ?? 0].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    ) &&
    Number.isSafeInteger(e.revision) &&
    e.revision >= 0 &&
    Math.abs(
      money((e.initialAmount ?? 0) + e.deposited - e.spent - e.toCash) -
        e.balance,
    ) < 0.005
  );
}
export function netPayroll(gross: number, advances: number) {
  const net = money(gross - advances);
  return { pay: Math.max(0, net), excess: Math.max(0, -net) };
}
