"use client"

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ServiceDocument } from '@/types';

// Estructura para la nómina agrupada
interface WasherPayroll {
  name: string;
  totalCommission: number;
  servicesCount: number;
}

export default function ReportsPanel() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Datos crudos (lista de servicios)
  const [reportData, setReportData] = useState<ServiceDocument[]>([]);
  
  // Datos procesados (nómina por lavador)
  const [payrollData, setPayrollData] = useState<WasherPayroll[]>([]);
  
  const [stats, setStats] = useState({
    totalServices: 0,
    grossIncome: 0,
    netIncome: 0,
    payrollTotal: 0,
    tipsTotal: 0
  });

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      alert("Selecciona fechas");
      return;
    }
    setLoading(true);

    try {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T23:59:59');

      const q = query(
        collection(db, "services"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => d.data() as ServiceDocument);
      setReportData(data);

      // 1. CALCULAR TOTALES GENERALES
      const newStats = data.reduce((acc, curr) => ({
        totalServices: acc.totalServices + 1,
        grossIncome: acc.grossIncome + (curr.financials.totalPrice || 0),
        netIncome: acc.netIncome + (curr.financials.businessEarnings || 0),
        payrollTotal: acc.payrollTotal + (curr.financials.washerEarnings || 0),
        tipsTotal: acc.tipsTotal + (curr.financials.tipAmount || 0)
      }), { totalServices: 0, grossIncome: 0, netIncome: 0, payrollTotal: 0, tipsTotal: 0 });

      setStats(newStats);

      // 2. CALCULAR NÓMINA AGRUPADA POR LAVADOR
      const payrollMap: Record<string, WasherPayroll> = {};

      data.forEach(svc => {
        const name = svc.washerName || 'Desconocido';
        const commission = svc.financials.washerEarnings || 0;

        if (!payrollMap[name]) {
          payrollMap[name] = { name, totalCommission: 0, servicesCount: 0 };
        }
        
        payrollMap[name].totalCommission += commission;
        payrollMap[name].servicesCount += 1;
      });

      // Convertir objeto a array para tablas
      const payrollArray = Object.values(payrollMap).sort((a, b) => b.totalCommission - a.totalCommission);
      setPayrollData(payrollArray);

    } catch (error) {
      console.error("Error reporte:", error);
      alert("Error generando reporte. Revisa la consola.");
    } finally {
      setLoading(false);
    }
  };

  // --- EXPORTAR EXCEL CON DOS PESTAÑAS ---
  const downloadExcel = () => {
    if (reportData.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // Pestaña 1: Detalle de Servicios (Bitácora completa)
    const detailRows = reportData.map(item => ({
        Fecha: item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '',
        Hora: item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleTimeString() : '',
        Lavador: item.washerName,
        Cliente: item.clientName,
        Vehiculo: item.vehicle.model,
        Total_Cobrado: item.financials.totalPrice,
        Pago_Lavador: item.financials.washerEarnings,
        Ganancia_Negocio: item.financials.businessEarnings,
        Propina: item.financials.tipAmount
    }));
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Bitácora Servicios");

    // Pestaña 2: Nómina a Pagar (Resumen por lavador)
    const payrollRows = payrollData.map(p => ({
        Lavador: p.name,
        Carros_Lavados: p.servicesCount,
        TOTAL_A_PAGAR: p.totalCommission
    }));
    const payrollSheet = XLSX.utils.json_to_sheet(payrollRows);
    XLSX.utils.book_append_sheet(workbook, payrollSheet, "Nómina a Pagar");

    XLSX.writeFile(workbook, `Reporte_PuliLavado_${startDate}.xlsx`);
  };

  // --- EXPORTAR PDF CON DOS TABLAS ---
  const downloadPDF = () => {
    if (reportData.length === 0) return;

    const doc = new jsPDF();
    
    // Título y Resumen General
    doc.setFontSize(18);
    doc.text("Reporte Financiero Pulilavado", 14, 22);
    doc.setFontSize(11);
    doc.text(`Período: ${startDate} al ${endDate}`, 14, 30);

    doc.setFillColor(240, 240, 240);
    doc.rect(14, 35, 180, 25, 'F');
    
    doc.setFontSize(10);
    doc.text("RESUMEN GENERAL:", 18, 42);
    doc.text(`Ingresos Totales: $${stats.grossIncome.toFixed(2)}`, 18, 50);
    doc.text(`Ganancia Negocio: $${stats.netIncome.toFixed(2)}`, 80, 50);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Nómina a Repartir: $${stats.payrollTotal.toFixed(2)}`, 18, 56);
    doc.setFont("helvetica", "normal");

    // TABLA 1: Nómina por Lavador (Lo más importante primero)
    doc.text("DETALLE DE PAGOS A LAVADORES:", 14, 70);
    
    const payrollRows = payrollData.map(p => [
        p.name,
        p.servicesCount,
        `$${p.totalCommission.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['Lavador', 'Cant. Autos', 'TOTAL A PAGAR']],
      body: payrollRows,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] } // Verde
    });

    // TABLA 2: Bitácora de Servicios
    // @ts-ignore (Para acceder a lastAutoTable)
    const finalY = doc.lastAutoTable.finalY + 15;
    
    doc.text("BITÁCORA DETALLADA DE SERVICIOS:", 14, finalY);

    const serviceRows = reportData.map(item => [
      item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-',
      item.washerName,
      item.vehicle.model,
      `$${item.financials.totalPrice.toFixed(2)}`,
      `$${item.financials.washerEarnings.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Fecha', 'Lavador', 'Auto', 'Cobrado', 'Comisión']],
      body: serviceRows,
      theme: 'striped'
    });

    doc.save(`Reporte_Nomina_${startDate}.pdf`);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow border space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Generador de Reportes y Nómina</h2>
      
      {/* Selector de Fechas */}
      <div className="flex flex-col md:flex-row gap-4 items-end bg-gray-50 p-4 rounded-lg border">
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Inicio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded w-full"/>
        </div>
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Fin</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded w-full"/>
        </div>
        <button 
            onClick={handleGenerate} 
            disabled={loading} 
            className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 w-full md:w-auto"
        >
            {loading ? 'Procesando...' : 'Calcular Reporte'}
        </button>
      </div>

      {/* Resultados Visuales en Pantalla */}
      {stats.totalServices > 0 && (
        <div className="space-y-6 animate-in fade-in">
            
            {/* Tarjetas Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                    <p className="text-xs text-green-800 font-bold uppercase">Total Nómina</p>
                    <p className="font-bold text-2xl text-green-700">${stats.payrollTotal.toFixed(2)}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <p className="text-xs text-blue-800 font-bold uppercase">Ganancia Negocio</p>
                    <p className="font-bold text-2xl text-blue-700">${stats.netIncome.toFixed(2)}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                    <p className="text-xs text-yellow-800 font-bold uppercase">Propinas</p>
                    <p className="font-bold text-2xl text-yellow-700">${stats.tipsTotal.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <p className="text-xs text-gray-500 font-bold uppercase">Servicios</p>
                    <p className="font-bold text-2xl text-gray-700">{stats.totalServices}</p>
                </div>
            </div>

            {/* Tabla Preview de Nómina */}
            <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 font-bold text-gray-700 border-b">
                    Vista Previa de Pago a Lavadores
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-white text-gray-500 border-b">
                        <tr>
                            <th className="px-4 py-2">Lavador</th>
                            <th className="px-4 py-2 text-right">Carros</th>
                            <th className="px-4 py-2 text-right">A Pagar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {payrollData.map((p, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium">{p.name}</td>
                                <td className="px-4 py-2 text-right text-gray-500">{p.servicesCount}</td>
                                <td className="px-4 py-2 text-right font-bold text-green-600">${p.totalCommission.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Botones de Descarga */}
            <div className="flex flex-col md:flex-row gap-4 pt-4 border-t">
                <button onClick={downloadExcel} className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-green-700 shadow-sm">
                    Descargar Excel Completo
                </button>
                <button onClick={downloadPDF} className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-red-700 shadow-sm">
                    Descargar Reporte PDF
                </button>
            </div>
        </div>
      )}
    </div>
  );
}