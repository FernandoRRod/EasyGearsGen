export const SVG_NS = "http://www.w3.org/2000/svg";
export const SCENE_WIDTH = 1200;
export const SCENE_HEIGHT = 760;

export const elements = {
  scene: document.getElementById("gearScene"),
  gearCards: document.getElementById("gearCards"),
  gearCardTemplate: document.getElementById("gearCardTemplate"),
  playToggle: document.getElementById("playToggle"),
  zoomRange: document.getElementById("zoomRange"),
  resetViewButton: document.getElementById("resetView"),
  stageFrame: document.querySelector(".stage-frame"),
  downloadButton: document.getElementById("downloadButton"),
  downloadFormat: document.getElementById("downloadFormat"),
  apiBaseMeta: document.querySelector('meta[name="gear-api-base"]'),
};

export const controls = {
  gearCount: document.getElementById("gearCount"),
  baseSpeed: document.getElementById("baseSpeed"),
  spacing: document.getElementById("spacing"),
};

export const outputs = {
  baseSpeed: document.getElementById("baseSpeedValue"),
  spacing: document.getElementById("spacingValue"),
  hudSummary: document.getElementById("hudSummary"),
  hudStatus: document.getElementById("hudStatus"),
  playToggleLabel: document.getElementById("playToggleLabel"),
  zoomValue: document.getElementById("zoomValue"),
};

export const state = {
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
    autoFit: true,
  },
  export: {
    format: "svg",
    busy: false,
    paymentMode: "demo",
  },
  gears: [
    { name: "Engrane A", teeth: 18, pitchDiameter: 120, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 26 },
    { name: "Engrane B", teeth: 28, pitchDiameter: 186.67, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 24 },
    { name: "Engrane C", teeth: 14, pitchDiameter: 93.33, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 30 },
    { name: "Engrane D", teeth: 22, pitchDiameter: 146.67, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 22 },
    { name: "Engrane E", teeth: 34, pitchDiameter: 226.67, diametralPitch: 0.15, pressureAngle: 20, boreRatio: 20 },
  ],
};

export function getApiBaseUrl() {
  return (window.GEAR_API_BASE_URL || elements.apiBaseMeta?.content || "").replace(/\/$/, "");
}
