import { SVG_NS, SCENE_WIDTH, SCENE_HEIGHT, state, elements, outputs } from "./state.js";
import {
  createGearPath,
  recalculateGearModel,
  layoutGears,
  computeMeshPhase,
  getGearBounds,
  clamp,
} from "./gear-math.js";

let animationFrame = null;
let animationStart = null;
let pausedAngles = [];

function makeSVG(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function buildActiveGearModels() {
  return state.gears
    .slice(0, state.global.gearCount)
    .map((gear, index) => ({ ...recalculateGearModel(gear), index }));
}

export function updateZoomUI() {
  elements.zoomRange.value = Math.round(state.view.zoom * 100);
  outputs.zoomValue.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

export function fitViewToGears(gears) {
  const bounds = getGearBounds(gears, SCENE_WIDTH, SCENE_HEIGHT);
  const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const padding = 64;
  const availableWidth = SCENE_WIDTH - (padding * 2);
  const availableHeight = SCENE_HEIGHT - (padding * 2);
  const zoom = clamp(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
    0.6,
    1.75,
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  state.view.zoom = zoom;
  state.view.panX = (SCENE_WIDTH / 2) - (centerX * zoom);
  state.view.panY = (SCENE_HEIGHT / 2) - (centerY * zoom);
}

function startAnimation(gears) {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  const rotatingGroups = Array.from(elements.scene.querySelectorAll(".gear-rotator"));
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

export function renderScene() {
  elements.scene.innerHTML = "";

  const defs = makeSVG("defs");
  const gradient = makeSVG("linearGradient", {
    id: "gearFillGradient",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
  });

  gradient.append(
    makeSVG("stop", { offset: "0%", "stop-color": "#12311c" }),
    makeSVG("stop", { offset: "100%", "stop-color": "#08130c" }),
  );
  defs.appendChild(gradient);
  elements.scene.appendChild(defs);

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
  layoutGears(activeGears, state.global.spacing, SCENE_WIDTH, SCENE_HEIGHT);
  computeMeshPhase(activeGears);

  if (state.view.autoFit) {
    fitViewToGears(activeGears);
    updateZoomUI();
    viewport.setAttribute(
      "transform",
      `translate(${state.view.panX} ${state.view.panY}) scale(${state.view.zoom})`,
    );
  }

  activeGears.forEach((gear, index) => {
    if (index > 0) {
      const previous = activeGears[index - 1];
      viewport.appendChild(makeSVG("line", {
        class: "connector-line",
        x1: previous.cx,
        y1: previous.cy,
        x2: gear.cx,
        y2: gear.cy,
      }));
    }
  });

  activeGears.forEach((gear) => {
    const gearGroup = makeSVG("g", {
      class: "gear-instance",
      transform: `translate(${gear.cx} ${gear.cy})`,
    });
    const rotatingElements = makeSVG("g", { class: "gear-rotator" });

    rotatingElements.appendChild(makeSVG("path", {
      class: "gear-body",
      d: createGearPath(gear),
    }));
    rotatingElements.appendChild(makeSVG("circle", {
      class: "gear-guide",
      r: gear.pitchRadius.toFixed(2),
    }));
    rotatingElements.appendChild(makeSVG("circle", {
      class: "gear-guide-base",
      r: gear.baseRadius.toFixed(2),
    }));
    rotatingElements.appendChild(makeSVG("circle", {
      class: "gear-guide-outer",
      r: gear.outerRadius.toFixed(2),
    }));

    gearGroup.appendChild(rotatingElements);
    gearGroup.appendChild(makeSVG("circle", {
      class: "gear-core",
      r: gear.boreRadius.toFixed(2),
    }));
    gearGroup.appendChild(makeSVG("circle", {
      class: "axis-point",
      r: 4,
    }));

    const label = makeSVG("text", {
      x: 0,
      y: gear.outerRadius + 34,
      "text-anchor": "middle",
      fill: "#d7ffe6",
      "font-size": "15",
      "font-family": "Segoe UI Variable Text, Aptos, sans-serif",
    });
    label.textContent = `${gear.name} | N ${gear.teeth} | P ${gear.diametralPitch.toFixed(4)} | PA ${gear.pressureAngle} deg`;
    gearGroup.appendChild(label);

    viewport.appendChild(gearGroup);
  });

  elements.scene.appendChild(viewport);

  const summaryText = `${activeGears.length} engrane${activeGears.length > 1 ? "s" : ""} activo${activeGears.length > 1 ? "s" : ""}`;
  outputs.hudSummary.textContent = summaryText;
  pausedAngles = activeGears.map((gear) => (gear.phaseOffset || 0) * (180 / Math.PI));

  startAnimation(activeGears);
}
