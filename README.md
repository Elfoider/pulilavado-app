# Sistema Pulilavado / Mr. Espuma

Actualización 1.3.3 del sistema existente: comisiones individuales, inventario, venta de productos independiente y dentro de los servicios, y caja con apertura/cierre y conciliación.

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
