/**
 * The dome control block's wall screens, desk monitors and lettered nameplates (procedural art only): extra cells in the bunker control room's emissive atlas
 * (buildkit/screenFeeds.ts), painted once when the atlas is made, so the whole block's screens, signs and status lamps are ONE shared material and one merged mesh.
 * The pictures are a believable static state of the dome (power, water, air, doors, security, a floor plan); nothing here reads the sim, and the lamp colors match the
 * entrance's state lamps (red sealed, amber cycling, green open: fx/VehiclePorts).
 */
export type CtlCell = 'ctl_power' | 'ctl_water' | 'ctl_air' | 'ctl_doors' | 'ctl_sec' | 'ctl_map' | 'ctl_lamps' | 'ctl_mon_a' | 'ctl_mon_b'
  | 'sign_power' | 'sign_water' | 'sign_air' | 'sign_doors' | 'sign_sec' | 'sign_ops' | 'sign_ctl' | 'sign_hv';

/** Atlas cells in pixels (x, y, w, h) in the lower part of the 1024 x 1024 atlas, below the bunker's own cells. */
export const CTL_CELLS: Record<CtlCell, [number, number, number, number]> = {
  ctl_power: [0, 672, 256, 128], ctl_water: [256, 672, 256, 128], ctl_air: [512, 672, 256, 128], ctl_doors: [768, 672, 256, 128],
  ctl_sec: [0, 800, 256, 128], ctl_map: [256, 800, 384, 128], ctl_lamps: [640, 800, 128, 32], ctl_mon_a: [768, 800, 128, 128], ctl_mon_b: [896, 800, 128, 128],
  sign_power: [0, 928, 256, 48], sign_water: [256, 928, 256, 48], sign_air: [512, 928, 256, 48], sign_doors: [768, 928, 256, 48],
  sign_sec: [0, 976, 256, 48], sign_ops: [256, 976, 256, 48], sign_ctl: [512, 976, 256, 48], sign_hv: [768, 976, 256, 48],
};
/** The four lamp swatches in `ctl_lamps` (each 32 x 32, left to right): sealed red, cycling amber, open green, white. */
export const LAMP_ORDER = ['red', 'amber', 'green', 'white'] as const;
export const LAMP_HEX = { red: '#ff3a2a', amber: '#ffb020', green: '#30ff80', white: '#f4f8ff' } as const;

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
type Ctx = CanvasRenderingContext2D;
const mono = (g: Ctx, px: number, bold = true): void => { g.font = `${bold ? 'bold ' : ''}${px}px ui-monospace, Menlo, Consolas, monospace`; g.textBaseline = 'middle'; };

function frame(g: Ctx, c: [number, number, number, number], title: string, accent: string): void {
  const [x, y, w, h] = c;
  g.fillStyle = '#04080c'; g.fillRect(x, y, w, h);
  g.fillStyle = accent; g.fillRect(x, y, w, 15); g.fillStyle = '#021016'; mono(g, 11); g.textAlign = 'left'; g.fillText(title, x + 6, y + 8);
  g.strokeStyle = 'rgba(120,200,220,0.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // faint scanlines
  g.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 18; k < h; k += 3) g.fillRect(x, y + k, w, 1);
}
const bar = (g: Ctx, x: number, y: number, w: number, h: number, v: number, col: string): void => {
  g.fillStyle = '#0d1a22'; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, Math.max(1, w * v), h);
  g.strokeStyle = 'rgba(160,220,240,0.4)'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
};
const line = (g: Ctx, x: number, y: number, w: number, h: number, r: () => number, col: string, base = 0.5, amp = 0.3): void => {
  g.strokeStyle = 'rgba(80,140,160,0.25)'; g.lineWidth = 1; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x, y + h * k / 4); g.lineTo(x + w, y + h * k / 4); g.stroke(); }
  g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); let v = base;
  for (let i = 0; i <= 28; i++) { v += (r() - 0.5) * amp * 0.5; v = Math.max(0.1, Math.min(0.9, v + (base - v) * 0.1)); const px = x + w * i / 28, py = y + h * (1 - v); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.stroke();
};
const dot = (g: Ctx, x: number, y: number, r: number, col: string): void => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); g.fill(); };
const txt = (g: Ctx, s: string, x: number, y: number, px: number, col: string, align: CanvasTextAlign = 'left', bold = true): void => { mono(g, px, bold); g.textAlign = align; g.fillStyle = col; g.fillText(s, x, y); };

