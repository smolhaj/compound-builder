/**
 * Walkers (WP4, docs/scenarios/zombies.md): the infection and the crowd at the wall.
 *
 * Pure part (no GameState): bite chance by clothing, incubation hours, decay stages, freeze and thaw, the compound's signature in feet,
 * the nightly crowd, wall load in pounds per foot against what each wall holds.
 * State part (`walkerNight`, `biteCards`, ...): one night a day from the hit, bites on the wall duty and at the gate, the 24-hour rule,
 * the turn, the family-bite card, every death rising in the sleeper variant. State lives in `disaster.fx.zombies`.
 */
import type { GameState } from './state';
import { calendarOf, dayIndex } from './state';
import { mulberry32 } from './rng';
import { PERIMETER, runFinished, wallLength, type PerimeterKind, type PerimeterRun } from './perimeter';
import { nightOf } from './housing';
import { genRunning, genSound } from './blackout';
import { nightNoise, partyNoise, setStealth } from './stealth';
import { stealthOf, dogsQuiet } from './stealthState';
import { isFinished } from './construction';
import { runBill } from './perimeter';
import type { FxCard, FxCtx, FxGoal } from './disasterFx';

export type ZVariant = 'outbreak' | 'everyone_turns' | 'rage';
export type Clothing = 'bare' | 'heavy' | 'padded';
export type Stage = 'fresh' | 'rotting' | 'desiccated' | 'spent';
export const FT_PER_UNIT = 19.7;   // one world unit is about 6 m

// ── pure: the infection ──

/** Chance a bite infects, by what the person wore (Standard; Cozy halves, Hardcore adds ten points). The 3 kinds match the doc: bare 85, heavy 40, a bite suit 10. */
export function biteChance(c: Clothing, diff: 'cozy' | 'standard' | 'hardcore'): number {
  const base = c === 'bare' ? 0.85 : c === 'heavy' ? 0.4 : 0.1;
  return Math.min(0.95, diff === 'cozy' ? base / 2 : diff === 'hardcore' ? base + 0.1 : base);
}
/** Hours from the bite to the fever: 2 to 18, median 8, shorter for head and neck, longer for a hand. */
export function incubationHours(r: () => number, site: 'head' | 'body' | 'hand' = 'body'): number {
  const u = (r() + r()) / 2;   // a bump near the middle
  const h = 2 + u * 16, k = site === 'head' ? 0.55 : site === 'hand' ? 1.25 : 1;
  return Math.max(2, Math.min(18, h * k));
}
/** Hours of fever and collapse before the death (2 to 10). */
export const feverHours = (r: () => number): number => 2 + r() * 8;
/** The 24-hour rule: share of turnings that are over inside a day (95 percent). */
export const within24 = (incub: number, fever: number): boolean => incub + fever <= 24;

// ── pure: the walkers' bodies ──

export const STAGE_TABLE: Record<Stage, { speedMph: number; pushLb: number; bite: number; from: number }> = {
  fresh: { speedMph: 1.2, pushLb: 35, bite: 1, from: 0 }, rotting: { speedMph: 0.9, pushLb: 28, bite: 1, from: 30 },
  desiccated: { speedMph: 0.5, pushLb: 15, bite: 0.5, from: 180 }, spent: { speedMph: 0, pushLb: 0, bite: 0, from: 540 },
};
export const stageOf = (effDays: number): Stage => effDays >= 540 ? 'spent' : effDays >= 180 ? 'desiccated' : effDays >= 30 ? 'rotting' : 'fresh';
/** Decay days that pass in a real day: none under freezing, 1.6 in heat, 1.3 in a humid month. */
export const decayRate = (lowF: number, highF: number): number => lowF < 32 && highF < 40 ? 0 : highF > 85 ? 1.6 : 1;
/** How mobile they are on a night with this low: stop under 10 F, stiff under 20 F. */
export const mobility = (lowF: number): number => lowF < 10 ? 0 : lowF < 20 ? 0.4 : 1;

// ── pure: the signature, the crowd, the wall ──

