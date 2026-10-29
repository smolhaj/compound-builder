/**
 * The control room's screens, drawn live and cheap (procedural art only).
 *
 * One 1024 × 512 canvas atlas is the emissive map of one shared material
 * ('screens'), so every monitor in every room is part of one merged mesh per
 * room, not a draw call each, and the screens "glow" in the dark bunker. The
 * painter turns `securityFeeds(game)` (sim/bunkerLife.ts) into pixels: four
 * camera tiles (house, gardens, solar, gate: night-vision green or white-hot
 * thermal, a scanline, a clock, a REC dot, MOTION when a drive sensor trips),
 * a radar with a sweep and the contacts at the gate, a weather panel with the
 * storm warning, the radio's last lines, a laptop with the gear it is
 * watching, and an air / power board for the plant room. A second small
 * canvas ('sitemap', paper, not emissive) is the corkboard's site plan, drawn
 * from the buildings and the wall the family has actually built.
 *
 * `updateScreens` is throttled by the caller (a few times a second, only
 * while a control room is built and in view). Nothing here runs in tests
 * except the pure helpers (`screenPlane`, `CELLS`).
 */
import * as THREE from 'three';
import type { GameState } from '../../sim/state';
import { securityFeeds, type CamFeed, type Feeds } from '../../sim/bunkerLife';
import { KIT, CELL } from './kit';
import { isFinished } from '../../sim/construction';

export type CellId = 'cams' | 'news' | 'radar' | 'weather' | 'laptop' | 'status' | 'tv';
export const ATLAS_W = 1024, ATLAS_H = 1024;
/** Atlas cells in pixels (x, y, w, h): the three-by-two grid of the wall of screens. */
export const CELLS: Record<CellId, [number, number, number, number]> = {
  cams: [0, 0, 512, 288], news: [0, 288, 512, 224], radar: [512, 0, 256, 256], weather: [768, 0, 256, 256],
  laptop: [512, 256, 256, 160], status: [768, 256, 256, 160], tv: [0, 512, 256, 144],
};

/** A flat screen face (facing +z, centered at x with its bottom at y) showing one atlas cell, with its own UVs. */
export function screenPlane(w: number, h: number, cell: CellId, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [cx, cy, cw, ch] = CELLS[cell];
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * cw) / ATLAS_W, 1 - (cy + (1 - uv.getY(i)) * ch) / ATLAS_H);
  g.translate(x, y + h / 2, z);
  g.userData.keepUV = true;
  return g;
}

/** A paper face with its own whole-canvas UVs (the corkboard's site plan). */
export function mapPlane(w: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z);
  g.userData.keepUV = true;
  return g;
}

// ── the canvases ─────────────────────────────────────────────────────────

let _atlas: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null = null;
let _map: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null = null;

function atlas() {
  if (_atlas) return _atlas;
  const cv = document.createElement('canvas'); cv.width = ATLAS_W; cv.height = ATLAS_H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#05070a'; g.fillRect(0, 0, ATLAS_W, ATLAS_H);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (_atlas = { cv, g, tex });
}
function sitemap() {
  if (_map) return _map;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#e8dfc4'; g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (_map = { cv, g, tex });
}
export const screenTexture = (): THREE.CanvasTexture => atlas().tex;
export const siteMapTexture = (): THREE.CanvasTexture => sitemap().tex;

// ── small drawing helpers ────────────────────────────────────────────────

