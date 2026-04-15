const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PRICE_MXN = Number(process.env.PRICE_MXN || 20);
const CURRENCY = process.env.CURRENCY || "MXN";
const PAYMENT_MODE = process.env.PAYMENT_MODE || "demo";
const ORDER_TTL_MS = Number(process.env.ORDER_TTL_MS || 1000 * 60 * 30);

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const STATIC_FILES = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "application/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: [] }, null, 2));
  }
}

function readOrders() {
  ensureDataFile();
  const raw = fs.readFileSync(ORDERS_FILE, "utf8");
  const parsed = JSON.parse(raw || '{"orders":[]}');
  return Array.isArray(parsed.orders) ? parsed.orders : [];
}

function writeOrders(orders) {
  ensureDataFile();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders }, null, 2));
}

function sendJSON(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function notFound(response) {
  sendJSON(response, 404, { error: "Recurso no encontrado." });
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeText(value, fallback) {
  const clean = String(value || "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .slice(0, 24);
  return clean || fallback;
}

function normalizeExportConfig(rawConfig) {
  const rawGlobal = rawConfig && typeof rawConfig === "object" ? rawConfig.global || {} : {};
  const rawGears = rawConfig && typeof rawConfig === "object" ? rawConfig.gears || [] : [];

  const gearCount = clamp(Number(rawGlobal.gearCount) || rawGears.length || 2, 1, 5);
  const baseSpeed = clamp(Number(rawGlobal.baseSpeed) || 6, 2, 18);
  const spacing = clamp(Number(rawGlobal.spacing) || 6, 0, 32);

  const gears = rawGears.slice(0, gearCount).map((gear, index) => ({
    name: sanitizeText(gear.name, `Engrane ${String.fromCharCode(65 + index)}`),
    teeth: clamp(Math.round(Number(gear.teeth) || 18), 8, 400),
    pitchDiameter: clamp(Number(gear.pitchDiameter) || 120, 40, 520),
    diametralPitch: clamp(Number(gear.diametralPitch) || 0.15, 0.04, 2),
    pressureAngle: clamp(Number(gear.pressureAngle) || 20, 12, 35),
    boreRatio: clamp(Number(gear.boreRatio) || 26, 10, 70),
  }));

  while (gears.length < gearCount) {
    const index = gears.length;
    gears.push({
      name: `Engrane ${String.fromCharCode(65 + index)}`,
      teeth: 18 + index * 2,
      pitchDiameter: 120 + index * 24,
      diametralPitch: 0.15,
      pressureAngle: 20,
      boreRatio: 26,
    });
  }

  return {
    global: {
      gearCount,
      baseSpeed,
      spacing,
    },
    gears,
  };
}

function polarToCartesian(radius, angle) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function sampleArc(radius, startAngle, endAngle, steps) {
  const points = [];
  const totalSteps = Math.max(steps, 1);
  let normalizedEnd = endAngle;

  while (normalizedEnd <= startAngle) {
    normalizedEnd += Math.PI * 2;
  }

  for (let index = 0; index <= totalSteps; index += 1) {
    const ratio = index / totalSteps;
    const angle = startAngle + ((normalizedEnd - startAngle) * ratio);
    points.push(polarToCartesian(radius, angle));
  }

  return points;
}

function involuteValue(angle) {
  return Math.tan(angle) - angle;
}

function pressureAngleAtRadius(baseRadius, radius) {
  if (radius <= baseRadius) {
    return 0;
  }

  return Math.acos(baseRadius / radius);
}

function computeGearModel(source) {
  const teeth = clamp(Math.round(Number(source.teeth) || 18), 8, 400);
  const pitchDiameter = clamp(
    Number(source.pitchDiameter) || (teeth / clamp(Number(source.diametralPitch) || 0.15, 0.04, 2)),
    40,
    520,
  );
  const pressureAngle = clamp(Number(source.pressureAngle) || 20, 12, 35);
  const boreRatio = clamp(Number(source.boreRatio) || 26, 10, 70);
  const diametralPitch = teeth / pitchDiameter;
  const pitchRadius = pitchDiameter / 2;
  const addendum = 1 / diametralPitch;
  const dedendum = 1.25 / diametralPitch;
  const outerRadius = pitchRadius + addendum;
  const rootRadius = Math.max(pitchRadius - dedendum, 12);
  const baseRadius = pitchRadius * Math.cos((pressureAngle * Math.PI) / 180);
  const boreRadius = Math.max(Math.min(rootRadius - 6, rootRadius * (boreRatio / 100)), 6);

  return {
    ...source,
    teeth,
    pitchDiameter,
    diametralPitch,
    pressureAngle,
    boreRatio,
    pitchRadius,
    outerRadius,
    rootRadius,
    baseRadius,
    boreRadius,
  };
}

function createGearPath(gear) {
  const toothAngle = (Math.PI * 2) / gear.teeth;
  const halfToothThicknessAngle = Math.PI / (2 * gear.teeth);
  const pitchPressureAngle = pressureAngleAtRadius(gear.baseRadius, gear.pitchRadius);
  const pitchInvolute = involuteValue(pitchPressureAngle);
  const flankStartRadius = Math.max(gear.rootRadius, gear.baseRadius);
  const flankSamples = 8;
  const outerArcSteps = 4;
  const rootArcSteps = 4;
  const points = [];

  const flankOffsetAtRadius = (radius) => {
    const pressureAngle = pressureAngleAtRadius(gear.baseRadius, radius);
    return halfToothThicknessAngle - (involuteValue(pressureAngle) - pitchInvolute);
  };

  for (let toothIndex = 0; toothIndex < gear.teeth; toothIndex += 1) {
    const toothCenterAngle = (toothIndex * toothAngle) - (Math.PI / 2);
    const nextToothCenterAngle = (((toothIndex + 1) % gear.teeth) * toothAngle) - (Math.PI / 2);
    const startOffset = flankOffsetAtRadius(flankStartRadius);
    const outerOffset = flankOffsetAtRadius(gear.outerRadius);
    const leftRootAngle = toothCenterAngle - startOffset;
    const rightRootAngle = toothCenterAngle + startOffset;
    const leftOuterAngle = toothCenterAngle - outerOffset;
    const rightOuterAngle = toothCenterAngle + outerOffset;
    const nextLeftRootAngle = nextToothCenterAngle - startOffset;

    points.push(polarToCartesian(gear.rootRadius, leftRootAngle));

    if (flankStartRadius > gear.rootRadius) {
      points.push(polarToCartesian(flankStartRadius, leftRootAngle));
    }

    for (let sample = 0; sample <= flankSamples; sample += 1) {
      const ratio = sample / flankSamples;
      const radius = flankStartRadius + ((gear.outerRadius - flankStartRadius) * ratio);
      const angle = toothCenterAngle - flankOffsetAtRadius(radius);
      points.push(polarToCartesian(radius, angle));
    }

    points.push(...sampleArc(gear.outerRadius, leftOuterAngle, rightOuterAngle, outerArcSteps).slice(1));

    for (let sample = flankSamples; sample >= 0; sample -= 1) {
      const ratio = sample / flankSamples;
      const radius = flankStartRadius + ((gear.outerRadius - flankStartRadius) * ratio);
      const angle = toothCenterAngle + flankOffsetAtRadius(radius);
      points.push(polarToCartesian(radius, angle));
    }

    if (flankStartRadius > gear.rootRadius) {
      points.push(polarToCartesian(gear.rootRadius, rightRootAngle));
    }

    points.push(...sampleArc(gear.rootRadius, rightRootAngle, nextLeftRootAngle, rootArcSteps).slice(1));
  }

  return `${points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(" ")} Z`;
}

function computeGearLayout(exportConfig) {
  const width = 1200;
  const height = 760;
  const gears = exportConfig.gears.map((gear, index) => ({ ...computeGearModel(gear), index }));

  const totalWidth = gears.reduce((sum, gear) => sum + (gear.pitchRadius * 2), 0)
    + Math.max(gears.length - 1, 0) * exportConfig.global.spacing;
  const startX = (width - totalWidth) / 2;
  const centerY = height / 2;

  let currentX = startX;
  gears.forEach((gear, index) => {
    currentX += gear.pitchRadius;
    gear.cx = currentX;
    gear.cy = centerY + (index % 2 === 0 ? -24 : 24);
    currentX += gear.pitchRadius + exportConfig.global.spacing;
  });

  return { width, height, gears };
}

function buildSvg(exportConfig, orderId) {
  const { width, height, gears } = computeGearLayout(exportConfig);

  const connectorLines = gears
    .map((gear, index) => {
      if (index === 0) {
        return "";
      }
      const previous = gears[index - 1];
      return `<line x1="${previous.cx}" y1="${previous.cy}" x2="${gear.cx}" y2="${gear.cy}" class="connector-line" />`;
    })
    .join("");

  const gearMarkup = gears
    .map((gear) => {
      const pathData = createGearPath(gear);
      return `
      <g transform="translate(${gear.cx} ${gear.cy})">
        <path class="gear-body" d="${pathData}" />
        <circle class="gear-guide" r="${gear.pitchRadius}" />
        <circle class="gear-base" r="${gear.baseRadius}" />
        <circle class="gear-outer" r="${gear.outerRadius}" />
        <circle class="gear-core" r="${gear.boreRadius}" />
        <circle class="axis-point" r="4" />
        <text x="0" y="${(gear.outerRadius + 34).toFixed(2)}" text-anchor="middle">${gear.name} - N ${gear.teeth} - P ${gear.diametralPitch.toFixed(4)} - PA ${gear.pressureAngle}</text>
      </g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Exportacion de engranes ${orderId}">
  <defs>
    <linearGradient id="gearFillGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#163352" />
      <stop offset="100%" stop-color="#0a1728" />
    </linearGradient>
  </defs>
  <style>
    .stage-bg { fill: #07111f; }
    .stage-grid { stroke: rgba(255,255,255,0.06); stroke-width: 1; }
    .connector-line { stroke: rgba(255,255,255,0.16); stroke-width: 1.5; }
    .gear-body { fill: url(#gearFillGradient); stroke: #8ed8ff; stroke-width: 2; }
    .gear-guide { fill: none; stroke: rgba(115,224,194,0.3); stroke-width: 1.5; stroke-dasharray: 10 10; }
    .gear-base { fill: none; stroke: rgba(115,224,194,0.2); stroke-width: 1.2; stroke-dasharray: 6 8; }
    .gear-outer { fill: none; stroke: rgba(255,255,255,0.18); stroke-width: 1.2; stroke-dasharray: 3 6; }
    .gear-core { fill: rgba(4,8,16,0.78); stroke: rgba(255,255,255,0.14); }
    .axis-point { fill: #95f2cf; }
    text { fill: #c4d7ee; font-size: 15px; font-family: 'Segoe UI', Arial, sans-serif; }
  </style>
  <rect class="stage-bg" width="${width}" height="${height}" rx="28" />
  ${Array.from({ length: Math.floor(width / 80) + 1 }, (_, index) => {
    const x = index * 80;
    return `<line class="stage-grid" x1="${x}" y1="0" x2="${x}" y2="${height}" />`;
  }).join("")}
  ${Array.from({ length: Math.floor(height / 80) + 1 }, (_, index) => {
    const y = index * 80;
    return `<line class="stage-grid" x1="0" y1="${y}" x2="${width}" y2="${y}" />`;
  }).join("")}
  ${connectorLines}
  ${gearMarkup}
</svg>`;
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("La solicitud es demasiado grande."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON invalido."));
      }
    });

    request.on("error", reject);
  });
}

function getPaymentLabel() {
  return PAYMENT_MODE === "demo" ? "Demo" : "Pasarela";
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

function createOrder(exportConfig) {
  const orders = readOrders();
  const now = Date.now();

  const order = {
    id: randomId("ord"),
    amount: PRICE_MXN,
    currency: CURRENCY,
    paymentMode: PAYMENT_MODE,
    status: "pending_payment",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ORDER_TTL_MS).toISOString(),
    downloadToken: null,
    exportConfig,
  };

  orders.push(order);
  writeOrders(orders);
  return order;
}

function expireStaleOrders(orders) {
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
    writeOrders(nextOrders);
  }

  return nextOrders;
}

