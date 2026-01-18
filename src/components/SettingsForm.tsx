"use client"

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function SettingsForm() {
  const [loading, setLoading] = useState(false);
  const [commissionRate, setCommissionRate] = useState<string>('40'); // Por defecto 40%

  // 1. Cargar configuración actual al abrir la página
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          // Si existe, cargamos el valor. Asumimos que guardamos 40 para 40%
          setCommissionRate(docSnap.data().defaultCommissionPercentage.toString());
        }
      } catch (error) {
        console.error("Error cargando configuración:", error);
      }
    };
    fetchSettings();
  }, []);

  // 2. Guardar nueva configuración
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const percentage = parseFloat(commissionRate);
      if (percentage < 0 || percentage > 100) {
        alert("El porcentaje debe estar entre 0 y 100");
        setLoading(false);
        return;
      }

      // Guardamos en el documento 'settings/global'
      await setDoc(doc(db, "settings", "global"), {
        defaultCommissionPercentage: percentage,
        updatedAt: new Date()
      });

      alert("Configuración guardada correctamente.");
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Hubo un error al guardar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border max-w-md">
      <h2 className="text-xl font-bold mb-4">Configuración del Negocio</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Porcentaje de Comisión por Defecto (%)
          </label>
          <div className="flex items-center">
            <input
              type="number"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              className="border p-2 rounded w-full"
              placeholder="Ej: 40"
              min="0"
              max="100"
            />
            <span className="ml-2 text-gray-500 font-bold">%</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Este porcentaje se aplicará a los lavadores en los nuevos servicios registrados.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-50 w-full"
        >
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </form>
    </div>
  );
}