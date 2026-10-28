/**
 * Peacetime break-ins while the law still works (decided with the user:
 * "Yes, with real law"). Pure and seeded.
 *
 * Rate (user: "very rare before the collapse"): an ordinary rural place sees
 * one about every 50 years (40–60), so most runs never get one before the
 * collapse; a very visible, talked-about place tops out near once in 12
 * (OPSEC exposure, squared through raidPressure). A dog cuts
 * it to about a third, a driveway alarm and powered cameras by a quarter to
 * a half. Never while the law track is below 0.5 (that's the gate system).
 * About a third are daytime burglaries of an empty house (logged, no
 * choice); the rest are at night with the family home: a pending gate
 * encounter of kind `break_in`, 1–3 intruders, about a third with a pistol.
 *
 * Stances:
 *  call_911  everyone behind the safe-room or a locked bedroom door; the
 *            sheriff takes 15–45 minutes by region and miles to town; the
 *            intruders stay 8–15 and usually leave first, with what they
 *            found (cash not in a safe, guns not in a safe, tools, pills).
 *  shout     lights on, shout that the police are coming: most run.
 *  confront  a small battle (planBattle `peacetime`); they run at the first
 *            shot. Someone may fire after them as they run.
 *
 * A shooting brings the sheriff's investigation: castle doctrine by state
 * (an intruder shot inside the home at night is almost always justified),
 * lawyer fees ($5k–$25k), the guns used held as evidence 30–120 days; shot
 * while fleeing → a real chance of charges (bigger fees, a conviction → no
 * guns ever again); a civil suit chance; the local news (OPSEC). Deputies on
 * the place see what's in plain view: contraband (sim/blackMarket.ts seize)
 * or mines are a felony.
 */
import { mulberry32 } from './rng';
import { log } from './economy';
import { raidPressure } from './opsec';
import { powered } from './gear';
import { backgroundOf } from './family';
import { GUN, type Gun } from './armory';
import { seize, LAWYERS } from './blackMarket';
import { applyBattle, planBattle } from './battle';
import type { RegionId } from './regions';
import type { GameState } from './state';
import type { Encounter, Outcome, Stance } from './encounters';
import { stealTools } from './tools';
import type { Battle } from './battleTypes';

export interface Breakins {
  /** Break-ins so far (night and day). */
  count: number;
  lastAt: number;
  /** Guns the sheriff holds as evidence, and when they come back (Infinity: forfeit). */
  evidence: Array<{ gun: Gun; until: number }>;
  /** Last time the family was on the local news (−1: never). */
  newsAt: number;
  /** A felony conviction: no guns or ammunition while the law works. */
  prohibited: boolean;
  /** Lawyer fees, settlements and fines paid over break-ins. */
  legalCost: number;
  charged: number;
  suits: number;
}
export const newBreakins = (): Breakins => ({ count: 0, lastAt: -1, evidence: [], newsAt: -1, prohibited: false, legalCost: 0, charged: 0, suits: 0 });
export const breakinsOf = (s: GameState): Breakins => (s.breakins ??= newBreakins());

/** Very rare before the collapse (user): about once in 50 years at an ordinary place (exposure ≈ 15); a place everyone talks about tops out near once in 12. */
export const BASE_PER_YEAR = 1 / 50;

/** The sheriff's office by region: response minutes [fast, slow], the state whose law applies, how sure a shooting inside at night is ruled justified. */
export const SHERIFF: Record<RegionId, { min: number; max: number; state: string; castle: number }> = {
  mountain_west: { min: 20, max: 45, state: 'Idaho', castle: 0.96 },
  appalachia: { min: 20, max: 40, state: 'Tennessee', castle: 0.95 },
  desert: { min: 25, max: 45, state: 'Arizona', castle: 0.96 },
  north_woods: { min: 25, max: 45, state: 'Minnesota', castle: 0.9 },
  new_england: { min: 25, max: 45, state: 'Vermont', castle: 0.9 },
  ozarks: { min: 20, max: 45, state: 'Missouri', castle: 0.96 },
  hill_country: { min: 20, max: 40, state: 'Texas', castle: 0.97 },
  rust_belt: { min: 15, max: 25, state: 'Ohio', castle: 0.95 },
  plains: { min: 20, max: 45, state: 'Kansas', castle: 0.96 },
  pnw: { min: 15, max: 30, state: 'Washington', castle: 0.9 },
  upper_midwest: { min: 15, max: 30, state: 'Wisconsin', castle: 0.95 },
};

