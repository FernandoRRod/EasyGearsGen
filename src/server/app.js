const express = require("express");
const path = require("path");
const { appConfig } = require("./config/app-config");
const { createCorsMiddleware } = require("./middleware/cors");
const { createOrderRepository } = require("./repositories/order-repository");
const { createOrderService } = require("./services/order-service");
const { createApiRouter } = require("./routes/api");

function createApp() {
  const app = express();
  const repository = createOrderRepository(appConfig.ordersFile);
  const orderService = createOrderService({ repository, config: appConfig });

  app.use(createCorsMiddleware(appConfig.allowedOrigins));
  app.use(express.json());
  app.use(express.static(appConfig.publicDir));
  app.use("/api", createApiRouter(orderService));

  app.use((_request, response) => {
    response.sendFile(path.join(appConfig.publicDir, "index.html"));
  });

  return app;
}

module.exports = { createApp };
