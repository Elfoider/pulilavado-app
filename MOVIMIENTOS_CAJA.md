# Pulilavado 1.3.6 — Movimientos detallados de Caja

La lista incluye fecha, tipo, método, monto, motivo/referencia y cuatro saldos:

- Saldo del método antes y después: efectivo, Yappy, tarjeta o transferencia, según el movimiento.
- Efectivo de caja antes y después: efectivo esperado del negocio, sin propinas.

Ejemplo: gasto de 5 en efectivo, con saldo 30 → método efectivo 30/25 y efectivo de caja 30/25. Venta Yappy de 2 → Yappy 0/2 y efectivo de caja 25/25. Propina de 3 → monto registrado, sin cambio en los saldos del negocio.

Los saldos se guardan en la misma transacción que el movimiento y la actualización de caja. Se incluyen aperturas, cobros, gastos, retiros, ventas, anulaciones, correcciones y propinas. Los reintentos no duplican movimientos ni incrementan su secuencia. Se conserva una secuencia por caja para ordenar operaciones nuevas que compartan fecha/hora de confirmación.

Pulse «Actualizar movimientos» para volver a consultar la primera página. «Cargar más movimientos» conserva páginas de 100. La tabla admite desplazamiento horizontal en pantallas pequeñas.

## Movimientos anteriores

Los registros previos no tienen todos los saldos ni una secuencia inequívoca entre operaciones confirmadas al mismo tiempo. Se muestran como «No registrado», conservando monto y referencia; no se rellenan con ceros ni se modifican registros financieros históricos.

## Actualizar

Despliegue el último commit de master en Firebase App Hosting. Para instalación local, conserve .env.local, reemplace código, ejecute npm ci y npm run dev. No requiere borrar o migrar colecciones ni crear índices adicionales; se conserva el índice de movimientos existente.
