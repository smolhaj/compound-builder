/**
 * The daily life of an order that has broken or been replaced (WP3): what happens between the cards. Pure of rendering; each function
 * takes the state and a `FxCtx`-like dice and returns log lines. `sim/disasters/lawless.ts`, `civil_war.ts` and `invasion.ts` call these.
 */
import type { FxCtx } from './disasterFx';
import type { GameState } from './state';
import { dayIndex, hourOf } from './state';
import { diffOf } from './difficulty';
import { postureOf } from './encounters';
import { lifeOf } from './neighborLife';
import { ALLIANCE_LEAN, hashUnit, otherFaction, sniperDayChance, reprisal, WAR_INFORM_P, type Faction } from './occupation';
import { SALVAGE, pactBetray } from './lawlessMath';
import { fxOf, hasPass, hostileNeighbors, takeGoods, bringBack, since, type OrderFx } from './orderEncounters';

const homeNeighbors = (s: GameState) => s.neighbors.filter(n => n.status === 'home' && n.members > 0);
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

/** Neighbors fly a flag (or none): the war's mailbox signs. Stable per seed. */
export function ensureFlags(s: GameState, f: OrderFx): void {
  if (f.flags) return;
  const lean = ALLIANCE_LEAN[s.site.region] ?? 0.5;
  f.flags = {};
  for (const n of s.neighbors) {
    const u = hashUnit(s.seed, `flag:${n.id}`);
    f.flags[n.id] = u < 0.3 ? 'none' : (u - 0.3) / 0.7 < lean ? 'alliance' : 'compact';
  }
}

/** A run out on the road with no pass pays at the bridge (goods) or, on the back roads, loses a day. Once per run. */
export function tollOnRuns(s: GameState, ctx: FxCtx): string[] {
  const f = fxOf(s), run = s.scavenge?.run;
  if (!f.post || !run || hasPass(s) || !ctx.once(`toll:${run.left}`)) return [];
  const backRoads = f.lastCheck !== undefined && since(s) - f.lastCheck < 30;
  if (backRoads) { run.back += 1; return ['The run went round by the back roads and lost a day to it.']; }
  const paid = takeGoods(s, { fuel: 1, canned: 1 });
  if (!paid.length) { run.back += 1; return ['The run was turned back at the bridge for want of anything to pay with, and lost a day.']; }
  return [`The run paid at the bridge on the way out: ${paid.join(', ')}. A pass would have been cheaper.`];
}

/** The ridge sniper (civil war): once a day, one adult working outdoors may be hit; walls, berms and a bunker cut it. */
export function sniperDay(s: GameState, ctx: FxCtx): string[] {
  const f = fxOf(s), d = since(s);
  if (!f.sniperUntil || d > f.sniperUntil) return [];
  const p = postureOf(s), cover = Math.min(0.9, p.barrier / 130 + (p.bunker ? 0.15 : 0));
  const chance = sniperDayChance(6, cover) * (diffOf(s.disaster).wound < 1 ? 0.5 : 1);
  if (ctx.r() >= chance) return [];
  const idx = s.people.map((_, i) => i).filter(i => !s.people[i].kid && s.personState[i]?.needs.died == null);
  if (!idx.length) return [];
  const i = idx[Math.floor(ctx.r() * idx.length)], n = s.personState[i].needs;
  const sev = Math.round(35 * diffOf(s.disaster).wound);
  n.hurt.push({ what: 'a rifle round from the ridge', sev, trauma: true });
  n.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 0, n.health - sev * 0.5);
  if (n.health <= 0) { n.died = Math.floor(s.clock.t); n.cause = 'raid'; return [`${s.people[i].first} was killed by a shot from the ridge, crossing the yard.`]; }
  return [`A shot from the ridge cracked across the yard. ${s.people[i].first} was hit. Work outdoors waits for cover now.`];
}
/** The sniper arrives (day 7 to 30, a month at a time) and again when the front moves. */
export function sniperStart(s: GameState, ctx: FxCtx, force = false): string[] {
  const f = fxOf(s), d = since(s);
  if ((f.sniperUntil ?? -1) >= d) return [];
  if (!force && (d < 7 || ctx.r() > 0.04)) return [];
  f.sniperFrom = d; f.sniperUntil = d + 30;
  return ['Somebody is on the ridge with a scoped rifle. A shot cracked over the yard at dusk. Cover the paths, or stay under the roof.'];
}

/** Neighbors under the other flag: a fire at a farm now and then (p 0.004 a day each), and the informant's word. */
export function neighborFires(s: GameState, ctx: FxCtx): string[] {
  const f = fxOf(s), out: string[] = [];
  if (!f.flags || !f.front) return out;
  for (const n of homeNeighbors(s)) {
    if (f.flags[n.id] !== otherFaction(f.front.holder) || ctx.r() > 0.004) continue;
    const life = lifeOf(s, n);
    if (life.farm === 'burned') continue;
    life.farm = 'burned'; life.burnedDay = dayIndex(s.clock.t);
    out.push(`${cap(n.name)}'s barn burned in the night. They flew the other flag. Nobody came.`);
  }
  return out;
}

/** The informant roll: p 0.15 a day per hostile neighbor, noted for the next visit. */
export const informantToday = (s: GameState, ctx: FxCtx): boolean => { const k = hostileNeighbors(s); return k > 0 && ctx.r() < 1 - Math.pow(1 - WAR_INFORM_P, k); };

