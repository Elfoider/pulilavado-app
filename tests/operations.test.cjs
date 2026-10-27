const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createOperations } = require("../.test-build/operations/core.js");
const { commission, money, quantities } = require("../.test-build/operations/model.js");

function fixture() {
  let counter = 0,
    tail = Promise.resolve();
  const docs = new Map([
    ["washers/w1", { name: "Ana", active: true, commissionPercentage: 25 }],
    ["washers/w2", { name: "Luis", active: true, commissionPercentage: null }],
    ["settings/global", { defaultCommissionPercentage: 40 }],
    [
      "products/p1",
      { name: "Agua", sku: "A", price: 2, cost: 1, stock: 10, active: true },
    ],
    [
      "products/p2",
      { name: "Snack", sku: "B", price: 3, cost: 1, stock: 5, active: true },
    ],
  ]);
  const atomic = (work) => {
    const run = tail.then(async () => {
      const staged = new Map();
      let writing = false;
      const result = await work({
        async get(path) {
          assert.equal(
            writing,
            false,
            "Firestore requires all reads before writes",
          );
          return docs.has(path) ? structuredClone(docs.get(path)) : undefined;
        },
        set(path, value, merge = false) {
          writing = true;
          const clean = Object.fromEntries(
            Object.entries(value).filter(([, v]) => v !== undefined),
          );
          staged.set(
            path,
            merge
              ? {
                  ...structuredClone(staged.get(path) ?? docs.get(path) ?? {}),
                  ...clean,
                }
              : structuredClone(clean),
          );
        },
      });
      for (const [path, data] of staged) {
        if (path.startsWith("cashMovements/")) {
          assert.ok(data.sequence >= 1);
          for (const method of ["Efectivo", "Yappy", "Tarjeta", "Transferencia"]) {
            assert.equal(data.balancesAfter[method], money(data.balancesBefore[method] + (method === data.method ? data.amount : 0)));
          }
        }
        docs.set(path, data);
      }
      return result;
    });
    tail = run.catch(() => {});
    return run;
  };
  const api = createOperations(
    atomic,
    () => ({ seconds: 1000 }),
    () => `auto${++counter}`,
  );
  const get = (path) => docs.get(path);
  const movements = (prefix) =>
    [...docs].filter(([p]) => p.startsWith(prefix + "/")).map(([, d]) => d);
  const input = (overrides) => ({
    clientName: "Cliente",
    clientPhone: "123",
    vehicle: { model: "Toyota", color: "Blanco", bay: "1" },
    washerId: "w1",
    servicePrice: 20,
    paymentStatus: "paid",
    paymentMethod: "Efectivo",
    tipAmount: 0,
    tipMethod: "Efectivo",
    cart: [],
    ...overrides,
  });
  return { api, docs, get, movements, input };
}