export interface Signature { noiseFt: number; lightFt: number; ft: number; why: string[] }
/** Noise and light the compound gives off on a night, in feet. Shots linger as `shotFt` (decaying); a masonry house hides half the talk. */
export function signatureOf(i: { generator: boolean; genK: number; dogs: number; stock: number; party: number; dark: boolean; curtains: number; floods: number; windows: number; shotFt: number; rain: boolean }): Signature {
  const why: string[] = [];
  let noise = 0;
  if (i.generator) { noise = Math.max(noise, 900 * i.genK); why.push('the generator'); }
  noise = Math.max(noise, i.dogs * 360 + i.stock * 500 + i.party * 250);
  if (i.dogs > 0) why.push('dogs'); if (i.stock > 0) why.push('stock'); if (i.party > 0) why.push('voices');
  if (i.shotFt > 0) { noise = Math.max(noise, i.shotFt); why.push('gunfire'); }
  let light = 0;
  if (!i.dark) { light = 300 + 120 * Math.min(4, i.windows); why.push('lit windows'); }
  else light = 400 * (1 - i.curtains) * Math.min(1, i.windows / 2);
  if (i.floods > 0 && !i.dark) { light = Math.max(light, 1500); why.push('floodlights'); }
  if (i.rain) { noise *= 0.7; light *= 0.6; }
  return { noiseFt: Math.round(noise), lightFt: Math.round(light), ft: Math.round(Math.max(noise, light)), why };
}
/** Share of the local walkers that turn up at the wall in a night (a quiet place gets a few, a lit loud one a crowd). */
export const arrivalRate = (sigFt: number): number => 0.0012 + 8.2e-6 * sigFt;

/** What a wall holds, in pounds per foot of frontage before it gives (docs/scenarios/zombies.md 5.4). */
export const WALL_RATING: Partial<Record<PerimeterKind, number>> = {
  split_rail: 20, barbed_wire: 60, woven_wire: 90, thorn_hedge: 140, chain_link: 60, wrought_iron: 300, iron_barbed: 320, bar_fence: 400, log_palisade: 450, container_wall: 600,
  container_stack: 800, steel_wall: 600, electric_steel: 600, concrete_wall: 2500, stone_wall: 1500, earth_berm: 600, ditch: 300, moat: 900,
};
export const GATE_RATING = 150;
/** A standing crowd presses harder than its walkers' own push: the doc's figure for a four-row press of fresh walkers is 130 to 170 lb per foot. */
const CROWD_K = 2.9;
/** Load on a foot of wall from a crowd: 35 lb a walker over 1.5 ft of frontage, rows adding 60, 40, 25 percent and then 15. */
export function wallLoad(crowd: number, frontageFt: number, pushLb = 35): number {
  if (crowd <= 0 || frontageFt <= 0) return 0;
  const perRow = frontageFt / 1.5, ROW = [1, 0.6, 0.4, 0.25];
  let left = crowd, load = 0, row = 0;
  while (left > 0 && row < 12) { const n = Math.min(perRow, left); load += n * pushLb * (ROW[row] ?? 0.15); left -= n; row++; }
  return load * CROWD_K / frontageFt;
}
/** The pile of dead at the foot of the wall: about 15 per 10 ft makes a ramp that takes two feet off a six-foot wall. */
export const rampFeet = (pile: number, frontageFt: number): number => Math.min(3, 2 * (pile / Math.max(10, frontageFt)) / 1.5);

/** Walls that stop a crowd (people-blocking, finished), their length in feet, and the weakest rating (a gate counts at its own). */
export function wallsOf(s: GameState): { runs: PerimeterRun[]; ft: number; weakest: number; weakRun: PerimeterRun | null } {
  const runs = s.perimeter.filter(r => runFinished(r) && PERIMETER[r.kind] !== undefined && WALL_RATING[r.kind] !== undefined);
  let weakest = Infinity, weakRun: PerimeterRun | null = null, ft = 0;
  for (const r of runs) {
    ft += wallLength(r) * FT_PER_UNIT;
    const rate = r.gates.length ? Math.min(WALL_RATING[r.kind]!, GATE_RATING * (r.gates.some(g => g.garage) ? 3 : 1)) : WALL_RATING[r.kind]!;
    if (rate < weakest) { weakest = rate; weakRun = r; }
  }
  return { runs, ft: Math.round(ft), weakest: runs.length ? weakest : 0, weakRun };
}

// ── state ──

