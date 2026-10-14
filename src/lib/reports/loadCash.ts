import { collection, doc, getDocFromServer, getDocsFromServer, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { CashMovement, isCashSession } from "../operations/model";
import { detailMovements } from "./cash";

export async function loadCashReport() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const control = await getDocFromServer(doc(db, "cashControl/current"));
    const id = control.data()?.sessionId;
    if (!id) return { session: null, movements: [] };
    if (typeof id !== "string" || id.includes("/")) throw new Error("Referencia de caja inválida.");
    const before = await getDocFromServer(doc(db, "cashSessions", id));
    const rows = await getDocsFromServer(query(collection(db, "cashMovements"), where("sessionId", "==", id)));
    const after = await getDocFromServer(doc(db, "cashSessions", id));
    const current = await getDocFromServer(doc(db, "cashControl/current"));
    if (JSON.stringify(before.data()) !== JSON.stringify(after.data()) || current.data()?.sessionId !== id) continue;
    const data = after.data();
    if (!isCashSession(data) || data.status !== "open") throw new Error("La caja cambió o tiene datos incompatibles. Actualice el reporte.");
    const session = { ...data, id };
    return { session, movements: detailMovements(rows.docs.map(d => ({ ...d.data(), id: d.id }) as CashMovement), session) };
  }
  throw new Error("La caja está recibiendo movimientos. Intente exportar nuevamente.");
}
