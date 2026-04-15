const fs = require("fs");
const path = require("path");

function ensureOrdersFile(ordersFile) {
  const dataDir = path.dirname(ordersFile);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(ordersFile)) {
    fs.writeFileSync(ordersFile, JSON.stringify({ orders: [] }, null, 2));
  }
}

function readOrders(ordersFile) {
  ensureOrdersFile(ordersFile);
  const raw = fs.readFileSync(ordersFile, "utf8");
  const parsed = JSON.parse(raw || '{"orders":[]}');
  return Array.isArray(parsed.orders) ? parsed.orders : [];
}

function writeOrders(ordersFile, orders) {
  ensureOrdersFile(ordersFile);
  fs.writeFileSync(ordersFile, JSON.stringify({ orders }, null, 2));
}

function createOrderRepository(ordersFile) {
  return {
    getAll() {
      return readOrders(ordersFile);
    },
    saveAll(orders) {
      writeOrders(ordersFile, orders);
    },
    findById(orderId) {
      return this.getAll().find((order) => order.id === orderId) || null;
    },
    findByDownloadToken(downloadToken) {
      return this.getAll().find((order) => order.downloadToken === downloadToken) || null;
    },
    upsert(order) {
      const orders = this.getAll();
      const index = orders.findIndex((entry) => entry.id === order.id);

      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.push(order);
      }

      this.saveAll(orders);
      return order;
    },
  };
}

module.exports = { createOrderRepository };