export interface Bite { pid: string; at: number; incub: number; fever: number; site: 'head' | 'body' | 'hand'; /** Nobody knows. */ hidden: boolean; plan: 'none' | 'seclude' | 'hide'; src: string }
export interface Visitor { id: string; bitten: boolean; line: string; day: number }
export interface ZFx {
  v: ZVariant; county: number; crowd: number; pile: number; kills: number; nights: number; eff: number; frozen: number; thawUntil: number; quietDays: number;
  shotFt: number; policy: 'pike' | 'rifle'; bites: Bite[]; seenDead: string[]; visitor: Visitor | null; asked: string[]; held: number; turned: number; peakLoad: number; breaches: number; risen: Array<{ pid: string; day: number }>;
}
export const zvariant = (s: GameState): ZVariant => (s.disaster.variant === 'everyone_turns' || s.disaster.variant === 'rage') ? s.disaster.variant : 'outbreak';
export function zombiesOf(s: GameState): ZFx {
  const bag = (s.disaster.fx ??= {});
  if (bag.zombies) return bag.zombies as ZFx;
  const r = mulberry32(s.seed * 4817 + 5), v = zvariant(s);
  const f: ZFx = { v, county: Math.round((2400 + 3600 * r()) * 0.55), crowd: 0, pile: 0, kills: 0, nights: 0, eff: 0, frozen: 0, thawUntil: -1, quietDays: 0, shotFt: 0, policy: 'pike', bites: [], seenDead: [], visitor: null, asked: [], held: 0, turned: 0, peakLoad: 0, breaches: 0, risen: [] };
  bag.zombies = f;
  return f;
}
const alive = (s: GameState): number[] => s.personState.map((_, i) => i).filter(i => s.personState[i].needs.died == null && !s.personState[i].needs.taken && !s.personState[i].needs.left);
const diff = (s: GameState) => s.disaster.difficulty;
const hot = (s: GameState): boolean => { const d = calendarOf(s.clock).doy; return d > 150 && d < 250; };
export function clothingOf(s: GameState): Clothing {
  const st = s.stock as unknown as Record<string, number>;
  if ((st.plate_carrier ?? 0) >= 1 || (st.soft_armor ?? 0) >= 1) return 'padded';
  return hot(s) ? 'bare' : 'heavy';
}

/** The signature right now, from what the compound is actually doing. */
export function signatureNow(s: GameState): Signature {
  const z = zombiesOf(s), nn = nightNoise(s), st = stealthOf(s), curtains = Math.min(1, Math.floor((s.stock as unknown as Record<string, number>).blackout_curtains ?? 0) / Math.max(1, s.structures.filter(x => isFinished(x) && ['timber_cabin', 'log_house', 'farmhouse', 'cottage', 'stone_house'].includes(x.kind)).length));
  const homes = s.structures.filter(x => isFinished(x) && ['timber_cabin', 'log_house', 'farmhouse', 'cottage', 'stone_house', 'modular_home', 'trailer', 'travel_trailer', 'rv_camper', 'guest_house', 'lodge'].includes(x.kind)).length;
  const night = nightOf(s);
  return signatureOf({ generator: genRunning(s), genK: genSound(s), dogs: dogsQuiet(s) ? nn.dogs * 0.25 : nn.dogs, stock: nn.animals, party: partyNoise(s), dark: !!st.full || !!s.opsec?.blackout, curtains, floods: s.structures.filter(x => isFinished(x) && x.kind.includes('flood')).length, windows: homes, shotFt: z.shotFt, rain: night.rainy || night.snowy });
}

/** Night duty: able adults who stand a wall shift (guards count). */
const dutyHands = (s: GameState): number => Math.max(1, Math.min(4, alive(s).filter(i => !s.people[i].kid && s.people[i].age < 70 && s.personState[i].needs.health >= 40).length - 1));

/** Wall: where the weakest run gives under load: a repair job (a breach) on the real run. */
function breachWall(s: GameState, run: PerimeterRun): void {
  const mid = Math.max(1, Math.floor(run.pts.length / 2)), [ax, az] = run.pts[mid - 1], [bx, bz] = run.pts[mid];
  const id = `d${s.nextId++}`;
  (s.raidDamage ??= []).push({ id, kind: 'breach', x: (ax + bx) / 2, z: (az + bz) / 2, runId: run.id, day: dayIndex(s.clock.t), hours: 16, done: 0, supplied: false, bill: runBill(run.kind, 3), what: 'the fence' });
}

