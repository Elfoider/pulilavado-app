"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
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
import autoTable from "jspdf-autotable";
import { enqueueSnackbar } from "notistack";
import { formatMoney } from "@/lib/utils";
import { useCurrentCash } from "@/lib/useCurrentCash";
import { loadCashReport } from "@/lib/reports/loadCash";
import { financialPDF } from "@/lib/reports/pdf";
import { financialExcel, saveExcel } from "@/lib/reports/excel";
import { type FinancialReport } from "@/lib/reports/cash";

const dateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Interfaces
interface PayrollItem {
  washerId: string;
  washerName: string;
  count: number;
  totalPay: number; // Solo comisión
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // CONTROL DE FECHAS
  const [filterType, setFilterType] = useState<"today" | "week" | "custom">(
    "today",
  );
  const [customStart, setCustomStart] = useState<string>(
    dateInputValue(new Date()),
  );
  const [customEnd, setCustomEnd] = useState<string>(
    dateInputValue(new Date()),
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

  // CAJA REAL
  const cash = useCurrentCash();
  const cashLabel = cash.loading ? "Cargando…" : cash.error ? "No disponible" : cash.session ? formatMoney(cash.session.balances.Efectivo) : "Sin caja abierta";
  const netCashLabel = cash.session && !cash.loading && !cash.error
    ? formatMoney(cash.session.balances.Efectivo - cash.session.openingAmount)
    : cashLabel;

  // NÓMINA
  const [payrollList, setPayrollList] = useState<PayrollItem[]>([]);
  const [totalPayrollToPay, setTotalPayrollToPay] = useState(0);
  const [excludedWasherIds, setExcludedWasherIds] = useState<string[]>([]);
  const [reportError, setReportError] = useState("");
  const [loadedReportKey, setLoadedReportKey] = useState("");
  const reportRequest = useRef(0);
  const reportKey = `${filterType}|${customStart}|${customEnd}`;
  const reportReady = !loading && !reportError && loadedReportKey === reportKey;
  const selectedPayroll = payrollList.filter(
    (item) => !excludedWasherIds.includes(item.washerId),
  );
  const selectedPayrollTotal = selectedPayroll.reduce(
    (sum, item) => sum + item.totalPay, 0,
  );

  // --- FUNCIÓN DE CÁLCULO (IGUAL QUE ANTES) ---
  const fetchReport = useCallback(async () => {
    const requestId = ++reportRequest.current;
    setLoading(true);
    setReportError("");
    try {
      let startDate = new Date();
      let endDate = new Date();

      if (filterType === "today") {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        setCustomStart(dateInputValue(startDate));
        setCustomEnd(dateInputValue(startDate));
      } else if (filterType === "week") {
        const today = new Date();
        const currentDay = today.getDay(); // 0=Domingo, 1=Lunes, 2=Martes...

        // OBJETIVO: Encontrar el último Martes (Día 2)
        // Si hoy es Martes (2), la distancia es 0.
        // Si hoy es Miércoles (3), la distancia es 1 día atrás.
        // Si hoy es Lunes (1), el martes pasado fue hace 6 días.
        // Si hoy es Domingo (0), el martes pasado fue hace 5 días.

        const cycleStartDay = 2; // 2 = Martes
        let daysToSubtract = 0;

        if (currentDay >= cycleStartDay) {
          // Estamos dentro de la misma semana calendario (ej: Hoy es Jueves)
          // Jueves (4) - Martes (2) = 2 días atrás
          daysToSubtract = currentDay - cycleStartDay;
        } else {
          // Ya cruzamos al inicio de la semana calendario (ej: Hoy es Lunes o Domingo)
          // Necesitamos ir al Martes de la semana ANTERIOR.
          // Fórmula: (DíaActual - DíaMeta) + 7
          // Ej Lunes (1): (1 - 2) + 7 = 6 días atrás
          daysToSubtract = currentDay - cycleStartDay + 7;
        }

        // 1. Configurar Fecha de Inicio (El Martes calculado)
        startDate = new Date(today);
        startDate.setDate(today.getDate() - daysToSubtract);
        startDate.setHours(0, 0, 0, 0); // Martes 00:00:00

        // 2. Configurar Fecha Fin (Hoy, hasta el momento actual)
        endDate = new Date(today);
        endDate.setHours(0, 0, 0, 0);
        setCustomStart(dateInputValue(startDate));
        setCustomEnd(dateInputValue(endDate));
        endDate.setHours(23, 59, 59, 999); // Hoy 23:59:59
      } else if (filterType === "custom") {
        // FECHA INICIO (00:00:00)
        const [y1, m1, d1] = customStart.split("-").map(Number);
        startDate = new Date(y1, m1 - 1, d1, 0, 0, 0);

        // FECHA FIN (23:59:59)
        const [y2, m2, d2] = customEnd.split("-").map(Number);
        endDate = new Date(y2, m2 - 1, d2, 23, 59, 59, 999);
      }

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


      snapshot.forEach((doc) => {
        const data = doc.data();
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

          const payMethod = (fin.paymentMethod ||
            "Efectivo") as keyof typeof tempIncomeMethod;
          if (tempIncomeMethod[payMethod] !== undefined) {
            tempIncomeMethod[payMethod] += servicePrice;
          } else {
            tempIncomeMethod["Efectivo"] += servicePrice;
          }

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
            washerMap[washerId] = { washerId, washerName, count: 0, totalPay: 0 };
          }
          washerMap[washerId].count += 1;
          washerMap[washerId].totalPay += washerEarn;
        }
      });

      const salesSnap = await getDocs(query(collection(db, "sales"), where("createdAt", ">=", Timestamp.fromDate(startDate)), where("createdAt", "<=", Timestamp.fromDate(endDate))));
      salesSnap.forEach(s => { const sale = s.data(); if (sale.status !== "paid") return; const total = Number(sale.total || 0); tempServiceSales += total; tempBusiness += total; const pm = sale.paymentMethod as keyof typeof tempIncomeMethod; if (tempIncomeMethod[pm] !== undefined) tempIncomeMethod[pm] += total; });
      if (requestId !== reportRequest.current) return;
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
      setLoadedReportKey(`${filterType}|${customStart}|${customEnd}`);
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
    const todayStr = new Date().toLocaleDateString();
    const rangeStr =
      filterType === "custom"
        ? `Del ${customStart} al ${customEnd}`
        : filterType === "today"
          ? todayStr
          : "Semana Actual";
    // Encabezado
    doc.setFontSize(18);
    doc.text("MR. ESPUMA - REPORTE DE NÓMINA", 14, 20);
    doc.setFontSize(10);
    doc.text(`Periodo: ${rangeStr}`, 14, 28);
    doc.text(
      "Concepto: Pago de Comisiones (Propinas pagadas diariamente)",
      14,
      34,
    );

    // Tabla
    const tableData = selectedPayroll.map((item) => [
      item.washerName,
      item.count,
      `${formatMoney(item.totalPay)}`,
      "",
    ]);

    autoTable(doc, {
      startY: 40,
      head: [["Lavador", "Autos Lavados", "A Pagar", "Firma de Recibido"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] }, // Color Azul
    });

    // Totales
    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      `TOTAL NÓMINA A DISPERSAR: ${formatMoney(selectedPayrollTotal)}`,
      14,
      finalY,
    );

    doc.save(`Nomina_MrEspuma_${todayStr}.pdf`);
    enqueueSnackbar("Reporte de nómina generado exitosamente.", {
      variant: "success",
    });
  };

