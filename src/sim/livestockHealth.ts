/**
 * Predators and sickness in the barnyard (user-approved: "coyotes, foxes,
 * hawks, bears in some regions; the guard dog matters, and a
 * predator-proof coop matters; animals get sick; vet supplies"). Pure.
 *
 *  Predators  by region (`PREDATORS`): coyotes and foxes nearly everywhere,
 *             hawks and owls on the hens, raccoons in the coop at night,
 *             black bears in the timbered North, Appalachia, the PNW and
 *             the Mountain West (in the warm months), mountain lions in the
 *             West, wolves in the Northern Rockies and the North Woods,
 *             bobcats. Each has a base rate of a raid a day on stock it
 *             takes, a kill, and what stops it:
 *               a predator-proof coop / hutch (`hardware_cloth`: ½-inch
 *                 hardware cloth, a buried apron, a covered run, two-step
 *                 latches) — foxes, raccoons and hawks ≈ 95 % less;
 *               the guard dog — 50–80 % less (it barks, it runs them off);
 *               a barn the stock is shut in at night — the big predators
 *                 on goats, calves and pigs ≈ 60 % less.
 *             Unprotected, a flock of a dozen loses 30–60 % a year in fox
 *             and raccoon country: about what backyard keepers report.
 *             After the collapse there are more of them (fewer trappers,
 *             feral dogs): ×1.5, and packs of dogs on the goats. A good
 *             hunter with a rifle gets the predator a third of the time,
 *             and the place is quieter for a month.
 *  Sickness   per head a year: goats ≈ 12 % (worms, pneumonia, mastitis,
 *             hoof rot), a cow 15 % (mastitis, milk fever, bloat), pigs
 *             6 %, a steer 5 %, rabbits 15 %, the flock ≈ 1 bout a year
 *             (mites, coccidiosis, a respiratory bug); twice as likely in
 *             poor condition, more in a cold winter without a barn. A sick
 *             animal gives half its milk. With the vet kit (a dose is a
 *             tenth of it) 85 % recover; without one, in peacetime the vet
 *             comes out ($250, 92 %); after, it's luck (about half live).
 */
import type { GameState } from './state';
import { calendarOf } from './state';
import { log } from './economy';
import { isFinished } from './construction';
import { huntingRifle } from './armory';
import type { Animal, Livestock } from './livestock';

