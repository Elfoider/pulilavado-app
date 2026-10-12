// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Define una interfaz para las variables de entorno para mayor seguridad (opcional)
const firebaseConfig = {
  apiKey: "AIzaSyCBaQcCu1YeHXoJYJ2qhWteg-wIChL8dOA",
  authDomain: "mrespumasystem.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mrespumasystem",
  storageBucket: "mrespumasystem.firebasestorage.app",
  messagingSenderId: "889894946879",
  appId: "1:889894946879:web:b2d9864c85bd6ae375108a"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
  if (!firebaseConfig.projectId.startsWith("demo-")) throw new Error("Use un proyecto demo- para el emulador.");
  const runtime = globalThis as typeof globalThis & { __pulilavadoEmulatorConnected?: boolean };
  if (!runtime.__pulilavadoEmulatorConnected) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    runtime.__pulilavadoEmulatorConnected = true;
  }
}
