import jsPDF from "jspdf";
import { normalFont, boldFont } from "./fonts";
import autoTable from "jspdf-autotable";
import { METHODS } from "../operations/model";
import { reportCashView, FinancialReport } from "./cash";
const dollars = (n: number) => `$${n.toFixed(2)}`;
export function financialPDF(report: FinancialReport, doc = new jsPDF()) {
  doc.addFileToVFS("ReportSans.ttf", normalFont); doc.addFont("ReportSans.ttf", "ReportSans", "normal");
  doc.addFileToVFS("ReportSans-Bold.ttf", boldFont); doc.addFont("ReportSans-Bold.ttf", "ReportSans", "bold");
  const navy = "#112D3B", muted = "#5D7380", green = "#116849", cyan = "#007C91";
  const box = (x: number, y: number, w: number, h: number, color: string) => { doc.setFillColor(color); doc.roundedRect(x, y, w, h, 3, 3, "F"); };
  const text = (x: number, y: number, value: string, size = 10, color = navy, bold = false, right = false) => {
    doc.setFont("ReportSans", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color); doc.text(value, x, y, right ? { align: "right" } : undefined);
  };
  const donut = (x: number, y: number, radius: number, values: number[], colors: string[], center: string, bg = "#FFFFFF", fg = navy) => {
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum <= 0 || values.some(v => v < 0)) return;
    let angle = -Math.PI / 2;
    values.forEach((value, i) => {
      const end = angle + value / sum * Math.PI * 2;
      const segments: number[][] = [];
      let px = 0, py = 0;
      for (let a = angle; a <= end + .0001; a += .02) {
        const next = Math.min(a, end);
        const nx = radius * Math.cos(next), ny = radius * Math.sin(next);
        segments.push([nx - px, ny - py]); px = nx; py = ny;
      }
      const nx = radius * Math.cos(end), ny = radius * Math.sin(end);
      segments.push([nx - px, ny - py], [-nx, -ny]);
      doc.setFillColor(colors[i]); doc.lines(segments, x, y, [1, 1], "F", true);
      angle = end;
    });
    doc.setFillColor(bg); doc.circle(x, y, radius * .65, "F");
    doc.setFont("ReportSans", "bold"); doc.setFontSize(9); doc.setTextColor(fg); doc.text(center, x, y + 1, { align: "center" });
  };
  const cash = reportCashView(report);
  const cashLabel = cash.balance === null ? "No disponible" : dollars(cash.balance);
  const netLabel = dollars(cash.net);
  const periodMode = !!report.periodCash;
  box(0, 0, 210, 3, cyan);
  text(12, 15, "MR. ESPUMA / PULILAVADO", 10, cyan, true);
  text(12, 28, "Reporte financiero", 24, navy, true);
  text(12, 36, report.period, 10, muted);

  text(12, 42, `Generado: ${report.generatedAt}`, 7, muted);
  box(12, 48, 186, 33, green);
  text(18, 57, "EFECTIVO A GUARDAR DE LA JORNADA", 11, "#FFFFFF", true);
  text(18, 73, netLabel, 30, "#FFFFFF", true);
  text(18, 78, "SIN FONDO INICIAL", 7, "#D8F1E6", true);
  if (cash && cash.reconciled && cash.net >= 0 && cash.outgoing >= 0 && cash.incoming > 0) {
    text(151, 55, "EFECTIVO DE LA JORNADA", 6, "#FFFFFF", true);
    donut(160, 66, 9, [cash.net, cash.outgoing], ["#83DEB8", "#F7BC58"], dollars(cash.incoming), green, "#FFFFFF");
    text(174, 63, `Guardar ${dollars(cash.net)}`, 7, "#FFFFFF");
    text(174, 69, `Salidas ${dollars(cash.outgoing)}`, 7, "#FFFFFF");
  }
  box(12, 85, 91, 24, "#F2F6F8"); box(107, 85, 91, 24, "#F2F6F8");
  text(17, 92, periodMode ? "SALDOS FINALES DEL PERÍODO" : "SALDO TOTAL EN CAJA", 9, muted, true); text(17, 103, cashLabel, 21, navy, true);
  text(98, 103, periodMode ? "Acumulado" : "Incluye fondo", 7, muted, false, true);
  text(112, 92, "VENTAS DEL PERÍODO", 9, muted, true); text(112, 103, dollars(report.sales), 21, navy, true);
  text(193, 103, "Servicios y productos", 7, muted, false, true);
  text(12, 120, "01  Cobros por método", 12, navy, true);
  const totalTips = METHODS.reduce((s, m) => s + report.tips[m], 0);
  const collections = METHODS.map(m => report.income[m] + report.tips[m]);
  autoTable(doc, { startY: 125, margin: { left: 12 }, tableWidth: 126,
    head: [["Método", "Ventas", "Propinas", "Total"]],
    body: [...METHODS.map((m, i) => [m === "Transferencia" ? "Transferencia / ACH" : m, dollars(report.income[m]), dollars(report.tips[m]), dollars(collections[i])]), ["TOTAL", dollars(report.sales), dollars(totalTips), dollars(report.sales + totalTips)]],
    theme: "striped", styles: { font: "ReportSans", fontSize: 9, cellPadding: 2.6 }, headStyles: { fillColor: navy },
    columnStyles: { 0: { cellWidth: 43 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  text(144, 129, "DISTRIBUCIÓN DE COBROS", 7, muted, true);
  const palette = [green, cyan, navy, "#8A77B4"];
  if (collections.some(v => v < 0) || collections.every(v => v === 0)) text(144, 147, "Sin distribución positiva", 7, muted);
  else donut(170, 150, 14, collections, palette, dollars(report.sales + totalTips));
  METHODS.forEach((m, i) => {
    doc.setFillColor(palette[i]); doc.rect(144, 170 + i * 5, 2, 2, "F");
    text(148, 172 + i * 5, m === "Transferencia" ? "ACH" : m, 8, muted);
    text(198, 172 + i * 5, report.sales + totalTips > 0 ? `${(collections[i] / (report.sales + totalTips) * 100).toFixed(1)}%` : "-", 8, navy, true, true);
  });
  text(12, 194, "Total cobrado: ventas más propinas. Los cobros digitales no son efectivo físico.", 8, muted);
  text(12, 204, "02  Conciliación del efectivo", 12, navy, true);
  text(113, 204, "03  Comisiones y propinas", 12, navy, true);
  box(12, 209, 96, 51, "#F2F6F8"); box(113, 209, 85, 51, "#F2F6F8");
  const left = [
    [periodMode ? "Fondos iniciales acumulados" : "Fondo inicial", cash.opening === null ? "No disponible" : dollars(cash.opening)],
    ["Entradas netas en efectivo", cash?.reconciled ? dollars(cash.incoming) : "No disponible"],
    ["Pagos y gastos en efectivo", cash?.reconciled ? dollars(cash.outgoing) : "No disponible"],
    [periodMode ? "Saldos finales acumulados" : "Saldo total en caja", cashLabel],
    ["Efectivo a guardar de la jornada", netLabel],
  ];
  left.forEach(([label, value], i) => { text(16, 217 + i * 8, label, 8, i === 4 ? green : navy, i >= 3); text(104, 217 + i * 8, value, 10, i === 4 ? green : navy, i >= 3, true); });
  [["Comisiones generadas", dollars(report.payroll)], ["Ventas menos comisiones", dollars(report.business)], ["Propinas recibidas", dollars(totalTips)], ["Salidas de efectivo", cash?.reconciled ? dollars(cash.outgoing) : "No disponible"]].forEach(([label, value], i) => { text(117, 217 + i * 8, label, 8); text(194, 217 + i * 8, value, 9, navy, i === 1, true); });
  text(117, 253, "Antes de costos y gastos.", 7, muted);
  text(12, 269, periodMode ? report.periodCash?.statusLabel ?? `${cash.sessionCount} caja(s) con movimientos en el período` : report.session?.status === "open" ? "Caja abierta" : "Caja cerrada / sin apertura", 8, muted);
  text(198, 269, periodMode ? "Saldos al último movimiento del rango" : "Datos de la caja consultada", 7, muted, false, true);
  doc.setDrawColor("#D9E4E9"); doc.line(12, 280, 96, 280); doc.line(114, 280, 198, 280);
  text(12, 285, "Preparado por", 8, muted); text(114, 285, "Revisado por", 8, muted);
  text(12, 293, periodMode ? "Fondos y saldos acumulados por caja; no equivalen a efectivo físico conjunto." : `Caja: ${report.session?.id ?? "Sin apertura registrada"}`, 6, muted); if (!report.weekly) text(198, 293, "1 / 1", 7, muted, false, true);
  if (report.weekly) {
    const week=report.weekly;
    doc.addPage();
    text(12,18,"Control semanal de efectivo",20,navy,true);
    text(12,27,`Martes ${week.start} a lunes ${week.end}`,10,muted);
    autoTable(doc,{startY:34,margin:{left:12,right:12},head:[["Concepto","Monto"]],body:[
      ["Efectivo neto generado en la semana",dollars(week.netGenerated)],
      ["Cobros netos en efectivo de la semana",dollars(week.cashReceipts)],
      ["Fondos adicionales a Caja (no son ganancias)",dollars(week.additionalFunding??0)],
      ["Salidas de efectivo desde Caja",dollars(week.cashOutgoings)],
      ["Vales entregados en la semana (incluidos en salidas)",dollars(week.advances)],
      ["Gastos directos desde sobres",dollars(week.envelopeExpenses)],
      ["Traslados de sobres a Caja (no son ingresos)",dollars(week.toCash)],
      ["Disponible hoy en sobres originados esta semana",dollars(week.envelopeBalance)],
      ["Vales del período para descuento de nómina",dollars(report.advancesTotal??0)],
      ["Nómina neta del período después de vales",dollars(report.payrollNet??report.payroll)],
    ],styles:{font:"ReportSans",fontSize:9,cellPadding:2.5},headStyles:{fillColor:navy},columnStyles:{1:{halign:"right"}}});
    const y=(doc as jsPDF & {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+9;
    text(12,y,"Sobres de cada día (saldo actual)",12,navy,true);
    autoTable(doc,{startY:y+4,margin:{left:12,right:12},head:[["Sobre del día","Recibido + inicial","Gastos","A Caja","Disponible"]],body:week.envelopes.length?week.envelopes.map(e=>[e.day,dollars(e.deposited+(e.initialAmount??0)),dollars(e.spent),dollars(e.toCash),dollars(e.balance)]):[["Sin sobres registrados","-","-","-","-"]],styles:{font:"ReportSans",fontSize:8,cellPadding:2.5},headStyles:{fillColor:green}});
  }
  if (report.weekly) {
    const pages=doc.getNumberOfPages();
    for(let page=1;page<=pages;page++){doc.setPage(page);text(198,293,`${page} / ${pages}`,7,muted,false,true);}
  }
  return doc;
}
