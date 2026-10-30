# MigracionDevV2 — preparación de migración

Esta rama contiene la **fase 1 de migración, la reestructuración modular y la preparación técnica de acceso y sedes V2**. Producción permanece en `master` (1.5.3). No despliegue esta rama en el backend productivo: las pantallas operativas están limitadas al emulador local.

- [Probar acceso y sedes: fase 2](docs/migration/FASE_2_ACCESO.md)
- [Contratos y diferencias con Pulix V2](docs/migration/CONTRATOS_DESTINO.md)
- [Estructura de carpetas y reglas para nuevas funciones](docs/architecture/STRUCTURE.md)
- [Análisis y plan de fases](docs/migration/ANALISIS_Y_PLAN.md)
- [Uso del centro de migración y herramienta local](docs/migration/README.md)
- [Decisión de arquitectura](docs/migration/ADR-001.md)
- [Validación de la fase 1](docs/migration/VALIDACION.md)
- [Validación de la reestructuración](docs/validation/REESTRUCTURACION_V2.md)
- [Validación técnica de acceso y sedes](docs/validation/FASE_2_ACCESO.md)

Abra `/migration` para revisar el ejemplo ficticio. No se importan datos ni se conecta a la base del proyecto Pulix V2. Las instrucciones originales siguientes se conservan como referencia histórica; para esta rama prevalece la guía de migración.

---

# Sistema Pulilavado / Mr. Espuma

Actualización 1.4.0 del sistema existente: comisiones individuales, inventario, venta de productos independiente y dentro de los servicios, y caja con apertura/cierre y conciliación.

Lea [docs/operations/GUIA_ACTUALIZACION.md](docs/operations/GUIA_ACTUALIZACION.md) para instalación, configuración de Firebase, reglas operativas, tratamiento de datos históricos y pruebas.

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
```

Firebase conserva el proyecto original `mrespumasystem`. No se modifica producción al descomprimir o instalar. `npm run dev` inicia la aplicación conectada al proyecto configurado; use el emulador para ensayos aislados.

La corrección de Caja y los pasos para aplicar esta versión se describen en [docs/operations/CORRECCION_CAJA.md](docs/operations/CORRECCION_CAJA.md).

En Reportes y Finanzas puede seleccionar qué lavadores incluir en el PDF de nómina. El total del PDF corresponde solo a la selección.

Reportes y Finanzas muestra el efectivo de la caja abierta en tiempo real, incluyendo gastos y retiros registrados. Consulte [docs/operations/CAJA_Y_REPORTES.md](docs/operations/CAJA_Y_REPORTES.md).

La tarjeta «Efectivo neto de la jornada» muestra el saldo de la caja abierta menos su fondo inicial. Los ingresos por método del período conservan sus importes brutos.

La versión 1.3.9 incorpora el reporte financiero con gráficas, exportación a Excel (Resumen y Movimientos) y los saldos antes/después de cada nuevo movimiento. Consulte [docs/operations/REPORTES_Y_MOVIMIENTOS.md](docs/operations/REPORTES_Y_MOVIMIENTOS.md).

La versión 1.3.10 corrige la estructura Open XML de la exportación para evitar que Excel repare o descarte la hoja Resumen.

La versión 1.4.0 incorpora vales por lavador con descuento en nómina y el control de sobres diarios y efectivo semanal de martes a lunes. Instrucciones: [docs/operations/VALES_Y_SOBRES.md](docs/operations/VALES_Y_SOBRES.md).
