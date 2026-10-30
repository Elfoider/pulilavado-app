import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../infrastructure/firebase/client";
import { createOperations } from "../application/core";
import { Data } from "../domain/model";
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
        set(path, data, merge = false) {
          tx.set(doc(db, path), clean(data), { merge });
        },
      }),
    ),
  serverTimestamp,
  newId,
);
