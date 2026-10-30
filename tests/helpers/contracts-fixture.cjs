const PROJECT = 'demo-pulilavado-contracts';
const PASSWORD = 'PruebaLocal2026!';
function requireEmulators() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw Error('Se requieren Auth y Firestore locales en 127.0.0.1:9099/8080.');
}
const encode = value => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)])) } };
};
async function put(path, data) {
  requireEmulators();
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k,v]) => [k,encode(v)])) }) });
  if (!response.ok) throw Error(`No se pudo preparar documento local (${response.status}).`);
}
async function seedContracts() {
  requireEmulators();
  const probe = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/profiles/rules-probe`);
  if (probe.status !== 403) throw Error('Las reglas del laboratorio deben negar lecturas anónimas. Use firebase.contracts.json, no las reglas del legado.');
  // Reset only the fixed demo project. Never accept a project/host from arguments.
  for (const url of [`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`]) {
    const response = await fetch(url, { method: 'DELETE' }); if (!response.ok) throw Error('No se pudo limpiar el entorno ficticio.');
  }
  const users = {};
  for (const name of ['admin', 'recepcion', 'sin-perfil', 'suspendido', 'denegado', 'otra-empresa']) {
    const email = `${name}@pulilavado.test`;
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) });
    if (!response.ok) throw Error('No se pudo preparar una cuenta local.');
    users[name] = { uid: (await response.json()).localId, email };
  }
  for (const org of ['lavado-demo', 'otra-empresa']) {
    await put(`organizations/${org}`, { name: org === 'lavado-demo' ? 'Pulilavado Demo' : 'Otra Empresa Demo', status: 'active', currency: 'USD' });
    await put(`organizations/${org}/roles/admin`, { organizationId: org, name: 'Administrador de prueba', status: 'active', permissions: { 'dashboard.view': 'organization', 'cash.view': 'organization', 'reports.view': 'organization', 'admin.users.view': 'organization' } });
    await put(`organizations/${org}/roles/recepcion`, { organizationId: org, name: 'Recepción de prueba', status: 'active', permissions: { 'dashboard.view': 'branch', 'services.view': 'branch', 'services.create': 'branch' } });
    for (const [branch, vehicles] of [['centro', 5], ['norte', 8], ['archivada', 0]]) {
      await put(`organizations/${org}/branches/${branch}`, { organizationId: org, name: branch === 'centro' ? 'Sede Centro' : branch === 'norte' ? 'Sede Norte' : 'Sede archivada', status: branch === 'archivada' ? 'archived' : 'active' });
      await put(`organizations/${org}/branches/${branch}/summaries/baseline`, { organizationId: org, branchId: branch, label: `Resumen ficticio ${branch}`, vehicles });
    }
  }
  for (const [name, user] of Object.entries(users)) {
    if (name === 'sin-perfil') continue;
    const org = name === 'otra-empresa' ? 'otra-empresa' : 'lavado-demo';
    await put(`profiles/${user.uid}`, { uid: user.uid, organizationId: org, displayName: name, email: user.email, status: 'active' });
    await put(`organizations/${org}/memberships/${user.uid}`, { uid: user.uid, organizationId: org, status: name === 'suspendido' ? 'suspended' : 'active', roleId: name === 'admin' || name === 'otra-empresa' ? 'admin' : 'recepcion', allBranches: name === 'admin' || name === 'otra-empresa', branchIds: name === 'admin' || name === 'otra-empresa' ? [] : ['centro'], grants: {}, denies: name === 'denegado' ? ['dashboard.view'] : [] });
  }
  return users;
}
module.exports = { PROJECT, PASSWORD, requireEmulators, seedContracts, put };
