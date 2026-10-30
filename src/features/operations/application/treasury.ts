import { Atomic, AtomicTx, CashSession, money, nonnegative } from "../domain/model";
import { businessDay, weekOf, dateDay, isEnvelope } from "../domain/treasury-model";
interface Entry {
  amount: number;
  method: "Efectivo";
  kind: string;
  referenceId: string;
  description: string;
  expenses?: number;
  washerId?: string;
  washerName?: string;
  envelopeDay?: string;
}
export function createTreasuryOperations(
  atomic: Atomic,
  stamp: () => unknown,
  openSession: (tx: AtomicTx) => Promise<CashSession>,
  ledger: (tx: AtomicTx, s: CashSession, e: Entry[]) => void,
  now: () => Date,
) {
  function input(amount: number, description: string, requestId: string) {
    amount = nonnegative(amount, "Monto");
    if (!amount || !description.trim() || !requestId || requestId.includes("/"))
      throw new Error("Ingrese un monto positivo y un motivo.");
    return amount;
  }
  async function control(tx: AtomicTx) {
    const current = await tx.get("treasuryControl/current");
    const revision = current?.revision ?? 0;
    if (
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error("Control de sobres inválido.");
    return revision;
  }
  const touch = (tx: AtomicTx, revision: number) =>
    tx.set("treasuryControl/current", {
      revision: revision + 1,
      updatedAt: stamp(),
    });
  return {
    async initializeEnvelope(
      envelopeDay: string,
      amount: number,
      description: string,
      requestId: string,
    ) {
      dateDay(envelopeDay);
      amount = input(amount, description, requestId);
      const day = businessDay(now());
      if (envelopeDay > day)
        throw new Error(
          "No se puede registrar un sobre inicial en una fecha futura.",
        );
      return atomic(async (tx) => {
        const existing = await tx.get(`envelopeMovements/${requestId}`);
        if (existing) {
          if (
            existing.kind !== "opening" ||
            existing.envelopeDay !== envelopeDay ||
            existing.amount !== amount
          )
            throw new Error("Este movimiento ya se registró con otros datos.");
          return;
        }
        const envelope = await tx.get(`cashEnvelopes/${envelopeDay}`);
        const revision = await control(tx);
        if (envelope)
          throw new Error(
            "Ese sobre ya existe. No se puede volver a asignar un saldo inicial.",
          );
        tx.set(`cashEnvelopes/${envelopeDay}`, {
          day: envelopeDay,
          weekStart: weekOf(envelopeDay),
          initialAmount: amount,
          deposited: 0,
          spent: 0,
          toCash: 0,
          balance: amount,
          revision: 1,
          updatedAt: stamp(),
        });
        tx.set(`envelopeMovements/${requestId}`, {
          envelopeDay,
          day,
          weekStart: weekOf(day),
          kind: "opening",
          amount,
          balanceBefore: 0,
          balanceAfter: amount,
          description: description.trim(),
          createdAt: stamp(),
        });
        touch(tx, revision);
      });
    },
    async registerAdvance(
      washerId: string,
      amount: number,
      description: string,
      requestId: string,
    ) {
      amount = input(amount, description, requestId);
      if (!washerId || washerId.includes("/"))
        throw new Error("Seleccione el lavador del vale.");
      const day = businessDay(now());
      return atomic(async (tx) => {
        const existing = await tx.get(`cashAdvances/${requestId}`);
        if (existing) {
          if (existing.washerId !== washerId || existing.amount !== amount)
            throw new Error("Este vale ya se registró con otros datos.");
          return;
        }
        const session = await openSession(tx);
        const washer = await tx.get(`washers/${washerId}`);
        const revision = await control(tx);
        if (
          !washer ||
          washer.active === false ||
          typeof washer.name !== "string" ||
          !washer.name.trim()
        )
          throw new Error("Seleccione un lavador activo.");
        if (session.balances.Efectivo < amount)
          throw new Error("El efectivo disponible no alcanza para el vale.");
        tx.set(`cashAdvances/${requestId}`, {
          washerId,
          washerName: washer.name,
          amount,
          description: description.trim(),
          day,
          weekStart: weekOf(day),
          sessionId: session.id,
          createdAt: stamp(),
        });
        ledger(tx, session, [
          {
            amount: -amount,
            method: "Efectivo",
            kind: "payroll_advance",
            referenceId: requestId,
            description: `Vale de ${washer.name}: ${description.trim()}`,
            expenses: amount,
            washerId,
            washerName: washer.name,
          },
        ]);
        touch(tx, revision);
      });
    },
    async depositEnvelope(
      amount: number,
      description: string,
      requestId: string,
    ) {
      amount = input(amount, description, requestId);
      const day = businessDay(now());
      return atomic(async (tx) => {
        const existing = await tx.get(`envelopeMovements/${requestId}`);
        if (existing) {
          if (existing.kind !== "deposit" || existing.amount !== amount)
            throw new Error("Este movimiento ya se registró con otros datos.");
          return;
        }
        const session = await openSession(tx);
        const previous = await tx.get(`cashEnvelopes/${day}`);
        const revision = await control(tx);
        if (previous && !isEnvelope(previous))
          throw new Error("El sobre tiene saldos incompatibles.");
        if (amount > money(session.balances.Efectivo - session.openingAmount))
          throw new Error(
            "El monto excede el efectivo a guardar sin usar el fondo inicial.",
          );
        const before = previous ? Number(previous.balance) : 0;
        tx.set(
          `cashEnvelopes/${day}`,
          {
            day,
            weekStart: weekOf(day),
            balance: money(before + amount),
            deposited: money(Number(previous?.deposited ?? 0) + amount),
            spent: Number(previous?.spent ?? 0),
            toCash: Number(previous?.toCash ?? 0),
            revision: Number(previous?.revision ?? 0) + 1,
            updatedAt: stamp(),
          },
          true,
        );
        tx.set(`envelopeMovements/${requestId}`, {
          envelopeDay: day,
          day,
          weekStart: weekOf(day),
          kind: "deposit",
          amount,
          balanceBefore: before,
          balanceAfter: money(before + amount),
          description: description.trim(),
          sessionId: session.id,
          createdAt: stamp(),
        });
        ledger(tx, session, [
          {
            amount: -amount,
            method: "Efectivo",
            kind: "envelope_deposit",
            referenceId: requestId,
            description: `Guardado en sobre ${day}: ${description.trim()}`,
            envelopeDay: day,
          },
        ]);
        touch(tx, revision);
      });
    },
    async withdrawEnvelope(
      envelopeDay: string,
      amount: number,
      destination: "to_cash" | "expense",
      description: string,
      requestId: string,
    ) {
      dateDay(envelopeDay);
      amount = input(amount, description, requestId);
      const day = businessDay(now());
      if (destination !== "to_cash" && destination !== "expense")
        throw new Error("Seleccione el destino del dinero.");
      return atomic(async (tx) => {
        const existing = await tx.get(`envelopeMovements/${requestId}`);
        if (existing) {
          if (
            existing.envelopeDay !== envelopeDay ||
            existing.kind !== destination ||
            existing.amount !== -amount
          )
            throw new Error("Este retiro ya se registró con otros datos.");
          return;
        }
        const previous = await tx.get(`cashEnvelopes/${envelopeDay}`);
        const session =
          destination === "to_cash" ? await openSession(tx) : null;
        const revision = await control(tx);
        if (!isEnvelope(previous))
          throw new Error("El sobre no existe o sus saldos son incompatibles.");
        if (previous.balance < amount)
          throw new Error("El saldo del sobre no alcanza para este retiro.");
        const after = money(previous.balance - amount);
        tx.set(
          `cashEnvelopes/${envelopeDay}`,
          {
            balance: after,
            spent: money(
              previous.spent + (destination === "expense" ? amount : 0),
            ),
            toCash: money(
              previous.toCash + (destination === "to_cash" ? amount : 0),
            ),
            revision: previous.revision + 1,
            updatedAt: stamp(),
          },
          true,
        );
        tx.set(`envelopeMovements/${requestId}`, {
          envelopeDay,
          day,
          weekStart: weekOf(day),
          kind: destination,
          amount: -amount,
          balanceBefore: previous.balance,
          balanceAfter: after,
          description: description.trim(),
          ...(session ? { sessionId: session.id } : {}),
          createdAt: stamp(),
        });
        if (session)
          ledger(tx, session, [
            {
              amount,
              method: "Efectivo",
              kind: "envelope_to_cash",
              referenceId: requestId,
              description: `Dinero del sobre ${envelopeDay}: ${description.trim()}`,
              envelopeDay,
            },
          ]);
        touch(tx, revision);
      });
    },
  };
}
