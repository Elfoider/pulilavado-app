const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createOperations } = require("../.test-build/operations/core.js");
const {
  businessDay,
  weekOf,
  addDays,
  dayStart,
  netPayroll,
  isEnvelope,
} = require("../.test-build/operations/treasury-model.js");
const { summarizeTreasury } = require("../.test-build/reports/treasury.js");
function fixture() {
  let current = new Date("2026-10-27T16:00:00Z"),
    count = 0,
    tail = Promise.resolve();
  const docs = new Map([
    ["washers/a", { name: "Ana", active: true }],
    ["washers/b", { name: "Luis", active: true }],
    ["washers/inactive", { name: "Inactivo", active: false }],
  ]);
  const atomic = (work) => {
    const run = tail.then(async () => {
      let writing = false;
      const writes = new Map();
      const result = await work({
        get: async (p) => {
          assert.equal(writing, false, "All reads before writes");
          return docs.has(p) ? structuredClone(docs.get(p)) : undefined;
        },
        set: (p, v, merge = false) => {
          writing = true;
          writes.set(
            p,
            merge
              ? {
                  ...(writes.get(p) ?? docs.get(p) ?? {}),
                  ...structuredClone(v),
                }
              : structuredClone(v),
          );
        },
      });
      for (const [p, v] of writes) docs.set(p, v);
      return result;
    });
    tail = run.catch(() => {});
    return run;
  };
  const api = createOperations(
    atomic,
    () => ({
      seconds: Math.floor(current.getTime() / 1000),
      nanoseconds: count,
    }),
    () => `auto-${++count}`,
    () => current,
  );
  const rows = (path) =>
    [...docs]
      .filter(([key]) => key.startsWith(path + "/"))
      .map(([key, v]) => ({ ...v, id: key.split("/")[1] }));
  const week = (anchor) => {
    const start = weekOf(anchor),
      first = dayStart(start).getTime() / 1000,
      last = dayStart(addDays(start, 7)).getTime() / 1000;
    const dated = (path) =>
      rows(path).filter(
        (r) => r.createdAt.seconds >= first && r.createdAt.seconds < last,
      );
    return summarizeTreasury(
      anchor,
      dated("cashMovements"),
      rows("cashEnvelopes").filter((e) => e.weekStart === start),
      dated("envelopeMovements"),
      dated("cashAdvances"),
    );
  };
  return {
    api,
    docs,
    rows,
    week,
    setDay: (day) => {
      current = new Date(day + "T16:00:00Z");
    },
  };
}
test("Tuesday week boundaries are fixed in business time, including month/year and UTC midnight", () => {
  assert.equal(weekOf("2026-10-27"), "2026-10-27");
  assert.equal(weekOf("2026-11-02"), "2026-10-27");
  assert.equal(weekOf("2026-11-03"), "2026-11-03");
  assert.equal(weekOf("2027-01-04"), "2026-12-29");
  assert.equal(businessDay(new Date("2026-10-28T02:00:00Z")), "2026-10-27");
  assert.equal(
    dayStart("2026-10-27").toISOString(),
    "2026-10-27T04:00:00.000Z",
  );
  assert.throws(() => weekOf("2026-02-31"));
});
test("a $20 advance reduces cash, links washer identity, snapshots states and retries once", async () => {
  const f = fixture();
  await f.api.openCash(100, "c");
  await f.api.registerAdvance("a", 20, "Adelanto semanal", "v1");
  await f.api.registerAdvance("a", 20, "Adelanto semanal", "v1");
  assert.equal(f.docs.get("cashSessions/c").balances.Efectivo, 80);
  assert.equal(f.docs.get("cashSessions/c").expenses, 20);
  assert.equal(f.rows("cashAdvances").length, 1);
  const m = f.rows("cashMovements").find((m) => m.kind === "payroll_advance");
  assert.equal(m.washerId, "a");
  assert.equal(m.balancesBefore.Efectivo, 100);
  assert.equal(m.balancesAfter.Efectivo, 80);
  assert.deepEqual(netPayroll(100, 20), { pay: 80, excess: 0 });
  assert.equal(f.week("2026-10-27").advances, 20);
  await assert.rejects(
    f.api.registerAdvance("b", 20, "Duplicado", "v1"),
    /otros datos/,
  );
});
test("invalid and unaffordable advances roll back all cash and payroll data", async () => {
  const f = fixture();
  await assert.rejects(
    f.api.registerAdvance("a", 20, "Adelanto", "v0"),
    /Abra la caja/,
  );
  await f.api.openCash(10, "c");
  for (const args of [
    ["inactive", 5, "No activo", "x"],
    ["missing", 5, "No existe", "y"],
    ["a", 11, "No alcanza", "z"],
    ["a", NaN, "NaN", "nan"],
    ["a", 0, "Cero", "zero"],
  ])
    await assert.rejects(f.api.registerAdvance(...args));
  assert.equal(f.docs.get("cashSessions/c").balances.Efectivo, 10);
  assert.equal(f.rows("cashAdvances").length, 0);
});
test("deposit preserves initial fund, transfers $80 into a daily envelope and is idempotent", async () => {
  const f = fixture();
  await f.api.openCash(65, "c");
  await f.api.cashMove(100, "Efectivo", "income", "Ingresos de prueba", "fund");
  await f.api.registerAdvance("a", 20, "Vale", "v");
  await f.api.depositEnvelope(80, "Guardado martes", "d");
  await f.api.depositEnvelope(80, "Guardado martes", "d");
  assert.equal(f.docs.get("cashSessions/c").balances.Efectivo, 65);
  const e = f.docs.get("cashEnvelopes/2026-10-27");
  assert.equal(e.balance, 80);
  assert.ok(isEnvelope(e));
  assert.equal(f.rows("envelopeMovements").length, 1);
  await assert.rejects(
    f.api.depositEnvelope(1, "Usar fondo", "d2"),
    /fondo inicial/,
  );
});
test("refill from an envelope changes custody, not earnings; later expense is counted exactly once", async () => {
  const f = fixture();
  await f.api.openCash(0, "c");
  await f.api.cashMove(100, "Efectivo", "income", "Fondo", "fund");
  await f.api.depositEnvelope(100, "Guardar", "d");
  const initial = f.week("2026-10-27").netGenerated;
  await f.api.withdrawEnvelope(
    "2026-10-27",
    20,
    "to_cash",
    "Caja sin efectivo",
    "r",
  );
  await f.api.withdrawEnvelope(
    "2026-10-27",
    20,
    "to_cash",
    "Caja sin efectivo",
    "r",
  );
  assert.equal(f.docs.get("cashSessions/c").balances.Efectivo, 20);
  assert.equal(f.docs.get("cashEnvelopes/2026-10-27").balance, 80);
  assert.equal(f.week("2026-10-27").netGenerated, initial);
  await f.api.cashMove(20, "Efectivo", "expense", "Compra", "expense");
  assert.equal(f.week("2026-10-27").netGenerated, initial - 20);
});
test("direct expense from an old envelope appears in the week of withdrawal and leaves cash untouched", async () => {
  const f = fixture();
  await f.api.initializeEnvelope("2026-10-20", 50, "Sobre existente", "init");
  await f.api.openCash(65, "c");
  await f.api.withdrawEnvelope("2026-10-20", 20, "expense", "Emergencia", "r");
  assert.equal(f.docs.get("cashSessions/c").balances.Efectivo, 65);
  assert.equal(f.docs.get("cashEnvelopes/2026-10-20").balance, 30);
  const w = f.week("2026-10-27");
  assert.equal(w.envelopeExpenses, 20);
  assert.equal(w.netGenerated, -20);
  assert.equal(
    w.envelopeMovements.find((m) => m.kind === "expense").envelopeDay,
    "2026-10-20",
  );
  assert.equal(w.envelopeBalance, 0);
});
test("concurrent envelope withdrawals cannot overspend and failed transfer with no cash does not touch envelope", async () => {
  const f = fixture();
  await f.api.initializeEnvelope("2026-10-27", 30, "Inicial", "init");
  await assert.rejects(
    f.api.withdrawEnvelope("2026-10-27", 20, "to_cash", "Sin caja", "r0"),
    /Abra la caja/,
  );
  assert.equal(f.docs.get("cashEnvelopes/2026-10-27").balance, 30);
  const result = await Promise.allSettled([
    f.api.withdrawEnvelope("2026-10-27", 20, "expense", "Compra A", "r1"),
    f.api.withdrawEnvelope("2026-10-27", 20, "expense", "Compra B", "r2"),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.docs.get("cashEnvelopes/2026-10-27").balance, 10);
});
test("initial envelopes are declared once without creating earnings or touching cash", async () => {
  const f = fixture();
  await f.api.openCash(65, "c");
  await f.api.initializeEnvelope("2026-10-27", 40, "Fuera de Caja", "init");
  await f.api.initializeEnvelope("2026-10-27", 40, "Fuera de Caja", "init");
  await assert.rejects(
    f.api.initializeEnvelope("2026-10-27", 40, "Duplicado", "other"),
    /ya existe/,
  );
  await assert.rejects(
    f.api.initializeEnvelope("2026-10-28", 40, "Futuro", "future"),
    /futura/,
  );
  assert.equal(f.week("2026-10-27").netGenerated, 0);
  assert.equal(f.week("2026-10-27").envelopeBalance, 40);
  assert.equal(f.docs.get("cashSessions/c").balances.Efectivo, 65);
});
test("advance in excess of commission stays visible, never a negative payment", () => {
  assert.deepEqual(netPayroll(5, 20), { pay: 0, excess: 15 });
  assert.deepEqual(netPayroll(20, 20), { pay: 0, excess: 0 });
});
test("invalid envelope balances and methods cannot silently invent or withdraw funds", async () => {
  const f = fixture();
  f.docs.set("cashEnvelopes/2026-10-27", {
    day: "2026-10-27",
    weekStart: "2026-10-27",
    balance: 20,
    deposited: 0,
    spent: 0,
    toCash: 0,
    revision: 1,
  });
  await assert.rejects(
    f.api.withdrawEnvelope("2026-10-27", 5, "expense", "Gasto", "r"),
    /incompatibles/,
  );
  assert.throws(
    () =>
      summarizeTreasury(
        "2026-10-27",
        [],
        [f.docs.get("cashEnvelopes/2026-10-27")],
        [],
        [],
      ),
    /incompatibles/,
  );
  await assert.rejects(
    f.api.withdrawEnvelope("2026-10-27", 5, "anything", "Gasto", "r2"),
    /destino/,
  );
});

test("full week: cash sales, advance, saving, final payroll and next-week emergency reconcile without double counting", async () => {
  const f = fixture();
  f.docs.set("settings/global", { defaultCommissionPercentage: 50 });
  await f.api.openCash(0, "c");
  await f.api.saveService(
    {
      clientName: "Prueba",
      clientPhone: "",
      vehicle: { model: "Auto", color: "Blanco", bay: "1" },
      washerId: "a",
      servicePrice: 100,
      paymentStatus: "paid",
      paymentMethod: "Efectivo",
      tipAmount: 0,
      tipMethod: "Efectivo",
      cart: [],
    },
    "service",
    true,
  );
  assert.equal(f.week("2026-10-27").netGenerated, 100);
  await f.api.registerAdvance("a", 20, "Vale", "v");
  assert.equal(f.week("2026-10-27").netGenerated, 80);
  await f.api.depositEnvelope(80, "Sobre martes", "d");
  assert.equal(f.week("2026-10-27").netGenerated, 80);
  const gross = f.docs.get("services/service").financials.washerEarnings;
  assert.equal(gross, 50);
  const remaining = netPayroll(gross, 20).pay;
  await f.api.withdrawEnvelope(
    "2026-10-27",
    remaining,
    "to_cash",
    "Pagar nómina",
    "r",
  );
  await f.api.cashMove(
    remaining,
    "Efectivo",
    "withdrawal",
    "Nómina neta",
    "pay",
  );
  assert.equal(f.week("2026-10-27").netGenerated, 50);
  assert.equal(f.week("2026-10-27").envelopeBalance, 50);
  await f.api.closeCash("c", 0, "Cierre");
  f.setDay("2026-11-03");
  await f.api.withdrawEnvelope(
    "2026-10-27",
    5,
    "expense",
    "Emergencia nueva semana",
    "emergency",
  );
  assert.equal(f.week("2026-11-03").netGenerated, -5);
  assert.equal(f.week("2026-10-27").netGenerated, 50);
  assert.equal(f.week("2026-10-27").envelopeBalance, 45);
});
