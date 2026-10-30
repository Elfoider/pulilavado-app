const {test}=require('node:test');const assert=require('node:assert/strict');const XLSX=require('xlsx');const {unzipSync,strFromU8}=require('fflate');
const {financialPDF}=require('../../../.test-build/features/reports/exports/pdf.js');const {financialExcel}=require('../../../.test-build/features/reports/exports/excel.js');const {detailMovements,cashTotals}=require('../../../.test-build/features/reports/domain/cash.js');
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


test('weekly PDF and Excel include advances, envelope states and old-envelope withdrawals',()=>{
 const weekly={start:'2026-10-27',end:'2026-11-02',cashReceipts:100,cashOutgoings:20,advances:20,netGenerated:75,deposited:80,envelopeExpenses:5,toCash:0,envelopeBalance:80,envelopes:[{id:'2026-10-27',day:'2026-10-27',weekStart:'2026-10-27',balance:80,deposited:80,spent:0,toCash:0,revision:1}],envelopeMovements:[{id:'old',day:'2026-10-27',envelopeDay:'2026-10-20',kind:'expense',amount:-5,balanceBefore:20,balanceAfter:15,description:'Emergencia de otro sobre'}],advanceRows:[]};
 const data={...report,weekly,advancesTotal:20,payrollNet:10.10,advanceRows:[{id:'vale1',day:'2026-10-27',washerId:'a',washerName:'Ana',amount:20,description:'Adelanto',sessionId:'cash'}]};
 const pdf=financialPDF(data);assert.ok(pdf.getNumberOfPages()>=2);
 const wb=XLSX.read(financialExcel(data),{type:'array'});assert.deepEqual(wb.SheetNames,['Resumen','Movimientos','Vales','Control semanal']);assert.equal(wb.Sheets.Resumen.F34.v,20);assert.equal(wb.Sheets.Resumen.F37.v,10.10);assert.equal(wb.Sheets.Vales.C2.v,20);assert.equal(wb.Sheets['Control semanal'].B4.v,75);assert.ok(XLSX.utils.sheet_to_json(wb.Sheets['Control semanal'],{header:1}).flat().includes('2026-10-20'));
});


test('cash breakdown nets corrected receipts and keeps expenses, advances and transfers distinct',()=>{
 const {cashMovementBreakdown}=require('../../../.test-build/features/reports/domain/cash.js');
 const row=(kind,amount,method='Efectivo')=>({kind,amount,method});
 assert.deepEqual(cashMovementBreakdown([
  row('opening',65),row('service_payment',10),row('service_correction',-10),row('service_payment',8),row('service_payment_tip',2),row('sale_refund',-3),
  row('expense',-5),row('withdrawal',-7),row('payroll_advance',-20),row('envelope_deposit',-30),row('envelope_to_cash',10),row('income',4),row('expense',-99,'Tarjeta'),
 ]),{collections:7,expenses:5,withdrawals:7,savedToEnvelopes:30,fromEnvelopes:10,funding:4});
});

test('historical saving to envelopes retains generated cash in PDF and Excel without changing ledger or physical balances',()=>{
 const {summarizePeriodCash,reportCashView}=require('../../../.test-build/features/reports/domain/cash.js');
 const events=[['opening',65],['service_payment',100],['expense',-10],['payroll_advance',-20],['envelope_deposit',-70]].map(([kind,amount],i)=>({id:`old-${i}`,sessionId:'historic',method:'Efectivo',kind,amount,description:kind,referenceId:`ref-${i}`,createdAt:{seconds:1000+i}}));
 const historical={...session,id:'historic',status:'closed',openingAmount:65,balances:{...balances(),Efectivo:65}};
 const original=structuredClone(events);const movements=detailMovements(events,historical);const data={...report,session:null,movements,periodCash:summarizePeriodCash(movements)};const cash=reportCashView(data);
 assert.equal(cash.generated,70);assert.equal(cash.saved,70);assert.equal(cash.pending,0);assert.equal(cash.operatingOutgoing,30);assert.equal(cash.net,0);assert.equal(cash.balance,65);assert.equal(cash.reconciled,true);assert.deepEqual(events,original);
 const wb=XLSX.read(financialExcel(data),{type:'array'});assert.equal(wb.Sheets.Resumen.A6.v,70);assert.equal(wb.Sheets.Resumen.F22.v,30);assert.equal(wb.Sheets.Resumen.F25.v,70);assert.equal(wb.Sheets.Resumen.F31.v,0);assert.equal(wb.Sheets.Movimientos.E6.v,-70);assert.equal(wb.Sheets.Movimientos.C6.v,'Traslado a sobre');
 const doc=new (require('jspdf').jsPDF)();const texts=[];const draw=doc.text.bind(doc);doc.text=(...args)=>{texts.push(args[0]);return draw(...args)};financialPDF(data,doc);assert.ok(texts.includes('$70.00'));assert.ok(texts.includes('Guardado en sobres $70.00 · Pendiente $0.00'));assert.equal(doc.getNumberOfPages(),1);
});
test('partial saving and envelope refills preserve generated earnings without creating new income',()=>{
 const {cashSavings}=require('../../../.test-build/features/reports/domain/cash.js');const row=(kind,amount)=>({kind,amount,method:'Efectivo'});
 assert.deepEqual(cashSavings([row('envelope_deposit',-40)],30,70),{generated:70,saved:40,pending:30,operatingOutgoing:30});
 assert.deepEqual(cashSavings([row('envelope_deposit',-70),row('envelope_to_cash',20),row('income',10)],30,100),{generated:70,saved:70,pending:30,operatingOutgoing:30});
 assert.equal(cashSavings([row('envelope_deposit',-70),row('envelope_to_cash',20),row('expense',-20)],0,120).generated,50);
});
