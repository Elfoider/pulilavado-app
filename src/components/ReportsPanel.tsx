"use client";

import { useState, useEffect } from "react";
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
  Calendar as CalendarIcon,
} from "lucide-react";

// --- IMPORTAR LIBRERÍAS DE PDF ---
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { enqueueSnackbar } from "notistack";

// Interfaces
interface PayrollItem {
  washerName: string;
  count: number;
  totalPay: number; // Solo comisión
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);

  // CONTROL DE FECHAS
  const [filterType, setFilterType] = useState<"today" | "week" | "custom">(
    "today",
  );
  const [customStart, setCustomStart] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  // ESTADOS FINANCIEROS
  const [totalRevenue, setTotalRevenue] = useState(0);
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
  const [netCashInRegister, setNetCashInRegister] = useState(0);
  const [digitalTipsPaidCash, setDigitalTipsPaidCash] = useState(0); // Dato útil para el reporte

  // NÓMINA
  const [payrollList, setPayrollList] = useState<PayrollItem[]>([]);
  const [totalPayrollToPay, setTotalPayrollToPay] = useState(0);

  // --- FUNCIÓN DE CÁLCULO (IGUAL QUE ANTES) ---
  const fetchReport = async () => {
    setLoading(true);
    try {
      let startDate = new Date();
      let endDate = new Date();

      if (filterType === "today") {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        setCustomStart(startDate.toISOString().split("T")[0]);
        setCustomEnd(startDate.toISOString().split("T")[0]);
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
        setCustomStart(startDate.toISOString().split("T")[0]);
        setCustomEnd(endDate.toISOString().split("T")[0]);
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

      let cashOutflowForTips = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status !== "cancelled") {
          const fin = data.financials || {};
          const servicePrice = fin.totalPrice || 0;
          const tip = fin.tipAmount || 0;
          const washerId = data.washerId;
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

            // Si NO es efectivo, significa que entró digital y SALE efectivo de caja
            if (safeTipMethod !== "Efectivo") {
              cashOutflowForTips += tip;
            }
          }

          // Nómina
          if (!washerMap[washerId]) {
            washerMap[washerId] = { washerName, count: 0, totalPay: 0 };
          }
          washerMap[washerId].count += 1;
          washerMap[washerId].totalPay += washerEarn;
        }
      });

      setServiceSales(tempServiceSales);
      setTotalTips(tempTips);
      setTotalRevenue(tempServiceSales + tempTips);
      setNetBusinessProfit(tempBusiness);
      setIncomeByMethod(tempIncomeMethod);
      setTipsByMethod(tempTipsMethod);

      setDigitalTipsPaidCash(cashOutflowForTips);
      setNetCashInRegister(tempIncomeMethod["Efectivo"] - cashOutflowForTips);

      const payrollArray = Object.values(washerMap);
      setPayrollList(payrollArray);
      setTotalPayrollToPay(
        payrollArray.reduce((acc, curr) => acc + curr.totalPay, 0),
      );
    } catch (error) {
      console.error("Error fetching report:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [filterType, customStart, customEnd]);

  // ==========================================
  // 1. GENERAR PDF NÓMINA (PARA FIRMAR)
  // ==========================================
  const generatePayrollPDF = () => {
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
    const tableData = payrollList.map((item) => [
      item.washerName,
      item.count,
      `$${item.totalPay.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: 40,
      head: [["Lavador", "Autos Lavados", "A Pagar", "Firma de Recibido"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] }, // Color Azul
    });

    // Totales
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      `TOTAL NÓMINA A DISPERSAR: $${totalPayrollToPay.toFixed(2)}`,
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
  const generateFinancialPDF = () => {
    const doc = new jsPDF();
    const todayStr = new Date().toLocaleDateString();

    // Título
    doc.setFontSize(22);
    doc.setTextColor(44, 62, 80);
    doc.text("REPORTE FINANCIERO INTERNO", 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(
      `${filterType === "week" ? `Desde ${customStart} hasta ${customEnd}` : filterType === "custom" ? `${customStart} a ${customEnd}` : ""}`,
      14,
      33,
    );

    // --- SECCIÓN 1: CAJA REAL ---
    doc.setDrawColor(0);
    doc.setFillColor(240, 240, 240);
    doc.rect(14, 40, 180, 25, "F");

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("CAJA NETA (Dinero Físico Real)", 20, 50);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`$${netCashInRegister.toFixed(2)}`, 20, 58);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("(Ventas Efectivo - Propinas Digitales Pagadas)", 100, 58);

    // --- SECCIÓN 2: ESTADÍSTICAS ---
    let yPos = 75;

    const kpiData = [
      ["Venta Servicios (Bruto)", `$${serviceSales.toFixed(2)}`],
      ["Propinas Totales", `$${totalTips.toFixed(2)}`],
      [
        "Salida Efectivo (Props. Digitales)",
        `-$${digitalTipsPaidCash.toFixed(2)}`,
      ],
      ["GANANCIA NEGOCIO (Estimada)", `$${netBusinessProfit.toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [["Concepto", "Monto"]],
      body: kpiData,
      theme: "striped",
      headStyles: { fillColor: [52, 73, 94] },
    });

    // --- SECCIÓN 3: DESGLOSE SERVICIOS ---
    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.text("Desglose Ingresos (Ventas)", 14, yPos);

    autoTable(doc, {
      startY: yPos + 5,
      head: [["Método", "Monto"]],
      body: [
        ["Efectivo", `$${incomeByMethod.Efectivo.toFixed(2)}`],
        ["Yappy", `$${incomeByMethod.Yappy.toFixed(2)}`],
        ["Tarjeta", `$${incomeByMethod.Tarjeta.toFixed(2)}`],
        ["ACH/Otro", `$${incomeByMethod.Transferencia.toFixed(2)}`],
      ],
      theme: "grid",
    });

    // --- SECCIÓN 4: CIERRE DE CAJA ---
    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.text("Cierre de Caja", 14, yPos);

    autoTable(doc, {
      startY: yPos + 5,
      head: [["Operación", "Monto"]],
      body: [
        ["Total del dia", `$${serviceSales.toFixed(2)}`],
        [
          "Total Yappy",
          `$${parseFloat(incomeByMethod.Yappy.toFixed(2)) + parseFloat(tipsByMethod.Yappy.toFixed(2))}`,
        ],
        ["Tarjeta", `$${incomeByMethod.Tarjeta.toFixed(2)}`],
        [
          "Total Propina",
          `$${parseFloat(tipsByMethod.Efectivo.toFixed(2)) + parseFloat(tipsByMethod.Yappy.toFixed(2)) + parseFloat(tipsByMethod.Tarjeta.toFixed(2))}`,
        ],
      ],
      theme: "grid",
    });

    // --- SECCIÓN 5: DESGLOSE PROPINAS ---
    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.text("Desglose Propinas (Origen)", 14, yPos);

    autoTable(doc, {
      startY: yPos + 5,
      head: [["Método", "Monto", "Efecto en Caja"]],
      body: [
        ["Efectivo", `$${tipsByMethod.Efectivo.toFixed(2)}`, "Neutro"],
        ["Yappy / Sin Esp.", `$${tipsByMethod.Yappy.toFixed(2)}`, "Resta Caja"],
        ["Tarjeta", `$${tipsByMethod.Tarjeta.toFixed(2)}`, "Resta Caja"],
      ],
      theme: "grid",
      headStyles: { fillColor: [243, 156, 18] }, // Naranja/Amarillo
    });

    doc.save(`Financiero_Detallado_${todayStr}.pdf`);
    enqueueSnackbar("Reporte financiero generado exitosamente.", {
      variant: "success",
    });
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
            className="ml-2 bg-espuma-blue hover:bg-cyan-700 text-white p-2 rounded-lg transition shadow-md shadow-cyan-500/20"
          >
            <TrendingUp className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-6 rounded-2xl bg-gray-900 text-white shadow-xl shadow-gray-900/20 border border-gray-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Banknote className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">
              Efectivo Real en Caja
            </p>
            <h3 className="text-4xl font-black tracking-tight">
              ${netCashInRegister.toFixed(2)}
            </h3>
            <div className="mt-3 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 p-1.5 rounded w-fit">
              <TrendingUp className="w-3 h-3 rotate-180" />
              <span>Desc. propinas digitales</span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
            Venta Servicios
          </p>
          <h3 className="text-3xl font-black text-gray-800">
            ${serviceSales.toFixed(2)}
          </h3>
          <p className="text-gray-400 text-xs mt-1">
            Total facturado en lavados
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-gradient-to-br from-espuma-blue to-cyan-600 text-white shadow-lg">
          <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-2">
            Ganancia Negocio
          </p>
          <h3 className="text-3xl font-black">
            ${netBusinessProfit.toFixed(2)}
          </h3>
          <p className="text-blue-100 text-xs mt-1">Después de comisiones</p>
        </div>

        <div className="p-6 rounded-2xl bg-orange-50 border border-orange-100">
          <p className="text-orange-600 text-xs font-bold uppercase tracking-wider mb-2">
            Nómina a Pagar
          </p>
          <h3 className="text-3xl font-black text-orange-700">
            ${totalPayrollToPay.toFixed(2)}
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
              Total: ${totalTips.toFixed(2)}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-6 bg-blue-50 border border-blue-100 rounded-xl">
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase">
                  Yappy
                </p>
                <p className="text-[10px] text-blue-500">
                  Se resta del efectivo de caja
                </p>
              </div>
              <p className="text-lg font-black text-blue-800">
                ${tipsByMethod.Yappy.toFixed(2)}
              </p>
            </div>
            <div className="flex justify-between items-center p-6 bg-purple-50 border border-purple-100 rounded-xl">
              <div>
                <p className="text-xs font-bold text-purple-700 uppercase">
                  Tarjeta
                </p>
                <p className="text-[10px] text-purple-500">
                  Se resta del efectivo de caja
                </p>
              </div>
              <p className="text-lg font-black text-purple-800">
                ${tipsByMethod.Tarjeta.toFixed(2)}
              </p>
            </div>
            <div className="flex justify-between items-center p-6 bg-green-50 border border-green-100 rounded-xl opacity-70">
              <div>
                <p className="text-xs font-bold text-green-700 uppercase">
                  Efectivo
                </p>
                <p className="text-[10px] text-green-600">Directo al lavador</p>
              </div>
              <p className="text-lg font-black text-green-800">
                ${tipsByMethod.Efectivo.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* BOTONES PDF */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <button
          onClick={generatePayrollPDF}
          className="group relative overflow-hidden bg-white border-2 border-orange-500 text-orange-600 py-4 rounded-xl font-bold hover:bg-orange-50 transition flex flex-col items-center justify-center gap-1 shadow-sm hover:shadow-md"
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
          onClick={generateFinancialPDF}
          className="group relative overflow-hidden bg-gray-800 text-white py-4 rounded-xl font-bold hover:bg-black transition flex flex-col items-center justify-center gap-1 shadow-lg shadow-gray-400/20"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-400" />
            <span className="text-lg">Control Financiero Interno (PDF)</span>
          </div>
          <span className="text-xs font-normal text-gray-400">
            Estadísticas completas y cuadre de caja
          </span>
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
      <p className="text-xl font-black">${amount.toFixed(2)}</p>
    </div>
  );
}
