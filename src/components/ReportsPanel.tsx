"use client"

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ServiceDocument } from '@/types';
import { 
    FileSpreadsheet, 
    FileText, 
    Search, 
    DollarSign, 
    CalendarDays, 
    TrendingUp, 
    Wallet,       // Efectivo
    Smartphone,   // Yappy
    CreditCard,   // Tarjeta
    Landmark      // ACH/Banco
} from 'lucide-react';

interface WasherSummary {
  name: string;
  count: number;
  commission: number; // Nómina a pagar
  tips: number;       // Solo control (Tarjeta amarilla)
}

export default function ReportsPanel() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [consolidatedData, setConsolidatedData] = useState<WasherSummary[]>([]);
  
  const [globalStats, setGlobalStats] = useState({
    totalServices: 0,
    totalPayroll: 0,   // A Pagar Lavadores
    totalBusiness: 0,  // Ganancia Negocio
    totalTips: 0,      // Total Propinas
    dailyAverage: 0,   // Promedio autos/día
    
    // DESGLOSE DE COBROS
    incomeCash: 0,     // Efectivo
    incomeYappy: 0,    // Yappy
    incomeCard: 0,     // Tarjeta
    incomeACH: 0       // Transferencia
  });

  // --- FUNCIÓN PRINCIPAL DE CÁLCULO ---
  const fetchReportData = async (startInput: string, endInput: string) => {
    if (!startInput || !endInput) {
      alert("Selecciona un rango de fechas.");
      return;
    }
    setLoading(true);

    try {
      const start = new Date(startInput + 'T00:00:00');
      const end = new Date(endInput + 'T23:59:59');

      // Días de diferencia
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

      const q = query(
        collection(db, "services"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => d.data() as ServiceDocument);

      // --- VARIABLES TEMPORALES ---
      const summaryMap: Record<string, WasherSummary> = {};
      let gPayroll = 0;
      let gBusiness = 0;
      let gTips = 0;

      // Desglose de Pagos
      let payCash = 0;
      let payYappy = 0;
      let payCard = 0;
      let payACH = 0;

      data.forEach(svc => {
        // 1. Datos Financieros Generales
        const name = (svc.washerName || 'Desconocido').trim();
        const comm = svc.financials.washerEarnings || 0;
        const biz = svc.financials.businessEarnings || 0;
        const tip = svc.financials.tipAmount || 0;
        const total = svc.financials.totalPrice || 0;

        gPayroll += comm;
        gBusiness += biz;
        gTips += tip;

        // 2. Clasificación por Método de Pago
        // Si no tiene método (datos viejos), asumimos Efectivo
        const method = svc.paymentMethod || 'Efectivo';
        
        if (method === 'Efectivo') payCash += total;
        else if (method === 'Yappy') payYappy += total;
        else if (method === 'Tarjeta') payCard += total;
        else if (method === 'Transferencia') payACH += total;
        
        // 3. Agrupación por Lavador
        if (!summaryMap[name]) {
          summaryMap[name] = { name, count: 0, commission: 0, tips: 0 };
        }
        summaryMap[name].count += 1;
        summaryMap[name].commission += comm;
        summaryMap[name].tips += tip;
      });

      const summaryArray = Object.values(summaryMap).sort((a, b) => b.commission - a.commission);
      
      setConsolidatedData(summaryArray);
      setGlobalStats({
        totalServices: data.length,
        totalPayroll: gPayroll,
        totalBusiness: gBusiness,
        totalTips: gTips,
        dailyAverage: data.length > 0 ? (data.length / (diffDays || 1)) : 0,
        
        // Asignar desglose
        incomeCash: payCash,
        incomeYappy: payYappy,
        incomeCard: payCard,
        incomeACH: payACH
      });

    } catch (error) {
      console.error("Error:", error);
      alert("Error al generar reporte.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualGenerate = () => fetchReportData(startDate, endDate);

  const handleLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6); 
    const sStr = start.toISOString().split('T')[0];
    const eStr = end.toISOString().split('T')[0];
    setStartDate(sStr);
    setEndDate(eStr);
    fetchReportData(sStr, eStr);
  };

  // --- EXPORTAR EXCEL (Actualizado con desglose) ---
  const downloadExcel = () => {
    if (consolidatedData.length === 0) return;
    const workbook = XLSX.utils.book_new();

    // Hoja 1: Resumen de Negocio
    const statsRows = [
      { Concepto: "--- MÉTRICAS GENERALES ---", Valor: "" },
      { Concepto: "Ganancia Neta (Negocio)", Valor: globalStats.totalBusiness },
      { Concepto: "Nómina a Pagar", Valor: globalStats.totalPayroll },
      { Concepto: "Total Autos", Valor: globalStats.totalServices },
      { Concepto: "", Valor: "" },
      { Concepto: "--- DESGLOSE DE COBROS (Entradas) ---", Valor: "" },
      { Concepto: "Efectivo (Caja)", Valor: globalStats.incomeCash },
      { Concepto: "Yappy", Valor: globalStats.incomeYappy },
      { Concepto: "Tarjeta (POS)", Valor: globalStats.incomeCard },
      { Concepto: "Transferencia (ACH)", Valor: globalStats.incomeACH },
      { Concepto: "TOTAL INGRESOS BRUTOS", Valor: (globalStats.incomeCash + globalStats.incomeYappy + globalStats.incomeCard + globalStats.incomeACH) },
    ];
    const statsSheet = XLSX.utils.json_to_sheet(statsRows);
    // Ajustar ancho columnas
    statsSheet['!cols'] = [{wch:35}, {wch:15}];
    XLSX.utils.book_append_sheet(workbook, statsSheet, "Resumen Financiero");

    // Hoja 2: Nómina
    const rows = consolidatedData.map(w => ({
        Lavador: w.name,
        Autos_Lavados: w.count,
        A_PAGAR: w.commission,
        FIRMA_RECIBIDO: ''
    }));
    rows.push({
        Lavador: 'TOTALES',
        Autos_Lavados: rows.reduce((a, b) => a + b.Autos_Lavados, 0),
        A_PAGAR: rows.reduce((a, b) => a + b.A_PAGAR, 0),
        FIRMA_RECIBIDO: ''
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [{wch:25}, {wch:12}, {wch:15}, {wch:30}];
    XLSX.utils.book_append_sheet(workbook, sheet, "Nómina");

    XLSX.writeFile(workbook, `Cierre_Caja_${startDate}.xlsx`);
  };

  // --- EXPORTAR PDF (Actualizado con desglose) ---
  const downloadPDF = () => {
    if (consolidatedData.length === 0) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Reporte de Cierre & Nómina", 14, 20);
    doc.setFontSize(10);
    doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);

    // // --- CAJA DE RESUMEN (Más grande para que quepa todo) ---
    // doc.setFillColor(245, 247, 250);
    // doc.rect(14, 35, 180, 50, 'F'); // Caja más alta
    
    // doc.setFontSize(10);
    // doc.setFont("helvetica", "bold");
    // doc.text("RESUMEN FINANCIERO:", 18, 42);
    
    // // Columna Izquierda (Métodos de Pago)
    // doc.setFont("helvetica", "normal");
    // doc.text(`Efectivo: $${globalStats.incomeCash.toFixed(2)}`, 18, 50);
    // doc.text(`Yappy: $${globalStats.incomeYappy.toFixed(2)}`, 18, 56);
    // doc.text(`Tarjeta: $${globalStats.incomeCard.toFixed(2)}`, 18, 62);
    // doc.text(`ACH: $${globalStats.incomeACH.toFixed(2)}`, 18, 68);
    
    // // Columna Derecha (Totales)
    // doc.setFont("helvetica", "bold");
    // doc.text(`Ganancia Negocio: $${globalStats.totalBusiness.toFixed(2)}`, 100, 50);
    // doc.text(`Nómina a Pagar: $${globalStats.totalPayroll.toFixed(2)}`, 100, 56);
    // doc.text(`Total Ingresos: $${(globalStats.totalBusiness + globalStats.totalPayroll).toFixed(2)}`, 100, 68);

    // Tabla de Nómina
    const tableRows = consolidatedData.map(w => [
        w.name,
        w.count,
        `$${w.commission.toFixed(2)}`,
        '' 
    ]);

    autoTable(doc, {
      startY: 50, // Empezar más abajo porque la caja de resumen creció
      head: [['Lavador', 'Autos', 'A PAGAR', 'FIRMA / RECIBIDO']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], halign: 'center' },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold', fillColor: [240, 253, 244] },
        3: { cellWidth: 'auto' }
      },
      styles: { minCellHeight: 18, valign: 'middle' },
      foot: [[ 'TOTALES', globalStats.totalServices, `$${globalStats.totalPayroll.toFixed(2)}`, '' ]],
      footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold' }
    });

    doc.save(`Reporte_Cierre_${startDate}.pdf`);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow border space-y-6">
      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
        <DollarSign className="w-6 h-6 text-blue-600" />
        Reportes Gerenciales y Nómina
      </h2>
      
      {/* Controles */}
      <div className="flex flex-col xl:flex-row gap-4 items-end bg-gray-50 p-4 rounded-lg border">
        <button 
            onClick={handleLast7Days}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm w-full xl:w-auto justify-center whitespace-nowrap"
        >
            <CalendarDays className="w-4 h-4" />
            Últimos 7 Días
        </button>

        <div className="h-8 w-px bg-gray-300 hidden xl:block mx-2"></div>

        <div className="flex gap-2 w-full">
            <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Desde</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded w-full"/>
            </div>
            <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hasta</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded w-full"/>
            </div>
        </div>
        
        <button 
            onClick={handleManualGenerate} 
            disabled={loading} 
            className="bg-gray-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-800 w-full xl:w-auto flex items-center justify-center gap-2 whitespace-nowrap"
        >
            <Search className="w-4 h-4" />
            {loading ? '...' : 'Calcular Rango'}
        </button>
      </div>

      {consolidatedData.length > 0 && (
        <div className="animate-in fade-in space-y-8">
            
            {/* --- SECCIÓN 1: KPI PRINCIPALES --- */}
            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Resumen General</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* Ganancia Negocio */}
                    <div className="bg-blue-600 text-white p-5 rounded-xl shadow-lg flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <p className="text-blue-100 text-xs font-bold uppercase tracking-wider">Ganancia Negocio</p>
                            <TrendingUp className="w-5 h-5 text-blue-300" />
                        </div>
                        <p className="text-3xl font-extrabold mt-1">${globalStats.totalBusiness.toFixed(2)}</p>
                    </div>

                    {/* Nómina */}
                    <div className="bg-green-600 text-white p-5 rounded-xl shadow-lg flex flex-col justify-between">
                        <p className="text-green-100 text-xs font-bold uppercase tracking-wider">Total Nómina</p>
                        <p className="text-3xl font-extrabold mt-1">${globalStats.totalPayroll.toFixed(2)}</p>
                    </div>
                    
                    {/* Promedio */}
                    <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Promedio Diario</p>
                        <p className="text-3xl font-bold text-gray-800 mt-1">{globalStats.dailyAverage.toFixed(1)}</p>
                        <p className="text-xs text-gray-400">Autos</p>
                    </div>

                    {/* Propinas Control */}
                    <div className="bg-yellow-50 border border-yellow-200 p-5 rounded-xl shadow-sm">
                        <p className="text-yellow-800 text-xs font-bold uppercase tracking-wider">Propinas (Ref)</p>
                        <p className="text-3xl font-bold text-yellow-700 mt-1">${globalStats.totalTips.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN 2: DESGLOSE DE COBROS (NUEVO) --- */}
            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Desglose por Método de Pago</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* 1. Efectivo */}
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-4">
                        <div className="p-3 bg-emerald-100 rounded-full text-emerald-600">
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-emerald-600 font-bold uppercase">Efectivo</p>
                            <p className="text-xl font-bold text-gray-800">${globalStats.incomeCash.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* 2. Yappy */}
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                            <Smartphone className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-blue-600 font-bold uppercase">Yappy</p>
                            <p className="text-xl font-bold text-gray-800">${globalStats.incomeYappy.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* 3. Tarjeta */}
                    <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl flex items-center gap-4">
                        <div className="p-3 bg-purple-100 rounded-full text-purple-600">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-purple-600 font-bold uppercase">Tarjeta</p>
                            <p className="text-xl font-bold text-gray-800">${globalStats.incomeCard.toFixed(2)}</p>
                        </div>
                    </div>

                     {/* 4. Transferencia */}
                     <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex items-center gap-4">
                        <div className="p-3 bg-gray-200 rounded-full text-gray-600">
                            <Landmark className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">ACH</p>
                            <p className="text-xl font-bold text-gray-800">${globalStats.incomeACH.toFixed(2)}</p>
                        </div>
                    </div>

                </div>
            </div>

            {/* Botones Descarga */}
            <div className="flex flex-col sm:flex-row gap-3 border-t pt-4">
                <button onClick={downloadExcel} className="flex-1 bg-green-700 hover:bg-green-800 text-white py-3 rounded-lg font-bold shadow transition flex items-center justify-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" />
                    Descargar Cierre (Excel)
                </button>
                <button onClick={downloadPDF} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold shadow transition flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5" />
                    Descargar Nómina (PDF)
                </button>
            </div>

            {/* Tabla Vista Previa */}
            <div className="border rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 uppercase flex justify-between">
                    <span>Detalle de Nómina</span>
                    <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-500">
                        Total Autos: {globalStats.totalServices}
                    </span>
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