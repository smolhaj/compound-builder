/**
 * The outbreak model shared by the pandemic and the engineered bioweapon (WP4 + WP7, docs/scenarios/pandemic.md and bioweapon.md).
 * Pure but for the functions that take a GameState (they write only `disaster.fx.outbreak`, the people's `hurt` list and `money`).
 *
 * World side: a wave clock, `prev(day)` = the share of the county sick, a smoothed bump per wave.
 * Compound side: the gate contact roll (read by encounters through `contagion`) scales with `prev` and with what the family does
 * (seal, masks, drop box, a quarantine hold, a filtered bunker); at home a sick person and the incubating (presymptomatic) spread it
 * with a real incubation period; the recovered are immune and become the runners; the old and the weak get worse.
 * The fever itself, its nursing and its death are sim/medical.ts, unchanged.
 */
import type { GameState } from './state';
import { dayIndex } from './state';
import { mulberry32 } from './rng';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { medicalBay } from './richSinks';
import type { FxCard, FxCtx, FxGoal } from './disasterFx';

export type OutbreakKind = 'pandemic' | 'bioweapon';
export interface Wave { peak: number; width: number; prev: number }
export interface OutbreakVariant {
  id: string; kind: OutbreakKind; name: string;
  /** Gate contact and home spread (per sick person a day) at Standard, the fever severity, the incubation range in days. */
  contact: number; spread: number; sev: number; incubation: [number, number];
  /** The county's sick share at the peak that counts as "full strength" (contact scales to it). */
  ref: number;
  waves: Wave[];
  /** Risk of turning serious for a 40-year-old, before care, and how fast it rises with age. */
  serious: number; ageSlope: number;
  /** Share of the recovered who are immune afterwards. */
  immunity: number;
  /** Day the vaccine reaches the county on a full recovery (null: none). */
  vaccine: number | null;
}

export const OUTBREAKS: Record<string, OutbreakVariant> = {
  wave: { id: 'wave', kind: 'pandemic', name: 'covid-like', contact: 0.25, spread: 0.06, sev: 45, incubation: [2, 8], ref: 0.035, serious: 0.03, ageSlope: 1.9, immunity: 0.9, vaccine: 340,
    waves: [{ peak: 38, width: 18, prev: 0.035 }, { peak: 190, width: 22, prev: 0.05 }, { peak: 360, width: 25, prev: 0.025 }] },
  flu_1918: { id: 'flu_1918', kind: 'pandemic', name: '1918-like', contact: 0.3, spread: 0.1, sev: 50, incubation: [1, 3], ref: 0.04, serious: 0.05, ageSlope: 0.4, immunity: 0.95, vaccine: null,
    waves: [{ peak: 30, width: 14, prev: 0.015 }, { peak: 120, width: 14, prev: 0.07 }, { peak: 260, width: 18, prev: 0.03 }] },
  high_fatality: { id: 'high_fatality', kind: 'pandemic', name: 'high-fatality', contact: 0.18, spread: 0.04, sev: 65, incubation: [4, 10], ref: 0.015, serious: 0.25, ageSlope: 0.2, immunity: 0.98, vaccine: null,
    waves: [{ peak: 90, width: 50, prev: 0.015 }] },
  /** The human tail of a zoonotic livestock flu (sim/livestockPlague.ts): small and slow. */
  mixed_zoonotic: { id: 'mixed_zoonotic', kind: 'pandemic', name: 'zoonotic flu', contact: 0.15, spread: 0.04, sev: 40, incubation: [2, 5], ref: 0.01, serious: 0.012, ageSlope: 1.5, immunity: 0.9, vaccine: null,
    waves: [{ peak: 70, width: 30, prev: 0.01 }] },
  release: { id: 'release', kind: 'bioweapon', name: 'engineered flu', contact: 0.55, spread: 0.12, sev: 75, incubation: [1, 3], ref: 0.12, serious: 0.12, ageSlope: 0.5, immunity: 0.7, vaccine: 450,
    waves: [{ peak: 21, width: 16, prev: 0.12 }, { peak: 150, width: 20, prev: 0.04 }] },
  hemorrhagic: { id: 'hemorrhagic', kind: 'bioweapon', name: 'hemorrhagic', contact: 0.4, spread: 0.1, sev: 80, incubation: [4, 10], ref: 0.08, serious: 0.45, ageSlope: 0.2, immunity: 0.6, vaccine: null,
    waves: [{ peak: 28, width: 20, prev: 0.08 }, { peak: 140, width: 20, prev: 0.03 }] },
  smallpox_like: { id: 'smallpox_like', kind: 'bioweapon', name: 'smallpox-like', contact: 0.45, spread: 0.09, sev: 70, incubation: [7, 17], ref: 0.1, serious: 0.3, ageSlope: 0.3, immunity: 0.9, vaccine: 120,
    waves: [{ peak: 35, width: 24, prev: 0.1 }] },
};

