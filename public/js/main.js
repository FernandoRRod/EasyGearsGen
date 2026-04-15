import { controls, elements, outputs, state } from "./state.js";
import { clamp, roundTo, recalculateGearModel } from "./gear-math.js";
import { renderScene, updateZoomUI } from "./scene-renderer.js";
import { fetchRuntimeConfig, createOrder, payDemoOrder, downloadOrderFile } from "./api-client.js";

function setDownloadButtonState() {
  const unsupportedFormat = state.export.format !== "svg";
  elements.downloadButton.disabled = state.export.busy;

  if (state.export.busy) {
    elements.downloadButton.textContent = "Preparando...";
    return;
  }

  elements.downloadButton.textContent = unsupportedFormat ? "Proximamente" : "Descargar";
}

function updateCardMetrics(card, gear) {
  const metrics = card.querySelector("[data-role='metrics']");
  if (!metrics) {
    return;
  }

  metrics.textContent = `P ${gear.diametralPitch.toFixed(4)} | OD ${(gear.outerRadius * 2).toFixed(2)} | RD ${(gear.rootRadius * 2).toFixed(2)}`;
}

function commitGearValue(index, field, rawValue) {
  const source = { ...state.gears[index] };

  if (field === "name") {
    source.name = String(rawValue || "").trimStart().slice(0, 24) || `Engrane ${String.fromCharCode(65 + index)}`;
    state.gears[index] = source;
    return;
  }

  const numericValue = Number(rawValue);

  if (field === "teeth") {
    source.teeth = clamp(Math.round(numericValue || source.teeth || 18), 8, 400);
    source.pitchDiameter = roundTo(source.teeth / (source.diametralPitch || 0.15));
  } else if (field === "pitchDiameter") {
    source.pitchDiameter = clamp(numericValue || source.pitchDiameter || 120, 40, 520);
  } else if (field === "diametralPitch") {
    source.diametralPitch = clamp(numericValue || source.diametralPitch || 0.15, 0.04, 2);
    source.pitchDiameter = roundTo((source.teeth || 18) / source.diametralPitch);
  } else if (field === "pressureAngle") {
    source.pressureAngle = clamp(numericValue || source.pressureAngle || 20, 12, 35);
  } else if (field === "boreRatio") {
    source.boreRatio = clamp(numericValue || source.boreRatio || 26, 10, 70);
  }

  state.gears[index] = recalculateGearModel(source);
}

function renderGearCards() {
  elements.gearCards.innerHTML = "";

  state.gears.slice(0, state.global.gearCount).forEach((rawGear, index) => {
    const gear = recalculateGearModel(rawGear);
    state.gears[index] = gear;

    const fragment = elements.gearCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".gear-card");
    const title = fragment.querySelector("h3");
    const chip = fragment.querySelector(".gear-chip");

    title.textContent = gear.name;
    chip.textContent = index === 0 ? "Motriz" : "Acoplado";
    card.open = false;

    fragment.querySelectorAll("input[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = gear[field];

      const commitValue = (event) => {
        commitGearValue(index, field, event.target.value);
        const updated = state.gears[index];
        event.target.value = updated[field];
        title.textContent = updated.name;
        updateCardMetrics(card, updated);
        renderScene();
      };

      input.addEventListener("input", commitValue);
      input.addEventListener("change", commitValue);
    });

    updateCardMetrics(card, gear);
    card.style.animationDelay = `${index * 80}ms`;
    elements.gearCards.appendChild(fragment);
  });
}

function buildExportConfig() {
  return {
    global: {
      gearCount: state.global.gearCount,
      baseSpeed: state.global.baseSpeed,
      spacing: state.global.spacing,
    },
    gears: state.gears
      .slice(0, state.global.gearCount)
      .map((gear) => {
        const normalized = recalculateGearModel(gear);
        return {
          name: normalized.name,
          teeth: normalized.teeth,
          pitchDiameter: normalized.pitchDiameter,
          diametralPitch: normalized.diametralPitch,
          pressureAngle: normalized.pressureAngle,
          boreRatio: normalized.boreRatio,
        };
      }),
  };
}

