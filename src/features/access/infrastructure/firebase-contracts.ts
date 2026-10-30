import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, setPersistence, inMemoryPersistence } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { contractsRuntime } from "../../../shared/config/contracts-runtime";
export const contractsEnvironment = contractsRuntime(process.env.NEXT_PUBLIC_V2_CONTRACTS_SANDBOX);
let client: ReturnType<typeof createClient> | undefined;
function createClient() {
  if (!contractsEnvironment.enabled || typeof window === "undefined") throw new Error("Active el laboratorio local de acceso V2.");
  const name = "pulilavado-v2-access-contracts";
  const existing = getApps().find(app => app.name === name);
  const app = existing ?? initializeApp({ projectId: contractsEnvironment.projectId, apiKey: "demo-contracts", appId: "demo-contracts" }, name);
  const auth = getAuth(app), db = getFirestore(app);
  // Store the configured instance globally to remain safe during hot reload.
  if (!existing) {
    connectAuthEmulator(auth, contractsEnvironment.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, contractsEnvironment.firestoreHost, contractsEnvironment.firestorePort);
  }
  const ready = (async () => {
    await setPersistence(auth, inMemoryPersistence);
    const probe = await fetch(`http://127.0.0.1:8080/v1/projects/${contractsEnvironment.projectId}/databases/(default)/documents/profiles/rules-probe`);
    if (probe.status !== 403) throw new Error("El laboratorio requiere sus reglas de acceso restringidas.");
  })();
  return { auth, db, ready };
}
export function getContractsClient() { return client ??= createClient(); }