const rnd = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
type Ctx = CanvasRenderingContext2D;
const font = (g: Ctx, px: number, bold = true) => { g.font = `${bold ? 'bold ' : ''}${px}px ui-monospace, Menlo, Consolas, monospace`; };
function wrap(g: Ctx, text: string, w: number): string[] {
  const out: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** One camera tile (256 × 144 at ox, oy). */
function drawCam(g: Ctx, c: CamFeed, ox: number, oy: number, t: number, hour: number, idx: number): void {
  const W = 256, H = 144;
  g.save(); g.beginPath(); g.rect(ox, oy, W, H); g.clip(); g.translate(ox, oy);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (c.state === 'live') {
    const nightLook = c.ir, thermal = c.thermal;
    const pal = thermal ? { sky: '#161616', far: '#3a3a3a', ground: '#242424', ink: '#f2f2f2', mid: '#8c8c8c', hot: '#ffffff' }
      : nightLook ? { sky: '#0c2410', far: '#16401c', ground: '#103418', ink: '#a8ffa0', mid: '#58b858', hot: '#d8ffd0' }
      : hour < 8 || hour > 18 ? { sky: '#e8b080', far: '#3f5a3a', ground: '#5a7a44', ink: '#6b4a30', mid: '#a88a60', hot: '#e8e0c8' }
      : { sky: '#a8c8e0', far: '#44683c', ground: '#6a8a4a', ink: '#7a5a38', mid: '#b89a68', hot: '#e8e4d4' };
    const sky = g.createLinearGradient(0, 0, 0, H * 0.45); sky.addColorStop(0, pal.sky); sky.addColorStop(1, pal.far);
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.5);
    g.fillStyle = pal.far; for (let i = 0; i < 9; i++) { const x = i * 34 - 6, h = 22 + rnd(i + idx * 9) * 22; g.beginPath(); g.moveTo(x, H * 0.5); g.lineTo(x + 17, H * 0.5 - h); g.lineTo(x + 34, H * 0.5); g.fill(); }
    g.fillStyle = pal.ground; g.fillRect(0, H * 0.5, W, H * 0.5);
    if (c.id === 'house') {
      g.fillStyle = pal.ink; g.fillRect(70, 62, 120, 46);
      g.fillStyle = pal.mid; g.beginPath(); g.moveTo(58, 64); g.lineTo(130, 28); g.lineTo(202, 64); g.fill();
      g.fillStyle = pal.hot; g.fillRect(90, 78, 18, 16); g.fillRect(152, 78, 18, 16); g.fillStyle = pal.mid; g.fillRect(122, 80, 16, 28);
      g.fillStyle = pal.ink; g.fillRect(168, 24, 10, 24);
    } else if (c.id === 'gardens') {
      for (let r = 0; r < 5; r++) { g.fillStyle = pal.ink; g.fillRect(24 + r * 4, 64 + r * 15, 208 - r * 8, 8); g.fillStyle = pal.mid; for (let k = 0; k < 14; k++) g.fillRect(30 + r * 4 + k * 14, 62 + r * 15, 6, 6); }
      g.strokeStyle = pal.hot; g.lineWidth = 2; g.strokeRect(186, 38, 50, 28); g.beginPath(); g.moveTo(186, 38); g.lineTo(211, 22); g.lineTo(236, 38); g.stroke();
    } else if (c.id === 'solar') {
      g.fillStyle = nightLook || thermal ? pal.mid : '#243c70';
      for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { g.save(); g.translate(26 + k * 36 + r * 8, 64 + r * 24); g.transform(1, 0, -0.35, 1, 0, 0); g.fillRect(0, 0, 32, 18); g.restore(); }
      g.strokeStyle = pal.hot; g.lineWidth = 1; for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { g.save(); g.translate(26 + k * 36 + r * 8, 64 + r * 24); g.transform(1, 0, -0.35, 1, 0, 0); g.strokeRect(0, 0, 32, 18); g.restore(); }
    } else {
      // the gate: two posts, two leaves of bars, the drive going away, a post light
      g.fillStyle = pal.mid; g.beginPath(); g.moveTo(96, H); g.lineTo(160, H); g.lineTo(138, 70); g.lineTo(118, 70); g.fill();
      g.fillStyle = pal.ink; g.fillRect(70, 40, 12, 80); g.fillRect(174, 40, 12, 80);
      g.strokeStyle = pal.ink; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(84 + i * 10, 52); g.lineTo(84 + i * 10, 108); g.stroke(); }
      g.beginPath(); g.moveTo(82, 60); g.lineTo(174, 60); g.moveTo(82, 100); g.lineTo(174, 100); g.stroke();
      g.fillStyle = pal.hot; g.fillRect(72, 34, 8, 6);
      if (c.people > 0) {
        for (let i = 0; i < Math.min(5, c.people); i++) {
          const px = 100 + i * 14 + Math.sin(t * 0.6 + i) * 3, py = 112;
          g.fillStyle = thermal ? '#fff' : pal.hot; g.fillRect(px, py - 20, 6, 16); g.beginPath(); g.arc(px + 3, py - 24, 3.5, 0, 7); g.fill();
        }
      }
    }
    // a person at the house now and then (the hands working)
    if (c.id === 'house' && c.people > 0) { const px = 196 + Math.sin(t * 0.4) * 6; g.fillStyle = thermal ? '#fff' : pal.hot; g.fillRect(px, 98, 5, 14); g.beginPath(); g.arc(px + 2.5, 94, 3, 0, 7); g.fill(); }
    // sensor noise and a scanline roll
    g.globalAlpha = nightLook || thermal ? 0.18 : 0.08;
    for (let i = 0; i < 90; i++) { g.fillStyle = rnd(i * 3 + Math.floor(t * 8) + idx) > 0.5 ? '#fff' : '#000'; g.fillRect(rnd(i + Math.floor(t * 8)) * W, rnd(i * 7 + idx + Math.floor(t * 8)) * H, 2, 1); }
    g.globalAlpha = 0.14; g.fillStyle = '#000'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    g.globalAlpha = 0.12; g.fillStyle = '#fff'; g.fillRect(0, (t * 40 + idx * 30) % H, W, 6);
    g.globalAlpha = 1;
    if (c.motion) { g.strokeStyle = '#ff3030'; g.lineWidth = 2; g.strokeRect(60, 34, 136, 90); font(g, 9); g.fillStyle = '#ff3030'; g.fillText('MOTION', 64, 46); }
  } else if (c.state === 'nosignal') {
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${rnd(i + Math.floor(t * 12) * 3.1) * 0.35})`; g.fillRect(rnd(i * 1.7 + 4) * W, rnd(i * 2.3 + Math.floor(t * 12)) * H, 3, 2); }
    font(g, 13); g.fillStyle = '#9aa'; g.textAlign = 'center'; g.fillText('NO SIGNAL', W / 2, H / 2 + 4); g.textAlign = 'left';
  } else if (c.state === 'noview') {
    g.fillStyle = '#10141a'; g.fillRect(0, 0, W, H);
    font(g, 11); g.fillStyle = '#6a7a88'; g.textAlign = 'center'; g.fillText('NOTHING TO VIEW', W / 2, H / 2 + 4); g.textAlign = 'left';
  } else {
    font(g, 11); g.fillStyle = '#7a4040'; g.textAlign = 'center'; g.fillText('NO POWER', W / 2, H / 2 + 4); g.textAlign = 'left';
  }
  // the label bar
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, 15);
  font(g, 10); g.fillStyle = c.state === 'live' ? '#e8ffe8' : '#778'; g.fillText(`CAM ${idx + 1}  ${c.label}${c.thermal && c.state === 'live' ? '  THERMAL' : ''}`, 5, 11);
  if (c.state === 'live' && Math.floor(t * 1.5) % 2 === 0) { g.fillStyle = '#ff2828'; g.beginPath(); g.arc(W - 12, 8, 3.5, 0, 7); g.fill(); }
  g.restore();
}

function drawCams(g: Ctx, f: Feeds, t: number, hour: number): void {
  const [x, y] = CELLS.cams;
  f.cams.forEach((c, i) => drawCam(g, c, x + (i % 2) * 256, y + Math.floor(i / 2) * 144, t, hour, i));
  g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, 510, 286); g.beginPath(); g.moveTo(x + 256, y); g.lineTo(x + 256, y + 288); g.moveTo(x, y + 144); g.lineTo(x + 512, y + 144); g.stroke();
}

function drawRadar(g: Ctx, f: Feeds, t: number): void {
  const [x, y, w, h] = CELLS.radar, cx = x + w / 2, cy = y + h / 2 + 4, R = 108;
  g.fillStyle = '#031006'; g.fillRect(x, y, w, h);
  if (!f.radar.on) { font(g, 12); g.fillStyle = '#356'; g.textAlign = 'center'; g.fillText('RADAR OFFLINE', cx, cy); g.textAlign = 'left'; return; }
  g.strokeStyle = '#1f7a38'; g.lineWidth = 1;
  for (const k of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, R * k, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const sweep = (t * 1.3) % (Math.PI * 2);
  for (let i = 0; i < 22; i++) { g.strokeStyle = `rgba(80,255,120,${0.5 * (1 - i / 22)})`; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(sweep - i * 0.045) * R, cy - Math.cos(sweep - i * 0.045) * R); g.stroke(); }
  // the parcel (a square) and the compound (a dot)
  g.strokeStyle = '#2a9a48'; g.lineWidth = 1; g.strokeRect(cx - 34, cy - 34, 68, 68); g.fillStyle = '#7dff9a'; g.fillRect(cx - 2, cy - 2, 4, 4);
  for (const b of f.radar.blips) {
    const a = ((b.bearing - sweep) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), fade = 0.35 + 0.65 * Math.max(0, 1 - a / (Math.PI * 2));
    const bx = cx + Math.sin(b.bearing) * b.range * R, by = cy - Math.cos(b.bearing) * b.range * R;
    g.fillStyle = b.kind === 'crew' ? `rgba(255,70,60,${fade})` : b.kind === 'dig' ? `rgba(80,200,255,${fade})` : `rgba(255,220,90,${fade})`;
    g.beginPath(); g.arc(bx, by, 4, 0, 7); g.fill();
  }
  font(g, 9); g.fillStyle = '#5fd078'; g.fillText('N', cx - 3, y + 12); g.fillText('SURVEILLANCE', x + 6, y + h - 6);
  if (f.radar.seismic) { g.fillStyle = '#6cd8ff'; g.fillText('SEISMIC', x + w - 52, y + h - 6); }
}

function drawWeather(g: Ctx, f: Feeds, game: GameState, t: number): void {
  const [x, y, w, h] = CELLS.weather;
  const grd = g.createLinearGradient(x, y, x, y + h); grd.addColorStop(0, f.weather.warn ? '#2a1010' : '#0c1e3a'); grd.addColorStop(1, '#06101e');
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  if (!f.weather.on) { font(g, 12); g.fillStyle = '#356'; g.textAlign = 'center'; g.fillText('NO DATA', x + w / 2, y + h / 2); g.textAlign = 'left'; return; }
  font(g, 12); g.fillStyle = '#9cc8ff'; g.fillText('WEATHER', x + 10, y + 20);
  // a swirl: a satellite-ish spiral that turns, redder in a warning
  const cx = x + w / 2, cy = y + 108;
  for (let i = 0; i < 160; i++) {
    const a = i * 0.21 + t * 0.35, r = 3 + i * 0.5;
    g.fillStyle = f.weather.warn ? `rgba(255,${90 + i % 60},60,${0.6 - i / 330})` : `rgba(${160 + i % 60},${200 + i % 40},255,${0.55 - i / 330})`;
    g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 0.8, 3 + (i % 3), 0, 7); g.fill();
  }
  g.fillStyle = '#05101e'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
  font(g, 11); g.fillStyle = f.weather.warn && Math.floor(t * 2) % 2 === 0 ? '#ff7060' : f.weather.warn ? '#ffd0c0' : '#8fe6a0';
  g.fillText(f.weather.line.slice(0, 26), x + 10, y + h - 40);
  font(g, 10); g.fillStyle = '#7aa0c8';
  const day = Math.floor(game.clock.t);
  g.fillText(`DAY ${day}`, x + 10, y + h - 22); g.fillText(f.news.set === 'none' ? 'NO NET' : f.news.set === 'ham' ? 'HAM NET' : 'SW RADIO', x + w - 74, y + h - 22);
}

function drawNews(g: Ctx, f: Feeds, t: number): void {
  const [x, y, w, h] = CELLS.news;
  g.fillStyle = '#0a0f16'; g.fillRect(x, y, w, h);
  g.fillStyle = '#1a2a44'; g.fillRect(x, y, w, 22);
  font(g, 12); g.fillStyle = '#d8e6ff'; g.fillText(f.news.set === 'ham' ? 'HAM NET  40 M' : f.news.set === 'shortwave' ? 'SHORTWAVE' : 'RADIO', x + 8, y + 15);
  g.fillStyle = f.news.on ? '#40e070' : '#703030'; g.beginPath(); g.arc(x + w - 14, y + 11, 4, 0, 7); g.fill();
  if (!f.news.on) {
    for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(255,255,255,${rnd(i + Math.floor(t * 10) * 5) * 0.25})`; g.fillRect(x + rnd(i * 1.9) * w, y + 24 + rnd(i * 3.3 + Math.floor(t * 10)) * (h - 24), 3, 2); }
    font(g, 13); g.fillStyle = '#8a98a8'; g.textAlign = 'center'; g.fillText(f.powered ? 'NO SET TUNED' : 'NO POWER', x + w / 2, y + h / 2 + 8); g.textAlign = 'left';
    return;
  }
  font(g, 11, false); let yy = y + 40;
  for (const line of f.news.lines) {
    g.fillStyle = '#e8f0ff';
    for (const ln of wrap(g, line, w - 20).slice(0, 2)) { g.fillText(ln, x + 10, yy); yy += 14; }
    yy += 5;
    if (yy > y + h - 8) break;
  }
}