async function handleDownload() {
  if (state.export.busy) {
    return;
  }

  if (state.export.format !== "svg") {
    outputs.hudStatus.textContent = `${state.export.format.toUpperCase()} estara disponible despues. Por ahora la descarga activa es SVG.`;
    return;
  }

  state.export.busy = true;
  setDownloadButtonState();
  outputs.hudStatus.textContent = "Preparando orden de descarga...";

  try {
    const created = await createOrder({
      exportFormat: state.export.format,
      exportConfig: buildExportConfig(),
    });

    let order = created.order;

    if (state.export.paymentMode === "demo" && order.status !== "paid") {
      outputs.hudStatus.textContent = "Aplicando pago demo...";
      const paid = await payDemoOrder(order.id);
      order = paid.order;
    }

    if (!order.downloadUrl) {
      throw new Error("La orden se creo, pero aun no tiene enlace de descarga.");
    }

    outputs.hudStatus.textContent = "Descargando SVG...";
    await downloadOrderFile(order.downloadUrl);
    outputs.hudStatus.textContent = "SVG descargado correctamente.";
  } catch (error) {
    outputs.hudStatus.textContent = error.message;
  } finally {
    state.export.busy = false;
    setDownloadButtonState();
  }
}

async function loadRuntimeConfig() {
  try {
    const config = await fetchRuntimeConfig();
    state.export.paymentMode = config.paymentMode || "demo";
  } catch (_error) {
    state.export.paymentMode = "demo";
  } finally {
    setDownloadButtonState();
  }
}

function bindGlobalControls() {
  Object.entries(controls).forEach(([key, input]) => {
    input.value = state.global[key];

    const commitValue = (event) => {
      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);
      const fallback = Number.isFinite(state.global[key]) ? state.global[key] : min;
      const value = clamp(Number(event.target.value) || fallback, min, max);

      state.global[key] = value;
      event.target.value = value;

      if (key === "gearCount") {
        renderGearCards();
      } else if (key === "baseSpeed") {
        outputs.baseSpeed.textContent = `${value} rpm`;
      } else if (key === "spacing") {
        outputs.spacing.textContent = `${value} px`;
      }

      renderScene();
    };

    input.addEventListener("input", commitValue);
    input.addEventListener("change", commitValue);
  });

  outputs.baseSpeed.textContent = `${state.global.baseSpeed} rpm`;
  outputs.spacing.textContent = `${state.global.spacing} px`;
}

function updatePlaybackUI() {
  elements.playToggle.classList.toggle("is-live", state.isPlaying);
  elements.playToggle.classList.toggle("is-paused", !state.isPlaying);
  elements.playToggle.setAttribute("aria-pressed", String(state.isPlaying));
  outputs.playToggleLabel.textContent = state.isPlaying ? "Live" : "Paused";
  outputs.hudStatus.textContent = state.isPlaying ? "Animacion continua" : "Animacion detenida";
}

function bindPlaybackToggle() {
  elements.playToggle.addEventListener("click", () => {
    state.isPlaying = !state.isPlaying;
    updatePlaybackUI();
    renderScene();
  });
}

function resetView() {
  state.view.autoFit = true;
  renderScene();
}

function bindViewportControls() {
  elements.zoomRange.addEventListener("input", (event) => {
    state.view.zoom = Number(event.target.value) / 100;
    state.view.autoFit = false;
    updateZoomUI();
    renderScene();
  });

  elements.resetViewButton.addEventListener("click", resetView);

  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  elements.scene.addEventListener("pointerdown", (event) => {
    isPanning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    elements.stageFrame.classList.add("is-panning");
    elements.scene.setPointerCapture(event.pointerId);
  });

  elements.scene.addEventListener("pointermove", (event) => {
    if (!isPanning) {
      return;
    }

    const scaleX = 1200 / elements.scene.clientWidth;
    const scaleY = 760 / elements.scene.clientHeight;
    const dx = (event.clientX - lastX) * scaleX;
    const dy = (event.clientY - lastY) * scaleY;

    state.view.autoFit = false;
    state.view.panX += dx / state.view.zoom;
    state.view.panY += dy / state.view.zoom;
    lastX = event.clientX;
    lastY = event.clientY;
    renderScene();
  });

  const stopPanning = (event) => {
    if (!isPanning) {
      return;
    }

    isPanning = false;
    elements.stageFrame.classList.remove("is-panning");

    if (event.pointerId !== undefined && elements.scene.hasPointerCapture(event.pointerId)) {
      elements.scene.releasePointerCapture(event.pointerId);
    }
  };

  elements.scene.addEventListener("pointerup", stopPanning);
  elements.scene.addEventListener("pointercancel", stopPanning);
  elements.scene.addEventListener("pointerleave", stopPanning);
}

function bindExportControls() {
  elements.downloadFormat.addEventListener("change", (event) => {
    state.export.format = event.target.value;
    setDownloadButtonState();
  });

  elements.downloadButton.addEventListener("click", async () => {
    elements.downloadButton.blur();
    await handleDownload();
  });
}

bindGlobalControls();
bindPlaybackToggle();
bindViewportControls();
bindExportControls();
updatePlaybackUI();
updateZoomUI();
setDownloadButtonState();
loadRuntimeConfig();
renderGearCards();
renderScene();
