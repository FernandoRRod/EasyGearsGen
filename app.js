const SVG_NS = "http://www.w3.org/2000/svg";
const SCENE_WIDTH = 1200;
const SCENE_HEIGHT = 760;

const scene = document.getElementById("gearScene");
const gearCards = document.getElementById("gearCards");
const gearCardTemplate = document.getElementById("gearCardTemplate");
const playToggle = document.getElementById("playToggle");
const zoomRange = document.getElementById("zoomRange");
const resetViewButton = document.getElementById("resetView");
const stageFrame = document.querySelector(".stage-frame");
const downloadButton = document.getElementById("downloadButton");
const downloadFormat = document.getElementById("downloadFormat");

const controls = {
  gearCount: document.getElementById("gearCount"),
  baseSpeed: document.getElementById("baseSpeed"),
  spacing: document.getElementById("spacing"),
};

const outputs = {
  baseSpeed: document.getElementById("baseSpeedValue"),
  spacing: document.getElementById("spacingValue"),
  hudSummary: document.getElementById("hudSummary"),
  hudStatus: document.getElementById("hudStatus"),
  playToggleLabel: document.getElementById("playToggleLabel"),
  zoomValue: document.getElementById("zoomValue"),
};

const state = {
  global: {
    gearCount: 2,
    baseSpeed: 6,
    spacing: 6,
  },
  isPlaying: true,
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  export: {
    format: "svg",
  },
  gears: [
    { name: "Engrane A", teeth: 18, pitchDiameter: 120, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 26 },
    { name: "Engrane B", teeth: 28, pitchDiameter: 186.67, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 24 },
    { name: "Engrane C", teeth: 14, pitchDiameter: 93.33, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 30 },
    { name: "Engrane D", teeth: 22, pitchDiameter: 146.67, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 22 },
    { name: "Engrane E", teeth: 34, pitchDiameter: 226.67, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 20 },
  ],
};

