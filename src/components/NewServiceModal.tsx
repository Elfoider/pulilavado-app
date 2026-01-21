"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  Timestamp,
  doc,
  setDoc,
} from "firebase/firestore"; // <--- AGREGADO getDoc
import {
  X,
  Car,
  User,
  Phone,
  Save,
  CheckCircle,
  AlertCircle,
  Coins,
  Palette,
} from "lucide-react";
import { Washer } from "@/types";
import MoneyInput from "./MoneyInput";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Client {
  id: string;
  name: string;
  phone: string;
  vehicleModel: string;
  vehicleColor: string;
}

export default function NewServiceModal({ isOpen, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [washers, setWashers] = useState<Washer[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- CONFIGURACIÓN GLOBAL ---
  const [commissionPercent, setCommissionPercent] = useState(40); // Por defecto 40%

  // --- ESTADOS DEL FORMULARIO ---
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [selectedWasherId, setSelectedWasherId] = useState("");

  // 1. ESTADO DE PAGO
  const [isPending, setIsPending] = useState(false);

  // 2. DATOS DE COBRO
  const [price, setPrice] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");

  // 3. ESTADOS DE PROPINA
  const [hasTip, setHasTip] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipMethod, setTipMethod] = useState("Efectivo");

  useEffect(() => {
    if (isOpen) {
      const initData = async () => {
        try {
          // 1. Cargar Lavadores
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

          // 2. Cargar Clientes
          const snapClients = await getDocs(collection(db, "clients"));
          setAllClients(
            snapClients.docs.map(
              (doc) => ({ id: doc.id, ...doc.data() }) as Client,
            ),
          );

          // 3. CARGAR COMISIÓN GLOBAL (NUEVO)
          const settingsSnap = await getDoc(doc(db, "settings", "global"));
          if (settingsSnap.exists()) {
            setCommissionPercent(settingsSnap.data()?.defaultCommissionPercentage || 40);
          }
        } catch (error) {
          console.error(error);
        }
      };

      initData();

      // Resetear formulario
      setClientName("");
      setClientPhone("");
      setVehicleModel("");
      setVehicleColor("");
      setSelectedWasherId("");
      setIsPending(false);
      setPrice(0);
      setPaymentMethod("Efectivo");
      setHasTip(false);
      setTipAmount(0);
      setTipMethod("Efectivo");
      setShowSuggestions(false);
    }
  }, [isOpen]);

  // ... (Funciones handleNameChange y selectClient IGUALES que antes) ...
  const handleNameChange = (text: string) => {
    setClientName(text);
    if (text.length > 1) {
      const search = text.toLowerCase();
      const results = allClients.filter((c) =>
        c.name.toLowerCase().includes(search),
      );
      setFilteredClients(results);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectClient = (client: Client) => {
    setClientName(client.name);
    setClientPhone(client.phone);
    setVehicleModel(client.vehicleModel);
    setVehicleColor(client.vehicleColor);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedWasherId || !vehicleModel) {
      alert("Faltan datos: Vehículo o Lavador.");
      return;
    }
    if (!isPending && price <= 0) {
      alert("Por favor ingrese el precio del servicio.");
      return;
    }

    setLoading(true);
    try {
      const washer = washers.find((w) => w.id === selectedWasherId);

      // Cálculos Financieros
      const finalPrice = isPending ? 0 : price;
      const finalTip = isPending || !hasTip ? 0 : tipAmount;

      // USAMOS LA COMISIÓN DINÁMICA
      const rateDecimal = commissionPercent / 100; // Ej: 40 -> 0.40
      const washerEarnings = finalPrice * rateDecimal;
      const businessEarnings = finalPrice - washerEarnings;

      const paymentStatus = isPending ? "pending" : "paid";

      await addDoc(collection(db, "services"), {
        createdAt: Timestamp.now(),
        clientName: clientName || "Cliente General",
        clientPhone: clientPhone || "",
        vehicle: {
          model: vehicleModel,
          color: vehicleColor || "No especificado",
        },

        financials: {
          totalPrice: finalPrice,
          paymentMethod: isPending ? "Pendiente" : paymentMethod,
          tipAmount: finalTip,
          tipMethod: isPending || !hasTip ? null : tipMethod,
          washerEarnings,
          businessEarnings,
          commissionRate: rateDecimal, // Guardamos el % usado en este servicio
        },

        paymentStatus,
        washerId: selectedWasherId,
        washerName: washer?.name || "Desconocido",
        status: "completed",
      });

      if (clientName) {
        const existingClient = allClients.find(
          (c) => c.name.toLowerCase() === clientName.toLowerCase(),
        );
        const clientData = {
          name: clientName,
          phone: clientPhone,
          vehicleModel,
          vehicleColor,
          lastVisit: Timestamp.now(),
        };
        if (existingClient) {
          await setDoc(doc(db, "clients", existingClient.id), clientData, {
            merge: true,
          });
        } else {
          await addDoc(collection(db, "clients"), clientData);
        }
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // ... (El return / JSX es IDÉNTICO al anterior, no cambia nada visualmente) ...
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER */}
        <div className="bg-espuma-blue p-5 flex justify-between items-center text-white">
          <div>
            <h2 className="text-xl font-black italic tracking-wider">
              NUEVO SERVICIO
            </h2>
            <p className="text-cyan-100 text-xs font-bold uppercase">
              Ingreso de Vehículo
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* 1. SELECCIÓN DE LAVADOR */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Lavador Asignado *
            </label>
            <select
              required
              value={selectedWasherId}
              onChange={(e) => setSelectedWasherId(e.target.value)}
              className="w-full p-3 bg-gray-50 border-gray-200 rounded-xl font-bold text-gray-800 h-[52px] outline-none focus:ring-2 focus:ring-espuma-blue"
            >
              <option value="">Seleccionar...</option>
              {washers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. DATOS DEL CLIENTE */}
          <div className="space-y-4 pt-2 border-t border-gray-100">
            <div className="relative">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Cliente
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar o escribir nuevo..."
                  value={clientName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 200)
                  }
                  className="w-full pl-10 p-3 bg-gray-50 border-gray-200 rounded-xl font-bold text-gray-800 focus:ring-2 focus:ring-espuma-blue outline-none"
                />
              </div>
              {showSuggestions && filteredClients.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => selectClient(client)}
                      className="p-3 hover:bg-cyan-50 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <p className="font-bold text-gray-800 text-sm">
                          {client.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {client.vehicleModel}
                        </p>
                      </div>
                      <CheckCircle className="w-4 h-4 text-espuma-blue" />
                    </div>
                  ))}
                </div>
              )}
            </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Teléfono
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    placeholder="6xxx-xxxx"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full pl-10 p-3 bg-gray-50 border-gray-200 rounded-xl font-medium text-gray-800 outline-none"
                  />
                </div>
              </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Vehículo *
                </label>
                <div className="relative">
                  <Car className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    required
                    placeholder="Modelo"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    className="w-full pl-10 p-3 bg-gray-50 border-gray-200 rounded-xl font-bold text-gray-800 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Color *
                </label>
                <div className="relative">
                  <Palette className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    required
                    placeholder="Color"
                    value={vehicleColor}
                    onChange={(e) => setVehicleColor(e.target.value)}
                    className="w-full pl-10 p-3 bg-gray-50 border-gray-200 rounded-xl font-bold text-gray-800 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 my-2"></div>

          {/* 3. SWITCH DE ESTADO DE PAGO */}
          <div className="bg-gray-100 p-1.5 rounded-xl flex">
            <button
              type="button"
              onClick={() => setIsPending(false)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!isPending ? "bg-white text-espuma-blue shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Cobrar Ahora
            </button>
            <button
              type="button"
              onClick={() => setIsPending(true)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${isPending ? "bg-red-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Pago Pendiente
            </button>
          </div>

          {/* 4. SECCIÓN FINANCIERA (CONDICIONAL) */}
          {isPending ? (
            // --- MODO PENDIENTE ---
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center animate-in fade-in zoom-in-95 duration-200">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-800 font-bold">Servicio por Pagar</p>
              <p className="text-red-600 text-xs mt-1">
                Se guardará en $0.00. Podrás ingresar el monto y el cobro cuando
                el cliente retire el vehículo.
              </p>
            </div>
          ) : (
            // --- MODO PAGADO (Inputs visibles) ---
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <MoneyInput
                  label="Precio del Servicio *"
                  value={price}
                  onChange={setPrice}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-3 bg-white border-gray-200 rounded-xl font-bold text-gray-800 h-[52px] outline-none focus:ring-2 focus:ring-espuma-blue"
                  >
                    <option>Efectivo</option>
                    <option>Yappy</option>
                    <option>Tarjeta</option>
                    <option>Transferencia</option>
                  </select>
                </div>
              </div>

              {/* SECCIÓN DE PROPINA */}
              <div
                className={`p-4 rounded-xl border transition-all duration-300 ${hasTip ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200"}`}
              >
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setHasTip(!hasTip)}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${hasTip ? "bg-yellow-500 border-yellow-500" : "border-gray-400 bg-white"}`}
                  >
                    {hasTip && (
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <label className="text-sm font-bold text-gray-700 cursor-pointer select-none flex items-center gap-2">
                    ¿Agregar Propina?{" "}
                    <Coins className="w-4 h-4 text-yellow-600" />
                  </label>
                </div>

                {hasTip && (
                  <div className="mt-4 grid grid-cols-1 gap-3 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <MoneyInput
                        label="Monto Propina"
                        value={tipAmount}
                        onChange={setTipAmount}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        Vía
                      </label>
                      <select
                        value={tipMethod}
                        onChange={(e) => setTipMethod(e.target.value)}
                        className="w-full p-2 border border-yellow-300 rounded-lg bg-white text-sm font-medium text-gray-800 h-[52px]"
                      >
                        <option>Efectivo</option>
                        <option>Yappy</option>
                        <option>Tarjeta</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BOTÓN GUARDAR */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 mt-2 rounded-xl font-bold text-white shadow-lg transition flex items-center justify-center gap-2 text-lg ${isPending ? "bg-gray-800 hover:bg-black shadow-gray-500/30" : "bg-espuma-blue hover:bg-cyan-600 shadow-cyan-500/30"}`}
          >
            {loading ? (
              "Guardando..."
            ) : (
              <>
                <Save className="w-6 h-6" />{" "}
                {isPending
                  ? "Guardar Pendiente"
                  : `Cobrar $${(price + (hasTip ? tipAmount : 0)).toFixed(2)}`}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
