# Vales y sobres de efectivo — versión 1.4.0

## Registrar un vale

En **Caja → Registrar gasto o movimiento**, seleccione **Vale / adelanto a lavador**. Elija el lavador, indique el monto y el motivo y guarde. El método es siempre Efectivo.

Ejemplo: con $100 disponibles, un vale de $20 deja $80 en Caja. El vale queda asociado al identificador del lavador, aunque cambie de nombre o haya otras personas con el mismo nombre. El gasto y el vale se registran juntos: un reintento de la misma solicitud no duplica el descuento. No hace falta registrar otro gasto por el mismo vale.

## Nómina y descuento de vales

Seleccione el período en **Reportes y Finanzas** y los lavadores que incluirá en el pago. La pantalla y el PDF muestran comisiones brutas, vales del período y saldo neto a pagar.

Ejemplo: comisiones $50, vales $20, pago restante $30. Al entregar esos $30, registre solamente ese retiro en Caja. Registrar de nuevo los $20 de vales descontaría dinero dos veces.

Los lavadores con vales y sin servicios en el período también aparecen. Si sus vales superan sus comisiones, se muestra cero a pagar y una columna con el excedente para conciliar. Los descuentos son por fechas del período seleccionado: no se arrastran automáticamente a un período distinto ni se marca la nómina como pagada al generar un PDF. Esto mantiene el funcionamiento del reporte de pago existente; el administrador debe conciliar los excedentes y elegir el período que corresponda.

## Semana operativa

Las semanas empiezan el **martes a las 00:00** y terminan el lunes. Las fechas operativas usan **America/Caracas**. Puede elegir semanas anteriores con los controles o una fecha de referencia y regresar con **Semana actual**.

El **efectivo neto generado** es el flujo registrado de efectivo: cobros netos menos vales, gastos y retiros de Caja, menos gastos directos de sobres. Excluye fondos iniciales, aportes adicionales y traslados internos. Es efectivo antes de obligaciones que todavía no se han pagado, no utilidad contable después de todas las comisiones y costos. Los vales no vuelven a descontarse de la ganancia contable después de que ya se hayan considerado las comisiones completas.

## Guardar efectivo en un sobre

En **Sobres con dinero**, indique el monto y el motivo/responsable en **Guardar efectivo de hoy en su sobre**. El sistema resta ese dinero de Caja y lo agrega al sobre del día actual, conservando el fondo inicial de la caja. Si ya existe un sobre del mismo día, aumenta su saldo en lugar de crear otro.

Ejemplo: Caja tiene $72, de los cuales $65 son fondo inicial. Puede guardar $7; Caja queda con $65 y el sobre con $7. La tarjeta de efectivo a guardar queda en $0 porque ese dinero ya se guardó. Guardarlo no lo contabiliza nuevamente como una venta o una ganancia.

**Guarde el efectivo antes de cerrar la caja.** Si físicamente se dejó como parte del fondo de una caja nueva, no vuelva a declararlo como dinero separado en un sobre.

## Tomar dinero de un sobre

Elija **Usar dinero de este sobre**, indique cuánto se toma, el motivo y el destino:

- **Pasar a Caja:** resta del sobre y aumenta el efectivo de la caja abierta. Es un traslado, no un ingreso nuevo. Cuando se utilice, registre en Caja el gasto, vale o retiro que corresponda.
- **Gasto directo desde el sobre:** resta del sobre sin pasar por Caja. No registre otra vez ese mismo gasto en Caja.

Ambas opciones conservan fecha, sobre de origen, motivo/responsable y saldo anterior y posterior. No se puede retirar más del saldo disponible. Dos retiros concurrentes tampoco pueden sobregirar el sobre.

Un retiro de un sobre de la semana pasada se registra en la semana en que se realizó. El resumen semanal incluye esa salida y muestra de qué sobre se tomó. Los sobres de cada semana muestran su **saldo actual**, que puede cambiar por retiros posteriores; no se presentan como un cierre histórico inmutable.

## Sobres que ya existían

Use **Registrar un sobre que ya tenía dinero** únicamente para efectivo ya separado físicamente de Caja antes de comenzar este control. Indique el día original, monto contado y responsable/motivo, y confirme que no forma parte de Caja.

Esta declaración se registra una sola vez por sobre. No modifica Caja ni crea una ganancia semanal. Permite controlar sobres anteriores sin duplicar el dinero ya contado. Los guardados posteriores se realizan desde Caja mediante el flujo normal.

## Reportes

El PDF financiero conserva su resumen y gráficas y añade el control semanal con vales, efectivo generado, saldos de sobres y depósitos/retiros detallados, incluidos los de sobres de semanas anteriores.

El Excel conserva **Resumen** y **Movimientos** y añade **Vales** y **Control semanal**. El resumen muestra vales del período y nómina neta. La hoja semanal incluye totales, saldo actual por sobre y todos sus movimientos de la semana. No se aplica el límite de 100 movimientos de la pantalla de Caja a las exportaciones.

El período de ventas y nómina es el elegido en los filtros. El control semanal corresponde a la semana de la fecha final consultada. El saldo de la caja abierta y el de los sobres se consultan al generar: no equivalen a un arqueo físico cerrado.

## Instalación y datos

Instale y despliegue la versión 1.4.0 del repositorio. No se alteran los registros históricos ni se cargan automáticamente saldos de sobres o vales antiguos. No se cambian las reglas de Firebase ni se requiere un índice compuesto nuevo.

Las nuevas colecciones son `cashAdvances`, `cashEnvelopes`, `envelopeMovements` y `treasuryControl`. Usan los mismos permisos operativos del proyecto; si las reglas existentes restringen el acceso por nombre de colección, el administrador de Firebase deberá habilitar esas operaciones para las cuentas autorizadas.

Las pruebas usan únicamente un proyecto `demo-` con Firestore emulado. No se realizaron escrituras en los datos de producción.

## Detalle de vales en nómina (1.4.1)

La nómina en pantalla y el PDF muestran debajo de cada lavador sus vales del período, con fecha, motivo y monto individual, en orden cronológico. El vínculo usa el ID del lavador, incluso si dos personas comparten nombre. El PDF incluye únicamente los lavadores seleccionados y sus movimientos. Estos renglones detallan la deducción total y no la descuentan por segunda vez. Para registrar un vale, Caja → Vale / adelanto a lavador → seleccionar lavador, monto y motivo.
