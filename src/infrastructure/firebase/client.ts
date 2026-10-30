import { getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { migrationRuntime } from "../../shared/config/runtime";

export const migrationEnvironment=migrationRuntime({
  enabled:process.env.NEXT_PUBLIC_MIGRATION_SANDBOX,
  legacyEmulatorFlag:process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
// No production keys, projects, databases or fallback in MigracionDevV2.
const name=`pulilavado-migration-${migrationEnvironment.projectId}`;
const app=getApps().find(app=>app.name===name) ?? initializeApp({projectId:migrationEnvironment.projectId,apiKey:"demo-migration",appId:"demo-migration"},name);
export const db=getFirestore(app);
const runtime=globalThis as typeof globalThis & {__migrationEmulatorConnected?:Set<string>};
runtime.__migrationEmulatorConnected ??= new Set();
if(!runtime.__migrationEmulatorConnected.has(name)){
  connectFirestoreEmulator(db,migrationEnvironment.emulatorHost,migrationEnvironment.emulatorPort);
  runtime.__migrationEmulatorConnected.add(name);
}
