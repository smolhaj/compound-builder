/**
 * Crop blight and pest plague (WP7, docs/scenarios/crop_blight.md): a new strain takes whole crop families, not the garden alike.
 * The cut on a field depends on its crop family (late blight takes potatoes, rust takes wheat, locusts take the grains and the greens
 * and spare what grows under the ground), how it was grown (the same crop twice, one crop everywhere) and which seed it came from
 * (the new strain beats hybrid resistance; an heirloom line and your own saved seed carry some tolerance, and the saved line learns).
 * `blightCut` is multiplied into `crops.troubleFactor`, so the Farm tab's trouble column and the harvest agree. State: `disaster.fx.blight`.
 */
import type { GameState } from './state';
import { calendarOf, dayIndex } from './state';
import { farmOf } from './farm';
import type { CropId, SeedLine } from './crops';
import type { FxCard, FxCtx, FxGoal } from './disasterFx';
import { eatFrom } from './pantry';

export type BlightId = 'rust' | 'late_blight' | 'locusts';
export interface BlightDef { id: BlightId; name: string; /** Yield share left at full intensity, by crop (rest and unlisted are 1). */ left: Partial<Record<CropId, number>>; /** Share of the garden, orchard and greens left. */ garden: number }
export const BLIGHTS: Record<BlightId, BlightDef> = {
  rust: { id: 'rust', name: 'a new wheat rust', left: { wheat: 0.35, beans: 0.9, potatoes: 0.92 }, garden: 0.9 },
  late_blight: { id: 'late_blight', name: 'a late blight that goes through everything wet', left: { potatoes: 0.3, beans: 0.8, wheat: 0.88 }, garden: 0.8 },
  locusts: { id: 'locusts', name: 'a locust plague', left: { wheat: 0.5, beans: 0.55, potatoes: 0.85 }, garden: 0.55 },
};
export interface BlightFx { v: BlightId; asked: string[]; shared: number; refused: number; seedRule: 'saved' | 'heirloom' | null; keptSeed: boolean; theft: number }

export const blightKind = (s: GameState): boolean => s.disaster.kind === 'crop_blight';
export const blightDef = (s: GameState): BlightDef => BLIGHTS[(s.disaster.variant as BlightId)] ?? BLIGHTS.rust;
export function blightOf(s: GameState): BlightFx {
  const bag = (s.disaster.fx ??= {});
  if (bag.blight) return bag.blight as BlightFx;
  const f: BlightFx = { v: blightDef(s).id, asked: [], shared: 0, refused: 0, seedRule: null, keptSeed: false, theft: 0 };
  bag.blight = f;
  return f;
}

/** How hard the strain bites in the growing years after the hit: full the first year, half the second, gone after (the fate can end it sooner). */
export function intensity(s: GameState): number {
  if (!blightKind(s) || s.clock.t < s.disaster.hitAt) return 0;
  const y = (s.clock.t - s.disaster.hitAt) / 365;
  const base = y < 1 ? 1 : y < 2 ? 0.5 : 0;
  return base * (s.disaster.difficulty === 'cozy' ? 0.7 : s.disaster.difficulty === 'hardcore' ? 1.15 : 1);
}

/** Distinct crops sown on the place's fields this year (diversity). */
export function diversity(s: GameState): number {
  const P = farmOf(s).plots ?? {}, { year } = calendarOf(s.clock);
  return new Set(Object.values(P).filter(p => p.kind === 'field' && p.sown?.y === year && p.crop).map(p => p.crop)).size;
}

/** The share of a field's crop left after the strain, 1 when it does not apply. Pure of everything but the numbers. */
export function cutFor(def: BlightDef, intensityNow: number, crop: CropId, line: SeedLine | undefined, rotated: boolean, mix: number): number {
  if (intensityNow <= 0) return 1;
  const left = def.left[crop];
  if (left === undefined) return 1;
  let loss = (1 - left) * intensityNow;
  loss *= rotated ? 0.7 : 1.35;                       // the same crop twice in a row feeds it
  loss *= line === 'heirloom' ? 0.85 : line === 'saved' ? 0.75 : line === 'volunteer' ? 1.1 : 1;   // hybrid resistance does not hold against it
  loss *= mix >= 3 ? 0.8 : mix <= 1 ? 1.2 : 1;           // a mixed planting slows the spread
  return Math.max(0.05, 1 - Math.min(0.95, loss));
}

/** What `crops.troubleFactor` multiplies in: this plot's share left. */
export function blightCut(s: GameState, p: { crop: CropId | null; prev: CropId | null; sown?: { line: SeedLine } }): number {
  const i = intensity(s);
  if (i <= 0 || !p.crop) return 1;
  return cutFor(blightDef(s), i, p.crop, p.sown?.line, p.prev !== p.crop, diversity(s));
}

/** The garden, orchard and greens (the `supplyMods` grow multiplier). */
export function gardenGrow(s: GameState): number {
  const i = intensity(s);
  return i <= 0 ? 1 : 1 - (1 - blightDef(s).garden) * Math.min(1, i);
}

