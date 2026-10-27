import { collection, doc, getDocFromServer, getDocsFromServer, query, where, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { CashMovement, CashSession, isCashSession } from "../operations/model";
import { detailMovements, summarizePeriodCash, type DetailedMovement, type PeriodCash } from "./cash";
import { addDays, dayStart } from "../operations/treasury-model";

export async function loadCashReport(range?: { start: string; end: string }): Promise<{session: CashSession | null; movements: DetailedMovement[]; periodCash?: PeriodCash}> {
  if (!range) return loadCurrentCashReport();
  const start = dayStart(range.start);
  const end = dayStart(addDays(range.end, 1));
  if (start >= end) throw new Error("El rango de fechas es inválido.");
  const found = await getDocsFromServer(query(collection(db, "cashMovements"), where("createdAt", ">=", Timestamp.fromDate(start)), where("createdAt", "<", Timestamp.fromDate(end))));
  const periodRows = found.docs.map(d => ({ ...d.data(), id: d.id }) as CashMovement);
  const ids = [...new Set(periodRows.map(row => row.sessionId))];
  const states: string[] = [];
  const groups = await Promise.all(ids.map(async id => {
    if (typeof id !== "string" || !id || id.includes("/")) throw new Error("Un movimiento tiene una referencia de caja inválida.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await getDocFromServer(doc(db, "cashSessions", id));
      // Reconstruct historical balances from the complete session, then filter dates.
      const rows = await getDocsFromServer(query(collection(db, "cashMovements"), where("sessionId", "==", id)));
      const after = await getDocFromServer(doc(db, "cashSessions", id));
      if (JSON.stringify(before.data()) !== JSON.stringify(after.data())) continue;
      const data = after.data();
      states.push(isCashSession(data) ? data.closedAt && data.closedAt.seconds < end.getTime() / 1000 ? "closed" : data.status === "open" || data.closedAt ? "open" : "unknown" : "unknown");
      return detailMovements(rows.docs.map(d => ({ ...d.data(), id: d.id }) as CashMovement), isCashSession(data) ? { ...data, id } : null)
        .filter(row => row.createdAt && row.createdAt.seconds >= start.getTime() / 1000 && row.createdAt.seconds < end.getTime() / 1000);
    }
    throw new Error("Una caja está recibiendo movimientos. Intente exportar nuevamente.");
  }));
  const movements = groups.flat().sort((a, b) => (a.createdAt!.seconds - b.createdAt!.seconds) ||
    ((a.createdAt as { nanoseconds?: number }).nanoseconds ?? 0) - ((b.createdAt as { nanoseconds?: number }).nanoseconds ?? 0) ||
    a.sessionId.localeCompare(b.sessionId) || (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id));
  return { session: null, movements, periodCash: { ...summarizePeriodCash(movements), statusLabel: states.length === 0 ? "Sin movimientos de caja" : states.includes("unknown") ? "Estado histórico no disponible" : states.includes("open") ? "Incluye caja abierta al final del rango" : "Cajas cerradas en el período" } };
}

async function loadCurrentCashReport() {
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
