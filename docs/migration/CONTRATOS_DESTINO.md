# Correspondencia con Pulix V2

## Evidencia y decisión

Se revisó la copia local de Pulix V2, incluyendo contexto, Auth, permisos, reglas, datos maestros, operación, cobros, caja, inventario, ventas y reportes. `target-review.json` identifica los archivos mediante SHA-256. La copia no contiene metadatos Git: no se atribuye a un commit ni se supone que coincida con producción. No se modificó esa aplicación ni su base.

**Decisión:** aprovechar la arquitectura de acceso y APIs de V2 como destino. Conservar el original para diagnóstico y regresión. El laboratorio de esta rama comprueba contratos mínimos de acceso; no intenta convertir las consultas globales originales en multi-sede agregando un login.

El destino utiliza `profiles/{uid}`, `organizations/{org}/memberships/{uid}`, `roles/{roleId}` y `branches/{branch}`. Los permisos se resuelven desde rol + concesiones individuales − denegaciones. La pertenencia a una organización y sede se comprueba además del permiso. Los SDK del cliente no pueden escribir datos operativos; las APIs verifican el ID token revocado, cargan contexto actual y autorizan la acción antes de las transacciones Admin SDK.

El laboratorio reproduce la forma de esos contratos de acceso y lectura de contexto/resumen. No importa el claim opcional `pulixPlatformAdmin`: la administración de plataforma no concede acceso implícito a los datos de cualquier empresa.

## Matriz de las colecciones originales

Las rutas siguientes son formas de contrato, no instrucciones de escritura. `org` y `branch` deben ser explícitos y revisados. El contrato tipado está en `src/features/migration/domain/target-contract.ts`.

| Origen | Destino revisado / tratamiento | Adaptación necesaria |
|---|---|---|
| `clients` | `organizations/{org}/clients` y `vehicles` | Separar personas y vehículos, matrícula e identidad estable; revisar duplicados |
| `washers` | `organizations/{org}/washers` | Asignación de sedes y comisión en puntos básicos; no confundir lavador con cuenta Auth |
| `serviceCatalog` | Catálogo de organización y `branches/{branch}/catalogPrices` | Precio en centavos; conservar precio contratado por vehículo |
| `settings` | `settings/general` en organización y sede | Moneda, métodos por ID y precedencia de configuración |
| `products` | Productos de organización y `branches/{branch}/stock` | Categorías, SKU, precio y existencia por sede; costo requiere contrato adicional |
| `productCodes` | `_productCodes` de organización | Reconstruir unicidad; no copiar bloqueos globales |
| `services` | `branches/{branch}/services` y `payments` | Entidades relacionadas, estados, asignación, comisión histórica y cobros |
| `sales` | `branches/{branch}/sales` y `salePayments` | Diseñar pago mixto; el comando revisado recibe un solo método por venta |
| `cashSessions` | Sesiones por sede; archivo histórico previo | Conservar cierres; definir apertura nueva a partir del corte conciliado |
| `cashMovements` | Movimientos bajo la sesión de la sede; archivo previo | Preservar método, orden y saldos; no ejecutar el historial como nuevos cobros |
| `cashAdvances` | Contrato de vales/nómina pendiente | Lavador, descuento único, período y aplicación en liquidación |
| `cashEnvelopes` | Tesorería por sede pendiente | Semana martes-lunes, saldos y traslados internos |
| `envelopeMovements` | Libro de tesorería pendiente | Contrapartida de caja, gasto directo y refuerzo de efectivo |
| `inventoryMovements` | Movimientos de inventario por sede; archivo previo | Conservar antes/después sin descontar dos veces las ventas antiguas |
| `cashControl` | `_cash/current` por sede | Reconstruir tras apertura nueva; no copiar referencia global |
| `treasuryControl` | Pendiente del contrato de tesorería | Regenerar controles e idempotencia según operación destino |

## Diferencias que bloquean una conversión directa

1. **Identidad:** el origen guarda parte de los datos de cliente/vehículo como texto. V2 exige IDs y vehículo canónico. No se deduplica por nombre ni se inventan matrículas.
2. **Dinero y comisión:** V2 usa enteros en unidades menores y puntos básicos (40% = 4000). Convertir USD 12,34 produce 1234 centavos, pero se debe confirmar moneda, precisión y límites. El reconocimiento de comisión de V2 depende de estados terminados/entregados y cobros, con redondeo por línea; el origen tiene su propia instantánea. Los históricos no se recalculan con reglas actuales.
3. **Pagos:** los cobros de servicios V2 reciben un método por comando y admiten varios cobros, lo que exige preservar la asignación de un pago mixto y su idempotencia conjunta. El comando de venta de productos revisado usa un método único. No dividir ventas automáticamente para simularlo.
4. **Productos en servicios:** V2 admite ventas asociadas mediante `serviceId`, mientras el origen guarda líneas de productos y precio total en el servicio. Se debe definir un cobro coordinado y evitar duplicar ingresos, stock o comisiones al separar documentos.
5. **Caja:** V2 separa saldo comercial, propinas y movimientos manuales por método. Los sobres del origen son transferencias internas. Un sobre guardado no reduce el efectivo generado de la jornada aunque sí reduzca el saldo físico en caja.
6. **Nómina y tesorería:** no se identificaron contratos operativos equivalentes para vales, sobres o liquidación de nómina en la copia revisada. Los reportes de rendimiento no acreditan que una nómina haya sido pagada. Se requieren permisos específicos, liquidaciones y contrapartidas antes de transformar esos datos.
7. **Fechas:** actividad, cobro y movimiento pueden corresponder a días distintos. Mantener la semana martes-lunes y los límites de fecha del negocio. No sustituir un reporte histórico por la caja actual.
8. **Seguridad:** los repositorios operativos deben consumir APIs autorizadas de V2. No se abrirán las reglas para reutilizar escrituras directas del origen. Las lecturas de listados deben incluir los filtros de organización y estado que sus reglas exigen.

## Orden de implementación resultante

1. Confirmar la revisión y el entorno destino, empresa/sede, permisos y configuración financiera.
2. Completar vales, sobres, nómina y pago coordinado en los contratos V2; acordar cómo conservar históricos anteriores al corte.
3. Definir un manifiesto de mapeo explícito para categorías, personal, clientes/vehículos, catálogo y métodos de pago. Cada correspondencia ambigua queda bloqueada para revisión.
4. Ensayar primero entidades maestras en un destino de prueba autorizado, con trazabilidad, IDs estables e idempotencia.
5. Incorporar transacciones y archivos financieros; comparar saldo por método/sede/sesión, vales y sobres con el original.
6. Aprobar conciliación y recién entonces preparar el corte productivo.

No se generó un importador ni se habilitó una conexión cloud. Un diagnóstico sin errores de datos no resuelve por sí solo las diferencias de contrato anteriores.
