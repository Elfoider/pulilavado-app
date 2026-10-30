# Validación técnica de fase 2

Versión `2.0.0-dev.3`, rama `MigracionDevV2`. Referencia previa: `e71b714686a392ecd7444566e2bc18a0af6b1ca7`.

- `npm run check:architecture`: referencias y separación de capas correctas.
- ESLint: sin errores ni advertencias.
- `npm test`: 107 pruebas aprobadas (99 regresiones previas y 8 pruebas nuevas de contratos/política/contexto/repositorio).
- `npm run build`: compilación de producción completada; se incorpora `/migration/access` y se conservan las rutas anteriores.
- Auth Emulator + Firestore Emulator, SDK real: acceso anónimo, cuentas sin perfil o suspendidas, sede no asignada, otra empresa, lectura de otro perfil, elevación de permisos, escrituras directas y denegación explícita rechazadas. Administrador puede consultar ambas sedes y recepción solo Centro. La suspensión de membresía revoca la lectura con el mismo ID token.
- Navegador: inicio/cierre de sesión, cambio de sede, permisos de recepción, usuarios sin perfil/suspendidos/denegados, otra organización y credenciales incorrectas. Se retira el resumen al cerrar sesión y se valida la vista móvil. Sin solicitudes a proyectos cloud.
- Navegador sobre build bloqueado por defecto: laboratorio desactivado, pantallas heredadas bloqueadas y diagnóstico offline válido/inválido, descarga y cambio de sede conservados.
- CLI de auditoría: ejemplo ficticio sin errores; no se habilitan importaciones.
- El inicio de la semilla y del cliente exige rechazo de una lectura anónima como comprobación básica frente a reglas permisivas cargadas por error.

Las pruebas de permisos usan el proyecto fijo `demo-pulilavado-contracts`; las denegaciones esperadas generan mensajes `PERMISSION_DENIED` del SDK y se afirman como resultado correcto. No se accedió a Firestore productivo, no se modificó la otra aplicación Pulix V2 y no se desplegaron reglas ni backend.

El workflow agrega un job independiente de aislamiento con Java 21, Firebase CLI y emuladores. Los resultados descritos corresponden a ejecuciones locales; el resultado remoto se consulta en GitHub Actions.

La revisión contractual y sus bloqueos están en [CONTRATOS_DESTINO.md](../migration/CONTRATOS_DESTINO.md). Las decisiones de negocio y una copia real consistente siguen siendo necesarias antes de un importador.
