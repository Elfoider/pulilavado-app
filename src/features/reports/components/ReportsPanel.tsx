"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/infrastructure/firebase/client";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import {
  TrendingUp,
  Car,
  Building2,
  DollarSign,
  Banknote,
  FileText,
} from "lucide-react";

// --- IMPORTAR LIBRERÍAS DE PDF ---
import jsPDF from "jspdf";
import { normalFont, boldFont } from "@/features/reports/assets/fonts";
import autoTable, { type RowInput } from "jspdf-autotable";
import { enqueueSnackbar } from "notistack";
import { formatMoney } from "@/shared/lib/utils";
import { loadCashReport } from "@/features/reports/infrastructure/loadCash";
import { financialPDF } from "@/features/reports/exports/pdf";
import { financialExcel, saveExcel } from "@/features/reports/exports/excel";
import { cashMovementBreakdown, type PeriodCash, type FinancialReport } from "@/features/reports/domain/cash";
import { addDays, businessDay, CashAdvance, dayStart, netPayroll, weekOf } from "@/features/operations/domain/treasury-model";
import { loadTreasuryReport } from "@/features/reports/infrastructure/loadTreasury";
import { paymentParts } from "@/features/operations/domain/model";
import { type TreasuryReport } from "@/features/reports/domain/treasury";
import ActivitySummary from "@/features/reports/components/ActivitySummary";
import { summarizeActivity } from "@/features/reports/domain/activity";
import HelpTip from "@/shared/ui/HelpTip";
import SectionLink from "@/shared/navigation/SectionLink";

// Interfaces
interface PayrollItem {
  washerId: string;
  washerName: string;
  count: number;
  totalPay: number; // Comisión bruta
  advances: number;
  netPay: number;
  excess: number;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // CONTROL DE FECHAS
  const [filterType, setFilterType] = useState<"today" | "week" | "custom">(
    "today",
  );
  const [customStart, setCustomStart] = useState<string>(
    businessDay(),
  );
  const [customEnd, setCustomEnd] = useState<string>(
    businessDay(),
  );

  // ESTADOS FINANCIEROS
  const [serviceSales, setServiceSales] = useState(0);
  const [netBusinessProfit, setNetBusinessProfit] = useState(0);
  const [totalTips, setTotalTips] = useState(0);

  // Desgloses
  const [incomeByMethod, setIncomeByMethod] = useState({
    Efectivo: 0,
    Yappy: 0,
    Tarjeta: 0,
    Transferencia: 0,
  });
  const [tipsByMethod, setTipsByMethod] = useState({
    Efectivo: 0,
    Yappy: 0,
    Tarjeta: 0,
    Transferencia: 0,
  });

  const [activity,setActivity]=useState<ReturnType<typeof summarizeActivity> | null>(null);
  const [periodCash, setPeriodCash] = useState<PeriodCash>();
  const [cashBreakdown, setCashBreakdown] = useState(() => cashMovementBreakdown([]));

  // NÓMINA
  const [payrollList, setPayrollList] = useState<PayrollItem[]>([]);
  const [totalPayrollToPay, setTotalPayrollToPay] = useState(0);
  const [advanceRows, setAdvanceRows] = useState<CashAdvance[]>([]);
  const [weekly, setWeekly] = useState<TreasuryReport>();
  const [excludedWasherIds, setExcludedWasherIds] = useState<string[]>([]);
  const [reportError, setReportError] = useState("");
  const [loadedReportKey, setLoadedReportKey] = useState("");
  const reportRequest = useRef(0);
  const displayedStart = filterType === "custom" ? customStart : filterType === "week" ? weekOf(businessDay()) : businessDay();
  const displayedEnd = filterType === "custom" ? customEnd : businessDay();
  const reportKey = `${filterType}|${displayedStart}|${displayedEnd}`;
  const reportReady = !loading && !reportError && loadedReportKey === reportKey;
  const cashLabel = !reportReady ? "—" : periodCash?.balance == null ? "No disponible" : formatMoney(periodCash.balance);
  const netCashLabel = !reportReady ? "—" : formatMoney(periodCash?.generated ?? periodCash?.net ?? 0);
  const selectedPayroll = payrollList.filter(
    (item) => !excludedWasherIds.includes(item.washerId),
  );
  const selectedPayrollTotal = selectedPayroll.reduce(
    (sum, item) => sum + item.netPay, 0,
  );