export interface Policy { sealed: boolean; masks: boolean; dropBox: boolean; hold: boolean; /** Day index until which the family is sheltering in the filtered bunker (0: not). */ shelterUntil: number }
export interface OutbreakFx {
  v: string; waves: Wave[]; policy: Policy;
  /** Incubating people: the day they fall ill, and where they caught it. */
  exposed: Record<string, { onset: number; src: string }>;
  immune: string[]; sickSince: Record<string, number>; asked: string[];
  stimulus: boolean; mutated: boolean; recovered: number; worsened: number;
}

const diffK = (s: GameState): number => s.disaster.difficulty === 'cozy' ? 0.6 : s.disaster.difficulty === 'hardcore' ? 1.3 : 1;
export const variantOf = (s: GameState): OutbreakVariant => OUTBREAKS[s.disaster.variant] ?? OUTBREAKS[s.disaster.kind === 'bioweapon' ? 'release' : 'wave'];

/** The outbreak's state, made on first use: the waves are rolled from the seed and scaled by difficulty (Cozy: milder, and no third wave). */
export function outbreakOf(s: GameState): OutbreakFx {
  const bag = (s.disaster.fx ??= {});
  const have = bag.outbreak as OutbreakFx | undefined;
  if (have) return have;
  const v = variantOf(s), r = mulberry32(s.seed * 4093 + 71);
  const waves = v.waves.slice(0, s.disaster.difficulty === 'cozy' ? 2 : 9).map(w => ({ peak: Math.round(w.peak * (0.9 + 0.2 * r())), width: w.width, prev: w.prev * diffK(s) * (0.9 + 0.2 * r()) }));
  const o: OutbreakFx = { v: v.id, waves, policy: { sealed: false, masks: false, dropBox: false, hold: false, shelterUntil: 0 }, exposed: {}, immune: [], sickSince: {}, asked: [], stimulus: false, mutated: false, recovered: 0, worsened: 0 };
  bag.outbreak = o;
  return o;
}

/** The share of the county sick on a day since the hit. */
export function prevAt(o: OutbreakFx, day: number): number {
  let p = 0;
  for (const w of o.waves) p = Math.max(p, w.prev * Math.exp(-(((day - w.peak) / w.width) ** 2)));
  return p;
}

const sinceHit = (s: GameState): number => Math.max(0, Math.floor(s.clock.t - s.disaster.hitAt));
/** 0..1.2: how bad the county is now, against the variant's full-strength peak. */
export function risk(s: GameState): number {
  const o = outbreakOf(s), v = variantOf(s);
  return Math.min(1.2, prevAt(o, sinceHit(s)) / (v.ref * diffK(s)));
}