/** Once a day: a hungry neighbor comes asking, theft grows when the shelves are bare; one clean log line at the first sign. */
export function blightDaily(s: GameState, ctx: FxCtx): string[] {
  const f = blightOf(s), d = blightDef(s), out: string[] = [], doy = calendarOf(s.clock).doy;
  if (doy >= 190 && doy <= 200 && ctx.once(`blight_seen_${calendarOf(s.clock).year}`) && intensity(s) > 0) out.push(`${d.name[0].toUpperCase() + d.name.slice(1)} is in the fields this summer. ${d.id === 'rust' ? 'The wheat is orange to the knee.' : d.id === 'late_blight' ? 'The potato leaves are black and the smell is sweet and rotten.' : 'The sky over the beans is brown and moving.'}`);
  // the neighbors run short of their own: they ask after the hungry gap begins
  if (ctx.day >= 45 && ctx.day % 21 === 0 && ctx.r() < 0.6) {
    const n = s.neighbors.filter(x => x.status === 'home')[Math.floor(ctx.r() * 4) % Math.max(1, s.neighbors.length)];
    if (n && !f.asked.includes(`hungry_${n.id}_${Math.floor(ctx.day / 21)}`)) { f.asked.push(`hungry_${n.id}_${Math.floor(ctx.day / 21)}`); f.asked.push('open_hungry'); out.push(`${n.name[0].toUpperCase() + n.name.slice(1)} are out of potatoes and flour. They are at the gate.`); }
  }
  return out;
}

export function blightBulletin(s: GameState, ctx: FxCtx): { text: string; tone: 0 | 1 | 2 | 3 } | null {
  const d = blightDef(s);
  if (ctx.r() > 0.5) return null;
  const i = intensity(s);
  if (ctx.day < 20) return { text: d.id === 'locusts' ? 'locusts are stripping fields two counties south. Grain prices doubled at the elevator.' : `the extension service confirms ${d.name} in the county. Do not save seed from this year's affected plants without checking.`, tone: 2 };
  if (i >= 1) return { text: ['the elevator has stopped buying: there is nothing to buy.', 'seed potatoes and seed wheat are being hoarded; some sell for ten times the price.', 'rotate, mix your plantings and save your own seed: the hybrid lines are failing first.'][ctx.day % 3], tone: 2 };
  if (i > 0) return { text: 'the second year looks better: the strain is thinning where fields were rotated and mixed.', tone: 0 };
  return { text: 'the strain has burned itself out. Plant a diverse crop and keep seed back.', tone: 0 };
}

export function blightCards(s: GameState): FxCard[] {
  const f = blightOf(s), cards: FxCard[] = [], i = intensity(s) || (s.clock.t < s.disaster.hitAt ? 0.5 : 0);
  if (i > 0 && f.seedRule === null) cards.push({ id: 'bl_seed', title: 'What seed to sow', urgency: 72, why: 'The new strain beats hybrid seed. Your own saved seed is the best bet, and an heirloom line the next best; a mix of crops slows the spread. Pick which seed goes in the ground first.',
    acts: [{ label: 'Saved seed first', choice: 'bl:saved' }, { label: 'Heirloom first', choice: 'bl:heirloom' }] });
  if (f.asked.includes('open_hungry') && s.neighbors.some(n => n.status === 'home')) cards.push({ id: 'bl_hungry', title: 'Hungry neighbors at the gate', urgency: 88, why: 'They lost the crop. A sack of flour and potatoes buys real trust, and a closed gate means resentment, and some night, a theft from the field.',
    acts: [{ label: 'Share a sack (about 40,000 calories)', choice: 'bl:share' }, { label: 'Turn them away', choice: 'bl:refuse' }] });
  return cards;
}

export function blightChoose(s: GameState, choice: string): string | null {
  if (!choice.startsWith('bl:')) return null;
  const f = blightOf(s), k = choice.slice(3);
  if (k === 'saved' || k === 'heirloom') { f.seedRule = k; return k === 'saved' ? 'Your own saved seed goes in first. Seed saved from healthy plants is kept back at harvest.' : 'Heirloom seed goes in first.'; }
  if (k === 'share' || k === 'refuse') {
    f.asked = f.asked.filter(x => x !== 'open_hungry');
    const n = s.neighbors.find(x => x.status === 'home'); if (!n) return null;
    if (k === 'share') { const e = eatFrom(s, 'staples', 40000); f.shared++; n.disposition += 18; return e.eff <= 0 ? 'There was nothing to spare in the pantry.' : `${n.name[0].toUpperCase() + n.name.slice(1)} took the sack and cried. They will not forget it.`; }
    f.refused++; n.disposition -= 12; return `${n.name[0].toUpperCase() + n.name.slice(1)} went home in silence.`;
  }
  return null;
}

export function blightGoal(s: GameState): FxGoal {
  const f = blightOf(s), i = intensity(s);
  return { id: 'blight', title: 'Feed the year after the blight', steps: [
    { label: 'Choose the seed that goes in first', done: f.seedRule !== null },
    { label: 'Grow three different crops in one year', done: diversity(s) >= 3 },
    { label: 'Share with a hungry neighbor', done: f.shared > 0 },
    { label: 'Reach the second year with seed in the store', done: s.clock.t > s.disaster.hitAt + 365 && i <= 0.5 },
  ] };
}

export const blightDay = (s: GameState): number => dayIndex(s.clock.t);
