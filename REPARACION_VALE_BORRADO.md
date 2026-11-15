# Reparación puntual de un vale duplicado de $5 borrado de Firestore

Este procedimiento es para el caso en que se borraron el vale duplicado de `cashAdvances` y su movimiento de `cashMovements`, la entrega duplicada **no ocurrió** y la caja original permanece abierta. No corrige vales borrados sin evidencia del descuadre ni cajas cerradas.

1. Obtén esta rama en una copia local e instala las dependencias:

   ```bash
   git fetch origin refs/heads/fix/correccion-movimientos-caja:refs/remotes/origin/fix/correccion-movimientos-caja
   git switch --track origin/fix/correccion-movimientos-caja
   npm ci
   ```

   Si ya estás en esa rama, usa `git merge --ff-only origin/fix/correccion-movimientos-caja` en vez de crearla otra vez.

2. Con Google Cloud CLI, inicia sesión con tu cuenta autorizada para el proyecto `mrespumasystem`. El programa usa credenciales de aplicación guardadas localmente; no envíes tokens ni llaves a nadie.

   ```bash
   gcloud auth application-default login
   node scripts/reparar-vale-borrado.cjs
   ```

3. La primera ejecución es de **solo lectura**. Debe mostrar el ID de la caja abierta, el efectivo actual y el efectivo reparado (exactamente $5 más), gastos (exactamente $5 menos), vales que se conservarán y un código de confirmación. Si devuelve error o no coincide con lo ocurrido, detente. Si necesitas ayuda, comparte el resultado sin el código.
4. Comprueba que el saldo esperado coincide con tu conteo, que no hubo un segundo pago y que es la caja original. Solo entonces ejecuta:

   ```bash
   node scripts/reparar-vale-borrado.cjs --aplicar TU_CODIGO_DE_CONFIRMACION
   ```

   Si la caja cambió, repite el diagnóstico. El código vincula la revisión a las versiones exactas de los documentos, y la reparación y su auditoría se guardan en una sola transacción.

5. Actualiza Caja, vuelve a consultar nómina y verifica el efectivo antes de cerrar. La constancia está en `cashSessions/{id}/repairs`. Los saldos históricos guardados en las filas restantes se conservan como se registraron; un reporte de un rango con esas filas puede seguir mostrando saldos históricos previos a la reparación. No se registra un ingreso ni se vuelve a crear el vale.

Este procedimiento **no necesita desplegar** la interfaz, configurar su clave ni fusionar el PR. La prueba de integración usa un proyecto ficticio y se ejecuta con el emulador; la herramienta fija el proyecto de producción y solo admite el emulador local en el puerto 8080.