const living = (s: GameState): number[] => s.personState.map((_ps, i) => i).filter(i => s.personState[i].needs.died == null && !s.personState[i].needs.taken && !s.personState[i].needs.left);
export const isIll = (s: GameState, i: number): boolean => s.personState[i].needs.hurt.some(h => h.what.startsWith('fever'));
export const homesDone = (s: GameState): number => s.structures.filter(st => isFinished(st) && isHome(st.kind)).length;
export const hasFilteredAir = (s: GameState): boolean => s.structures.some(st => st.kind === 'bunker_plant' && isFinished(st));
export const canHold = (s: GameState): boolean => homesDone(s) >= 2 || medicalBay(s);

/** Everything the family does, as the factor on a gate contact (1 = nothing done). */
export function protection(s: GameState): number {
  const p = outbreakOf(s).policy, day = dayIndex(s.clock.t);
  return (p.sealed ? 0.3 : 1) * (p.masks ? 0.6 : 1) * (p.dropBox ? 0.4 : 1) * (p.hold ? 0.35 : 1) * (p.shelterUntil > day ? 0.1 : 1);
}
/** The share of the household that is immune (the runners): a contact lands on them by chance and does nothing. */
export function immuneShare(s: GameState): number {
  const o = outbreakOf(s), alive = living(s);
  return alive.length ? alive.filter(i => o.immune.includes(s.people[i].id)).length / alive.length : 0;
}

/** The `medical` hook: gate contact and home spread. Home spread is run by `outbreakDaily` (with incubation), so it is 0 here. */
export function contagionNow(s: GameState): { contact: number; spread: number } {
  const v = variantOf(s);
  return { contact: v.contact * diffK(s) * (floor(s) + (1 - floor(s)) * Math.min(1, risk(s))) * protection(s) * (1 - immuneShare(s)), spread: 0 };
}

/** Risk that an ill person turns serious: by age, the variant and the care they can get. */
export function seriousChance(s: GameState, age: number, i: number): number {
  const v = variantOf(s), cozy = s.disaster.difficulty === 'cozy';
  const ageF = Math.pow(1 + Math.max(0, age - 40) / 25, 1 + v.ageSlope) * (age < 12 ? 0.3 : 1);
  const medic = Math.max(0, ...s.people.filter((_p, k) => k !== i && s.personState[k].needs.died == null).map(p => p.skills.medic ?? 0));
  const care = s.disaster.tracks.medical < 0.3 ? 2 : 1, aided = medic >= 3 || medicalBay(s) ? 0.5 : 1;
  return Math.min(0.9, v.serious * ageF * care * aided * (cozy ? 0.5 : s.disaster.difficulty === 'hardcore' ? 1.4 : 1));
}

