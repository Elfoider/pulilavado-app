# Corrección de movimientos de Caja

En **Caja → Ver movimientos → Corregir o anular**, elige el registro por lavador, importe, hora y referencia. Indica el monto correcto o elige **Anular movimiento**, escribe el motivo e ingresa la clave.

Para un vale duplicado, anula únicamente el registro extra y vuelve a consultar **Reportes y Finanzas** antes de generar la nómina. Si el dinero sí fue entregado dos veces, no anules el registro como si esa segunda salida no hubiera ocurrido.

La corrección aplica a gastos, retiros, ingresos manuales y vales de la caja actualmente abierta. No cambia el método, lavador ni categoría. Los cobros y ventas se corrigen desde su propio flujo; los cierres existentes permanecen intactos.

Cada registro original admite una corrección. Se guarda el motivo y un ajuste por la diferencia, con saldo antes y después. El ajuste se fecha cuando se aplica; el vale conserva su fecha original para nómina y usa el monto efectivo (cero al anular). La transacción actualiza Caja, el vale vinculado y la auditoría juntos. Una repetición idéntica devuelve la referencia del ajuste ya guardado.

## Activar en Firebase App Hosting

1. Genera la clave en tu computadora y guárdala en tu gestor de contraseñas:

   ```bash
   node -p "require('node:crypto').randomBytes(24).toString('hex')"
   ```

2. En Firebase, abre el backend de App Hosting de Pulilavado → **Settings → Environment**. Crea una variable de tipo **Secret** llamada `CASH_CORRECTION_SECRET` con esa clave (48 dígitos hexadecimales en minúscula). No la pongas en Git, en variables `NEXT_PUBLIC_`, ni en los registros del servidor. Guarda la configuración para el siguiente despliegue.
3. Publica esta versión en el backend de producción. Firebase Admin usa las credenciales del servicio de App Hosting y requiere permiso de lectura/escritura sobre Firestore en `mrespumasystem`. No se necesita subir un archivo de cuenta de servicio ni hacer una migración de datos.
4. Comprueba que una clave incorrecta no modifica el registro antes de ejecutar la corrección real.

Si falta el secreto o no es válido, la ruta devuelve «La corrección de Caja todavía no está habilitada» sin tocar Firestore. La clave protege esta función de corrección en el servidor. No reemplaza los permisos de los accesos existentes a Firestore; este cambio no despliega ni modifica las reglas de producción.

Guía oficial: [Variables y secretos de App Hosting](https://firebase.google.com/docs/app-hosting/configure#set_and_update_environment_variables_and_secrets).

## Verificación aislada

```bash
npm ci
npm test
npm run lint
npm run build
npx --yes firebase-tools@13.35.1 emulators:exec --config tests/firebase.emulators.json --project demo-pulilavado-corrections --only firestore "node tests/cash-correction.integration.cjs"
```
