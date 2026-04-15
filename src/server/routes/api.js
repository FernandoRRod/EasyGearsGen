const express = require("express");

function createApiRouter(orderService) {
  const router = express.Router();

  router.get("/config", (_request, response) => {
    response.json(orderService.getPublicConfig());
  });

  router.post("/orders", (request, response) => {
    try {
      const validationError = orderService.validateOrderBody(request.body);

      if (validationError) {
        response.status(400).json({ error: validationError });
        return;
      }

      const order = orderService.createOrder(request.body.exportFormat, request.body.exportConfig);
      response.status(201).json({ order });
    } catch (error) {
      response.status(500).json({ error: error.message || "Error interno al crear la orden" });
    }
  });

  router.get("/orders/:orderId", (request, response) => {
    const order = orderService.getOrder(request.params.orderId);

    if (!order) {
      response.status(404).json({ error: "Orden no encontrada" });
      return;
    }

    response.json({ order });
  });

  router.post("/orders/:orderId/pay-demo", (request, response) => {
    try {
      const order = orderService.payDemoOrder(request.params.orderId);

      if (!order) {
        response.status(404).json({ error: "Orden no encontrada" });
        return;
      }

      response.json({ order });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.get("/download/:downloadToken", (request, response) => {
    const result = orderService.buildDownload(request.params.downloadToken);

    if (!result) {
      response.status(404).json({ error: "Token de descarga invalido" });
      return;
    }

    if (result.error) {
      response.status(result.error.status).json({ error: result.error.message });
      return;
    }

    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.status(200).send(result.content);
  });

  router.use((_request, response) => {
    response.status(404).json({ error: "Endpoint no encontrado" });
  });

  return router;
}

module.exports = { createApiRouter };
