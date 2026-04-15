const {
  clamp,
  recalculateGearModel,
  createGearPath,
  layoutGears,
  getGearBounds,
} = require("./gear-math");
const { escapeXml } = require("../utils/xml");

function buildExportSvg(order) {
  const width = 1400;
  const height = 920;
  const headerHeight = 150;
  const footerHeight = 70;
  const padding = 70;
  const stageWidth = width - (padding * 2);
  const stageHeight = height - headerHeight - footerHeight - (padding * 2);
  const spacing = clamp(Number(order.exportConfig?.global?.spacing) || 6, 0, 32);
  const gears = (order.exportConfig?.gears || []).map((gear) => recalculateGearModel(gear));

  layoutGears(gears, spacing);

  const bounds = getGearBounds(gears);
  const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const zoom = Math.min(stageWidth / contentWidth, stageHeight / contentHeight) * 0.86;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const translateX = (width / 2) - (centerX * zoom);
  const translateY = headerHeight + padding + (stageHeight / 2) - (centerY * zoom);

  const connectorLines = gears.map((gear, index) => {
    if (index === 0) {
      return "";
    }

    const previous = gears[index - 1];
    return `<line x1="${previous.cx.toFixed(2)}" y1="${previous.cy.toFixed(2)}" x2="${gear.cx.toFixed(2)}" y2="${gear.cy.toFixed(2)}" class="connector-line" />`;
  }).join("");

  const gearMarkup = gears.map((gear) => `
    <g transform="translate(${gear.cx.toFixed(2)} ${gear.cy.toFixed(2)})">
      <path class="gear-body" d="${createGearPath(gear)}" />
      <circle class="gear-guide" r="${gear.pitchRadius.toFixed(2)}" />
      <circle class="gear-base" r="${gear.baseRadius.toFixed(2)}" />
      <circle class="gear-outer" r="${gear.outerRadius.toFixed(2)}" />
      <circle class="gear-core" r="${gear.boreRadius.toFixed(2)}" />
      <circle class="axis-point" r="4" />
      <text class="gear-label" x="0" y="${(gear.outerRadius + 34).toFixed(2)}" text-anchor="middle">${escapeXml(gear.name)} | N ${gear.teeth} | P ${gear.diametralPitch.toFixed(4)} | PA ${gear.pressureAngle} deg</text>
    </g>
  `).join("");

  const gridLines = [];
  for (let x = padding; x <= width - padding; x += 80) {
    gridLines.push(`<line class="stage-grid" x1="${x}" y1="${headerHeight}" x2="${x}" y2="${height - footerHeight}" />`);
  }
  for (let y = headerHeight; y <= height - footerHeight; y += 80) {
    gridLines.push(`<line class="stage-grid" x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gearFillGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#12311c" />
      <stop offset="100%" stop-color="#08130c" />
    </linearGradient>
  </defs>
  <style>
    .page-bg { fill: #07110b; }
    .header-rule { stroke: rgba(110,255,164,0.14); stroke-width: 1.4; }
    .stage-grid { stroke: rgba(110,255,164,0.06); stroke-width: 1; }
    .connector-line { stroke: rgba(255,255,255,0.18); stroke-width: 1.6; }
    .gear-body { fill: url(#gearFillGradient); stroke: #6cffb5; stroke-width: 2; }
    .gear-guide { fill: none; stroke: rgba(29,185,84,0.34); stroke-width: 1.5; stroke-dasharray: 10 10; }
    .gear-base { fill: none; stroke: rgba(115,224,194,0.22); stroke-width: 1.2; stroke-dasharray: 6 8; }
    .gear-outer { fill: none; stroke: rgba(255,255,255,0.18); stroke-width: 1.2; stroke-dasharray: 3 6; }
    .gear-core { fill: rgba(9,18,12,0.92); stroke: rgba(255,255,255,0.14); }
    .axis-point { fill: #1db954; }
    .title { fill: #f4fff7; font-size: 36px; font-weight: 700; font-family: Arial, sans-serif; }
    .meta { fill: #a9c8b3; font-size: 16px; font-family: Arial, sans-serif; }
    .summary { fill: #d7ffe6; font-size: 18px; font-family: Arial, sans-serif; }
    .gear-label { fill: #d7ffe6; font-size: 15px; font-family: Arial, sans-serif; }
  </style>
  <rect class="page-bg" width="100%" height="100%" rx="28" />
  <text class="title" x="${padding}" y="58">Gear Studio Export</text>
  <text class="meta" x="${padding}" y="88">Order ID: ${escapeXml(order.id)}</text>
  <text class="meta" x="${padding}" y="112">Created At: ${escapeXml(order.createdAt)}</text>
  <text class="summary" x="${width - padding}" y="88" text-anchor="end">Gears: ${gears.length}</text>
  <text class="summary" x="${width - padding}" y="112" text-anchor="end">Base Speed: ${escapeXml(order.exportConfig?.global?.baseSpeed ?? "-")} rpm | Spacing: ${escapeXml(order.exportConfig?.global?.spacing ?? "-")}</text>
  <line class="header-rule" x1="${padding}" y1="${headerHeight - 16}" x2="${width - padding}" y2="${headerHeight - 16}" />
  ${gridLines.join("")}
  <g transform="translate(${translateX.toFixed(2)} ${translateY.toFixed(2)}) scale(${zoom.toFixed(4)})">
    ${connectorLines}
    ${gearMarkup}
  </g>
</svg>`;
}

module.exports = { buildExportSvg };