function drawLaptop(g: Ctx, f: Feeds, game: GameState): void {
  const [x, y, w, h] = CELLS.laptop;
  g.fillStyle = '#0e1620'; g.fillRect(x, y, w, h); g.fillStyle = '#1c3050'; g.fillRect(x, y, w, 18);
  font(g, 10); g.fillStyle = '#cfe0ff'; g.fillText('SECURITY', x + 6, y + 13);
  g.fillStyle = f.powered ? '#30c060' : '#a03030'; g.beginPath(); g.moveTo(x + 24, y + 46); g.lineTo(x + 56, y + 46); g.lineTo(x + 56, y + 70); g.lineTo(x + 40, y + 86); g.lineTo(x + 24, y + 70); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; if (f.powered) { g.beginPath(); g.moveTo(x + 32, y + 62); g.lineTo(x + 38, y + 69); g.lineTo(x + 49, y + 54); g.stroke(); }
  font(g, 9, false); g.fillStyle = '#9bb4d4';
  const st = game.stock as Record<string, number>, lines = [
    `CAMERAS   ${(st.cameras ?? 0) * 4 + (st.thermal_cam ?? 0)}`, `DRIVE     ${st.driveway_alarm ? 'ARMED' : '--'}`,
    `GROUND    ${st.ground_sensor ? 'ARMED' : '--'}`, `LIGHTS    ${st.floodlights ? 'READY' : '--'}`,
  ];
  lines.forEach((l, i) => g.fillText(l, x + 68, y + 38 + i * 14));
  g.fillStyle = f.powered ? '#60e090' : '#e07060'; font(g, 10); g.fillText(f.powered ? 'ALL SYSTEMS' : 'NO POWER', x + 10, y + h - 12);
}