/** Once a day: incubation ends, the sick spread it, the recovered become immune, the old get worse. Returns log lines. */
export function outbreakDaily(s: GameState, ctx: FxCtx): string[] {
  const o = outbreakOf(s), v = variantOf(s), out: string[] = [], day = dayIndex(s.clock.t), alive = living(s), r = ctx.r;
  const sev = v.sev * (s.disaster.difficulty === 'cozy' ? 0.75 : s.disaster.difficulty === 'hardcore' ? 1.2 : 1);
  const fall = (i: number, how: string): void => {
    const ps = s.personState[i]; if (isIll(s, i)) return;
    ps.needs.hurt.push({ what: 'fever', sev: Math.round(sev) }); o.sickSince[s.people[i].id] = day;
    out.push(`${s.people[i].first} has a fever${how ? ` (${how})` : ''}.`);
  };
  // incubation runs out
  for (const [pid, e] of Object.entries(o.exposed)) {
    const i = s.people.findIndex(p => p.id === pid);
    if (i < 0 || !alive.includes(i)) { delete o.exposed[pid]; continue; }
    if (day >= e.onset) { delete o.exposed[pid]; fall(i, e.src); }
  }
  // spread at home: the sick, and the incubating (presymptomatic) at half weight; a medical bay, a filtered bunker and keeping apart cut it
  const sick = alive.filter(i => isIll(s, i)).length, pre = Object.keys(o.exposed).length;
  const apart = (medicalBay(s) ? 0.25 : 1) * (s.medical?.epidemic?.quarantine ? 0.4 : 1) * (o.policy.shelterUntil > day && hasFilteredAir(s) ? 0.2 : 1);
  const load = sick + 0.5 * pre;
  if (load > 0) for (const i of alive) {
    const pid = s.people[i].id;
    if (isIll(s, i) || o.exposed[pid] || o.immune.includes(pid)) continue;
    if (r() < Math.min(0.9, v.spread * diffK(s) * apart * load)) {
      const inc = v.incubation[0] + Math.floor(r() * (v.incubation[1] - v.incubation[0] + 1));
      o.exposed[pid] = { onset: day + inc, src: 'caught it at home' };
    }
  }
  // the recovered, and the ones who get worse
  for (const i of alive) {
    const pid = s.people[i].id, since = o.sickSince[pid];
    if (isIll(s, i)) {
      if (since === undefined) o.sickSince[pid] = day;
      else if (day - since === 3 && r() < seriousChance(s, s.people[i].age, i)) {
        const f = s.personState[i].needs.hurt.find(h => h.what.startsWith('fever'));
        if (f && f.sev < 85) { f.sev = 85; o.worsened++; out.push(`${s.people[i].first} is worse: the breathing is short and the fever will not break. ${s.people[i].age >= 60 ? 'At that age it can turn quickly.' : 'It needs a medic and medicine now.'}`); }
      }
    } else if (since !== undefined) {
      delete o.sickSince[pid]; o.recovered++;
      if (r() < v.immunity) { o.immune.push(pid); out.push(`${s.people[i].first} is up and well. Having had it, ${s.people[i].first} will not catch it again: the one to send to town, and to nurse the rest.`); }
      else out.push(`${s.people[i].first} is up and well, but the doctor on the radio says it can come again.`);
    }
  }
  for (const pid of Object.keys(o.sickSince)) { const i = s.people.findIndex(p => p.id === pid); if (i < 0 || !alive.includes(i)) delete o.sickSince[pid]; }
  // a county relief check (Cozy and Standard), day 20 to 45
  if (!o.stimulus && !(s.disaster.difficulty === 'hardcore') && ctx.day >= 20 && ctx.day <= 45 && v.kind === 'pandemic' && ctx.once('relief_check')) {
    const adults = s.people.filter(p => !p.kid).length, amt = 1200 * adults;
    s.money += amt; o.stimulus = true; out.push(`A county relief check came in the mail: $${amt.toLocaleString('en-US')}.`);
  }
  // a mutation: the high-fatality kind learns to spread (Hardcore), and the engineered one slips past immunity (day 120 to 300)
  if (!o.mutated && ctx.day >= 120 && ctx.day <= 300 && (s.disaster.difficulty === 'hardcore' || v.kind === 'bioweapon') && r() < 0.02 && ctx.once('mutation')) {
    o.mutated = true; o.waves.push({ peak: ctx.day + 25, width: 20, prev: v.waves[0].prev * (v.kind === 'bioweapon' ? 0.6 : 3) * diffK(s) });
    if (v.kind === 'bioweapon') o.immune = o.immune.filter(() => r() > 0.3);
    out.push(v.kind === 'bioweapon' ? 'A new strain is going round: some who had it are sick again.' : 'It has changed. The county health officer says it spreads easier now.');
  }
  return out;
}

/** Someone from outside brought it in: begin the incubation instead of an instant fever (used by decision cards that admit a person). */
export function exposeOne(s: GameState, r: () => number, src: string): string | null {
  const o = outbreakOf(s), v = variantOf(s);
  const pool = living(s).filter(i => !isIll(s, i) && !o.exposed[s.people[i].id] && !o.immune.includes(s.people[i].id));
  if (!pool.length) return null;
  const i = pool[Math.floor(r() * pool.length)];
  o.exposed[s.people[i].id] = { onset: dayIndex(s.clock.t) + v.incubation[0] + Math.floor(r() * (v.incubation[1] - v.incubation[0] + 1)), src };
  return s.people[i].first;
}

