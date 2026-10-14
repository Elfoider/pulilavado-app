# Caja y Reportes — versión 1.3.7

El indicador «Efectivo en caja actual» y el PDF financiero consultan la misma caja abierta que la página Caja. Su saldo incluye fondo inicial y entradas de efectivo, menos gastos, retiros y devoluciones registrados. Se actualiza en tiempo real.

Ejemplo: con $12 en caja, registre en Caja un gasto o retiro de $5, método Efectivo y motivo «Pago de propinas». El saldo en Caja y Reportes será $7. Registre cada entrega una sola vez; generar un PDF no efectúa pagos.

El saldo actual es independiente del filtro de fechas. Las ventas, comisiones y propinas del período conservan su desglose histórico por método de cobro. Una propina recibida por Yappy o Tarjeta puede pagarse en efectivo: la salida debe registrarse con método Efectivo.

Sin caja abierta se muestra ese estado, no un saldo inventado. Si falla la lectura de Firebase o el documento es incompatible, se muestra «No disponible» y se bloquea la exportación financiera hasta recuperar el saldo. No se modifican reglas, credenciales ni datos históricos.

Instalación: usar la versión 1.3.7 del repositorio y desplegarla en Firebase App Hosting. No se requiere migración. Esta actualización mantiene los cambios previamente revertidos fuera del código: no reincorpora la exclusión automática de propinas ni los saldos antes/después de movimientos.

Validación: pruebas del saldo $12 → $7 después de un pago de $5, reintentos sin doble descuento, sincronización del indicador y PDF, cierre/cambio de caja, errores y limpieza de suscripciones. Ejecutar npm test, npm run lint y npm run build.
