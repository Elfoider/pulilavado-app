"use client"

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { Washer, ServiceDocument } from '@/types';

// Definimos la estructura del reporte financiero
interface PayrollReport {
  totalServices: number;
  totalCommission: number; // Sueldo base
  tipsCash: number;        // Propina Efectivo (Ya la tiene el lavador)
  tipsYappy: number;       // Propina Yappy (Se le debe pagar)
  totalToPay: number;      // Comisión + Propina Yappy
  generatedRevenue: number; // Lo que generó para el negocio
}

export default function WasherProfile({ params }: { params: { id: string } }) {
  const [washer, setWasher] = useState<Washer | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState('week'); // 'week' | 'month' | 'all'
  const [loading, setLoading] = useState(true);

  // Cargar datos del lavador
  useEffect(() => {
    const fetchWasher = async () => {
      const docRef = doc(db, "washers", params.id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setWasher({ id: docSnap.id, ...docSnap.data() } as Washer);
      }
    };
    fetchWasher();
  }, [params.id]);

  // Cargar servicios y calcular métricas cuando cambia el filtro
  useEffect(() => {
    if (!washer) return;
    
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        // Calcular fecha de inicio según el filtro
        const now = new Date();
        let startDate = new Date();
        
        if (dateRange === 'week') {
          // Últimos 7 días o desde el lunes
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Ajustar al lunes
          startDate.setDate(diff);
          startDate.setHours(0,0,0,0);
        } else if (dateRange === 'month') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else {
          startDate = new Date(2020, 0, 1); // Todo el historial
        }

        // Query: Servicios donde washerId == ID y fecha >= startDate
        const q = query(
          collection(db, "services"),
          where("washerId", "==", washer.id),
          where("createdAt", ">=", Timestamp.fromDate(startDate))
        );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => d.data() as ServiceDocument);
        setServices(data);

      } catch (error) {
        console.error("Error cargando métricas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [washer, dateRange]);

  // --- LÓGICA DE CÁLCULO DE NÓMINA ---
  const calculatePayroll = (): PayrollReport => {
    return services.reduce((acc, curr) => {
      const financials = curr.financials;
      
      // 1. Contar servicio
      acc.totalServices += 1;
      
      // 2. Sumar comisión (Sueldo del lavador)
      acc.totalCommission += financials.washerEarnings;
      
      // 3. Sumar lo que generó para el negocio
      acc.generatedRevenue += financials.totalPrice;

      // 4. Clasificar Propinas
      if (financials.tipAmount > 0) {
        if (financials.tipMethod === 'efectivo') {
          acc.tipsCash += financials.tipAmount;
        } else {
          acc.tipsYappy += financials.tipAmount;
        }
      }

      return acc;
    }, {
      totalServices: 0,
      totalCommission: 0,
      tipsCash: 0,
      tipsYappy: 0,
      totalToPay: 0,
      generatedRevenue: 0
    });
  };

  const report = calculatePayroll();
  // El total a pagar es: Su Comisión + Las propinas que le entraron por Yappy (porque las de efectivo ya se las quedó)
  const finalPay = report.totalCommission + report.tipsYappy;

  if (!washer) return <div>Cargando perfil...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Encabezado del Perfil */}
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{washer.name}</h1>
          <p className="text-gray-500">ID: {washer.id}</p>
        </div>
        <select 
          value={dateRange} 
          onChange={(e) => setDateRange(e.target.value)}
          className="border p-2 rounded-lg bg-gray-50 font-medium"
        >
          <option value="week">Esta Semana</option>
          <option value="month">Este Mes</option>
          <option value="all">Todo el Historial</option>
        </select>
      </div>

      {/* Tarjetas de Métricas (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 1. Sueldo Base */}
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-600 font-bold uppercase">Sueldo Base (Comisiones)</p>
          <p className="text-2xl font-bold text-blue-900">${report.totalCommission.toFixed(2)}</p>
        </div>

        {/* 2. Propinas Digitales */}
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
          <p className="text-sm text-purple-600 font-bold uppercase">Propinas por Yappy</p>
          <p className="text-2xl font-bold text-purple-900">${report.tipsYappy.toFixed(2)}</p>
          <p className="text-xs text-purple-400">Debes pagarle esto</p>
        </div>

        {/* 3. Propinas Efectivo */}
        <div className="bg-green-50 p-4 rounded-xl border border-green-100 opacity-75">
          <p className="text-sm text-green-600 font-bold uppercase">Propinas en Mano</p>
          <p className="text-2xl font-bold text-green-900">${report.tipsCash.toFixed(2)}</p>
          <p className="text-xs text-green-600">Ya recibido por lavador</p>
        </div>

        {/* 4. TOTAL A PAGAR */}
        <div className="bg-gray-900 p-4 rounded-xl text-white shadow-lg transform scale-105">
          <p className="text-sm text-gray-400 font-bold uppercase">Total a Pagarle</p>
          <p className="text-3xl font-bold text-white">${finalPay.toFixed(2)}</p>
          <p className="text-xs text-gray-400">Comisión + Propina Digital</p>
        </div>
      </div>

      {/* Historial Detallado */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b font-bold text-gray-700">
          Desglose de Servicios ({report.totalServices})
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3">Vehículo</th>
              <th className="p-3">Precio</th>
              <th className="p-3">Comisión Ganada</th>
              <th className="p-3">Propina</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {services.map((svc, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="p-3">
                    <div className="font-medium">{svc.vehicle.model}</div>
                    <div className="text-xs text-gray-500">{svc.createdAt?.toDate().toLocaleDateString()}</div>
                </td>
                <td className="p-3">${svc.financials.totalPrice.toFixed(2)}</td>
                <td className="p-3 font-bold text-blue-600">
                    ${svc.financials.washerEarnings.toFixed(2)}
                </td>
                <td className="p-3">
                    {svc.financials.tipAmount > 0 ? (
                        <span className={`px-2 py-1 rounded text-xs ${svc.financials.tipMethod === 'yappy' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                            ${svc.financials.tipAmount.toFixed(2)} ({svc.financials.tipMethod})
                        </span>
                    ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}