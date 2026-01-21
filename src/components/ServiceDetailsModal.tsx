"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  X,
  User,
  Car,
  Calendar,
  MessageCircle,
  PhoneCall,
  Trash2,
  Edit2,
  Save,
  Coins,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { ServiceDocument, Washer } from "@/types";
import MoneyInput from "./MoneyInput";

interface Props {
  service: ServiceDocument;
  onClose: () => void;
}

export default function ServiceDetailsModal({ service, onClose }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [washers, setWashers] = useState<Washer[]>([]);
  const [commissionPercent, setCommissionPercent] = useState(35);

  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    vehicleModel: "",
    vehicleColor: "",
    price: 0,
    paymentMethod: "",
    paymentStatus: "paid", // NUEVO CAMPO
    washerId: "",
    tipAmount: 0,
    tipMethod: "Efectivo",
    vehicleBay: "",
  });

  useEffect(() => {
    if (service) {
      setFormData({
        clientName: service.clientName,
        clientPhone: service.clientPhone || "",
        vehicleModel: service.vehicle?.model || "",
        vehicleColor: service.vehicle?.color || "",
        price: service.financials?.totalPrice || 0,
        paymentMethod: service.paymentMethod || "Efectivo",
        paymentStatus: service.paymentStatus || "paid", // Cargar estado
        washerId: service.washerId || "",
        tipAmount: service.financials?.tipAmount || 0,
        tipMethod: service.financials?.tipMethod || "Efectivo",
        vehicleBay: service.vehicle?.bay || "",
      });
    }

    const initData = async () => {
      // ... (misma lógica de carga de lavadores y config)
      const qWashers = query(
        collection(db, "washers"),
        where("active", "==", true),
      );
      const snapWashers = await getDocs(qWashers);
      setWashers(
        snapWashers.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Washer,
        ),
      );
      const snapConfig = await getDocs(collection(db, "settings"));
      if (!snapConfig.empty) {
        const configData = snapConfig.docs[0].data();
        if (configData.defaultCommissionPercentage)
          setCommissionPercent(configData.defaultCommissionPercentage);
      }
    };
    initData();
  }, [service]);

  if (!service) return null;

  // ... (Funciones handleWhatsApp, handleCall, handleDelete IGUALES que antes)
  const handleWhatsApp = () => {
    if (!formData.clientPhone) return alert("No hay número.");
    let clean = formData.clientPhone.replace(/\D/g, "");
    if (!clean.startsWith("507")) clean = "507" + clean;
    window.open(`https://wa.me/${clean}`, "_blank");
  };
  const handleCall = () => {
    if (formData.clientPhone)
      window.location.href = `tel:${formData.clientPhone}`;
  };
  const handleDelete = async () => {
    if (confirm("⚠️ ¿Eliminar servicio?")) {
      try {
        await deleteDoc(doc(db, "services", service.id));
        onClose();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);
      const commissionRate = commissionPercent / 100;
      const washerEarnings = formData.price * commissionRate;
      const businessEarnings = formData.price - washerEarnings;

      const selectedWasher = washers.find((w) => w.id === formData.washerId);
      const washerName = selectedWasher
        ? selectedWasher.name
        : service.washerName;

      await updateDoc(doc(db, "services", service.id), {
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        "vehicle.model": formData.vehicleModel,
        "vehicle.color": formData.vehicleColor,
        "vehicle.bay": formData.vehicleBay,
        "financials.totalPrice": formData.price,
        "financials.washerEarnings": washerEarnings,
        "financials.businessEarnings": businessEarnings,
        "financials.tipAmount": formData.tipAmount,
        "financials.tipMethod": formData.tipMethod,
        "financials.paymentMethod": formData.paymentMethod,
        paymentStatus: formData.paymentStatus, // Guardar status
        washerId: formData.washerId,
        washerName: washerName,
      });

      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error");
    } finally {
      setLoading(false);
    }
  };

  const dateStr = service.createdAt?.seconds
    ? new Date(service.createdAt.seconds * 1000).toLocaleString("es-PA")
    : "---";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in zoom-in-95 duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div
          className={`${isEditing ? "bg-indigo-600" : "bg-gray-900"} p-4 flex justify-between items-center text-white transition-colors duration-300`}
        >
          <h2 className="text-lg font-bold flex items-center gap-2">
            {isEditing ? (
              <Edit2 className="w-5 h-5" />
            ) : (
              <Car className="text-espuma-blue" />
            )}
            {isEditing ? "Editando Servicio" : "Detalles"}
          </h2>
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 bg-white/10 hover:bg-blue-500/50 rounded-lg transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 bg-white/10 hover:bg-red-500/50 rounded-lg transition text-red-300 hover:text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* --- MODO EDICIÓN --- */}
          {isEditing ? (
            <div className="space-y-4">
              {/* Datos Básicos (Igual que antes) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Cliente
                  </label>
                  <input
                    value={formData.clientName}
                    onChange={(e) =>
                      setFormData({ ...formData, clientName: e.target.value })
                    }
                    className="w-full p-2 border rounded-lg bg-gray-50 font-bold text-gray-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Teléfono
                  </label>
                  <input
                    value={formData.clientPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, clientPhone: e.target.value })
                    }
                    className="w-full p-2 border rounded-lg bg-gray-50 font-medium"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Modelo
                  </label>
                  <input
                    value={formData.vehicleModel}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicleModel: e.target.value })
                    }
                    className="w-full p-2 border rounded-lg bg-gray-50 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Color
                  </label>
                  <input
                    value={formData.vehicleColor}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicleColor: e.target.value })
                    }
                    className="w-full p-2 border rounded-lg bg-gray-50 font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">
                  Pista
                </label>
                <select
                  required
                  value={formData.vehicleBay}
                  onChange={(e) => setFormData({ ...formData, vehicleBay: e.target.value })}
                  className="w-full p-3 bg-gray-50 border-gray-200 rounded-xl font-bold text-gray-800 h-[52px] outline-none focus:ring-2 focus:ring-espuma-blue"
                >
                  <option value="0">Seleccionar...</option>
                  <option value="1">Pista #1</option>
                  <option value="2">Pista #2</option>
                  <option value="3">Pista #3</option>
                  <option value="4">Pista #4</option>
                  <option value="5">Pista #5</option>
                  <option value="6">Pista #6</option>
                  <option value="7">Pista #7</option>
                  <option value="8">Pista #8</option>
                  <option value="9">Pista #9</option>
                  <option value="10">Pista #10</option>
                </select>
              </div>

              {/* STATUS DE PAGO (NUEVO CONTROL) */}
              <div className="p-3 bg-gray-100 rounded-xl flex gap-2">
                <button
                  onClick={() =>
                    setFormData({ ...formData, paymentStatus: "paid" })
                  }
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${formData.paymentStatus === "paid" ? "bg-green-500 text-white shadow-md" : "text-gray-500 hover:bg-gray-200"}`}
                >
                  Pagado
                </button>
                <button
                  onClick={() =>
                    setFormData({ ...formData, paymentStatus: "pending" })
                  }
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${formData.paymentStatus === "pending" ? "bg-red-500 text-white shadow-md" : "text-gray-500 hover:bg-gray-200"}`}
                >
                  Pendiente
                </button>
              </div>

              {/* Finanzas */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${formData.paymentStatus === "pending" ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}
              >
                <MoneyInput
                  label="Precio Servicio"
                  value={formData.price}
                  onChange={(val) => setFormData({ ...formData, price: val })}
                />

                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Método Pago
                    </label>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          paymentMethod: e.target.value,
                        })
                      }
                      className="w-full p-2 border rounded-lg bg-white text-sm font-medium h-[42px]"
                    >
                      <option>Efectivo</option>
                      <option>Yappy</option>
                      <option>Tarjeta</option>
                      <option>Transferencia</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Lavador
                    </label>
                    <select
                      value={formData.washerId}
                      onChange={(e) =>
                        setFormData({ ...formData, washerId: e.target.value })
                      }
                      className="w-full p-2 border rounded-lg bg-white text-sm font-medium h-[42px]"
                    >
                      {washers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Propinas (Igual que antes) */}
              <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 space-y-3">
                <MoneyInput
                  label="Propina (Opcional)"
                  value={formData.tipAmount}
                  onChange={(val) =>
                    setFormData({ ...formData, tipAmount: val })
                  }
                />
                <select
                  value={formData.tipMethod}
                  onChange={(e) =>
                    setFormData({ ...formData, tipMethod: e.target.value })
                  }
                  className="w-full p-2 border border-yellow-300 rounded-lg bg-white text-sm font-medium h-[42px]"
                >
                  <option>Efectivo</option>
                  <option>Yappy</option>
                  <option>Tarjeta</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-300 font-bold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                >
                  {loading ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            // --- MODO VISUALIZACIÓN ---
            <>
              {formData.paymentStatus === "pending" && (
                <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 font-bold animate-pulse">
                  <AlertCircle className="w-5 h-5" />
                  Este servicio está Pendiente de Pago
                </div>
              )}

              {/* ... (Cliente y Vehículo igual que antes) */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">
                      Cliente
                    </p>
                    <p className="text-xl font-black text-gray-800">
                      {formData.clientName}
                    </p>
                    {formData.clientPhone && (
                      <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1">
                        <PhoneCall className="w-3 h-3" /> {formData.clientPhone}
                      </p>
                    )}
                  </div>
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <User className="w-6 h-6 text-espuma-blue" />
                  </div>
                </div>
                {formData.clientPhone && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      onClick={handleWhatsApp}
                      className="flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold text-sm transition shadow-sm"
                    >
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </button>
                    <button
                      onClick={handleCall}
                      className="flex items-center justify-center gap-2 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold text-sm transition shadow-sm"
                    >
                      <PhoneCall className="w-4 h-4" /> Llamar
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Vehículo
                  </p>
                  <p className="font-bold text-gray-800">
                    {formData.vehicleModel}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Color
                  </p>
                  <p className="font-bold text-gray-800">
                    {formData.vehicleColor}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Pista
                  </p>
                  <p className="font-bold text-gray-800">
                    {formData.vehicleBay ? `#${formData.vehicleBay}` : "N/A"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-espuma-blue/5 p-4 rounded-xl border border-espuma-blue/20">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-espuma-blue uppercase">
                      Cobro Servicio
                    </p>
                    <span className="text-2xl font-black text-gray-800">
                      ${formData.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      Método: <b>{formData.paymentMethod}</b>
                    </span>
                    {formData.paymentStatus === "paid" ? (
                      <span className="text-green-600 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Pagado
                      </span>
                    ) : (
                      <span className="text-red-500 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Pendiente
                      </span>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-espuma-blue/10 flex justify-between text-sm">
                    <span className="text-gray-500">
                      Comisión Lavador ({commissionPercent}%):
                    </span>
                    <span className="font-bold text-green-600">
                      ${(formData.price * (commissionPercent / 100)).toFixed(2)}
                    </span>
                  </div>
                </div>

                {formData.tipAmount > 0 && (
                  <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-yellow-600" />
                      <div>
                        <p className="text-xs font-bold text-yellow-700 uppercase">
                          Propina Extra
                        </p>
                        <p className="text-[10px] text-yellow-600 font-medium">
                          Vía {formData.tipMethod}
                        </p>
                      </div>
                    </div>
                    <span className="text-xl font-black text-yellow-700">
                      +${formData.tipAmount.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    Total para {service.washerName}
                  </span>
                  <span className="font-black text-lg text-green-600">
                    $
                    {(
                      formData.price * (commissionPercent / 100) +
                      formData.tipAmount
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="text-center pt-2">
                <p className="text-xs text-gray-400 font-medium flex items-center justify-center gap-1">
                  <Calendar className="w-3 h-3" /> {dateStr}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
