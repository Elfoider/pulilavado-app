// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Define una interfaz para las variables de entorno para mayor seguridad (opcional)
const firebaseConfig = {
  apiKey: "AIzaSyCBaQcCu1YeHXoJYJ2qhWteg-wIChL8dOA",
  authDomain: "mrespumasystem.firebaseapp.com",
  projectId: "mrespumasystem",
  storageBucket: "mrespumasystem.firebasestorage.app",
  messagingSenderId: "889894946879",
  appId: "1:889894946879:web:b2d9864c85bd6ae375108a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);