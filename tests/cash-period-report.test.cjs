const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const XLSX=require('xlsx');
const {financialExcel}=require('../.test-build/reports/excel.js');
const treasury=require('../.test-build/operations/treasury-model.js');
const balances=n=>({Efectivo:n,Yappy:0,Tarjeta:0,Transferencia:0});
const seconds=s=>Date.parse(s)/1000;
function setup({active=true,fail=false}={}){
 const sessions={old:{status:'closed',closedAt:{seconds:seconds('2026-10-27T20:00:00-04:00')},openingAmount:20,balances:balances(40),receipts:30,tips:0,expenses:10},current:{status:'open',openingAmount:10,balances:balances(45),receipts:40,tips:0,expenses:5}};
 const row=(id,sessionId,kind,amount,time)=>({id,sessionId,kind,amount,method:'Efectivo',description:id,referenceId:id,createdAt:{seconds:seconds(time)}});
 const rows=[
 row('before','old','opening',20,'2026-10-26T23:00:00-04:00'),
 row('tuesday-sale','old','sale',30,'2026-10-27T00:00:00-04:00'),
 row('tuesday-expense','old','expense',-10,'2026-10-27T18:00:00-04:00'),
 row('wednesday-opening','current','opening',10,'2026-10-28T08:00:00-04:00'),
 row('wednesday-sale','current','sale',40,'2026-10-28T12:00:00-04:00'),
 row('wednesday-expense','current','expense',-5,'2026-10-28T23:59:59-04:00'),
 row('after','next','opening',100,'2026-10-29T00:00:00-04:00')];
 const mock={doc:(_,p,id)=>id?p+'/'+id:p,collection:(_,p)=>p,query:(path,...filters)=>({path,filters}),where:(field,op,value)=>({field,op,value}),Timestamp:{fromDate:d=>({seconds:d.getTime()/1000})},
 async getDocFromServer(path){if(path==='cashControl/current')throw Error('Range reports must not read current cash');return{data:()=>path==='cashControl/current'?(active?{sessionId:'current'}:{}):sessions[path.split('/')[1]]}},
 async getDocsFromServer(q){if(fail)throw Error('Permission denied');return{docs:rows.filter(row=>q.filters.every(f=>{const a=f.field==='createdAt'?row.createdAt.seconds:row[f.field];const b=f.field==='createdAt'?f.value.seconds:f.value;return f.op==='=='?a===b:f.op==='>='?a>=b:a<b})).map(row=>({id:row.id,data:()=>row}))}}};
 const compiled={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/lib/reports/loadCash.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name==='firebase/firestore'?mock:name==='../firebase'?{db:{}}:name==='../operations/treasury-model'?treasury:name==='../operations/model'?require('../.test-build/operations/model.js'):require('../.test-build/reports/cash.js'),compiled,compiled.exports);
 return compiled.exports.loadCashReport;
}
test('Excel period contains all selected days and sessions, reconstructs using full ledger, ignores unrelated current cash',async()=>{
 const snapshot=await setup()({start:'2026-10-27',end:'2026-10-28'});
 assert.deepEqual(snapshot.movements.map(r=>r.id),['tuesday-sale','tuesday-expense','wednesday-opening','wednesday-sale','wednesday-expense']);
 assert.equal(snapshot.movements[0].balanceSource,'Reconstruido');
 assert.equal(snapshot.movements[0].balancesBefore.Efectivo,20);
 assert.equal(snapshot.movements[0].balancesAfter.Efectivo,50);
 assert.equal(snapshot.session,null);
 assert.equal(snapshot.periodCash.net,55);
 const bytes=financialExcel({...snapshot,period:'2026-10-27 a 2026-10-28',generatedAt:'test',sales:70,business:35,payroll:35,income:balances(70),tips:balances(0)});
 const wb=XLSX.read(bytes,{type:'array'});const sheet=wb.Sheets.Movimientos;
 assert.equal(sheet['!ref'],'A1:T6');
 assert.equal(sheet.R2.v,'tuesday-sale');assert.equal(sheet.T2.v,'old');assert.equal(sheet.T6.v,'current');
 assert.equal(wb.Sheets.Resumen.F21.v,70);assert.equal(wb.Sheets.Resumen.F22.v,15);assert.equal(wb.Sheets.Resumen.F23.v,85);
});
test('historical Excel movements are available without any open cash and a single day excludes adjacent days',async()=>{
 const result=await setup({active:false})({start:'2026-10-27',end:'2026-10-27'});
 assert.equal(result.session,null);assert.deepEqual(result.movements.map(r=>r.id),['tuesday-sale','tuesday-expense']);
 const empty=await setup({active:false})({start:'2026-10-01',end:'2026-10-01'});assert.deepEqual(empty.movements,[]);
 await assert.rejects(setup({active:false})({start:'2026-10-29',end:'2026-10-27'}),/rango/);
 await assert.rejects(setup({active:false,fail:true})({start:'2026-10-27',end:'2026-10-28'}),/Permission denied/);
});

test('PDF uses only period cash, omits detailed movements, and never replaces cash amount with closed status', async()=>{
 const snapshot=await setup()({start:'2026-10-27',end:'2026-10-27'});
 assert.equal(snapshot.periodCash.statusLabel,'Cajas cerradas en el período');
 const {jsPDF}=require('jspdf');const {financialPDF}=require('../.test-build/reports/pdf.js');
 const doc=new jsPDF(),texts=[];const draw=doc.text.bind(doc);doc.text=(...args)=>{texts.push(args[0]);return draw(...args)};
 const data={...snapshot,period:'2026-10-27',generatedAt:'test',sales:30,business:15,payroll:15,income:balances(30),tips:balances(0)};
 const pdf=financialPDF(data,doc);const content=JSON.stringify(texts);
 assert.equal(pdf.getNumberOfPages(),1);
 assert.ok(content.includes('$20.00'));assert.ok(!content.includes('tuesday-sale'));assert.ok(!content.includes('tuesday-expense'));
 assert.ok(!content.includes('wednesday-sale'));assert.ok(!content.includes('Caja abierta'));assert.ok(!content.includes('Sin caja abierta'));
 const empty=await setup()({start:'2026-10-01',end:'2026-10-01'});
 assert.equal(empty.periodCash.net,0);assert.equal(empty.periodCash.balance,0);assert.equal(empty.periodCash.statusLabel,'Sin movimientos de caja');
 const wb=XLSX.read(financialExcel({...data,...empty}),{type:'array'});
 assert.equal(wb.Sheets.Resumen.A6.v,0);assert.equal(wb.Sheets.Resumen.A36.v,'Sin movimientos de caja');
});
