"use client"

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { Washer } from '@/types';

export default function WashersManager() {
  const [washers, setWashers] = useState<Washer[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Cargar lavadores
  useEffect(() => {
    fetchWashers();
  }, []);

  const fetchWashers = async () => {
    const q = query(collection(db, "washers"), orderBy("name"));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Washer));
    setWashers(data);
  };

  const handleCreateWasher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    setLoading(true);

    try {
      await addDoc(collection(db, "washers"), {
        name: newName,
        phone: newPhone,
        active: true,
        startDate: serverTimestamp()
      });
      setNewName('');
      setNewPhone('');
      fetchWashers(); // Recargar lista
      alert("Lavador registrado correctamente");
    } catch (error) {
      console.error(error);
      alert("Error al crear lavador");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (washer: Washer) => {
    try {
      const ref = doc(db, "washers", washer.id);
      await updateDoc(ref, { active: !washer.active });
      fetchWashers();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulario de Creación */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="font-bold text-lg mb-4">Registrar Nuevo Empleado</h3>
        <form onSubmit={handleCreateWasher} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700">Nombre Completo</label>
            <input 
              value={newName} onChange={e => setNewName(e.target.value)}
              className="w-full border p-2 rounded mt-1" placeholder="Ej: Juan Pérez"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700">Teléfono</label>
            <input 
              value={newPhone} onChange={e => setNewPhone(e.target.value)}
              className="w-full border p-2 rounded mt-1" placeholder="6000-0000"
            />
          </div>
          <button disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700">
            {loading ? '...' : 'Agregar'}
          </button>
        </form>
      </div>

      {/* Lista de Lavadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {washers.map(washer => (
          <div key={washer.id} className={`p-4 rounded-xl border ${washer.active ? 'bg-white' : 'bg-gray-100 opacity-75'}`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-lg">{washer.name}</h4>
                <p className="text-sm text-gray-500">{washer.phone}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${washer.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {washer.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            
            <div className="mt-4 flex gap-2">
              <button onClick={() => toggleStatus(washer)} className="text-xs border px-3 py-1 rounded hover:bg-gray-50">
                {washer.active ? 'Desactivar' : 'Activar'}
              </button>
              {/* Este botón nos llevará al perfil detallado */}
              <a href={`/washers/${washer.id}`} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-medium hover:bg-blue-100">
                Ver Métricas
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}