const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const appConfig = {
  rootDir: ROOT_DIR,
  publicDir: path.join(ROOT_DIR, "public"),
  dataDir: path.join(ROOT_DIR, "data"),
  ordersFile: path.join(ROOT_DIR, "data", "orders.json"),
  port: numberFromEnv(process.env.PORT, 3000),
  amount: numberFromEnv(process.env.PRICE_MXN, 20),
  currency: process.env.CURRENCY || "MXN",
  paymentMode: process.env.PAYMENT_MODE || "demo",
  paymentLabel: process.env.PAYMENT_MODE === "demo" ? "Demo" : "Pasarela",
  orderTtlMinutes: numberFromEnv(process.env.ORDER_TTL_MINUTES, 30),
  allowedOrigins: new Set([
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]),
};

module.exports = { appConfig };