let animationFrame = null;
let animationStart = null;
let pausedAngles = [];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function makeSVG(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
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

function normalizeAngle(angle) {
  let result = angle;

  while (result <= -Math.PI) {
    result += Math.PI * 2;
  }

  while (result > Math.PI) {
    result -= Math.PI * 2;
  }

  return result;
}

function normalizeCycle(value) {
  let result = value % 1;
  if (result < 0) {
    result += 1;
  }
  return result;
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

function recalculateGearModel(source) {
  const teeth = clamp(Math.round(Number(source.teeth) || 18), 8, 400);
  const rawPitchDiameter = Number(source.pitchDiameter);
  const rawDiametralPitch = Number(source.diametralPitch);
  const fallbackDiameter = teeth / 0.15;
  const pitchDiameter = clamp(
    Number.isFinite(rawPitchDiameter) && rawPitchDiameter > 0
      ? rawPitchDiameter
      : (Number.isFinite(rawDiametralPitch) && rawDiametralPitch > 0 ? teeth / rawDiametralPitch : fallbackDiameter),
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
  const boreRadius = Math.min(rootRadius - 6, rootRadius * (boreRatio / 100));
  const circularPitch = Math.PI / diametralPitch;
  const toothThickness = circularPitch / 2;

  return {
    ...source,
    teeth,
    pitchDiameter: roundTo(pitchDiameter),
    diametralPitch: roundTo(diametralPitch, 4),
    pressureAngle: roundTo(pressureAngle),
    boreRatio: roundTo(boreRatio),
    pitchRadius,
    addendum,
    dedendum,
    outerRadius,
    rootRadius,
    baseRadius,
    boreRadius: Math.max(boreRadius, 6),
    circularPitch,
    toothThickness,
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

  return points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(" ") + " Z";
}

function buildActiveGearModels() {
  return state.gears
    .slice(0, state.global.gearCount)
    .map((gear, index) => ({ ...recalculateGearModel(gear), index }));
}

function layoutGears(gears) {
  const totalWidth = gears.reduce((sum, gear) => sum + (gear.pitchRadius * 2), 0)
    + Math.max(gears.length - 1, 0) * state.global.spacing;
  const startX = (SCENE_WIDTH - totalWidth) / 2;
  const centerY = SCENE_HEIGHT / 2;
  let currentX = startX;

  gears.forEach((gear, index) => {
    currentX += gear.pitchRadius;
    gear.cx = currentX;
    gear.cy = centerY + (index % 2 === 0 ? -24 : 24);
    currentX += gear.pitchRadius + state.global.spacing;
  });
}

function getFeaturePhaseAtAngle(gear, globalAngle) {
  const toothAngle = (Math.PI * 2) / gear.teeth;
  const localPitch = (globalAngle - gear.phaseOffset + (Math.PI / 2)) / toothAngle;
  return normalizeCycle(localPitch);
}

function snapFeaturePhase(phase) {
  return normalizeCycle(Math.round(phase * 2) / 2);
}

function computeMeshPhase(gears) {
  if (!gears.length) {
    return;
  }

  gears[0].phaseOffset = 0;

  if (gears.length === 1) {
    return;
  }

  const first = gears[0];
  const second = gears[1];
  const firstCenterLine = Math.atan2(second.cy - first.cy, second.cx - first.cx);
  first.phaseOffset = normalizeAngle(firstCenterLine + (Math.PI / 2));

  for (let index = 1; index < gears.length; index += 1) {
    const previous = gears[index - 1];
    const current = gears[index];
    const centerLineAngle = Math.atan2(current.cy - previous.cy, current.cx - previous.cx);
    const currentToothAngle = (Math.PI * 2) / current.teeth;
    const previousFeature = snapFeaturePhase(getFeaturePhaseAtAngle(previous, centerLineAngle));
    const targetFeature = normalizeCycle(previousFeature + 0.5);
    const oppositeContactAngle = normalizeAngle(centerLineAngle + Math.PI);

    current.phaseOffset = normalizeAngle(
      oppositeContactAngle + (Math.PI / 2) - (targetFeature * currentToothAngle),
    );
  }
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
  gearCards.innerHTML = "";

  state.gears.slice(0, state.global.gearCount).forEach((rawGear, index) => {
    const gear = recalculateGearModel(rawGear);
    state.gears[index] = gear;

    const fragment = gearCardTemplate.content.cloneNode(true);
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
    gearCards.appendChild(fragment);
  });
}

function renderScene() {
  scene.innerHTML = "";

  const defs = makeSVG("defs");
  const gradient = makeSVG("linearGradient", {
    id: "gearFillGradient",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
  });

  gradient.append(
    makeSVG("stop", { offset: "0%", "stop-color": "#3a0909" }),
    makeSVG("stop", { offset: "100%", "stop-color": "#141007" }),
  );
  defs.appendChild(gradient);
  scene.appendChild(defs);

  const viewport = makeSVG("g", {
    transform: `translate(${state.view.panX} ${state.view.panY}) scale(${state.view.zoom})`,
  });

  const grid = makeSVG("g", { class: "stage-grid" });
  for (let x = 0; x <= SCENE_WIDTH; x += 80) {
    grid.appendChild(makeSVG("line", { x1: x, y1: 0, x2: x, y2: SCENE_HEIGHT }));
  }
  for (let y = 0; y <= SCENE_HEIGHT; y += 80) {
    grid.appendChild(makeSVG("line", { x1: 0, y1: y, x2: SCENE_WIDTH, y2: y }));
  }
  viewport.appendChild(grid);

  const activeGears = buildActiveGearModels();
  layoutGears(activeGears);
  computeMeshPhase(activeGears);

  activeGears.forEach((gear, index) => {
    if (index > 0) {
      const previous = activeGears[index - 1];
      viewport.appendChild(
        makeSVG("line", {
          class: "connector-line",
          x1: previous.cx,
          y1: previous.cy,
          x2: gear.cx,
          y2: gear.cy,
        }),
      );
    }
  });

  activeGears.forEach((gear) => {
    const gearGroup = makeSVG("g", {
      class: "gear-instance",
      transform: `translate(${gear.cx} ${gear.cy})`,
    });
    const rotatingElements = makeSVG("g", { class: "gear-rotator" });

    rotatingElements.appendChild(
      makeSVG("path", {
        class: "gear-body",
        d: createGearPath(gear),
      }),
    );

    rotatingElements.appendChild(
      makeSVG("circle", {
        class: "gear-guide",
        r: gear.pitchRadius.toFixed(2),
      }),
    );

    rotatingElements.appendChild(
      makeSVG("circle", {
        class: "gear-guide-base",
        r: gear.baseRadius.toFixed(2),
      }),
    );

    rotatingElements.appendChild(
      makeSVG("circle", {
        class: "gear-guide-outer",
        r: gear.outerRadius.toFixed(2),
      }),
    );

    gearGroup.appendChild(rotatingElements);

    gearGroup.appendChild(
      makeSVG("circle", {
        class: "gear-core",
        r: gear.boreRadius.toFixed(2),
      }),
    );

    gearGroup.appendChild(
      makeSVG("circle", {
        class: "axis-point",
        r: 4,
      }),
    );

    const label = makeSVG("text", {
      x: 0,
      y: gear.outerRadius + 34,
      "text-anchor": "middle",
      fill: "#f3db87",
      "font-size": "15",
      "font-family": "Segoe UI Variable Text, Aptos, sans-serif",
    });
    label.textContent = `${gear.name} | N ${gear.teeth} | P ${gear.diametralPitch.toFixed(4)} | PA ${gear.pressureAngle}°`;
    gearGroup.appendChild(label);

    viewport.appendChild(gearGroup);
  });

  scene.appendChild(viewport);

  const summaryText = `${activeGears.length} engrane${activeGears.length > 1 ? "s" : ""} activo${activeGears.length > 1 ? "s" : ""}`;
  outputs.hudSummary.textContent = summaryText;
  pausedAngles = activeGears.map((gear) => (gear.phaseOffset || 0) * (180 / Math.PI));

  startAnimation(activeGears);
}

function startAnimation(gears) {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  const rotatingGroups = Array.from(scene.querySelectorAll(".gear-rotator"));
  const baseSpeedDeg = (state.global.baseSpeed * 360) / 60;

  if (!state.isPlaying) {
    rotatingGroups.forEach((group, index) => {
      const gear = gears[index];
      const angle = pausedAngles[index] ?? ((gear.phaseOffset || 0) * (180 / Math.PI));
      pausedAngles[index] = angle;
      group.setAttribute("transform", `rotate(${angle.toFixed(2)})`);
    });
    return;
  }

  animationStart = null;

  const animate = (timestamp) => {
    if (!animationStart) {
      animationStart = timestamp;
    }

    const elapsedSeconds = (timestamp - animationStart) / 1000;

    rotatingGroups.forEach((group, index) => {
      const gear = gears[index];
      const direction = index % 2 === 0 ? 1 : -1;
      const ratio = gears[0].teeth / gear.teeth;
      const phaseOffsetDeg = (gear.phaseOffset || 0) * (180 / Math.PI);
      const angle = (elapsedSeconds * baseSpeedDeg * direction * ratio) + phaseOffsetDeg;
      pausedAngles[index] = angle;
      group.setAttribute("transform", `rotate(${angle.toFixed(2)})`);
    });

    animationFrame = requestAnimationFrame(animate);
  };

  animationFrame = requestAnimationFrame(animate);
}

function bindExportControls() {
  downloadFormat.addEventListener("change", (event) => {
    state.export.format = event.target.value;
  });

  downloadButton.addEventListener("click", () => {
    downloadButton.blur();
  });
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
  playToggle.classList.toggle("is-live", state.isPlaying);
  playToggle.classList.toggle("is-paused", !state.isPlaying);
  playToggle.setAttribute("aria-pressed", String(state.isPlaying));
  outputs.playToggleLabel.textContent = state.isPlaying ? "Live" : "Paused";
  outputs.hudStatus.textContent = state.isPlaying ? "Animacion continua" : "Animacion detenida";
}

function bindPlaybackToggle() {
  playToggle.addEventListener("click", () => {
    state.isPlaying = !state.isPlaying;
    updatePlaybackUI();
    renderScene();
  });
}

function updateZoomUI() {
  zoomRange.value = Math.round(state.view.zoom * 100);
  outputs.zoomValue.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function resetView() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  updateZoomUI();
  renderScene();
}

function bindViewportControls() {
  zoomRange.addEventListener("input", (event) => {
    state.view.zoom = Number(event.target.value) / 100;
    updateZoomUI();
    renderScene();
  });

  resetViewButton.addEventListener("click", resetView);

  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  scene.addEventListener("pointerdown", (event) => {
    isPanning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stageFrame.classList.add("is-panning");
    scene.setPointerCapture(event.pointerId);
  });

  scene.addEventListener("pointermove", (event) => {
    if (!isPanning) {
      return;
    }

    const scaleX = SCENE_WIDTH / scene.clientWidth;
    const scaleY = SCENE_HEIGHT / scene.clientHeight;
    const dx = (event.clientX - lastX) * scaleX;
    const dy = (event.clientY - lastY) * scaleY;

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
    stageFrame.classList.remove("is-panning");

    if (event.pointerId !== undefined && scene.hasPointerCapture(event.pointerId)) {
      scene.releasePointerCapture(event.pointerId);
    }
  };

  scene.addEventListener("pointerup", stopPanning);
  scene.addEventListener("pointercancel", stopPanning);
  scene.addEventListener("pointerleave", stopPanning);
}

bindGlobalControls();
bindPlaybackToggle();
bindViewportControls();
bindExportControls();
updatePlaybackUI();
updateZoomUI();
renderGearCards();
renderScene();
