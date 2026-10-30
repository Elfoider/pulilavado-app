const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, collection, getDocFromServer, getDocsFromServer, setDoc, query, where } = require('firebase/firestore');
const { PROJECT, PASSWORD, seedContracts, requireEmulators, put } = require('../../helpers/contracts-fixture.cjs');
requireEmulators();
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');

test('real Auth + Firestore rules enforce identity, branch, organization, denies and revocations', async () => {
 const users=await seedContracts();const app=initializeApp({projectId:PROJECT,apiKey:'demo-contracts',appId:'demo-contracts'},'contracts-rule-tests');const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const read=path=>getDocFromServer(doc(db,path));const root='organizations/lavado-demo';const baseline=branch=>`${root}/branches/${branch}/summaries/baseline`;
 const login=async name=>{await signOut(auth);return signInWithEmailAndPassword(auth,users[name].email,PASSWORD)};
 try {
  await denied(read(baseline('centro')));
  await login('sin-perfil');await denied(read(root));await denied(read(baseline('centro')));
  await login('suspendido');await denied(read(baseline('centro')));
  await login('recepcion');assert.equal((await read(baseline('centro'))).data().vehicles,5);
  await denied(read(baseline('norte')));await denied(read(baseline('archivada')));
  await denied(read('organizations/otra-empresa/branches/centro/summaries/baseline'));
  await denied(read(`profiles/${users.admin.uid}`));
  await denied(getDocsFromServer(collection(db,`${root}/branches`)));
  await denied(read('services/legacy'));await denied(setDoc(doc(db,'services/legacy'),{price:1}));
  await denied(setDoc(doc(db,`profiles/${users.recepcion.uid}`),{organizationId:'otra-empresa'}));
  await denied(setDoc(doc(db,`${root}/memberships/${users.recepcion.uid}`),{allBranches:true}));
  await denied(setDoc(doc(db,`${root}/roles/recepcion`),{permissions:{'dashboard.view':'organization'}}));
  await denied(setDoc(doc(db,baseline('centro')),{vehicles:999}));
  await denied(setDoc(doc(db,`${root}/branches/centro/services/new`),{totalMinor:1}));
  await login('denegado');await denied(read(baseline('centro')));
  await login('admin');assert.equal((await read(baseline('norte'))).data().vehicles,8);
  const branches=await getDocsFromServer(query(collection(db,`${root}/branches`),where('organizationId','==','lavado-demo'),where('status','==','active')));assert.equal(branches.size,2);
  await denied(read('organizations/otra-empresa/branches/centro/summaries/baseline'));
  await login('otra-empresa');assert.equal((await read('organizations/otra-empresa/branches/centro/summaries/baseline')).data().vehicles,5);await denied(read(baseline('centro')));
  await login('recepcion');
  await put(`${root}/memberships/${users.recepcion.uid}`,{uid:users.recepcion.uid,organizationId:'lavado-demo',roleId:'recepcion',branchIds:['centro'],allBranches:false,status:'suspended',grants:{},denies:[]});
  await denied(read(baseline('centro'))); // Existing ID token does not preserve revoked access.
  console.log('PASS: unregistered, suspended, wrong organization/branch, privilege escalation, direct writes, explicit denies and live membership revocation blocked.');
 } finally { await signOut(auth);await deleteApp(app); }
});