export type Predator = 'coyote' | 'fox' | 'hawk' | 'raccoon' | 'bear' | 'lion' | 'wolf' | 'bobcat' | 'dogs';
export type Prey = 'hens' | 'rabbit' | 'kid' | 'goat' | 'piglet' | 'pig' | 'calf';
interface PredDef {
  name: string;
  /** What it takes, in order of preference. */
  prey: Prey[];
  /** Raids a day on stock it can get at, unprotected. */
  rate: number;
  /** Kills a raid [min, max]. */
  kill: [number, number];
  /** What's left of the rate behind a proof coop / with the dog / with the stock shut in a barn. */
  coop: number; dog: number; barn: number;
  /** Months it's about (day-of-year range), else all year. */
  season?: [number, number];
}
export const PRED: Record<Predator, PredDef> = {
  fox: { name: 'a fox', prey: ['hens', 'rabbit'], rate: 0.0015, kill: [1, 3], coop: 0.05, dog: 0.3, barn: 1 },
  raccoon: { name: 'a raccoon', prey: ['hens', 'rabbit'], rate: 0.0015, kill: [1, 4], coop: 0.05, dog: 0.4, barn: 1 },
  hawk: { name: 'a hawk', prey: ['hens'], rate: 0.0012, kill: [1, 1], coop: 0.05, dog: 0.8, barn: 1 },
  coyote: { name: 'coyotes', prey: ['hens', 'kid', 'rabbit', 'goat', 'piglet'], rate: 0.0015, kill: [1, 2], coop: 0.1, dog: 0.25, barn: 0.3 },
  bear: { name: 'a black bear', prey: ['pig', 'piglet', 'goat', 'hens', 'rabbit'], rate: 0.0012, kill: [1, 1], coop: 0.4, dog: 0.5, barn: 0.5, season: [110, 315] },
  lion: { name: 'a mountain lion', prey: ['goat', 'kid', 'calf'], rate: 0.0008, kill: [1, 1], coop: 1, dog: 0.5, barn: 0.3 },
  wolf: { name: 'wolves', prey: ['calf', 'goat', 'kid'], rate: 0.0006, kill: [1, 2], coop: 1, dog: 0.5, barn: 0.4 },
  bobcat: { name: 'a bobcat', prey: ['hens', 'rabbit', 'kid'], rate: 0.0008, kill: [1, 2], coop: 0.1, dog: 0.4, barn: 0.5 },
  dogs: { name: 'a pack of feral dogs', prey: ['goat', 'kid', 'hens', 'calf', 'piglet'], rate: 0.002, kill: [2, 4], coop: 0.3, dog: 0.4, barn: 0.3 },
};
/** Who hunts the barnyard where (feral dogs only after the collapse). */
export const PREDATORS: Record<string, Predator[]> = {
  mountain_west: ['coyote', 'fox', 'hawk', 'raccoon', 'bear', 'lion', 'wolf', 'bobcat'],
  appalachia: ['coyote', 'fox', 'hawk', 'raccoon', 'bear', 'bobcat'],
  desert: ['coyote', 'fox', 'hawk', 'lion', 'bobcat'],
  north_woods: ['coyote', 'fox', 'hawk', 'raccoon', 'bear', 'wolf', 'bobcat'],
  plains: ['coyote', 'fox', 'hawk', 'raccoon'],
  pnw: ['coyote', 'raccoon', 'hawk', 'bear', 'lion', 'bobcat'],
  upper_midwest: ['coyote', 'fox', 'hawk', 'raccoon', 'bear', 'wolf'],
  new_england: ['coyote', 'fox', 'hawk', 'raccoon', 'bear', 'bobcat'],
};

export interface Sick { a: Animal | 'hens'; what: string; day: number; n: number }
/** Sickness a head a year, and what it is. */
export const SICK: Record<Animal | 'hens', { rate: number; what: string[]; die: number }> = {
  goat: { rate: 0.12, what: ['worms (barber pole)', 'pneumonia', 'mastitis', 'hoof rot', 'bloat'], die: 0.5 },
  goat_buck: { rate: 0.1, what: ['worms (barber pole)', 'urinary stones', 'hoof rot'], die: 0.5 },
  cow: { rate: 0.15, what: ['mastitis', 'milk fever', 'bloat', 'pinkeye'], die: 0.45 },
  steer: { rate: 0.05, what: ['bloat', 'pinkeye', 'shipping fever'], die: 0.4 },
  sow: { rate: 0.06, what: ['erysipelas', 'mastitis', 'lameness'], die: 0.4 },
  boar: { rate: 0.05, what: ['erysipelas', 'lameness'], die: 0.4 },
  pig: { rate: 0.06, what: ['scours', 'erysipelas', 'pneumonia'], die: 0.4 },
  rabbit: { rate: 0.15, what: ['snuffles', 'GI stasis', 'ear mites'], die: 0.6 },
  hens: { rate: 1, what: ['coccidiosis', 'mites', 'a respiratory bug'], die: 0.3 },
};
export const VET_DOSE = 0.1, VET_CALL = 250, CURE = { kit: 0.85, vet: 0.92 }, SICK_DAYS = 7;

/** A sick animal's share of milk / litters (half while it's sick). */
export function sickFactor(l: Livestock, a: Animal): number {
  return l.sick.some(x => x.a === a) ? 0.5 : 1;
}

