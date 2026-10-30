"use client";
import { useState, useEffect } from "react";
import { db } from "@/infrastructure/firebase/client";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { User, Trash2, Pencil, Power, Eye } from "lucide-react";
import { Washer } from "@/features/washers/domain/types";
import { enqueueSnackbar } from "notistack";
import Link from "next/link";

export default function WashersManager() {
  const [washers, setWashers] = useState<Washer[]>([]);
  const [name, setName] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "washers"), (snap) => {
      setWashers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Washer));
    });
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || busy) return;
    const individual = commissionPercentage === "" ? null : Number(commissionPercentage);
    if (individual !== null && (!Number.isFinite(individual) || individual < 0 || individual > 100)) { enqueueSnackbar("La comisión debe estar entre 0 y 100%.", {variant:"warning"}); return; }
    setBusy(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "washers", editingId), { name, phone, commissionPercentage: individual });
        setEditingId(null);
      } else {
        await addDoc(collection(db, "washers"), { name, phone, active: true, commissionPercentage: individual });
      }
      setName("");
      setPhone("");
      setCommissionPercentage("");
    } catch (err) {
      console.error(err);
      enqueueSnackbar("No se pudo guardar el lavador.", {variant:"error"});
    } finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    if (
      confirm("¿Borrar lavador? Se perderá su historial en reportes futuros.")
    ) {
      await deleteDoc(doc(db, "washers", id));
    }
  };

  const toggleActive = async (item: Washer) => {
    await updateDoc(doc(db, "washers", item.id), { active: !item.active });
  };

  const startEdit = (item: Washer) => {
    setEditingId(item.id);
    setName(item.name);
    setPhone(item.phone || "");
    setCommissionPercentage(item.commissionPercentage?.toString() ?? "");
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-end"
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
        <div className="flex-1 min-w-40"><label className="text-xs font-bold text-gray-500">Comisión individual (%)</label><input type="number" min="0" max="100" step="0.01" value={commissionPercentage} onChange={e => setCommissionPercentage(e.target.value)} placeholder="Usar global" className="w-full border p-2 rounded" /><p className="text-xs text-gray-500">Vacío usa el global; 0% es válido.</p></div>
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">
          {editingId ? "Actualizar" : "Agregar"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setName("");
              setPhone("");
              setCommissionPercentage("");
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
                <p className="text-xs text-cyan-700 font-bold">Comisión: {w.commissionPercentage == null ? "Global" : `${w.commissionPercentage}%`}</p>
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
