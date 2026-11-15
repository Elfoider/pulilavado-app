const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createOperations } = require("../.test-build/operations/core");
const { evaluate, planRepair } = require("../scripts/reparar-vale-borrado.cjs");
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") throw Error("Use el emulador local.");
const app = initializeApp({ projectId: "demo-pulilavado-corrections" });
const db = getFirestore(app);
const operations = createOperations(work => db.runTransaction(tx => work({
  async get(path) { return (await tx.get(db.doc(path))).data(); },
  set(path, data, merge = false) { tx.set(db.doc(path), Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), { merge }); },
})), FieldValue.serverTimestamp, () => db.collection("cashMovements").doc().id);
const cash = db.doc("cashSessions/reparacion-demo");
const preview = () => db.runTransaction(tx => evaluate(db, tx), { readOnly: true });
const apply = code => db.runTransaction(tx => evaluate(db, tx, code));
async function main() {
  await db.doc("washers/demo").set({ name: "Demo", active: true });
  await operations.openCash(100, cash.id);
  await operations.registerAdvance("demo", 5, "Vale real", "real");
  await operations.registerAdvance("demo", 5, "Vale duplicado", "duplicado");
  const source = (await db.collection("cashMovements").where("referenceId", "==", "duplicado").get()).docs[0];
  await source.ref.delete();
  await assert.rejects(preview(), /No coinciden los vales/);
  await db.doc("cashAdvances/duplicado").delete();
  const tail = await preview();
  assert.equal(tail.efectivoAntes, 90);
  assert.equal(tail.efectivoDespues, 95);
  assert.equal((await cash.get()).data().expenses, 10);
  await operations.cashMove(7, "Efectivo", "expense", "Gasto posterior", "gasto");
  await assert.rejects(apply(tail.codigoDeConfirmacion), /Cambió la caja/);
  const middle = await preview();
  assert.equal(middle.missingSequence, 3);
  assert.equal(middle.efectivoAntes, 83);
  assert.equal(middle.efectivoDespues, 88);
  assert.equal(middle.gastosDespues, 12);
  const after = await apply(middle.codigoDeConfirmacion);
  assert.equal(after.aplicado, true);
  assert.equal((await cash.get()).data().balances.Efectivo, 88);
  assert.equal((await cash.get()).data().expenses, 12);
  assert.equal((await cash.collection("repairs").get()).size, 1);
  assert.equal((await db.doc("cashAdvances/real").get()).data().amount, 5);
  assert.equal((await db.doc("cashMovements/gasto").get()).data().amount, -7);
  await assert.rejects(apply(middle.codigoDeConfirmacion));
  assert.throws(() => planRepair({ status: "closed" }, [], []), /debe estar abierta/);
  console.log("PASS: no unmatched advances, exact five-dollar gap, read-only preview, stale preview rejected, recorded once.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.terminate(); await deleteApp(app); });
