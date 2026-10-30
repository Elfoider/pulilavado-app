const {test}=require('node:test');const assert=require('node:assert/strict');const {summarizeActivity}=require('../../../.test-build/features/reports/domain/activity.js');
const line=(catalogId,name)=>({catalogId,name});
test('daily activity counts vehicles once and each selected service separately, including unpaid work',()=>{
 const rows=Array.from({length:5},(_,i)=>({paymentStatus:i===0?'pending':'paid',serviceItems:[line('wash','Lavado'),...(i<3?[line('hydration','Hidratación')]:[]),...(i<2?[line('engine','Lavado de motor')]:[])]}));
 rows.push({status:'cancelled',serviceItems:[line('wash','Lavado')]});
 const result=summarizeActivity(rows);assert.equal(result.vehicles,5);assert.equal(result.services,10);assert.deepEqual(result.rows.map(row=>[row.name,row.count]),[['Lavado',5],['Hidratación',3],['Lavado de motor',2]]);
});
test('manual and legacy work is explicitly personalized and catalog identity survives renaming without merging equal names',()=>{
 const result=summarizeActivity([{serviceItems:[]},{},{serviceItems:[line('a','Lavado nuevo')]},{serviceItems:[line('a','Lavado anterior')]},{serviceItems:[line('b','Lavado nuevo')]}]);
 assert.equal(result.vehicles,5);assert.equal(result.services,5);assert.equal(result.rows.find(row=>row.id==='custom').count,2);assert.equal(result.rows.find(row=>row.id==='custom').name,'Servicio personalizado');assert.equal(result.rows.find(row=>row.id==='catalog:a').count,2);assert.equal(result.rows.find(row=>row.id==='catalog:b').count,1);
 assert.deepEqual(summarizeActivity([]),{vehicles:0,services:0,rows:[]});assert.equal(summarizeActivity([{status:'cancelled'}]).services,0);
});
