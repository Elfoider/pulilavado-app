import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { correctCashMovement, type CashCorrection } from "../operations/cash-correction";
import type { Atomic, Data } from "../operations/model";

export function saveCashCorrection(input: CashCorrection) {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mrespumasystem";
  if (emulator ? emulator !== "127.0.0.1:8080" || !/^demo-[a-z0-9-]+$/.test(projectId) || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true" : projectId !== "mrespumasystem" || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    throw new Error("Configuración de Caja incompatible.");
  }
  const name = "pulilavado-cash-corrections";
  const app = getApps().find(app => app.name === name) ?? initializeApp({ projectId }, name);
  const db = getFirestore(app);
  const atomic: Atomic = work => db.runTransaction(tx => work({
    async get(path) { return (await tx.get(db.doc(path))).data() as Data | undefined; },
    set(path, data, merge = false) { tx.set(db.doc(path), data, { merge }); },
  }));
  return correctCashMovement(atomic, FieldValue.serverTimestamp, () => db.collection("cashMovements").doc().id, input);
}
