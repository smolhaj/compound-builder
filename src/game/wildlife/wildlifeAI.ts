/**
 * What the drawn animals do (pure, tested): graze with their heads down, wander a short way, lift their
 * heads when a person comes near and bolt when one comes closer (people and dogs; a predator holds its
 * ground longer), then settle again. Positions stay in the places the sim allows: inside the wall or
 * outside it when a wall holds them (sim/wildlife.ts `side`), never in a building or the creek.
 */
import { SPECIES, type SpeciesId } from '../../sim/wildlife';

export type Mood = 'graze' | 'walk' | 'alert' | 'flee';
export interface Beast {
  id: string;
  sp: SpeciesId;
  x: number; z: number; rot: number;
  /** Where it ranges from (a herd shares one). */
  hx: number; hz: number;
  tx: number; tz: number;
  mood: Mood;
  /** Seconds left in the mood. */
  t: number;
  phase: number;
  /** 0–1: fades in and out as animals come and go with the hour. */
  vis: number;
  want: boolean;
  /** Smoothed head height: 0 down at the grass, 1 up. */
  head: number;
  /** Speed now (world units per second), for the legs. */
  v: number;
  male: boolean;
  side: 'free' | 'in' | 'out';
  group: number;
  /** Per-animal random in [0,1) (tone, timing). */
  k: number;
}

export interface StepCtx {
  threats: ReadonlyArray<readonly [number, number]>;
  allowed: (x: number, z: number, b: Beast) => boolean;
  rnd: () => number;
  /** Time scale (1 at 1×, up to 3 at fast-forward). */
  speedK: number;
}

/** Speeds in world units per second at 1×: a person walks 0.5, so a deer walks slowly and bolts fast. */
export function speeds(sp: SpeciesId): { walk: number; run: number } {
  switch (sp) {
    case 'deer': case 'elk': case 'antelope': return { walk: 0.2, run: 1.5 };
    case 'moose': return { walk: 0.22, run: 1.1 };
    case 'javelina': return { walk: 0.16, run: 1.0 };
    case 'rabbit': return { walk: 0.1, run: 1.3 };
    case 'squirrel': return { walk: 0.12, run: 1.2 };
    case 'turkey': case 'grouse': return { walk: 0.14, run: 0.8 };
    case 'waterfowl': return { walk: 0.1, run: 0.5 };
    case 'bear': return { walk: 0.22, run: 1.0 };
    case 'cougar': case 'wolf': case 'coyote': return { walk: 0.28, run: 1.5 };
  }
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/** Nearest threat: distance and the unit vector away from it. */
export function nearestThreat(b: Pick<Beast, 'x' | 'z'>, threats: StepCtx['threats']): { d: number; ax: number; az: number } {
  let best = { d: Infinity, ax: 0, az: 0 };
  for (const [tx, tz] of threats) {
    const d = dist(b.x, b.z, tx, tz);
    if (d < best.d) best = { d, ax: d > 1e-6 ? (b.x - tx) / d : 1, az: d > 1e-6 ? (b.z - tz) / d : 0 };
  }
  return best;
}

/** Pick a new wander target near home. */
function newTarget(b: Beast, ctx: StepCtx): void {
  const sd = SPECIES[b.sp], R = sd.kind === 'hoofed' ? 4 : sd.kind === 'predator' ? 5 : 2.4;
  for (let i = 0; i < 8; i++) {
    const a = ctx.rnd() * Math.PI * 2, r = (0.3 + ctx.rnd() * 0.7) * R;
    const x = b.hx + Math.cos(a) * r, z = b.hz + Math.sin(a) * r;
    if (ctx.allowed(x, z, b)) { b.tx = x; b.tz = z; return; }
  }
  b.tx = b.x; b.tz = b.z;
}

/** Advance one animal by `dt` real seconds. */
export function stepBeast(b: Beast, dt: number, ctx: StepCtx): void {
  const sd = SPECIES[b.sp], sp = speeds(b.sp), k = Math.max(1, Math.min(3, ctx.speedK));
  b.vis += ((b.want ? 1 : 0) - b.vis) * Math.min(1, dt * 1.2);
  const th = nearestThreat(b, ctx.threats);
  // a bear or cougar does not run from the first person it sees; a deer does
  const fear = sd.fear;
  if (th.d < fear && b.mood !== 'flee') {
    b.mood = 'flee'; b.t = 2.5 + ctx.rnd() * 2;
    const a = Math.atan2(th.az, th.ax) + (ctx.rnd() - 0.5) * 0.9;
    b.tx = b.x + Math.cos(a) * 5; b.tz = b.z + Math.sin(a) * 5;
  } else if (th.d < fear * 2 && b.mood === 'graze') { b.mood = 'alert'; b.t = 1.5 + ctx.rnd(); }
  b.t -= dt;
  if (b.mood === 'flee') {
    if (b.t <= 0 && th.d > fear * 1.4) { b.mood = 'alert'; b.t = 2; }
    else if (b.t <= 0) { b.t = 1; b.tx = b.x + th.ax * 4; b.tz = b.z + th.az * 4; }
  } else if (b.mood === 'alert') {
    if (th.d < fear * 2) b.t = Math.max(b.t, 0.6);
    else if (b.t <= 0) { b.mood = 'graze'; b.t = 3 + ctx.rnd() * 6; }
  } else if (b.mood === 'graze') {
    if (b.t <= 0) { b.mood = 'walk'; newTarget(b, ctx); b.t = 12; }
  } else if (b.mood === 'walk' && (dist(b.x, b.z, b.tx, b.tz) < 0.1 || b.t <= 0)) {
    b.mood = 'graze'; b.t = 4 + ctx.rnd() * 10;
    // now and then the whole range drifts
    if (ctx.rnd() < 0.2) { const nx = b.hx + (ctx.rnd() - 0.5) * 6, nz = b.hz + (ctx.rnd() - 0.5) * 6; if (ctx.allowed(nx, nz, b)) { b.hx = nx; b.hz = nz; } }
  }
  // move
  let v = 0;
  if (b.mood === 'walk' || b.mood === 'flee') {
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    if (d > 0.02) {
      v = (b.mood === 'flee' ? sp.run : sp.walk) * k;
      const step = Math.min(d, v * dt), nx = b.x + dx / d * step, nz = b.z + dz / d * step;
      if (ctx.allowed(nx, nz, b)) { b.x = nx; b.z = nz; }
      else { v = 0; b.mood = b.mood === 'flee' ? 'alert' : 'graze'; b.t = 1.5; }
      b.rot += wrap(Math.atan2(dx, dz) - b.rot) * Math.min(1, dt * (b.mood === 'flee' ? 10 : 4));
    }
  }
  b.v = v;
  b.phase += dt * v * 9 / Math.max(0.05, sd.h * 6);
  const up = b.mood === 'alert' || b.mood === 'flee' ? 1 : b.mood === 'walk' ? 0.55 : 0;
  b.head += (up - b.head) * Math.min(1, dt * 4);
}