  // --- FUNCIÓN DE CÁLCULO (IGUAL QUE ANTES) ---
  const fetchReport = useCallback(async () => {
    const requestId = ++reportRequest.current;
    setLoading(true);
    setReportError("");
    try {
      const today = businessDay();
      const start = filterType === "custom" ? customStart : filterType === "week" ? weekOf(today) : today;
      const end = filterType === "custom" ? customEnd : today;
      if (start > end) throw new Error("La fecha inicial no puede ser posterior a la final.");
      const startDate = dayStart(start);
      const endDate = new Date(dayStart(addDays(end, 1)).getTime() - 1);

      const q = query(
        collection(db, "services"),
        where("createdAt", ">=", Timestamp.fromDate(startDate)),
        where("createdAt", "<=", Timestamp.fromDate(new Date(endDate))),
      );

      const snapshot = await getDocs(q);

      let tempServiceSales = 0;
      let tempTips = 0;
      let tempBusiness = 0;

      const tempIncomeMethod = {
        Efectivo: 0,
        Yappy: 0,
        Tarjeta: 0,
        Transferencia: 0,
      };
      const tempTipsMethod = {
        Efectivo: 0,
        Yappy: 0,
        Tarjeta: 0,
        Transferencia: 0,
      };
      const washerMap: Record<string, PayrollItem> = {};


      const activityRecords: Parameters<typeof summarizeActivity>[0] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        activityRecords.push(data);
        if (data.status !== "cancelled" && data.paymentStatus !== "pending") {
          const fin = data.financials || {};
          const servicePrice = fin.totalPrice || 0;
          const tip = fin.tipAmount || 0;
          const washerId = String(data.washerId || "legacy-unassigned");
          const washerName = data.washerName || "Desconocido";
          const washerEarn = fin.washerEarnings || 0;

          // Ventas
          tempServiceSales += servicePrice;
          tempBusiness += fin.businessEarnings || 0;

          for (const part of paymentParts(servicePrice, fin.paymentMethod || "Efectivo", fin.payments)) tempIncomeMethod[part.method] += part.amount;

          // Propinas
          if (tip > 0) {
            tempTips += tip;
            let tipMethod = fin.tipMethod;
            if (!tipMethod) tipMethod = "Yappy"; // Por defecto Yappy si es null

            const safeTipMethod = tipMethod as keyof typeof tempTipsMethod;

            if (tempTipsMethod[safeTipMethod] !== undefined) {
              tempTipsMethod[safeTipMethod] += tip;
            } else {
              tempTipsMethod["Yappy"] += tip;
            }


          }

          // Nómina
          if (!washerMap[washerId]) {
            washerMap[washerId] = { washerId, washerName, count: 0, totalPay: 0, advances: 0, netPay: 0, excess: 0 };
          }
          washerMap[washerId].count += 1;
          washerMap[washerId].totalPay += washerEarn;
        }
      });

      const salesSnap = await getDocs(query(collection(db, "sales"), where("createdAt", ">=", Timestamp.fromDate(startDate)), where("createdAt", "<=", Timestamp.fromDate(endDate))));
      salesSnap.forEach(s => { const sale = s.data(); if (sale.status !== "paid") return; const total = Number(sale.total || 0); tempServiceSales += total; tempBusiness += total; for (const part of paymentParts(total, sale.paymentMethod, sale.payments)) tempIncomeMethod[part.method] += part.amount; });
      const advanceSnap = await getDocs(query(collection(db, "cashAdvances"), where("createdAt", ">=", Timestamp.fromDate(startDate)), where("createdAt", "<=", Timestamp.fromDate(endDate))));
      const periodAdvances: CashAdvance[] = [];
      advanceSnap.forEach(doc => {
        const advance = { ...doc.data(), id: doc.id } as CashAdvance;
        if (!advance.washerId || !Number.isFinite(advance.amount) || advance.amount <= 0) throw new Error("Hay vales con datos inválidos.");
        periodAdvances.push(advance);
        if (!washerMap[advance.washerId]) washerMap[advance.washerId] = {washerId: advance.washerId, washerName: advance.washerName, count: 0, totalPay: 0, advances: 0, netPay: 0, excess: 0};
        washerMap[advance.washerId].advances += advance.amount;
      });
      Object.values(washerMap).forEach(item => { const result = netPayroll(item.totalPay,item.advances); item.netPay=result.pay; item.excess=result.excess; });
      const [cashSnapshot, weekSummary] = await Promise.all([loadCashReport({start, end}), filterType === "week" ? loadTreasuryReport(end) : Promise.resolve(undefined)]);
      if (requestId !== reportRequest.current) return;
      setActivity(summarizeActivity(activityRecords));
      setPeriodCash(cashSnapshot.periodCash);
      setCashBreakdown(cashMovementBreakdown(cashSnapshot.movements));
      setAdvanceRows(periodAdvances);
      setWeekly(weekSummary);
      setServiceSales(tempServiceSales);
      setTotalTips(tempTips);
      setNetBusinessProfit(tempBusiness);
      setIncomeByMethod(tempIncomeMethod);
      setTipsByMethod(tempTipsMethod);


      const payrollArray = Object.values(washerMap).sort((a, b) => a.washerName.localeCompare(b.washerName));
      setPayrollList(payrollArray);
      setTotalPayrollToPay(
        payrollArray.reduce((acc, curr) => acc + curr.totalPay, 0),
      );
      setLoadedReportKey(`${filterType}|${start}|${end}`);
    } catch (error) {
      if (requestId !== reportRequest.current) return;
      setReportError("No se pudo cargar el reporte. Vuelva a actualizarlo antes de generar la nómina.");
      console.error("Error fetching report:", error);
    } finally {
      if (requestId === reportRequest.current) setLoading(false);
    }
  }, [filterType, customStart, customEnd]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // ==========================================
  // 1. GENERAR PDF NÓMINA (PARA FIRMAR)
  // ==========================================
  const generatePayrollPDF = () => {
    if (!reportReady || selectedPayroll.length === 0) {
      enqueueSnackbar("Seleccione al menos un lavador del reporte cargado.", { variant: "warning" });
      return;
    }
    const doc = new jsPDF();
    doc.addFileToVFS("ReportSans.ttf", normalFont); doc.addFont("ReportSans.ttf", "ReportSans", "normal");
    doc.addFileToVFS("ReportSans-Bold.ttf", boldFont); doc.addFont("ReportSans-Bold.ttf", "ReportSans", "bold");
    doc.setFont("ReportSans", "normal");
    const todayStr = businessDay();
    const rangeStr =
      filterType === "custom"
        ? `Del ${customStart} al ${customEnd}`
        : filterType === "today"
          ? todayStr
          : `Del ${weekOf(businessDay())} al ${businessDay()}`;
    // Encabezado
    doc.setFontSize(18);
    doc.text("MR. ESPUMA - REPORTE DE NÓMINA", 14, 20);
    doc.setFontSize(10);
    doc.text(`Periodo: ${rangeStr}`, 14, 28);
    doc.text(
      "Comisiones menos vales del período. No incluye propinas.",
      14,
      34,
    );

    // Tabla
    const tableData: RowInput[] = selectedPayroll.flatMap((item) => [[
      item.washerName,
      item.count,
      `${formatMoney(item.totalPay)}`,
      `${formatMoney(item.advances)}`,
      `${formatMoney(item.netPay)}`,
      `${formatMoney(item.excess)}`,
      "",
    ], ...advanceRows.filter(advance => advance.washerId === item.washerId)
      .sort((a, b) => a.day.localeCompare(b.day) || (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      .map(advance => [
        { content: `Vale · ${advance.day}\n${advance.description || "Sin motivo registrado"}`, colSpan: 3, styles: { fillColor: [245, 248, 250] as [number, number, number], fontSize: 8 } },
        { content: `-${formatMoney(advance.amount)}`, colSpan: 4, styles: { fillColor: [245, 248, 250] as [number, number, number], fontSize: 8 } },
      ])]);

    autoTable(doc, {
      startY: 40,
      margin: { bottom: 35 },
      styles: { font: "ReportSans", fontSize: 9 },
      head: [["Lavador", "Autos", "Comisiones", "Menos vales", "A pagar", "Excedente de vales", "Firma"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] }, // Color Azul
    });

    // Totales
    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont("ReportSans", "bold");
    doc.text(
      `TOTAL NÓMINA A DISPERSAR: ${formatMoney(selectedPayrollTotal)}`,
      14,
      finalY,
    );

    doc.setFontSize(9);
    doc.setFont("ReportSans", "normal");
    doc.text(`Vales registrados en esta selección: ${formatMoney(selectedPayroll.reduce((sum,item)=>sum+item.advances,0))}`,14,finalY+8);
    doc.text("El excedente indica vales que superan las comisiones del período.",14,finalY+14);
    doc.save(`Nomina_MrEspuma_${todayStr}.pdf`);
    enqueueSnackbar("Reporte de nómina generado exitosamente.", {
      variant: "success",
    });
  };

  // ==========================================
  // 2. GENERAR PDF FINANCIERO (GERENCIAL)
  // ==========================================
  const exportFinancial = async (format: "pdf" | "excel") => {
    if (!reportReady || exporting) {
      enqueueSnackbar("Espere a que se cargue el reporte del período.", { variant: "warning" });
      return;
    }
    setExporting(true);
    const request = reportRequest.current;
    try {
      const snapshot = await loadCashReport({ start: displayedStart, end: displayedEnd });
      if (request !== reportRequest.current) throw new Error("El período cambió. Exporte el reporte actualizado.");
      const report: FinancialReport = {
        ...snapshot,
        period: filterType === "today" ? `Ventas del día: ${businessDay()}` : filterType === "week" ? `Ventas: ${weekOf(businessDay())} a ${businessDay()}` : `Ventas: ${customStart} a ${customEnd}`,
        generatedAt: new Date().toLocaleString("es", {timeZone:"America/Caracas"}),
        sales: serviceSales, business: netBusinessProfit, payroll: totalPayrollToPay,
        income: incomeByMethod, tips: tipsByMethod,
        advanceRows, advancesTotal: advanceRows.reduce((sum,a)=>sum+a.amount,0), payrollNet: payrollList.reduce((sum,p)=>sum+p.netPay,0), weekly: filterType === "week" ? await loadTreasuryReport(displayedEnd) : undefined,
      };
      if (request !== reportRequest.current) throw new Error("El período cambió. Exporte el reporte actualizado.");
      const date = businessDay();
      if (format === "pdf") financialPDF(report).save(`Financiero_${date}.pdf`);
      else saveExcel(financialExcel(report), `Financiero_${date}.xlsx`);
      enqueueSnackbar("Reporte financiero generado.", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : "No se pudo exportar el reporte.", { variant: "error" });
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* HEADER Y FILTROS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800">
            Panel Financiero
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Control de caja, nómina y dispersión de ingresos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center bg-gray-50 p-2 rounded-xl border border-gray-200">
          <button
            onClick={() => setFilterType("today")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${filterType === "today" ? "bg-white text-espuma-blue shadow-md" : "text-gray-500 hover:text-gray-700"}`}
          >
            Hoy
          </button>
          <button
            onClick={() => setFilterType("week")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${filterType === "week" ? "bg-white text-espuma-blue shadow-md" : "text-gray-500 hover:text-gray-700"}`}
          >
            Esta Semana
          </button>

          <div className="w-px h-6 bg-gray-300 mx-1"></div>

          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-gray-200">
            {/* Input DESDE */}
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-400 font-bold uppercase ml-1">
                Desde
              </span>
              <input
                type="date"
                value={displayedStart}
                onChange={(e) => {
                  if (filterType !== "custom") setCustomEnd(displayedEnd);
                  setCustomStart(e.target.value);
                  setFilterType("custom"); // Activa modo custom automáticamente
                }}
                className={`text-xs font-bold outline-none bg-transparent ${filterType === "custom" ? "text-espuma-blue" : "text-gray-600"}`}
              />
            </div>

            <span className="text-gray-300">-</span>

            {/* Input HASTA */}
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-400 font-bold uppercase ml-1">
                Hasta
              </span>
              <input
                type="date"
                value={displayedEnd}
                onChange={(e) => {
                  if (filterType !== "custom") setCustomStart(displayedStart);
                  setCustomEnd(e.target.value);
                  setFilterType("custom");
                }}
                className={`text-xs font-bold outline-none bg-transparent ${filterType === "custom" ? "text-espuma-blue" : "text-gray-600"}`}
              />
            </div>
          </div>

          <button
            onClick={fetchReport}
            disabled={loading}
            className="ml-2 bg-espuma-blue hover:bg-cyan-700 text-white p-2 rounded-lg transition shadow-md shadow-cyan-500/20"
          >
            <TrendingUp className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2"><HelpTip label="Cómo leer este reporte">Las ventas y propinas usan la fecha de registro y excluyen pendientes y anulados. Todos los importes corresponden al rango seleccionado. Los saldos de varias cajas se muestran acumulados. Registre cada pago de propinas como gasto o retiro en Efectivo para descontarlo del saldo.</HelpTip><SectionLink href="/cash">Caja</SectionLink><SectionLink href="/movements">Movimientos</SectionLink><SectionLink href="/envelopes">Sobres</SectionLink></div>
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="p-6 rounded-2xl bg-gray-900 text-white shadow-xl shadow-gray-900/20 border border-gray-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Banknote className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">
              Saldos finales acumulados del período
            </p>
            <h3 className="text-4xl font-black tracking-tight">
              {cashLabel}
            </h3>
            <div className="mt-3 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 p-1.5 rounded w-fit">
              <TrendingUp className="w-3 h-3 rotate-180" />
              <span>Saldos al último movimiento de cada caja en el rango</span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm" aria-label="Efectivo a guardar de la jornada">
          <p className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
            Efectivo a guardar de la jornada
          </p>
          <h3 className="text-3xl font-black text-emerald-900">{netCashLabel}</h3>
          {reportReady && <p className="text-xs text-gray-500 mt-2">{periodCash?.statusLabel ?? `${periodCash?.sessionCount ?? 0} caja(s) con movimientos en el período`}</p>}
        </div>

        <div className="p-6 rounded-2xl bg-cyan-50 border border-cyan-100" aria-label="Guardado en sobres"><p className="text-cyan-800 text-xs font-bold uppercase mb-2">Guardado en sobres</p><p className="text-3xl font-black text-cyan-950">{reportReady ? formatMoney(periodCash?.saved ?? cashBreakdown.savedToEnvelopes) : "—"}</p><HelpTip label="Traslados a sobres">Total trasladado desde Caja a sobres dentro del período. No es un gasto ni reduce el efectivo generado por la jornada.</HelpTip></div>
        <div className="p-6 rounded-2xl bg-white border border-slate-200" aria-label="Pendiente por guardar"><p className="text-slate-500 text-xs font-bold uppercase mb-2">Pendiente por guardar</p><p className="text-3xl font-black text-slate-900">{reportReady ? formatMoney(periodCash?.pending ?? Math.max(0,periodCash?.net ?? 0)) : "—"}</p><HelpTip label="Efectivo pendiente">Exceso de efectivo que queda en las cajas sobre sus fondos dentro del rango. Puede incluir refuerzos desde sobres o fondos adicionales; no es una ganancia nueva.</HelpTip></div>
        <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
            Ventas de servicios y productos
          </p>
          <h3 className="text-3xl font-black text-gray-800">
            {formatMoney(serviceSales)}
          </h3>
          <p className="text-gray-400 text-xs mt-1">
            Total cobrado en servicios y productos
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-gradient-to-br from-espuma-blue to-cyan-600 text-white shadow-lg">
          <p className="text-gray-600 text-xs font-bold uppercase tracking-wider mb-2">
            Ingresos del negocio
          </p>
          <h3 className="text-3xl font-black text-gray-700">
            {formatMoney(netBusinessProfit)}
          </h3>
          <p className="text-gray-600 text-xs mt-1">Después de comisiones; antes de costos y gastos</p>
        </div>

        <div className="p-6 rounded-2xl bg-orange-50 border border-orange-100">
          <p className="text-orange-600 text-xs font-bold uppercase tracking-wider mb-2">
            Nómina a Pagar
          </p>
          <h3 className="text-3xl font-black text-orange-700">
            {formatMoney(payrollList.reduce((sum,item)=>sum+item.netPay,0))}
          </h3>
          <p className="text-orange-600/70 text-xs mt-1">Comisiones menos vales del período</p>
        </div>
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200" aria-label="Vales entregados">
          <p className="text-rose-700 text-xs font-bold uppercase tracking-wider mb-2">Vales entregados</p>
          <h3 className="text-3xl font-black text-rose-900">{reportReady ? formatMoney(advanceRows.reduce((sum,row)=>sum+row.amount,0)) : "—"}</h3>
          {reportReady && <p className="text-xs text-rose-700 mt-1">{advanceRows.length} vale(s) · {new Set(advanceRows.map(row=>row.washerId)).size} lavador(es)</p>}
        </div>
      </div>

      <section className="space-y-3" aria-label="Resumen de cobros y nómina">
        <h3 className="font-bold text-lg text-gray-800">Cobros y nómina del período</h3>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            {label:"Total cobrado",amount:serviceSales+totalTips,note:"Ventas más propinas, todos los métodos."},
            {label:"Cobros digitales",amount:["Yappy","Tarjeta","Transferencia"].reduce((sum,method)=>sum+incomeByMethod[method as keyof typeof incomeByMethod]+tipsByMethod[method as keyof typeof tipsByMethod],0),note:"Ventas y propinas; no son efectivo físico."},
            {label:"Comisiones antes de vales",amount:totalPayrollToPay,note:"Comisiones brutas generadas por los lavadores."},
            {label:"Excedente de vales",amount:payrollList.reduce((sum,row)=>sum+row.excess,0),note:"Vales que superan las comisiones de cada lavador; revisar al pagar."},
          ].map(card=><div key={card.label} aria-label={card.label} className="bg-white border rounded-xl p-4"><p className="text-sm text-gray-600">{card.label}</p><p className="text-2xl font-bold mt-1">{reportReady ? formatMoney(card.amount) : "—"}</p><HelpTip compact label={`Sobre ${card.label.toLowerCase()}`}>{card.note}</HelpTip></div>)}
        </div>
      </section>
      <section className="space-y-3" aria-label="Desglose de efectivo del período">
        <h3 className="font-bold text-lg text-gray-800">Entradas y salidas de efectivo</h3>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            {label:"Cobros netos en efectivo",amount:cashBreakdown.collections,note:"Ventas y propinas, después de reversiones y devoluciones."},
            {label:"Gastos pagados desde Caja",amount:cashBreakdown.expenses,note:"Solo movimientos de tipo Gasto en efectivo."},
            {label:"Retiros y pagos desde Caja",amount:cashBreakdown.withdrawals,note:"Retiros en efectivo; los vales se muestran por separado."},
            {label:"Salidas totales de Caja",amount:periodCash?.outgoing ?? 0,note:"Incluye gastos, retiros, vales y guardados en sobres."},
            {label:"Guardado en sobres",amount:cashBreakdown.savedToEnvelopes,note:"Traslado desde Caja; no es un gasto del negocio."},
            {label:"Refuerzos desde sobres",amount:cashBreakdown.fromEnvelopes,note:"Dinero trasladado a Caja; no es una venta."},
            {label:"Ingresos adicionales a Caja",amount:cashBreakdown.funding,note:"Fondos adicionales; no equivalen a ganancias."},
            {label:"Fondos iniciales acumulados",amount:periodCash?.opening,note:"Suma de los fondos de las cajas del rango; sin contarlos como ventas."},
          ].map(card=><div key={card.label} aria-label={card.label} className="bg-white border rounded-xl p-4"><p className="text-sm text-gray-600">{card.label}</p><p className="text-2xl font-bold mt-1">{!reportReady ? "—" : card.amount == null ? "No disponible" : formatMoney(card.amount)}</p><HelpTip compact label={`Sobre ${card.label.toLowerCase()}`}>{card.note}</HelpTip></div>)}
        </div>
        <HelpTip label="Cómo se relacionan los totales">Son desgloses de los totales: no se suman entre sí. Los vales ya forman parte de las salidas de Caja y se descuentan de la nómina; no se vuelven a restar de los ingresos después de comisiones. Los gastos directos de sobres se consultan en su control semanal.</HelpTip>
      </section>

      <ActivitySummary activity={activity} ready={reportReady} title="Vehículos y servicios del período"/>
      <SectionLink href="/movements">Consultar movimientos por fechas</SectionLink>

      {/* DESGLOSES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6 text-lg">
            <Car className="w-5 h-5 text-espuma-blue" />
            Ingresos por Servicios (Ventas)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <MethodCard
              title="Efectivo"
              amount={incomeByMethod.Efectivo}
              color="green"
            />
            <MethodCard
              title="Yappy"
              amount={incomeByMethod.Yappy}
              color="blue"
            />
            <MethodCard
              title="Tarjeta"
              amount={incomeByMethod.Tarjeta}
              color="purple"
            />
            <MethodCard
              title="ACH"
              amount={incomeByMethod.Transferencia}
              color="gray"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 mt-3">
            <MethodCard
              title="Total Yappy (Ingresos + Propinas)"
              amount={incomeByMethod.Yappy + tipsByMethod.Yappy}
              color="blue"
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-yellow-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              Distribución de Propinas
            </h3>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded">
              Total: {formatMoney(totalTips)}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-6 bg-blue-50 border border-blue-100 rounded-xl">
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase">
                  Yappy
                </p>
                <p className="text-[10px] text-blue-500">
                  El pago en efectivo se registra en Caja
                </p>
              </div>
              <p className="text-lg font-black text-blue-800">
                {formatMoney(tipsByMethod.Yappy)}
              </p>
            </div>
            <div className="flex justify-between items-center p-6 bg-purple-50 border border-purple-100 rounded-xl">
              <div>
                <p className="text-xs font-bold text-purple-700 uppercase">
                  Tarjeta
                </p>
                <p className="text-[10px] text-purple-500">
                  El pago en efectivo se registra en Caja
                </p>
              </div>
              <p className="text-lg font-black text-purple-800">
                {formatMoney(tipsByMethod.Tarjeta)}
              </p>
            </div>
            <div className="flex justify-between items-center p-6 bg-green-50 border border-green-100 rounded-xl opacity-70">
              <div>
                <p className="text-xs font-bold text-green-700 uppercase">
                  Efectivo
                </p>
                <p className="text-[10px] text-green-600">El pago en efectivo se registra en Caja</p>
              </div>
              <p className="text-lg font-black text-green-800">
                {formatMoney(tipsByMethod.Efectivo)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4" aria-label="Selección de lavadores para nómina">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Lavadores a incluir en la nómina</h3>
            <p className="text-sm text-gray-500">Marque a quienes va a pagar en el período elegido. El PDF incluye sus comisiones y espacio para firmar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!reportReady || payrollList.length === 0} onClick={() => setExcludedWasherIds([])} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">Seleccionar todos</button>
            <button type="button" disabled={!reportReady || payrollList.length === 0} onClick={() => setExcludedWasherIds(payrollList.map((item) => item.washerId))} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">Quitar selección</button>
          </div>
        </div>
        {reportError && <p role="alert" className="text-red-700 text-sm">{reportError}</p>}
        {!reportReady ? <p className="text-sm text-gray-500">{reportError ? "Actualice el reporte para continuar." : "Cargando nómina del período…"}</p> : payrollList.length === 0 ? <p className="text-sm text-gray-500">No hay lavadores con servicios cobrados en este período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="p-3">Incluir</th><th className="p-3">Lavador</th><th className="p-3 text-right">Autos lavados</th><th className="p-3 text-right">Comisiones</th><th className="p-3 text-right">Vales</th><th className="p-3 text-right">A pagar</th><th className="p-3 text-right">Excedente de vales</th></tr></thead>
              <tbody>{payrollList.map((item) => (
                <Fragment key={item.washerId}><tr className="border-b">
                  <td className="p-3"><input type="checkbox" aria-label={`Incluir a ${item.washerName} en la nómina (${item.washerId})`} checked={!excludedWasherIds.includes(item.washerId)} onChange={(e) => setExcludedWasherIds((previous) => e.target.checked ? previous.filter((id) => id !== item.washerId) : [...previous, item.washerId])} className="h-5 w-5 accent-cyan-700" /></td>
                  <td className="p-3 font-medium">{item.washerName}</td><td className="p-3 text-right">{item.count}</td><td className="p-3 text-right whitespace-nowrap">{formatMoney(item.totalPay)}</td><td className="p-3 text-right">{formatMoney(item.advances)}</td><td className="p-3 text-right font-bold">{formatMoney(item.netPay)}</td><td className="p-3 text-right">{formatMoney(item.excess)}</td>
                </tr>
                {advanceRows.filter(advance => advance.washerId === item.washerId)
                  .sort((a, b) => a.day.localeCompare(b.day) || (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
                  .map((advance) => <tr key={advance.id} className="bg-slate-50 border-b text-xs text-slate-600" aria-label={`Vale de ${item.washerName}`}>
                    <td />
                    <td className="p-3">Vale · {advance.day}</td>
                    <td colSpan={2} className="p-3 whitespace-pre-wrap">{advance.description || "Sin motivo registrado"}</td>
                    <td className="p-3 text-right whitespace-nowrap">-{formatMoney(advance.amount)}</td>
                    <td colSpan={2} />
                  </tr>)}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
        )}
        {reportReady && <p className="font-bold text-gray-800">Seleccionados: {selectedPayroll.length} de {payrollList.length} · Total a pagar: {formatMoney(selectedPayrollTotal)}</p>}
        <HelpTip label="Pago de nómina">Generar el reporte no registra el pago. Los vales se descuentan por fecha del período seleccionado. Para entregar el saldo neto, registre solo ese monto como retiro en Caja; no registre de nuevo los vales.</HelpTip>
      </section>

      {weekly && reportReady && <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-3"><div className="flex justify-between gap-3 flex-wrap"><h3 className="font-bold text-lg">Control semanal: {weekly.start} a {weekly.end}</h3><SectionLink href="/envelopes">Sobres con dinero</SectionLink></div><div className="grid sm:grid-cols-3 gap-3"><p>Efectivo neto generado<br/><strong className="text-xl">{formatMoney(weekly.netGenerated)}</strong></p><p>Vales entregados<br/><strong className="text-xl">{formatMoney(weekly.advances)}</strong></p><p>Disponible hoy en sobres de esa semana<br/><strong className="text-xl">{formatMoney(weekly.envelopeBalance)}</strong></p></div><p className="text-xs text-emerald-800">Semana de martes a lunes. El efectivo neto excluye fondos y traslados internos e incluye las salidas ya registradas. No equivale a utilidad después de obligaciones pendientes.</p></section>}
      {/* BOTONES PDF */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <button
          onClick={generatePayrollPDF}
          disabled={!reportReady || selectedPayroll.length === 0}
          className="group relative overflow-hidden bg-white border-2 border-orange-500 text-orange-600 py-4 rounded-xl font-bold hover:bg-orange-50 transition flex flex-col items-center justify-center gap-1 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6" />
            <span className="text-lg">Reporte de Pago de Nómina (PDF)</span>
          </div>
          <span className="text-xs font-normal opacity-80">
            Lista para firmar (Sin propinas)
          </span>
        </button>

        <button
          onClick={() => exportFinancial("pdf")}
          disabled={!reportReady || exporting}
          className="group relative overflow-hidden bg-gray-800 text-white py-4 rounded-xl font-bold hover:bg-black transition flex flex-col items-center justify-center gap-1 shadow-lg shadow-gray-400/20"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-400" />
            <span className="text-lg">Control Financiero Interno (PDF)</span>
          </div>
          <span className="text-xs font-normal text-gray-400">
            Estadísticas del período y saldo actual de caja
          </span>
        </button>
        <button onClick={() => exportFinancial("excel")} disabled={!reportReady || exporting} className="bg-emerald-700 text-white py-4 rounded-xl font-bold disabled:opacity-50">
          {exporting ? "Preparando reporte…" : "Reporte financiero (Excel)"}
          <span className="block text-xs font-normal mt-1">Resumen y movimientos detallados de la caja actual</span>
        </button>
      </div>
    </div>
  );
}

function MethodCard({
  title,
  amount,
  color,
}: {
  title: string;
  amount: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 border-green-100 text-green-800",
    blue: "bg-blue-50 border-blue-100 text-blue-800",
    purple: "bg-purple-50 border-purple-100 text-purple-800",
    gray: "bg-gray-50 border-gray-100 text-gray-800",
  };
  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <p className="text-[10px] font-bold uppercase opacity-70 mb-1">{title}</p>
      <p className="text-xl font-black">{formatMoney(amount)}</p>
    </div>
  );
}
