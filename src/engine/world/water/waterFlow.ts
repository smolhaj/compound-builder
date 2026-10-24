/**
 * waterFlow — flow field for rivers and still water (pure; no Three.js,
 * exercised by waterFlow.test.ts).
 *
 * Input: a wet/dry raster (campus terrain-mask texels, or a sampled patch of
 * the regional landscape). Output per texel:
 *   flow   — surface velocity (world units / s) along the channel. Rivers
 *            flow along the channel tangent (perpendicular to the gradient of
 *            the distance-to-bank field), downstream by the region's
 *            convention, faster in narrows and mid-channel, slow at the banks.
 *            Lakes / ponds get no flow (the shader drifts wind ripples there).
 *   foam   — riffle / white-water strength 0..1: river bends (curvature of
 *            the tangent field), narrows and wakes behind mid-stream rocks.
 *   river  — 1 on river components, 0 on still water.
 *   dist   — distance to the bank (world units).
 * plus a short list of mid-stream rocks (texel coords) that the bank
 * renderer draws and the foam field already flows around.
 *
 * A component is a river when it is narrow (max half-width ≤
 * `maxRiverHalfWidth`), long for its width, and runs off the raster (water
 * that never leaves the patch is a pond, a kettle or an oxbow lake).
 */

export interface FlowInput {
  W: number;
  H: number;
  /** 1 = water, 0 = dry, per texel (row-major, y * W + x). */
  wet: Uint8Array;
  /** World units per texel. */
  texel: number;
  /** Preferred downstream direction in raster axes (x right, y down). */
  downstream: [number, number];
  /** Rivers are at most this wide from bank to center line (world units). */
  maxRiverHalfWidth: number;
  /** Surface speed (world units / s) mid-channel at the reference half-width. */
  baseSpeed: number;
  /** Half-width (world units) at which the river runs at baseSpeed. */
  refHalfWidth: number;
  /** Mid-stream rocks per 100 river texels (0 = none). */
  rockDensity?: number;
  seed?: number;
}

export interface FlowRock { x: number; y: number; r: number }

export interface FlowField {
  W: number;
  H: number;
  texel: number;
  /** Interleaved (vx, vy) per texel, world units / s, raster axes. */
  flow: Float32Array;
  foam: Float32Array;
  river: Float32Array;
  dist: Float32Array;
  rocks: FlowRock[];
  /** Largest |flow| in the field (for texture encoding). */
  maxSpeed: number;
}

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chamfer (3-4) distance to the nearest dry texel, in texels. The raster border is not a bank. */
export function distanceToBank(wet: Uint8Array, W: number, H: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = wet[k] ? INF : 0;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (d[k] === 0) continue;
    let v = d[k];
    if (x > 0) v = Math.min(v, d[k - 1] + A);
    if (y > 0) {
      v = Math.min(v, d[k - W] + A);
      if (x > 0) v = Math.min(v, d[k - W - 1] + B);
      if (x < W - 1) v = Math.min(v, d[k - W + 1] + B);
    }
    d[k] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x;
    if (d[k] === 0) continue;
    let v = d[k];
    if (x < W - 1) v = Math.min(v, d[k + 1] + A);
    if (y < H - 1) {
      v = Math.min(v, d[k + W] + A);
      if (x < W - 1) v = Math.min(v, d[k + W + 1] + B);
      if (x > 0) v = Math.min(v, d[k + W - 1] + B);
    }
    d[k] = v;
  }
  // A component with no dry texel at all (whole raster wet): treat as wide
  for (let k = 0; k < W * H; k++) if (d[k] >= INF) d[k] = Math.max(W, H);
  return d;
}