test("individual overrides global, including explicit zero", () => {
  assert.equal(commission(0, 40), 0);
  assert.equal(commission(25, 40), 0.25);
  assert.equal(commission(null, 40), 0.4);
  assert.equal(commission(undefined, 0), 0);
  assert.throws(() => commission(NaN, 40));
  assert.throws(() => commission(101, 40));
});
test("money rounds cents and rejects nonfinite; quantities consolidate duplicates", () => {
  assert.equal(money(1.005), 1.01);
  assert.throws(() => money(NaN));
  assert.equal(
    quantities([
      { productId: "p", quantity: 1 },
      { productId: "p", quantity: 2 },
    ]).get("p"),
    3,
  );
  assert.throws(() => quantities([{ productId: "p", quantity: 1.5 }]));
});
test("only one cash session opens concurrently", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.api.openCash(10, "c1"),
    f.api.openCash(20, "c2"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.movements("cashSessions").length, 1);
});
test("opening is safe to retry and zero opening is valid", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await f.api.openCash(0, "c");
  assert.equal(f.movements("cashMovements").length, 1);
  assert.equal(f.get("cashSessions/c").balances.Efectivo, 0);
});
test("paid service requires open cash and failure leaves no service or stock change", async () => {
  const f = fixture();
  await assert.rejects(
    f.api.saveService(
      f.input({ cart: [{ productId: "p1", quantity: 2 }] }),
      "s",
      true,
    ),
    /Abra la caja/,
  );
  assert.equal(f.get("services/s"), undefined);
  assert.equal(f.get("products/p1").stock, 10);
});
test("service + products + tip settle atomically, commission excludes products", async () => {
  const f = fixture();
  await f.api.openCash(10, "c");
  await f.api.saveService(
    f.input({
      cart: [{ productId: "p1", quantity: 2 }],
      tipAmount: 3,
      tipMethod: "Yappy",
    }),
    "s",
    true,
  );
  const s = f.get("services/s"),
    c = f.get("cashSessions/c");
  assert.equal(s.financials.totalPrice, 24);
  assert.equal(s.financials.washerEarnings, 5);
  assert.equal(s.financials.businessEarnings, 19);
  assert.equal(c.balances.Efectivo, 34);
  assert.equal(c.balances.Yappy, 3);
  assert.equal(c.receipts, 24);
  assert.equal(c.tips, 3);
  assert.equal(f.get("products/p1").stock, 8);
});
test("retry service creation never duplicates stock or cash", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  const input = f.input({ cart: [{ productId: "p1", quantity: 2 }] });
  await f.api.saveService(input, "s", true);
  await f.api.saveService(input, "s", true);
  assert.equal(f.get("cashSessions/c").receipts, 24);
  assert.equal(f.get("products/p1").stock, 8);
  assert.equal(f.movements("inventoryMovements").length, 1);
});
test("pending service reserves products without cash, later collects exactly once", async () => {
  const f = fixture();
  const input = f.input({
    paymentStatus: "pending",
    cart: [{ productId: "p1", quantity: 2 }],
  });
  await f.api.saveService(input, "s", true);
  assert.equal(f.get("products/p1").stock, 8);
  assert.equal(f.movements("cashMovements").length, 0);
  await f.api.openCash(0, "c");
  await f.api.saveService({ ...input, paymentStatus: "paid" }, "s", false);
  await f.api.saveService({ ...input, paymentStatus: "paid" }, "s", false);
  assert.equal(f.get("products/p1").stock, 8);
  assert.equal(f.get("cashSessions/c").receipts, 24);
});
test("historical commission remains after washer/global settings change", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await f.api.saveService(f.input(), "s", true);
  f.docs.set("washers/w1", {
    name: "Ana",
    active: true,
    commissionPercentage: 80,
  });
  f.docs.set("settings/global", { defaultCommissionPercentage: 99 });
  await f.api.saveService(f.input({ servicePrice: 40 }), "s", false);
  assert.equal(f.get("services/s").financials.commissionRate, 0.25);
  assert.equal(f.get("services/s").financials.washerEarnings, 10);
  assert.equal(f.get("cashSessions/c").receipts, 40);
});
test("washer reassignment uses individual/global rate, explicit zero supported", async () => {
  const f = fixture();
  await f.api.saveService(f.input({ paymentStatus: "pending" }), "s", true);
  await f.api.saveService(
    f.input({ paymentStatus: "pending", washerId: "w2" }),
    "s",
    false,
  );
  assert.equal(f.get("services/s").financials.commissionRate, 0.4);
  f.docs.set("washers/w1", {
    name: "Ana",
    active: true,
    commissionPercentage: 0,
  });
  await f.api.saveService(f.input({ paymentStatus: "pending" }), "s", false);
  assert.equal(f.get("services/s").financials.washerEarnings, 0);
});
test("product historical price remains, pending cart delta changes stock only once", async () => {
  const f = fixture();
  const input = f.input({
    paymentStatus: "pending",
    cart: [{ productId: "p1", quantity: 2 }],
  });
  await f.api.saveService(input, "s", true);
  f.docs.set("products/p1", { ...f.get("products/p1"), price: 9 });
  await f.api.saveService(
    { ...input, cart: [{ productId: "p1", quantity: 3 }] },
    "s",
    false,
  );
  assert.equal(f.get("services/s").financials.productsTotal, 6);
  assert.equal(f.get("products/p1").stock, 7);
});
test("insufficient stock rolls back all products, sale and cash", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await assert.rejects(
    f.api.sell(
      [
        { productId: "p1", quantity: 2 },
        { productId: "p2", quantity: 6 },
      ],
      "Efectivo",
      "sale",
    ),
    /Stock insuficiente/,
  );
  assert.equal(f.get("products/p1").stock, 10);
  assert.equal(f.get("sales/sale"), undefined);
  assert.equal(f.get("cashSessions/c").receipts, 0);
  assert.equal(f.movements("inventoryMovements").length, 0);
});
test("competing sales cannot oversell", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  const cart = [{ productId: "p1", quantity: 7 }];
  const results = await Promise.allSettled([
    f.api.sell(cart, "Efectivo", "a"),
    f.api.sell(cart, "Efectivo", "b"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.get("products/p1").stock, 3);
  assert.equal(f.get("cashSessions/c").receipts, 14);
});
test("quick sale idempotency, cancellation restores stock/cash exactly once", async () => {
  const f = fixture();
  await f.api.openCash(10, "c");
  const cart = [{ productId: "p1", quantity: 2 }];
  await f.api.sell(cart, "Tarjeta", "a");
  await f.api.sell(cart, "Tarjeta", "a");
  assert.equal(f.get("products/p1").stock, 8);
  await f.api.cancelSale("a", "Error");
  await f.api.cancelSale("a", "Reintento");
  assert.equal(f.get("products/p1").stock, 10);
  assert.equal(f.get("cashSessions/c").balances.Tarjeta, 0);
  assert.equal(f.get("cashSessions/c").receipts, 0);
  assert.equal(f.get("sales/a").status, "cancelled");
});
test("pending cancellation restores reserved products without requiring cash", async () => {
  const f = fixture();
  await f.api.saveService(
    f.input({
      paymentStatus: "pending",
      cart: [{ productId: "p1", quantity: 2 }],
    }),
    "s",
    true,
  );
  await f.api.cancelService("s", "No retiró");
  await f.api.cancelService("s", "Retry");
  assert.equal(f.get("products/p1").stock, 10);
  assert.equal(f.movements("cashMovements").length, 0);
});
test("paid correction reverses original methods and tips, no duplicate balance", async () => {
  const f = fixture();
  await f.api.openCash(10, "c");
  await f.api.saveService(
    f.input({ tipAmount: 2, tipMethod: "Yappy" }),
    "s",
    true,
  );
  await f.api.saveService(
    f.input({
      servicePrice: 30,
      paymentMethod: "Tarjeta",
      tipAmount: 3,
      tipMethod: "Efectivo",
    }),
    "s",
    false,
  );
  const c = f.get("cashSessions/c");
  assert.deepEqual(c.balances, {
    Efectivo: 13,
    Yappy: 0,
    Tarjeta: 30,
    Transferencia: 0,
  });
  assert.equal(c.receipts, 30);
  assert.equal(c.tips, 3);
});
test("paid service cancellation reverses receipt and tip, preserves audit document", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await f.api.saveService(
    f.input({ tipAmount: 2, cart: [{ productId: "p1", quantity: 1 }] }),
    "s",
    true,
  );
  await f.api.cancelService("s", "Error");
  assert.equal(f.get("cashSessions/c").balances.Efectivo, 0);
  assert.equal(f.get("products/p1").stock, 10);
  assert.equal(f.get("services/s").status, "cancelled");
  await assert.rejects(f.api.saveService(f.input(), "s", false), /anulado/);
});
test("close computes difference, locks financial edits/refunds; metadata still editable", async () => {
  const f = fixture();
  await f.api.openCash(10, "c");
  await f.api.saveService(f.input(), "s", true);
  await f.api.sell([{ productId: "p1", quantity: 1 }], "Efectivo", "sale");
  await f.api.closeCash("c", 31, "Falta uno");
  assert.equal(f.get("cashSessions/c").difference, -1);
  await f.api.openCash(0, "c2");
  await assert.rejects(
    f.api.saveService(f.input({ servicePrice: 25 }), "s", false),
    /cerrada/,
  );
  await assert.rejects(f.api.cancelSale("sale", "Error"), /cerrada/);
  await f.api.saveService(f.input({ clientPhone: "999" }), "s", false);
  assert.equal(f.get("services/s").clientPhone, "999");
  assert.equal(f.get("cashSessions/c").balances.Efectivo, 32);
});
test("closed paid allocation cannot change even if total remains equal", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await f.api.saveService(f.input(), "s", true);
  await f.api.closeCash("c", 20, "");
  await f.api.openCash(0, "c2");
  await assert.rejects(
    f.api.saveService(f.input({ washerId: "w2" }), "s", false),
    /cerrada/,
  );
  assert.equal(f.get("services/s").washerId, "w1");
});
test("legacy paid services support metadata but cannot silently change historical money", async () => {
  const f = fixture();
  f.docs.set("services/s", {
    washerId: "w1",
    paymentStatus: "paid",
    financials: {
      totalPrice: 20,
      paymentMethod: "Efectivo",
      tipAmount: 0,
      tipMethod: null,
      commissionRate: 0.25,
    },
  });
  await f.api.saveService(f.input({ clientName: "Corrección" }), "s", false);
  await assert.rejects(
    f.api.saveService(f.input({ servicePrice: 30 }), "s", false),
    /anterior/,
  );
  await assert.rejects(f.api.cancelService("s", "Error"), /histórico/);
  assert.equal(f.movements("cashMovements").length, 0);
});
test("legacy pending can be collected into a new cash session", async () => {
  const f = fixture();
  f.docs.set("services/s", {
    washerId: "w1",
    paymentStatus: "pending",
    financials: {
      totalPrice: 20,
      paymentMethod: "Pendiente",
      commissionRate: 0.35,
    },
  });
  await f.api.openCash(0, "c");
  await f.api.saveService(f.input(), "s", false);
  assert.equal(f.get("services/s").financials.commissionRate, 0.35);
  assert.equal(f.get("cashSessions/c").receipts, 20);
});
test("stock receive/adjust is traceable, idempotent and rejects negative stock", async () => {
  const f = fixture();
  await f.api.changeStock("p1", 5, "receive", "Proveedor", "m1");
  await f.api.changeStock("p1", 5, "receive", "Proveedor", "m1");
  await f.api.changeStock("p1", -2, "adjust", "Merma", "m2");
  assert.equal(f.get("products/p1").stock, 13);
  await assert.rejects(
    f.api.changeStock("p1", -14, "adjust", "Merma", "m3"),
    /negativo/,
  );
  assert.equal(f.get("products/p1").stock, 13);
  assert.equal(f.movements("inventoryMovements").length, 2);
});
test("catalog edits never overwrite stock; new products start at zero", async () => {
  const f = fixture();
  const data = {
    name: "Agua",
    sku: "A",
    category: "Bebidas",
    unit: "unidad",
    cost: 1,
    price: 3,
    minimum: 2,
    active: true,
  };
  await f.api.saveProduct(data, "p1");
  assert.equal(f.get("products/p1").stock, 10);
  await f.api.saveProduct({ ...data, sku: "C" }, "p3");
  assert.equal(f.get("products/p3").stock, 0);
});
test("expense, withdrawal, income and retry affect balances correctly", async () => {
  const f = fixture();
  await f.api.openCash(10, "c");
  await f.api.cashMove(3, "Efectivo", "expense", "Limpieza", "m1");
  await f.api.cashMove(3, "Efectivo", "expense", "Limpieza", "m1");
  await f.api.cashMove(2, "Efectivo", "withdrawal", "Propina Ana", "m2");
  await f.api.cashMove(1, "Efectivo", "income", "Fondo adicional", "m3");
  assert.equal(f.get("cashSessions/c").balances.Efectivo, 6);
  assert.equal(f.get("cashSessions/c").expenses, 3);
  await assert.rejects(
    f.api.cashMove(7, "Efectivo", "expense", "Salida", "m4"),
    /no alcanza/,
  );
});
test("inactive products cannot be sold, but pending reservations can be returned", async () => {
  const f = fixture();
  await f.api.saveService(
    f.input({
      paymentStatus: "pending",
      cart: [{ productId: "p1", quantity: 2 }],
    }),
    "s",
    true,
  );
  f.docs.set("products/p1", { ...f.get("products/p1"), active: false });
  await f.api.openCash(0, "c");
  await assert.rejects(
    f.api.sell([{ productId: "p1", quantity: 1 }], "Efectivo", "sale"),
    /inactivo/,
  );
  await f.api.cancelService("s", "Error");
  assert.equal(f.get("products/p1").stock, 10);
});
test("reject invalid prices, quantities, methods and nonfinite cash values", async () => {
  const f = fixture();
  await assert.rejects(f.api.openCash(NaN, "c"), /número/);
  await f.api.openCash(0, "c");
  await assert.rejects(
    f.api.sell([{ productId: "p1", quantity: 1 }], "Pendiente", "sale"),
    /método/,
  );
  await assert.rejects(
    f.api.sell([{ productId: "p1", quantity: 1.5 }], "Efectivo", "sale"),
    /entero/,
  );
  await assert.rejects(
    f.api.saveService(f.input({ servicePrice: -1 }), "s", true),
    /número/,
  );
});
test("refund without sufficient physical cash rolls back stock and cancellation", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await f.api.sell([{ productId: "p1", quantity: 2 }], "Efectivo", "a");
  await f.api.cashMove(4, "Efectivo", "withdrawal", "Entrega", "m");
  await assert.rejects(f.api.cancelSale("a", "Error"), /no alcanza/);
  assert.equal(f.get("products/p1").stock, 8);
  assert.equal(f.get("sales/a").status, "paid");
});
test("product SKU uniqueness is atomic and changing code releases the old code", async () => {
  const f = fixture();
  const data = {
    name: "Agua",
    sku: "SKU",
    category: "Bebidas",
    unit: "unidad",
    cost: 1,
    price: 3,
    minimum: 0,
    active: true,
  };
  const r = await Promise.allSettled([
    f.api.saveProduct(data, "a"),
    f.api.saveProduct({ ...data, sku: "sku" }, "b"),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  await f.api.saveProduct({ ...data, sku: "NEW" }, "a");
  await f.api.saveProduct(data, "b");
  assert.equal(f.get("productCodes/SKU").productId, "b");
});

test("incomplete cash document cannot change stock, receipts or close the session", async () => {
  const f = fixture();
  const legacy = {
    status: "open",
    openedAt: { seconds: 1000 },
    openingAmount: 10,
  };
  f.docs.set("cashSessions/legacy", legacy);
  f.docs.set("cashControl/current", { sessionId: "legacy" });
  await assert.rejects(
    f.api.sell([{ productId: "p1", quantity: 1 }], "Efectivo", "bad-sale"),
    /anterior o incompleto/,
  );
  await assert.rejects(
    f.api.cashMove(1, "Efectivo", "expense", "Gasto", "bad-move"),
    /anterior o incompleto/,
  );
  await assert.rejects(
    f.api.closeCash("legacy", 10, ""),
    /anterior o incompleto/,
  );
  await assert.rejects(f.api.openCash(0, "another"), /anterior o incompleto/);
  assert.deepEqual(f.get("cashSessions/legacy"), legacy);
  assert.equal(f.get("products/p1").stock, 10);
  assert.equal(f.movements("cashMovements").length, 0);
});

test("cash data validation rejects missing, partial, null and nonnumeric balances without inventing zeros", () => {
  const {
    cashSessionProblem,
    isCashSession,
  } = require("../.test-build/operations/model.js");
  const valid = {
    id: "c",
    status: "open",
    openingAmount: 0,
    receipts: 0,
    tips: 0,
    expenses: 0,
    balances: { Efectivo: 0, Yappy: 0, Tarjeta: 0, Transferencia: 0 },
  };
  assert.equal(isCashSession(valid), true);
  for (const balances of [
    undefined,
    null,
    {},
    { ...valid.balances, Efectivo: "10" },
    { ...valid.balances, Efectivo: NaN },
  ]) {
    assert.equal(isCashSession({ ...valid, balances }), false);
    assert.equal(typeof cashSessionProblem({ ...valid, balances }), "string");
  }
  assert.equal(isCashSession({ ...valid, receipts: undefined }), false);
  assert.equal(isCashSession({ ...valid, countedAmount: "10" }), false);
});

const legacyRecord = () => ({initialAmount: 0, isOpen: true, observations: "Original", openedAt: {seconds: 50}, responsible: "Jhon"});
test("legacy close preserves original data without inventing balances or moving money", async () => {
  const f = fixture();
  f.docs.set("cashSessions/old", legacyRecord());
  f.docs.set("cashControl/current", {sessionId: "old"});
  await assert.rejects(f.api.closeLegacyCash("old", 25, ""));
  assert.equal(f.get("cashSessions/old").isOpen, true);
  await f.api.closeLegacyCash("old", 25, "Jhon: revisión del efectivo" );
  const closed = f.get("cashSessions/old");
  for (const field of ["initialAmount", "observations", "openedAt", "responsible"])
    assert.deepEqual(closed[field], legacyRecord()[field]);
  assert.equal(closed.isOpen, false);
  assert.equal(closed.status, "closed");
  assert.equal(closed.legacyClosure.countedCash, 25);
  assert.equal(closed.legacyClosure.expectedBalanceKnown, false);
  assert.equal(closed.balances, undefined);
  assert.equal(closed.difference, undefined);
  assert.equal(f.movements("cashMovements").length, 0);
  await f.api.openCash(20, "new");
  await f.api.closeLegacyCash("old", 99, "Repeat");
  assert.equal(f.get("cashControl/current").sessionId, "new");
  assert.equal(f.get("cashSessions/old").legacyClosure.countedCash, 25);
  assert.equal(f.get("cashSessions/new").balances.Efectivo, 20);
});
test("legacy close rejects unknown shapes and modern sessions without changing their data", async () => {
  const f = fixture();
  f.docs.set("cashSessions/bad", {isOpen: true, initialAmount: 0});
  await assert.rejects(f.api.closeLegacyCash("bad", 0, "Review"));
  await f.api.openCash(10, "new");
  await assert.rejects(f.api.closeLegacyCash("new", 10, "Review"));
  assert.equal(f.get("cashSessions/new").status, "open");
});


test("cash movement snapshots remain ordered and immutable through concurrent withdrawals and retries", async () => {
  const f=fixture();await f.api.openCash(12,"c");
  await Promise.all([f.api.cashMove(5,"Efectivo","withdrawal","Propinas","p"),f.api.cashMove(2,"Efectivo","expense","Gasto","e")]);
  await f.api.cashMove(5,"Efectivo","withdrawal","Propinas","p");
  const rows=f.movements("cashMovements").sort((a,b)=>a.sequence-b.sequence);
  assert.deepEqual(rows.map(r=>r.sequence),[1,2,3]);
  assert.equal(rows[1].balancesBefore.Efectivo,12);assert.equal(rows[1].balancesAfter.Efectivo,7);
  assert.equal(rows[2].balancesBefore.Efectivo,7);assert.equal(rows[2].balancesAfter.Efectivo,5);
  assert.equal(f.get("cashSessions/c").movementSequence,3);
});

test('split product sale settles and refunds each method exactly once, stock and cash roll back on mismatch', async()=>{
 const f=fixture();await f.api.openCash(10,'c');
 await assert.rejects(f.api.sell([{productId:'p1',quantity:2}],[{method:'Efectivo',amount:1},{method:'Yappy',amount:2}],'bad'),/suma/);
 assert.equal(f.get('products/p1').stock,10);assert.equal(f.get('cashSessions/c').balances.Efectivo,10);
 const parts=[{method:'Yappy',amount:2},{method:'Efectivo',amount:2}];
 await f.api.sell([{productId:'p1',quantity:2}],parts,'mixed');await f.api.sell([{productId:'p1',quantity:2}],parts,'mixed');
 assert.equal(f.get('cashSessions/c').balances.Efectivo,12);assert.equal(f.get('cashSessions/c').balances.Yappy,2);assert.equal(f.get('cashSessions/c').receipts,4);assert.equal(f.get('products/p1').stock,8);
 assert.equal(f.get('sales/mixed').paymentMethod,'Mixto');assert.equal(f.movements('cashMovements').filter(row=>row.kind==='sale').length,2);
 await f.api.cancelSale('mixed','Anular');await f.api.cancelSale('mixed','Reintento');assert.equal(f.get('cashSessions/c').balances.Efectivo,10);assert.equal(f.get('cashSessions/c').balances.Yappy,0);assert.equal(f.get('products/p1').stock,10);
});
test('mixed service payments correct allocations, preserve independent tips and reverse original methods on cancellation',async()=>{
 const f=fixture();await f.api.openCash(30,'c');const input=f.input({paymentMethod:'Mixto',payments:[{method:'Efectivo',amount:10},{method:'Yappy',amount:10}],tipAmount:3,tipMethod:'Tarjeta'});
 await f.api.saveService(input,'s',true);assert.equal(f.get('cashSessions/c').balances.Efectivo,40);assert.equal(f.get('cashSessions/c').balances.Yappy,10);assert.equal(f.get('cashSessions/c').balances.Tarjeta,3);
 const changed={...input,payments:[{method:'Efectivo',amount:5},{method:'Yappy',amount:15}]};await f.api.saveService(changed,'s',false);await f.api.saveService(changed,'s',false);
 assert.equal(f.get('cashSessions/c').balances.Efectivo,35);assert.equal(f.get('cashSessions/c').balances.Yappy,15);assert.equal(f.get('cashSessions/c').balances.Tarjeta,3);assert.equal(f.get('cashSessions/c').receipts,20);
 await f.api.cancelService('s','Anular');assert.equal(f.get('cashSessions/c').balances.Efectivo,30);assert.equal(f.get('cashSessions/c').balances.Yappy,0);assert.equal(f.get('cashSessions/c').balances.Tarjeta,0);
});
test('payment allocation validates methods, finite positive amounts and exact cents, and closed cash blocks redistribution',async()=>{
 const {paymentParts}=require('../.test-build/operations/model.js');
 for(const parts of [[],[{method:'BTC',amount:20}],[{method:'Efectivo',amount:-20}],[{method:'Efectivo',amount:NaN}],[{method:'Efectivo',amount:19.99}],[{method:'Efectivo',amount:0},{method:'Yappy',amount:20}]])assert.throws(()=>paymentParts(20,'Mixto',parts));
 assert.deepEqual(paymentParts(.3,'Mixto',[{method:'Efectivo',amount:.1},{method:'Yappy',amount:.2}]),[{method:'Efectivo',amount:.1},{method:'Yappy',amount:.2}]);
 const f=fixture();await f.api.openCash(0,'c');const input=f.input({paymentMethod:'Mixto',payments:[{method:'Efectivo',amount:10},{method:'Yappy',amount:10}]});await f.api.saveService(input,'s',true);await f.api.closeCash('c',10,'');await f.api.openCash(0,'new');await assert.rejects(f.api.saveService({...input,payments:[{method:'Efectivo',amount:5},{method:'Yappy',amount:15}]},'s',false),/cerrada/);
});
test('catalog selections sum overridden vehicle prices without changing catalog; snapshots survive catalog edits and deactivation',async()=>{
 const f=fixture();await f.api.saveCatalogService('wash',{name:'Lavado',price:15,active:true});await f.api.saveCatalogService('wax',{name:'Cera',price:10,active:true});await f.api.openCash(0,'c');
 await f.api.saveService(f.input({servicePrice:999,serviceItems:[{catalogId:'wash',unitPrice:12},{catalogId:'wax',unitPrice:8}],cart:[{productId:'p1',quantity:1}],paymentMethod:'Mixto',payments:[{method:'Efectivo',amount:10},{method:'Yappy',amount:12}]}),'s',true);
 const service=f.get('services/s');assert.equal(service.financials.servicePrice,20);assert.equal(service.financials.totalPrice,22);assert.equal(service.financials.washerEarnings,5);assert.equal(f.get('serviceCatalog/wash').price,15);assert.equal(service.serviceItems[0].basePrice,15);
 await f.api.saveCatalogService('wash',{name:'Lavado nuevo',price:30,active:false});
 await f.api.saveService(f.input({servicePrice:999,serviceItems:[{catalogId:'wash',unitPrice:11},{catalogId:'wax',unitPrice:8}],cart:[{productId:'p1',quantity:1}],paymentMethod:'Mixto',payments:[{method:'Efectivo',amount:10},{method:'Yappy',amount:11}]}),'s',false);
 assert.equal(f.get('services/s').serviceItems[0].name,'Lavado');assert.equal(f.get('services/s').serviceItems[0].basePrice,15);assert.equal(f.get('services/s').financials.totalPrice,21);assert.equal(f.get('serviceCatalog/wash').price,30);
 await assert.rejects(f.api.saveService(f.input({serviceItems:[{catalogId:'wash',unitPrice:11}]}),'new',true),/activo/);
});
test('pending catalog services collect once and invalid selection or price never touches stock or cash',async()=>{
 const f=fixture();await f.api.saveCatalogService('wash',{name:'Lavado',price:15,active:true});
 await f.api.saveService(f.input({paymentStatus:'pending',serviceItems:[{catalogId:'wash',unitPrice:12}]}),'s',true);assert.equal(f.get('services/s').financials.totalPrice,12);
 await f.api.openCash(10,'c');await f.api.saveService(f.input({serviceItems:[{catalogId:'wash',unitPrice:12}],paymentMethod:'Mixto',payments:[{method:'Efectivo',amount:6},{method:'Yappy',amount:6}]}),'s',false);assert.equal(f.get('cashSessions/c').receipts,12);
 for(const serviceItems of [[{catalogId:'missing',unitPrice:1}],[{catalogId:'wash',unitPrice:-1}],[{catalogId:'wash',unitPrice:1},{catalogId:'wash',unitPrice:1}]])await assert.rejects(f.api.saveService(f.input({serviceItems,cart:[{productId:'p1',quantity:1}]}),'bad',true));
 assert.equal(f.get('products/p1').stock,10);assert.equal(f.get('cashSessions/c').receipts,12);await f.api.closeCash('c',16,'');await f.api.openCash(0,'new');await assert.rejects(f.api.saveService(f.input({serviceItems:[{catalogId:'wash',unitPrice:13}]}),'s',false),/cerrada/);
});
