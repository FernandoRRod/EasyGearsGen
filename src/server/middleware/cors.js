function createCorsMiddleware(allowedOrigins) {
  return (request, response, next) => {
    const origin = request.headers.origin;

    if (origin && allowedOrigins.has(origin)) {
      response.header("Access-Control-Allow-Origin", origin);
    }

    response.header("Vary", "Origin");
    response.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.header("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  };
}

module.exports = { createCorsMiddleware };
