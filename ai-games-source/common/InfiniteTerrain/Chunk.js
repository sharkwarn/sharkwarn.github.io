import { Container, Graphics } from "pixi.js";

function drawFilledPolygon(graphics, shape) {
  if (!shape || !shape.points || shape.points.length < 3) return;
  const { points, color, alpha } = shape;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i].x, points[i].y);
  graphics.lineTo(points[0].x, points[0].y);
  graphics.fill({ color, alpha });
}

function drawFilledBezierBoundary(graphics, boundary, color, alpha) {
  if (!boundary || !boundary.start || !boundary.segments) return;
  graphics.moveTo(boundary.start.x, boundary.start.y);
  for (const segment of boundary.segments) {
    graphics.quadraticCurveTo(segment.cp.x, segment.cp.y, segment.end.x, segment.end.y);
  }
  graphics.lineTo(boundary.start.x, boundary.start.y);
  graphics.fill({ color, alpha });
}

function drawGrassBlade(graphics, blade) {
  graphics.moveTo(blade.start.x, blade.start.y)
    .quadraticCurveTo(blade.control.x, blade.control.y, blade.end.x, blade.end.y)
    .stroke({ color: blade.color, alpha: blade.alpha, width: blade.width, cap: "round", join: "round" });
}

export class Chunk extends Container {
  constructor({ chunkX, chunkY, chunkSize = 256 } = {}) {
    super();
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.chunkSize = chunkSize;
    this.generated = false;
    this.position.set(this.chunkX * this.chunkSize, this.chunkY * this.chunkSize);

    this.backgroundLayer = new Graphics();
    this.grassPatchLayer = new Graphics();
    this.sandLayer = new Graphics();
    this.sandDetailLayer = new Graphics();
    this.sandGrainLayer = new Graphics();
    this.grassBladeLayer = new Graphics();

    this.addChild(this.backgroundLayer, this.grassPatchLayer, this.sandLayer, this.sandDetailLayer, this.sandGrainLayer, this.grassBladeLayer);
  }

  get key() { return `${this.chunkX},${this.chunkY}`; }

  build(terrainData) {
    this.clearLayers();
    this.backgroundLayer.rect(0, 0, this.chunkSize, this.chunkSize).fill({ color: terrainData.backgroundColor, alpha: 1 });

    for (const patch of terrainData.grassPatches) drawFilledPolygon(this.grassPatchLayer, patch);

    for (const region of terrainData.sandRegions) {
      drawFilledBezierBoundary(this.sandLayer, region.boundary, region.color, region.alpha);
      for (const detail of region.details) drawFilledPolygon(this.sandDetailLayer, detail);
      for (const grain of region.grains) this.sandGrainLayer.ellipse(grain.x, grain.y, grain.sizeX, grain.sizeY).fill({ color: grain.color, alpha: grain.alpha });
    }

    for (const blade of terrainData.grassBlades) drawGrassBlade(this.grassBladeLayer, blade);
    this.generated = true;
  }

  clearLayers() {
    this.backgroundLayer.clear();
    this.grassPatchLayer.clear();
    this.sandLayer.clear();
    this.sandDetailLayer.clear();
    this.sandGrainLayer.clear();
    this.grassBladeLayer.clear();
  }
}
