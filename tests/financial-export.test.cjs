const {test}=require('node:test');const assert=require('node:assert/strict');const XLSX=require('xlsx');const {unzipSync,strFromU8}=require('fflate');
const {financialPDF}=require('../.test-build/reports/pdf.js');const {financialExcel}=require('../.test-build/reports/excel.js');const {detailMovements,cashTotals}=require('../.test-build/reports/cash.js');
const balances=()=>({Efectivo:0,Yappy:0,Tarjeta:0,Transferencia:0});
const session={id:'cash',status:'open',openingAmount:65,balances:{Efectivo:72,Yappy:57,Tarjeta:22,Transferencia:0},receipts:86,tips:5,expenses:0};
const raw=[['opening','Efectivo',65],['service_payment','Efectivo',12],['service_payment','Yappy',52],['service_payment_tip','Yappy',5],['service_payment','Tarjeta',22],['withdrawal','Efectivo',-5]].map(([kind,method,amount],i)=>({id:String(i),sessionId:'cash',kind,method,amount,description:kind==='withdrawal'?'Propinas':kind,referenceId:'ref',createdAt:{seconds:1791937000+i}}));
const report={period:'13/10/2026',generatedAt:'13/10/2026 21:30',sales:86,business:55.90,payroll:30.10,income:{Efectivo:12,Yappy:52,Tarjeta:22,Transferencia:0},tips:{...balances(),Yappy:5},session,movements:detailMovements(raw,session)};
test('historical movements reconstruct only complete, reconciled and unambiguous records',()=>{
 assert.ok(report.movements.every(m=>m.balanceSource==='Reconstruido'));
 assert.equal(report.movements.at(-1).balancesBefore.Efectivo,77);assert.equal(report.movements.at(-1).balancesAfter.Efectivo,72);
 assert.ok(detailMovements(raw.slice(1),session).every(m=>m.balanceSource==='No disponible'));
 assert.ok(detailMovements(raw,{...session,balances:{...session.balances,Efectivo:67}}).every(m=>m.balanceSource==='No disponible'));
 const tied=raw.map(r=>({...r,createdAt:{seconds:1}}));assert.ok(detailMovements(tied,session).every(m=>m.balanceSource==='No disponible'));
});
test('reversals net against cash receipts instead of inflating cash chart inflows and paid expenses',()=>{
 const reversed=[...raw,{...raw[1],id:'x',kind:'service_correction',amount:-7},{...raw[1],id:'y',amount:7}];
 assert.deepEqual(cashTotals(session,reversed),{incoming:12,outgoing:5,net:7,reconciled:true});
});
test('financial PDF stays one page and uses the approved cash label, including no cash and negative net',()=>{
 for(const data of [report,{...report,session:null,movements:[]},{...report,session:{...session,balances:{...session.balances,Efectivo:60}}}]){
  const doc=new (require("jspdf").jsPDF)();const texts=[];const draw=doc.text.bind(doc);doc.text=(...args)=>{texts.push(args[0]);return draw(...args)};const pdf=financialPDF(data,doc);assert.equal(pdf.getNumberOfPages(),1);assert.ok(texts.includes("EFECTIVO A GUARDAR DE LA JORNADA"));assert.ok(texts.includes("Efectivo a guardar de la jornada"));
 }
});
test('Excel has a numeric summary, all movement states, frozen headers, two native charts and one-page summary',()=>{
 const bytes=financialExcel(report);const wb=XLSX.read(bytes,{type:'array'});
 assert.deepEqual(wb.SheetNames,['Resumen','Movimientos']);assert.equal(wb.Sheets.Resumen.A6.v,7);assert.equal(wb.Sheets.Resumen.F9.v,72);assert.equal(wb.Sheets.Resumen.B13.v,12);
 const sheet=wb.Sheets.Movimientos;assert.equal(sheet.H7.v,77);assert.equal(sheet.I7.v,72);assert.equal(sheet.S7.v,'Reconstruido');assert.equal(sheet.E7.t,'n');
 const z=unzipSync(bytes);assert.ok(z['xl/charts/chart1.xml']);assert.ok(z['xl/charts/chart2.xml']);assert.match(strFromU8(z['xl/worksheets/sheet1.xml']),/fitToHeight="1"/);assert.match(strFromU8(z['xl/worksheets/sheet2.xml']),/state="frozen"/);
 assert.match(strFromU8(z['xl/charts/chart1.xml']),/Resumen.*\$H\$13:\$H\$16/);
});


test('historical receipt and tip order, including a correction in one transaction, follows the original ledger',()=>{
 const old=[{...raw[0]},{...raw[2],createdAt:{seconds:2,nanoseconds:1}},{...raw[3],createdAt:{seconds:2,nanoseconds:1}}];old[0].createdAt={seconds:1};
 const historic={...session,balances:{Efectivo:65,Yappy:57,Tarjeta:0,Transferencia:0}};
 const sorted=detailMovements([...old].reverse(),historic);assert.ok(sorted.every(m=>m.balanceSource==='Reconstruido'));
 assert.equal(sorted[1].kind,'service_payment');assert.equal(sorted[2].balancesBefore.Yappy,52);
});


test('Excel worksheet elements follow Open XML order and panes belong inside a sheetView',()=>{
 const z=unzipSync(financialExcel(report));const summary=strFromU8(z['xl/worksheets/sheet1.xml']);const details=strFromU8(z['xl/worksheets/sheet2.xml']);
 const order=['<sheetPr>','<dimension ','<sheetViews>','<cols>','<sheetData>','<mergeCells ','<printOptions ','<pageMargins ','<pageSetup ','<ignoredErrors>','<drawing '];
 let previous=-1;
 for(const tag of order){const index=summary.indexOf(tag);assert.ok(index>previous,`${tag} fuera del orden requerido por CT_Worksheet`);previous=index;}
 assert.match(summary,/<dimension ref="A1:P39"\/>/);
 assert.equal((summary.match(/<sheetPr>/g)||[]).length,1);
 assert.match(details,/<sheetViews><sheetView\b[^>]*><pane\b[^>]*\/><\/sheetView><\/sheetViews>/);
 assert.doesNotMatch(details,/<sheetViews><pane\b/);
});
