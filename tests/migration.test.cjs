const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {auditSnapshot}=require('../.test-build/migration/audit.js');const {migrationRuntime}=require('../.test-build/migration/runtime.js');
const fresh=()=>JSON.parse(fs.readFileSync('fixtures/migration/demo-snapshot.json','utf8'));const scope={organizationId:'empresa-demo',branchId:'centro'};
const codes=r=>r.issues.map(issue=>issue.code);
test('valid snapshot audit is deterministic, local, immutable, scoped and never importable',async()=>{
 const input=fresh(),original=JSON.stringify(input);const a=await auditSnapshot(input,scope),b=await auditSnapshot(input,scope);
 assert.equal(a.summary.errors,0);assert.equal(a.dataChecksPassed,true);assert.equal(a.canImport,false);assert.equal(a.writeEnabled,false);assert.equal(a.mode,'preview-only');assert.equal(a.fingerprint,b.fingerprint);assert.match(a.fingerprint,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(input),original);
 assert.equal(a.mappings.length,a.summary.documents);assert.ok(a.mappings.every(row=>row.archivePath.startsWith('organizations/empresa-demo/migrationArchives/centro-')));assert.equal(a.cashSummaries[0].generated,7);assert.equal(a.cashSummaries[0].saved,7);assert.equal(a.cashSummaries[0].pending,0);assert.ok(!JSON.stringify(a).includes('Cliente de demostración'));
 const other=await auditSnapshot(input,{...scope,branchId:'norte'});assert.equal(other.fingerprint,a.fingerprint);assert.notEqual(other.mappings[0].archivePath,a.mappings[0].archivePath);
});
test('migration runtime defaults closed and never accepts either real Firebase project',()=>{
 assert.equal(migrationRuntime({}).ready,false);
 for(const projectId of ['mrespumasystem','smart-savings-4be47','demo-../../production']){const runtime=migrationRuntime({enabled:'true',projectId});assert.equal(runtime.ready,false);assert.equal(runtime.projectId,'demo-pulilavado-v2');}
 assert.equal(migrationRuntime({enabled:'true',projectId:'demo-isolated'}).ready,true);assert.equal(migrationRuntime({legacyEmulatorFlag:'true',projectId:'demo-pulilavado'}).ready,true);
});
test('invalid format and injected scope cannot produce mapping paths',async()=>{
 await assert.rejects(auditSnapshot({},scope),/formato/);await assert.rejects(auditSnapshot(fresh(),{...scope,branchId:'../otra'}),/Organización/);
});
test('incorrect payment splits and historical commission totals block migration',async()=>{
 const input=fresh();input.collections.services[0].data.financials.payments=[{method:'Yappy',amount:1}];input.collections.services[0].data.financials.businessEarnings=100;
 const r=await auditSnapshot(input,scope);assert.ok(codes(r).includes('PAYMENT_MISMATCH'));assert.ok(codes(r).includes('COMMISSION_MISMATCH'));assert.equal(r.dataChecksPassed,false);
});
test('missing cash movements, invalid snapshots and sequence gaps block migration',async()=>{
 const input=fresh();input.collections.cashMovements.shift();input.collections.cashMovements[0].data.balancesAfter.Efectivo=999;
 const r=await auditSnapshot(input,scope);for(const code of ['INVALID_OPENING','INCOMPLETE_SEQUENCE','CASH_NOT_RECONCILED','INVALID_BALANCE_SNAPSHOT'])assert.ok(codes(r).includes(code),code);
});
test('unreconciled envelope and duplicate transfer counterpart are detected',async()=>{
 const input=fresh();input.collections.cashEnvelopes[0].data.balance=99;const duplicate=structuredClone(input.collections.cashMovements.at(-1));duplicate.id='duplicate-transfer';input.collections.cashMovements.push(duplicate);
 const r=await auditSnapshot(input,scope);assert.ok(codes(r).includes('ENVELOPE_NOT_RECONCILED'));assert.ok(codes(r).includes('ENVELOPE_HISTORY_MISMATCH'));assert.ok(codes(r).includes('MISSING_TRANSFER_PAIR'));
});
test('advance without matching cash expense and missing reference cannot pass',async()=>{
 const input=fresh();input.collections.cashAdvances[0].data.amount=500;input.collections.cashAdvances[0].data.sessionId='absent';
 const r=await auditSnapshot(input,scope);assert.ok(codes(r).includes('ADVANCE_WITHOUT_CASH'));assert.ok(codes(r).includes('MISSING_REFERENCE'));
});
test('duplicate IDs, unsupported collections and incomplete snapshots are never silently dropped',async()=>{
 const input=fresh();input.collections.clients.push(structuredClone(input.collections.clients[0]));delete input.collections.inventoryMovements;input.collections.unknown=[];
 const r=await auditSnapshot(input,scope);for(const code of ['DUPLICATE_ID','MISSING_COLLECTION','UNKNOWN_COLLECTION'])assert.ok(codes(r).includes(code));
});
test('open cash and incorrect control must be resolved before cutover',async()=>{
 const input=fresh();input.collections.cashSessions[0].data.status='open';const another=structuredClone(input.collections.cashSessions[0]);another.id='another';input.collections.cashSessions.push(another);
 const r=await auditSnapshot(input,scope);for(const code of ['MULTIPLE_OPEN_CASH','CASH_CONTROL_MISMATCH','OPEN_CASH_CUTOVER'])assert.ok(codes(r).includes(code));assert.equal(r.canImport,false);
});
test('custom services and deleted washer remain review cases, never fabricated catalog or staff',async()=>{
 const input=fresh();input.collections.services[0].data.serviceItems=[];input.collections.washers=[];const r=await auditSnapshot(input,scope);
 assert.equal(r.summary.errors,0);assert.ok(codes(r).includes('CUSTOM_SERVICE'));assert.ok(r.summary.warnings>0);assert.equal(r.mappings.filter(row=>row.sourcePath.startsWith('washers/')).length,0);assert.equal(r.canImport,false);
});
test('negative inventory and incompatible adjustments are flagged',async()=>{
 const input=fresh();input.collections.products.push({id:'p',data:{name:'Demo',price:2,stock:-1}});input.collections.inventoryMovements.push({id:'i',data:{productId:'p',quantity:2,before:10,after:99}});
 const r=await auditSnapshot(input,scope);assert.ok(codes(r).includes('INVALID_STOCK'));assert.ok(codes(r).includes('INVALID_INVENTORY_MOVEMENT'));
});


test('invalid historical tips, commission rates and selected prices require review rather than silent normalization',async()=>{
 const input=fresh();const service=input.collections.services[0].data;service.financials.tipAmount=5;service.financials.tipMethod='BTC';service.financials.commissionRate=40;service.financials.washerEarnings=-1;service.serviceItems[0].unitPrice=-5;
 const r=await auditSnapshot(input,scope);for(const code of ['INVALID_TIP','INVALID_COMMISSION','NEGATIVE_ALLOCATION','INVALID_SERVICE_LINE'])assert.ok(codes(r).includes(code));assert.equal(r.dataChecksPassed,false);
});
