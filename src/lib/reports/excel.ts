import * as XLSX from "xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { METHODS } from "../operations/model";
import { cashTotals, FinancialReport, movementKinds } from "./cash";
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function financialExcel(report: FinancialReport): Uint8Array {
  const wb = XLSX.utils.book_new();
  const cash = report.session ? cashTotals(report.session, report.movements) : null;
  const rows: (string | number | null)[][] = Array.from({ length: 39 }, () => []);
  const put = (r: number, c: number, v: string | number | null) => { rows[r - 1][c - 1] = v; };
  put(1, 1, "MR. ESPUMA / PULILAVADO"); put(2, 1, "Reporte financiero"); put(3, 1, report.period); put(3, 10, report.generatedAt);
  put(5, 1, "EFECTIVO A GUARDAR DE LA JORNADA"); put(6, 1, cash?.net ?? "Sin caja abierta");
  put(9, 1, "Saldo total en caja (incluye fondo)"); put(9, 6, report.session?.balances.Efectivo ?? "Sin caja abierta");
  put(10, 1, "Ventas de servicios y productos"); put(10, 6, report.sales);
  rows[11] = ["Método", "Ventas", null, "Propinas", null, null, null, "Total"];
  METHODS.forEach((m, i) => { put(13 + i, 1, m); put(13 + i, 2, report.income[m]); put(13 + i, 4, report.tips[m]); put(13 + i, 8, report.income[m] + report.tips[m]); });
  put(17, 1, "TOTAL"); put(17, 2, report.sales); put(17, 4, METHODS.reduce((s, m) => s + report.tips[m], 0)); put(17, 8, report.sales + METHODS.reduce((s, m) => s + report.tips[m], 0));
  put(19, 1, "Conciliación del efectivo de la caja actual");
  [["Fondo inicial", report.session?.openingAmount], ["Entradas netas en efectivo", cash?.reconciled ? cash.incoming : undefined], ["Pagos y gastos en efectivo", cash?.reconciled ? cash.outgoing : undefined], ["Saldo total en caja", report.session?.balances.Efectivo], ["Efectivo a guardar de la jornada", cash?.net]].forEach(([label, value], i) => { put(20 + i, 1, label as string); put(20 + i, 6, value ?? "No disponible"); });
  put(26, 1, "Comisiones y propinas");
  [["Comisiones generadas", report.payroll], ["Ventas menos comisiones", report.business], ["Propinas recibidas", METHODS.reduce((s, m) => s + report.tips[m], 0)], ["Salidas de efectivo", cash?.reconciled ? cash.outgoing : "No disponible"]].forEach(([label, value], i) => { put(27 + i, 1, label); put(27 + i, 6, value); });
  put(32, 1, "Ingresos del negocio antes de costos y gastos."); put(33, 1, "Caja actual independiente del filtro de ventas.");
  put(35, 1, `Caja: ${report.session?.id ?? "Sin caja abierta"}`); put(36, 1, "Arqueo físico: pendiente");
  put(35, 10, "Guardar"); put(35, 11, cash?.net ?? null); put(36, 10, "Salidas"); put(36, 11, cash?.outgoing ?? null);
  put(38, 1, "Preparado por: __________________"); put(38, 10, "Revisado por: __________________");
  const summary = XLSX.utils.aoa_to_sheet(rows);
  for (let col=0; col<8; col++) { const key=XLSX.utils.encode_cell({r:11,c:col}); if (!summary[key]) summary[key]={t:"s",v:""}; }
  summary["!rows"] = Array.from({length:39}, (_, i) => ({hpt: i === 1 ? 26 : 20}));
  summary["!cols"] = Array.from({ length: 16 }, (_, i) => ({ wch: i === 0 ? 16 : 9 }));
  summary["!merges"] = ["A1:H1", "A2:H2", "A3:H3", "J3:P3", "A5:P5", "A6:P7", "A9:E9", "F9:H9", "A10:E10", "F10:H10", "A19:H19", "A26:H26", "A32:H32", "A33:H33", "A35:H35", "A36:H36", "A38:H38", "J38:P38", ...Array.from({length: 11}, (_,i)=>i < 5 ? `A${20+i}:E${20+i}` : i < 9 ? `A${27+i-5}:E${27+i-5}` : i===9 ? "F24:H24" : "F23:H23")].map(XLSX.utils.decode_range);
  for (const r of [20,21,22,27,28,29,30]) summary["!merges"]!.push(XLSX.utils.decode_range(`F${r}:H${r}`));
  for (const addr of Object.keys(summary)) { if (addr.startsWith("!")) continue; if (summary[addr].t === "n") summary[addr].z = '"$"#,##0.00;[Red]("$"#,##0.00)'; }
  const details = [["Fecha", "Orden", "Tipo", "Método", "Monto", "Saldo método antes", "Saldo método después", "Efectivo antes", "Efectivo después", "Yappy antes", "Yappy después", "Tarjeta antes", "Tarjeta después", "ACH antes", "ACH después", "Detalle", "Referencia", "ID movimiento", "Saldos"],
    ...report.movements.map(m => [m.createdAt ? (m.createdAt.seconds - 4 * 3600) / 86400 + 25569 : null, m.sequence ?? null, movementKinds[m.kind] ?? m.kind, m.method, m.amount, m.balancesBefore?.[m.method] ?? null, m.balancesAfter?.[m.method] ?? null, ...METHODS.flatMap(method => [m.balancesBefore?.[method] ?? null, m.balancesAfter?.[method] ?? null]), m.description, m.referenceId, m.id, m.balanceSource])];
  const movements = XLSX.utils.aoa_to_sheet(details);
  movements["!cols"] = details[0].map((_, i) => ({ wch: i === 0 ? 22 : i >= 15 ? 32 : i === 2 ? 23 : 19 }));
  movements["!autofilter"] = { ref: `A1:S${details.length}` };
  for (let r = 2; r <= details.length; r++) { if (movements[`A${r}`]) movements[`A${r}`].z = "dd/mm/yyyy hh:mm:ss"; for (let col = 4; col <= 14; col++) { const cell = movements[`${XLSX.utils.encode_col(col)}${r}`]; if (cell?.t === "n") cell.z = '"$"#,##0.00;[Red]("$"#,##0.00)'; } }
  XLSX.utils.book_append_sheet(wb, summary, "Resumen"); XLSX.utils.book_append_sheet(wb, movements, "Movimientos");
  wb.Workbook = { Names: [{Name:"_xlnm.Print_Area",Sheet:0,Ref:"Resumen!$A$1:$P$39"}] };
  const files = unzipSync(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
  // Apply presentation styles and native editable charts to the exported OOXML.
  const styles = strFromU8(files["xl/styles.xml"]);
  const fills = '<fill><patternFill patternType="solid"><fgColor rgb="FF112D3B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF116849"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F6F8"/><bgColor indexed="64"/></patternFill></fill>';
  const fillCount = Number(styles.match(/<fills count="(\d+)"/)?.[1]);
  const fontCount = Number(styles.match(/<fonts count="(\d+)"/)?.[1]);
  const xfCount = Number(styles.match(/<cellXfs count="(\d+)"/)?.[1]);
  let styled = styles.replace(/<fills count="\d+">([\s\S]*?)<\/fills>/, `<fills count="${fillCount + 3}">$1${fills}</fills>`).replace(/<fonts count="\d+">([\s\S]*?)<\/fonts>/, `<fonts count="${fontCount+2}">$1<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="22"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>`);
  const currencyFormat = styles.match(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="[^"]*\$[^"]*"/)?.[1] ?? "0";
  const extra = [0,1,2].map((fill,i)=>`<xf numFmtId="${i===1 ? currencyFormat : 0}" fontId="${i===1 ? fontCount+1 : fontCount}" fillId="${fillCount+fill}" borderId="0" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center"${i===1 ? ' horizontal="left"' : ''}/></xf>`).join('');
  styled = styled.replace(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/, `<cellXfs count="${xfCount+3}">$1${extra}</cellXfs>`); files['xl/styles.xml']=strToU8(styled);
  let sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  sheet = sheet.replace(/<c r="([A-Z]+)(\d+)"([^>]*)>/g, (whole,col,r,rest)=> { const row=Number(r); const style = [1,2,5,12,19,26].includes(row) ? xfCount : row===6 ? xfCount+1 : null; return style===null ? whole : `<c r="${col}${r}"${rest.replace(/ s="\d+"/,'')} s="${style}">`; });
  const printing = '<printOptions gridLines="0"/><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/>';
  // CT_Worksheet requires printing before ignoredErrors, then drawings.
  sheet = sheet.includes('<ignoredErrors>') ? sheet.replace('<ignoredErrors>', printing + '<ignoredErrors>') : sheet.replace('</worksheet>', printing + '</worksheet>');
  sheet = sheet.replace('</worksheet>', '<drawing r:id="rIdCharts"/></worksheet>');
  sheet = sheet.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:P39"/>');
  sheet=sheet.replace(/<worksheet([^>]*)>/, '<worksheet$1><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>').replace(/<sheetView /,'<sheetView showGridLines="0" ');
  files['xl/worksheets/sheet1.xml']=strToU8(sheet);
  let detailSheet = strFromU8(files['xl/worksheets/sheet2.xml']);
  detailSheet = detailSheet.replace(/<sheetView\b([^>]*?)(\/>|>)/, (_, attrs, ending) => `<sheetView${attrs}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>${ending === '/>' ? '</sheetView>' : ''}`);
  detailSheet = detailSheet.replace(/<c r="([A-Z]+)1"([^>]*)>/g, (whole,col,rest)=>`<c r="${col}1"${rest.replace(/ s="\d+"/,'')} s="${xfCount}">`);
  files['xl/worksheets/sheet2.xml']=strToU8(detailSheet);
  files['xl/worksheets/_rels/sheet1.xml.rels']=strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdCharts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  const chart = (labels: string[], values: number[], catRef: string, valueRef: string, title: string, colors = ["116849", "007C91", "112D3B", "8A77B4"]) => `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-ES"/><a:t>${xml(title)}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${values.map((_,i)=>`<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${colors[i % colors.length]}"/></a:solidFill></c:spPr></c:dPt>`).join('')}<c:cat><c:strRef><c:f>${catRef}</c:f><c:strCache><c:ptCount val="${labels.length}"/>${labels.map((s,i)=>`<c:pt idx="${i}"><c:v>${xml(s)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${valueRef}</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v,i)=>`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser><c:dLbls><c:showPercent val="1"/></c:dLbls><c:holeSize val="65"/></c:doughnutChart></c:plotArea><c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
  files['xl/charts/chart1.xml']=strToU8(chart([...METHODS],METHODS.map(m=>report.income[m]+report.tips[m]),"'Resumen'!$A$13:$A$16","'Resumen'!$H$13:$H$16","Cobros por método"));
  const showCashChart = cash && cash.reconciled && cash.net >= 0 && cash.outgoing >= 0 && cash.incoming > 0;
  if(showCashChart) files['xl/charts/chart2.xml']=strToU8(chart(['Guardar','Salidas'],[cash.net,cash.outgoing],"'Resumen'!$J$35:$J$36","'Resumen'!$K$35:$K$36","Efectivo de la jornada", ["116849", "F7BC58"]));
  const count=showCashChart?2:1;
  files['xl/drawings/drawing1.xml']=strToU8(`<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${Array.from({length:count},(_,i)=>`<xdr:twoCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${i===0?8:21}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>16</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${i===0?20:34}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i+1}" name="Gráfica ${i+1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('')}</xdr:wsDr>`);
  files['xl/drawings/_rels/drawing1.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({length:count},(_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i+1}.xml"/>`).join('')}</Relationships>`);
  files['[Content_Types].xml']=strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>',`<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${Array.from({length:count},(_,i)=>`<Override PartName="/xl/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}</Types>`));
  return zipSync(files);
}
export function saveExcel(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
