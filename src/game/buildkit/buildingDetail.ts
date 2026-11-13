/**
 * Building detail layer (shared, no per-building state): the quality tier that decides whether the additive trim
 * geometry is built, the uniforms the kit's wear shader reads for weather response (wet runs, roof snow, eave rime),
 * and the lit-window atlas (a lamp-lit room seen from outside: ceiling bounce, drawn curtains, a figure, a shelf).
 *
 * Geometry lives in `detailTrim.ts` and is merged into the building's existing layer x material meshes (no new draw
 * calls); the shader work is gated by `uBd.x`, which is 0 on the Low tier.
 */
import * as THREE from 'three';

export type DetailTier = 'low' | 'medium' | 'high';

let _tier: DetailTier = 'high';
/** Set by the world with the quality tier; buildings built afterwards follow it (Low builds no trim geometry). */
export function setDetailTier(t: DetailTier): void { _tier = t; BLDG.uBd.value.x = t === 'low' ? 0 : 1; }
export function detailTier(): DetailTier { return _tier; }
/** Trim geometry is built on Medium and High. */
export function detailGeometryOn(): boolean { return _tier !== 'low'; }

/**
 * Weather as the kit's wear shader sees it, written once a frame by the atmosphere:
 *   uBd = (detail 0 | 1, rain wetness 0-1, roof snow 0-1, rime 0-1)
 *   uIce = (snow depth scale 0-1, 0, 0, 0): the roof snow slabs rise with the snow.
 */
export const BLDG = {
  uBd: { value: new THREE.Vector4(1, 0, 0, 0) },
  uIce: { value: new THREE.Vector4(0, 0, 0, 0) },
};

/**
 * The winter roof (`bldg_roof_snow`: snow slabs and icicles) is a mesh of its own; it is shown only while snow lies (the
 * atmosphere flips this and every building's snow mesh), so a summer scene counts and draws nothing for it.
 */
export const WINTER = { on: false };
export const SNOW_MESH = 'bldg_roof_snow';

/** Write this frame's weather. */
export function setBuildingWeather(rain: number, snow: number, rime: number): void {
  const v = BLDG.uBd.value;
  v.y = Math.max(0, Math.min(1, rain)); v.z = Math.max(0, Math.min(1, snow)); v.w = Math.max(0, Math.min(1, rime));
  BLDG.uIce.value.x = v.z;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Four rooms seen through a lit window, 2 x 2 cells of 128 px: (0, 0) plain ceiling bounce, (1, 0) a curtain half drawn,
 * (0, 1) someone standing, (1, 1) a pendant lamp over a shelf. White is full glow; the dark parts are what stands
 * between the lamp and the glass.
 */
export function paintGlowAtlas(): HTMLCanvasElement {
  const N = 256, C = 128;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const r = lcg(41);
  const cell = (cx: number, cy: number, draw: (g: CanvasRenderingContext2D, w: number) => void) => {
    g.save(); g.translate(cx * C, cy * C); g.beginPath(); g.rect(0, 0, C, C); g.clip();
    // the room: bright under the ceiling, falling off toward the sill and the corners
    const v = g.createLinearGradient(0, 0, 0, C); v.addColorStop(0, 'rgb(255,240,214)'); v.addColorStop(0.55, 'rgb(214,176,128)'); v.addColorStop(1, 'rgb(120,86,56)');
    g.fillStyle = v; g.fillRect(0, 0, C, C);
    const h = g.createRadialGradient(C / 2, C * 0.2, C * 0.1, C / 2, C * 0.45, C * 0.78); h.addColorStop(0, 'rgba(255,255,255,0.35)'); h.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = h; g.fillRect(0, 0, C, C);
    draw(g, C);
    g.restore();
  };
  cell(0, 0, () => { /* plain */ });
  cell(1, 0, (q, w) => {
    // a curtain drawn over the left half: vertical folds, a rod across the top
    for (let x = 0; x < w * 0.52; x += 5) { const t = 0.28 + 0.34 * Math.abs(Math.sin(x * 0.55)); q.fillStyle = `rgba(${Math.round(70 * t)},${Math.round(36 * t)},${Math.round(24 * t)},0.93)`; q.fillRect(x, 0, 5, w); }
    q.fillStyle = 'rgba(20,12,8,0.9)'; q.fillRect(0, 0, w, 7);
    q.fillStyle = 'rgba(20,12,8,0.8)'; for (const x of [w * 0.52, w * 0.52 + 4]) q.fillRect(x, 0, 3, w);
  });
  cell(0, 1, (q, w) => {
    // a figure standing back from the glass: head, shoulders, body
    q.fillStyle = 'rgba(14,9,6,0.92)';
    const x = w * (0.36 + r() * 0.1);
    q.beginPath(); q.arc(x, w * 0.36, w * 0.075, 0, Math.PI * 2); q.fill();
    q.beginPath(); q.moveTo(x - w * 0.17, w); q.quadraticCurveTo(x - w * 0.18, w * 0.5, x, w * 0.46); q.quadraticCurveTo(x + w * 0.18, w * 0.5, x + w * 0.17, w); q.closePath(); q.fill();
  });
  cell(1, 1, (q, w) => {
    // a pendant lamp (hot core), a shelf of jars across the lower third, a plant on the sill
    const l = q.createRadialGradient(w * 0.5, w * 0.22, 2, w * 0.5, w * 0.22, w * 0.5); l.addColorStop(0, 'rgba(255,255,235,1)'); l.addColorStop(1, 'rgba(255,200,120,0)');
    q.fillStyle = l; q.fillRect(0, 0, w, w);
    q.fillStyle = 'rgba(18,11,7,0.9)'; q.fillRect(0, w * 0.62, w, 6);
    for (let x = 6; x < w - 8; x += 12 + r() * 8) { const hh = 10 + r() * 14; q.fillRect(x, w * 0.62 - hh, 7 + r() * 5, hh); }
    q.beginPath(); q.ellipse(w * 0.8, w * 0.93, w * 0.1, w * 0.09, 0, 0, Math.PI * 2); q.fill();
  });
  // the sash: a dark cross where the muntins stand (the frame is drawn in front; this keeps the glow off the bars)
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (const cx of [0, 1]) for (const cy of [0, 1]) { g.fillRect(cx * C + C / 2 - 1.5, cy * C, 3, C); g.fillRect(cx * C, cy * C + C / 2 - 1.5, C, 3); }
  return c;
}

let _atlas: THREE.CanvasTexture | null = null;
export function glowAtlas(): THREE.CanvasTexture {
  if (_atlas) return _atlas;
  _atlas = new THREE.CanvasTexture(paintGlowAtlas());
  _atlas.colorSpace = THREE.SRGBColorSpace;
  _atlas.anisotropy = 2;
  return _atlas;
}

/** Which of the four rooms a window shows (stable for a place, so a window never changes its room). */
export function roomCell(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return Math.floor((s - Math.floor(s)) * 4) & 3;
}
