# Corrección de Caja en Pulilavado 1.3.3

Esta versión reconoce el formato existente mostrado en Firebase: initialAmount, isOpen, observations, openedAt y responsible. El campo isOpen indica si esa caja anterior está abierta; no equivale a un saldo.

No se pueden reconstruir los saldos por método de pago ni el arqueo con esos cinco campos. Por eso la aplicación conserva el registro y muestra una sección «Caja anterior», con su responsable y fondo inicial, sin inventar balances ni diferencias.

## Instalar

1. Detenga el servidor con Ctrl+C.
2. Reemplace el código por el contenido de este ZIP y conserve su .env.local y configuración de alojamiento.
3. Ejecute npm ci y después npm run dev.
4. Si el navegador sigue mostrando la versión anterior, detenga el servidor, elimine únicamente la carpeta .next y vuelva a iniciarlo.

No necesita borrar documentos, cambiar campos manualmente ni conceder acceso administrativo a Firebase.

## Cerrar la caja anterior y empezar una jornada

1. Entre en Caja. Revise los cobros históricos y el efectivo real con el responsable del negocio.
2. En «Caja anterior», escriba el efectivo contado y una observación que identifique a la persona que hizo la revisión.
3. Marque la confirmación y pulse «Cerrar caja anterior».
4. El sistema conserva el importe inicial, las observaciones originales, la fecha de apertura y el responsable. Cambia isOpen a false y añade status closed, fecha de cierre y una constancia legacyClosure con el efectivo contado, observación y expectedBalanceKnown false. No genera movimientos ni un saldo final calculado.
5. Aparecerá «Abrir jornada». Ingrese el fondo en efectivo que realmente permanecerá en caja para la jornada nueva. No se copia automáticamente el importe contado de la caja anterior.

El cierre se ejecuta en una transacción y admite reintentos sin duplicar datos. Solo libera cashControl/current si apunta a esa misma caja; no altera otra caja abierta. La caja anterior deja de mostrarse en la pantalla después del cierre; el documento y su constancia permanecen guardados en Firebase. El formato verificado se reconoce también si isOpen ya es false.

Si un documento tiene otro formato o está incompleto, mantiene el aviso de incompatibilidad y el bloqueo correspondiente. Esta versión no intenta reconstruir cobros antiguos ni cambiar el historial de servicios.

La guía general de inventario, ventas y comisiones permanece en docs/operations/GUIA_ACTUALIZACION.md.
