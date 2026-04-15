# Gear Studio

Generador de engranes 2D con vista previa interactiva, flujo de orden de descarga y exportacion SVG desde backend.

## Estructura

```text
public/
  index.html
  styles.css
  js/
    api-client.js
    gear-math.js
    main.js
    scene-renderer.js
    state.js
src/
  server/
    app.js
    config/
    middleware/
    repositories/
    routes/
    services/
    utils/
data/
  orders.json
server.js
```

## Responsabilidades

- `server.js`: punto de entrada del proceso Node.
- `src/server/app.js`: composicion de Express y montaje de middleware/rutas.
- `src/server/routes/api.js`: contrato HTTP del backend.
- `src/server/services/order-service.js`: reglas de negocio de ordenes y descargas.
- `src/server/services/svg-exporter.js`: construccion del SVG exportable.
- `src/server/services/gear-math.js`: geometria y calculos del engrane.
- `src/server/repositories/order-repository.js`: persistencia en `data/orders.json`.
- `public/js/main.js`: orquestacion del frontend.
- `public/js/scene-renderer.js`: render y animacion de la escena.
- `public/js/api-client.js`: comunicacion con backend.
- `public/js/gear-math.js`: calculos del lado cliente para preview.

## Ejecutar

Necesitas Node.js 18 o superior.

```bash
npm start
```

Modo desarrollo con recarga:

```bash
npm run dev
```

Abre:

```text
http://localhost:3000
```

## Variables de entorno

- `PORT`: puerto del servidor. Default `3000`.
- `PRICE_MXN`: precio por descarga. Default `20`.
- `CURRENCY`: moneda de la orden. Default `MXN`.
- `PAYMENT_MODE`: modo de pago. Default `demo`.
- `ORDER_TTL_MINUTES`: vigencia de orden pendiente. Default `30`.

## API actual

- `GET /api/config`
- `POST /api/orders`
- `GET /api/orders/:orderId`
- `POST /api/orders/:orderId/pay-demo`
- `GET /api/download/:downloadToken`

## Notas

- El frontend y backend ya viven bajo el mismo servidor para evitar problemas de CORS en local.
- El meta tag `gear-api-base` sigue disponible si en algun entorno decides separar el frontend del backend.
- La exportacion activa hoy es `SVG`; `DXF` y `STL` permanecen como siguiente etapa.
