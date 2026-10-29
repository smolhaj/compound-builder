/**
 * What a place has lying about because people live on it (docs/DECISIONS.md,
 * "Lived-in compound"). A pure planner: from what stands on the land (and how
 * long), who lives there (kids, dogs, animals, hay in the barn), the season
 * and the quality tier, it picks small props and where they go, each clustered
 * on the building it belongs to (the mat at the door, the pots at the porch
 * ends, the barrel at the downspout, the bales at the barn door, the swing in
 * the yard where the kids are) and never on a building, in the water, in a
 * wall, on a path, in front of a door or on another prop.
 *
 * Things come with time: a mat in a couple of days, pots and a woodpile in a
 * month or two, benches and a flagpole after a year. What came with the land
 * is old on the first day. Deterministic (a seed), no randomness left to chance.
 */
import { CELL, KIT, rotQ } from '../buildkit/kit';
import { roleOf, type Role } from '../../sim/paths';
import { PROP_R, M, type PropKind, type Season } from './propGeometry';

export interface LivedBuilding { id: string; kind: string; x: number; z: number; rot: number; ageDays: number }
export interface LivedFolks { kids: number; youngKids: number; adults: number; dogs: number; animals: number; hay: number; growing: boolean }

export type Mode = 'out' | 'porch' | 'inside';

export interface LivedCtx {
  seed: number;
  buildings: readonly LivedBuilding[];
  folks: LivedFolks;
  season: Season;
  /** Snow lying (shovels, snowmen) and the thaw's mud (boots at the door). */
  snow: boolean;
  mud: boolean;
  /** 0 Low, 1 Medium, 2 High. */
  tier: 0 | 1 | 2;
  /** The oldest thing on the place, days (what came with the land is old on day one). */
  placeAge: number;
  /** Where the drive leaves the road: the mailbox and the sign. */
  gate: { mail: { x: number; z: number; rot: number }; sign: { x: number; z: number; rot: number } } | null;
  /** A spot on the creek bank with the way to the water. */
  landing: { x: number; z: number; face: number } | null;
  /** Is a prop of radius r (units) here in the way of something fixed (a building of another kind than `self`, water, a wall, a trunk, the camp, the drive)? */
  blocked: (x: number, z: number, r: number, self: string, mode: Mode) => boolean;
  /** Distance to the nearest path (units; Infinity when none). */
  pathDist: (x: number, z: number) => number;
  /** The doors people come to (paths end there): kept clear. */
  doors: ReadonlyArray<readonly [number, number]>;
}

export interface LivedProp {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  /** Heading, radians (0 faces +z). */
  rot: number;
  porch: boolean;
  variant: number;
  count: number;
  seed: number;
  /** Which building it belongs to ('' = the place). */
  of: string;
}

/** A hard-packed gravel apron in front of a shop or at the drive's mouth (units; centered, `w` across, `d` deep, heading `rot`). */
export interface Apron { x: number; z: number; w: number; d: number; rot: number }

export interface LivedPlan { props: LivedProp[]; aprons: Apron[]; key: string }

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Slot in a building's frame: where, which way it faces (local heading), on the porch / inside the plot. */
interface Slot { lx: number; lz: number; rot?: number; mode?: Mode }

interface Want {
  kind: PropKind;
  /** Days of the building's life before it is there. */
  min: number;
  tier: 0 | 1 | 2;
  slots: Slot[];
  when?: boolean;
  count?: number;
  variant?: number;
}

const HALF_PI = Math.PI / 2;

