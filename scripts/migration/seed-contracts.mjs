import fixture from '../../tests/helpers/contracts-fixture.cjs';
try {
  await fixture.seedContracts();
  console.log('Cuentas ficticias preparadas en demo-pulilavado-contracts (solo emuladores).');
  console.log('Correos: admin@pulilavado.test, recepcion@pulilavado.test, sin-perfil@pulilavado.test, suspendido@pulilavado.test, denegado@pulilavado.test, otra-empresa@pulilavado.test');
  console.log('Contraseña de ejemplo para todas: PruebaLocal2026!');
} catch (error) { console.error(error.message); process.exitCode = 1; }
