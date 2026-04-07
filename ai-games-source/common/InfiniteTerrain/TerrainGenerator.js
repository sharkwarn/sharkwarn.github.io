import { SimplexNoise } from "./SimplexNoise.js";

const COLORS = {
  grass: {
    main: '#7CCD73',
    patchLight: '#97E086',
    patchDark: '#5EAF56',
    patchHighlight: '#C1F2B8',
    bladeDark: '#4A983F',
    bladeLight: '#8EDC84',
    bladeHighlight: '#D3F8CB',
  },
  sand: {
    light: '#F5DEB3',
    main: '#E8C68A',
    dark: '#D4A574',
  },
  sandGrain: ['#F5DEB3', '#D4A574', '#F0E68C', '#DAA520'],
};

const FLATTEN_RATIO = 0.4;
const TAU = Math.PI * 2;
const TERRAIN_RATIO_TARGETS = {
  sand: 0.10,
  grassOverlay: 0.30,
  background: 0.60,
};
const TERRAIN_RATIO_RANGE = {
  sand: { min: 0.07, max: 0.13 },
  grassOverlay: { min: 0.27, max: 0.33 },
  background: { min: 0.57, max: 0.63 },
};
const TERRAIN_RATIO_JITTER = 0.03;

function hashToUnit(seed, x, y) {
  let h = seed >>> 0;
  h ^= (x * 374761393) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h ^= (y * 668265263) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h >>> 0) / 0xffffffff;
}

