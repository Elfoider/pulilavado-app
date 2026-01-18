"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { ServiceFormData, PaymentMethod, Washer } from "@/types"; // Asegúrate de importar tus tipos

interface ClientOption {
  id: string;
  name: string;
  phone: string;
  lastVehicle?: { model: string; color: string }; // Si guardaste esto antes
}

export default function ServiceForm() {
  const [loading, setLoading] = useState<boolean>(false);
  const [washersList, setWashersList] = useState<Washer[]>([]);
  const [clientsList, setClientsList] = useState<ClientOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState<ServiceFormData>({
    washerName: "",
    // @ts-ignore: Propiedad temporal para el ID
    washerId: "",
    clientName: "",
    clientPhone: "",
    vehicleModel: "",
    vehicleColor: "",
    bayNumber: "",
    price: "",
    paymentMethod: "efectivo",
    hasTip: false,
    tipAmount: "",
    tipMethod: "efectivo",
    saveFrequent: false,
    observations: "",
  });

  useEffect(() => {
    const loadData = async () => {
      // Cargar Lavadores
      const wQuery = query(
        collection(db, "washers"),
        where("active", "==", true)
      );
      const wSnap = await getDocs(wQuery);
      setWashersList(
        wSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Washer))
      );

      // Cargar Clientes (Para el autocompletado)
      const cQuery = query(collection(db, "clients"), orderBy("name"));
      const cSnap = await getDocs(cQuery);
      setClientsList(
        cSnap.docs.map(
          (d) =>
            ({
              id: d.id,
              name: d.data().name,
              phone: d.data().phone,
              lastVehicle: d.data().vehicleHistory?.[0], // Asumiendo que guardas historial
            } as ClientOption)
        )
      );
    };
    loadData();
  }, []);

  const handleClientSelect = (clientId: string) => {
    const client = clientsList.find((c) => c.id === clientId);
    if (client) {
      setFormData((prev) => ({
        ...prev,
        clientName: client.name,
        clientPhone: client.phone,
        // Si tuvieras datos del vehículo guardados, los pondrías aquí:
        vehicleModel: client.lastVehicle?.model || '',
        vehicleColor: client.lastVehicle?.color || ''
      }));
      setSearchTerm(client.name); // Actualizar el input visual
    }
  };

  // Manejador de cambios genérico tipado
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const target = e.target;
    const { name, value, type } = target;

    // Verificamos si es un checkbox para acceder a la propiedad 'checked'
    // TypeScript necesita saber que es un HTMLInputElement para leer 'checked'
    const finalValue =
      type === "checkbox" ? (target as HTMLInputElement).checked : value;

    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. OBTENER CONFIGURACIÓN DINÁMICA
      let percentageToUse = 0.4; // Fallback por seguridad

      const settingsRef = doc(db, "settings", "global");
      const settingsSnap = await getDoc(settingsRef);

      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        // Convertimos 40 a 0.40
        percentageToUse = (data.defaultCommissionPercentage || 40) / 100;
      }

      const COMMISSION_PERCENTAGE = percentageToUse;

      // 2. PARSEO DE NÚMEROS
      const priceNum = parseFloat(formData.price) || 0;
      const tipNum = formData.hasTip ? parseFloat(formData.tipAmount) || 0 : 0;

      const washerCommission = priceNum * COMMISSION_PERCENTAGE;
      const businessRevenue = priceNum - washerCommission;

      // 3. PREPARAR OBJETO (Tipado implícito o explícito)
      const serviceData = {
        washerName: formData.washerName,
        washerId: formData.washerId,
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        vehicle: {
          model: formData.vehicleModel,
          color: formData.vehicleColor,
          bay: formData.bayNumber,
        },
        financials: {
          totalPrice: priceNum,
          paymentMethod: formData.paymentMethod as PaymentMethod,
          commissionRate: COMMISSION_PERCENTAGE,
          washerEarnings: washerCommission,
          businessEarnings: businessRevenue,
          tipAmount: tipNum,
          tipMethod: formData.hasTip
            ? (formData.tipMethod as PaymentMethod)
            : null,
        },
        observations: formData.observations,
        createdAt: serverTimestamp(),
      };

      // 4. GUARDAR EN FIRESTORE
      // TypeScript infiere los tipos aquí, pero sabe que collection espera referencias válidas
      await addDoc(collection(db, "services"), serviceData);

      // Si es cliente nuevo y se marca guardar
      if (formData.saveFrequent) {
        await addDoc(collection(db, "clients"), {
          name: formData.clientName,
          phone: formData.clientPhone,
          frequent: true,
          // Guardamos el vehículo actual como referencia
          vehicleHistory: [
            { model: formData.vehicleModel, color: formData.vehicleColor },
          ],
          createdAt: serverTimestamp(),
        });
      }

      alert("Servicio registrado exitosamente!");

      // Limpiar formulario (reseteo parcial)
      setFormData((prev) => ({
        ...prev,
        price: "",
        vehicleModel: "",
        vehicleColor: "",
        clientName: "",
        clientPhone: "",
        hasTip: false,
        tipAmount: "",
      }));
      setSearchTerm("");
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al registrar servicio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">
        Nuevo Servicio de Lavado
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* BUSCADOR DE CLIENTES */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <label className="block text-sm font-bold text-blue-800 mb-2">
            Buscar Cliente Existente
          </label>
          <input
            list="clients-options"
            placeholder="Escribe para buscar..."
            className="w-full border p-2 rounded"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              // Intentar buscar match exacto o permitir escribir nuevo
              const match = clientsList.find((c) => c.name === e.target.value);
              if (match) handleClientSelect(match.id);
              else
                setFormData((prev) => ({
                  ...prev,
                  clientName: e.target.value,
                }));
            }}
          />
          <datalist id="clients-options">
            {clientsList.map((c) => (
              <option key={c.id} value={c.name}>
                {c.phone}
              </option>
            ))}
          </datalist>
        </div>
        {/* SECCIÓN 1: DATOS OPERATIVOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lavador */}
          <select
            name="washerId"
            required
            className="border p-2 rounded"
            onChange={(e) => {
              const w = washersList.find((x) => x.id === e.target.value);
              setFormData((prev) => ({
                ...prev,
                washerId: e.target.value,
                washerName: w?.name || "",
              }));
            }}
          >
            <option value="">Seleccionar Lavador</option>
            {washersList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <input
            name="bayNumber"
            type="number"
            placeholder="Pista #"
            required
            className="border p-2 rounded"
            onChange={handleChange}
            value={formData.bayNumber}
          />
        </div>

        {/* SECCIÓN 2: VEHÍCULO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="vehicleModel"
            placeholder="Modelo Vehículo"
            required
            value={formData.vehicleModel}
            className="border p-2 rounded"
            onChange={handleChange}
          />
          <input
            name="vehicleColor"
            placeholder="Color"
            required
            value={formData.vehicleColor}
            className="border p-2 rounded"
            onChange={handleChange}
          />
        </div>

        {/* SECCIÓN 3: CLIENTE */}
        <div className="border-t pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <input
              name="clientName"
              placeholder="Nombre Cliente"
              required
              value={formData.clientName}
              className="border p-2 rounded"
              onChange={handleChange}
            />
            <input
              name="clientPhone"
              placeholder="Teléfono"
              type="tel"
              value={formData.clientPhone}
              className="border p-2 rounded"
              onChange={handleChange}
            />
          </div>
          <label className="flex items-center space-x-2 text-sm text-gray-600">
            <input
              type="checkbox"
              name="saveFrequent"
              checked={formData.saveFrequent}
              onChange={handleChange}
            />
            <span>Guardar como cliente frecuente</span>
          </label>
        </div>

        {/* SECCIÓN 4: PAGO */}
        <div className="bg-gray-50 p-4 rounded border">
          <label className="block font-semibold mb-1">
            Precio del Servicio ($)
          </label>
          <div className="flex gap-4 mb-3">
            <input
              name="price"
              type="number"
              step="0.01"
              placeholder="0.00"
              required
              value={formData.price}
              className="border p-2 rounded w-1/2"
              onChange={handleChange}
            />
            <select
              name="paymentMethod"
              value={formData.paymentMethod}
              className="border p-2 rounded w-1/2"
              onChange={handleChange}
            >
              <option value="efectivo">Efectivo</option>
              <option value="yappy">Yappy</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="ach">ACH</option>
            </select>
          </div>

          {/* LÓGICA DE PROPINA */}
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="checkbox"
              name="hasTip"
              id="hasTip"
              checked={formData.hasTip}
              onChange={handleChange}
            />
            <label htmlFor="hasTip" className="font-medium">
              ¿Hubo Propina?
            </label>
          </div>

          {formData.hasTip && (
            <div className="flex gap-4 animate-in fade-in slide-in-from-top-2">
              <input
                name="tipAmount"
                type="number"
                placeholder="Monto Propina"
                value={formData.tipAmount}
                className="border p-2 rounded w-1/2"
                onChange={handleChange}
              />
              <select
                name="tipMethod"
                value={formData.tipMethod}
                className="border p-2 rounded w-1/2"
                onChange={handleChange}
              >
                <option value="efectivo">Efectivo</option>
                <option value="yappy">Yappy</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="ach">ACH</option>
              </select>
            </div>
          )}
        </div>

        <textarea
          name="observations"
          placeholder="Observaciones..."
          value={formData.observations}
          className="w-full border p-2 rounded h-20"
          onChange={handleChange}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 font-bold transition disabled:bg-gray-400"
        >
          {loading ? "Registrando..." : "Registrar Servicio"}
        </button>
      </form>
    </div>
  );
}
