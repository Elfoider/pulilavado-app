import { collection, doc, getDocFromServer, getDocsFromServer, query, where, type Firestore } from "firebase/firestore";
import { loadAccessContext, type ContextReader } from "../application/load-context";
import { identifier } from "../domain/model";
export function contextReader(db: Firestore): ContextReader {
  return {
    async get(path) { return (await getDocFromServer(doc(db, path))).data(); },
    async activeBranches(organizationId) {
      const result = await getDocsFromServer(query(collection(db, `organizations/${identifier(organizationId)}/branches`), where("organizationId", "==", organizationId), where("status", "==", "active")));
      return result.docs.map(document => ({ id: document.id, data: document.data() }));
    },
  };
}
export function loadFirestoreContext(db: Firestore, uid: string) { return loadAccessContext(uid, contextReader(db)); }