function findOrder(orderId) {
  const orders = expireStaleOrders(readOrders());
  return orders.find((order) => order.id === orderId) || null;
}

function updateOrder(orderId, updater) {
  const orders = expireStaleOrders(readOrders());
  const index = orders.findIndex((entry) => entry.id === orderId);
  if (index === -1) {
    return null;
  }

  const updated = updater(orders[index]);
  orders[index] = updated;
  writeOrders(orders);
  return updated;
}

function handleConfig(_request, response) {
  sendJSON(response, 200, {
    amount: PRICE_MXN,
    currency: CURRENCY,
    paymentMode: PAYMENT_MODE,
    paymentLabel: getPaymentLabel(),
  });
}

async function handleCreateOrder(request, response) {
  try {
    const body = await readRequestBody(request);
    const exportConfig = normalizeExportConfig(body.exportConfig);
    const order = createOrder(exportConfig);

    sendJSON(response, 201, {
      order: decorateOrder(order),
    });
  } catch (error) {
    sendJSON(response, 400, { error: error.message });
  }
}

function handleGetOrder(_request, response, orderId) {
  const order = findOrder(orderId);
  if (!order) {
    notFound(response);
    return;
  }

  sendJSON(response, 200, { order: decorateOrder(order) });
}

function handleDemoPayment(_request, response, orderId) {
  if (PAYMENT_MODE !== "demo") {
    sendJSON(response, 400, { error: "El pago demo esta deshabilitado en este entorno." });
    return;
  }

  try {
    const updated = updateOrder(orderId, (order) => {
      if (order.status === "expired") {
        throw new Error("La orden expiro. Crea una nueva para continuar.");
      }

      if (order.status === "paid") {
        return order;
      }

      return {
        ...order,
        status: "paid",
        downloadToken: randomId("dl"),
        paidAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      notFound(response);
      return;
    }

    sendJSON(response, 200, { order: decorateOrder(updated) });
  } catch (error) {
    sendJSON(response, 400, { error: error.message });
  }
}

function handleDownload(response, token) {
  const orders = expireStaleOrders(readOrders());
  const order = orders.find((entry) => entry.downloadToken === token);

  if (!order || order.status !== "paid") {
    sendJSON(response, 404, { error: "No existe una descarga valida para ese token." });
    return;
  }

  const svg = buildSvg(order.exportConfig, order.id);
  const filename = `gear-studio-${order.id}.svg`;

  response.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  response.end(svg);
}

function serveStatic(response, pathname) {
  const staticFile = STATIC_FILES[pathname];
  if (!staticFile) {
    return false;
  }

  const filePath = path.join(ROOT_DIR, staticFile.file);
  const content = fs.readFileSync(filePath);
  response.writeHead(200, {
    "Content-Type": staticFile.contentType,
    "Cache-Control": pathname === "/" ? "no-store" : "public, max-age=300",
  });
  response.end(content);
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const { pathname } = requestUrl;

    if (request.method === "GET" && serveStatic(response, pathname)) {
      return;
    }

    if (request.method === "GET" && pathname === "/api/config") {
      handleConfig(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/orders") {
      await handleCreateOrder(request, response);
      return;
    }

    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      handleGetOrder(request, response, orderMatch[1]);
      return;
    }

    const payDemoMatch = pathname.match(/^\/api\/orders\/([^/]+)\/pay-demo$/);
    if (request.method === "POST" && payDemoMatch) {
      handleDemoPayment(request, response, payDemoMatch[1]);
      return;
    }

    const downloadMatch = pathname.match(/^\/api\/download\/([^/]+)$/);
    if (request.method === "GET" && downloadMatch) {
      handleDownload(response, downloadMatch[1]);
      return;
    }

    notFound(response);
  } catch (error) {
    sendJSON(response, 500, { error: error.message || "Error interno del servidor." });
  }
});

ensureDataFile();
server.listen(PORT, HOST, () => {
  console.log(`Gear Studio disponible en http://localhost:${PORT}`);
  console.log(`Modo de pago: ${PAYMENT_MODE}`);
});
