const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadAccessContext } = require('../../../.test-build/features/access/application/load-context.js');
const { readAuthorizedBaseline } = require('../../../.test-build/features/access/application/read-baseline.js');
const { canAccess, effectivePermissions } = require('../../../.test-build/features/access/domain/policy.js');
const { contractsRuntime } = require('../../../.test-build/shared/config/contracts-runtime.js');
const base = () => ({ profile: { uid: 'user', organizationId: 'org', displayName: 'Demo', email: 'demo@test', status: 'active' }, organization: { id: 'org', name: 'Demo', status: 'active', currency: 'USD' }, membership: { uid: 'user', organizationId: 'org', roleId: 'reception', branchIds: ['a'], allBranches: false, status: 'active', grants: {}, denies: [] }, role: { id: 'reception', organizationId: 'org', name: 'Recepción', status: 'active', permissions: { 'dashboard.view': 'branch', 'services.create': 'branch' } }, branches: [{ id: 'a', organizationId: 'org', name: 'Centro', status: 'active' }, { id: 'b', organizationId: 'org', name: 'Norte', status: 'active' }] });
function reader(context) {
 const root='organizations/org';const docs=new Map([['profiles/user',context.profile],[root,context.organization],[`${root}/memberships/user`,context.membership],[`${root}/roles/reception`,context.role],...context.branches.map(branch=>[`${root}/branches/${branch.id}`,branch])]);
 return { docs, get: async path=>docs.get(path), activeBranches: async()=>context.branches.filter(b=>b.status==='active').map(b=>({id:b.id,data:b})) };
}
test('access requires active aligned profile, organization, membership and role',()=>{
 const scope={organizationId:'org',branchId:'a'};
 assert.equal(canAccess(base(),'dashboard.view',scope),true);
 for(const mutation of [c=>c.profile.status='suspended',c=>c.organization.status='archived',c=>c.membership.status='invited',c=>c.role.status='suspended',c=>c.role.organizationId='other',c=>c.membership.uid='other',c=>c.role.id='other']){const c=base();mutation(c);assert.equal(canAccess(c,'dashboard.view',scope),false)}
});
test('explicit denies win grants and organization scope never bypasses branch assignment',()=>{
 const c=base();c.membership.grants['dashboard.view']='organization';
 assert.equal(canAccess(c,'dashboard.view',{organizationId:'org',branchId:'b'}),false);
 c.membership.allBranches=true;assert.equal(canAccess(c,'dashboard.view',{organizationId:'org',branchId:'b'}),true);
 assert.equal(canAccess(c,'dashboard.view',{organizationId:'other',branchId:'b'}),false);
 c.membership.denies=['dashboard.view'];assert.equal(effectivePermissions(c)['dashboard.view'],undefined);
});
test('organization administration cannot be granted as a branch permission',()=>{
 const c=base();c.membership.grants['admin.users.view']='branch';assert.equal(canAccess(c,'admin.users.view'),false);
 c.membership.grants['admin.users.view']='organization';assert.equal(canAccess(c,'admin.users.view'),true);
 c.membership.denies=['admin.users.view'];assert.equal(canAccess(c,'admin.users.view'),false);
});
test('context comes from the authenticated profile and only includes assigned branches',async()=>{
 const c=base();const loaded=await loadAccessContext('user',reader(c));assert.deepEqual(loaded.branches.map(b=>b.id),['a']);
 c.membership.allBranches=true;c.branches[1].status='archived';assert.deepEqual((await loadAccessContext('user',reader(c))).branches.map(b=>b.id),['a']);
});
test('missing profiles, invalid IDs, mismatched membership and malformed access fail closed',async()=>{
 await assert.rejects(loadAccessContext('missing',reader(base())));
 for(const mutation of [c=>c.profile.organizationId='../other',c=>c.membership.uid='other',c=>c.membership.branchIds=['../b'],c=>c.membership.allBranches='true',c=>c.role.organizationId='other',c=>c.role.permissions['dashboard.view']='all']){const c=base();mutation(c);await assert.rejects(loadAccessContext('user',reader(c)));}
});
test('repository refuses unauthorized scopes before reading and rejects mismatched returned data',async()=>{
 const c=base();let reads=0;const repository={getBaseline:async scope=>{reads++;return {...scope,label:'Demo',vehicles:5}}};
 assert.equal((await readAuthorizedBaseline(c,{organizationId:'org',branchId:'a'},repository)).vehicles,5);
 await assert.rejects(readAuthorizedBaseline(c,{organizationId:'org',branchId:'b'},repository));assert.equal(reads,1);
 await assert.rejects(readAuthorizedBaseline(c,{organizationId:'org',branchId:'../a'},repository));assert.equal(reads,1);
 await assert.rejects(readAuthorizedBaseline(c,{organizationId:'org',branchId:'a'},{getBaseline:async()=>({organizationId:'other',branchId:'a',label:'Demo',vehicles:5})}));
});
test('contracts runtime is disabled by default with a fixed demo project and local endpoints',()=>{
 assert.equal(contractsRuntime().enabled,false);assert.equal(contractsRuntime('TRUE').enabled,false);
 const c=contractsRuntime('true');assert.equal(c.enabled,true);assert.equal(c.projectId,'demo-pulilavado-contracts');assert.equal(c.authUrl,'http://127.0.0.1:9099');assert.equal(c.firestoreHost,'127.0.0.1');
});
test('target contract accounts for every original collection and keeps treasury and mixed sales blocked',()=>{
 const {COLLECTIONS}=require('../../../.test-build/features/migration/domain/audit.js');
 const {TARGET_CONTRACT}=require('../../../.test-build/features/migration/domain/target-contract.js');
 assert.deepEqual(Object.keys(TARGET_CONTRACT).sort(),[...COLLECTIONS].sort());
 for(const name of ['cashAdvances','cashEnvelopes','envelopeMovements','treasuryControl','sales'])assert.equal(TARGET_CONTRACT[name].strategy,'design');
 assert.equal(TARGET_CONTRACT.cashControl.strategy,'rebuild');
 assert.equal(TARGET_CONTRACT.cashMovements.strategy,'archive');
});