function drawStatus(g: Ctx, f: Feeds, game: GameState): void {
  const [x, y, w, h] = CELLS.status;
  g.fillStyle = '#0c1210'; g.fillRect(x, y, w, h); g.fillStyle = '#183024'; g.fillRect(x, y, w, 18);
  font(g, 10); g.fillStyle = '#bfe8cc'; g.fillText('PLANT', x + 6, y + 13);
  const plant = game.structures.some(s => s.kind === 'bunker_plant' && isFinished(s));
  const row = (i: number, label: string, ok: boolean, txt: string) => {
    g.fillStyle = ok ? '#30d060' : '#d04030'; g.beginPath(); g.arc(x + 14, y + 36 + i * 22, 5, 0, 7); g.fill();
    font(g, 10); g.fillStyle = '#cfe0d4'; g.fillText(label, x + 28, y + 40 + i * 22); g.fillStyle = ok ? '#7ae89a' : '#e88a7a'; g.fillText(txt, x + w - 78, y + 40 + i * 22);
  };
  row(0, 'AIR', plant, plant ? 'FILTERED' : 'NO PLANT'); row(1, 'POWER', f.powered, f.powered ? 'ON' : 'OFF'); row(2, 'WATER', plant, plant ? '2,000 L' : 'NO TANK');
}