// ── what the radio says ──

export function outbreakBulletin(s: GameState, ctx: FxCtx): { text: string; tone: 0 | 1 | 2 | 3 } | null {
  const o = outbreakOf(s), v = variantOf(s), d = ctx.day;
  if (ctx.r() > 0.5) return null;
  const p = prevAt(o, d), peakNext = o.waves.find(w => w.peak > d), past = o.waves.filter(w => w.peak < d).length;
  const pandemic = v.kind === 'pandemic', deaths = Math.round(p * 11000 * (v.serious * 20 + 0.4) / 7);
  if (d < 7) return { text: pandemic ? 'the hospital in the county seat is on diversion; call before you come, and stay home if you can.' : 'a quarantine zone is set round three cities; the roads into the county are checked.', tone: 2 };
  if (p > v.ref * 0.5 * diffK(s)) return { text: `the state reports ${deaths} deaths this week. The county seat has asked for refrigerated trucks.`, tone: 3 };
  if (past >= 1 && peakNext && peakNext.peak - d < 30) return { text: `cases are climbing again. Hospital capacity: ${Math.max(1, Math.round(9 - 6 * (1 - (peakNext.peak - d) / 30)))}% of ICU beds free.`, tone: 2 };
  if (past >= 1 && p < v.ref * 0.1) return { text: pandemic ? 'officials cautiously say the wave has passed; they urge continued masks.' : 'the quarantine zone around the cities is holding. Stay put.', tone: 1 };
  if (v.vaccine !== null && d >= v.vaccine - 30 && s.disaster.fate !== 'never') return { text: s.disaster.fate === 'full' ? 'the first vaccine shipments are reaching the state fairgrounds.' : 'limited vaccine supply: health workers and those over seventy first.', tone: 0 };
  return { text: pandemic ? 'cleaning surfaces helps less than keeping apart. Keep your sick away from the rest.' : 'do not take in anyone from the cities, and do not trust a stranger who looks well.', tone: 1 };
}

// ── decision cards ──

export function outbreakCards(s: GameState): FxCard[] {
  const o = outbreakOf(s), v = variantOf(s), cards: FxCard[] = [], day = dayIndex(s.clock.t), p = o.policy;
  const hit = s.clock.t >= s.disaster.hitAt;
  if (!o.asked.includes('seal')) cards.push({ id: 'ob_seal', title: hit ? 'Seal the place, or stay open?' : 'If it comes: seal, or stay open?', urgency: hit ? 90 : 55,
    why: `${v.kind === 'pandemic' ? 'Strangers and runs to town are how it gets in.' : 'Anyone from outside may carry it, and look well for days.'} Sealed means no arrivals and no town trips: trade through a drop box only. Open means trade, help and risk.`,
    acts: [{ label: 'Seal the place', choice: 'ob:seal' }, { label: 'Stay open', choice: 'ob:open' }] });
  if (!p.dropBox) cards.push({ id: 'ob_box', title: 'A drop box at the gate (about $250)', urgency: 66, why: 'A hatch or chute in the gate lets you trade without contact: it cuts the chance of catching it from a trade by more than half.', acts: [{ label: 'Build it ($250)', choice: 'ob:box' }] });
  if (!p.masks) cards.push({ id: 'ob_mask', title: 'Masks at the gate', urgency: 60, why: 'Cloth masks on both sides are cheap and cut a contact by about 40%. Cleaning surfaces matters much less than keeping apart.', acts: [{ label: 'Everyone masks at the gate', choice: 'ob:masks' }] });
  if (!p.hold && canHold(s)) cards.push({ id: 'ob_hold', title: 'Hold new arrivals for 14 days', urgency: 58, why: 'A spare cabin, trailer or the medical bay lets you keep a stranger apart until any sickness shows. It costs food and a caregiver, and fewer people will risk the gate.', acts: [{ label: 'Hold arrivals apart', choice: 'ob:hold' }] });
  if (hasFilteredAir(s) && p.shelterUntil <= day && risk(s) > 0.6) cards.push({ id: 'ob_shelter', title: 'Shelter in the filtered bunker', urgency: 70, why: 'The bunker\'s filtered, pressurized air is an air gap: for two weeks the gate and the house cannot reach you. Food and water run down the whole time.', acts: [{ label: 'Shelter 14 days', choice: 'ob:shelter' }] });
  if (o.immune.length && !o.asked.includes('runner')) cards.push({ id: 'ob_runner', title: 'You have someone who cannot catch it', urgency: 52, why: 'A recovered person can make the town run, nurse the sick and shake hands at the gate. Send them for what the place needs.', acts: [{ label: 'Understood', choice: 'ob:runner' }] });
  return cards;
}

