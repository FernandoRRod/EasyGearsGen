const { createApp } = require("./src/server/app");
const { appConfig } = require("./src/server/config/app-config");

const app = createApp();

app.listen(appConfig.port, () => {
  console.log(`Servidor corriendo en http://localhost:${appConfig.port}`);
  console.log(`Modo de pago: ${appConfig.paymentMode}`);
});
