import { doc, getDocFromServer, type Firestore } from "firebase/firestore";
import { branchPath } from "../domain/model";
import type { BranchReadRepository } from "../application/read-baseline";
/** Read-only rehearsal. Operational V2 repositories will use authenticated APIs. */
export function baselineRepository(db: Firestore): BranchReadRepository {
  return { async getBaseline(scope) { return (await getDocFromServer(doc(db, `${branchPath(scope)}/summaries/baseline`))).data(); } };
}
