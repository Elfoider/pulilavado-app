# Estructura modular de Pulilavado

Esta reorganización es una etapa de preparación entre el diagnóstico de migración y los contratos de V2. Se desarrolla en `MigracionDevV2`, versión `2.0.0-dev.2`. Las URLs, colecciones, operaciones y cálculos financieros existentes se conservan.

## Mapa de carpetas

| Carpeta | Responsabilidad |
|---|---|
| `src/app/` | Rutas de Next.js, layout, estilos globales y composición de proveedores |
| `src/features/` | Funciones del negocio, agrupadas por módulo |
| `src/infrastructure/firebase/` | Inicialización del cliente y suscripciones reutilizables a Firestore |
| `src/shared/ui/` | Entradas numéricas, importes y ayuda reutilizable |
| `src/shared/navigation/` | Navegación de escritorio y móvil, enlaces entre secciones |
| `src/shared/providers/` | Proveedores generales de interfaz |
| `src/shared/config/` | Menú, versión y política de entorno |
| `src/shared/lib/` | Utilidades de formato y clases CSS |
| `tests/unit/` | Pruebas separadas en dominio, componentes e infraestructura |
| `tests/integration/firestore/` | Pruebas con el SDK y emulador de Firestore |
| `tests/e2e/` | Flujos completos en navegador |
| `tests/helpers/` | Cargadores y soporte de pruebas |
| `tests/config/` | Reglas y configuración exclusiva del emulador |
| `scripts/migration/` | Herramienta local de diagnóstico |
| `scripts/quality/` | Ejecución de pruebas y comprobación de arquitectura |
| `config/firebase/` | Definiciones de índices; `firebase.json` conserva el punto de entrada |
| `examples/migration/` | Copia ficticia de ejemplo, sin datos productivos |
| `docs/architecture/` | Organización y reglas de dependencias |
| `docs/migration/` | Diagnóstico, decisiones y fases de migración |
| `docs/operations/` | Guías operativas y cambios históricos del sistema |
| `docs/validation/` | Evidencia de validación |
| `docs/archive/legacy/` | Componentes anteriores sin uso, conservados como texto de referencia |

`public/` y las configuraciones de Next.js, TypeScript, npm, ESLint, CSS y App Hosting permanecen en la raíz donde sus herramientas las esperan. Las carpetas generadas, dependencias y variables locales no forman parte de la estructura de código publicada.

## Módulos funcionales

- `dashboard`: panel principal.
- `history`: historial de servicios.
- `washers`: administración y ficha del lavador; tipos de personal.
- `clients`: clientes frecuentes.
- `services`: registro y edición del servicio; tipos del documento de servicio.
- `catalog`: catálogo y selector de servicios.
- `inventory`: inventario y carrito de productos.
- `sales`: ventas independientes de productos.
- `payments`: editor de métodos de pago.
- `cash`: caja, ahorro de la jornada, historial de movimientos y suscripción a la caja actual.
- `treasury`: sobres y vales desde la interfaz.
- `settings`: configuración del negocio.
- `reports`: resumen de actividad, nómina, finanzas y exportaciones.
- `operations`: reglas y transacciones compartidas que coordinan dinero, stock y servicios.
- `migration`: auditoría de copia, contratos de destino y centro de diagnóstico.
- `access`: contratos de identidad/permisos, casos de uso y laboratorio local de sedes.

Cada módulo contiene solo las capas que ya necesita. No se crean carpetas vacías para funciones futuras.

## Reglas de dependencias

1. `app` compone las pantallas; el contenido de cada pantalla vive en `features/<módulo>/components`.
2. `domain` contiene modelos y cálculos puros. `application` contiene operaciones del negocio y contratos de persistencia. Ninguna de estas capas importa React, Next.js o el SDK de Firebase.
3. `infrastructure` implementa el acceso externo. El adaptador de operaciones conserva las transacciones existentes y se publica a través de `features/operations/index.ts`.
4. `components` y `hooks` implementan la interfaz. Los componentes compartidos no dependen de módulos funcionales.
5. Los componentes usan `@/` para referencias internas. Los módulos puros y adaptadores usan rutas relativas, compatibles con su compilación independiente para pruebas y CLI.
6. `features/reports/domain` calcula; `infrastructure` consulta; `exports` genera PDF/Excel; `assets` contiene las fuentes y su licencia.
7. Una nueva función debe agregarse al módulo que sea dueño de su comportamiento. Un módulo nuevo puede incorporar `domain`, `application`, `infrastructure`, `components` y `hooks` según necesite esas responsabilidades.

`npm run check:architecture` comprueba referencias internas, rechaza rutas antiguas, evita dependencias de interfaz/persistencia en el núcleo y dependencias de módulos en `shared`. El workflow de la rama ejecuta este control junto con lint, pruebas y compilación.

## Alcance y próximos pasos

La reorganización no sustituye la siguiente fase de seguridad y contratos. Algunas pantallas existentes todavía consultan o administran Firestore directamente, ahora dentro de su módulo; trasladar esos accesos a repositorios autorizados requiere pruebas de permisos y pertenece a la migración V2. Tampoco se fragmentan las transacciones financieras: se conserva su atomicidad.

Los tres componentes antiguos sin consumidores (`ServiceForm`, `ServicesTable`, `DatabaseFilter`) se archivan como `.tsx.txt`, fuera de la compilación. Los tipos activos de servicios y lavadores tienen un dueño definido; el método de pago usa el modelo financiero común.

## Verificación local

```bash
npm ci
npm run check:architecture
npm run lint
npm test
npm run migration:check -- examples/migration/demo-snapshot.json --organization demo-organizacion --branch principal
npm run build
```

Para abrir las pantallas operativas de esta rama se requiere el emulador; consulte [la guía de migración](../migration/README.md). El diagnóstico `/migration` puede usarse con el entorno bloqueado por defecto.
