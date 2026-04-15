# Gear Studio con pago por descarga

La app ahora ya no depende solo del JavaScript del navegador para liberar la exportacion.

## Como funciona

- El frontend deja configurar y previsualizar los engranes.
- Cuando el usuario hace clic en `Pagar y descargar SVG`, el backend crea una orden.
- Solo cuando la orden cambia a `paid`, el servidor genera el SVG final y libera un enlace de descarga.
- La configuracion del engrane se guarda del lado servidor en `data/orders.json`.

## Ejecutar

Necesitas Node.js 18 o superior instalado.

```bash
npm start
```

Luego abre:

```text
http://localhost:3000
```

## Variables utiles

- `PORT`: puerto del servidor. Por defecto `3000`.
- `PRICE_MXN`: precio por descarga. Por defecto `20`.
- `PAYMENT_MODE`: hoy esta en `demo`.
- `ORDER_TTL_MS`: tiempo de vida de una orden pendiente.

Ejemplo en PowerShell:

```powershell
$env:PRICE_MXN="20"
$env:PAYMENT_MODE="demo"
npm start
```

## Siguiente paso para cobrar de verdad

La base ya esta lista para proteger la descarga. Lo siguiente es conectar una pasarela real:

1. Crear la preferencia/sesion de pago en `POST /api/orders`.
2. Confirmar el pago con webhook.
3. Cambiar la orden a `paid` solo despues de verificar la notificacion del proveedor.
4. Mantener `GET /api/download/:token` como unica salida del archivo final.

## Recomendacion de despliegue

Para algo sencillo y barato:

- Frontend + backend juntos en Railway, Render o un VPS pequeno.
- Stripe o Mercado Pago para cobrar.
- Guardar ordenes en una base real cuando empieces a vender en produccion.
