const { createId } = require("../utils/ids");
const { nowIso, plusMinutesIso } = require("../utils/time");
const { buildExportSvg } = require("./svg-exporter");

function validateOrderBody(body) {
  if (!body || typeof body !== "object") {
    return "Body invalido";
  }

  if (body.exportFormat !== "svg") {
    return 'Solo se soporta exportFormat="svg"';
  }

  if (!body.exportConfig || typeof body.exportConfig !== "object") {
    return "Falta exportConfig";
  }

  const { global, gears } = body.exportConfig;

  if (!global || typeof global !== "object") {
    return "Falta exportConfig.global";
  }

  if (!Array.isArray(gears) || gears.length === 0) {
    return "Falta exportConfig.gears o esta vacio";
  }

  return null;
}

function decorateOrder(order) {
  return {
    id: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    paymentMode: order.paymentMode,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    downloadUrl: order.status === "paid" ? `/api/download/${order.downloadToken}` : null,
  };
}

function createOrderService({ repository, config }) {
  function expireStaleOrders() {
    const orders = repository.getAll();
    const now = Date.now();
    let changed = false;

    const nextOrders = orders.map((order) => {
      if (order.status === "pending_payment" && new Date(order.expiresAt).getTime() < now) {
        changed = true;
        return { ...order, status: "expired" };
      }
      return order;
    });

    if (changed) {
      repository.saveAll(nextOrders);
    }
  }

  return {
    getPublicConfig() {
      return {
        amount: config.amount,
        currency: config.currency,
        paymentMode: config.paymentMode,
        paymentLabel: config.paymentLabel,
      };
    },
    validateOrderBody,
    createOrder(exportFormat, exportConfig) {
      expireStaleOrders();

      const order = {
        id: createId("ord"),
        amount: config.amount,
        currency: config.currency,
        paymentMode: config.paymentMode,
        status: config.paymentMode === "demo" ? "pending_payment" : "paid",
        createdAt: nowIso(),
        expiresAt: plusMinutesIso(config.orderTtlMinutes),
        downloadToken: null,
        exportFormat,
        exportConfig,
      };

      if (order.status === "paid") {
        order.downloadToken = createId("dl");
      }

      repository.upsert(order);
      return decorateOrder(order);
    },
    getOrder(orderId) {
      expireStaleOrders();
      const order = repository.findById(orderId);
      return order ? decorateOrder(order) : null;
    },
    payDemoOrder(orderId) {
      expireStaleOrders();

      if (config.paymentMode !== "demo") {
        throw new Error("Este endpoint solo esta disponible en modo demo");
      }

      const order = repository.findById(orderId);
      if (!order) {
        return null;
      }

      if (order.status === "expired") {
        throw new Error("La orden expiro. Crea una nueva para continuar.");
      }

      if (order.status !== "paid") {
        order.status = "paid";
        order.downloadToken = order.downloadToken || createId("dl");
        repository.upsert(order);
      }

      return decorateOrder(order);
    },
    buildDownload(downloadToken) {
      expireStaleOrders();
      const order = repository.findByDownloadToken(downloadToken);

      if (!order) {
        return null;
      }

      if (order.status !== "paid") {
        return { error: { status: 403, message: "La orden aun no esta pagada" } };
      }

      if (order.exportFormat !== "svg") {
        return { error: { status: 400, message: "Formato de exportacion no soportado" } };
      }

      return {
        filename: `gear-studio-${order.id}.svg`,
        contentType: "image/svg+xml; charset=utf-8",
        content: buildExportSvg(order),
      };
    },
  };
}

module.exports = { createOrderService };