const coops = (s: GameState) => s.structures.filter(st => st.kind === 'chicken_coop' && isFinished(st));
/** Share of the coops and the hutch that are predator-proofed. */
export function proofShare(s: GameState, l: Livestock, prey: Prey): number {
  if (prey === 'rabbit') return l.proofed.includes('hutch') ? 1 : 0;
  const c = coops(s);
  return c.length ? c.filter(x => l.proofed.includes(x.id)).length / c.length : 0;
}
const preyCount = (s: GameState, l: Livestock, p: Prey): number => {
  switch (p) {
    case 'hens': return l.hens.n;
    case 'rabbit': return Math.floor(s.stock.rabbit ?? 0);
    case 'goat': return Math.floor(s.stock.goat ?? 0);
    case 'pig': return Math.floor(s.stock.pig ?? 0) + Math.floor(s.stock.sow ?? 0);
    case 'kid': return l.young.filter(y => y.kind === 'kid').reduce((a, y) => a + y.n, 0);
    case 'piglet': return l.young.filter(y => y.kind === 'piglet').reduce((a, y) => a + y.n, 0);
    case 'calf': return l.young.filter(y => y.kind === 'calf').reduce((a, y) => a + y.n, 0);
  }
};
function take(s: GameState, l: Livestock, p: Prey, n: number): number {
  let k = Math.min(n, preyCount(s, l, p));
  if (k <= 0) return 0;
  const got = k;
  if (p === 'hens') l.hens.n -= k;
  else if (p === 'rabbit') { s.stock.rabbit -= k; l.seen.rabbit = Math.floor(s.stock.rabbit); }
  else if (p === 'goat') { s.stock.goat -= k; l.seen.goat = Math.floor(s.stock.goat); }
  else if (p === 'pig') { const fp = Math.min(k, Math.floor(s.stock.pig ?? 0)); s.stock.pig -= fp; s.stock.sow -= k - fp; l.seen.pig = Math.floor(s.stock.pig); l.seen.sow = Math.floor(s.stock.sow); }
  else for (const y of l.young) {
    if (k <= 0) break;
    if (y.kind !== p) continue;
    const t = Math.min(k, y.n); y.n -= t; k -= t; if (y.f > y.n) y.f = y.n;
  }
  l.young = l.young.filter(y => y.n > 0);
  return got;
}
const PREY_WORD: Record<Prey, [string, string]> = { hens: ['hen', 'hens'], rabbit: ['rabbit', 'rabbits'], kid: ['kid', 'kids'], goat: ['goat', 'goats'], piglet: ['piglet', 'piglets'], pig: ['pig', 'pigs'], calf: ['calf', 'calves'] };

/** Proof any unproofed coop (and the hutch) the stockpile has the hardware cloth for. */
function proofWhatWeCan(s: GameState, l: Livestock): void {
  for (const c of coops(s)) if (!l.proofed.includes(c.id) && (s.stock.hardware_cloth ?? 0) >= 1) { s.stock.hardware_cloth -= 1; l.proofed.push(c.id); log(s, 'Predator-proofed the coop: hardware cloth on the run, an apron buried round it, latches a raccoon can\'t work.'); }
  if ((s.stock.rabbit ?? 0) >= 1 && !l.proofed.includes('hutch') && (s.stock.hardware_cloth ?? 0) >= 1) { s.stock.hardware_cloth -= 1; l.proofed.push('hutch'); }
}

