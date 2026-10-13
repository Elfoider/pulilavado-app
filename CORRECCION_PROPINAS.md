# Pulilavado 1.3.5 — Arqueo sin propinas

Las propinas se registran para consulta y para el lavador, pero no se incluyen en los saldos del negocio ni en el arqueo. Efectivo esperado = fondo inicial + cobros de servicios/productos + ingresos manuales − gastos/retiros; las propinas quedan excluidas. Diferencia = efectivo contado del negocio (sin propinas) − efectivo esperado.

Ejemplo: fondo 10, lavado 20 y propina en efectivo 3. Efectivo esperado del negocio: 30. Al contar 30 la diferencia es 0; los 3 de propina siguen registrados por separado.

No registre un retiro de caja para entregar las propinas excluidas. Las comisiones sí se pagan con un retiro y reducen el efectivo esperado del negocio.

## Aplicar

En Firebase App Hosting despliegue el último commit corregido de master. Para una instalación local, conserve .env.local, reemplace el código, ejecute npm ci y después npm run dev. El ZIP contiene código completo.

Al abrir Caja, si la sesión abierta procede de una versión anterior, se calcula el desglose por método a partir de todos sus movimientos de propina. Se añade tipsByMethod mediante una transacción, sin alterar cobros, gastos ni movimientos anteriores. Si falta información o los totales no coinciden, se bloquea el cálculo en vez de inventar valores. Se necesita lectura de cashMovements, ya utilizada para consultar movimientos.

balances conserva los acumulados originales por compatibilidad; la pantalla y el cierre usan balances menos tipsByMethod. Los nuevos cierres guardan expectedCash y cashCountExcludesTips. Las cajas cerradas anteriormente conservan su diferencia y muestran el criterio original: no se recalculan cierres históricos.

Si en una caja abierta ya registró retiros para entregar propinas siguiendo las instrucciones anteriores, esos retiros siguen reduciendo el saldo. Revise esos movimientos antes del cierre para evitar descontar dos veces la misma entrega; no se revierten automáticamente retiros que podrían corresponder a otros pagos. Si requiere corregirlos, deben identificarse y conciliarse con el responsable.

El indicador de cobros en efectivo de Reportes también excluye propinas. Las propinas permanecen visibles en su desglose. Esta corrección pertenece al sistema original pulilavado-app; no cambia Pulix.