/** What a building has, by role. The first slot that fits is taken. */
function wantsFor(b: LivedBuilding, ctx: LivedCtx, main: boolean): Want[] {
  const def = KIT[b.kind];
  if (!def) return [];
  const role: Role = roleOf(b.kind);
  const hw = def.cellsX * CELL / 2, hd = def.cellsZ * CELL / 2, p = def.porch;
  const f = ctx.folks, s = ctx.season, winter = s === 'winter', cold = winter || ctx.snow;
  const out: Want[] = [];
  const W = (w: Want) => out.push(w);
  const bigHome = (def.sleeps ?? 0) >= 4;
  if (role === 'home' || role === 'guest') {
    const front = p > 0 ? hd + p * 0.55 : hd + 0.11;
    W({ kind: 'doormat', min: 2, tier: 0, slots: [{ lx: 0, lz: front, mode: p > 0 ? 'porch' : 'out' }], variant: hash(b.id) });
    W({ kind: 'boots', min: 4, tier: 1, when: ctx.mud || cold, slots: [{ lx: hw * 0.3, lz: p > 0 ? hd + p * 0.45 : hd + 0.1, mode: p > 0 ? 'porch' : 'out' }], variant: hash(b.id + 'b') });
    W({ kind: 'lantern', min: 8, tier: 0, slots: [{ lx: -hw * 0.6, lz: hd + p + 0.38 }, { lx: hw * 0.6, lz: hd + p + 0.38 }], variant: hash(b.id) });
    const potSlots: Slot[][] = p > 0
      ? [[{ lx: -hw * 0.82, lz: hd + p * 0.6, mode: 'porch' }], [{ lx: hw * 0.82, lz: hd + p * 0.6, mode: 'porch' }], [{ lx: -hw * 0.55, lz: hd + p * 0.85, mode: 'porch' }], [{ lx: hw * 0.55, lz: hd + p * 0.85, mode: 'porch' }]]
      : [[{ lx: -hw * 0.5, lz: hd + 0.1 }], [{ lx: hw * 0.5, lz: hd + 0.1 }], [{ lx: -hw * 0.75, lz: hd + 0.1 }], [{ lx: hw * 0.75, lz: hd + 0.1 }]];
    [40, 75, 160, 300].forEach((min, k) => W({ kind: 'flowerpot', min, tier: k < 2 ? 1 : 2, slots: potSlots[k], variant: k + hash(b.id), when: !winter || k < 2 }));
    W({ kind: 'rainbarrel', min: 25, tier: 1, slots: [{ lx: hw + 0.07, lz: hd - 0.16, rot: HALF_PI }], variant: hash(b.id) });
    if (main) W({ kind: 'rainbarrel', min: 240, tier: 2, slots: [{ lx: -hw - 0.07, lz: hd - 0.16, rot: -HALF_PI }], variant: hash(b.id) + 1 });
    if (bigHome) {
      W({ kind: 'woodstack', min: 4, tier: 1, slots: [{ lx: 0.35, lz: -hd - 0.2, rot: Math.PI }, { lx: -0.4, lz: -hd - 0.2, rot: Math.PI }] });
      W({ kind: 'chopblock', min: 4, tier: 1, slots: [{ lx: -0.5, lz: -hd - 0.5 }, { lx: 0.5, lz: -hd - 0.55 }] });
    }
    W({ kind: 'birdfeeder', min: 50, tier: 2, slots: [{ lx: hw + 0.9, lz: hd + 0.3 }, { lx: -hw - 0.9, lz: hd + 0.3 }] });
    W({ kind: 'chairs', min: 120, tier: 1, when: !winter && main, slots: [{ lx: -hw - 1.05, lz: hd + 0.55, rot: 0.3 }, { lx: hw + 1.05, lz: hd + 0.55, rot: -0.3 }], variant: hash(b.id) });
    W({ kind: 'hosereel', min: 60, tier: 2, slots: [{ lx: hw + 0.03, lz: hd * 0.35, rot: HALF_PI }] });
    if (main) W({ kind: 'flagpole', min: 330, tier: 2, slots: [{ lx: hw + 1.2, lz: hd + 0.95 }, { lx: -hw - 1.2, lz: hd + 0.95 }] });
    W({ kind: 'leafpile', min: 0, tier: 2, when: s === 'fall', slots: [{ lx: hw + 0.95, lz: hd + 0.7 }, { lx: -hw - 0.95, lz: hd + 0.7 }], variant: hash(b.id) });
    W({ kind: 'shovel', min: 0, tier: 1, when: winter && ctx.snow, slots: [{ lx: -hw * 0.85, lz: hd + 0.03, mode: 'out' }] });
    if (f.kids > 0 && f.youngKids > 0 && main) {
      W({ kind: 'swingset', min: 20, tier: 1, slots: [{ lx: hw + 1.7, lz: hd + 0.8 }, { lx: -hw - 1.9, lz: hd + 0.8 }, { lx: hw + 1.8, lz: -hd * 0.3 }, { lx: -hw - 2.0, lz: -hd * 0.3 }], variant: hash(b.id) });
      W({ kind: 'sandbox', min: 40, tier: 2, when: !cold, slots: [{ lx: -hw - 1.2, lz: hd + 0.15 }, { lx: hw + 1.2, lz: hd + 0.15 }], variant: hash(b.id) });
      W({ kind: 'wagon', min: 15, tier: 2, slots: [{ lx: hw + 0.75, lz: hd + 0.25, rot: 0.8 }, { lx: -hw - 0.75, lz: hd + 0.25, rot: -0.8 }] });
      W({ kind: 'ball', min: 12, tier: 2, slots: [{ lx: hw + 0.5, lz: hd + 0.85 }, { lx: -hw - 0.5, lz: hd + 0.85 }], variant: hash(b.id) });
      W({ kind: 'kidbike', min: 30, tier: 2, when: f.kids > 1 && !cold, slots: [{ lx: -hw - 0.55, lz: hd + 0.5, rot: 1.2 }, { lx: hw + 0.55, lz: hd + 0.5, rot: -1.2 }] });
      W({ kind: 'snowman', min: 0, tier: 1, when: winter && ctx.snow, slots: [{ lx: -hw - 1.1, lz: hd + 0.95 }, { lx: hw + 1.1, lz: hd + 0.95 }] });
    }
    if (f.dogs > 0 && main) {
      W({ kind: 'dogbed', min: 3, tier: 1, slots: [{ lx: hw * 0.62, lz: p > 0 ? hd + p * 0.55 : hd + 0.12, mode: p > 0 ? 'porch' : 'out' }], variant: hash(b.id) });
      if (f.dogs > 1) W({ kind: 'doghouse', min: 40, tier: 2, slots: [{ lx: -hw - 0.55, lz: -hd - 0.2, rot: Math.PI * 0.8 }, { lx: hw + 0.55, lz: -hd - 0.2, rot: -Math.PI * 0.8 }], variant: hash(b.id) });
    }
  } else if (role === 'barn') {
    const bales = f.animals > 0 ? Math.min(14, 3 + Math.round(f.hay / 3)) : 2;
    W({ kind: 'haybales', min: 3, tier: 1, slots: [{ lx: -hw * 0.62, lz: hd + 0.45 }, { lx: -hw - 0.55, lz: hd * 0.2, rot: -HALF_PI }], count: bales, variant: hash(b.id) });
    W({ kind: 'trough', min: 12, tier: 1, when: f.animals > 0, slots: [{ lx: hw + 0.32, lz: hd * 0.2, rot: HALF_PI }, { lx: hw + 0.32, lz: -hd * 0.4, rot: HALF_PI }] });
    W({ kind: 'yardlight', min: 15, tier: 0, slots: [{ lx: hw * 0.35, lz: hd + 0.55 }, { lx: -hw * 0.2, lz: hd + 0.55 }] });
    W({ kind: 'wheelbarrow', min: 15, tier: 1, slots: [{ lx: hw * 0.62, lz: hd + 0.42, rot: 0.5 }, { lx: hw * 0.45, lz: hd + 0.5, rot: 0.5 }], variant: hash(b.id) });
    W({ kind: 'tools', min: 25, tier: 1, slots: [{ lx: hw * 0.8, lz: hd + 0.03 }, { lx: hw * 0.3, lz: hd + 0.03 }], variant: hash(b.id) });
    W({ kind: 'drum', min: 60, tier: 2, slots: [{ lx: -hw - 0.25, lz: -hd * 0.5, rot: -HALF_PI }], variant: hash(b.id) });
  } else if (role === 'coop') {
    W({ kind: 'eggcrate', min: 10, tier: 2, slots: [{ lx: hw * 0.4, lz: hd + 0.22, rot: 0.3 }] });
    W({ kind: 'yardlight', min: 40, tier: 1, slots: [{ lx: -hw * 0.5, lz: hd + 0.5 }] });
  } else if (role === 'work' || role === 'gate') {
    if (b.kind === 'gate_garage') {
      W({ kind: 'yardlight', min: 4, tier: 0, slots: [{ lx: hw * 0.5, lz: hd + 0.5 }, { lx: -hw * 0.5, lz: hd + 0.5 }] });
    } else if (b.kind === 'equipment_yard') {
      // a fenced gravel yard of marked bays: a light at the gate and nothing else (the implements stand in the bays)
      W({ kind: 'yardlight', min: 6, tier: 0, slots: [{ lx: hw * 0.55, lz: hd + 0.5 }, { lx: -hw * 0.55, lz: hd + 0.5 }] });
    } else {
      W({ kind: 'yardlight', min: 10, tier: 0, slots: [{ lx: hw * 0.55, lz: hd + 0.6 }, { lx: -hw * 0.55, lz: hd + 0.6 }] });
      W({ kind: 'sawhorses', min: 35, tier: 1, slots: [{ lx: hw + 0.42, lz: hd * 0.25, rot: HALF_PI }, { lx: -hw - 0.42, lz: hd * 0.25, rot: -HALF_PI }] });
      W({ kind: 'wheelbarrow', min: 20, tier: 1, slots: [{ lx: -hw * 0.5, lz: hd + 0.45, rot: -0.4 }, { lx: hw * 0.3, lz: hd + 0.5, rot: 0.4 }], variant: hash(b.id) });
      W({ kind: 'tools', min: 20, tier: 1, slots: [{ lx: hw * 0.7, lz: hd + 0.03 }, { lx: -hw * 0.75, lz: hd + 0.03 }], variant: hash(b.id) });
      W({ kind: 'lumber', min: 80, tier: 2, slots: [{ lx: -hw - 0.45, lz: hd * 0.05, rot: -HALF_PI }, { lx: hw + 0.45, lz: -hd * 0.1, rot: HALF_PI }], variant: hash(b.id) });
      W({ kind: 'drum', min: 15, tier: 2, slots: [{ lx: hw + 0.25, lz: -hd * 0.55, rot: HALF_PI }, { lx: -hw - 0.25, lz: -hd * 0.6, rot: -HALF_PI }], variant: hash(b.id) });
      W({ kind: 'tires', min: 100, tier: 2, slots: [{ lx: -hw - 0.35, lz: -hd * 0.62 }, { lx: hw + 0.35, lz: -hd * 0.62 }] });
    }
  } else if (role === 'garden') {
    if (b.kind === 'garden') {
      W({ kind: 'gardengate', min: 15, tier: 1, slots: [{ lx: -0.09, lz: hd - 0.04, mode: 'inside' }] });
      W({ kind: 'trellis', min: 100, tier: 1, slots: [{ lx: hw + 0.32, lz: -hd * 0.2, rot: HALF_PI }, { lx: -hw - 0.32, lz: -hd * 0.2, rot: -HALF_PI }], variant: hash(b.id) });
    } else if (b.kind === 'field') {
      W({ kind: 'scarecrow', min: 25, tier: 1, when: f.growing, slots: [{ lx: -hw * 0.45, lz: hd - 0.2, mode: 'inside' }], variant: hash(b.id) });
    }
  } else if (role === 'greenhouse') {
    // the hobby house and the production house (a potting bench against the end wall, outside the glass)
    W({ kind: 'pottingbench', min: 25, tier: 1, slots: [{ lx: hw + 0.36, lz: 0.05, rot: HALF_PI }, { lx: -hw - 0.36, lz: 0.05, rot: -HALF_PI }], variant: hash(b.id) });
  } else if (role === 'bank') {
    // a bench on the bank, a little off to one side of where the walk arrives, facing the water
    W({ kind: 'bench', min: 30, tier: 1, slots: [{ lx: hw * 0.55, lz: hd + 0.32, rot: Math.PI }, { lx: -hw * 0.55, lz: hd + 0.32, rot: Math.PI }, { lx: hw * 0.85, lz: hd + 0.32, rot: Math.PI }], variant: hash(b.id) });
  } else if (role === 'water') {
    if (b.kind === 'well_hand' || b.kind === 'well_drilled') W({ kind: 'wellapron', min: 15, tier: 1, slots: [{ lx: 0, lz: hd + 0.12 }, { lx: 0, lz: -hd - 0.12 }], variant: hash(b.id) });
  } else if (role === 'power') {
    if (b.kind === 'generator_shed') W({ kind: 'fuelcans', min: 8, tier: 1, slots: [{ lx: hw + 0.16, lz: 0.0, rot: HALF_PI }, { lx: -hw - 0.16, lz: 0.0, rot: -HALF_PI }] });
  }
  return out;
}