/** When the front moves, whoever cooperated with the old holder answers for it (a 40% to 60% chance by fate: reprisal on the stores). */
export function frontReprisal(s: GameState, ctx: FxCtx, old: Faction): string[] {
  const f = fxOf(s), c = f.collab?.[old] ?? 0;
  if (c <= 0) return [];
  const p = s.disaster.fate === 'full' ? 0.15 : s.disaster.fate === 'partial' ? 0.4 : 0.6;
  if (ctx.r() > p) return ['The new men did not ask who had signed what. This time.'];
  const lost = takeGoods(s, { canned: 3, staples: 1, fuel: 1 }, 1 + Math.min(3, c));
  f.marked = Math.max(f.marked ?? 0, since(s) + 60);
  return [`The new holders came with a list of who had cooperated with the old ones. Your name was on it. They took ${lost.join(', ')} and wrote a date.`];
}

/** Sheltered fugitives, partisans or a lost soldier: the roll that it comes out, and the day they leave. */
export function shelterTick(s: GameState, ctx: FxCtx, informantP: number): string[] {
  const f = fxOf(s), sh = f.shelter, d = since(s);
  if (!sh) return [];
  if (ctx.r() < informantP * (sh.kind === 'partisan' ? 1.5 : 1)) {
    f.shelter = undefined; f.marked = Math.max(f.marked ?? 0, d + 120); f.reprisalDue = d + 2; f.hunted = d + 60;
    const lost = takeGoods(s, { canned: 5, staples: 1 }, 1);
    return [`Somebody told them. A patrol turned up at the gate at dawn and searched the cellar; ${lost.join(', ')} went with them. The ones you hid are gone or taken.`];
  }
  if (d >= sh.until) { f.shelter = undefined; return [sh.kind === 'partisan' ? 'The committee\'s people moved on in the night. They left a chalk mark on the culvert: "friend".' : 'The ones in the cellar left on their own at first light, with a bag of food. Nobody saw them go.']; }
  return [];
}

/** A salvaged house whose owners were hiding: found out, and the humanity bill. */
export function salvageFound(s: GameState): string[] {
  const f = fxOf(s), d = since(s), out: string[] = [];
  for (const x of [...(f.salvaged ?? [])]) {
    if (x.found > d) continue;
    f.salvaged = f.salvaged!.filter(y => y !== x);
    s.gate.humanity = Math.max(0, Math.min(100, s.gate.humanity + SALVAGE.HUMANITY));
    for (const n of homeNeighbors(s).slice(0, 2)) n.disposition = Math.max(-100, n.disposition - 8);
    out.push(`Word came down the road: the family at ${x.who.toLowerCase()} were in the cellar the whole time. They came up and found it stripped. They know whose truck it was.`);
  }
  return out;
}

/** A watch committee and a posse: a deal is struck; the committee may sell the family out. */
export function committeeTick(s: GameState, ctx: FxCtx): string[] {
  const f = fxOf(s), d = since(s), out: string[] = [];
  if (!f.committee?.length) return out;
  if (f.deal === undefined && d >= 75 && ctx.r() < 0.05) { f.deal = d; out.push('The Maple Road committee has made an agreement with the posse. Nobody has said what is in it.'); }
  if (f.deal !== undefined && ctx.r() < pactBetray(d - f.deal, true)) {
    for (const id of f.committee) { const n = s.neighbors.find(x => x.id === id); if (n) n.disposition = Math.max(-100, n.disposition - 15); }
    f.committee = []; f.titheK = 1.5; f.deal = undefined;
    const L = s.locals; if (L) L.pact = [];
    out.push('The committee told the posse what you have in the cellar. The pact is over. The next tithe will be half again as large.');
  }
  return out;
}

/** Draft and labor people coming home; also the shared housekeeping line. */
export const returnees = (s: GameState): string[] => bringBack(s);

/** The ambush: a weekly roll scaled by the resistance, answered within three miles by a hostage roll and maybe the column. */
export function ambushWeek(s: GameState, ctx: FxCtx, tier: number): string[] {
  const f = fxOf(s), d = since(s);
  if ((f.resistance ?? 0) <= 0 || d % 7 !== 0) return [];
  f.resistance = (f.resistance ?? 0) + 5;
  if (ctx.r() > Math.min(0.5, (f.resistance ?? 0) / 200)) return [];
  const miles = ctx.r() * 5, rep = reprisal(miles, tier, ctx.r), out = [`Somewhere ${Math.max(1, Math.round(miles))} miles off, a patrol was ambushed at a culvert.`];
  if (rep.hostages > 0) {
    const home = homeNeighbors(s);
    let n = 0;
    for (const nb of home.slice(0, Math.min(rep.hostages, 3))) { nb.members = Math.max(0, nb.members - 1); if (nb.members === 0) nb.status = 'gone'; n++; }
    out.push(`They lined up ${rep.hostages} men from the nearest farms by the church and shot them. ${n ? 'You knew some of them.' : ''}`);
    if (tier >= 3 && rep.burn) f.reprisalDue = d + 2;
  }
  return out;
}

/** Tier 2 and up: the curfew. The night watch is out after 8 p.m. against orders; a patrol may notice. */
export function curfewTick(s: GameState, ctx: FxCtx): string[] {
  const f = fxOf(s), d = since(s);
  if (hourOf(s.clock.t) >= 0 && (f.tier ?? 1) < 2) return [];
  const watching = s.personState.filter(ps => ps.needs.died == null && (ps.task as string) === 'watch').length;
  if (!watching || ctx.r() > 0.12) return [];
  const paid = takeGoods(s, { canned: 2, fuel: 1 });
  f.marked = Math.max(f.marked ?? 0, d + 30);
  return [`The night patrol passed the gate and saw someone on watch after the curfew. ${paid.length ? `A fine: ${paid.join(', ')}.` : 'A warning.'} Dark windows and a quiet yard are the order now.`];
}
