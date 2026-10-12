# Pulilavado 1.3.0 — Comisiones individuales, inventario y caja

Esta actualización amplía el sistema del repositorio Elfoider/pulilavado-app. Conserva el proyecto Firebase mrespumasystem, las colecciones existentes y la identidad visual de Mr. Espuma. No sustituye la aplicación por la arquitectura V2 de los documentos de referencia ni implementa organización/sede/RBAC.

## Qué se añadió

- Comisión opcional por lavador: en Personal / Lavadores, ingrese un porcentaje entre 0 y 100. Vacío aplica el global. Un 0% explícito es válido.
- Conservación del porcentaje usado en cada servicio. Editar precios conserva ese porcentaje; cambiar de lavador usa el porcentaje vigente del nuevo lavador. Los cambios globales no recalculan los servicios existentes.
- Productos: nombre, código único sin distinguir mayúsculas, categoría, unidad, costo, precio, mínimo, estado y stock. El stock inicia en cero y se carga mediante entradas.
- Inventario: entradas, ajustes positivos/negativos, motivo/proveedor, historial de stock antes/después y filtro de stock bajo. Un ajuste no puede dejar existencias negativas. Para cambiar costo unitario use Editar producto; las entradas no generan un gasto automático de compra.
- Ventas individuales con carrito, cantidades, pago y actualización conjunta de inventario/caja. Anulación dentro de la misma caja abierta, con motivo y devolución de stock.
- Productos en Nuevo servicio y Editar servicio, sin necesidad de una venta rápida aparte. Precio del lavado + productos = total. La comisión del lavador se calcula sobre el lavado, excluyendo productos y propina.
- Caja: apertura con fondo efectivo, ingresos, gastos, retiros, cobros por método, arqueo, diferencia, cierre, historial, detalle paginado de movimientos e impresión desde el navegador.
- Cobro de servicios pendientes en la caja de la fecha del pago. Correcciones en la caja original abierta dejan movimientos de reversión y nuevo cobro.
- Anulación de servicios con trazabilidad, devolución de productos y reversión del cobro/propina. Se conserva el registro original; los reportes operativos excluyen anulados.
- Dashboard y reportes incluyen ventas individuales de productos. Pendientes y anulados se excluyen de ingresos cobrados. Los reportes de servicios conservan su filtro por fecha de registro; Caja es la fuente para conciliación por jornada y fecha de cobro.

## Instalar sin cambiar la base actual

