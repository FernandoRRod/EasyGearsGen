function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, digits = 2) {
  return Number(value.toFixed(digits));
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
  const boreRadius = Math.max(Math.min(rootRadius - 6, rootRadius * (boreRatio / 100)), 6);

  return {
    ...source,
    name: source.name || "Engrane",
    teeth,
    pitchDiameter: roundTo(pitchDiameter),
    diametralPitch: roundTo(diametralPitch, 4),
    pressureAngle: roundTo(pressureAngle),
    boreRatio: roundTo(boreRatio),
    pitchRadius,
    outerRadius,
    rootRadius,
    baseRadius,
    boreRadius,
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

  return `${points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(" ")} Z`;
}

function layoutGears(gears, spacing, centerY = 0) {
  const totalWidth = gears.reduce((sum, gear) => sum + (gear.pitchRadius * 2), 0)
    + Math.max(gears.length - 1, 0) * spacing;
  const startX = -(totalWidth / 2);
  let currentX = startX;

  gears.forEach((gear, index) => {
    currentX += gear.pitchRadius;
    gear.cx = currentX;
    gear.cy = centerY + (index % 2 === 0 ? -24 : 24);
    currentX += gear.pitchRadius + spacing;
  });
}

function getGearBounds(gears) {
  return gears.reduce((bounds, gear) => ({
    minX: Math.min(bounds.minX, gear.cx - gear.outerRadius),
    maxX: Math.max(bounds.maxX, gear.cx + gear.outerRadius),
    minY: Math.min(bounds.minY, gear.cy - gear.outerRadius),
    maxY: Math.max(bounds.maxY, gear.cy + gear.outerRadius),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
}

module.exports = {
  clamp,
  roundTo,
  polarToCartesian,
  sampleArc,
  involuteValue,
  pressureAngleAtRadius,
  recalculateGearModel,
  createGearPath,
  layoutGears,
  getGearBounds,
};
