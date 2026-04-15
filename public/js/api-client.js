import { getApiBaseUrl } from "./state.js";

function buildApiUrl(path) {
  const baseUrl = getApiBaseUrl();

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${baseUrl}${path}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(buildApiUrl(url), options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la solicitud.");
  }

  return data;
}

export async function fetchRuntimeConfig() {
  return requestJson("/api/config");
}

export async function createOrder(exportPayload) {
  return requestJson("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(exportPayload),
  });
}

export async function payDemoOrder(orderId) {
  return requestJson(`/api/orders/${orderId}/pay-demo`, {
    method: "POST",
  });
}

export async function downloadOrderFile(downloadUrl) {
  const response = await fetch(buildApiUrl(downloadUrl));

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo descargar el archivo.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);

  link.href = objectUrl;
  link.download = filenameMatch ? filenameMatch[1] : "gear-studio.svg";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
