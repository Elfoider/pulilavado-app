# Validación fase 1

- 99 pruebas automáticas: 87 regresiones existentes y 12 casos nuevos de auditoría/aislamiento.
- ESLint sin errores y compilación de producción completada con la configuración de migración bloqueada por defecto.
- Diagnóstico CLI del ejemplo ficticio: 15 documentos, 0 errores, 0 revisiones; conserva resultado de efectivo $7 y pendiente $0 después del traslado al sobre.
- Prueba real de navegador: puerta de entorno operativa bloqueada, JSON válido/inválido, descarga del diagnóstico, invalidación al cambiar sede, formatos escritorio/móvil y ausencia de solicitudes a googleapis.com.
- Regresión con Firestore Emulator y navegador: vale, nómina, PDF/Excel, guardado de sobre, refuerzo de Caja y gasto de sobre antiguo; sin tocar bases reales.
- Se agregó un workflow de comprobaciones para push/PR de MigracionDevV2. No contiene pasos de despliegue ni secretos. Su resultado remoto debe revisarse en GitHub Actions; la evidencia anterior es local.

No se auditó la copia productiva. No se ejecutaron importaciones, cambios de reglas desplegadas ni modificaciones de la otra aplicación Pulix V2. La herramienta no certifica todas las reglas del destino; solo las comprobaciones enumeradas en esta fase.