/** The bunkroom's TV: a game night (a paddle game) when the family has games and power, a quiet test card otherwise. */
function drawTv(g: Ctx, f: Feeds, game: GameState, t: number): void {
  const [x, y, w, h] = CELLS.tv;
  g.fillStyle = '#050607'; g.fillRect(x, y, w, h);
  if (!f.powered) return;
  if ((game.stock.games ?? 0) < 1) {
    const bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];
    bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(x + i * (w / 7), y, w / 7, h * 0.7); });
    g.fillStyle = '#101010'; g.fillRect(x, y + h * 0.7, w, h * 0.3); font(g, 10); g.fillStyle = '#ddd'; g.fillText('STAND BY', x + 8, y + h - 10);
    return;
  }
  g.fillStyle = '#10243a'; g.fillRect(x, y, w, h);
  g.fillStyle = '#6a8aa8'; for (let i = 0; i < 12; i++) g.fillRect(x + w / 2 - 1, y + 4 + i * 12, 2, 6);
  const bx = x + 14 + (Math.abs(((t * 70) % (2 * (w - 28))) - (w - 28))), by = y + 12 + Math.abs(((t * 41) % (2 * (h - 24))) - (h - 24));
  g.fillStyle = '#fff'; g.fillRect(bx, by, 6, 6);
  g.fillStyle = '#ffd050'; g.fillRect(x + 8, y + 40 + Math.sin(t * 1.3) * 30 + 30, 5, 28); g.fillStyle = '#ff7060'; g.fillRect(x + w - 13, y + 40 + Math.sin(t * 1.1 + 2) * 30 + 30, 5, 28);
  font(g, 14); g.fillStyle = '#9fd'; g.fillText('3', x + w / 2 - 36, y + 22); g.fillText('2', x + w / 2 + 24, y + 22);
}

