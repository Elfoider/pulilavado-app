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
} from "firebase/firestore";
import { ServiceFormData, PaymentMethod, Washer } from "@/types"; // Asegúrate de importar tus tipos

export default function ServiceForm() {
  const [loading, setLoading] = useState<boolean>(false);
  const [washersList, setWashersList] = useState<Washer[]>([]);
  const [formData, setFormData] = useState<ServiceFormData>({
    washerName: "",
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
    const loadWashers = async () => {
      const q = query(collection(db, "washers"), where("active", "==", true));
      const snap = await getDocs(q);
      setWashersList(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Washer))
      );
    };
    loadWashers();
  }, []);

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

      // 5. CLIENTE FRECUENTE
      if (formData.saveFrequent) {
        await addDoc(collection(db, "clients"), {
          name: formData.clientName,
          phone: formData.clientPhone,
          frequent: true,
          lastVisit: serverTimestamp(),
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
        {/* SECCIÓN 1: DATOS OPERATIVOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="washerName"
            placeholder="Nombre Lavador"
            required
            value={formData.washerName}
            className="border p-2 rounded"
            onChange={handleChange}
          />
          <input
            name="bayNumber"
            placeholder="# Pista (1-5)"
            required
            type="number"
            value={formData.bayNumber}
            className="border p-2 rounded"
            onChange={handleChange}
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
