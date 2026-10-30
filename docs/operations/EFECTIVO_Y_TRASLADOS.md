# Efectivo de la jornada y traslados — 1.5.3

Guardar efectivo en un sobre es un traslado interno. Caja disminuye y el sobre aumenta; el registro se conserva con tipo `envelope_deposit`, presentado como **Traslado a sobre**. La operación no incrementa los gastos de la sesión.

Se separan tres importes en Caja y Reportes:

- **Efectivo a guardar de la jornada**: resultado de la actividad de efectivo después de gastos, retiros y vales, sin restar lo trasladado a sobres. No incluye fondo inicial, ingresos adicionales ni refuerzos desde sobres como ganancias nuevas.
- **Guardado en sobres**: total bruto de los traslados desde Caja a sobres dentro de la jornada o rango consultado. Los retiros posteriores no borran ni disminuyen el historial de depósitos; el saldo actual de cada sobre se consulta en Sobres.
- **Pendiente por guardar**: efectivo que queda sobre el fondo inicial, con mínimo cero. Puede incluir dinero reforzado desde sobres o fondos adicionales, por lo que no equivale a una ganancia nueva.

Ejemplo: fondo $65, cobros $100, gastos $10 y vale $20. El resultado de la jornada es $70. Al trasladar esos $70 al sobre, Caja queda con $65, el resultado conserva $70, el guardado muestra $70 y el pendiente queda en $0.

PDF y Excel usan el mismo cálculo. Los gastos y pagos se presentan separados de los traslados; la conciliación conserva las salidas físicas para cuadrar Caja. En Excel, Resumen muestra el resultado en A6, el guardado en F25 y el pendiente en F31. Los movimientos conservan sus saldos antes/después y sus importes originales.

La corrección se aplica al consultar movimientos existentes que ya estén identificados como traslados a sobres, incluidos los de cajas cerradas. No requiere migración ni cambios en Firestore. No se convierten automáticamente gastos escritos a mano cuyo motivo mencione un sobre, porque el texto no permite verificar que fueran traslados.

Los gastos directos desde sobres siguen incluidos en el control semanal correspondiente; no se registran nuevamente como gastos de Caja. Un traslado de sobre a Caja tampoco crea ingresos de la jornada.