let _last = '', _lastT = -1;
/** Redraw the screens. `t` real seconds (animation), `force` to redraw even if nothing changed and the sweep hasn't moved. */
export function updateScreens(game: GameState, t: number, hour: number): void {
  const a = atlas(), f = securityFeeds(game);
  // the picture moves (sweep, noise, REC dot): a few frames a second is plenty
  if (t - _lastT < 0.22 && f.key === _last) return;
  _lastT = t; _last = f.key;
  const g = a.g;
  drawCams(g, f, t, hour); drawRadar(g, f, t); drawWeather(g, f, game, t); drawNews(g, f, t); drawLaptop(g, f, game); drawStatus(g, f, game); drawTv(g, f, game, t);
  a.tex.needsUpdate = true;
}

// ── the corkboard's site plan ────────────────────────────────────────────

const MAP_COLORS: Record<string, string> = { home: '#9a6a3e', work: '#7a7a82', food: '#5f9a4a', sanitation: '#8a7a5a', water: '#3a78b8', power: '#c8a820', bunker: '#c04030', defense: '#403838' };
let _mapKey = '';
/** Draw the compound as a paper site plan: the parcel, what is built (by kind), the wall, the gate. Cheap; redrawn only when the layout changes. */
export function updateSiteMap(game: GameState): void {
  const home = game.site.home;
  const key = JSON.stringify([game.structures.map(s => [s.kind, Math.round(s.x * 10), Math.round(s.z * 10), s.rot, isFinished(s) ? 1 : 0]), game.perimeter.map(r => [r.kind, r.pts.length, r.finishedAt !== null ? 1 : 0])]);
  if (key === _mapKey) return;
  _mapKey = key;
  const m = sitemap(), g = m.g;
  g.fillStyle = '#e6dcc0'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(60,50,30,0.18)'; g.lineWidth = 1; for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 512); g.moveTo(0, i * 32); g.lineTo(512, i * 32); g.stroke(); }
  const M0 = 28, S = 456 / Math.max(home.x1 - home.x0, home.z1 - home.z0);
  const px = (x: number) => M0 + (x - home.x0) * S, pz = (z: number) => M0 + (z - home.z0) * S;
  g.fillStyle = '#d4dcb4'; g.fillRect(px(home.x0), pz(home.z0), (home.x1 - home.x0) * S, (home.z1 - home.z0) * S);
  g.setLineDash([8, 5]); g.strokeStyle = '#6a5a30'; g.lineWidth = 2; g.strokeRect(px(home.x0), pz(home.z0), (home.x1 - home.x0) * S, (home.z1 - home.z0) * S); g.setLineDash([]);
  // the wall
  for (const r of game.perimeter) {
    if (r.pts.length < 2) continue;
    g.strokeStyle = r.finishedAt !== null ? '#1c1c20' : '#8a8a90'; g.lineWidth = r.kind.includes('tunnel') || r.kind.includes('passage') ? 3 : 4; g.setLineDash(r.finishedAt !== null ? [] : [6, 4]);
    g.beginPath(); r.pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z)))); g.stroke(); g.setLineDash([]);
  }
  // the buildings
  for (const s of game.structures) {
    const d = KIT[s.kind]; if (!d) continue;
    const q = ((s.rot % 4) + 4) % 4, w = (q % 2 ? d.cellsZ : d.cellsX) * CELL * S, h = (q % 2 ? d.cellsX : d.cellsZ) * CELL * S;
    const done = isFinished(s);
    g.fillStyle = MAP_COLORS[d.category] ?? '#777'; g.globalAlpha = done ? 0.92 : 0.4;
    if (d.category === 'bunker') { g.setLineDash([4, 3]); g.strokeStyle = '#a02818'; g.lineWidth = 2; g.strokeRect(px(s.x) - w / 2, pz(s.z) - h / 2, w, h); g.setLineDash([]); g.globalAlpha = 0.25; }
    g.fillRect(px(s.x) - w / 2, pz(s.z) - h / 2, w, h); g.globalAlpha = 1;
  }
  g.fillStyle = '#2a2418'; font(g, 16); g.fillText('SITE PLAN', 30, 20);
  font(g, 10, false); g.fillText('red dashed = bunker   black = wall', 30, 506);
  g.fillStyle = '#a02818'; g.beginPath(); g.moveTo(480, 26); g.lineTo(472, 46); g.lineTo(488, 46); g.fill(); font(g, 10); g.fillStyle = '#2a2418'; g.fillText('N', 477, 58);
  m.tex.needsUpdate = true;
}
