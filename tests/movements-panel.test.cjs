const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const React=require('react');
function harness(){
 let cursor=0;const states=[],effects=[],requests=[];
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useEffect(fn,deps){const i=cursor++;const old=states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();states[i]={deps};effects.push(()=>{states[i].cleanup=fn()})}}};
 const compiled={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/components/MovementsPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name==='react'?hooks:name==='@/lib/reports/loadCash'?{loadCashReport:range=>new Promise((resolve,reject)=>requests.push({range,resolve,reject}))}:name==='@/lib/operations/treasury-model'?require('../.test-build/operations/treasury-model.js'):name==='@/lib/operations/model'?require('../.test-build/operations/model.js'):name==='@/lib/reports/cash'?require('../.test-build/reports/cash.js'):name==='@/lib/utils'?{formatMoney:n=>`$${n.toFixed(2)}`}:require(name),compiled,compiled.exports);
 function render(){cursor=0;const tree=compiled.exports.default();while(effects.length)effects.shift()();return tree}
 function nodes(tree){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)]}
 function text(node){if(node==null)return'';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
 const all=()=>nodes(render());return{requests,render,text,all,button:label=>all().find(n=>n.type==='button'&&text(n)===label),async flush(){await new Promise(resolve=>setImmediate(resolve));}};
}
const balances={Efectivo:20,Yappy:0,Tarjeta:0,Transferencia:0};
const result=count=>({periodCash:{incoming:20,outgoing:5},movements:Array.from({length:count},(_,i)=>({id:`row-${i}`,sessionId:'historical-cash',referenceId:`ref-${i}`,kind:'expense',description:`Movimiento ${i}`,amount:-5,method:'Efectivo',createdAt:{seconds:1793073600+i},balancesBefore:balances,balancesAfter:{...balances,Efectivo:15},balanceSource:'Registrado'}))});
test('movements page loads the selected dates without open cash, paginates every result and exposes audit details',async()=>{
 const h=harness();h.render();assert.equal(h.requests.length,1);h.requests[0].resolve(result(51));await h.flush();
 let output=h.text(h.render());assert.match(output,/Página 1 de 2/);assert.ok(output.includes('Movimiento 49'));assert.ok(!output.includes('Movimiento 50'));assert.ok(output.includes('historical-cash'));assert.ok(output.includes('$15.00'));
 h.button('Siguiente').props.onClick();output=h.text(h.render());assert.match(output,/Página 2 de 2/);assert.ok(output.includes('Movimiento 50'));
 const dates=h.all().filter(n=>n.type==='input');dates[0].props.onChange({target:{value:'2026-10-13'}});dates[1].props.onChange({target:{value:'2026-10-19'}});
 h.all().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();assert.deepEqual(h.requests[1].range,{start:'2026-10-13',end:'2026-10-19'});assert.ok(!h.text(h.render()).includes('Movimiento 50'));
 h.requests[1].resolve(result(0));await h.flush();assert.match(h.text(h.render()),/No hay movimientos en este rango/);
});
test('movements page ignores obsolete requests and shows errors without stale data',async()=>{
 const h=harness();h.render();h.button('Hoy').props.onClick();h.render();h.requests[1].resolve(result(1));await h.flush();assert.match(h.text(h.render()),/Movimiento 0/);
 h.requests[0].resolve(result(51));await h.flush();assert.ok(!h.text(h.render()).includes('Movimiento 50'));
 h.button('Esta semana').props.onClick();h.render();h.requests[2].reject(Error('No se pudo consultar Firestore'));await h.flush();assert.match(h.text(h.render()),/No se pudo consultar Firestore/);assert.ok(!h.text(h.render()).includes('Movimiento 0'));
});
