const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  setDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
  getDocs,
} = require("firebase/firestore");
const { createOperations } = require("../../../.test-build/features/operations/application/core.js");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("These tests require a local Firestore emulator.");
const app = initializeApp({
  projectId: "demo-pulilavado",
  apiKey: "demo-key",
  appId: "demo",
});
const db = getFirestore(app);
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
connectFirestoreEmulator(db, host, Number(port));
const id = () => doc(collection(db, "_ids")).id;
const clean = (d) =>
  Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
const ops = createOperations(
  (work) =>
    runTransaction(db, (tx) =>
      work({
        async get(path) {
          const s = await tx.get(doc(db, path));
          return s.exists() ? s.data() : undefined;
        },
        set(path, data, merge = false) {
          tx.set(doc(db, path), clean(data), { merge });
        },
      }),
    ),
  serverTimestamp,
  id,
);
const read = async (path) => (await getDoc(doc(db, path))).data();
async function main() {
  await setDoc(doc(db, "settings/global"), { defaultCommissionPercentage: 40 });
  await setDoc(doc(db, "washers/w"), {
    name: "Demo",
    active: true,
    commissionPercentage: 0,
  });
  await setDoc(doc(db, "products/p"), {
    name: "Agua",
    sku: "A",
    cost: 1,
    price: 2,
    stock: 10,
    active: true,
  });
  await ops.openCash(10, "c");
  const input = {
    clientName: "Demo",
    clientPhone: "",
    vehicle: { model: "Demo", color: "Blanco", bay: "1" },
    washerId: "w",
    servicePrice: 20,
    paymentStatus: "pending",
    paymentMethod: "Efectivo",
    tipAmount: 0,
    tipMethod: "Efectivo",
    cart: [{ productId: "p", quantity: 2 }],
  };
  await ops.saveService(input, "s", true);
  assert.equal((await read("products/p")).stock, 8);
  await ops.saveService(
    { ...input, paymentStatus: "paid", tipAmount: 3, tipMethod: "Yappy" },
    "s",
    false,
  );
  await ops.saveService(
    { ...input, paymentStatus: "paid", tipAmount: 3, tipMethod: "Yappy" },
    "s",
    false,
  );
  assert.equal((await read("cashSessions/c")).receipts, 24);
  assert.equal((await read("cashSessions/c")).balances.Yappy, 3);
  assert.equal((await read("services/s")).financials.washerEarnings, 0);
  const competing = await Promise.allSettled([
    ops.sell([{ productId: "p", quantity: 6 }], "Tarjeta", "sale-a"),
    ops.sell([{ productId: "p", quantity: 6 }], "Tarjeta", "sale-b"),
  ]);
  assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await read("products/p")).stock, 2);
  const winner = competing[0].status === "fulfilled" ? "sale-a" : "sale-b";
  await ops.cancelSale(winner, "Prueba");
  await ops.cancelSale(winner, "Reintento");
  assert.equal((await read("products/p")).stock, 8);
  await ops.cancelService("s", "Prueba");
  assert.equal((await read("products/p")).stock, 10);
  assert.equal((await read("cashSessions/c")).receipts, 0);
  assert.equal((await read("cashSessions/c")).balances.Efectivo, 10);
  await ops.sell([{ productId: "p", quantity: 1 }], "Efectivo", "final-sale");
  await ops.closeCash("c", 12, "Cierre de prueba");
  assert.equal((await read("cashSessions/c")).difference, 0);
  await ops.openCash(0, "next-c");
  await assert.rejects(ops.cancelSale("final-sale", "Error"), /cerrada/);
  assert.equal((await read("products/p")).stock, 9);
  await ops.cashMove(12,"Efectivo","income","Fondo de prueba","fund");
  await Promise.all([ops.cashMove(5,"Efectivo","withdrawal","Propinas","tips"),ops.cashMove(2,"Efectivo","expense","Gasto","expense")]);
  await ops.cashMove(5,"Efectivo","withdrawal","Propinas","tips");
  assert.equal((await read("cashSessions/next-c")).balances.Efectivo,5);
  const tip=await read("cashMovements/tips");
  assert.equal(tip.balancesBefore.Efectivo-tip.balancesAfter.Efectivo,5);
  assert.equal(tip.sequence >= 2,true);
  for (const c of ["cashMovements", "inventoryMovements"])
    assert.ok((await getDocs(collection(db, c))).size > 0);
  console.log(
    "PASS: Firestore real transactions, retries, concurrent stock, pending collection, reversals and closed cash.",
  );
}
main()
  .then(() => deleteApp(app))
  .catch(async (e) => {
    console.error(e);
    await deleteApp(app);
    process.exitCode = 1;
  });