1. Haga un respaldo del código que utiliza y una exportación de Firestore antes de actualizar.
2. Descomprima el ZIP y abra la carpeta pulilavado-app.
3. Conserve cualquier configuración de alojamiento y variables propias que su instalación tenga fuera del repositorio. No copie node_modules ni .next de una instalación anterior.
4. Use Node.js 22 o superior y ejecute:

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
```

5. Abra http://localhost:3000. La configuración Firebase del repositorio sigue apuntando a mrespumasystem; no se requiere crear un proyecto nuevo. Las colecciones nuevas se crean al guardar la primera operación. No hay script que borre o migre sus datos automáticamente.
6. Configure los porcentajes individuales, cree los productos, registre las existencias iniciales y abra la primera caja. Desde esta actualización todo cobro nuevo necesita caja abierta; se pueden registrar servicios pendientes sin caja.
7. Publique el código con el proceso de despliegue que ya utiliza. El repositorio original no incluye su configuración de alojamiento; el ZIP no cambia una instancia publicada por sí mismo.

Si la descarga de Inter desde Google Fonts falla por certificados TLS del entorno, el build de Next admite `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1`. La compilación de entrega se validó con esa variable; no se cambió la tipografía.

## Firebase e índices

El ZIP incluye firebase.json y firestore.indexes.json, únicamente para índices. El índice nuevo de cashMovements usa sessionId ascendente + createdAt descendente; también se incluye el índice del perfil de lavador (washerId + createdAt).

Con Firebase CLI autenticado con una cuenta autorizada para su proyecto:

```bash
firebase deploy --only firestore:indexes --project mrespumasystem
```

Revise y conserve los índices que ya tenga en producción. Si la CLI propone borrar índices que no están en este archivo, no confirme esa eliminación: incorpórelos a firestore.indexes.json o cree los índices necesarios desde la consola. Espere a que los índices terminen de construirse antes de consultar movimientos.

El repositorio recibido no contiene las reglas publicadas ni autenticación. No se descargaron ni modificaron sus reglas de producción. Para este módulo las reglas existentes deben permitir los accesos pertinentes a products, productCodes, inventoryMovements, sales, cashControl, cashSessions y cashMovements, además de services, washers y settings. Las operaciones requieren lectura transaccional, incluso de documentos que todavía no existen, y escrituras atómicas en varias colecciones.

No publique reglas abiertas para resolver un error de permisos. La integración hereda el acceso y la seguridad del sistema actual: sin identidad/RBAC no puede distinguir usuarios, y las comprobaciones del cliente no reemplazan controles de servidor. Para adaptar las reglas de forma segura se necesita revisar las reglas vigentes y el modelo de acceso utilizado en su instalación. Ninguna prueba se ejecutó contra sus datos reales.

## Reglas de operación

### Comisiones y productos

Ejemplo: lavado $20, comisión individual 25%, dos aguas de $2 y propina $3. Total de venta $24; comisión $5; ingresos del negocio después de comisión $19; propina $3 para el lavador. Estos ingresos todavía no descuentan costo de productos ni otros gastos, por lo que no representan utilidad neta.

El precio/costo/nombre de cada producto se conserva en el servicio o venta. Cambiar el catálogo no altera ese registro. Los productos ya asociados conservan su precio al editar cantidades; los nuevos productos usan el precio vigente al guardar. No se admiten cantidades fraccionarias, stock negativo, pagos parciales ni métodos mixtos para el total de una misma venta. La propina sí puede recibirse por otro método.

### Servicios pendientes

Al añadir productos a un pendiente, se descuentan inmediatamente del stock disponible como reserva. Cobrarlo después no los descuenta de nuevo. Quitar productos o anular el servicio devuelve las unidades. El motivo de cancelación queda registrado. El precio previsto del lavado puede dejarse en cero y completarse al cobrar.

### Caja y propinas

Solo hay una caja abierta en esta versión del sistema. Puede abarcar más de un día si no la cierra; el historial es por sesión, no por medianoche.

Efectivo esperado = fondo inicial + entradas efectivas − salidas efectivas. Yappy, Tarjeta y Transferencia se muestran por separado y no se suman al efectivo físico. Diferencia = efectivo contado − efectivo esperado. Las propinas entran en el método recibido, separadas de las ventas. Para entregar propinas o comisiones, registre un retiro con nombre del lavador y motivo; no se descuentan automáticamente. Los gastos reducen el saldo del método seleccionado.

Anular un pago en efectivo requiere efectivo disponible para devolverlo. Las correcciones y anulaciones financieras solo se admiten mientras la caja original permanece abierta. Después del cierre se permite corregir datos de contacto/vehículo, pero no importes, método, lavador ni distribución de productos. Esta entrega no incluye reaperturas ni reembolsos de cajas anteriores.

Los movimientos generados por servicios y ventas no se ingresan manualmente una segunda vez. Los IDs de operación y las transacciones evitan dobles descuentos/cobros al reintentar la misma operación. Si aparece un error ambiguo de conexión, consulte el registro antes de iniciar una nueva operación.

### Datos anteriores a la actualización

Se mantienen los servicios, clientes, lavadores y configuración existentes. No se cargan cobros antiguos como movimientos de una caja nueva, evitando duplicar ingresos. Los servicios antiguos pendientes se cobran normalmente en una nueva caja, conservando su comisión guardada. Los servicios antiguos ya pagados sin referencia de caja permiten corregir datos descriptivos, pero sus montos y asignación no se modifican ni se anulan desde el nuevo módulo.

La anulación sustituye al borrado de servicios. Los anulados permanecen en Firestore con su motivo y fecha y se excluyen de los listados operativos. Ventas de productos conserva su historial de anulaciones. No elimine directamente productos referenciados: márquelos inactivos.

## Pruebas reproducibles

`npm test` ejecuta las pruebas transaccionales de dominio con almacenamiento aislado en memoria. El simulador comprueba también que las lecturas preceden a todas las escrituras, como exige Firestore.

Se incluye una prueba adicional que utiliza el SDK Firebase contra un emulador real. Requiere Java 17 o superior para la versión fijada de CLI:

```bash
npm test
npm exec --yes --package=firebase-tools@14.27.0 -- firebase emulators:exec --config tests/firebase.emulators.json --project demo-pulilavado --only firestore "node tests/firestore.integration.cjs"
```

Para la prueba de interfaz necesita Chromium de Playwright:

```bash
npx playwright install chromium
npm exec --yes --package=firebase-tools@14.27.0 -- firebase emulators:exec --config tests/firebase.emulators.json --project demo-pulilavado --only firestore "node tests/ui.integration.cjs"
```

Las pruebas utilizan exclusivamente demo-pulilavado local. El test de interfaz limpia los datos de ese emulador al comenzar. Nunca apunte las pruebas a su proyecto real. Las reglas abiertas de tests/firestore.emulator.rules son una fixture exclusiva del emulador; firebase.json de producción no las referencia.

## Verificación manual antes de operar

- Crear lavador con 25%, otro con 0% y uno sin porcentaje; comprobar el global.
- Crear producto, cargar entrada, registrar ajuste con motivo y comprobar stock bajo.
- Abrir caja con fondo, cobrar lavado con productos y propina por otro método; revisar comisión, existencias y movimientos.
- Registrar un pendiente con productos, cobrarlo después y verificar que no se descontó inventario dos veces.
- Hacer venta individual y anularla antes del cierre; comprobar devolución de stock y caja.
- Intentar vender más unidades que las disponibles: no debe guardarse ninguna parte de la venta.
- Registrar gasto/retiro, contar el efectivo y cerrar caja; comprobar diferencia e historial.
- Abrir otra caja e intentar modificar un cobro cerrado: debe quedar bloqueado.

## Límites y alcance

La versión sigue siendo una aplicación de una sola instancia/caja, sin organización/sede ni nuevos roles. Los listados de inventario muestran todos los productos; los historiales nuevos limitan a 150 movimientos de inventario/ventas y 100 cajas recientes para evitar lecturas ilimitadas. Los movimientos de cada caja se cargan en páginas de 100. Para auditorías históricas más extensas puede consultar Firestore; no se añadieron exportadores Excel/PDF de inventario ni paginación global de cajas.

No se modificaron dependencias de producción ajenas al alcance. El ZIP incluye código fuente, lockfile, pruebas, índices y esta guía; no contiene dependencias instaladas, compilaciones, credenciales administrativas ni datos del negocio.

## Nómina seleccionable (1.3.4)

En Reportes y Finanzas seleccione primero Hoy, Esta Semana o un rango de fechas. La sección «Lavadores a incluir en la nómina» lista a quienes tienen servicios cobrados en el período. Todos aparecen seleccionados inicialmente. Marque o desmarque las casillas, o use «Seleccionar todos» y «Quitar selección». La elección se conserva al actualizar mientras la pantalla permanece abierta; al volver a entrar se seleccionan todos.

El total de la selección aparece debajo de la lista. «Reporte de Pago de Nómina (PDF)» exporta solo los lavadores marcados, sus autos lavados, comisiones y espacio para firma. El botón se desactiva si no hay selección, durante la carga, al cambiar el período hasta completar la consulta o si esta falla. Los lavadores con el mismo nombre se distinguen por su identificador.

La tarjeta general «Nómina a Pagar» mantiene el total de todo el período. La selección del PDF no recalcula los ingresos del negocio. La nómina sigue excluyendo propinas, pendientes y anulados, y usa la fecha de registro del servicio. Generar el PDF no registra ni marca un pago; para entregar dinero use un retiro en Caja. Esta actualización no incluye control de nóminas ya pagadas.