/** Add a bite on a person (their cloth sets the odds). Returns the log line or null when it did not break the skin. */
export function bitePerson(s: GameState, i: number, r: () => number, src: string): string | null {
  const z = zombiesOf(s), p = s.people[i];
  if (z.bites.some(b => b.pid === p.id)) return null;
  if (r() > biteChance(clothingOf(s), diff(s))) return `${p.first} was grabbed at the wall; the coat held, and the teeth did not get through.`;
  const site = r() < 0.15 ? 'head' : r() < 0.45 ? 'hand' : 'body';
  z.bites.push({ pid: p.id, at: s.clock.t, incub: z.v === 'rage' ? 0.1 : incubationHours(r, site), fever: z.v === 'rage' ? 0.05 : feverHours(r), site, hidden: false, plan: 'none', src });
  return `${p.first} was bitten (${src}). The skin is broken. Everyone knows the rule: within a day.`;
}

const decayOf = (z: ZFx): number => Math.max(0.05, z.eff >= 540 ? 0.05 : z.eff >= 180 ? 0.4 : z.eff >= 30 ? 0.75 : 1);

/** One night: the crowd, the kills, the load, the bites, the turns. Returns log lines. */
export function walkerNight(s: GameState, ctx: FxCtx): string[] {
  const z = zombiesOf(s), out: string[] = [], r = ctx.r, day = ctx.day, night = nightOf(s), t = s.clock.t;
  const highF = night.lowF + 22;
  // decay, freeze and thaw
  z.eff += decayRate(night.lowF, highF) * (z.v === 'rage' ? 0 : 1);
  const mob = mobility(night.lowF);
  if (mob === 0) z.frozen++; else if (z.frozen >= 10 && night.lowF > 25) { z.thawUntil = day + 14; out.push('The thaw is on: what froze in the fields and ditches is moving again.'); z.frozen = 0; } else if (mob > 0.9) z.frozen = 0;
  // the county's turned: they gather over two weeks, then wear away by stage; the rage burns out in two to five weeks
  const grow = Math.min(1, day / 14) * (z.v === 'rage' ? Math.max(0, 1 - Math.max(0, day - 14) / 21) : decayOf(z));
  const local = z.county * 0.6 * grow;
  // the signature, and who comes
  const sig = signatureNow(s); z.shotFt *= 0.5;
  const thaw = day < z.thawUntil ? 2 : 1;
  const arrive = Math.round(local * arrivalRate(sig.ft) * mob * thaw * (0.7 + 0.6 * r()));
  const stage = stageOf(z.eff), st = STAGE_TABLE[stage];
  z.crowd += arrive;
  // kills: the pike through the slit or the rifle (every shot is a mile of noise)
  const hands = dutyHands(s);
  let kills = 0, rifle = 0;
  const cap = hands * 22;
  if (z.policy === 'rifle' && roundsLeft(s) > 0) { const n = Math.min(z.crowd, cap * 2, Math.floor(roundsLeft(s) / 1.5)); rifle = n; spendRounds(s, Math.ceil(n * 1.5)); kills = n; z.shotFt = Math.max(z.shotFt, n > 0 ? 5000 : 0); }
  const pike = Math.min(z.crowd - kills, Math.max(0, cap - Math.floor(rifle / 2)));
  kills += pike; z.crowd = Math.max(0, z.crowd - kills); z.kills += kills; z.pile += kills;
  // dispersal: a quiet place for three days loses 7 percent a day of the crowd
  z.quietDays = sig.ft < 300 ? z.quietDays + 1 : 0;
  if (z.quietDays >= 3) z.crowd = Math.floor(z.crowd * 0.93);
  z.pile = Math.max(0, z.pile - hands * 3);   // the hands drag and burn a few each night
  z.nights++;
  // the wall: load on the road side (a third of the line) against the weakest piece
  const w = wallsOf(s), frontage = Math.max(40, w.ft / 3), load = wallLoad(z.crowd, frontage, st.pushLb);
  z.peakLoad = Math.max(z.peakLoad, load);
  const ramp = rampFeet(z.pile, frontage);
  const rating = w.runs.length ? Math.max(1, w.weakest * (1 - 0.1 * ramp)) : 0;
  let report = `Night ${day + 1}. Walkers at the wall: ${z.crowd}${arrive ? ` (${arrive} new)` : ''}. Killed: ${kills}${rifle ? ` (${kills - rifle} pike, ${rifle} rifle)` : ' by pike'}. Pile at the foot: ${z.pile}. ${sig.ft < 200 ? 'Quiet and dark.' : `Heard and seen out to ${sig.ft.toLocaleString('en-US')} ft (${sig.why.join(', ') || 'the house'}).`}`;
  if (rating > 0) report += ` Load ${Math.round(load)} of ${Math.round(rating)} lb per foot on the weakest wall.`;
  else if (z.crowd > 0) report += ' There is no wall to hold them.';
  if (z.crowd > 0 || kills > 0) out.push(report);
  if (rating > 0 && load > rating && w.weakRun) { z.breaches++; breachWall(s, w.weakRun); out.push('The crowd leaned on the weak panel until it went. A gap is open until it is mended; they are coming through it.'); const i = alive(s)[Math.floor(r() * alive(s).length)]; if (i !== undefined) { const l = bitePerson(s, i, r, 'when they came through the gap'); if (l) out.push(l); } z.crowd = Math.floor(z.crowd * 0.7); }
  else if (rating > 0 && load > 0.7 * rating) out.push('The fence is leaning at the weakest post. Reinforce it or thin the crowd.');
  if (rating === 0 && z.crowd >= 6 && z.v !== 'rage') { const i = alive(s)[Math.floor(r() * alive(s).length)]; if (i !== undefined && r() < Math.min(0.5, z.crowd / 40)) { const l = bitePerson(s, i, r, 'in the yard'); if (l) out.push(l); } }
  // the duty: a bite at the wall when it is close work (a pike through a slit rarely; a crowd at an open top often)
  if (z.crowd > 0 && w.runs.length) {
    const risk = Math.min(0.3, (z.policy === 'pike' ? 0.01 : 0.003) * Math.min(20, z.crowd) * (ramp > 1 ? 1.8 : 1) * (hot(s) ? 1.2 : 1));
    if (r() < risk) { const duty = alive(s).filter(i => !s.people[i].kid); const i = duty[Math.floor(r() * duty.length)]; if (i !== undefined) { const l = bitePerson(s, i, r, 'on the wall'); if (l) out.push(l); } }
  }
  void t;
  return out.filter(Boolean);
}

