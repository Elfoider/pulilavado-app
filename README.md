# Sistema Pulilavado / Mr. Espuma

Actualización 1.3.9 del sistema existente: comisiones individuales, inventario, venta de productos independiente y dentro de los servicios, y caja con apertura/cierre y conciliación.

Lea [GUIA_ACTUALIZACION.md](GUIA_ACTUALIZACION.md) para instalación, configuración de Firebase, reglas operativas, tratamiento de datos históricos y pruebas.

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
```

Firebase conserva el proyecto original `mrespumasystem`. No se modifica producción al descomprimir o instalar. `npm run dev` inicia la aplicación conectada al proyecto configurado; use el emulador para ensayos aislados.

La corrección de Caja y los pasos para aplicar esta versión se describen en [CORRECCION_CAJA.md](CORRECCION_CAJA.md).

En Reportes y Finanzas puede seleccionar qué lavadores incluir en el PDF de nómina. El total del PDF corresponde solo a la selección.

Reportes y Finanzas muestra el efectivo de la caja abierta en tiempo real, incluyendo gastos y retiros registrados. Consulte [CAJA_Y_REPORTES.md](CAJA_Y_REPORTES.md).

La tarjeta «Efectivo neto de la jornada» muestra el saldo de la caja abierta menos su fondo inicial. Los ingresos por método del período conservan sus importes brutos.

La versión 1.3.9 incorpora el reporte financiero con gráficas, exportación a Excel (Resumen y Movimientos) y los saldos antes/después de cada nuevo movimiento. Consulte [REPORTES_Y_MOVIMIENTOS.md](REPORTES_Y_MOVIMIENTOS.md).
