const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createOperations } = require("../.test-build/operations/core.js");

const projectId = "demo-pulilavado-corrections";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") throw new Error("Requires the local Firestore emulator.");
const app = initializeApp({ projectId });
const db = getFirestore(app);
const secret = randomBytes(24).toString("hex");
const url = "http://127.0.0.1:3114/api/cash/corrections";
const id = () => db.collection("cashMovements").doc().id;
const operations = createOperations(work => db.runTransaction(tx => work({
  async get(path) { return (await tx.get(db.doc(path))).data(); },
  set(path, data, merge = false) { tx.set(db.doc(path), Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), { merge }); },
})), FieldValue.serverTimestamp, id);
let server, logs = "";
async function run() {
  await db.doc("washers/ana").set({ name: "Ana", active: true });
  await operations.openCash(100, "test-session");
  await operations.registerAdvance("ana", 20, "Vale válido", "valid");
  await operations.registerAdvance("ana", 20, "Vale duplicado", "duplicate");
  const [row] = (await db.collection("cashMovements").where("referenceId", "==", "duplicate").get()).docs;
  assert.ok(row);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3114"], {
    env: { ...process.env, NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true", CASH_CORRECTION_SECRET: secret },
    detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", data => { logs += data; });
  server.stderr.on("data", data => { logs += data; });
  const post = key => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
    body: JSON.stringify({ movementId: row.id, mode: "void", reason: "Registro duplicado" }),
  });
  let response;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { response = await post(); break; } catch { if (server.exitCode !== null) break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(response?.status, 403);
  assert.equal((await post("0".repeat(48))).status, 403);
  assert.equal((await db.doc("cashSessions/test-session").get()).data().balances.Efectivo, 60);
  const results = await Promise.all([post(secret), post(secret)]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  const [first, second] = await Promise.all(results.map(r => r.json()));
  assert.deepEqual(first, second);
  assert.equal((await db.doc("cashSessions/test-session").get()).data().balances.Efectivo, 80);
  assert.equal((await db.doc("cashAdvances/duplicate").get()).data().correctedAmount, 0);
  assert.equal((await db.doc("cashAdvances/valid").get()).data().correctedAmount, undefined);
  assert.equal((await db.collection("cashCorrections").get()).size, 1);
  assert.equal((await db.doc("cashMovements/" + first.adjustmentId).get()).data().amount, 20);
  console.log("PASS: server key verification, real Firestore transaction, concurrent retries and linked payroll correction.");
}
run().catch(error => { console.error(error, logs.slice(-4000)); process.exitCode = 1; }).finally(async () => {
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
  await db.terminate();
  await deleteApp(app);
});