const ROUNDS_CAL = ['308', '3006', '762x39', '556', '3030', '65cm', '12ga'] as const;
function roundsLeft(s: GameState): number { return ROUNDS_CAL.reduce((a, c) => a + ((s.armory?.ammo as Record<string, number> | undefined)?.[c] ?? 0), 0); }
function spendRounds(s: GameState, n: number): void { const am = s.armory?.ammo as Record<string, number> | undefined; if (!am) return; for (const c of ROUNDS_CAL) { const take = Math.min(n, am[c] ?? 0); am[c] = (am[c] ?? 0) - take; n -= take; if (n <= 0) break; } }

/** Turn the bitten and the dead who rise: the 24-hour rule. Returns log lines. Called after `walkerNight`. */
export function walkerTurns(s: GameState, ctx: FxCtx): string[] {
  const z = zombiesOf(s), out: string[] = [], r = ctx.r, now = s.clock.t, cozy = diff(s) === 'cozy';
  // the sleeper plague: every death rises unless the watchers see to it (two nights' grace is not given: it is by the next tick)
  if (z.v === 'everyone_turns') {
    for (const i of s.personState.map((_, k) => k)) if (s.personState[i].needs.died != null && !z.seenDead.includes(s.people[i].id)) { z.seenDead.push(s.people[i].id); z.risen.push({ pid: s.people[i].id, day: ctx.day }); }
    for (const e of [...z.risen]) {
      if (e.day >= ctx.day) continue;   // a card is waiting this tick; the body rises at the next one
      z.risen = z.risen.filter(x => x !== e);
      const name = s.people.find(p => p.id === e.pid)?.first ?? 'Someone';
      out.push(`${name} got up in the night. Nobody was watching.`);
      const live = alive(s); const i = live[Math.floor(r() * live.length)];
      if (i !== undefined && r() < 0.5) { const l = bitePerson(s, i, r, `by ${name}`); if (l) out.push(l); }
      z.turned++;
    }
  }
  for (const b of [...z.bites]) {
    const i = s.people.findIndex(p => p.id === b.pid); if (i < 0 || s.personState[i].needs.died != null) { z.bites = z.bites.filter(x => x !== b); continue; }
    const hoursSince = (now - b.at) * 24;
    if (hoursSince < b.incub + b.fever && z.v !== 'rage') {
      if (hoursSince > b.incub && !s.personState[i].needs.hurt.some(h => h.what === 'the bite fever')) { s.personState[i].needs.hurt.push({ what: 'the bite fever', sev: 40, trauma: true }); out.push(`${s.people[i].first} is burning up and confused. ${b.hidden ? 'The bandage is soaked through.' : ''}`.trim()); }
      continue;
    }
    z.bites = z.bites.filter(x => x !== b);
    const n = s.personState[i].needs, p = s.people[i];
    if (cozy) { n.hurt = n.hurt.filter(h => h.what !== 'the bite fever'); n.hurt.push({ what: 'a fever from the bite', sev: 55 }); out.push(`${p.first} burned with fever for days, and then it broke. Whatever the bite carried, it did not take.`); continue; }
    n.health = 0; n.died = Math.floor(now); n.cause = 'illness'; z.turned++;
    out.push(`${p.first} died ${b.plan === 'seclude' ? 'in the locked room, with someone beside them' : b.hidden ? 'behind a closed door, hiding the bite' : 'of the bite'}, and got up again.`);
    if (b.plan === 'seclude') { out.push(`${p.first} was put down quietly, as agreed.`); }
    else { const live = alive(s).filter(k => k !== i); const k = live[Math.floor(r() * live.length)]; if (k !== undefined && r() < (b.hidden ? 0.7 : 0.25)) { const l = bitePerson(s, k, r, `by ${p.first}`); if (l) out.push(l); } else out.push(`${p.first} was stopped before anyone else was hurt.`); }
  }
  return out;
}

