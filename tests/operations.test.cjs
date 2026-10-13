const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createOperations } = require("../.test-build/core.js");
const { commission, money, quantities } = require("../.test-build/model.js");

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
        async readTipBalances(sessionId) {
          const values = { Efectivo: 0, Yappy: 0, Tarjeta: 0, Transferencia: 0 };
          for (const [path, row] of docs) if (path.startsWith("cashMovements/") && row.sessionId === sessionId && row.kind.endsWith("_tip")) values[row.method] += row.amount;
          return values;
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
      for (const [path, data] of staged) docs.set(path, data);
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
  } = require("../.test-build/model.js");
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


test("cash tips are recorded separately and excluded from counted difference and available withdrawals", async () => {
  const f = fixture(); await f.api.openCash(10, "c");
  await f.api.saveService(f.input({tipAmount: 3,tipMethod: "Efectivo"}),"s",true);
  assert.equal(f.get("cashSessions/c").balances.Efectivo,33);
  assert.equal(f.get("cashSessions/c").tipsByMethod.Efectivo,3);
  await assert.rejects(f.api.cashMove(31,"Efectivo","withdrawal","Excess","m"),/no alcanza/);
  await f.api.closeCash("c",30,"");
  const c=f.get("cashSessions/c"); assert.equal(c.expectedCash,30);assert.equal(c.difference,0);assert.equal(c.cashCountExcludesTips,true);
});
test("digital tips never reduce expected cash and corrections/refunds keep tip buckets consistent", async () => {
  const f=fixture(); await f.api.openCash(0,"c");
  await f.api.saveService(f.input({tipAmount:4,tipMethod:"Yappy"}),"s",true);
  await f.api.saveService(f.input({tipAmount:2,tipMethod:"Efectivo"}),"s",false);
  const c=f.get("cashSessions/c");assert.equal(c.tipsByMethod.Yappy,0);assert.equal(c.tipsByMethod.Efectivo,2);
  const {cashBusinessBalances}=require("../.test-build/model.js");
  assert.equal(cashBusinessBalances(c).Efectivo,20);assert.equal(cashBusinessBalances(c).Yappy,0);
  await f.api.cancelService("s","Error");assert.equal(f.get("cashSessions/c").tips,0);assert.equal(f.get("cashSessions/c").tipsByMethod.Efectivo,0);
});
test("existing open sessions derive exact tip methods from ledger without changing totals or closed history", async () => {
  const f=fixture();await f.api.openCash(10,"c");
  await f.api.saveService(f.input({tipAmount:3,tipMethod:"Efectivo"}),"s",true);
  const old=structuredClone(f.get("cashSessions/c"));delete old.tipsByMethod;f.docs.set("cashSessions/c",old);
  await f.api.prepareCashSession("c");
  assert.equal(f.get("cashSessions/c").balances.Efectivo,33);assert.equal(f.get("cashSessions/c").tipsByMethod.Efectivo,3);
  await f.api.closeCash("c",30,"");assert.equal(f.get("cashSessions/c").difference,0);
  const closed=structuredClone(f.get("cashSessions/c"));await assert.rejects(f.api.prepareCashSession("c"));assert.deepEqual(f.get("cashSessions/c"),closed);
});

test("each cash movement stores method and cash before/after atomically, excluding tips", async () => {
  const f=fixture();await f.api.openCash(10,"c");
  await f.api.saveService(f.input({tipAmount:3,tipMethod:"Efectivo"}),"s",true);
  await f.api.cashMove(5,"Efectivo","expense","Insumos","g");
  await f.api.sell([{productId:"p1",quantity:1}],"Yappy","v");
  const rows=f.movements("cashMovements");
  assert.deepEqual(rows.map(m=>[m.sequence,m.balanceBefore,m.balanceAfter,m.cashBefore,m.cashAfter,m.businessEffect]),[
    [1,0,10,0,10,10],[2,10,30,10,30,20],[3,30,30,30,30,0],[4,30,25,30,25,-5],[5,0,2,25,25,2],
  ]);
  await f.api.cashMove(5,"Efectivo","expense","Insumos","g");
  assert.equal(f.movements("cashMovements").length,5);
  assert.equal(f.get("cashSessions/c").movementSequence,5);
});
test("concurrent movements preserve a single balance chain and reversal snapshots", async () => {
  const f=fixture();await f.api.openCash(10,"c");
  await Promise.all([f.api.cashMove(2,"Efectivo","income","A","a"),f.api.cashMove(3,"Efectivo","income","B","b")]);
  await f.api.sell([{productId:"p1",quantity:1}],"Efectivo","s");
  await f.api.cancelSale("s","Error");
  const rows=f.movements("cashMovements");
  for(let i=1;i<rows.length;i++){assert.equal(rows[i].cashBefore,rows[i-1].cashAfter);assert.equal(rows[i].sequence,rows[i-1].sequence+1);}
  const refund=rows.at(-1);assert.equal(refund.cashBefore,17);assert.equal(refund.cashAfter,15);assert.equal(refund.businessEffect,-2);
});