/** Predators and sickness for the day (livestock.ts). */
export function healthDay(s: GameState, l: Livestock, r: () => number): void {
  proofWhatWeCan(s, l);
  const day = Math.floor(s.clock.t + 0.25), doy = calendarOf(s.clock).doy;
  const d = s.disaster, after = !!d.kind && s.clock.t >= d.hitAt && d.tracks.law < 0.5;
  const dog = (s.stock.dog ?? 0) >= 1, barn = s.structures.some(st => st.kind === 'barn' && isFinished(st));
  // ── predators: at most one raid a day ──
  const list = [...(PREDATORS[s.site.region] ?? PREDATORS.mountain_west), ...(after ? ['dogs' as Predator] : [])];
  const quiet = day < l.quietUntil ? 0.3 : 1;
  for (const pk of list) {
    const p = PRED[pk];
    if (p.season && (doy < p.season[0] || doy > p.season[1])) continue;
    const prey = p.prey.find(x => preyCount(s, l, x) > 0);
    if (!prey) continue;
    const proof = prey === 'hens' || prey === 'rabbit' ? 1 - proofShare(s, l, prey) * (1 - p.coop) : 1;
    const shut = barn && prey !== 'hens' && prey !== 'rabbit' ? p.barn : 1;
    const odds = p.rate * proof * shut * (dog ? p.dog : 1) * (after ? 1.5 : 1) * quiet;
    if (r() >= odds) continue;
    const n = take(s, l, prey, p.kill[0] + Math.floor(r() * (p.kill[1] - p.kill[0] + 1)));
    if (n <= 0) break;
    l.lost.predators += n;
    const hunter = Math.max(0, ...s.people.filter((q, i) => !q.kid && s.personState[i]?.needs.died == null).map(q => q.skills.hunter));
    const shot = hunter >= 3 && r() < 0.33 && huntingRifle(s, true);
    if (shot) l.quietUntil = day + 30;
    log(s, `${p.name[0].toUpperCase() + p.name.slice(1)} got ${n === 1 ? `a ${PREY_WORD[prey][0]}` : `${n} ${PREY_WORD[prey][1]}`}${dog ? ' before the dog ran it off' : ''}.${shot ? ' Someone sat up with the rifle and got it.' : prey === 'hens' && proofShare(s, l, 'hens') < 1 ? ' The coop needs predator-proofing.' : ''}`);
    break;
  }
  // ── sickness ──
  const winter = doy < 75 || doy > 320;
  const groups: Array<Animal | 'hens'> = ['goat', 'goat_buck', 'cow', 'steer', 'sow', 'boar', 'pig', 'rabbit', 'hens'];
  for (const a of groups) {
    const n = a === 'hens' ? (l.hens.n > 0 ? 1 : 0) : Math.floor(s.stock[a] ?? 0);
    if (n <= 0 || l.sick.some(x => x.a === a)) continue;
    const cond = a === 'hens' ? l.hens.cond : l.condition[a];
    const odds = n * SICK[a].rate / 365 * (cond < 0.6 ? 2 : 1) * (winter && !barn && a !== 'hens' && a !== 'rabbit' ? 1.5 : 1);
    if (r() >= odds) continue;
    const what = SICK[a].what[Math.floor(r() * SICK[a].what.length)];
    l.sick.push({ a, what, day, n: a === 'hens' ? Math.max(1, Math.round(l.hens.n * 0.3)) : 1 });
    log(s, a === 'hens' ? `The hens are sick: ${what}.` : `A ${a === 'goat' ? 'doe' : a === 'goat_buck' ? 'buck' : a === 'pig' ? 'pig' : a} is sick: ${what}.`);
  }
  // treatment and the outcome after a week
  const still: Sick[] = [];
  for (const x of l.sick) {
    if (day - x.day < SICK_DAYS) { still.push(x); continue; }
    let cure: number, how: string;
    if ((s.stock.vet_kit ?? 0) >= VET_DOSE) { s.stock.vet_kit -= VET_DOSE; cure = CURE.kit; how = 'treated from the vet kit'; }
    else if (d.tracks.deliveries > 0.25 && d.tracks.law >= 0.5 && s.money >= VET_CALL) { s.money -= VET_CALL; cure = CURE.vet; how = `the vet came out ($${VET_CALL})`; }
    else { cure = 1 - SICK[x.a].die; how = 'no medicine for it'; }
    if (r() < cure) { log(s, `The ${x.a === 'hens' ? 'hens are' : 'animal is'} over the ${x.what} (${how}).`); continue; }
    if (x.a === 'hens') { const k = Math.min(l.hens.n, x.n); l.hens.n -= k; l.lost.sickness += k; log(s, `The ${x.what} took ${k} hens (${how}).`); continue; }
    s.stock[x.a] = Math.max(0, (s.stock[x.a] ?? 0) - 1); l.seen[x.a] = Math.floor(s.stock[x.a]);
    l.lost.sickness++;
    log(s, `Lost a ${x.a === 'goat' ? 'doe' : x.a === 'goat_buck' ? 'buck' : x.a} to ${x.what} (${how}).`);
  }
  l.sick = still;
}