/** Count and size tiers: how many of a thing a place has after so many days (bales, pots keep their own list). */
export function planLived(ctx: LivedCtx): LivedPlan {
  const props: LivedProp[] = [], placed: Array<{ x: number; z: number; r: number }> = [];
  const aprons: Apron[] = [];
  const homes = ctx.buildings.filter(b => KIT[b.kind]?.sleeps > 0).sort((a, b) => KIT[b.kind].sleeps - KIT[a.kind].sleeps || a.id.localeCompare(b.id));
  // the house first, so it gets its place before the sheds do
  const order = [...homes.slice(0, 1), ...ctx.buildings.filter(b => b !== homes[0]).sort((a, b) => a.id.localeCompare(b.id))];
  const near = (x: number, z: number, r: number): boolean => placed.some(q => Math.hypot(q.x - x, q.z - z) < q.r + r);
  const fits = (x: number, z: number, r: number, self: string, mode: Mode): boolean => {
    if (near(x, z, r)) return false;
    if (ctx.blocked(x, z, r, self, mode)) return false;
    if (mode !== 'porch' && ctx.pathDist(x, z) < r + 0.1) return false;
    if (mode !== 'porch') for (const d of ctx.doors) if (Math.hypot(d[0] - x, d[1] - z) < 0.22 + r * 0.6) return false;
    return true;
  };
  const put = (kind: PropKind, x: number, z: number, rot: number, o: { porch?: boolean; variant?: number; count?: number; of: string; n: number; scale?: number }): void => {
    const r = PROP_R[kind] * M * (o.scale ?? 1);
    placed.push({ x, z, r });
    props.push({ id: `${o.of}:${kind}:${o.n}`, kind, x, z, rot, porch: !!o.porch, variant: o.variant ?? 0, count: o.count ?? 1, seed: hash(`${o.of}${kind}${o.n}`) ^ ctx.seed, of: o.of });
  };
  // by tier first, so what Low has is exactly what Medium and High have too (a higher tier never moves a lower tier's props)
  const counts = new Map<string, number>();
  for (let tier = 0; tier <= ctx.tier; tier++) {
    for (const b of order) {
      const def = KIT[b.kind];
      if (!def) continue;
      const main = b === homes[0];
      for (const w of wantsFor(b, ctx, main)) {
        if (w.tier !== tier || w.when === false || b.ageDays < w.min) continue;
        const r = PROP_R[w.kind] * M;
        for (const sl of w.slots) {
          const [dx, dz] = rotQ(sl.lx, sl.lz, b.rot), x = b.x + dx, z = b.z + dz;
          const mode = sl.mode ?? 'out';
          if (!fits(x, z, r, b.id, mode)) continue;
          const n = counts.get(b.id) ?? 0;
          counts.set(b.id, n + 1);
          put(w.kind, x, z, (sl.rot ?? 0) + b.rot * HALF_PI, { porch: mode === 'porch', variant: w.variant, count: w.count, of: b.id, n });
          break;
        }
      }
      // a vehicle apron in front of the shop and the garage: gravel packed hard where the trucks stand
      if (tier === 1 && roleOf(b.kind) === 'work' && b.kind !== 'gate_garage' && b.kind !== 'equipment_yard' && b.ageDays >= 5) {
        const [ax, az] = rotQ(0, def.cellsZ * CELL / 2 + 0.36, b.rot);
        aprons.push({ x: b.x + ax, z: b.z + az, w: def.cellsX * CELL + 0.5, d: 0.62, rot: b.rot * HALF_PI });
      }
    }
  }
  // the place: the mailbox at the road, the sign inside the gate, a bench on the creek bank
  if (ctx.gate) {
    if (ctx.placeAge >= 6 && fits(ctx.gate.mail.x, ctx.gate.mail.z, PROP_R.mailbox * M, '', 'porch')) put('mailbox', ctx.gate.mail.x, ctx.gate.mail.z, ctx.gate.mail.rot, { of: '', n: 0, variant: ctx.seed });
    if (ctx.placeAge >= 150 && ctx.tier >= 1 && fits(ctx.gate.sign.x, ctx.gate.sign.z, PROP_R.sign * M, '', 'out')) put('sign', ctx.gate.sign.x, ctx.gate.sign.z, ctx.gate.sign.rot, { of: '', n: 1, variant: ctx.seed });
  }
  if (ctx.landing && ctx.placeAge >= 120 && ctx.tier >= 1) {
    const l = ctx.landing;
    if (fits(l.x, l.z, PROP_R.bench * M, '', 'porch')) put('bench', l.x, l.z, l.face, { of: '', n: 2, variant: ctx.seed });
  }
  return { props, aprons, key: props.map(p => `${p.id}${p.variant}${p.count}`).join('|') };
}
