/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS to run directly and reuse the emulator test harness. */
/* One-off repair for the known deletion of one duplicate $5 payroll advance. */
const { createHash } = require("node:crypto");

const METHODS = ["Efectivo", "Yappy", "Tarjeta", "Transferencia"];
const EXPECTED = 500;
const stop = message => { throw new Error(message); };
const cents = value => {
  const n = Math.round(value * 100);
  if (typeof value !== "number" || !Number.isSafeInteger(n) || n / 100 !== value) stop("Se encontró un monto inválido o con más de dos decimales.");
  return n;
};
const balances = value => METHODS.map(method => cents(value?.[method]));
const equal = (a, b) => a.every((value, i) => value === b[i]);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const missingBalance = [-EXPECTED, 0, 0, 0];

function planRepair(session, movements, advances) {
  const maximum = session?.movementSequence;
  if (session?.status !== "open" || !Number.isSafeInteger(maximum) || maximum !== movements.length + 1 || maximum < 2) stop("La caja debe estar abierta y tener exactamente un movimiento faltante en la secuencia.");
  const rows = [...movements].sort((a, b) => a.sequence - b.sequence);
  if (rows[0]?.kind !== "opening" || rows[0].sequence !== 1 || rows[0].method !== "Efectivo" || cents(rows[0].amount) !== cents(session.openingAmount)) stop("No se pudo comprobar la apertura de esta caja.");
  let previous = [0, 0, 0, 0], sequence = 0, missingSequence = 0, expenses = 0;
  const linked = new Map();
  for (const row of rows) {
    const step = row.sequence - sequence;
    const method = METHODS.indexOf(row.method);
    if ((step !== 1 && step !== 2) || !Number.isSafeInteger(row.sequence) || row.sequence > maximum || method < 0 || (row.sequence !== 1 && row.kind === "opening") || row.correctionId || row.correctsMovementId) stop("Hay registros o correcciones previas que necesitan revisión manual.");
    const before = balances(row.balancesBefore), after = balances(row.balancesAfter), amount = cents(row.amount);
    if (!equal(subtract(after, before), METHODS.map((_, i) => method === i ? amount : 0))) stop("Un movimiento restante tiene saldos incompatibles con su importe.");
    if (step === 2) {
      if (missingSequence || !equal(subtract(before, previous), missingBalance)) stop("El salto del historial no equivale a una salida en efectivo de $5.");
      missingSequence = sequence + 1;
    } else if (!equal(before, previous)) stop("Hay otro descuadre entre los movimientos restantes.");
    if (row.kind === "expense" || row.kind === "payroll_advance") expenses -= amount;
    if (row.kind === "payroll_advance") {
      if (row.method !== "Efectivo" || amount >= 0 || !row.referenceId || linked.has(row.referenceId)) stop("Los vales restantes requieren revisión manual.");
      linked.set(row.referenceId, row);
    }
    previous = after; sequence = row.sequence;
  }
  const current = balances(session.balances);
  if (sequence === maximum - 1) {
    if (missingSequence || !equal(subtract(current, previous), missingBalance)) stop("El último movimiento faltante no explica la diferencia en efectivo.");
    missingSequence = maximum;
  } else if (sequence !== maximum || !equal(current, previous)) stop("El último saldo registrado no coincide con la caja.");
  if (!missingSequence || cents(session.expenses) - expenses !== EXPECTED || expenses < 0 || current[0] + EXPECTED < 0) stop("El acumulado de gastos no confirma el descuadre esperado de $5.");
  if (advances.length !== linked.size || advances.some(advance => {
    const row = linked.get(advance.id);
    return !row || advance.correctionId || advance.correctedAmount != null || !row.washerId || advance.washerId !== row.washerId || cents(advance.amount) !== -cents(row.amount);
  })) stop("No coinciden los vales de nómina restantes con sus movimientos. No se tocará la caja.");
  return {
    missingSequence,
    efectivoAntes: current[0] / 100, efectivoDespues: (current[0] + EXPECTED) / 100,
    gastosAntes: session.expenses, gastosDespues: expenses / 100,
    valesConservados: advances.length,
  };
}

const productionProject = "mrespumasystem";
const demoProject = "demo-pulilavado-corrections";
const auditId = sequence => "vale-duplicado-borrado-" + sequence;

async function evaluate(db, tx, expected) {
  const { FieldValue } = require("firebase-admin/firestore");
  const control = await tx.get(db.doc("cashControl/current"));
  const sessionId = control.data()?.sessionId;
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) stop("No se encontró una referencia válida de caja abierta.");
  const sessionRef = db.doc("cashSessions/" + sessionId);
  const sessionDoc = await tx.get(sessionRef);
  const bySession = name => db.collection(name).where("sessionId", "==", sessionId).limit(5001);
  const movements = await tx.get(bySession("cashMovements"));
  const advances = await tx.get(bySession("cashAdvances"));
  if (movements.size > 5000 || advances.size > 5000) stop("La sesión excede el límite de revisión automática.");
  const asRows = snapshot => snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  const plan = planRepair(sessionDoc.data(), asRows(movements), asRows(advances));
  const ref = sessionRef.collection("repairs").doc(auditId(plan.missingSequence));
  if ((await tx.get(ref)).exists) stop("Esta reparación ya existe. No se harán cambios.");
  const version = doc => [doc.id, doc.updateTime?.seconds, doc.updateTime?.nanoseconds];
  const token = createHash("sha256").update(JSON.stringify([
    sessionId, version(control), version(sessionDoc),
    movements.docs.map(version).sort(), advances.docs.map(version).sort(), plan,
  ])).digest("hex").slice(0, 24);
  if (expected && expected !== token) stop("Cambió la caja desde la revisión. Vuelva a ejecutar el diagnóstico.");
  if (expected) {
    const repairedAt = FieldValue.serverTimestamp();
    tx.update(sessionRef, { "balances.Efectivo": plan.efectivoDespues, expenses: plan.gastosDespues, updatedAt: repairedAt });
    tx.create(ref, { ...plan, repairedAt, reason: "Conciliación por borrado manual de un vale duplicado de $5 y su movimiento; no hubo entrega de efectivo." });
  }
  return { caja: sessionId, ...plan, aplicado: !!expected, ...(!expected ? { codigoDeConfirmacion: token } : {}) };
}

async function main() {
  const { initializeApp, applicationDefault, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--aplicar" || !/^[0-9a-f]{24}$/.test(args[1]))) stop("Uso: node scripts/reparar-vale-borrado.cjs [--aplicar CODIGO]");
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && emulator !== "127.0.0.1:8080") stop("Solo se admite el emulador local para pruebas.");
  const projectId = emulator ? demoProject : productionProject;
  const app = initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
  const db = getFirestore(app);
  try {
    const result = await (args.length
      ? db.runTransaction(tx => evaluate(db, tx, args[1]))
      : db.runTransaction(tx => evaluate(db, tx), { readOnly: true }));
    console.log(JSON.stringify({ proyecto: projectId, ...result }, null, 2));
  } finally { await db.terminate(); await deleteApp(app); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { planRepair, evaluate };