const n = (s: GameState, k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
const money = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const lawWorks = (s: GameState) => s.disaster.tracks.law >= 0.5;

/** Expected break-ins a year (0 once the law is gone). */
export function breakInRate(s: GameState): number {
  if (!lawWorks(s)) return 0;
  const seen = (raidPressure(s) / 0.835) ** 2;   // 0.7 (nobody knows) · 1 (an ordinary place, exposure ≈ 15) · 3.7 (everybody does)
  let deter = 1;
  if (n(s, 'dog')) deter *= 0.35;
  if (n(s, 'driveway_alarm')) deter *= 0.6;
  if (powered(s) && (n(s, 'cameras') || n(s, 'thermal_cam'))) deter *= 0.75;
  if (powered(s) && n(s, 'floodlights')) deter *= 0.9;
  const town = 1 + 0.3 * Math.max(0, 1 - s.site.miles / 10);   // close to town: more traffic past the drive
  return BASE_PER_YEAR * seen * deter * town;
}

/** Minutes for a deputy to get there after the 911 call (region and miles to town). */
export function responseMinutes(s: GameState, r: () => number): number {
  const d = SHERIFF[s.site.region];
  const far = Math.max(0, Math.min(1, s.site.miles / 25));
  const m = d.min + (d.max - d.min) * (0.5 * far + 0.5 * r());
  return Math.round(Math.max(d.min, Math.min(d.max, m)));
}

/** Charge a bill: checking, then savings, then cash; what's left is owed. */
function charge(s: GameState, amount: number): void {
  let left = amount;
  const take = (have: number) => { const t = Math.min(Math.max(0, have), left); left -= t; return have - t; };
  s.money = take(s.money); s.fin.savings = take(s.fin.savings); s.fin.cash = take(s.fin.cash);
  if (left > 0) s.money -= left;
  breakinsOf(s).legalCost += amount;
}

// ─────────────────────────────────────────────────────────────────────────
// The daily roll
// ─────────────────────────────────────────────────────────────────────────

/**
 * Once a day (from gateDay, while the law works): maybe a break-in. A night
 * one comes back as the pending encounter; a daytime one is logged here and
 * returns null.
 */
export function breakInDay(s: GameState, day: number): Encounter | null {
  const rate = breakInRate(s);
  if (rate <= 0) return null;
  const r = mulberry32(s.seed * 4441 + day * 53 + 7);
  if (r() >= rate / 365) return null;
  const b = breakinsOf(s);
  b.count++; b.lastAt = s.clock.t;
  if (r() < 0.33) {
    // nobody home: the back door kicked in while everyone was in town
    const lines = burgle(s, r, 1);
    const mins = responseMinutes(s, r);
    lines.push(...plainView(s, r, 0.5));
    log(s, `Came home to the back door kicked in. A deputy came out in ${mins} minutes and took a report.${lines.length ? ' ' + lines.join(' ') : ''}`);
    return null;
  }
  const u = r();
  const size = u < 0.6 ? 1 : u < 0.88 ? 2 : 3;
  const armed = r() < 0.35;
  const d = SHERIFF[s.site.region];
  const sound = n(s, 'dog') ? 'The dog is going crazy downstairs.' : n(s, 'driveway_alarm') ? 'The driveway alarm chimed, then glass broke downstairs.' : 'Glass breaking downstairs. Then footsteps.';
  return {
    id: `e${s.nextId++}`, kind: 'break_in', day, title: 'Someone is in the house',
    dossier: [
      `Two in the morning. ${sound}`,
      `${size === 1 ? 'One person' : `${size} people`}, by the voices; ${armed ? 'one has a pistol, from what you saw on the stairs' : 'no gun that you can see'}. They want something to sell, not a fight.`,
      `The law still works: the ${d.state} sheriff's office is ${d.min}–${d.max} minutes out on the county road.`,
    ],
    size, armed, strength: size * 5, wants: {}, stances: ['call_911', 'shout', 'confront'],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Losses and the law on the place
// ─────────────────────────────────────────────────────────────────────────

/** What they take from a house they have to themselves for a while (share 0–1 of the time they'd like). */
export function burgle(s: GameState, r: () => number, share: number): string[] {
  const lost: string[] = [];
  let claim = 0;
  const safe = n(s, 'gun_safe') > 0;
  if (s.fin.cash > 0 && r() < (safe ? 0.1 : 0.6) * share) {
    const t = Math.round(s.fin.cash * (0.5 + 0.5 * r()));
    s.fin.cash -= t; lost.push(`${money(t)} in cash`);
    claim += Math.min(200, t);   // homeowner policies cover about $200 of cash
  }
  const loose = s.armory.guns.filter(g => g.where === 'house' && !g.carrier);
  let taken = 0;
  for (const g of loose) {
    if (taken >= 3 || r() >= 0.5 * share) continue;
    s.armory.guns = s.armory.guns.filter(x => x !== g); taken++;
    const m = GUN[g.model];
    lost.push(`the ${m?.name ?? 'gun'}`);
    claim += m?.price ?? 0;
  }
  // the tools in the shed (sim/tools.ts): a locked workshop, a metal garage or a safe keeps most of them
  { const th = stealTools(s, r, 0.45 * share); if (th.lines.length) { lost.push(th.lines[0].replace(/^Tools taken: /, 'tools from the shed: ').replace(/\.$/, '')); claim += th.value; } }
  if (s.stock.meds >= 1 && r() < 0.4 * share) { s.stock.meds -= 1; lost.push('the pills in the medicine cabinet'); }
  const out = lost.length ? [`Stolen: ${lost.join(', ')}.`] : ['They left with nothing worth much.'];
  if (taken) out.push('Stolen guns are reported to the sheriff and the ATF by serial number.');
  if (s.paper.insured && claim > 1000) {
    const pay = Math.min(claim, 2500 + 1500) - 1000;   // a $1,000 deductible; guns capped about $2,500 on a standard policy
    s.money += pay; out.push(`The insurance paid ${money(pay)} after the deductible.`);
  }
  return out;
}

/**
 * Deputies on the place. `look` 0–1: how hard they look (a burglary report
 * ≈ 0.3–0.5; a shooting scene with a warrant ≈ 1). Anything illegal they
 * find (contraband guns or gear, mines) is a felony: everything illegal is
 * seized, a fine and lawyers, a likely conviction.
 */
export function plainView(s: GameState, r: () => number, look: number, mineWentOff = false): string[] {
  const contraGuns = s.armory.guns.filter(g => GUN[g.model]?.contraband);
  const mats = n(s, 'grenades') + n(s, 'rpg_launcher') + n(s, 'rpg_rounds') + n(s, 'suppressor');
  const mines = n(s, 'mines');
  let found = contraGuns.some(g => r() < (g.where === 'house' ? 0.9 : 0.5) * look);
  if (!found && mats > 0) found = r() < 0.6 * look;
  if (!found && mines > 0) found = mineWentOff || r() < 0.4 * look;
  if (!found) return [];
  return felony(s, r, mines);
}

function felony(s: GameState, r: () => number, mines: number): string[] {
  const b = breakinsOf(s);
  const items = seize(s) + mines;
  s.stock.mines = 0;
  const fine = 25_000 + 5_000 * items;
  s.paper.fines += fine;
  charge(s, fine + LAWYERS);
  b.charged++;
  const out = [`The deputies found what they weren't looking for: ${items} illegal item${items === 1 ? '' : 's'}${mines ? `, ${mines} mine${mines === 1 ? '' : 's'} dug up by the bomb squad` : ''}. Federal felony charges, a ${money(fine)} fine and ${money(LAWYERS)} in lawyers.`];
  if (r() < 0.8) out.push(convict(s, 'the felony'));
  else out.push('A plea to a lesser charge: no felony record, but the ATF knows your name now.');
  return out;
}

/** A felony conviction: no guns, no ammunition (18 U.S.C. § 922(g)); they're sold through a dealer at half their value. */
function convict(s: GameState, what: string): string {
  const b = breakinsOf(s);
  b.prohibited = true;
  const guns = [...s.armory.guns, ...b.evidence.map(e => e.gun)];
  const worth = Math.round(guns.reduce((a, g) => a + (GUN[g.model]?.price ?? 0) * 0.5, 0));
  s.armory.guns = []; b.evidence = []; s.armory.ammo = {};
  s.money += worth;
  return `Convicted of ${what}: a felony record. No guns or ammunition from now on; ${guns.length ? `the ${guns.length} gun${guns.length === 1 ? '' : 's'} went to a dealer for ${money(worth)}` : 'nothing to give up'}.`;
}

/** The guns used go into the evidence locker. */
function hold(s: GameState, shooters: string[], days: number): string | null {
  const b = breakinsOf(s);
  const held: Gun[] = [];
  for (const pid of shooters) {
    const g = s.armory.guns.find(x => x.carrier === pid) ?? s.armory.guns.find(x => !x.carrier && (s.armory.ammo[GUN[x.model]?.cal] ?? 0) >= 1 && !held.includes(x));
    if (g && !held.includes(g)) held.push(g);
  }
  if (!held.length) return null;
  s.armory.guns = s.armory.guns.filter(g => !held.includes(g));
  for (const g of held) b.evidence.push({ gun: g, until: s.clock.t + days });
  const names = held.map(g => GUN[g.model]?.name ?? 'gun');
  return `The ${names.join(' and the ')} ${held.length === 1 ? 'is' : 'are'} held as evidence${Number.isFinite(days) ? ` for about ${Math.round(days)} days` : ' until the case is over'}.`;
}

export interface Shooting {
  /** Home person ids who fired. */
  shooters: string[];
  /** Intruders hit inside (before they ran) and while running / outside; how many died. */
  inside: number;
  fleeing: number;
  killed: number;
  night: boolean;
  /** A mine went off in the fight. */
  mine: boolean;
}

/** What a fight's timeline says about who shot whom, and where. */
export function shootingOf(b: Battle): Shooting {
  const fled = new Map<string, number>();
  for (const e of b.events) if (e.kind === 'flee' && !fled.has(e.unit)) fled.set(e.unit, e.t);
  const homeUnit = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const shooters = [...new Set(b.events.filter(e => e.kind === 'shot' && homeUnit.has(e.from)).map(e => homeUnit.get((e as { from: string }).from)!))];
  const hitAt = new Map<string, number>(), dead = new Set<string>();
  for (const e of b.events) {
    if ((e.kind === 'wound' && !e.stopped) || e.kind === 'death') {
      if (!e.unit.startsWith('r')) continue;
      if (!hitAt.has(e.unit)) hitAt.set(e.unit, e.t);
      if (e.kind === 'death') dead.add(e.unit);
    }
  }
  let inside = 0, fleeing = 0;
  for (const [u, t] of hitAt) { if (fled.has(u) && t > fled.get(u)!) fleeing++; else inside++; }
  return { shooters, inside, fleeing, killed: dead.size, night: b.night, mine: b.events.some(e => e.kind === 'mine') };
}

/**
 * The sheriff's investigation of a defensive shooting while the law works.
 * Castle doctrine (the state's) decides most of it; fleeing changes it.
 */
export function investigate(s: GameState, sh: Shooting, r: () => number): string[] {
  const b = breakinsOf(s);
  const d = SHERIFF[s.site.region];
  const out: string[] = [];
  const hits = sh.inside + sh.fleeing;
  if (!sh.shooters.length && !sh.mine) return out;
  if (!hits) {
    out.push('Shots fired, nobody hit. The deputies took statements and the brass.');
    if (r() < 0.1) { const f = 500 + Math.round(1500 * r()); s.paper.fines += f; charge(s, f); out.push(`A citation for reckless discharge: ${money(f)}.`); }
    out.push(...plainView(s, r, 0.5, sh.mine));
    return out;
  }
  out.push(`The ${d.state} sheriff's office investigates: the scene taped off till morning, everyone's statement, the guns bagged.`);
  const justified = sh.fleeing === 0 && r() < (sh.night ? d.castle : d.castle - 0.15);
  let charged = false;
  if (justified) {
    const fee = Math.round((sh.killed ? 12_000 + 13_000 * r() : 5_000 + 10_000 * r()) / 100) * 100;
    charge(s, fee);
    out.push(`Castle doctrine: an intruder in the home at night. The county attorney ruled it justified${sh.killed ? ' after the grand jury' : ''}. ${money(fee)} in lawyer fees.`);
    const h = hold(s, sh.shooters, 30 + 90 * r()); if (h) out.push(h);
  } else {
    charged = true; b.charged++;
    const fee = Math.round((30_000 + 60_000 * r()) / 100) * 100;
    charge(s, fee);
    out.push(sh.fleeing ? `Shot while running away: no longer a threat, ${d.state} prosecutors say. Charged; ${money(fee)} in lawyers.` : `The county attorney didn't buy that it was self-defense. Charged; ${money(fee)} in lawyers.`);
    if (r() < (sh.fleeing ? 0.45 : 0.3)) {
      out.push(convict(s, sh.killed ? 'manslaughter' : 'aggravated assault'));
      const f = 5000; s.paper.fines += f; charge(s, f);
    } else {
      out.push('The jury acquitted.');
      const h = hold(s, sh.shooters, 180); if (h) out.push(h);
    }
  }
  // the intruder or their family sues; most castle-doctrine states give a justified shooter civil immunity
  if (r() < (justified ? 0.05 : 0.4)) {
    b.suits++;
    const cost = Math.round((justified ? 3_000 + 5_000 * r() : 15_000 + 45_000 * r()) / 100) * 100;
    charge(s, cost);
    out.push(justified ? `${sh.killed ? 'His family' : 'He'} sued anyway; dismissed under the state's immunity law after ${money(cost)} in fees.` : `A civil suit from ${sh.killed ? 'his family' : 'the man you shot'}: ${money(cost)} to settle.`);
  }
  if (sh.killed) s.gate.humanity = Math.max(0, s.gate.humanity - 4);
  b.newsAt = s.clock.t;
  out.push(`It made the local news${charged ? ' and the county paper for weeks' : ''}: everyone in the county knows the place now, and what's in it.`);
  out.push(...plainView(s, r, 1, sh.mine));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// The stances
// ─────────────────────────────────────────────────────────────────────────

/** Resolve a night break-in. Returns the card's parts (encounters.resolve does the bookkeeping). */
export function resolveBreakIn(s: GameState, e: Encounter, stance: Stance): Omit<Outcome, 'lines'> & { lines: string[] } {
  const r = mulberry32(s.seed * 52817 + e.day * 11 + stance.length);
  const mins = responseMinutes(s, r);
  const stay = 8 + Math.round(7 * r());
  const lines: string[] = [];
  const safeRoom = n(s, 'safe_room') > 0;
  if (stance === 'shout') {
    const homeArmed = s.armory.guns.length > 0;
    const p = 0.7 + (n(s, 'dog') ? 0.1 : 0) + (powered(s) && n(s, 'floodlights') ? 0.05 : 0) + (homeArmed ? 0.05 : 0) - (e.armed ? 0.15 : 0) - (e.size - 1) * 0.05;
    if (r() < p) {
      lines.push(`The deputy got there in ${mins} minutes and took a report.`);
      lines.push(...plainView(s, r, 0.3));
      return { title: 'They ran', text: `Every light on, and a shout down the stairs that the sheriff is on the way. A door bangs, a car with no lights pulls out onto the county road.`, tone: 'good', lines };
    }
    lines.push('They didn\'t run. Footsteps on the stairs.');
    stance = 'confront';
  }
  if (stance === 'call_911') {
    if (mins <= stay + 2 && r() < 0.5) {
      lines.push(`The deputies were there in ${mins} minutes and caught ${e.size === 1 ? 'him' : 'them'} loading the car.`);
      lines.push(...plainView(s, r, 0.4));
      return { title: 'Caught in the drive', text: `Behind the ${safeRoom ? 'safe-room' : 'bedroom'} door, on the phone with dispatch, you hear the sirens come up the road.`, tone: 'good', lines };
    }
    lines.push(...burgle(s, r, 0.6));
    lines.push(`The deputy got there ${mins} minutes after the call; they'd been gone ${Math.max(1, mins - stay)}.`);
    lines.push(...plainView(s, r, 0.4));
    return { title: 'Gone before the deputies came', text: `Everyone behind the ${safeRoom ? 'safe-room' : 'locked bedroom'} door with the phone, the dispatcher's voice, things being pulled out of drawers downstairs. Then the car.`, tone: 'mixed', lines };
  }
  // confront: a short fight, second by second (sim/battle.ts peacetime)
  const g = s.gate;
  const b = planBattle(s, e.size, s.seed * 131 + e.day * 7 + 3, { armed: e.armed, peacetime: true });
  g.battle = b;
  // a break-in is not a raid: keep the food and the raid tallies as they were (wounds, ammo and mines still count)
  const food = { canned: s.stock.canned, staples: s.stock.staples, frozen: s.stock.frozen, fuel: s.stock.fuel, meds: s.stock.meds };
  const held = g.raidsHeld, lost = g.raidsLost, after = g.aftermath;
  lines.push(...applyBattle(s, b));
  // the deputies take any intruder left on the floor (ambulance or jail): no lawless aftermath decision (sim/aftermath.ts)
  Object.assign(s.stock, food); g.raidsHeld = held; g.raidsLost = lost; g.aftermath = after;
  const sh = shootingOf(b);
  // adrenaline: someone fires after them as they run across the yard
  if (b.result === 'fled' && sh.shooters.length) {
    const vet = sh.shooters.some(pid => { const p = s.people.find(x => x.id === pid); return p ? backgroundOf(p) !== null : false; });
    if (r() < (vet ? 0.05 : 0.15)) {
      lines.push('Someone kept shooting as they ran across the yard.');
      if (r() < 0.35) { sh.fleeing++; lines.push('One of them went down by the car.'); }
    }
  }
  lines.push(`The deputies were there ${mins} minutes after the call.`);
  const legal = investigate(s, sh, r);
  if (!sh.shooters.length && !sh.mine) lines.push(...plainView(s, r, 0.4));
  lines.push(...legal);
  const hit = sh.inside + sh.fleeing;
  if (b.result === 'fled' || b.result === 'repelled') {
    return { title: hit ? 'Shots in the house' : 'They ran', text: hit ? `${hit === 1 ? 'One of them' : `${hit} of them`} went down${sh.killed ? '' : ', alive'}. The rest ran. Then the long night with the deputies.` : 'They ran at the first sign of a fight.', tone: hit ? 'mixed' : 'good', lines };
  }
  lines.push(...burgle(s, r, 0.5));
  return { title: 'They got what they came for', text: 'It went wrong in the dark. They left with what they could carry.', tone: 'bad', lines };
}

/** Once a day: the evidence locker gives guns back (only while the law works). */
export function legalDay(s: GameState): string[] {
  const b = s.breakins;
  if (!b?.evidence.length || !lawWorks(s)) return [];
  const due = b.evidence.filter(x => x.until <= s.clock.t);
  if (!due.length) return [];
  b.evidence = b.evidence.filter(x => x.until > s.clock.t);
  if (b.prohibited) return [];
  for (const x of due) s.armory.guns.push({ ...x.gun, carrier: null, where: n(s, 'gun_safe') ? 'safe' : 'house' });
  return [`The sheriff's office released the ${due.map(x => GUN[x.gun.model]?.name ?? 'gun').join(' and the ')} from evidence.`];
}
