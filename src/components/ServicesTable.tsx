"use client"

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { ServiceDocument } from '@/types';
import ServiceDetailsModal from '@/components/ServiceDetailsModal'; // Asegúrate de tener este componente

interface ServiceWithId extends ServiceDocument {
  id: string;
}

export default function DashboardPage() {
  const [todayServices, setTodayServices] = useState<ServiceWithId[]>([]);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalTips: 0,
    totalCount: 0,
    topWasher: 'Nadie aún'
  });
  const [selectedService, setSelectedService] = useState<ServiceWithId | null>(null);

    const calculateDailyStats = (services: ServiceWithId[]) => {
    let earnings = 0;
    let tips = 0;
    const washerMap: Record<string, number> = {};

    services.forEach(svc => {
      earnings += svc.financials.totalPrice; // O businessEarnings si quieres solo la ganancia neta
      tips += svc.financials.tipAmount || 0;
      
      // Contar para el mejor lavador (sumando sus ganancias)
      const wName = svc.washerName;
      if (!washerMap[wName]) washerMap[wName] = 0;
      washerMap[wName] += svc.financials.washerEarnings;
    });

    // Encontrar lavador con más ganancias hoy
    let topName = 'Nadie aún';
    let maxEarn = 0;
    Object.entries(washerMap).forEach(([name, amount]) => {
      if (amount > maxEarn) {
        maxEarn = amount;
        topName = name;
      }
    });

    setStats({
      totalEarnings: earnings,
      totalTips: tips,
      totalCount: services.length,
      topWasher: topName
    });
  };

  useEffect(() => {
    // 1. Calcular rango de tiempo para "HOY"
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 2. Query en tiempo real filtrado por fecha
    const q = query(
      collection(db, "services"),
      where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
      where("createdAt", "<=", Timestamp.fromDate(endOfDay)),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceWithId));
      setTodayServices(data);
      calculateDailyStats(data);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Resumen del Día</h1>

      {/* TARJETAS DE MÉTRICAS (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow border border-l-4 border-l-blue-500">
          <p className="text-gray-500 text-xs font-bold uppercase">Ventas Totales Hoy</p>
          <p className="text-2xl font-bold">${stats.totalEarnings.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border border-l-4 border-l-yellow-500">
          <p className="text-gray-500 text-xs font-bold uppercase">Propinas Hoy</p>
          <p className="text-2xl font-bold text-yellow-700">${stats.totalTips.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border border-l-4 border-l-green-500">
          <p className="text-gray-500 text-xs font-bold uppercase">Mejor Lavador Hoy</p>
          <p className="text-xl font-bold text-green-700 truncate">{stats.topWasher}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border border-l-4 border-l-purple-500">
          <p className="text-gray-500 text-xs font-bold uppercase">Carros Lavados</p>
          <p className="text-2xl font-bold text-purple-700">{stats.totalCount}</p>
        </div>
      </div>

      {/* TABLA DE SERVICIOS DE HOY */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b font-bold text-gray-700">Bitácora de Hoy</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">Vehículo</th>
                <th className="px-4 py-3">Lavador</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Propina</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todayServices.map((svc) => (
                <tr key={svc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {svc.createdAt?.seconds 
                      ? new Date(svc.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
                      : '--:--'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold">{svc.vehicle.model}</div>
                    <div className="text-xs text-gray-500">{svc.vehicle.color} (Pista {svc.vehicle.bay})</div>
                  </td>
                  <td className="px-4 py-3">{svc.washerName}</td>
                  <td className="px-4 py-3 font-bold text-blue-700">
                    ${svc.financials.totalPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-medium text-yellow-700">
                    {svc.financials.tipAmount > 0 
                      ? `$${svc.financials.tipAmount.toFixed(2)}` 
                      : <span className="text-gray-300">N/A</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => setSelectedService(svc)}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {todayServices.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Sin servicios hoy</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL (Reutilizamos el que ya tenías) */}
      {selectedService && (
        <ServiceDetailsModal service={selectedService} onClose={() => setSelectedService(null)} />
      )}
    </div>
  );
}