function plate(g: Ctx, c: [number, number, number, number], label: string, accent: string, hv = false): void {
  const [x, y, w, h] = c;
  g.fillStyle = hv ? '#e8b81c' : '#1a222a'; g.fillRect(x, y, w, h);
  if (hv) { g.fillStyle = '#16140c'; for (let k = -h; k < w; k += 20) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + 10, y + h); g.lineTo(x + k + 10 + h, y); g.lineTo(x + k + h, y); g.fill(); } g.fillStyle = '#e8b81c'; g.fillRect(x + 26, y + 6, w - 52, h - 12); }
  else { g.fillStyle = accent; g.fillRect(x, y, 14, h); g.fillRect(x + w - 6, y, 6, h); g.strokeStyle = '#cfd6dc'; g.lineWidth = 2; g.strokeRect(x + 19, y + 4, w - 28, h - 8); }
  let fs = hv ? 26 : 30; mono(g, fs); while (g.measureText(label).width > w - 64 && fs > 12) { fs -= 2; mono(g, fs); }
  g.textAlign = 'center'; g.fillStyle = hv ? '#16140c' : '#f2f6f8'; g.fillText(label, x + (hv ? w / 2 : w / 2 + 6), y + h / 2 + 1);
  if (!hv) { g.fillStyle = '#7e8a94'; for (const bx of [27, w - 14]) for (const by of [10, h - 10]) { g.beginPath(); g.arc(x + bx, y + by, 2, 0, Math.PI * 2); g.fill(); } }
}

