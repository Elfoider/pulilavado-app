# Validación de Pulilavado 1.3.4

Base del código: repositorio Elfoider/pulilavado-app, rama master, commit 345ef6f5c6e316e8ae0b743b92c1f2f1f28a05b0.

## Comprobaciones realizadas

- 36 pruebas aprobadas (32 de dominio y 4 de renderizado de Caja): prioridad de comisiones y 0%, caja única, idempotencia, pendiente con reserva y posterior cobro, conservación de precios/porcentajes, stock insuficiente, ventas en competencia, correcciones por método, reversión de propinas, anulaciones, historial anterior, límites del cierre, entradas/mermas, códigos únicos y devoluciones sin efectivo suficiente.
- Validación de transacciones de la entrega 1.3.0 con SDK Firebase en emulador real aprobada: servicio pendiente, cobro, reintento, dos ventas simultáneas con stock limitado, devolución, anulación, cierre y bloqueo de caja anterior.
- Prueba de interfaz de la entrega 1.3.0 en Chromium aprobada: apertura con $10; lavado pendiente de $20 con 2 aguas de $2; cobro total $24 y comisión $5; venta individual y anulación; entrada de 5 unidades; consulta de movimientos; cierre con efectivo $34 y diferencia $0.
- Revisión de pantallas de la entrega 1.3.0 en escritorio de 1440 px y móvil de 390 px: Caja, Inventario, Venta de productos, carrito de servicio y campo de comisión. Se comprobó ausencia de desbordamiento horizontal del documento en las tres pantallas nuevas; las tablas admiten desplazamiento interno.
- ESLint sin errores ni advertencias.
- TypeScript y compilación de producción aprobados. El build utilizó NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 para descargar Inter con los certificados del entorno.

## Qué requiere validación en su instalación

Las pruebas se realizaron con datos locales del proyecto demo-pulilavado, sin ejecutar escrituras en mrespumasystem. No se validaron las reglas ni los índices actualmente publicados en Firebase, ni el proceso de alojamiento externo del negocio. La guía contiene los pasos para revisar permisos, publicar índices y realizar una jornada de aceptación.

Las reglas de los tests permiten acceso abierto únicamente al emulador. No son reglas para producción y firebase.json no las publica.

La regresión de Caja contempla documentos existentes sin balances, balances parciales/nulos o montos no numéricos: se muestran avisos sin romper la interfaz. También se verifica que una caja incompatible no admite escrituras financieras ni se reinicia automáticamente.

Para 1.3.1 se reprodujo el registro sin balances en pruebas de renderizado React de la pantalla completa, tanto con una caja abierta incompatible como mezclando historial incompleto y una caja compatible. Estas pruebas pasaron junto con las 30 de dominio, TypeScript, ESLint y el build de producción.

## Corrección 1.3.2

Se probó el formato anterior observado en la captura de Firestore (initialAmount, isOpen, observations, openedAt, responsible). Las pruebas verifican reconocimiento y renderizado de cajas anteriores abiertas/cerradas, bloqueo hasta revisión, conservación de campos originales, cierre explícito con efectivo contado y observación obligatoria, rechazo de formatos desconocidos o cajas nuevas, ausencia de saldos/diferencias inventados, apertura independiente posterior y reintento del cierre sin modificar una nueva caja abierta.

Estas pruebas de dominio y renderizado no sustituyen una prueba conectada a Firebase real. No se modificaron los datos del negocio.

## Ajuste visual 1.3.3

La sección de caja anterior se muestra únicamente mientras está abierta. Al cerrarla desaparece de la pantalla sin borrar o modificar sus datos. La prueba de renderizado existente confirma que una caja anterior cerrada permite abrir jornada y no muestra el recuadro amarillo.

## Corrección de instalación en App Hosting

El primer despliegue de 1.3.3 detectó una URL inexistente para adler-32 en package-lock.json. La sustitución global del número de versión había alterado esa dependencia y dos rangos internos. Se restauraron adler-32 1.3.1, array.prototype.flatmap ^1.3.2 y array.prototype.flat ^1.3.1. La aplicación permanece en 1.3.3.

Se compararon todas las versiones, URL, integridades y requisitos de las dependencias existentes con el lockfile del repositorio original: coinciden. Solo se mantienen los paquetes nuevos de Playwright para las pruebas. npm ci descargó e instaló 487 paquetes en un directorio aislado con caché vacía. No se requiere cambiar Firebase, Node.js ni las reglas de Firestore para este error.

Con esa instalación limpia también aprobaron las 36 pruebas, ESLint y la compilación de producción. El despliegue remoto de App Hosting debe reintentarse con el commit corregido.

## Nómina seleccionable 1.3.4

39 pruebas aprobadas. Las tres nuevas ejecutan la carga, selección y exportación del componente con datos Firebase y PDF simulados. Comprueban selección por identificador con nombres iguales, suma de varios servicios de un mismo lavador, exclusión de pendientes/anulados, persistencia al actualizar, total y filas del PDF, seleccionar todos/quitar selección y bloqueo ante lista vacía, error o cambio de período. Las fechas de los controles se generan en hora local, sin desplazarlas al convertir a UTC. No se modificaron las versiones de dependencias.

Para 1.3.4 aprobaron ESLint y la compilación de producción (con la configuración TLS descrita anteriormente). La instalación con caché vacía se validó al corregir 1.3.3; 1.3.4 conserva exactamente las dependencias de esa corrección.


## Actualización 1.3.7 — vínculo entre Caja y Reportes

43 pruebas automatizadas aprobadas; ESLint y compilación de producción aprobados. El caso de efectivo $12 menos pago de propinas $5 arroja $7, tanto en la suscripción de caja como en la pantalla y PDF financiero. También se verifican reintentos sin doble descuento, cambios/cierre de sesión y errores de lectura. No se ejecutaron escrituras en Firebase de producción.


## Actualización 1.3.8 — efectivo neto sin fondo inicial

44 pruebas automatizadas aprobadas, ESLint y build de producción aprobados. Nuevo caso: apertura $65, saldo total $72 y ventas en efectivo del período $12; la tarjeta neta y la fila del PDF muestran $7 y el desglose original mantiene $12. Se verifica también que una salida que utiliza el fondo puede dejar efectivo neto negativo.


## Actualización 1.3.9

52 pruebas automatizadas: movimientos con secuencia/saldos, concurrencia, reintentos, exportación consistente, reconstrucción controlada, PDF de una página y Excel con dos hojas y dos gráficas. ESLint y build de producción. Prueba de integración con Firestore emulado: cobros, correcciones, retiros concurrentes, reintentos y estados antes/después. Ejemplos construidos con el reporte del 13/10/2026 y sus 19 movimientos.


## Corrección 1.3.10 — apertura del Excel

Se corrige el orden de printOptions/pageMargins/pageSetup respecto a ignoredErrors y se ubica pane dentro de sheetView (no sheetViews). La dimensión del resumen incluye las celdas combinadas y el área de impresión. Prueba de regresión de estructura, además de importes y gráficas, añadida al conjunto automatizado.
