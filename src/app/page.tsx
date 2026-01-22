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
import {
  Plus,
  DollarSign,
  Trophy,
  Car,
  Sparkles,
  AlertCircle,
  ParkingSquare,
} from "lucide-react";
import NewServiceModal from "@/components/NewServiceModal";
import ServiceDetailsModal from "@/components/ServiceDetailsModal";
import DatabaseFixer from "@/components/DatabaseFilter";
import { enqueueSnackbar } from "notistack";

export default function DashboardPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalSales: 0,
    totalTips: 0,
    totalCars: 0,
    pendingCount: 0, // Nueva estadística para saber cuántos deben
    bestWasherName: "Nadie aún",
    washerStats: [] as any[],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, "services"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc"),
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setServices(data);

      let sales = 0;
      let tips = 0;
      let pendingCount = 0;
      const washerMap: Record<string, any> = {};

      data.forEach((svc: any) => {
        const isPending = svc.paymentStatus === "pending";

        // Si es pendiente, lo contamos pero NO sumamos el dinero a la caja del día
        if (isPending) {
          pendingCount++;
        } else {
          sales += svc.financials?.totalPrice || 0;
          tips += svc.financials?.tipAmount || 0;
        }

        // Estadísticas de Lavadores (Ellos sí cuentan el carro aunque no se haya pagado aún)
        // Opcional: Si prefieres que solo cuente cuando pagan, mueve esto al bloque 'else'
        const wId = svc.washerId || "unknown";
        if (!washerMap[wId]) {
          washerMap[wId] = {
            id: wId,
            name: svc.washerName || "Desconocido",
            cars: 0,
            earnings: 0,
            tipsReceived: 0,
          };
        }

        washerMap[wId].cars += 1;
        // Solo sumamos ganancia al lavador si ya está pagado (para no ilusionarlos con dinero que no ha entrado)
        if (!isPending) {
          washerMap[wId].earnings += svc.financials?.washerEarnings || 0;
          washerMap[wId].tipsReceived += svc.financials?.tipAmount || 0;
        }
      });

      const washersArray = Object.values(washerMap);
      let bestName = "---";
      if (washersArray.length > 0) {
        const best = washersArray.reduce((prev, current) =>
          prev.cars > current.cars ? prev : current,
        );
        bestName = best.name;
      }

      setStats({
        totalSales: sales,
        totalTips: tips,
        totalCars: data.length,
        pendingCount,
        bestWasherName: bestName,
        washerStats: washersArray,
      });
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  return (
    <div className="p-6 space-y-8 min-h-screen">
      {/* <DatabaseFixer /> */}
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/80 backdrop-blur-md p-6 rounded-3xl shadow-sm border border-white/20">
        <div>
          <h1 className="text-3xl font-black text-gray-800 italic tracking-tight">
            Resumen del Día
          </h1>
          <p className="text-gray-500 font-medium">
            Vista general de operaciones
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-espuma-blue hover:bg-cyan-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-cyan-500/30 flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          NUEVO SERVICIO
        </button>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border-l-4 border-l-espuma-blue shadow-sm">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Caja (Pagado)
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <DollarSign className="w-8 h-8 text-espuma-blue" />
            <span className="text-3xl font-black text-gray-800">
              ${stats.totalSales.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border-l-4 border-l-yellow-500 shadow-sm">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Propinas
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-yellow-500" />
            <span className="text-3xl font-black text-gray-800">
              ${stats.totalTips.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border-l-4 border-l-green-500 shadow-sm">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Mejor Lavador
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <Trophy className="w-8 h-8 text-green-500" />
            <span className="text-2xl font-black text-gray-800 truncate">
              {stats.bestWasherName}
            </span>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border-l-4 border-l-purple-500 shadow-sm">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Total Autos
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <Car className="w-8 h-8 text-purple-500" />
            <span className="text-3xl font-black text-gray-800">
              {stats.totalCars}
            </span>
            {stats.pendingCount > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold ml-auto">
                {stats.pendingCount} Pend.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* EQUIPO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {stats.washerStats.map((w) => (
          <div
            key={w.id}
            className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/40 flex flex-col justify-between hover:scale-[1.02] transition-transform"
          >
            <div>
              <div className="font-black text-gray-800 text-lg mb-1">
                {w.name}
              </div>
              <div className="text-xs font-bold text-gray-500 flex items-center gap-1">
                <Car className="w-3 h-3" /> {w.cars} autos
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-end">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400">
                  Propina
                </p>
                <p className="text-green-600 font-bold">
                  ${w.tipsReceived.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-gray-400">
                  Ganado
                </p>
                <p className="text-espuma-blue font-black text-xl">
                  ${w.earnings.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BITÁCORA / TABLA */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/20 overflow-hidden">
        <div className="p-5 border-b border-gray-200/50 bg-white/40">
          <h3 className="font-bold text-gray-800 text-lg">Bitácora de Hoy</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-200/50">
              <tr>
                <th className="px-6 py-4">Hora</th>
                <th className="px-6 py-4">Vehículo</th>
                <th className="px-6 py-4">Lavador</th>
                <th className="px-6 py-4">Precio / Método</th>
                <th className="px-6 py-4">Propina</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    Sin registros hoy.
                  </td>
                </tr>
              ) : (
                services.map((svc) => (
                  <tr
                    key={svc.id}
                    className={`hover:bg-white/60 transition group ${svc.paymentStatus === "pending" ? "bg-red-50/50" : ""}`}
                  >
                    <td className="px-6 py-4 font-bold text-gray-600">
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
                      <div className="font-black text-gray-800">
                        {svc.vehicle?.model}
                      </div>
                      <div className="text-xs text-gray-500 font-bold uppercase">
                        {svc.vehicle?.color}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-medium">
                      <div className={svc.washerName === "Por Asignar" ? "font-bold text-red-500" : "font-bold"}>{svc.washerName === "Por Asignar" ? <p><AlertCircle className="w-4 h-4 inline mr-1" /> {svc.washerName}</p> : svc.washerName}</div>
                      <div className="inline-flex items-center gap-1 bg-cyan-100 text-cyan-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1">
                        <ParkingSquare className="w-3 h-3" /> Pista {svc.vehicle?.bay ? `#${svc.vehicle.bay}` : "N/A"}
                      </div>
                    </td>

                    {/* COLUMNA DE PRECIO CON MÉTODO DE PAGO */}
                    <td className="px-6 py-4">
                      {svc.paymentStatus === "pending" ? (
                        <div>
                          <div className="font-black text-red-500 text-lg">
                            ${svc.financials?.totalPrice.toFixed(2)}
                          </div>
                          <div className="inline-flex items-center gap-1 bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1">
                            <AlertCircle className="w-3 h-3" /> Pendiente
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-black text-espuma-blue text-lg">
                            ${svc.financials?.totalPrice.toFixed(2)}
                          </div>
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-1">
                            {svc.financials?.paymentMethod}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-gray-500 font-bold">
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
                        className="text-espuma-blue font-bold hover:underline"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewServiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
      />

      {selectedService && (
        <ServiceDetailsModal
          service={selectedService}
          onClose={() => {
            setSelectedService(null);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