/** The stranger at the gate: bitten (and hiding it) about one time in four. */
export function walkerVisitor(s: GameState, ctx: FxCtx): string[] {
  const z = zombiesOf(s);
  if (z.visitor || ctx.day < 3 || ctx.day > 160 || ctx.r() > (z.v === 'rage' ? 0.1 : 0.22)) return [];
  const bitten = ctx.r() < (ctx.day < 10 ? 0.3 : 0.12), lines = SCARED_LINES;
  z.visitor = { id: `v${ctx.day}`, bitten, line: lines[Math.floor(ctx.r() * lines.length)], day: ctx.day };
  return ['Someone is at the gate, alone, with a pack. Not walking right.'];
}

/** Untrained civilians say little, and badly. */
export const SCARED_LINES = ['Please. Please. I am not... I am fine.', 'It is my arm. No. It is nothing. A fence.', 'Let me in. Let me in. They are behind me.', 'I have a boy at the church. I just need. Water.', 'Is this... is this the Henderson place? Please.', 'Don\'t shoot. Don\'t. I walked. All night.'];
export const scaredLine = (r: () => number): string => SCARED_LINES[Math.floor(r() * SCARED_LINES.length)];

// ── cards and choices ──

export function walkerCards(s: GameState): FxCard[] {
  const z = zombiesOf(s), cards: FxCard[] = [], hit = s.clock.t >= s.disaster.hitAt;
  const dark = !!stealthOf(s).full || !!s.opsec?.blackout;
  if (!dark && !z.asked.includes('dark')) cards.push({ id: 'zb_dark', title: hit ? 'Lights out and quiet, or go to the road?' : 'If they come: lights out and quiet', urgency: hit ? 96 : 58, tone: hit ? 'alarm' : undefined,
    why: 'They come to light and to noise, not to smoke or to smell. A dark house, the generator off, the dogs quiet, no shooting: a few at the wall a night instead of a crowd. Every shot is heard for a mile.', acts: [{ label: 'Lights out, quiet hours', choice: 'zb:dark' }, { label: 'Carry on as we are', choice: 'zb:asis' }] });
  if (hit) cards.push({ id: 'zb_policy', title: z.policy === 'pike' ? 'Kill window: pike or rifle?' : 'Rifles are drawing them', urgency: 50, why: `At the wall a pike through a slit is silent (about 22 kills a hand a night, a bite now and then). A rifle is faster and carries a mile: more of them tomorrow. Ammunition left: ${roundsLeft(s)} rounds.`, acts: z.policy === 'pike' ? [{ label: 'Rifles at the wall tonight', choice: 'zb:rifle' }] : [{ label: 'Back to the pike', choice: 'zb:pike' }] });
  for (const b of z.bites) {
    const i = s.people.findIndex(p => p.id === b.pid); if (i < 0 || b.plan !== 'none' && b.hidden) continue;
    if (b.plan !== 'none') continue;
    const name = s.people[i].first, medic = Math.max(0, ...s.people.map(p => p.skills.medic ?? 0));
    const hoursLeft = Math.max(0, Math.round(b.incub + b.fever - (s.clock.t - b.at) * 24));
    cards.push({ id: `zb_bite_${b.pid}`, title: `${name} was bitten`, urgency: 99, tone: 'alarm',
      why: `A bite is a death sentence inside a day, and then they rise. About ${hoursLeft} hours remain. Cutting the limb off in the first hours saves some (medic skill ${medic}). Or keep ${name} in a locked room with someone beside them. Or end it now.${diff(s) === 'cozy' ? ' (On Cozy a bitten family member gets a bad fever and recovers.)' : ''}`,
      acts: [{ label: 'Amputate now', choice: `zb:amp:${b.pid}` }, { label: 'Locked room, someone beside them', choice: `zb:seclude:${b.pid}` }, { label: 'Put them down now', choice: `zb:end:${b.pid}` }, { label: 'Hide it: say nothing', choice: `zb:hide:${b.pid}` }] });
  }
  for (const e of z.risen) { const name = s.people.find(p => p.id === e.pid)?.first ?? 'Someone'; cards.push({ id: `zb_rise_${e.pid}`, title: `${name} has died. Watch the body`, urgency: 97, tone: 'alarm', why: 'In this sickness every death gets up within minutes unless the brain is destroyed or the body burned. Somebody has to do it, tonight.', acts: [{ label: 'Spike it, quietly', choice: `zb:spike:${e.pid}` }, { label: 'Burn the body (smoke by night)', choice: `zb:burn:${e.pid}` }] }); }
  if (z.visitor) cards.push({ id: 'zb_visitor', title: 'A stranger at the gate', urgency: 92, why: `"${z.visitor.line}" You can strip-search them at the gate (most bites seen), hold them 24 hours in a locked shed (the surest filter, and the cost of a watcher), turn them away, or let them in.`, acts: [{ label: 'Strip-search at the gate', choice: 'zb:v:search' }, { label: 'Hold 24 hours in the shed', choice: 'zb:v:hold' }, { label: 'Turn them away', choice: 'zb:v:away' }, { label: 'Let them in', choice: 'zb:v:in' }] });
  return cards;
}

