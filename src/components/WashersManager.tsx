// src/components/WashersManager.tsx
"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { User, Trash2, Pencil, Power, Eye } from "lucide-react";
import Link from "next/link";

export default function WashersManager() {
  const [washers, setWashers] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "washers"), (snap) => {
      setWashers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    try {
      if (editingId) {
        await updateDoc(doc(db, "washers", editingId), { name, phone });
        setEditingId(null);
      } else {
        await addDoc(collection(db, "washers"), { name, phone, active: true });
      }
      setName("");
      setPhone("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      confirm("¿Borrar lavador? Se perderá su historial en reportes futuros.")
    ) {
      await deleteDoc(doc(db, "washers", id));
    }
  };

  const toggleActive = async (item: any) => {
    await updateDoc(doc(db, "washers", item.id), { active: !item.active });
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setName(item.name);
    setPhone(item.phone || "");
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="bg-white p-4 rounded-xl shadow-sm border flex gap-4 items-end"
      >
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-500">
            Nombre Lavador
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-500">Teléfono</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">
          {editingId ? "Actualizar" : "Agregar"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setName("");
            }}
            className="text-gray-500 underline text-sm pb-2"
          >
            Cancelar
          </button>
        )}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {washers.map((w) => (
          <div
            key={w.id}
            className={`p-4 rounded-xl border flex justify-between items-center ${w.active ? "bg-white" : "bg-gray-100 opacity-70"}`}
          >
            <div className="flex items-center gap-3">
              <User className="text-gray-400" />
              <div>
                <p className="font-bold">{w.name}</p>
                <p className="text-xs text-gray-500">{w.phone}</p>
              </div>
            </div>
            <div className="flex justify-between items-center">
              {/* Switch Activo/Inactivo */}
              <button
                onClick={() => toggleActive(w)}
                title={w.active ? "Desactivar" : "Activar"}
              >
                <Power
                  className={`w-4 h-4 mr-2 ${w.active ? "text-green-600" : "text-gray-400"}`}
                />
              </button>

              <div className="flex gap-2">
                {/* BOTÓN NUEVO: IR AL PERFIL */}
                <Link href={`/washers/${w.id}`}>
                  <button
                    className="p-1.5 hover:bg-blue-50 text-blue-600 rounded border border-blue-200"
                    title="Ver Histórico y Métricas"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </Link>

                <button
                  onClick={() => startEdit(w)}
                  className="p-1.5 hover:bg-gray-100 text-gray-500 rounded"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="p-1.5 hover:bg-red-50 text-red-500 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