/** Paint every cell of the dome control block into the shared atlas. */
export function paintDomeControlCells(g: Ctx): void {
  const r = lcg(2026);
  // ── nameplates ──
  plate(g, CTL_CELLS.sign_power, 'POWER', '#f0a030'); plate(g, CTL_CELLS.sign_water, 'WATER', '#3b9de0'); plate(g, CTL_CELLS.sign_air, 'CLIMATE', '#35d0b8');
  plate(g, CTL_CELLS.sign_doors, 'DOORS / AIRLOCKS', '#f0d020'); plate(g, CTL_CELLS.sign_sec, 'SECURITY', '#e04838'); plate(g, CTL_CELLS.sign_ops, 'OPERATIONS', '#60e090');
  plate(g, CTL_CELLS.sign_ctl, 'DOME CONTROL', '#40e0ff'); plate(g, CTL_CELLS.sign_hv, 'HIGH VOLTAGE', '#e8b81c', true);
  // ── lamp swatches ──
  { const [x, y] = CTL_CELLS.ctl_lamps; LAMP_ORDER.forEach((k, i) => { g.fillStyle = LAMP_HEX[k]; g.fillRect(x + i * 32, y, 32, 32); }); }
  // ── power ──
  { const c = CTL_CELLS.ctl_power, [x, y] = c; frame(g, c, 'POWER  SELF-SUFFICIENT', '#f0a030');
    const rows: Array<[string, number, string, string]> = [['PV ARRAY', 0.82, '#ffd040', '412 kW'], ['BATTERY', 0.74, '#40e090', '74 %'], ['GENSET', 0.0, '#506070', 'STBY'], ['LOAD', 0.58, '#ff9040', '286 kW']];
    rows.forEach(([n, v, col, val], i) => { txt(g, n, x + 6, y + 28 + i * 17, 10, '#9fd0e0'); bar(g, x + 62, y + 22 + i * 17, 96, 10, v, col); txt(g, val, x + 164, y + 28 + i * 17, 10, '#e8f6ff'); });
    line(g, x + 6, y + 92, 120, 30, r, '#ffd040', 0.6, 0.5); line(g, x + 132, y + 92, 118, 30, r, '#40e090', 0.5, 0.4); txt(g, 'BUS A  BUS B  OK', x + 190, y + 84, 9, '#7fe0a0', 'center'); }
  // ── water ──
  { const c = CTL_CELLS.ctl_water, [x, y] = c; frame(g, c, 'WATER  TREATMENT + LOOP', '#3b9de0');
    [['RAW', 0.64, '#3a9ae0'], ['TREATED', 0.81, '#40d0f0'], ['GREY', 0.37, '#8aa0b0'], ['RECLAIM', 0.93, '#40e0b0']].forEach(([n, v, col], i) => { const bx = x + 8 + i * 61; txt(g, n as string, bx, y + 26, 9, '#9fd0e0'); g.fillStyle = '#0d1a22'; g.fillRect(bx, y + 34, 22, 62); g.fillStyle = col as string; const hh = 62 * (v as number); g.fillRect(bx, y + 34 + 62 - hh, 22, hh); g.strokeStyle = 'rgba(160,220,240,0.5)'; g.strokeRect(bx + 0.5, y + 34.5, 21, 61); txt(g, `${Math.round((v as number) * 100)}%`, bx + 26, y + 70, 10, '#e8f6ff'); });
    txt(g, 'PUMP 1  RUN', x + 8, y + 108, 10, '#7fe0a0'); txt(g, 'PUMP 2  STBY', x + 98, y + 108, 10, '#c8d0d8'); txt(g, 'UV  OK  pH 7.2', x + 248, y + 108, 10, '#7fe0a0', 'right'); }
  // ── climate ──
  { const c = CTL_CELLS.ctl_air, [x, y] = c; frame(g, c, 'CLIMATE  AIR HANDLING', '#35d0b8');
    [['TEMP', '68.4 F'], ['RH', '46 %'], ['CO2', '612 ppm'], ['O2', '20.9 %']].forEach(([n, v], i) => { txt(g, n, x + 8 + i * 62, y + 26, 9, '#9fd0e0'); txt(g, v, x + 8 + i * 62, y + 40, 11, '#e8f6ff'); });
    line(g, x + 6, y + 52, 160, 38, r, '#35d0b8', 0.5, 0.3); line(g, x + 6, y + 94, 160, 28, r, '#ffd040', 0.4, 0.3);
    ['FILTER A', 'FILTER B', 'CHILL'].forEach((n, i) => { txt(g, n, x + 176, y + 58 + i * 20, 9, '#9fd0e0'); bar(g, x + 176, y + 64 + i * 20, 70, 7, [0.35, 0.52, 0.7][i], i === 2 ? '#40a0ff' : '#40e090'); }); }
  // ── doors ──
  { const c = CTL_CELLS.ctl_doors, [x, y] = c; frame(g, c, 'DOORS  GATES + AIRLOCKS', '#f0d020');
    const gates: Array<[string, string, string]> = [['SALLY OUTER', LAMP_HEX.red, 'SEALED'], ['SALLY INNER', LAMP_HEX.red, 'SEALED'], ['PERSON OUTER', LAMP_HEX.amber, 'CYCLING'], ['PERSON INNER', LAMP_HEX.red, 'SEALED'], ['YARD SERVICE', LAMP_HEX.green, 'OPEN'], ['ESCAPE HATCH', LAMP_HEX.red, 'LOCKED']];
    gates.forEach(([n, col, st], i) => { const cx = x + 8 + (i % 2) * 124, cy = y + 28 + Math.floor(i / 2) * 22; dot(g, cx + 5, cy, 5, col); txt(g, n, cx + 15, cy - 4, 9, '#cfe6f0'); txt(g, st, cx + 15, cy + 7, 9, col); });
    txt(g, 'INTERLOCK OK   NEVER BOTH OPEN', x + 128, y + 117, 9, '#7fe0a0', 'center'); }
  // ── security ──
  { const c = CTL_CELLS.ctl_sec, [x, y] = c; frame(g, c, 'SECURITY  CAMERAS + ALARMS', '#e04838');
    for (let i = 0; i < 4; i++) { const tx = x + 6 + (i % 2) * 90, ty = y + 20 + Math.floor(i / 2) * 50; g.fillStyle = '#0a2a14'; g.fillRect(tx, ty, 86, 46); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(80,${150 + r() * 90},100,${0.15 + r() * 0.25})`; g.fillRect(tx + r() * 86, ty + r() * 46, 2 + r() * 8, 1); } g.fillStyle = '#41ff7a'; g.fillRect(tx + 8 + r() * 50, ty + 20 + r() * 12, 14, 4 + i); txt(g, `CAM ${i + 1}`, tx + 3, ty + 7, 8, '#b8ffd0'); dot(g, tx + 80, ty + 7, 2.5, '#ff3a2a'); }
    txt(g, 'PERIMETER', x + 192, y + 30, 9, '#9fd0e0'); txt(g, 'SECURE', x + 192, y + 44, 13, '#7fe0a0'); txt(g, 'GATE', x + 192, y + 64, 9, '#9fd0e0'); txt(g, 'LOCKED', x + 192, y + 78, 13, '#ffb020'); txt(g, 'ALARMS 0', x + 192, y + 104, 11, '#e8f6ff'); }
  // ── floor plan ──
  { const c = CTL_CELLS.ctl_map, [x, y] = c; frame(g, c, 'DOME OVERVIEW  ALL SYSTEMS', '#40e0ff');
    g.strokeStyle = '#40e0ff'; g.lineWidth = 2; g.beginPath(); g.arc(x + 90, y + 74, 48, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; g.strokeStyle = 'rgba(64,224,255,0.4)'; g.beginPath(); g.arc(x + 90, y + 74, 30, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8f6ff'; g.fillRect(x + 80, y + 108, 20, 8); g.fillStyle = '#ffb020'; g.fillRect(x + 128, y + 86, 8, 18); g.fillStyle = '#3b9de0'; g.fillRect(x + 40, y + 36, 14, 8);
    dot(g, x + 138, y + 95, 3.5, LAMP_HEX.green); dot(g, x + 90, y + 125, 3.5, LAMP_HEX.red); dot(g, x + 47, y + 40, 3.5, LAMP_HEX.green);
    ['POWER', 'WATER', 'CLIMATE', 'DOORS', 'SECURITY'].forEach((n, i) => { txt(g, n, x + 168, y + 30 + i * 18, 10, '#9fd0e0'); dot(g, x + 270, y + 30 + i * 18, 4, i === 3 ? LAMP_HEX.amber : LAMP_HEX.green); bar(g, x + 282, y + 26 + i * 18, 90, 8, [0.8, 0.74, 0.6, 0.45, 0.9][i], '#40e090'); }); }
  // ── desk monitors ──
  { const [x, y, w, h] = CTL_CELLS.ctl_mon_a; g.fillStyle = '#06101a'; g.fillRect(x, y, w, h); g.fillStyle = '#40e0ff'; g.fillRect(x, y, w, 12); txt(g, 'ALARM LOG', x + 4, y + 6, 9, '#021016');
    for (let i = 0; i < 9; i++) { txt(g, `${String(6 + i).padStart(2, '0')}:${String(Math.floor(r() * 59)).padStart(2, '0')}`, x + 4, y + 22 + i * 11, 8, '#7fb0c0', 'left', false); txt(g, ['OK  HX-2 FLOW', 'OK  PV STRING 4', 'OK  GATE CYCLE', 'INFO FILTER SWAP', 'OK  BATT BAL'][i % 5], x + 38, y + 22 + i * 11, 8, i === 3 ? '#ffb020' : '#7fe0a0', 'left', false); } }
  { const [x, y, w, h] = CTL_CELLS.ctl_mon_b; g.fillStyle = '#06101a'; g.fillRect(x, y, w, h); g.fillStyle = '#40e090'; g.fillRect(x, y, w, 12); txt(g, 'TRENDS', x + 4, y + 6, 9, '#021016'); line(g, x + 4, y + 18, 120, 34, r, '#ffd040', 0.55, 0.5); line(g, x + 4, y + 56, 120, 34, r, '#40a0ff', 0.45, 0.4); line(g, x + 4, y + 94, 120, 30, r, '#40e090', 0.5, 0.3); }
}
