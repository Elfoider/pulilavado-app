"use client"

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ServiceDocument } from '@/types';

// Estructura optimizada para el resumen totalizado
interface WasherSummary {
  name: string;
  count: number;          // Cantidad de carros
  commission: number;     // Total ganado por comisión
  tips: number;           // Total ganado en propinas
  totalEarnings: number;  // Comisión + Propinas
}

export default function ReportsPanel() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Datos crudos (para el archivo, por si acaso)
  const [rawData, setRawData] = useState<ServiceDocument[]>([]);
  
  // Datos consolidados (1 fila por lavador)
  const [consolidatedData, setConsolidatedData] = useState<WasherSummary[]>([]);
  
  const [globalStats, setGlobalStats] = useState({
    totalIncome: 0,   // Dinero que entró a caja (Precio servicios)
    totalNet: 0,      // Ganancia del negocio
    totalPayroll: 0,  // Total a repartir a empleados
  });

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      alert("Selecciona un rango de fechas.");
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
      setRawData(data);

      // --- 1. LÓGICA DE CONSOLIDACIÓN (Agrupar por nombre) ---
      const summaryMap: Record<string, WasherSummary> = {};
      let gIncome = 0;
      let gNet = 0;
      let gPayroll = 0; // Comisión + Propina

      data.forEach(svc => {
        // Normalizar nombre (quitar espacios extra)
        const name = (svc.washerName || 'Desconocido').trim();
        
        // Valores individuales
        const comm = svc.financials.washerEarnings || 0;
        const tip = svc.financials.tipAmount || 0;
        const price = svc.financials.totalPrice || 0;
        const business = svc.financials.businessEarnings || 0;

        // Sumar a globales
        gIncome += price;
        gNet += business;
        
        // Inicializar lavador si no existe en el mapa
        if (!summaryMap[name]) {
          summaryMap[name] = { 
            name, 
            count: 0, 
            commission: 0, 
            tips: 0, 
            totalEarnings: 0 
          };
        }

        // Acumular valores al lavador
        summaryMap[name].count += 1;
        summaryMap[name].commission += comm;
        summaryMap[name].tips += tip;
        summaryMap[name].totalEarnings += (comm + tip);
      });

      // Convertir Mapa a Array y ordenar por quién ganó más
      const summaryArray = Object.values(summaryMap).sort((a, b) => b.totalEarnings - a.totalEarnings);
      setConsolidatedData(summaryArray);
      
      // Calcular total de nómina real (suma de todos los totales de lavadores)
      gPayroll = summaryArray.reduce((acc, curr) => acc + curr.totalEarnings, 0);

      setGlobalStats({
        totalIncome: gIncome,
        totalNet: gNet,
        totalPayroll: gPayroll
      });

    } catch (error) {
      console.error("Error:", error);
      alert("Error al generar reporte.");
    } finally {
      setLoading(false);
    }
  };

  // --- EXPORTAR EXCEL CONSOLIDADO ---
  const downloadExcel = () => {
    if (consolidatedData.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // HOJA 1: RESUMEN DE PAGO (Lo importante)
    const summaryRows = consolidatedData.map(w => ({
        Lavador: w.name,
        Autos_Lavados: w.count,
        Total_Comision: w.commission,
        Total_Propinas: w.tips,
        GRAN_TOTAL_RECIBIDO: w.totalEarnings
    }));

    // Agregar fila de totales al final del Excel
    summaryRows.push({
        Lavador: 'TOTALES',
        Autos_Lavados: summaryRows.reduce((a, b) => a + b.Autos_Lavados, 0),
        Total_Comision: summaryRows.reduce((a, b) => a + b.Total_Comision, 0),
        Total_Propinas: summaryRows.reduce((a, b) => a + b.Total_Propinas, 0),
        GRAN_TOTAL_RECIBIDO: summaryRows.reduce((a, b) => a + b.GRAN_TOTAL_RECIBIDO, 0)
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "NÓMINA TOTALIZADA");

    // HOJA 2: DETALLE (Opcional, por si se necesita auditar)
    const detailRows = rawData.map(item => ({
        Fecha: item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '',
        Lavador: item.washerName,
        Auto: item.vehicle.model,
        Total: item.financials.totalPrice
    }));
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Auditoria (Detalle)");

    XLSX.writeFile(workbook, `Nomina_Consolidada_${startDate}.xlsx`);
  };

  // --- EXPORTAR PDF CONSOLIDADO ---
  const downloadPDF = () => {
    if (consolidatedData.length === 0) return;

    const doc = new jsPDF();
    
    // Encabezado
    doc.setFontSize(16);
    doc.text("Resumen de Nómina - Pulilavado", 14, 20);
    doc.setFontSize(10);
    doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);

    // Caja de Resumen Financiero del Negocio
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 35, 180, 20, 'F');
    doc.rect(14, 35, 180, 20, 'S'); // Borde

    doc.setFont("helvetica", "bold");
    doc.text(`Ingresos Negocio: $${globalStats.totalNet.toFixed(2)}`, 20, 48);
    doc.text(`Total a Pagar Empleados: $${globalStats.totalPayroll.toFixed(2)}`, 100, 48);
    doc.setFont("helvetica", "normal");

    // TABLA PRINCIPAL (CONSOLIDADA)
    doc.text("DETALLE DE PAGOS (TOTALIZADO POR LAVADOR):", 14, 65);

    const tableRows = consolidatedData.map(w => [
        w.name,
        w.count,
        `$${w.commission.toFixed(2)}`,
        `$${w.tips.toFixed(2)}`,
        `$${w.totalEarnings.toFixed(2)}` // Columna Negrita (lógica visual)
    ]);

    autoTable(doc, {
      startY: 70,
      head: [['Lavador', 'Autos', 'Comisión', 'Propinas', 'TOTAL A PAGAR']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], halign: 'center' }, // Azul
      columnStyles: {
        0: { fontStyle: 'bold' }, // Nombre en negrita
        4: { fontStyle: 'bold', fillColor: [240, 255, 240] } // Columna Total con fondo verde claro
      },
      foot: [[
        'TOTALES',
        consolidatedData.reduce((a,b)=>a+b.count,0),
        `$${consolidatedData.reduce((a,b)=>a+b.commission,0).toFixed(2)}`,
        `$${consolidatedData.reduce((a,b)=>a+b.tips,0).toFixed(2)}`,
        `$${globalStats.totalPayroll.toFixed(2)}`
      ]],
      footStyles: { fillColor: [200, 200, 200], textColor: [0,0,0], fontStyle: 'bold' }
    });

    doc.save(`Nomina_Totalizada_${startDate}.pdf`);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow border space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Reporte de Nómina Consolidado</h2>
      
      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-end bg-gray-50 p-4 rounded-lg border">
        <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Desde</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded w-full"/>
        </div>
        <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hasta</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded w-full"/>
        </div>
        <button 
            onClick={handleGenerate} 
            disabled={loading} 
            className="bg-gray-900 text-white px-6 py-2 rounded font-bold hover:bg-gray-800 w-full md:w-auto"
        >
            {loading ? 'Calculando...' : 'Ver Totales'}
        </button>
      </div>

      {/* Visualización en Pantalla (Tabla resumen simple) */}
      {consolidatedData.length > 0 && (
        <div className="animate-in fade-in space-y-4">
            
            {/* Tarjetas Top */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg">
                    <p className="text-blue-100 text-xs font-bold uppercase">Total a Repartir (Nómina)</p>
                    <p className="text-3xl font-bold">${globalStats.totalPayroll.toFixed(2)}</p>
                </div>
                <div className="bg-white border p-4 rounded-xl shadow-sm">
                    <p className="text-gray-400 text-xs font-bold uppercase">Ganancia Neta Local</p>
                    <p className="text-3xl font-bold text-gray-800">${globalStats.totalNet.toFixed(2)}</p>
                </div>
            </div>

            {/* Tabla Consolidada */}
            <div className="border rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Lavador</th>
                            <th className="px-4 py-3 text-center">Autos</th>
                            <th className="px-4 py-3 text-right">Comisión</th>
                            <th className="px-4 py-3 text-right">Propinas</th>
                            <th className="px-4 py-3 text-right bg-green-50 text-green-800">Total a Pagar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {consolidatedData.map((w, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-bold text-gray-800">{w.name}</td>
                                <td className="px-4 py-3 text-center text-gray-500">{w.count}</td>
                                <td className="px-4 py-3 text-right text-gray-600">${w.commission.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right text-yellow-600 font-medium">${w.tips.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50 text-lg">
                                    ${w.totalEarnings.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Botones de Descarga */}
            <div className="flex gap-4 pt-2">
                <button onClick={downloadExcel} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold shadow transition">
                    Descargar Excel
                </button>
                <button onClick={downloadPDF} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold shadow transition">
                    Descargar PDF
                </button>
            </div>
        </div>
      )}
    </div>
  );
}