export function walkerChoose(s: GameState, choice: string, r: () => number = mulberry32(s.seed * 211 + Math.floor(s.clock.t * 7))): string | null {
  if (!choice.startsWith('zb:')) return null;
  const z = zombiesOf(s), parts = choice.split(':'), k = parts[1], pid = parts[2];
  if (k === 'dark') { setStealth(s, 'full', true); z.asked.push('dark'); return 'Lights out and quiet hours: a dark house, the stove at dusk only. Hang blackout curtains if you can.'; }
  if (k === 'asis') { z.asked.push('dark'); return null; }
  if (k === 'rifle') { z.policy = 'rifle'; return 'Rifles at the wall. Faster, and they will hear it for a mile.'; }
  if (k === 'pike') { z.policy = 'pike'; return 'Back to the pike: slower, silent.'; }
  const b = z.bites.find(x => x.pid === pid), i = s.people.findIndex(p => p.id === pid);
  if (k === 'amp' && b && i >= 0) {
    const medic = s.people.reduce((m, p, j) => j !== i ? Math.max(m, p.skills.medic ?? 0) : m, 0), early = (s.clock.t - b.at) * 24 < 2;
    if (b.site === 'head' || (b.site === 'body')) return `${s.people[i].first} was bitten where a saw does no good.`;
    const odds = (early ? 1 : 0.4) * (diff(s) === 'cozy' ? 0.6 : diff(s) === 'hardcore' ? 0.15 : 0.4) + 0.05 * medic;
    z.bites = z.bites.filter(x => x !== b);
    const u = r();
    if (u < odds) { s.personState[i].needs.hurt.push({ what: 'a lost hand, mended', sev: 40, trauma: true }); return `${s.people[i].first} lost the hand, and lived. The bite did not take.`; }
    if (u < odds + 0.2) { const n = s.personState[i].needs; n.health = 0; n.died = Math.floor(s.clock.t); n.cause = 'wound'; return `${s.people[i].first} bled out on the table.`; }
    z.bites.push(b); return `The saw was too late: ${s.people[i].first} is still bitten, and weaker.`;
  }
  if (k === 'seclude' && b) { b.plan = 'seclude'; return `${s.people[i]?.first ?? 'They'} is in the back room with the door locked and someone sitting by the bed. If it turns, it turns on your terms.`; }
  if (k === 'hide' && b) { b.plan = 'hide'; b.hidden = true; return 'You said nothing. It will come out in the house.'; }
  if (k === 'end' && b && i >= 0) { const n = s.personState[i].needs; n.health = 0; n.died = Math.floor(s.clock.t); n.cause = 'wound'; z.bites = z.bites.filter(x => x !== b); z.seenDead.push(pid); for (const q of s.personState) if (q.needs.died == null) q.needs.morale = Math.max(0, q.needs.morale - 20); return `${s.people[i].first} did not get up. Nobody in the house is sleeping.`; }
  if ((k === 'spike' || k === 'burn') && pid) { z.risen = z.risen.filter(e => e.pid !== pid); if (k === 'burn') { z.shotFt = Math.max(z.shotFt, 1500); return 'The body burned in the yard at night. They saw the fire for a mile.'; } return 'Done, quietly. Nobody spoke afterward.'; }
  if (k === 'v' && z.visitor) {
    const v = z.visitor, how = pid; z.visitor = null;
    const bitten = v.bitten;
    if (how === 'away') return bitten ? 'You told them to go. They went up the road, slowly.' : 'You told them to go. The shape on the road got smaller. You will think of it later.';
    if (how === 'search') { const seen = r() < 0.7; if (bitten && seen) return 'The sleeve came off: a bite, black at the edges. You sent them off, and did not look.'; if (bitten) { adoptBitten(s, z, r); return 'You saw nothing and let them in. By morning someone is feverish.'; } return 'No bite. They came in with a pack of food and a thin, grateful smile.'; }
    if (how === 'hold') { z.held++; if (bitten) { return 'In the locked shed they turned in the night, as the rule said. A watcher with a hammer ended it. Nobody else was hurt.'; } s.money += 150; return 'Twenty-four hours in the shed, and nothing: no fever, no bite. They left a gift of tools and money for the trouble ($150).'; }
    if (how === 'in') { if (bitten) { adoptBitten(s, z, r); return 'They came in. Nobody asked about the bandage.'; } s.money += 80; return 'They were not bitten. They shared what they had ($80) and slept by the stove.'; }
  }
  return null;
}
function adoptBitten(s: GameState, z: ZFx, r: () => number): void {
  const live = alive(s); const i = live[Math.floor(r() * live.length)]; if (i === undefined) return;
  z.bites.push({ pid: s.people[i].id, at: s.clock.t, incub: incubationHours(r), fever: feverHours(r), site: 'body', hidden: true, plan: 'hide', src: 'from the stranger' });
}

