"use client"

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, deleteField } from 'firebase/firestore';

export default function DatabaseFixer() {
  const [status, setStatus] = useState("Esperando...");
  const [processing, setProcessing] = useState(false);

  const fixDatabase = async () => {
    if (!confirm("¿Estás seguro de ejecutar la corrección de base de datos? Haz una copia de seguridad si es posible.")) return;
    
    setProcessing(true);
    setStatus("Iniciando escaneo...");

    try {
      const querySnapshot = await getDocs(collection(db, "services"));
      let fixedCount = 0;

      setStatus(`Analizando ${querySnapshot.size} documentos...`);

      const promises = querySnapshot.docs.map(async (document) => {
        const data = document.data();
        
        // Verificamos si existe el campo en la raíz (el "nuevo" incorrecto que tiene el dato real)
        const rootPayment = data.paymentMethod;
        
        // Verificamos el campo dentro de financials
        const financialPayment = data.financials?.paymentMethod;

        // LÓGICA DE CORRECCIÓN:
        // Si existe un pago en la raíz, ese es el que manda (ej: Yappy).
        // Lo movemos a financials y borramos el de la raíz.
        if (rootPayment) {
          const serviceRef = doc(db, "services", document.id);
          
          await updateDoc(serviceRef, {
            // 1. Movemos el valor de la raíz a su lugar correcto dentro de financials
            "financials.paymentMethod": rootPayment,
            
            // 2. Borramos el campo de la raíz para limpiar la base de datos
            paymentMethod: deleteField() 
          });
          
          fixedCount++;
        }
      });

      await Promise.all(promises);
      setStatus(`¡Listo! Se corrigieron ${fixedCount} servicios.`);

    } catch (error) {
      console.error(error);
      setStatus("Error: Revisar consola.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 bg-orange-100 border border-orange-300 rounded-xl my-4">
      <h3 className="font-bold text-orange-800">⚠️ Herramienta de Reparación DB</h3>
      <p className="text-sm text-orange-700 mb-2">
        Esto moverá el "Método de Pago" desde la raíz hacia dentro de <i>financials</i>.
      </p>
      <div className="flex gap-4 items-center">
        <button 
          onClick={fixDatabase} 
          disabled={processing}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
        >
          {processing ? "Procesando..." : "EJECUTAR CORRECCIÓN"}
        </button>
        <span className="font-mono text-sm">{status}</span>
      </div>
    </div>
  );
}