  // ==========================================
  // 2. GENERAR PDF FINANCIERO (GERENCIAL)
  // ==========================================
  const exportFinancial = async (format: "pdf" | "excel") => {
    if (!reportReady || cash.loading || cash.error || exporting) {
      enqueueSnackbar("Espere a que se carguen el reporte y el saldo de Caja.", { variant: "warning" });
      return;
    }
    setExporting(true);
    const request = reportRequest.current;
    try {
      const snapshot = await loadCashReport();
      if (request !== reportRequest.current) throw new Error("El período cambió. Exporte el reporte actualizado.");
      const report: FinancialReport = {
        ...snapshot,
        period: filterType === "today" ? `Ventas del día: ${dateInputValue(new Date())}` : filterType === "week" ? "Ventas de los últimos 7 días" : `Ventas: ${customStart} a ${customEnd}`,
        generatedAt: new Date().toLocaleString(),
        sales: serviceSales, business: netBusinessProfit, payroll: totalPayrollToPay,
        income: incomeByMethod, tips: tipsByMethod,
      };
      const date = dateInputValue(new Date());
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
                value={customStart}
                onChange={(e) => {
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
                value={customEnd}
                onChange={(e) => {
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

      <p className="text-sm text-gray-600">Las ventas y propinas usan la fecha de registro y excluyen pendientes y anulados. El efectivo en caja muestra el saldo actual, independiente del período seleccionado. Para registrar pagos y consultar movimientos visite <a href="/cash" className="underline text-cyan-700">Caja</a>. Registre cada pago de propinas como gasto o retiro en Efectivo para descontarlo del saldo.</p>
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="p-6 rounded-2xl bg-gray-900 text-white shadow-xl shadow-gray-900/20 border border-gray-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Banknote className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">
              Efectivo en caja actual
            </p>
            <h3 className="text-4xl font-black tracking-tight">
              {cashLabel}
            </h3>
            <div className="mt-3 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 p-1.5 rounded w-fit">
              <TrendingUp className="w-3 h-3 rotate-180" />
              <span>Fondo + entradas − gastos y retiros</span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm" aria-label="Efectivo a guardar de la jornada">
          <p className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
            Efectivo a guardar de la jornada
          </p>
          <h3 className="text-3xl font-black text-emerald-900">{netCashLabel}</h3>
        </div>

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
            {formatMoney(totalPayrollToPay)}
          </h3>
          <p className="text-orange-600/70 text-xs mt-1">Solo comisiones</p>
        </div>
      </div>

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
              <thead><tr className="border-b text-left"><th className="p-3">Incluir</th><th className="p-3">Lavador</th><th className="p-3 text-right">Autos lavados</th><th className="p-3 text-right">Comisión a pagar</th></tr></thead>
              <tbody>{payrollList.map((item) => (
                <tr key={item.washerId} className="border-b">
                  <td className="p-3"><input type="checkbox" aria-label={`Incluir a ${item.washerName} en la nómina (${item.washerId})`} checked={!excludedWasherIds.includes(item.washerId)} onChange={(e) => setExcludedWasherIds((previous) => e.target.checked ? previous.filter((id) => id !== item.washerId) : [...previous, item.washerId])} className="h-5 w-5 accent-cyan-700" /></td>
                  <td className="p-3 font-medium">{item.washerName}</td><td className="p-3 text-right">{item.count}</td><td className="p-3 text-right whitespace-nowrap">{formatMoney(item.totalPay)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {reportReady && <p className="font-bold text-gray-800">Seleccionados: {selectedPayroll.length} de {payrollList.length} · Total a pagar: {formatMoney(selectedPayrollTotal)}</p>}
        <p className="text-xs text-gray-500">Generar el reporte no registra el pago. Para entregar el dinero, registre el retiro correspondiente en Caja.</p>
      </section>

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
          disabled={!reportReady || cash.loading || !!cash.error || exporting}
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
        <button onClick={() => exportFinancial("excel")} disabled={!reportReady || cash.loading || !!cash.error || exporting} className="bg-emerald-700 text-white py-4 rounded-xl font-bold disabled:opacity-50">
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