export function walkerGoal(s: GameState): FxGoal {
  const z = zombiesOf(s), w = wallsOf(s), dark = !!stealthOf(s).full || !!s.opsec?.blackout;
  return { id: 'zombies', title: 'Hold the wall through the winter', steps: [
    { label: 'Go dark and quiet', done: dark },
    { label: 'A wall that holds the crowd (150 lb per foot)', done: w.weakest >= 150 },
    { label: 'Hold a stranger 24 hours in the shed', done: z.held > 0 },
    { label: 'Get through 30 nights', done: z.nights >= 30 },
    { label: 'Reach the thaw with no one lost to a bite', done: z.nights >= 120 && z.turned === 0 },
  ] };
}

/** The radio's lines by phase and variant. */
export function walkerBulletin(s: GameState, ctx: FxCtx): { text: string; tone: 0 | 1 | 2 | 3 } | null {
  const z = zombiesOf(s), d = ctx.day;
  if (ctx.r() > 0.55) return null;
  if (d < 2) return { text: 'do not approach anyone who appears ill. Do not let them bite you. If someone is injured, keep them apart.', tone: 3 };
  if (d < 10) return { text: ['the Guard has fallen back to the river. Stay indoors. Aim for the head.', 'Fort Collins safe zone is accepting survivors. (Uncertain.)', 'they come to the light, not the smoke. A farmer told us.'][d % 3], tone: 3 };
  if (z.v === 'rage' && d > 18) return { text: 'the infected are collapsing in the streets: dead of thirst and starvation. Stay inside a few days more.', tone: 1 };
  if (z.frozen >= 5) return { text: 'the thaw is coming. Expect them off the high passes.', tone: 2 };
  if (d < 60) return { text: `a ham says: my wall had ${Math.max(1, z.crowd)} last night. Dark house, dogs inside, nothing louder than a bow.`, tone: 2 };
  return { text: ['a settlement, Cedar Ridge, sixty people, is holding a trade fair on Saturdays.', 'a church bell, three counties off. A lone bell, still ringing.', 'there is a rumor of a cure. Nobody has seen it.'][d % 3], tone: 1 };
}
