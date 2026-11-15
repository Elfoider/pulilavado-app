const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createOperations } = require("../.test-build/operations/core.js");
const { correctCashMovement, parseCashCorrection } = require("../.test-build/operations/cash-correction.js");
const { detailMovements, movementLabel, summarizePeriodCash } = require("../.test-build/reports/cash.js");
const { summarizeTreasury } = require("../.test-build/reports/treasury.js");

function fixture() {
  const docs = new Map([["washers/ana", { name: "Ana", active: true }]]);
  let counter = 0, serial = Promise.resolve();
  const atomic = work => {
    const job = serial.then(async () => {
      const changes = [];
      const result = await work({
        async get(path) { assert.equal(changes.length, 0, "all reads before writes"); return structuredClone(docs.get(path)); },
        set(path, data, merge) { changes.push([path, data, merge]); },
      });
      for (const [path, data, merge] of changes) docs.set(path, { ...(merge ? docs.get(path) : {}), ...structuredClone(data) });
      return result;
    });
    serial = job.catch(() => {});
    return job;
  };
  const date = new Date("2026-11-15T15:00:00Z");
  const stamp = () => ({ seconds: date.getTime() / 1000 });
  const id = () => "m-" + (++counter);
  const operations = createOperations(atomic, stamp, id, () => date);
  const list = prefix => [...docs].filter(([key]) => key.startsWith(prefix + "/")).map(([key, data]) => ({ ...data, id: key.split("/")[1] }));
  const correct = input => correctCashMovement(atomic, stamp, id, input);
  return { docs, list, operations, correct, session: () => docs.get("cashSessions/c") };
}
const voidInput = movementId => ({ movementId, mode: "void", reason: "Registro duplicado" });

test("voiding one duplicate restores cash and excludes only that advance, retaining auditable history", async () => {
  const f = fixture();
  await f.operations.openCash(100, "c");
  await f.operations.registerAdvance("ana", 20, "Adelanto", "valid");
  await f.operations.registerAdvance("ana", 20, "Adelanto", "duplicate");
  const original = f.list("cashMovements").find(m => m.referenceId === "duplicate");
  const before = f.docs.get("cashAdvances/duplicate");
  const [result, retry] = await Promise.all([f.correct(voidInput(original.id)), f.correct(voidInput(original.id))]);
  assert.deepEqual(result, retry);
  assert.equal(f.session().balances.Efectivo, 80);
  assert.equal(f.session().expenses, 20);
  assert.equal(f.docs.get("treasuryControl/current").revision, 3);
  assert.deepEqual(f.docs.get("cashAdvances/valid").amount, 20);
  assert.equal(f.docs.get("cashAdvances/duplicate").amount, before.amount);
  assert.equal(f.docs.get("cashAdvances/duplicate").correctedAmount, 0);
  const originalAfter = f.docs.get("cashMovements/" + original.id);
  assert.equal(originalAfter.amount, -20);
  assert.match(movementLabel({ ...originalAfter, id: original.id }), /Anulado/);
  const adjustment = f.docs.get("cashMovements/" + result.adjustmentId);
  assert.equal(adjustment.amount, 20);
  assert.equal(adjustment.correctsMovementId, original.id);
  assert.equal(adjustment.balancesBefore.Efectivo, 60);
  assert.equal(adjustment.balancesAfter.Efectivo, 80);
  const audit = f.docs.get("cashCorrections/" + original.id);
  assert.equal(audit.reason, "Registro duplicado");
  assert.equal(audit.originalAmount, 20);
  assert.equal(audit.newAmount, 0);
  const rows = f.list("cashMovements");
  const period = summarizePeriodCash(detailMovements(rows, f.session()));
  assert.equal(period.outgoing, 20);
  assert.equal(period.reconciled, true);
  const weekly = summarizeTreasury("2026-11-15", rows, [], [], f.list("cashAdvances"));
  assert.equal(weekly.advances, 20);
  assert.equal(weekly.cashOutgoings, 20);
  assert.deepEqual(weekly.advanceRows.map(row => row.id), ["valid"]);
  await assert.rejects(f.correct({ ...voidInput(original.id), reason: "Otro motivo" }), /ya fue corregido/);
  await assert.rejects(f.correct(voidInput(result.adjustmentId)), /no admite/);
});

test("manual amount corrections use the original method and hold off on insufficient cash", async () => {
  const f = fixture();
  await f.operations.openCash(20, "c");
  await f.operations.cashMove(12, "Efectivo", "expense", "Compra", "expense");
  const request = { movementId: "expense", mode: "amount", amount: 22, reason: "Monto real" };
  await assert.rejects(f.correct(request), /saldo de caja incompatible/);
  assert.equal(f.session().balances.Efectivo, 8);
  assert.equal(f.list("cashCorrections").length, 0);
  await f.correct({ ...request, amount: 6 });
  assert.equal(f.session().balances.Efectivo, 14);
  assert.equal(f.session().expenses, 6);
  await f.operations.cashMove(25, "Yappy", "income", "Fondo", "extra");
  await f.correct(voidInput("extra"));
  assert.equal(f.session().balances.Yappy, 0);
  assert.equal(f.session().balances.Efectivo, 14);
});

test("closed boxes and inconsistent linked advances are not altered", async () => {
  const f = fixture();
  await f.operations.openCash(100, "c");
  await f.operations.registerAdvance("ana", 20, "Adelanto", "bad");
  f.docs.get("cashAdvances/bad").amount = 30;
  const original = f.list("cashMovements").find(m => m.referenceId === "bad");
  await assert.rejects(f.correct(voidInput(original.id)), /no coincide/);
  f.docs.get("cashSessions/c").status = "closed";
  await assert.rejects(f.correct(voidInput(original.id)), /caja abierta/);
  assert.equal(f.list("cashCorrections").length, 0);
  assert.equal(f.session().balances.Efectivo, 80);
  assert.throws(() => parseCashCorrection({ ...voidInput("../other") }), /válidos/);
  assert.throws(() => parseCashCorrection({ ...voidInput(original.id), mode: "amount", amount: 3.123 }), /decimales/);
});
