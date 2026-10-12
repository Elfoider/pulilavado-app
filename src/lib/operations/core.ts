import {
  Atomic,
  AtomicTx,
  Data,
  ProductLine,
  CartItem,
  CashSession,
  cashSessionProblem,
  isLegacyCashSession,
  Method,
  money,
  nonnegative,
  method,
  commission,
  quantities,
  emptyBalances,
} from "./model";

export function createOperations(
  atomic: Atomic,
  stamp: () => unknown,
  id: () => string,
) {
  async function openSession(tx: AtomicTx) {
    const control = await tx.get("cashControl/current");
    const sessionId = control?.sessionId as string | undefined;
    const session = sessionId
      ? await tx.get(`cashSessions/${sessionId}`)
      : undefined;
    if (!session || session.status !== "open")
      throw new Error("Abra la caja antes de cobrar o registrar movimientos.");
    const problem = cashSessionProblem(session);
    if (problem)
      throw new Error(
        `La caja abierta tiene un formato anterior o incompleto: ${problem} Revise ese registro antes de operar.`,
      );
    return { ...session, id: sessionId } as unknown as CashSession;
  }
  function ledger(
    tx: AtomicTx,
    session: CashSession,
    entries: {
      amount: number;
      method: Method;
      kind: string;
      referenceId: string;
      description: string;
      tips?: number;
      receipts?: number;
      expenses?: number;
    }[],
  ) {
    const balances = { ...session.balances };
    let receipts = session.receipts || 0,
      tips = session.tips || 0,
      expenses = session.expenses || 0;
    for (const e of entries) {
      if (!e.amount) continue;
      balances[e.method] = money((balances[e.method] || 0) + e.amount);
      receipts = money(receipts + (e.receipts || 0));
      tips = money(tips + (e.tips || 0));
      expenses = money(expenses + (e.expenses || 0));
      tx.set(`cashMovements/${id()}`, {
        ...e,
        sessionId: session.id,
        createdAt: stamp(),
      });
    }
    if (balances.Efectivo < 0)
      throw new Error(
        "El efectivo disponible no alcanza para devolver este cobro.",
      );
    tx.set(
      `cashSessions/${session.id}`,
      { balances, receipts, tips, expenses, updatedAt: stamp() },
      true,
    );
  }
  async function productPlan(
    tx: AtomicTx,
    cart: CartItem[],
    previous: ProductLine[] = [],
  ) {
    const next = quantities(cart),
      old = quantities(previous);
    const lines: ProductLine[] = [];
    const updates: { path: string; data: Data; movement: Data }[] = [];
    for (const productId of new Set([...old.keys(), ...next.keys()])) {
      const p = await tx.get(`products/${productId}`);
      if (!p) throw new Error("Un producto ya no existe. Revise el carrito.");
      const quantity = next.get(productId) || 0,
        before = Number(p.stock),
        delta = (old.get(productId) || 0) - quantity;
      if (!Number.isSafeInteger(before) || before < 0)
        throw new Error("Stock inválido. Revise el producto.");
      if (quantity > (old.get(productId) || 0) && !p.active)
        throw new Error(`El producto ${p.name} está inactivo.`);
      const after = before + delta;
      if (after < 0)
        throw new Error(
          `Stock insuficiente para ${p.name}. Disponible: ${before}.`,
        );
      if (quantity) {
        const snapshot = previous.find((l) => l.productId === productId);
        const unitPrice =
          snapshot?.unitPrice ?? nonnegative(Number(p.price), "Precio");
        lines.push({
          productId,
          quantity,
          name: snapshot?.name ?? String(p.name),
          sku: snapshot?.sku ?? String(p.sku),
          unitPrice,
          unitCost: snapshot?.unitCost ?? nonnegative(Number(p.cost), "Costo"),
          total: money(unitPrice * quantity),
        });
      }
      if (delta)
        updates.push({
          path: `products/${productId}`,
          data: { stock: after, updatedAt: stamp() },
          movement: {
            productId,
            productName: p.name,
            quantity: delta,
            before,
            after,
            createdAt: stamp(),
          },
        });
    }
    return {
      lines,
      total: money(lines.reduce((s, l) => s + l.total, 0)),
      updates,
    };
  }
  function writeStock(
    tx: AtomicTx,
    plan: Awaited<ReturnType<typeof productPlan>>,
    referenceId: string,
    kind: string,
  ) {
    for (const u of plan.updates) {
      tx.set(u.path, u.data, true);
      tx.set(`inventoryMovements/${id()}`, {
        ...u.movement,
        referenceId,
        kind,
      });
    }
  }
  function paymentEntries(
    fin: Data,
    sign: number,
    referenceId: string,
    kind: string,
  ) {
    const total = Number(fin.totalPrice || 0),
      tip = Number(fin.tipAmount || 0);
    return [
      {
        amount: sign * total,
        method: method(String(fin.paymentMethod)),
        kind,
        referenceId,
        description: "Cobro de servicio y productos",
        receipts: sign * total,
      },
      ...(tip
        ? [
            {
              amount: sign * tip,
              method: method(String(fin.tipMethod)),
              kind: `${kind}_tip`,
              referenceId,
              description: "Propina del lavador",
              tips: sign * tip,
            },
          ]
        : []),
    ];
  }
  const api = {
    async closeLegacyCash(sessionId: string, counted: number, notes: string) {
      counted = nonnegative(counted, "Efectivo contado");
      if (!notes.trim()) throw new Error("Indique quién revisó la caja y el motivo del cierre anterior.");
      return atomic(async (tx) => {
        const session = await tx.get(`cashSessions/${sessionId}`);
        const control = await tx.get("cashControl/current");
        if (!isLegacyCashSession(session))
          throw new Error("El registro cambió o no corresponde al formato anterior reconocido.");
        if (session?.isOpen === false) return;
        tx.set(`cashSessions/${sessionId}`, {
          isOpen: false,
          status: "closed",
          closedAt: stamp(),
          legacyClosure: { countedCash: counted, notes: notes.trim(), closedAt: stamp(), expectedBalanceKnown: false },
        }, true);
        if (control?.sessionId === sessionId)
          tx.set("cashControl/current", { sessionId: null }, true);
      });
    },
    async openCash(opening: number, requestId: string) {
      opening = nonnegative(opening, "Fondo inicial");
      return atomic(async (tx) => {
        const existing = await tx.get(`cashSessions/${requestId}`);
        const control = await tx.get("cashControl/current");
        const previous = control?.sessionId
          ? await tx.get(`cashSessions/${control.sessionId}`)
          : undefined;
        if (existing) {
          const problem = cashSessionProblem(existing);
          if (problem)
            throw new Error(`La caja registrada es incompatible: ${problem}`);
          return requestId;
        }
        if (
          previous &&
          previous.status !== "closed" &&
          !(isLegacyCashSession(previous) && previous.isOpen === false) &&
          cashSessionProblem(previous)
        )
          throw new Error(
            "La caja actual tiene un formato anterior o incompleto. Revise el registro antes de abrir otra caja.",
          );
        if (previous?.status === "open")
          throw new Error("Ya hay una caja abierta.");
        tx.set(`cashSessions/${requestId}`, {
          status: "open",
          openingAmount: opening,
          balances: { ...emptyBalances(), Efectivo: opening },
          receipts: 0,
          tips: 0,
          expenses: 0,
          openedAt: stamp(),
        });
        tx.set("cashControl/current", { sessionId: requestId });
        tx.set(`cashMovements/${id()}`, {
          sessionId: requestId,
          kind: "opening",
          amount: opening,
          method: "Efectivo",
          referenceId: requestId,
          description: "Fondo de apertura",
          createdAt: stamp(),
        });
        return requestId;
      });
    },
    async closeCash(sessionId: string, counted: number, notes: string) {
      counted = nonnegative(counted, "Efectivo contado");
      return atomic(async (tx) => {
        const session = await openSession(tx);
        if (session.id !== sessionId)
          throw new Error("La caja cambió. Actualice la pantalla.");
        tx.set(
          `cashSessions/${session.id}`,
          {
            status: "closed",
            countedAmount: counted,
            difference: money(counted - session.balances.Efectivo),
            notes,
            closedAt: stamp(),
          },
          true,
        );
        tx.set("cashControl/current", { sessionId: null });
      });
    },
    async cashMove(
      amount: number,
      paymentMethod: string,
      kind: "expense" | "withdrawal" | "income",
      description: string,
      requestId: string,
    ) {
      amount = nonnegative(amount, "Monto");
      const pm = method(paymentMethod);
      if (amount <= 0 || !description.trim())
        throw new Error("Ingrese un monto positivo y un motivo.");
      return atomic(async (tx) => {
        const existing = await tx.get(`cashMovements/${requestId}`);
        if (existing) return;
        const session = await openSession(tx);
        const signed = kind === "income" ? amount : -amount;
        if (pm === "Efectivo" && session.balances.Efectivo + signed < 0)
          throw new Error(
            "El efectivo disponible no alcanza para esta salida.",
          );
        // Deterministic receipt makes manual movements safe to retry.
        tx.set(`cashMovements/${requestId}`, {
          sessionId: session.id,
          amount: signed,
          method: pm,
          kind,
          description: description.trim(),
          referenceId: requestId,
          createdAt: stamp(),
        });
        tx.set(
          `cashSessions/${session.id}`,
          {
            balances: {
              ...session.balances,
              [pm]: money(session.balances[pm] + signed),
            },
            expenses: money(
              session.expenses + (kind === "expense" ? amount : 0),
            ),
            updatedAt: stamp(),
          },
          true,
        );
      });
    },
    async saveProduct(
      data: Omit<import("./model").Product, "id" | "stock">,
      productId: string,
    ) {
      if (!data.name.trim() || !data.sku.trim())
        throw new Error("Ingrese nombre y código del producto.");
      if (!Number.isSafeInteger(data.minimum) || data.minimum < 0)
        throw new Error("Stock mínimo inválido.");
      const clean = {
        ...data,
        name: data.name.trim(),
        sku: data.sku.trim(),
        price: nonnegative(data.price, "Precio"),
        cost: nonnegative(data.cost, "Costo"),
      };
      return atomic(async (tx) => {
        const current = await tx.get(`products/${productId}`);
        const skuKey = encodeURIComponent(clean.sku.toUpperCase());
        const code = await tx.get(`productCodes/${skuKey}`);
        if (code?.productId && code.productId !== productId)
          throw new Error("Ese código ya pertenece a otro producto.");
        if (
          current?.sku &&
          String(current.sku).toUpperCase() !== clean.sku.toUpperCase()
        )
          tx.set(
            `productCodes/${encodeURIComponent(String(current.sku).toUpperCase())}`,
            { productId: null },
          );
        tx.set(`productCodes/${skuKey}`, { productId });
        tx.set(
          `products/${productId}`,
          {
            ...clean,
            ...(!current ? { stock: 0, createdAt: stamp() } : {}),
            updatedAt: stamp(),
          },
          true,
        );
      });
    },
    async changeStock(
      productId: string,
      quantity: number,
      kind: "receive" | "adjust",
      reason: string,
      requestId: string,
    ) {
      if (
        !Number.isSafeInteger(quantity) ||
        quantity === 0 ||
        (kind === "receive" && quantity < 0) ||
        !reason.trim()
      )
        throw new Error("Ingrese una cantidad válida y un motivo.");
      return atomic(async (tx) => {
        const existing = await tx.get(`inventoryMovements/${requestId}`);
        if (existing) return;
        const p = await tx.get(`products/${productId}`);
        if (!p) throw new Error("Producto inexistente.");
        const before = Number(p.stock),
          after = before + quantity;
        if (!Number.isSafeInteger(before) || after < 0)
          throw new Error("El ajuste dejaría un stock negativo.");
        tx.set(
          `products/${productId}`,
          { stock: after, updatedAt: stamp() },
          true,
        );
        tx.set(`inventoryMovements/${requestId}`, {
          productId,
          productName: p.name,
          quantity,
          before,
          after,
          kind,
          reason: reason.trim(),
          referenceId: requestId,
          createdAt: stamp(),
        });
      });
    },
    async sell(cart: CartItem[], paymentMethod: string, requestId: string) {
      const pm = method(paymentMethod);
      if (!cart.length) throw new Error("Agregue al menos un producto.");
      return atomic(async (tx) => {
        const existing = await tx.get(`sales/${requestId}`);
        if (existing) return requestId;
        const session = await openSession(tx);
        const plan = await productPlan(tx, cart);
        if (plan.total <= 0)
          throw new Error("El total de venta debe ser positivo.");
        writeStock(tx, plan, requestId, "sale");
        ledger(tx, session, [
          {
            amount: plan.total,
            method: pm,
            kind: "sale",
            referenceId: requestId,
            description: "Venta individual de productos",
            receipts: plan.total,
          },
        ]);
        tx.set(`sales/${requestId}`, {
          lines: plan.lines,
          total: plan.total,
          paymentMethod: pm,
          cashSessionId: session.id,
          status: "paid",
          createdAt: stamp(),
        });
        return requestId;
      });
    },
    async cancelSale(saleId: string, reason: string) {
      if (!reason.trim()) throw new Error("Indique el motivo de anulación.");
      return atomic(async (tx) => {
        const sale = await tx.get(`sales/${saleId}`);
        if (!sale) throw new Error("Venta inexistente.");
        if (sale.status === "cancelled") return;
        const session = await openSession(tx);
        if (sale.cashSessionId !== session.id)
          throw new Error(
            "La caja de esta venta está cerrada. No se puede anular.",
          );
        const plan = await productPlan(tx, [], sale.lines as ProductLine[]);
        writeStock(tx, plan, saleId, "sale_return");
        ledger(tx, session, [
          {
            amount: -Number(sale.total),
            method: method(String(sale.paymentMethod)),
            kind: "sale_refund",
            referenceId: saleId,
            description: reason.trim(),
            receipts: -Number(sale.total),
          },
        ]);
        tx.set(
          `sales/${saleId}`,
          {
            status: "cancelled",
            cancellationReason: reason.trim(),
            cancelledAt: stamp(),
          },
          true,
        );
      });
    },
    async saveService(
      input: {
        clientName: string;
        clientPhone: string;
        vehicle: { model: string; color: string; bay: string };
        washerId: string;
        servicePrice: number;
        paymentStatus: string;
        paymentMethod: string;
        tipAmount: number;
        tipMethod: string;
        cart: CartItem[];
      },
      serviceId: string,
      create: boolean,
    ) {
      const servicePrice = nonnegative(input.servicePrice, "Precio del lavado");
      const paid = input.paymentStatus === "paid";
      if (!["paid", "pending"].includes(input.paymentStatus))
        throw new Error("Estado de pago inválido.");
      const tip = paid ? nonnegative(input.tipAmount, "Propina") : 0;
      if (!input.washerId || !input.vehicle.model.trim())
        throw new Error("Seleccione vehículo y lavador.");
      return atomic(async (tx) => {
        const old = await tx.get(`services/${serviceId}`);
        if (create && old) return serviceId;
        if (!create && !old) throw new Error("El servicio no existe.");
        if (old?.status === "cancelled")
          throw new Error("Este servicio fue anulado.");
        const washer = await tx.get(`washers/${input.washerId}`);
        const config = await tx.get("settings/global");
        if (!washer || (!washer.active && old?.washerId !== input.washerId))
          throw new Error("Seleccione un lavador activo.");
        const oldFin = (old?.financials ?? {}) as Data;
        const rate =
          old?.washerId === input.washerId &&
          typeof oldFin.commissionRate === "number"
            ? oldFin.commissionRate
            : commission(
                washer.commissionPercentage,
                config?.defaultCommissionPercentage,
              );
        const plan = await productPlan(
          tx,
          input.cart,
          (old?.products ?? []) as ProductLine[],
        );
        const total = money(servicePrice + plan.total);
        if (paid && total <= 0)
          throw new Error("Ingrese un precio positivo para cobrar.");
        const fin = {
          totalPrice: total,
          servicePrice,
          productsTotal: plan.total,
          paymentMethod: paid ? method(input.paymentMethod) : "Pendiente",
          tipAmount: tip,
          tipMethod: tip ? method(input.tipMethod) : null,
          commissionRate: rate,
          washerEarnings: money(servicePrice * rate),
          businessEarnings: money(total - money(servicePrice * rate)),
        };
        const oldPaid = !!old && old.paymentStatus !== "pending";
        const changed =
          !old ||
          oldPaid !== paid ||
          Number(oldFin.totalPrice || 0) !== total ||
          oldFin.paymentMethod !== fin.paymentMethod ||
          Number(oldFin.tipAmount || 0) !== tip ||
          (tip > 0 && oldFin.tipMethod !== fin.tipMethod);
        let session: CashSession | undefined;
        if (changed && (paid || oldPaid)) {
          if (oldPaid && !old?.cashSessionId)
            throw new Error(
              "Este cobro es anterior al módulo de caja. Sus montos históricos no se pueden modificar.",
            );
          session = await openSession(tx);
          if (oldPaid && old?.cashSessionId !== session.id)
            throw new Error(
              "La caja de este cobro está cerrada. Sus montos no se pueden modificar.",
            );
        }
        // Product and commission allocation changes also remain immutable after close.
        const allocationChanged =
          old &&
          (old.washerId !== input.washerId ||
            Number(oldFin.servicePrice ?? oldFin.totalPrice) !== servicePrice ||
            JSON.stringify(old.products ?? []) !== JSON.stringify(plan.lines));
        if (oldPaid && allocationChanged) {
          if (!old?.cashSessionId)
            throw new Error(
              "No se puede cambiar la distribución de un cobro histórico.",
            );
          session ??= await openSession(tx);
          if (old.cashSessionId !== session.id)
            throw new Error(
              "No se puede modificar un servicio de una caja cerrada.",
            );
        }
        writeStock(tx, plan, serviceId, "service_products");
        if (session && changed)
          ledger(tx, session, [
            ...(oldPaid
              ? paymentEntries(oldFin, -1, serviceId, "service_correction")
              : []),
            ...(paid
              ? paymentEntries(fin, 1, serviceId, "service_payment")
              : []),
          ]);
        tx.set(
          `services/${serviceId}`,
          {
            clientName: input.clientName,
            clientPhone: input.clientPhone,
            vehicle: input.vehicle,
            washerId: input.washerId,
            paymentStatus: input.paymentStatus,
            products: plan.lines,
            financials:
              old && oldPaid && !allocationChanged && !changed ? oldFin : fin,
            washerName: washer.name,
            status: old?.status ?? "completed",
            cashSessionId: paid
              ? (session?.id ?? old?.cashSessionId ?? null)
              : null,
            updatedAt: stamp(),
            ...(!old ? { createdAt: stamp() } : {}),
            ...(changed && paid ? { paidAt: stamp() } : {}),
          },
          true,
        );
        return serviceId;
      });
    },
    async cancelService(serviceId: string, reason: string) {
      if (!reason.trim()) throw new Error("Indique el motivo de anulación.");
      return atomic(async (tx) => {
        const service = await tx.get(`services/${serviceId}`);
        if (!service) throw new Error("Servicio inexistente.");
        if (service.status === "cancelled") return;
        const paid = service.paymentStatus !== "pending";
        let session: CashSession | undefined;
        if (paid) {
          if (!service.cashSessionId)
            throw new Error(
              "El cobro histórico no pertenece a una caja. No se puede anular desde este módulo.",
            );
          session = await openSession(tx);
          if (service.cashSessionId !== session.id)
            throw new Error("La caja del cobro está cerrada.");
        }
        const plan = await productPlan(
          tx,
          [],
          (service.products ?? []) as ProductLine[],
        );
        writeStock(tx, plan, serviceId, "service_return");
        if (session)
          ledger(
            tx,
            session,
            paymentEntries(
              service.financials as Data,
              -1,
              serviceId,
              "service_refund",
            ),
          );
        tx.set(
          `services/${serviceId}`,
          {
            status: "cancelled",
            paymentStatus: "cancelled",
            cancellationReason: reason.trim(),
            cancelledAt: stamp(),
          },
          true,
        );
      });
    },
  };
  return api;
}
