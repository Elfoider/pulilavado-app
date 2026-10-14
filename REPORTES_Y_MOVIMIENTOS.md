# Reportes y movimientos — versión 1.3.9

En Reportes y Finanzas, use Control Financiero Interno (PDF) o Reporte financiero (Excel). El PDF implementa el diseño aprobado, dos gráficas y el texto «Efectivo a guardar de la jornada». El Excel contiene las hojas Resumen y Movimientos, con gráficas editables, cifras numéricas y encabezados fijos para consultar todos los movimientos.

El período seleccionado aplica a ventas, comisiones y propinas recibidas. La conciliación de caja corresponde a la jornada actualmente abierta y es independiente de ese período. El saldo de la jornada excluye el fondo inicial, pero el saldo total de caja lo incluye. Un ejemplo con fondo $65, cobros netos en efectivo $12 y retiro $5 muestra $7 a guardar y $72 de saldo total. Las correcciones y devoluciones se compensan en las entradas netas, evitando inflar las gráficas.

Las salidas se presentan como pagos y gastos de efectivo. No se presume que todos los retiros corresponden a propinas ni que las comisiones generadas ya se pagaron.

Cada apertura, cobro, propina recibida, gasto, retiro, ingreso y reversión guarda una secuencia y el estado de Efectivo, Yappy, Tarjeta y Transferencia antes y después. Estos datos se escriben dentro de la misma transacción que modifica el saldo. Los reintentos no duplican el movimiento. La pantalla Caja muestra saldos anteriores y posteriores del método y del efectivo.

Los movimientos anteriores no se modifican en Firebase. La pantalla indica «No registrado» si no existe el estado histórico guardado. En la exportación completa se reconstruyen saldos únicamente si existe una apertura única, el registro completo cuadra con los saldos finales y se conoce el orden. Para partidas de un mismo servicio dentro de una transacción se usa el orden del registro original: reversión y luego cobro, ventas y luego propina. La columna Saldos distingue Registrado, Reconstruido y No disponible. La reconstrucción no equivale a una fotografía histórica guardada.

La exportación vuelve a leer el saldo desde Firebase y descarga todos los movimientos de la caja, sin el límite de 100 de la pantalla. Si la caja cambia durante la lectura se reintenta; si no se obtiene una lectura consistente, la exportación informa el error. No requiere nuevos índices ni una migración de datos. No se modifica la política de propinas: el pago registrado en efectivo es lo que descuenta el saldo.

Despliegue: instalar con npm ci y desplegar master en Firebase App Hosting. No se realizaron escrituras en datos de producción para las pruebas. La tipografía DejaVu Sans usada en el PDF incluye su licencia junto al código.
