export const METHODS = [
  "Efectivo",
  "Yappy",
  "Tarjeta",
  "Transferencia",
] as const;
export type Method = (typeof METHODS)[number];
export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  minimum: number;
  active: boolean;
}
export interface CartItem {
  productId: string;
  quantity: number;
}
export interface ProductLine extends CartItem {
  name: string;
  sku: string;
  unitPrice: number;
  unitCost: number;
  total: number;
}
export interface CashSession {
  id: string;
  status: "open" | "closed";
  openingAmount: number;
  balances: Record<Method, number>;
  movementSequence?: number;
  receipts: number;
  tips: number;
  expenses: number;
  openedAt?: { seconds: number };
  closedAt?: { seconds: number };
  countedAmount?: number;
  difference?: number;
  notes?: string;
}
export interface CashMovement {
  id: string;
  sessionId: string;
  kind: string;
  amount: number;
  method: Method;
  referenceId: string;
  description: string;
  washerId?: string;
  washerName?: string;
  envelopeDay?: string;
  sequence?: number;
  balancesBefore?: Record<Method, number>;
  balancesAfter?: Record<Method, number>;
  createdAt?: { seconds: number };
}
export type Data = Record<string, unknown>;
export interface AtomicTx {
  get(path: string): Promise<Data | undefined>;
  set(path: string, data: Data, merge?: boolean): void;
}
export type Atomic = <T>(work: (tx: AtomicTx) => Promise<T>) => Promise<T>;
export function money(n: number) {
  if (!Number.isFinite(n)) throw new Error("Monto inválido.");
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function nonnegative(n: number, label: string) {
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`${label} debe ser un número igual o mayor a cero.`);
  return money(n);
}
export function method(value: string): Method {
  if (!(METHODS as readonly string[]).includes(value))
    throw new Error("Seleccione un método de pago válido.");
  return value as Method;
}
export function commission(individual: unknown, global: unknown) {
  const value = individual ?? global ?? 40;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    throw new Error("La comisión debe estar entre 0 y 100%.");
  return value / 100;
}
export function quantities(items: CartItem[]) {
  const result = new Map<string, number>();
  if (items.length > 80) throw new Error("Máximo 80 líneas por operación.");
  for (const i of items) {
    if (!i.productId || !Number.isSafeInteger(i.quantity) || i.quantity <= 0)
      throw new Error("La cantidad de productos debe ser un entero positivo.");
    result.set(i.productId, (result.get(i.productId) ?? 0) + i.quantity);
  }
  return result;
}
export const emptyBalances = (): Record<Method, number> => ({
  Efectivo: 0,
  Yappy: 0,
  Tarjeta: 0,
  Transferencia: 0,
});

// Firestore stores untyped documents. Validate historical data before displaying
// or changing financial balances; missing values must never become invented zeros.
export function cashSessionProblem(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Registro de caja inválido.";
  const data = value as Record<string, unknown>;
  if (data.status !== "open" && data.status !== "closed")
    return "Estado de caja desconocido.";
  if (data.movementSequence != null && (typeof data.movementSequence !== "number" || !Number.isSafeInteger(data.movementSequence) || data.movementSequence < 0)) return "Secuencia de movimientos inválida.";
  const balances = data.balances;
  if (!balances || typeof balances !== "object")
    return "Faltan los saldos por método de pago (balances).";
  for (const paymentMethod of METHODS) {
    const amount = (balances as Record<string, unknown>)[paymentMethod];
    if (typeof amount !== "number" || !Number.isFinite(amount))
      return `Saldo de ${paymentMethod} ausente o inválido.`;
  }
  for (const field of ["openingAmount", "receipts", "tips", "expenses"]) {
    const amount = data[field];
    if (typeof amount !== "number" || !Number.isFinite(amount))
      return `Total ${field} ausente o inválido.`;
  }
  for (const field of ["countedAmount", "difference"]) {
    const amount = data[field];
    if (
      amount != null &&
      (typeof amount !== "number" || !Number.isFinite(amount))
    )
      return "Los importes del cierre son inválidos.";
  }
  if (data.notes != null && typeof data.notes !== "string")
    return "Las observaciones del cierre son inválidas.";
  return null;
}
export function isCashSession(value: unknown): value is CashSession {
  return cashSessionProblem(value) === null;
}

// Recognize only the historical shape verified in the existing database.
export function isLegacyCashSession(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const s = value as Data;
  return typeof s.isOpen === "boolean" &&
    typeof s.initialAmount === "number" && Number.isFinite(s.initialAmount) && s.initialAmount >= 0 &&
    typeof s.responsible === "string" && typeof s.observations === "string" &&
    !!s.openedAt && s.balances === undefined &&
    (s.status === undefined || (s.status === "closed" && s.isOpen === false));
}
