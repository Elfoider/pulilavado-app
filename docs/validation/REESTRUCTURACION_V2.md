# Validación de la reestructuración modular

Rama `MigracionDevV2`, versión `2.0.0-dev.2`. Referencia previa: `7bbb7d72820ba2a4bbd742c328b160cd395f01cc`.

- `npm run check:architecture`: importaciones resueltas y reglas de capas verificadas.
- `npm run lint`: sin errores.
- `npx tsc --noEmit`: sin errores.
- `npm test`: 99 pruebas aprobadas, sin fallos ni omisiones. Incluyen caja, saldos históricos, propinas, vales, sobres, pagos mixtos, catálogo, nómina y exportaciones.
- `npm run build`: compilación completada, con las mismas 17 páginas generadas y rutas conservadas.
- Comparación sintáctica de los 13 archivos TypeScript de operaciones y reportes: código y tipos conservados, excepto rutas de importación.
- Diagnóstico CLI de `examples/migration/demo-snapshot.json`: 15 documentos, cero errores; efectivo generado $7, pendiente $0.
- Navegador sobre compilación de producción: bloqueo de pantallas operativas sin emulador, diagnóstico válido/inválido, descarga, cambio de sede, escritorio/móvil; sin solicitudes a googleapis.com.
- Firestore Emulator + navegador: vales, nómina, PDF/Excel, traslados a sobres, refuerzo de caja y gastos de sobres anteriores.
- Firestore Emulator + navegador: catálogo, modificación del precio por vehículo, pago mixto en servicios y ventas de productos, correcciones, reversión, stock, reportes, entradas numéricas, ayudas y cierre; escritorio/móvil.
- `git diff --check`: sin errores de espacios.

Las comprobaciones anteriores se ejecutaron localmente. El workflow de la rama también incluye el nuevo control de arquitectura; su resultado remoto se consulta en GitHub Actions. No se modificó `master`, no se desplegó la aplicación ni se accedió a Firestore productivo.

La reorganización y sus límites se describen en [STRUCTURE.md](../architecture/STRUCTURE.md).
