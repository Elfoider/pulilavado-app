# Migración V2 · fase 1

Rama: **MigracionDevV2**. Base: producción 1.5.3, commit `652923fc5e1cac61b55ea227c0b4fdd523e88fe8`. Esta rama es un puente de diagnóstico, no una sustitución desplegable del sistema original ni una V2 completa.

## Decisión

Comenzar la migración. No ampliar primero el sistema original con más módulos: sus reglas transaccionales ya tienen pruebas, pero la identidad, el aislamiento por sede y el acceso a datos deben resolverse en el destino V2. Consulte ANALISIS_Y_PLAN.md para prioridades y límites.

La documentación V2 actualizada exige una aplicación nueva con Auth, RBAC y multi-sede. Esta rama conserva la referencia original y prepara su diagnóstico; no copia el código del proyecto Pulix V2 ni conecta su base `pulix-db`. Mantiene separadas la preparación de datos y la futura aplicación destino.

## Usar el centro de migración

1. `npm ci`.
2. `npm run dev` y abrir `/migration`.
3. Seleccionar `fixtures/migration/demo-snapshot.json` para probar con datos ficticios.
4. Elegir los identificadores de organización y sede. Analizar la copia y descargar el diagnóstico.

Funciona sin Firebase ni una Caja abierta. El JSON se procesa en el navegador; no se transmite a un servidor. No hay botón de importar. Sin configuración de emulador, las pantallas operativas quedan bloqueadas. El diagnóstico no contiene nombres/teléfonos de clientes, pero sí IDs/rutas de documentos y resúmenes financieros; trátelo como información interna.

## Repetir comparaciones operativas locales

Copie `.env.example` a `.env.local`, reinicie el proceso y ejecute un emulador Firestore en 127.0.0.1:8080 usando un proyecto `demo-`, por ejemplo:

```sh
firebase emulators:start --config tests/firebase.emulators.json --project demo-pulilavado-v2 --only firestore
npm run dev
```

Se requiere Firebase CLI compatible y Java 21 para el emulador utilizado por las pruebas. Las reglas de tests son exclusivamente locales y no deben desplegarse. La rama no dispone de modo cloud: ni `mrespumasystem` ni `smart-savings-4be47` se aceptan, aunque se configure su ID en el entorno. No configure esta rama como backend de App Hosting de producción.

## Diagnóstico por terminal

```sh
npm run migration:check -- fixtures/migration/demo-snapshot.json --organization demo-organizacion --branch principal
npm run migration:check -- migration-data/copia.json --organization empresa --branch centro --out migration-data/diagnostico.json
```

Código 0: se completaron las comprobaciones sin errores bloqueantes; siguen pendientes las revisiones. Código 2: formato/ejecución incorrecta o errores bloqueantes en los datos. El archivo de salida debe ser nuevo: nunca se reemplaza una copia ni un diagnóstico existente. `migration-data/` está excluido de Git. Límite navegador 10 MB, terminal 50 MB; máximo 50.000 documentos por diagnóstico. El reporte completo incluye todas las incidencias aunque la pantalla muestre solo las primeras 200.

## Formato de copia

El ejemplo es el contrato de esta fase. No es un respaldo binario administrado de Firestore ni su formato REST tipado.

```json
{
  "format": "pulilavado-snapshot-v1",
  "source": { "projectId": "proyecto-original", "databaseId": "(default)" },
  "exportedAt": "2026-10-30T12:00:00Z",
  "collections": {
    "clients": [{ "id": "ID_ORIGINAL", "data": { "name": "Ejemplo" } }]
  }
}
```

Deben incluirse las 16 colecciones listadas en el ejemplo, como arreglos vacíos si corresponde. Los timestamps SDK conservan `{seconds, nanoseconds}`. La copia de una misma revisión debe ser completa y coherente: preferir un corte tras cerrar Caja; leer colecciones activas en distintos instantes puede producir inconsistencias transitorias. No se incluyó un extractor conectado a producción: se preparará un acceso/exportación de solo lectura cuando se acuerde la revisión real.

## Alcance de las comprobaciones

- Integridad de formato, IDs duplicados, colecciones faltantes o desconocidas.
- Existencias/precios inválidos y ajustes de inventario incoherentes.
- Pagos mixtos y distribución histórica de comisiones.
- Referencias a cajas/lavadores y detección de cobros históricos sin Caja.
- Saldos de Caja frente a movimientos completos; apertura y secuencias.
- Cajas abiertas y control de sesión actual.
- Saldos de sobres, pares de traslados y contrapartida de vales.
- Conservación del resultado de jornada aun después de guardar en sobres.

No cubre todavía duplicados semánticos de personas/vehículos, conciliación bancaria, saldos de nómina liquidados, conversiones completas al esquema operativo Pulix ni todas las reglas de seguridad del destino. Pasar estas comprobaciones nunca habilita una importación: `canImport` y `writeEnabled` permanecen falsos.

## Salida y conservación

El SHA-256 identifica el contenido canónico de la copia sin modificarla. El plan propone rutas de **archivo histórico**, con IDs originales y alcance de organización/sede. No son documentos operativos V2 ni una transformación autorizada para ejecutarse. La validación real del destino y el importador idempotente se implementarán en fases posteriores. Los controles globales heredados no deben copiarse como controles operativos de la nueva aplicación.

No se han leído ni modificado datos productivos. La conciliación reportada en esta entrega corresponde al ejemplo y a pruebas locales.
