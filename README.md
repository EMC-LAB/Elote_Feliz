# Elote Feliz · Menú y sistema de operación

**Estado:** Menú digital SILO visual listo; panel real y API implementados, **pendientes de conectar a PostgreSQL y configurar cuentas** antes de operación comercial. No se muestran ventas inventadas.

## Estructura

- `/index.html`, `/menu/`, `/videos/`, `/ubicacion/`: sitio visual aprobado y menú QR, efectos de vapor, cinco elotitos animados por nivel de picor.
- `/operacion/index.html`: panel de operación que requiere inicio de sesión. Tiene 2 roles: `owner` (Kas) y `staff` (encargado).
- `/src/server.js`: backend Express; caja, folios únicos, informes, inventario, auditoría, webhook de WhatsApp Business Platform.
- `/db/schema.sql`: tablas SQL para PostgreSQL con folios únicos en servidor.
- `/scripts/bootstrap-owner.js`: alta segura de propietaria. Nunca hay contraseñas predeterminadas.
- `/assets/`: CSS, JavaScript e imágenes reales/ilustrativas de la demo.

## Cómo activar el POS real en Render

1. Crear PostgreSQL administrado con respaldos; anotar la URL de conexión privada, **no exponerla en GitHub**.
2. Aplicar `db/schema.sql` en la base de datos con un cliente SQL (psql/GUI).
3. Configurar en Render las variables `DATABASE_URL`, `NODE_ENV=production`, `WHATSAPP_NUMBER` (sin el signo +). No asignar `ALLOW_PUBLIC_ORDERS=true` hasta completar pruebas y protección antiabusos.
4. En Render: Web Service Node, build `npm install`, start `npm start`; comprobar `/api/health` que responda `database: true`.
5. Crear la propietaria mediante `OWNER_EMAIL`, `OWNER_PASSWORD` (mínimo 14 caracteres) y `npm run setup:owner`. **Eliminar OWNER_PASSWORD de las variables permanentes después del alta.**
6. Kas entra a `/operacion/`, crea acceso de empleado en su panel. Encargado crea pedidos de mostrador. Solo Kas cancela. Los números `Felicidad #0001` proceden de la secuencia transaccional de PostgreSQL.
7. **WhatsApp no se conecta al proporcionar solo el teléfono**. Dar de alta WhatsApp Business Platform / Cloud API con consentimiento de Kas, conectar webhook `https://DOMINIO/webhooks/whatsapp`, configurar `META_VERIFY_TOKEN` y `META_APP_SECRET` en Render y suscribir `messages`. Si conserva la app de WhatsApp Business, evaluar onboarding de coexistencia según elegibilidad. El webhook solo almacena mensajes entrantes (bandeja); **no crea ventas ni envía respuestas automáticamente**.
8. Si se activa pedido QR directo, establecer `ALLOW_PUBLIC_ORDERS=true` después de pruebas de carga, antispam y cancelaciones. El folio se genera en el servidor al aceptar el pedido; el encargado posteriormente lo confirma.
9. Conectar cámara mediante plataforma del proveedor/NVR con autenticación privada para Kas. La demo **no incluye video en vivo**.

## Reglas de ventas/corte

- Venta contabilizada únicamente cuando un encargado registra el **pago**.
- Panel: ventas cobradas por 1, 7 o 30 días, pedidos, ticket promedio, más vendidos, historial de 30 días; actualización por sondeo cada 8 segundos (necesita servicio activo).
- Cancelaciones solo `owner` con motivo; registro de auditoría. Si hubo pago, queda marcado como *devolución pendiente* para conciliar de forma manual. No se devuelve dinero automáticamente.
- Inventario: entradas y salidas manuales, con trazabilidad; **descuento automático por receta todavía pendiente**.
- Roles son verificados en el servidor, no por ocultar botones en el navegador.

## Qué es demo

- La página `/panel-demo/` y el HTML autónomo usan almacenamiento **solo de ese navegador**. No son aptos para controlar caja ni generar folios compartidos.
- El sitio puede publicarse como vista previa sin `DATABASE_URL`, pero `/operacion/` no permite iniciar sesión hasta conectarla.
- Precios/productos y titular/CLABE deben confirmarse antes de activar ventas. Las fotos son ilustrativas; videos reales pendientes de Kas.
- Render Free puede suspenderse por inactividad; para trabajar con una caja y un webhook en producción se requiere un servicio siempre activo y respaldos.

## Desarrollo local

```bash
npm install
# Configurar env vars en el sistema o un gestor de secretos, y crear la BD
psql "$DATABASE_URL" -f db/schema.sql
npm run setup:owner
npm start
```

Mantener fuera del repositorio los tokens de WhatsApp y las contraseñas. No se requiere dominio propio: el subdominio `onrender.com` sirve para la API y el panel.