"use client"

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { ServiceDocument } from '@/types';

export default function ReportsPanel() {
  const [loading, setLoading] = useState(false);
  
  // Fechas para el filtro
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Estadísticas rápidas para mostrar en pantalla
  const [stats, setStats] = useState({
    totalServices: 0,
    grossIncome: 0,      // Ingreso Bruto (Total cobrado)
    payrollTotal: 0,     // Nómina (Comisiones)
    netIncome: 0,        // Ganancia Neta del Negocio
    tipsTotal: 0         // Total Propinas (Informativo)
  });

  const generateReport = async (download: boolean) => {
    if (!startDate || !endDate) {
      alert("Por favor selecciona un rango de fechas");
      return;
    }

    setLoading(true);

    try {
      // 1. Configurar rango de fechas (Inicio del día 1 al Final del día 2)
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // 2. Consulta a Firebase
      const q = query(
        collection(db, "services"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc")
      );

      const querySnapshot = await getDocs(q);
      const services = querySnapshot.docs.map(doc => doc.data() as ServiceDocument);

      // 3. Calcular Totales (Para visualización en pantalla)
      const newStats = services.reduce((acc, curr) => {
        return {
          totalServices: acc.totalServices + 1,
          grossIncome: acc.grossIncome + curr.financials.totalPrice,
          payrollTotal: acc.payrollTotal + curr.financials.washerEarnings,
          netIncome: acc.netIncome + curr.financials.businessEarnings,
          tipsTotal: acc.tipsTotal + curr.financials.tipAmount
        };
      }, { totalServices: 0, grossIncome: 0, payrollTotal: 0, netIncome: 0, tipsTotal: 0 });

      setStats(newStats);

      // 4. Si el usuario pidió descargar Excel
      if (download) {
        exportToExcel(services);
      }

    } catch (error) {
      console.error("Error generando reporte:", error);
      alert("Error al generar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = (data: ServiceDocument[]) => {
    // A. Aplanar los datos para Excel (Convertir objetos anidados en filas simples)
    const rows = data.map(item => ({
      Fecha: item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleString() : '',
      Lavador: item.washerName,
      Cliente: item.clientName,
      Vehiculo: `${item.vehicle.model} (${item.vehicle.color})`,
      Pista: item.vehicle.bay,
      Metodo_Pago: item.financials.paymentMethod,
      Precio_Servicio: item.financials.totalPrice,
      Comision_Lavador: item.financials.washerEarnings,
      Ganancia_Negocio: item.financials.businessEarnings,
      Propina_Monto: item.financials.tipAmount,
      Propina_Metodo: item.financials.tipMethod || '-',
      Observaciones: item.observations
    }));

    // B. Crear libro de trabajo
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Pulilavado");

    // C. Descargar archivo
    XLSX.writeFile(workbook, `Reporte_${startDate}_al_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Generador de Reportes</h2>
        
        {/* Filtros de Fecha */}
        <div className="flex gap-4 items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Desde</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Hasta</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>
          
          <button 
            onClick={() => generateReport(false)}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium"
          >
            {loading ? 'Calculando...' : 'Ver Resumen'}
          </button>

          <button 
            onClick={() => generateReport(true)}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-medium flex items-center gap-2"
          >
            <span>📥 Descargar Excel</span>
          </button>
        </div>

        {/* Tarjetas de Resumen (Dashboard Financiero) */}
        {stats.totalServices > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 bg-gray-50 rounded-lg border">
              <p className="text-gray-500 text-xs uppercase font-bold">Total Ingresos</p>
              <p className="text-2xl font-bold text-gray-900">${stats.grossIncome.toFixed(2)}</p>
            </div>
            
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <p className="text-red-500 text-xs uppercase font-bold">A Pagar (Nómina)</p>
              <p className="text-2xl font-bold text-red-700">${stats.payrollTotal.toFixed(2)}</p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
              <p className="text-green-600 text-xs uppercase font-bold">Ganancia Neta</p>
              <p className="text-2xl font-bold text-green-700">${stats.netIncome.toFixed(2)}</p>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
              <p className="text-yellow-600 text-xs uppercase font-bold">Propinas Totales</p>
              <p className="text-2xl font-bold text-yellow-700">${stats.tipsTotal.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}