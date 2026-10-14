const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function harness(race=false,fail=false){
 const session={status:'open',openingAmount:0,balances:{Efectivo:7,Yappy:0,Tarjeta:0,Transferencia:0},receipts:12,tips:0,expenses:5,movementSequence:3};let reads=0,lists=0;
 const code=ts.transpileModule(fs.readFileSync('src/lib/reports/loadCash.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const compiled={exports:{}};
 const mock={doc:(_,path,id)=>id===undefined?path:path+'/'+id,collection:()=>'',query:x=>x,where(){},async getDocFromServer(path){if(fail)throw Error('Permission denied');if(path==='cashControl/current')return{data:()=>({sessionId:'c'})};reads++;const data={...session,movementSequence:race&&reads===2?4:3};return{data:()=>data}},async getDocsFromServer(){lists++;return{docs:[]}}};
 new Function('require','module','exports',code)(name=>name==='firebase/firestore'?mock:name==='../firebase'?{db:{}}:name==='../operations/model'?require('../.test-build/operations/model.js'):require('../.test-build/reports/cash.js'),compiled,compiled.exports);
 return{run:compiled.exports.loadCashReport,lists:()=>lists};
}
test('cash export retries a snapshot changed during ledger loading',async()=>{const h=harness(true);const result=await h.run();assert.equal(h.lists(),2);assert.equal(result.session.balances.Efectivo,7)});
test('cash export exposes read errors rather than generating missing movements as zeros',async()=>{await assert.rejects(harness(false,true).run(),/Permission denied/)});
