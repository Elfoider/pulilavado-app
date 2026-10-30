# Pagos mixtos y catálogo de servicios — 1.5.0

## Cobrar con varios métodos

En Nuevo servicio, Editar servicio o Venta de productos, seleccione **Varios métodos de pago**. Indique el importe que corresponde a Efectivo, Yappy, Tarjeta o Transferencia. Deje en blanco los métodos que no usará. La pantalla muestra total, asignado y diferencia; la suma debe coincidir exactamente con el total de servicios y productos. La propina mantiene su importe y método independientes.

Ejemplo: servicios $25 + producto $4 = $29. Puede registrar $10 en efectivo y $19 en Yappy. Caja recibe solo $10 de efectivo y $19 en Yappy. La comisión se calcula sobre los $25 de servicios, sin productos ni propinas.

Una corrección revierte cada parte del cobro original y registra la nueva distribución. Anular devuelve cada importe al método original y repone los productos. Se conservan las restricciones de Caja: no se modifican cobros ni distribuciones de cajas cerradas. No se admiten pagos parciales pendientes ni cambio/vuelto: los importes representan lo efectivamente cobrado por cada método.

Los reportes PDF/Excel, el panel financiero y el historial distribuyen los cobros por sus métodos reales. Los registros anteriores de un solo método siguen siendo compatibles. No se alteran ni migran datos históricos automáticamente.

## Administrar servicios

Entre en **Catálogo de servicios** desde el menú. Agregue nombre y precio base. Puede editarlo o desactivar su disponibilidad para nuevos vehículos. No se eliminan registros que puedan estar referenciados por trabajos anteriores.

En Nuevo servicio, seleccione uno o varios servicios y pulse Agregar. Sus precios se suman. Puede cambiar **Precio para este vehículo** en cada renglón antes de cobrar o al editar el servicio. Esto no modifica el catálogo. Se guardan nombre, precio base de referencia y precio acordado de cada servicio. Los cambios posteriores del catálogo no recalculan trabajos ya registrados. Los servicios inactivos permanecen visibles en los trabajos que ya los tenían.

Puede seguir usando un precio manual cuando no hay renglones de catálogo. Si retira todos los servicios seleccionados, establezca el importe manual que desee. Los pendientes guardan sus servicios y productos; al cobrarlos puede usar uno o varios métodos. Ajuste los importes repartidos si cambia precios o cantidades.

## Firebase

Nueva colección: `serviceCatalog`. Nuevos datos: `services.serviceItems`, `services.financials.payments` y `sales.payments`. Se mantienen las colecciones y el proyecto originales. No requiere índices compuestos nuevos. No se despliegan reglas de acceso; si sus reglas restringen colecciones explícitamente, deben permitir las operaciones del catálogo conforme a sus permisos existentes.

La validación monetaria y las escrituras de Caja/inventario se realizan dentro de las operaciones transaccionales, con registro independiente por método. Las pruebas locales usan exclusivamente `demo-pulilavado` y el emulador, nunca los datos de producción.
