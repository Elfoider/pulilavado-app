import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createOperations } from "./core";
import { Data, tipBalancesFromMovements } from "./model";
export const newId = () => doc(collection(db, "_ids")).id;
function clean(data: Data): Data {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );
}
export const operations = createOperations(
  (work) =>
    runTransaction(db, (tx) =>
      work({
        async get(path) {
          const snap = await tx.get(doc(db, path));
          return snap.exists() ? snap.data() : undefined;
        },
        async readTipBalances(sessionId) {
          // All writers update the session read by this transaction. A concurrent
          // ledger change therefore retries both this query and the calculation.
          const rows = await getDocs(query(collection(db, "cashMovements"), where("sessionId", "==", sessionId)));
          return tipBalancesFromMovements(rows.docs.map(row => row.data()));
        },
        set(path, data, merge = false) {
          tx.set(doc(db, path), clean(data), { merge });
        },
      }),
    ),
  serverTimestamp,
  newId,
);
