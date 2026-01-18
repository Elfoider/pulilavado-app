"use client"

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ServiceDocument } from '@/types';
import { FileSpreadsheet, FileText, Search } from 'lucide-react';

interface WasherSummary {
  name: string;
  count: number;
  commission: number; // Esto es lo que se paga en Nómina
  tips: number;       // Esto es solo control (ya pagado)
}

export default function ReportsPanel() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Datos procesados (1 fila por lavador)
  const [consolidatedData, setConsolidatedData] = useState<WasherSummary[]>([]);
  
  const [globalStats, setGlobalStats] = useState({
    totalServices: 0,
    totalPayroll: 0,  // Solo Comisiones
    totalTips: 0      // Solo Propinas
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

      // --- LÓGICA DE AGRUPACIÓN ---
      const summaryMap: Record<string, WasherSummary> = {};
      let gPayroll = 0;
      let gTips = 0;

      data.forEach(svc => {
        const name = (svc.washerName || 'Desconocido').trim();
        
        // Valores individuales
        const comm = svc.financials.washerEarnings || 0;
        const tip = svc.financials.tipAmount || 0;

        // Totales globales
        gPayroll += comm; // Solo sumamos comisiones al total a pagar
        gTips += tip;
        
        if (!summaryMap[name]) {
          summaryMap[name] = { name, count: 0, commission: 0, tips: 0 };
        }

        summaryMap[name].count += 1;
        summaryMap[name].commission += comm;
        summaryMap[name].tips += tip;
      });

      // Convertir a Array y ordenar por ganancia (comisión)
      const summaryArray = Object.values(summaryMap).sort((a, b) => b.commission - a.commission);
      
      setConsolidatedData(summaryArray);
      setGlobalStats({
        totalServices: data.length,
        totalPayroll: gPayroll,
        totalTips: gTips
      });

    } catch (error) {
      console.error("Error:", error);
      alert("Error al generar reporte.");
    } finally {
      setLoading(false);
    }
  };

  // --- 1. EXPORTAR EXCEL (Restaurado) ---
  const downloadExcel = () => {
    if (consolidatedData.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // Crear filas para Excel
    const rows = consolidatedData.map(w => ({
        Lavador: w.name,
        Autos_Lavados: w.count,
        Propinas_Control: w.tips, // Informativo
        NOMINA_A_PAGAR: w.commission // Lo importante
    }));

    // Agregar fila de Totales
    rows.push({
        Lavador: 'TOTALES',
        Autos_Lavados: rows.reduce((a, b) => a + b.Autos_Lavados, 0),
        Propinas_Control: rows.reduce((a, b) => a + b.Propinas_Control, 0),
        NOMINA_A_PAGAR: rows.reduce((a, b) => a + b.NOMINA_A_PAGAR, 0)
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    
    // Ajustar ancho de columnas (opcional pero se ve mejor)
    const wscols = [{wch:20}, {wch:15}, {wch:20}, {wch:20}];
    sheet['!cols'] = wscols;

    XLSX.utils.book_append_sheet(workbook, sheet, "Nómina Resumen");
    XLSX.writeFile(workbook, `Nomina_PuliLavado_${startDate}.xlsx`);
  };

  // --- 2. EXPORTAR PDF ---
  const downloadPDF = () => {
    if (consolidatedData.length === 0) return;

    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Reporte de Nómina - Comisiones", 14, 20);
    doc.setFontSize(10);
    doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);

    // Nota de advertencia sobre propinas
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text("NOTA: Las propinas se muestran solo como referencia y NO se suman al total de nómina.", 14, 35);
    doc.setTextColor(0);

    // Tabla Principal
    const tableRows = consolidatedData.map(w => [
        w.name,
        w.count,
        `$${w.commission.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Lavador', 'Autos', 'A PAGAR (Nómina)']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] }, // Gris oscuro
      columnStyles: {
        2: { fontStyle: 'bold', fillColor: [220, 252, 231], textColor: [21, 128, 61] } // Nómina Verde
      },
      foot: [[
        'TOTALES',
        globalStats.totalServices,
        `$${globalStats.totalPayroll.toFixed(2)}`
      ]],
      footStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold' }
    });

    doc.save(`Nomina_Resumen_${startDate}.pdf`);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow border space-y-6">
      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
        <FileText className="w-6 h-6 text-blue-600" />
        Reportes y Nómina
      </h2>
      
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
            className="bg-gray-900 text-white px-6 py-2 rounded font-bold hover:bg-gray-800 w-full md:w-auto flex items-center justify-center gap-2"
        >
            <Search className="w-4 h-4" />
            {loading ? '...' : 'Generar Tabla'}
        </button>
      </div>

      {/* Resultados */}
      {consolidatedData.length > 0 && (
        <div className="animate-in fade-in space-y-6">
            
            {/* Tarjetas Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-600 text-white p-5 rounded-xl shadow-lg flex flex-col justify-between">
                    <p className="text-green-100 text-xs font-bold uppercase tracking-wider">Total Nómina a Pagar</p>
                    <p className="text-3xl font-extrabold mt-1">${globalStats.totalPayroll.toFixed(2)}</p>
                    <p className="text-xs text-green-200 mt-2">* Solo Comisiones</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 p-5 rounded-xl shadow-sm">
                    <p className="text-yellow-800 text-xs font-bold uppercase tracking-wider">Control Propinas</p>
                    <p className="text-3xl font-bold text-yellow-700 mt-1">${globalStats.totalTips.toFixed(2)}</p>
                    <p className="text-xs text-yellow-600 mt-2">* Ya pagadas por cliente</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl shadow-sm">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Servicios Realizados</p>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{globalStats.totalServices}</p>
                </div>
            </div>

            {/* Botones de Descarga (AQUÍ ESTÁ EL DE EXCEL) */}
            <div className="flex flex-col sm:flex-row gap-3">
                <button 
                    onClick={downloadExcel} 
                    className="flex-1 bg-green-700 hover:bg-green-800 text-white py-3 rounded-lg font-bold shadow transition flex items-center justify-center gap-2"
                >
                    <FileSpreadsheet className="w-5 h-5" />
                    Descargar Excel
                </button>
                <button 
                    onClick={downloadPDF} 
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold shadow transition flex items-center justify-center gap-2"
                >
                    <FileText className="w-5 h-5" />
                    Descargar PDF
                </button>
            </div>

            {/* Tabla Visual */}
            <div className="border rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 uppercase">
                    Vista Previa de Nómina
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white border-b text-gray-500 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3">Lavador</th>
                                <th className="px-4 py-3 text-center">Autos</th>

                                <th className="px-4 py-3 text-right bg-green-50 text-green-800">A PAGAR</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {consolidatedData.map((w, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-bold text-gray-800">{w.name}</td>
                                    <td className="px-4 py-3 text-center text-gray-500">{w.count}</td>

                                    <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50 text-base">
                                        ${w.commission.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold text-gray-700">
                             <tr>
                                <td className="px-4 py-3">TOTALES</td>
                                <td className="px-4 py-3 text-center">{globalStats.totalServices}</td>

                                <td className="px-4 py-3 text-right text-green-700">${globalStats.totalPayroll.toFixed(2)}</td>
                             </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}