import { isCashSession, METHODS, money, type Atomic, type Method } from "./model";

export type CashCorrection = { movementId: string; mode: "void" | "amount"; amount?: number; reason: string };
export class CashCorrectionError extends Error {}
const reject = (message: string): never => { throw new CashCorrectionError(message); };
export const cashCorrectable = (kind: string) => ["expense", "withdrawal", "income", "payroll_advance"].includes(kind);
const validId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) && !/^__.*__$/.test(id);
const validAmount = (amount: unknown): amount is number => typeof amount === "number" && Number.isFinite(amount) && Math.abs(amount) <= 1e10 && money(amount) === amount;

export function parseCashCorrection(input: unknown): CashCorrection {
  if (!input || typeof input !== "object") return reject("Solicitud inválida.");
  const { movementId, mode, amount, reason } = input as Record<string, unknown>;
  if (!validId(movementId) || (mode !== "void" && mode !== "amount")) return reject("Seleccione un movimiento y una acción válidos.");
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 240) return reject("Indique un motivo de 3 a 240 caracteres.");
  if (mode === "amount" && (!validAmount(amount) || amount <= 0)) return reject("Indique un monto positivo con hasta dos decimales.");
  return { movementId, mode, reason: reason.trim(), ...(mode === "amount" ? { amount: amount as number } : {}) };
}

export function correctCashMovement(atomic: Atomic, stamp: () => unknown, newId: () => string, input: CashCorrection) {
  const command = parseCashCorrection(input);
  const adjustmentId = newId();
  return atomic(async tx => {
    const sourcePath = `cashMovements/${command.movementId}`;
    const auditPath = `cashCorrections/${command.movementId}`;
    const previous = await tx.get(auditPath);
    const requestedAmount = command.amount ?? 0;
    if (previous) {
      if (previous.mode === command.mode && previous.newAmount === requestedAmount && previous.reason === command.reason && validId(previous.adjustmentId)) return { adjustmentId: previous.adjustmentId };
      return reject("El movimiento ya fue corregido. Actualice el historial.");
    }
    const movement = await tx.get(sourcePath);
    if (!movement || movement.correctionId || movement.correctsMovementId || typeof movement.kind !== "string" || !cashCorrectable(movement.kind) || !validAmount(movement.amount) || !validId(movement.sessionId)) return reject("Este movimiento no admite corrección.");
    const kind = movement.kind;
    const originalAmount = movement.amount;
    const sessionId = movement.sessionId;
    const method = movement.method as Method;
    const income = kind === "income";
    if (!METHODS.includes(method) || (income ? originalAmount <= 0 : originalAmount >= 0)) return reject("El movimiento tiene un monto o método incompatible.");
    if (Math.abs(originalAmount) === requestedAmount) return reject("El nuevo monto debe ser distinto al original.");
    const control = await tx.get("cashControl/current");
    const sessionPath = `cashSessions/${sessionId}`;
    const session = await tx.get(sessionPath);
    if (control?.sessionId !== sessionId || !isCashSession(session) || session.status !== "open") return reject("Solo se pueden corregir movimientos de la caja abierta. Los cierres históricos se conservan.");
    const sequence = session.movementSequence;
    if (!Number.isSafeInteger(sequence) || sequence! < 1 || !Number.isSafeInteger(sequence! + 1)) return reject("No se puede verificar la secuencia de la caja.");
    const delta = money((income ? requestedAmount : -requestedAmount) - originalAmount);
    const balancesAfter = { ...session.balances, [method]: money(session.balances[method] + delta) };
    const isAdvance = kind === "payroll_advance";
    const expenses = money(session.expenses - (isAdvance || kind === "expense" ? delta : 0));
    if (balancesAfter.Efectivo < 0 || expenses < 0 || !validAmount(balancesAfter[method]) || !validAmount(expenses)) return reject("La corrección dejaría un saldo de caja incompatible.");
    let advancePath: string | undefined, revision: number | undefined;
    if (isAdvance) {
      if (!validId(movement.referenceId) || !validId(movement.washerId) || method !== "Efectivo") return reject("No se pudo identificar el vale asociado.");
      advancePath = `cashAdvances/${movement.referenceId}`;
      const advance = await tx.get(advancePath);
      if (!advance || advance.sessionId !== sessionId || advance.washerId !== movement.washerId || advance.amount !== -originalAmount || advance.correctionId || advance.correctedAmount != null) return reject("El vale asociado no coincide con el movimiento. No se aplicó ningún cambio.");
      const storedRevision = (await tx.get("treasuryControl/current"))?.revision ?? 0;
      if (typeof storedRevision !== "number" || !Number.isSafeInteger(storedRevision) || storedRevision < 0 || !Number.isSafeInteger(storedRevision + 1)) return reject("No se pudo verificar el control de tesorería.");
      revision = storedRevision + 1;
    }
    const createdAt = stamp();
    const action = command.mode === "void" ? "Anulación" : "Corrección de monto";
    tx.set(auditPath, {
      movementId: command.movementId, sessionId, adjustmentId, kind, method,
      originalAmount: Math.abs(originalAmount), newAmount: requestedAmount, delta, mode: command.mode, reason: command.reason,
      referenceId: movement.referenceId ?? null, balancesBefore: session.balances, balancesAfter, createdAt,
    });
    tx.set(sourcePath, { correctionId: adjustmentId, correctionMode: command.mode }, true);
    tx.set(`cashMovements/${adjustmentId}`, {
      sessionId, kind, method, amount: delta, sequence: sequence! + 1,
      referenceId: typeof movement.referenceId === "string" ? movement.referenceId : command.movementId,
      description: `${action}: ${command.reason}`, correctsMovementId: command.movementId, correctionMode: command.mode,
      ...(isAdvance ? { washerId: movement.washerId, ...(typeof movement.washerName === "string" ? { washerName: movement.washerName } : {}) } : {}),
      balancesBefore: session.balances, balancesAfter, createdAt,
    });
    tx.set(sessionPath, { balances: balancesAfter, expenses, movementSequence: sequence! + 1, updatedAt: createdAt }, true);
    if (advancePath) {
      tx.set(advancePath, { correctionId: adjustmentId, correctedAmount: requestedAmount, correctedAt: createdAt }, true);
      tx.set("treasuryControl/current", { revision, updatedAt: createdAt }, true);
    }
    return { adjustmentId };
  });
}