function colorToHex(color) {
  if (typeof color === 'string') {
    return parseInt(color.replace('#', ''), 16);
  }
  return color;
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pointInPolygon(x, y, polygonPoints) {
  let inside = false;
  const total = polygonPoints.length;
  for (let i = 0, j = total - 1; i < total; j = i, i += 1) {
    const xi = polygonPoints[i].x;
    const yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x;
    const yj = polygonPoints[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function sampleQuadraticPoint(start, control, end, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
}

export class TerrainGenerator {
  constructor({ seed = 20260407, chunkSize = 256 } = {}) {
    this.seed = seed >>> 0;
    this.chunkSize = chunkSize;
    this.noise = new SimplexNoise(this.seed);
  }

  randomUnit(seedOffset, x, y) {
    const fx = Math.floor(x * 64);
    const fy = Math.floor(y * 64);
    const h = hashToUnit(this.seed + seedOffset, fx, fy);
    const n = this.noise.noise2D(
      (x + seedOffset * 0.37) * 0.019,
      (y - seedOffset * 0.61) * 0.019
    );
    const n01 = clamp01((n + 1) * 0.5);
    return clamp01(h * 0.62 + n01 * 0.38);
  }

  buildBezierBoundary(controlPoints, worldX, worldY, seedOffset, size) {
    const total = controlPoints.length;
    const first = controlPoints[0];
    const last = controlPoints[total - 1];
    const start = { x: (last.x + first.x) * 0.5, y: (last.y + first.y) * 0.5 };
    const segments = [];

    for (let i = 0; i < total; i += 1) {
      const current = controlPoints[i];
      const next = controlPoints[(i + 1) % total];
      const controlX = (current.x + next.x) * 0.5
        + (this.randomUnit(seedOffset + i * 11, worldX, worldY) - 0.5) * size * 0.2;
      const controlY = (current.y + next.y) * 0.5
        + (this.randomUnit(seedOffset + i * 13 + 1, worldX, worldY) - 0.5) * size * 0.2 * FLATTEN_RATIO;

      segments.push({
        cp: { x: controlX, y: controlY },
        end: { x: (current.x + next.x) * 0.5, y: (current.y + next.y) * 0.5 },
      });
    }

    const sampledPoints = this.sampleBoundaryPoints(start, segments, 10);
    const bounds = this.computeBounds(sampledPoints);
    return { start, segments, sampledPoints, bounds };
  }

  sampleBoundaryPoints(start, segments, subdivisions = 10) {
    const sampled = [{ x: start.x, y: start.y }];
    let cursor = start;
    for (const segment of segments) {
      for (let i = 1; i <= subdivisions; i += 1) {
        const t = i / subdivisions;
        sampled.push(sampleQuadraticPoint(cursor, segment.cp, segment.end, t));
      }
      cursor = segment.end;
    }
    return sampled;
  }

  computeBounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    return { minX, minY, maxX, maxY };
  }

  isPointInBezierBoundary(x, y, boundary) {
    const { bounds, sampledPoints } = boundary;
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return false;
    return pointInPolygon(x, y, sampledPoints);
  }

  isPointInAnySandRegion(x, y, sandRegions) {
    for (const region of sandRegions) {
      if (this.isPointInBezierBoundary(x, y, region.boundary)) return true;
    }
    return false;
  }

  isPointSafeForGrassPatch(x, y, radius, sandRegions) {
    if (this.isPointInAnySandRegion(x, y, sandRegions)) return false;
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius * FLATTEN_RATIO;
      if (this.isPointInAnySandRegion(px, py, sandRegions)) return false;
    }
    return true;
  }

  isBladeSafe(pointA, pointB, pointC, sandRegions) {
    return !this.isPointInAnySandRegion(pointA.x, pointA.y, sandRegions)
      && !this.isPointInAnySandRegion(pointB.x, pointB.y, sandRegions)
      && !this.isPointInAnySandRegion(pointC.x, pointC.y, sandRegions);
  }

  generateChunk(chunkX, chunkY) {
    const worldChunkX = chunkX * this.chunkSize;
    const worldChunkY = chunkY * this.chunkSize;
    const coverageProfile = this.generateCoverageProfile(worldChunkX, worldChunkY);

    const backgroundColor = colorToHex(COLORS.grass.main);
    const sandRegions = this.generateSandRegions(worldChunkX, worldChunkY, coverageProfile);
    const grassPatches = this.generateGrassPatches(worldChunkX, worldChunkY, sandRegions, coverageProfile);
    const grassBlades = this.generateGrassBlades(worldChunkX, worldChunkY, sandRegions, coverageProfile);

    return { backgroundColor, sandRegions, grassPatches, grassBlades, coverageProfile };
  }

  generateCoverageProfile(worldChunkX, worldChunkY) {
    const sand = this.sampleCoverageRatio(TERRAIN_RATIO_TARGETS.sand, TERRAIN_RATIO_RANGE.sand, worldChunkX, worldChunkY, 12001);
    const grassOverlay = this.sampleCoverageRatio(TERRAIN_RATIO_TARGETS.grassOverlay, TERRAIN_RATIO_RANGE.grassOverlay, worldChunkX, worldChunkY, 12021);
    let background = 1 - sand - grassOverlay;

    if (background < TERRAIN_RATIO_RANGE.background.min) {
      const missing = TERRAIN_RATIO_RANGE.background.min - background;
      const reduceGrass = Math.min(missing, grassOverlay - TERRAIN_RATIO_RANGE.grassOverlay.min);
      const reduceSand = Math.min(missing - reduceGrass, sand - TERRAIN_RATIO_RANGE.sand.min);
      background += reduceGrass + reduceSand;
      return { sandRatio: sand - reduceSand, grassOverlayRatio: grassOverlay - reduceGrass, backgroundRatio: background };
    }

    if (background > TERRAIN_RATIO_RANGE.background.max) {
      const excess = background - TERRAIN_RATIO_RANGE.background.max;
      const increaseGrass = Math.min(excess, TERRAIN_RATIO_RANGE.grassOverlay.max - grassOverlay);
      const increaseSand = Math.min(excess - increaseGrass, TERRAIN_RATIO_RANGE.sand.max - sand);
      background -= increaseGrass + increaseSand;
      return { sandRatio: sand + increaseSand, grassOverlayRatio: grassOverlay + increaseGrass, backgroundRatio: background };
    }

    return { sandRatio: sand, grassOverlayRatio: grassOverlay, backgroundRatio: background };
  }

  sampleCoverageRatio(baseRatio, range, worldChunkX, worldChunkY, seedOffset) {
    const chunkCoordX = Math.floor(worldChunkX / this.chunkSize);
    const chunkCoordY = Math.floor(worldChunkY / this.chunkSize);
    const hashValue = hashToUnit(this.seed + seedOffset, chunkCoordX, chunkCoordY);
    const noiseValue = this.noise.noise2D((chunkCoordX + seedOffset * 0.17) * 0.43, (chunkCoordY - seedOffset * 0.29) * 0.43);
    const mixed = clamp01(hashValue * 0.57 + ((noiseValue + 1) * 0.5) * 0.43);
    const jitter = (mixed - 0.5) * 2 * TERRAIN_RATIO_JITTER;
    return Math.min(range.max, Math.max(range.min, baseRatio + jitter));
  }

  generateSandRegions(worldChunkX, worldChunkY, coverageProfile) {
    void coverageProfile;
    const regions = [];
    const sandCount = 1;
    const minRegionSize = 100;
    const maxRegionSize = 160;

    for (let i = 0; i < sandCount; i += 1) {
      const localX = this.randomUnit(i * 7 + 1, worldChunkX, worldChunkY) * this.chunkSize;
      const localY = this.randomUnit(i * 11 + 2, worldChunkX, worldChunkY) * this.chunkSize;
      const worldX = worldChunkX + localX;
      const worldY = worldChunkY + localY;
      const size = minRegionSize + this.randomUnit(i * 13 + 3, worldX, worldY) * (maxRegionSize - minRegionSize);
      const pointCount = Math.floor(this.randomUnit(i * 17 + 4, worldX, worldY) * 3) + 6;

      const controlPoints = [];
      for (let j = 0; j < pointCount; j += 1) {
        const angle = (j / pointCount) * TAU;
        const radius = size * (0.5 + this.randomUnit(i * 19 + j * 7 + 5, worldX, worldY) * 0.5);
        controlPoints.push({ x: localX + Math.cos(angle) * radius, y: localY + Math.sin(angle) * radius * FLATTEN_RATIO });
      }

      const boundary = this.buildBezierBoundary(controlPoints, worldX, worldY, i * 23 + 100, size);
      const details = this.generateSandDetails(controlPoints, size, worldX, worldY, i);
      const grains = this.generateSandGrains(boundary, size, worldX, worldY, i);

      regions.push({ boundary, color: colorToHex(COLORS.sand.main), alpha: 1, details, grains });
    }
    return regions;
  }

  generateSandDetails(controlPoints, size, worldX, worldY, regionIndex) {
    const details = [];
    let centerX = 0, centerY = 0;
    for (const point of controlPoints) { centerX += point.x; centerY += point.y; }
    centerX /= controlPoints.length;
    centerY /= controlPoints.length;

    for (let i = 0; i < 3; i += 1) {
      const patch = this.generateDetailPatch(centerX, centerY, size, 40, 80, worldX, worldY, regionIndex * 500 + i * 31 + 101);
      patch.color = colorToHex(COLORS.sand.light);
      patch.alpha = 0.4;
      details.push(patch);
    }

    for (let i = 0; i < 4; i += 1) {
      const patch = this.generateDetailPatch(centerX, centerY, size, 30, 60, worldX, worldY, regionIndex * 700 + i * 37 + 201);
      patch.color = colorToHex(COLORS.sand.dark);
      patch.alpha = 0.3;
      details.push(patch);
    }
    return details;
  }

  generateDetailPatch(centerX, centerY, regionSize, minSize, maxSize, worldX, worldY, seedOffset) {
    const angle = this.randomUnit(seedOffset, worldX, worldY) * TAU;
    const dist = this.randomUnit(seedOffset + 1, worldX, worldY) * regionSize * 0.4;
    const x = centerX + Math.cos(angle) * dist;
    const y = centerY + Math.sin(angle) * dist * FLATTEN_RATIO;
    const size = minSize + this.randomUnit(seedOffset + 2, worldX, worldY) * (maxSize - minSize);
    const pointCount = 5 + Math.floor(this.randomUnit(seedOffset + 3, worldX, worldY) * 3);
    return { points: this.generateOrganicShape(x, y, size, pointCount, seedOffset + 5000), size };
  }

  generateSandGrains(boundary, size, worldX, worldY, regionIndex) {
    const grains = [];
    const grainCount = Math.floor(size * 2);
    const { minX, minY, maxX, maxY } = boundary.bounds;
    let attempts = 0;
    const maxAttempts = grainCount * 12;

    while (grains.length < grainCount && attempts < maxAttempts) {
      const gx = minX + this.randomUnit(regionIndex * 1000 + attempts * 5 + 301, worldX, worldY) * (maxX - minX);
      const gy = minY + this.randomUnit(regionIndex * 1000 + attempts * 7 + 302, worldX, worldY) * (maxY - minY);
      attempts += 1;
      if (!this.isPointInBezierBoundary(gx, gy, boundary)) continue;

      const colorIndex = Math.floor(this.randomUnit(regionIndex * 1000 + attempts * 11 + 303, worldX, worldY) * COLORS.sandGrain.length) % COLORS.sandGrain.length;
      const sizeBase = 1 + this.randomUnit(regionIndex * 1000 + attempts * 13 + 304, worldX, worldY) * 3;
      grains.push({ x: gx, y: gy, sizeX: sizeBase, sizeY: sizeBase * FLATTEN_RATIO, color: colorToHex(COLORS.sandGrain[colorIndex]), alpha: 0.3 + this.randomUnit(regionIndex * 1000 + attempts * 17 + 305, worldX, worldY) * 0.4 });
    }
    return grains;
  }

  generateGrassPatches(worldChunkX, worldChunkY, sandRegions, coverageProfile) {
    const patches = [];
    const countScale = coverageProfile.grassOverlayRatio / TERRAIN_RATIO_TARGETS.grassOverlay;

    this.generatePatchGroup({ target: patches, count: Math.max(1, Math.round(45 * countScale)), minSize: 34, maxSize: 90, alpha: 0.58, color: colorToHex(COLORS.grass.patchLight), seedOffset: 4001, worldChunkX, worldChunkY, sandRegions });
    this.generatePatchGroup({ target: patches, count: Math.max(1, Math.round(40 * countScale)), minSize: 30, maxSize: 78, alpha: 0.53, color: colorToHex(COLORS.grass.patchDark), seedOffset: 5001, worldChunkX, worldChunkY, sandRegions });
    this.generatePatchGroup({ target: patches, count: Math.max(1, Math.round(32 * countScale)), minSize: 24, maxSize: 58, alpha: 0.66, color: colorToHex(COLORS.grass.patchHighlight), seedOffset: 6001, worldChunkX, worldChunkY, sandRegions });

    return patches;
  }

  generatePatchGroup({ target, count, minSize, maxSize, alpha, color, seedOffset, worldChunkX, worldChunkY, sandRegions }) {
    let generated = 0;
    let attempts = 0;
    const maxAttempts = count * 60;

    while (generated < count && attempts < maxAttempts) {
      const x = this.randomUnit(seedOffset + attempts * 3, worldChunkX, worldChunkY) * this.chunkSize;
      const y = this.randomUnit(seedOffset + attempts * 3 + 1, worldChunkX, worldChunkY) * this.chunkSize;
      const size = minSize + this.randomUnit(seedOffset + attempts * 3 + 2, worldChunkX, worldChunkY) * (maxSize - minSize);
      attempts += 1;
      if (!this.isPointSafeForGrassPatch(x, y, size * 0.55, sandRegions)) continue;

      const pointCount = 5 + Math.floor(this.randomUnit(seedOffset + attempts * 5 + 7, worldChunkX, worldChunkY) * 3);
      target.push({ points: this.generateOrganicShape(x, y, size, pointCount, seedOffset + attempts * 17), color, alpha });
      generated += 1;
    }
  }

  generateGrassBlades(worldChunkX, worldChunkY, sandRegions, coverageProfile) {
    const blades = [];
    const countScale = coverageProfile.grassOverlayRatio / TERRAIN_RATIO_TARGETS.grassOverlay;

    this.generateBladeGroup({ target: blades, count: Math.max(1, Math.round(600 * countScale)), minLength: 5, maxLength: 10, minWidth: 0.8, maxWidth: 1.5, color: colorToHex(COLORS.grass.bladeDark), alpha: 0.42, seedOffset: 7001, worldChunkX, worldChunkY, sandRegions });
    this.generateBladeGroup({ target: blades, count: Math.max(1, Math.round(450 * countScale)), minLength: 4, maxLength: 9, minWidth: 0.7, maxWidth: 1.3, color: colorToHex(COLORS.grass.bladeLight), alpha: 0.38, seedOffset: 8001, worldChunkX, worldChunkY, sandRegions });
    this.generateBladeGroup({ target: blades, count: Math.max(1, Math.round(300 * countScale)), minLength: 3, maxLength: 7, minWidth: 0.6, maxWidth: 1.1, color: colorToHex(COLORS.grass.bladeHighlight), alpha: 0.46, seedOffset: 9001, worldChunkX, worldChunkY, sandRegions });

    return blades;
  }

  generateBladeGroup({ target, count, minLength, maxLength, minWidth, maxWidth, color, alpha, seedOffset, worldChunkX, worldChunkY, sandRegions }) {
    let generated = 0;
    let attempts = 0;
    const maxAttempts = count * 30;

    while (generated < count && attempts < maxAttempts) {
      const baseX = this.randomUnit(seedOffset + attempts * 7 + 1, worldChunkX, worldChunkY) * this.chunkSize;
      const baseY = this.randomUnit(seedOffset + attempts * 7 + 2, worldChunkX, worldChunkY) * this.chunkSize;
      const length = minLength + this.randomUnit(seedOffset + attempts * 7 + 3, worldChunkX, worldChunkY) * (maxLength - minLength);
      const width = minWidth + this.randomUnit(seedOffset + attempts * 7 + 4, worldChunkX, worldChunkY) * (maxWidth - minWidth);
      const angle = this.randomUnit(seedOffset + attempts * 7 + 5, worldChunkX, worldChunkY) * TAU;
      const curve = (this.randomUnit(seedOffset + attempts * 7 + 6, worldChunkX, worldChunkY) - 0.5) * length * 0.5;
      attempts += 1;

      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle) * FLATTEN_RATIO;
      const sideX = -Math.sin(angle);
      const sideY = Math.cos(angle) * FLATTEN_RATIO;

      const pointA = { x: baseX, y: baseY };
      const pointB = { x: baseX + dirX * length * 0.55 + sideX * curve, y: baseY + dirY * length * 0.55 + sideY * curve };
      const pointC = { x: baseX + dirX * length, y: baseY + dirY * length };

      if (!this.isBladeSafe(pointA, pointB, pointC, sandRegions)) continue;

      target.push({ start: pointA, control: pointB, end: pointC, width, color, alpha });
      generated += 1;
    }
  }

  generateOrganicShape(centerX, centerY, size, pointCount, seedOffset = 2001) {
    const points = [];
    for (let i = 0; i < pointCount; i += 1) {
      const angle = (i / pointCount) * TAU;
      const radiusNoise = 0.5 + this.randomUnit(seedOffset + i * 19, centerX, centerY) * 0.5;
      const radius = size * 0.5 * radiusNoise;
      points.push({ x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius * FLATTEN_RATIO });
    }
    return points;
  }
}