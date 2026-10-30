# Análisis del sistema y plan de migración

## Recomendación

La siguiente inversión debe ser la migración controlada, no seguir agregando módulos al monolito original. El sistema actual ya cubre caja, inventario, productos en servicios, pagos mixtos, catálogo con precios por vehículo, comisiones, vales, sobres y reportes. Las reglas financieras existentes se preservarán como criterios de aceptación.

La base V2 de Pulix y su configuración son un proyecto separado. Esta rama no mezcla sus bases ni reemplaza su implementación. La primera fase es preparar el origen y la evidencia; el esquema final debe cotejarse con los contratos reales del destino antes de importar.

## Mejoras pendientes identificadas en el código

| Prioridad | Hallazgo verificable | Tratamiento |
|---|---|---|
| Bloqueante para V2 | La aplicación original no exige autenticación ni membresía | Usar Auth y RBAC del destino; verificar reglas/backend además de botones |
| Bloqueante para V2 | Colecciones y controles globales sin contexto de organización/sede | Mapeo explícito; Caja, stock, sobres y operaciones por sede |
| Bloqueante para el trabajo en esta rama | Firebase original tenía proyecto y configuración productiva de respaldo en el código | Corregido en fase 1: solo emulador demo, sin modo cloud |
| Alta | Muchas pantallas consultan Firestore directamente; algunas administraciones escriben/borran desde componentes | Repositorios por dominio y comandos autorizados en V2; archivado en lugar de borrado físico |
| Alta | Reportes de ventas usan creación del servicio; un pendiente puede cobrarse después, mientras Caja usa fecha del movimiento | Separar actividad por fecha de ingreso y cobros por fecha de pago, con pruebas de cruce de días |
| Alta | Nómina se calcula por período; generar PDF no registra pago ni aplica deuda trasladable | Diseñar liquidaciones, vínculo de vales y estado de pago; evitar doble descuento/importación |
| Alta | Clientes/vehículos son datos parcialmente libres, sin matrícula/vehículo canónico en todos los registros | Revisión de duplicados y mapeo explícito; conservar identidad original, no unir por nombre automáticamente |
| Alta | Hay caminos de compatibilidad para esquemas anteriores de Caja | Diagnosticar y conciliar antes de importar; conservar históricos incompatibles como archivo |
| Alta | El repositorio solo aporta índices y reglas de emulador, no prueba las reglas productivas desplegadas | Verificar reglas reales del destino y agregar pruebas de aislamiento; no presumir cómo está configurada producción |
| Media | El flujo original registra servicios como completados por defecto | Adaptar recepción/en proceso/listo/entregado a la máquina de estados V2 |
| Media | WhatsApp abre chat y asume prefijo 507 | Parámetro por empresa y aviso de vehículo listo después de definir estados; no bloquea diagnóstico |
| Media | Lecturas completas para algunos reportes y concilios | Repositorios paginados y snapshots de cierre en destino, preservando exactitud |
| Media | “Ingresos del negocio” es ventas menos comisiones, no utilidad después de costos | Mantener etiquetas claras; costos/utilidad real requieren definición separada |

Los hallazgos son del código. No se afirma que existan inconsistencias específicas en los datos reales: no se consultó Firestore de producción.

## Fases propuestas

1. **Preparación y diagnóstico — implementada en esta rama.** Aislamiento de entorno, centro de migración local, contrato de copia, auditoría automática, diagnóstico CLI, ejemplo ficticio y pruebas. No importa datos ni declara terminada Auth.
   - **Preparación estructural — implementada en `2.0.0-dev.2`.** Carpetas por módulo y capa, rutas ligeras, infraestructura y componentes compartidos separados, pruebas organizadas y control de dependencias. Consulte [la estructura del proyecto](../architecture/STRUCTURE.md).
2. **Contratos de destino y seguridad — preparación técnica implementada, decisiones de negocio pendientes.** Ensayo local de Auth/RBAC/sedes en `/migration/access`, repositorios de contexto/resumen y pruebas de reglas restrictivas. La [matriz de destino](CONTRATOS_DESTINO.md) y la [guía del laboratorio](FASE_2_ACCESO.md) detallan el alcance. Cotejar Pulix V2 real, organización/sede de destino, permisos, reglas y administración; decidir mapeos de clientes, vehículos, personal, catálogo y configuración. Las decisiones comerciales abiertas en los documentos V2 se cierran aquí antes de transformar datos.
3. **Ensayo de catálogos y entidades maestras.** Transformador versionado e importador idempotente a entorno de ensayo autorizado; IDs de origen, manifest/checkpoints, conflictos y reversión. Nada de copiar controles globales del origen ni cargar directamente en la base V2 existente.
4. **Operación y finanzas.** Servicios, productos, pagos, comisiones, vales, sobres y Caja; pagos de nómina documentados. Conciliar por método/sesión y contrastar reportes antiguos/nuevos. Los traslados siguen siendo movimientos internos.
5. **Corte y puesta en marcha.** Respaldo verificado, cierre de cajas, suspensión temporal de escrituras, última copia coherente, ensayo aprobado, importación, verificación y apertura en V2. Mantener el original disponible para consulta y reversión acordada.

## Condiciones para pasar de fase 1

- Copia real completa de un corte conocido y diagnóstico revisado por el responsable.
- Errores bloqueantes resueltos o excluidos con una decisión documentada; sin alterar documentos históricos para “hacerlos cuadrar”.
- Proyecto/base/organización/sede destino confirmados y entorno de ensayo separado.
- Contratos de datos y acceso validados antes de escribir en el destino.

## Invariantes que deben conservarse

Dinero en centavos; pago mixto suma exacta; propina separada del precio comisionable; productos excluidos de la comisión; precios y porcentajes históricos conservados; ninguna doble venta/descuento; vales vinculados al lavador; traslado Caja/sobre no es ingreso ni gasto nuevo; saldo físico cuadra con su historial; cierres y operaciones históricas no se reabren silenciosamente.

## Operación de ramas

`master` mantiene producción 1.5.3. `MigracionDevV2` concentra estos cambios y los siguientes de migración. No fusionar ni desplegar esta rama al backend productivo actual. Los cambios que se necesiten aún en producción deben publicarse por separado, revisando luego su incorporación a la referencia de migración.
