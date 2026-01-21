"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { ServiceDocument } from "@/types";
import ServiceDetailsModal from "@/components/ServiceDetailsModal";
import {
  Calendar,
  Search,
  DollarSign,
  Car,
  CreditCard,
  Smartphone,
  Wallet,
  Landmark,
  Eye,
  ArrowRight,
} from "lucide-react";
import { capitalizarPrimeraLetra } from "@/lib/utils";

interface ServiceWithId extends ServiceDocument {
  id: string;
}

export default function HistoryPage() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [services, setServices] = useState<ServiceWithId[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceWithId | null>(
    null,
  );

  // Estado actualizado para incluir MONTOS ($) y CONTEOS (#)
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalCars: 0,

    // Desglose Efectivo
    countCash: 0,
    amountCash: 0,

    // Desglose Yappy
    countYappy: 0,
    amountYappy: 0,

    // Desglose Tarjeta
    countCard: 0,
    amountCard: 0,

    // Desglose ACH
    countACH: 0,
    amountACH: 0,
  });

  const fetchHistory = async (date: string) => {
    setLoading(true);
    try {
      const start = new Date(date + "T00:00:00");
      const end = new Date(date + "T23:59:59");

      const q = query(
        collection(db, "services"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc"),
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as ServiceWithId,
      );

      setServices(data);

      // --- CÁLCULOS DETALLADOS ---
      let income = 0;

      // Acumuladores temporales
      let cCash = 0,
        aCash = 0;
      let cYappy = 0,
        aYappy = 0;
      let cCard = 0,
        aCard = 0;
      let cACH = 0,
        aACH = 0;

      data.forEach((svc) => {
        const total = svc.financials.totalPrice || 0;
        income += total;
        console.log(
          `Servicio ID: ${svc.id}, Monto: ${total}, Método: ${svc.financials.paymentMethod}`,
        );
        const method = svc.financials.paymentMethod;

        if (method == "Efectivo") {
          cCash++;
          aCash += total;
        } else if (method == "Yappy") {
          cYappy++;
          aYappy += total;
        } else if (method == "Tarjeta") {
          cCard++;
          aCard += total;
        } else if (method == "Transferencia") {
          cACH++;
          aACH += total;
        }
      });

      setStats({
        totalIncome: income,
        totalCars: data.length,

        countCash: cCash,
        amountCash: aCash,
        countYappy: cYappy,
        amountYappy: aYappy,
        countCard: cCard,
        amountCard: aCard,
        countACH: cACH,
        amountACH: aACH,
      });
    } catch (error) {
      console.error("Error cargando historial:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate) fetchHistory(selectedDate);
  }, [selectedDate]);

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      {/* 1. ENCABEZADO */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Calendar className="w-8 h-8 text-espuma-blue" />
            Historial de Operaciones
          </h1>
          <p className="text-gray-500 mt-1">
            Consulta los cierres de caja de días anteriores.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
          <span className="text-xs font-bold text-gray-400 uppercase px-2">
            Fecha:
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border-none focus:ring-0 font-bold text-gray-700 rounded-lg p-1 outline-none"
          />
          <button
            onClick={() => fetchHistory(selectedDate)}
            className="bg-espuma-blue hover:bg-cyan-600 text-white p-2 rounded-lg transition"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. TARJETAS DE RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Vendido */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
              Venta Total
            </p>
            <DollarSign className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-4xl font-black mt-2">
            ${stats.totalIncome.toFixed(2)}
          </p>
        </div>

        {/* Total Autos */}
        <div className="bg-white/90 p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
              Autos Atendidos
            </p>
            <Car className="w-6 h-6 text-espuma-blue" />
          </div>
          <p className="text-4xl font-black text-gray-800 mt-2">
            {stats.totalCars}
          </p>
        </div>

        {/* DESGLOSE DE PAGOS (AHORA CON MONTOS) */}
        <div className="lg:col-span-2 bg-white/90 p-5 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Efectivo */}
          <div className="flex flex-col items-center justify-center p-3 bg-green-50 rounded-xl border border-green-100 text-center">
            <Wallet className="w-5 h-5 text-green-600 mb-2" />
            <p className="text-lg font-black text-gray-800">
              ${stats.amountCash.toFixed(2)}
            </p>
            <p className="text-[10px] text-green-600 font-bold uppercase mt-1">
              Efectivo ({stats.countCash})
            </p>
          </div>

          {/* Yappy */}
          <div className="flex flex-col items-center justify-center p-3 bg-cyan-50 rounded-xl border border-cyan-100 text-center">
            <Smartphone className="w-5 h-5 text-espuma-blue mb-2" />
            <p className="text-lg font-black text-gray-800">
              ${stats.amountYappy.toFixed(2)}
            </p>
            <p className="text-[10px] text-espuma-blue font-bold uppercase mt-1">
              Yappy ({stats.countYappy})
            </p>
          </div>

          {/* Tarjeta */}
          <div className="flex flex-col items-center justify-center p-3 bg-purple-50 rounded-xl border border-purple-100 text-center">
            <CreditCard className="w-5 h-5 text-purple-500 mb-2" />
            <p className="text-lg font-black text-gray-800">
              ${stats.amountCard.toFixed(2)}
            </p>
            <p className="text-[10px] text-purple-500 font-bold uppercase mt-1">
              Tarjeta ({stats.countCard})
            </p>
          </div>

          {/* ACH */}
          <div className="flex flex-col items-center justify-center p-3 bg-gray-100 rounded-xl border border-gray-200 text-center">
            <Landmark className="w-5 h-5 text-gray-500 mb-2" />
            <p className="text-lg font-black text-gray-800">
              ${stats.amountACH.toFixed(2)}
            </p>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">
              ACH ({stats.countACH})
            </p>
          </div>
        </div>
      </div>

      {/* 3. TABLA DE SERVICIOS */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-espuma-red" />
            Detalle del Día
          </h3>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-lg font-bold">
            {services.length} Registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 border-b">
              <tr>
                <th className="px-6 py-4">Hora</th>
                <th className="px-6 py-4">Vehículo</th>
                <th className="px-6 py-4">Cliente / Lavador</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 text-right">Propina</th>
                <th className="px-6 py-4 text-center">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    Cargando datos...
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    Sin movimientos.
                  </td>
                </tr>
              ) : (
                services.map((svc) => (
                  <tr key={svc.id} className="hover:bg-blue-50/50 transition">
                    <td className="px-6 py-4 font-medium text-gray-600">
                      {svc.createdAt?.seconds
                        ? new Date(
                            svc.createdAt.seconds * 1000,
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--:--"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-800">
                        {svc.vehicle.model}
                      </div>
                      <div className="text-xs text-gray-500">
                        {svc.vehicle.color}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 font-medium">
                        {svc.clientName || "General"}
                      </div>
                      <div className="text-xs text-espuma-blue font-bold">
                        {svc.washerName}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold border ${
                          capitalizarPrimeraLetra(
                            svc.financials.paymentMethod,
                          ) === "Efectivo"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : capitalizarPrimeraLetra(
                                  svc.financials.paymentMethod,
                                ) === "Yappy"
                              ? "bg-cyan-100 text-cyan-700 border-cyan-200"
                              : capitalizarPrimeraLetra(
                                    svc.financials.paymentMethod,
                                  ) === "Tarjeta"
                                ? "bg-purple-100 text-purple-700 border-purple-200"
                                : capitalizarPrimeraLetra(
                                      svc.financials.paymentMethod,
                                    ) === "Pendiente"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {capitalizarPrimeraLetra(svc.financials.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-gray-800">
                      ${svc.financials.totalPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-gray-400">
                      {svc.financials?.tipAmount > 0 ? (
                        <span className="text-green-600">
                          +${svc.financials.tipAmount.toFixed(2)}
                        </span>
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedService(svc)}
                        className="p-2 hover:bg-espuma-blue hover:text-white rounded-lg transition text-gray-400"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedService && (
        <ServiceDetailsModal
          service={selectedService}
          onClose={() => {
            setSelectedService(null);
            fetchHistory(selectedDate);
          }}
        />
      )}
    </div>
  );
}
