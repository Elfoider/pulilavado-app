import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { CashMovement } from "../operations/model";
import {
  addDays,
  CashAdvance,
  CashEnvelope,
  dayStart,
  EnvelopeMovement,
  weekOf,
} from "../operations/treasury-model";
import { summarizeTreasury } from "./treasury";
export async function loadTreasuryReport(anchor: string) {
  const start = weekOf(anchor),
    next = addDays(start, 7);
  const dated = (path: string) =>
    getDocsFromServer(
      query(
        collection(db, path),
        where("createdAt", ">=", Timestamp.fromDate(dayStart(start))),
        where("createdAt", "<", Timestamp.fromDate(dayStart(next))),
      ),
    );
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await getDocFromServer(doc(db, "treasuryControl/current"));
    const [cash, envelopes, movements, advances] = await Promise.all([
      dated("cashMovements"),
      getDocsFromServer(
        query(collection(db, "cashEnvelopes"), where("weekStart", "==", start)),
      ),
      dated("envelopeMovements"),
      dated("cashAdvances"),
    ]);
    const after = await getDocFromServer(doc(db, "treasuryControl/current"));
    if (JSON.stringify(before.data()) !== JSON.stringify(after.data()))
      continue;
    const rows = <T>(s: typeof cash) =>
      s.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
    return summarizeTreasury(
      anchor,
      rows<CashMovement>(cash),
      rows<CashEnvelope>(envelopes),
      rows<EnvelopeMovement>(movements),
      rows<CashAdvance>(advances),
    );
  }
  throw new Error(
    "Los sobres cambiaron durante la consulta. Actualice el resumen.",
  );
}
