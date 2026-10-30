# Fase 2 · Contratos de acceso, organización y sede

Versión `2.0.0-dev.3`, rama `MigracionDevV2`.

## Qué se implementó

- Contratos de perfil, organización, membresía, rol, permiso y sede revisados contra la copia de Pulix V2 disponible en el espacio de trabajo. La evidencia de archivos y sus hashes está en `target-review.json`; no se verificó un despliegue remoto.
- Un caso de uso para cargar contexto desde la identidad autenticada. La empresa no se toma de un selector, URL ni localStorage.
- Política de permisos: denegaciones explícitas prevalecen; permisos de organización no amplían las sedes asignadas. Administración, auditoría, configuración y reportes consolidados requieren alcance organizacional.
- Repositorio de contexto y un repositorio de lectura de resumen ficticio por sede. Tanto el caso de uso como las reglas comprueban el contexto; cada lectura del resumen se fuerza al servidor.
- `/migration/access`: inicio/cierre de sesión con Firebase Auth Emulator, selección de sedes autorizadas, permisos efectivos y un resumen ficticio distinto por sede.
- Reglas específicas que rechazan escrituras desde el cliente, accesos globales heredados y lecturas de otra organización/sede. Los usuarios de ejemplo se preparan mediante una herramienta exclusivamente local.
- Prueba con Auth y Firestore SDK reales contra los emuladores, además de pruebas de política y navegador.
- Matriz de las 16 colecciones originales y contratos de destino. No contiene documentos listos para importar.

No se añadieron formularios de administración de usuarios ni comandos financieros a este laboratorio. Esas capacidades ya existen parcialmente en la aplicación Pulix V2 revisada y deben conectarse por sus APIs autorizadas; copiar una pantalla no crea autorización. Las pantallas heredadas siguen siendo referencia de regresión con su propio emulador y no se declaran multi-sede.

## Probar en tu computadora

Se necesitan Node 22, Java 21 y Firebase CLI. Desde la carpeta del repositorio:

```bash
git pull --ff-only origin MigracionDevV2
npm ci
```

Crea o ajusta `.env.local` con:

```dotenv
NEXT_PUBLIC_MIGRATION_SANDBOX=false
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
NEXT_PUBLIC_V2_CONTRACTS_SANDBOX=true
```

En una primera terminal, inicia este emulador independiente:

```bash
npx --yes firebase-tools@15.32.1 emulators:start --config tests/config/firebase.contracts.json --project demo-pulilavado-contracts --only auth,firestore
```

En una segunda terminal prepara las cuentas. Esta orden reinicia únicamente los datos y usuarios ficticios del proyecto fijo `demo-pulilavado-contracts`. Detén primero cualquier otro emulador que ocupe 8080/9099.

PowerShell:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
npm run contracts:seed
npm run dev
```

Bash:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run contracts:seed
npm run dev
```

Abre `http://localhost:3000/migration/access`. Si modificas `.env.local`, reinicia Next.js. El laboratorio queda desactivado por defecto en compilaciones sin la variable explícita.

| Cuenta de ejemplo | Resultado esperado |
|---|---|
| `admin@pulilavado.test` | Sedes Centro y Norte; resumen ficticio de 5 y 8 vehículos |
| `recepcion@pulilavado.test` | Únicamente Sede Centro |
| `sin-perfil@pulilavado.test` | Autenticación válida, acceso al contexto rechazado |
| `suspendido@pulilavado.test` | Membresía suspendida, acceso rechazado |
| `denegado@pulilavado.test` | Permiso del resumen denegado explícitamente |
| `otra-empresa@pulilavado.test` | Solo datos de Otra Empresa Demo |

Contraseña ficticia común: `PruebaLocal2026!`. No son cuentas del negocio ni del proyecto Pulix real. La sesión se mantiene en memoria; recargar requiere iniciar sesión de nuevo.

La semilla y el cliente verifican que una lectura anónima sea rechazada antes de operar, para detectar el uso accidental de las reglas permisivas del legado. Esa comprobación es una protección básica; la batería de reglas verifica los permisos completos del ensayo. No combines `firestore.emulator.rules` del legado con este laboratorio.

## Ejecutar las comprobaciones

```bash
npm run check:architecture
npm run lint
npm test
npx --yes firebase-tools@15.32.1 emulators:exec --config tests/config/firebase.contracts.json --project demo-pulilavado-contracts --only auth,firestore "npm run test:access"
npm run build
```

Con Chromium de Playwright instalado, el flujo visual también puede ejecutarse dentro de `emulators:exec` con `node tests/e2e/access.ui.cjs`. El script usa un servidor local en 3103 y no consulta proyectos cloud.

## Límites y paso siguiente

Esta entrega valida la base técnica de acceso en local. No representa una importación ni la integración completa de módulos productivos. Las reglas del ensayo no reemplazan las reglas de Pulix V2; no se despliegan mediante el `firebase.json` raíz, que continúa conteniendo solo índices.

Antes del primer importador se deben resolver los bloqueos de [CONTRATOS_DESTINO.md](CONTRATOS_DESTINO.md), confirmar organización/sede y entorno de ensayo reales, revisar una copia consistente y autorizar los mapeos. El siguiente trabajo es cerrar esos contratos e implementar el ensayo de entidades maestras, conservando el archivo histórico del origen.