/** Wet-only separable box blur of `src` (dry texels keep 0 and don't contribute). */
function wetBlur(src: Float32Array, wet: Uint8Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!wet[k]) continue;
    let s = 0, n = 0;
    for (let i = Math.max(0, x - r); i <= Math.min(W - 1, x + r); i++) if (wet[y * W + i]) { s += src[y * W + i]; n++; }
    tmp[k] = n ? s / n : 0;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!wet[k]) continue;
    let s = 0, n = 0;
    for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) if (wet[j * W + x]) { s += tmp[j * W + x]; n++; }
    out[k] = n ? s / n : 0;
  }
  return out;
}

/** Separable max filter over wet texels. */
function wetMax(src: Float32Array, wet: Uint8Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!wet[k]) continue;
    let m = 0;
    for (let i = Math.max(0, x - r); i <= Math.min(W - 1, x + r); i++) if (wet[y * W + i]) m = Math.max(m, src[y * W + i]);
    tmp[k] = m;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!wet[k]) continue;
    let m = 0;
    for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) if (wet[j * W + x]) m = Math.max(m, tmp[j * W + x]);
    out[k] = m;
  }
  return out;
}

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function computeWaterFlow(inp: FlowInput): FlowField {
  const { W, H, wet, texel } = inp;
  const N = W * H;
  const flow = new Float32Array(N * 2);
  const foam = new Float32Array(N);
  const river = new Float32Array(N);
  const distT = distanceToBank(wet, W, H);
  const dist = new Float32Array(N);
  for (let k = 0; k < N; k++) dist[k] = distT[k] * texel;
  const out: FlowField = { W, H, texel, flow, foam, river, dist, rocks: [], maxSpeed: 0 };

  // ── Components ────────────────────────────────────────────────────────────
  const comp = new Int32Array(N).fill(-1);
  interface Comp { n: number; maxD: number; border: boolean; sides: number; ax: number; ay: number; texels: number[] }
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let s = 0; s < N; s++) {
    if (!wet[s] || comp[s] >= 0) continue;
    const id = comps.length;
    const c: Comp = { n: 0, maxD: 0, border: false, sides: 0, ax: 1, ay: 0, texels: [] };
    comp[s] = id; stack.push(s);
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % W, y = (k - x) / W;
      c.texels.push(k);
      c.n++; c.maxD = Math.max(c.maxD, distT[k]);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.border = true;
      if (x === 0) c.sides |= 1;
      if (x === W - 1) c.sides |= 2;
      if (y === 0) c.sides |= 4;
      if (y === H - 1) c.sides |= 8;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x > 0 && wet[k - 1] && comp[k - 1] < 0) { comp[k - 1] = id; stack.push(k - 1); }
      if (x < W - 1 && wet[k + 1] && comp[k + 1] < 0) { comp[k + 1] = id; stack.push(k + 1); }
      if (y > 0 && wet[k - W] && comp[k - W] < 0) { comp[k - W] = id; stack.push(k - W); }
      if (y < H - 1 && wet[k + W] && comp[k + W] < 0) { comp[k + W] = id; stack.push(k + W); }
    }
    // Principal axis (covariance eigenvector)
    const mx = sx / c.n, my = sy / c.n;
    const cxx = sxx / c.n - mx * mx, cyy = syy / c.n - my * my, cxy = sxy / c.n - mx * my;
    const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    c.ax = Math.cos(ang); c.ay = Math.sin(ang);
    if (c.ax * inp.downstream[0] + c.ay * inp.downstream[1] < 0) { c.ax = -c.ax; c.ay = -c.ay; }
    comps.push(c);
  }

  const isRiver = comps.map(c => {
    const hw = Math.max(0.5, c.maxD);
    if (!c.border || c.maxD * texel > inp.maxRiverHalfWidth || c.n / (hw * hw) < 9) return false;
    // Cut by one edge only: a river runs out through it (axis across the edge),
    // a bay or a lake cut by the edge lies along it
    const one = c.sides === 1 || c.sides === 2 ? 'x' : c.sides === 4 || c.sides === 8 ? 'y' : null;
    if (one === 'x') return Math.abs(c.ax) > 0.7;
    if (one === 'y') return Math.abs(c.ay) > 0.7;
    return true;
  });
  if (!isRiver.some(Boolean)) return out;

  const riverWet = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (wet[k] && isRiver[comp[k]]) { riverWet[k] = 1; river[k] = 1; }

  // ── Tangent field ─────────────────────────────────────────────────────────
  const ds = wetBlur(distT, riverWet, W, H, 1);
  let tx: Float32Array = new Float32Array(N), ty: Float32Array = new Float32Array(N);
  const tw = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    if (!riverWet[k]) continue;
    const x = k % W, y = (k - x) / W;
    const at = (i: number, j: number): number => {
      i = Math.min(W - 1, Math.max(0, i)); j = Math.min(H - 1, Math.max(0, j));
      return riverWet[j * W + i] ? ds[j * W + i] : 0;
    };
    const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5, gy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    const g = Math.hypot(gx, gy);
    const c = comps[comp[k]];
    let vx = c.ax, vy = c.ay, w = 0.05;
    if (g > 1e-4) {
      vx = -gy / g; vy = gx / g;
      if (vx * c.ax + vy * c.ay < 0) { vx = -vx; vy = -vy; }
      w = Math.min(1, g * 2);
    }
    tx[k] = vx * w; ty[k] = vy * w; tw[k] = w;
  }
  // Smooth the weighted tangents (fills the center line where the gradient
  // vanishes), then re-align raw tangents to the smoothed field and repeat
  for (let pass = 0; pass < 2; pass++) {
    const r = 2;
    const bx = wetBlur(tx, riverWet, W, H, r), by = wetBlur(ty, riverWet, W, H, r);
    for (let k = 0; k < N; k++) {
      if (!riverWet[k]) continue;
      const l = Math.hypot(bx[k], by[k]);
      if (l < 1e-6) { const c = comps[comp[k]]; bx[k] = c.ax; by[k] = c.ay; continue; }
      bx[k] /= l; by[k] /= l;
    }
    if (pass === 0) {
      for (let k = 0; k < N; k++) {
        if (!riverWet[k]) continue;
        if (tx[k] * bx[k] + ty[k] * by[k] < 0) { tx[k] = -tx[k]; ty[k] = -ty[k]; }
      }
    } else { tx = bx; ty = by; }
  }

  // ── Speed: narrows run faster, mid-channel faster than the banks ──────────
  let maxR = 1;
  for (let i = 0; i < comps.length; i++) if (isRiver[i]) maxR = Math.max(maxR, Math.ceil(comps[i].maxD));
  const localHW = wetMax(distT, riverWet, W, H, Math.min(maxR + 1, 12));
  for (let k = 0; k < N; k++) {
    if (!riverWet[k]) continue;
    const hw = Math.max(0.75, localHW[k]);
    const narrow = Math.min(2.4, Math.max(0.55, inp.refHalfWidth / (hw * texel)));
    const prof = 0.3 + 0.7 * Math.sqrt(Math.min(1, distT[k] / hw));
    const sp = inp.baseSpeed * narrow * prof;
    flow[k * 2] = tx[k] * sp; flow[k * 2 + 1] = ty[k] * sp;
    out.maxSpeed = Math.max(out.maxSpeed, sp);
  }

  // ── Foam: bends + narrows ─────────────────────────────────────────────────
  const tAt = (x: number, y: number): [number, number] => {
    const i = Math.min(W - 1, Math.max(0, Math.round(x))), j = Math.min(H - 1, Math.max(0, Math.round(y)));
    const k = j * W + i;
    return riverWet[k] ? [tx[k], ty[k]] : [0, 0];
  };
  for (let k = 0; k < N; k++) {
    if (!riverWet[k]) continue;
    const x = k % W, y = (k - x) / W;
    const s = 2;
    const a = tAt(x - tx[k] * s, y - ty[k] * s), b = tAt(x + tx[k] * s, y + ty[k] * s);
    if ((a[0] === 0 && a[1] === 0) || (b[0] === 0 && b[1] === 0)) continue;
    const curv = Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * s);   // 1 / texels
    const hw = Math.max(0.75, localHW[k]);
    const bend = sstep(0.04, 0.16, curv * hw);
    const nar = sstep(1.0, 1.9, inp.refHalfWidth / (hw * texel));
    // whitest toward the faster center of the channel
    const prof = Math.sqrt(Math.min(1, distT[k] / hw));
    foam[k] = Math.min(1, (bend * 0.75 + nar * 0.55) * (0.35 + 0.65 * prof));
  }

  // ── Rocks: a few boulders in the faster reaches, white water around and behind ──
  const dens = inp.rockDensity ?? 0;
  if (dens > 0) {
    const rnd = rng(inp.seed ?? 1);
    const cand: number[] = [];
    for (let k = 0; k < N; k++) if (riverWet[k] && distT[k] >= 1.5 && distT[k] <= Math.max(2, localHW[k] - 0.5)) cand.push(k);
    const want = Math.round(cand.length * dens / 100);
    for (let t = 0; t < want * 6 && out.rocks.length < want; t++) {
      const k = cand[Math.floor(rnd() * cand.length)];
      const x = k % W, y = (k - x) / W;
      if (out.rocks.some(r => Math.hypot(r.x - x, r.y - y) < 6)) continue;
      const r = 0.35 + 0.5 * rnd();
      out.rocks.push({ x: x + 0.5, y: y + 0.5, r });
    }
    for (const rk of out.rocks) {
      const k0 = Math.floor(rk.y) * W + Math.floor(rk.x);
      const ux = tx[k0] || 1, uy = ty[k0] || 0;
      const R = Math.ceil(rk.r * 8);
      for (let j = Math.floor(rk.y) - R; j <= Math.floor(rk.y) + R; j++) for (let i = Math.floor(rk.x) - R; i <= Math.floor(rk.x) + R; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const k = j * W + i;
        if (!riverWet[k]) continue;
        const dx = i + 0.5 - rk.x, dy = j + 0.5 - rk.y;
        const along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
        const ring = Math.exp(-Math.pow((Math.hypot(dx, dy) - rk.r * 1.3) / (rk.r * 0.6 + 0.3), 2));
        const wake = along > 0 ? Math.exp(-along / (rk.r * 5 + 1)) * Math.exp(-Math.pow(across / (rk.r * 1.1 + 0.4 + along * 0.15), 2)) : 0;
        foam[k] = Math.min(1, foam[k] + 0.9 * ring + 0.7 * wake);
      }
    }
  }
  return out;
}

/**
 * RGBA8 encoding for a flow texture: R/G = velocity / maxSpeed (0.5 = still),
 * B = foam, A = riverness. Returns the scale (world units / s at R or G = 1).
 */
export function encodeFlow(f: FlowField, data: Uint8Array): number {
  const scale = Math.max(1e-3, f.maxSpeed);
  const N = f.W * f.H;
  for (let k = 0; k < N; k++) {
    data[k * 4] = Math.round((f.flow[k * 2] / scale * 0.5 + 0.5) * 255);
    data[k * 4 + 1] = Math.round((f.flow[k * 2 + 1] / scale * 0.5 + 0.5) * 255);
    data[k * 4 + 2] = Math.round(Math.min(1, f.foam[k]) * 255);
    data[k * 4 + 3] = Math.round(f.river[k] * 255);
  }
  return scale;
}

/** Surface speed (world units / s) at a raster texel (0 outside / on still water). */
export function flowSpeedAt(f: FlowField, x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || j < 0 || i >= f.W || j >= f.H) return 0;
  const k = j * f.W + i;
  return Math.hypot(f.flow[k * 2], f.flow[k * 2 + 1]);
}