export function outbreakChoose(s: GameState, choice: string): string | null {
  if (!choice.startsWith('ob:')) return null;
  const o = outbreakOf(s), p = o.policy, k = choice.slice(3);
  if (k === 'seal') { p.sealed = true; o.asked.push('seal'); return 'Sealed. No one comes in, nobody goes to town; trade goes through the gate.'; }
  if (k === 'open') { p.sealed = false; o.asked.push('seal'); return 'Staying open: trade and help, and the risk that goes with it.'; }
  if (k === 'box') { if (s.money < 250) return 'A drop box takes about $250 of lumber and hardware.'; s.money -= 250; p.dropBox = true; return 'The drop box is in: trade across the gate now never touches hands.'; }
  if (k === 'masks') { p.masks = true; return 'Masks at the gate for everyone.'; }
  if (k === 'hold') { p.hold = true; return 'New arrivals are held apart for 14 days before they come in.'; }
  if (k === 'shelter') { p.shelterUntil = dayIndex(s.clock.t) + 14; return 'Down in the filtered bunker for two weeks.'; }
  if (k === 'runner') { o.asked.push('runner'); return null; }
  return null;
}

export function outbreakGoal(s: GameState): FxGoal {
  const o = outbreakOf(s), v = variantOf(s), d = sinceHit(s);
  const lastPeak = Math.max(...o.waves.map(w => w.peak));
  return { id: v.kind, title: v.kind === 'pandemic' ? 'Ride out the waves' : 'Keep it out', steps: [
    { label: 'Decide: seal or stay open', done: o.asked.includes('seal') },
    { label: 'Build a drop box', done: o.policy.dropBox },
    { label: 'Get through the first wave with no one lost', done: d > o.waves[0].peak + o.waves[0].width * 1.5 && s.personState.every(ps => ps.needs.died == null) },
    { label: 'Have a recovered runner', done: o.immune.length > 0 },
    { label: 'Reach the end of the last wave', done: d > lastPeak + 40 },
  ] };
}

export const outbreakPrice = (s: GameState): number => 1 + 0.4 * Math.min(1, risk(s));
export function outbreakServices(s: GameState): Partial<Record<'grid' | 'phone' | 'law' | 'deliveries', number>> {
  const a = Math.min(0.4, risk(s) * 0.25 * (variantOf(s).kind === 'bioweapon' ? 1.5 : 1));
  return { grid: 1 - 0.6 * a, phone: 1 - 0.5 * a, law: 1 - 0.5 * a, deliveries: 1 - 0.8 * a };
}

/** Gate contact never falls to nothing: strangers carry it before the county's own wave (a bioweapon arrives from the cities at once). */
const floor = (s: GameState): number => variantOf(s).kind === 'bioweapon' ? 0.5 : 0.12;
