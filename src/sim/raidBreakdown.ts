/**
 * Why the raid went the way it did: what stopped the crew and what did not, in plain language (pure; tested in sim/raidBreakdown.test.ts).
 * Everything here is read from the fight's own record (its units, its events and its facts) and the state it was fought on, so the story always matches
 * the result: a layer is "held" when it did something, and a layer that was not there says so. Nothing is saved.
 */
import type { Battle, BattleEvent } from './battleTypes';
import type { GameState } from './state';
import { isTower } from './towers';
import { PERIMETER, runFinished, type PerimeterKind } from './perimeter';
import { isGuardUnit } from './defenseTune';
import { dogCount } from './pets';
import { pluralize } from './words';

export type Layer = 'wall' | 'towers' | 'guards' | 'dogs' | 'cameras' | 'family' | 'hiding' | 'supplies';

export interface BreakdownLine {
  layer: Layer;
  /** Did this layer help stop them? (false: it failed, or it was not there.) */
  held: boolean;
  text: string;
}

/** Who dropped the raiders that went down in the fight, by where the shooter stood. `bled` are men who went down wounded and died after, with no single shooter. */
export interface KillTally { towers: number; turrets: number; guards: number; family: number; dogs: number; hazards: number; bled: number; total: number }

export interface RaidBreakdown {
  result: 'repelled' | 'fled' | 'breached' | 'overrun';
  /** One sentence: the main reason, in the family's terms. */
  headline: string;
  lines: BreakdownLine[];
  kills: KillTally;
  /** Family members killed in the fight (guards on the payroll are not family). */
  familyKilled: number;
  guardsKilled: number;
  raidersDown: number;
  /** The real name of the wall the crew met ("stone-and-timber wall"), or null when there was none: the card's title uses it instead of a generic "fence". */
  wall: string | null;
}

const near = (a: { x: number; z: number }, b: { x: number; z: number }, r: number) => Math.hypot(a.x - b.x, a.z - b.z) <= r;

/** Where each unit stood at the time of each shot is rebuilt from its start and its `move` events. Returns who shot the man who went down (the last hit on him). */
export function killTally(g: GameState, b: Battle): KillTally {
  const towers = g.structures.filter(s => isTower(s.kind)).map(s => ({ x: s.x, z: s.z }));
  const pos = new Map<string, { x: number; z: number; y: number }>();
  for (const u of b.units) pos.set(u.id, { x: u.x, z: u.z, y: u.y ?? 0 });
  const lastHit = new Map<string, string>();
  const dogBit = new Set<string>();
  const k: KillTally = { towers: 0, turrets: 0, guards: 0, family: 0, dogs: 0, hazards: 0, bled: 0, total: 0 };
  const shooterAt = new Map<string, { x: number; z: number; y: number }>();
  const events: BattleEvent[] = [...b.events].sort((a, c) => a.t - c.t);
  for (const e of events) {
    if (e.kind === 'move' || e.kind === 'cover') { const p = pos.get(e.unit); pos.set(e.unit, { x: e.x, z: e.z, y: 'y' in e && e.y !== undefined ? e.y : p?.y ?? 0 }); }
    else if (e.kind === 'shot' && e.hit && e.from.startsWith('h_') || e.kind === 'shot' && e.hit && e.from.startsWith('t_')) { lastHit.set(e.to, e.from); const p = pos.get(e.from); if (p) shooterAt.set(e.from, { ...p }); }
    else if (e.kind === 'snag' && e.what === 'a guard dog') dogBit.add(e.unit);
    else if (e.kind === 'death' && !e.unit.startsWith('h_') && !e.unit.startsWith('t_')) {
      k.total++;
      const from = lastHit.get(e.unit);
      if (!from) { k[dogBit.has(e.unit) ? 'dogs' : 'bled']++; continue; }
      if (from.startsWith('t_')) { k.turrets++; continue; }
      if (isGuardUnit(from)) { k.guards++; continue; }
      const p = shooterAt.get(from);
      if (p && p.y > 0.5 && towers.some(t => near(t, p, 1.6))) k.towers++; else k.family++;
    }
  }
  return k;
}

const wallName = (kind: string): string => (kind in PERIMETER ? PERIMETER[kind as PerimeterKind].name.toLowerCase() : 'wall');

/** The strongest finished wall that stops people, by hit points, for the "there was a wall" line. */
function bestWall(g: GameState): PerimeterKind | null {
  let best: PerimeterKind | null = null, hp = -1;
  for (const r of g.perimeter) {
    const d = PERIMETER[r.kind];
    if (!runFinished(r) || !d || d.blocks.people < 0.3 || d.height < 0.3) continue;
    const h = d.blocks.people * d.height;
    if (h > hp) { hp = h; best = r.kind; }
  }
  return best;
}

/**
 * Build the breakdown of a fight played on `g` (the state the fight was fought on; the structures, wall and animals are the same before and after).
 * `lost` is what the stores lost (the report's own list), `hid` the number of people who went to a shelter.
 */
export function raidBreakdown(g: GameState, b: Battle, lost: ReadonlyArray<readonly [string, number]> = []): RaidBreakdown | null {
  const f = b.raid;
  if (!f) return null;
  const kills = killTally(g, b);
  const lines: BreakdownLine[] = [];
  const result = f.result, won = result === 'repelled' || result === 'fled';
  const ev = b.events;
  const guardUnits = b.units.filter(u => isGuardUnit(u.id));
  const guardsKilled = ev.filter(e => e.kind === 'death' && isGuardUnit(e.unit)).length;
  const familyKilled = ev.filter(e => e.kind === 'death' && e.unit.startsWith('h_') && !isGuardUnit(e.unit)).length;
  const raidersDown = kills.total;

  // the wall
  const wk = bestWall(g);
  const climbHurt = ev.filter(e => e.kind === 'snag' && e.what !== 'a guard dog').length;
  const fled = ev.filter(e => e.kind === 'flee').length;
  if (!wk) lines.push({ layer: 'wall', held: false, text: 'There was no wall to stop them: the crew walked straight up to the yard.' });
  else if (f.linePassed && f.breach) {
    const how = f.breach.method === 'ram' ? 'a truck' : f.breach.method === 'charge' ? 'a charge' : 'ladders';
    const where = f.breach.where ? (f.breach.where.gate ? 'at the gate' : `through the ${wallName(f.breach.where.kind)}`) : 'at the line';
    lines.push({ layer: 'wall', held: false, text: `The ${wallName(wk)} was breached ${where} by ${how}${f.beatenBack ? ', but the crew was driven back out of the yard' : ''}.` });
  } else lines.push({ layer: 'wall', held: true, text: `The ${wallName(wk)} held${climbHurt ? `: ${pluralize(climbHurt, 'man')} hurt getting at it` : ''}${fled ? `, and ${pluralize(fled, 'raider')} ran at the sight of it` : ''}.` });

  // towers (and turrets)
  const towerCount = g.structures.filter(s => isTower(s.kind)).length;
  if (kills.towers + kills.turrets > 0) lines.push({ layer: 'towers', held: true, text: `${pluralize(kills.towers + kills.turrets, 'raider')} dropped from ${kills.turrets && !kills.towers ? 'the turret' : 'the towers'}.` });
  else if (towerCount > 0) lines.push({ layer: 'towers', held: won, text: won ? `${pluralize(towerCount, 'tower')} watched the approach; the crew broke off before the towers had to fire.` : `${pluralize(towerCount, 'tower')} stood, but nobody dropped a raider from one.` });
  else lines.push({ layer: 'towers', held: false, text: 'No tower: nobody had the high ground.' });

  // guards
  if (guardUnits.length > 0) {
    const shots = ev.filter(e => e.kind === 'shot' && isGuardUnit(e.from)).length;
    lines.push({ layer: 'guards', held: shots > 0 || won, text: shots > 0 ? `${pluralize(guardUnits.length, 'contract guard')} fought${kills.guards ? `, dropping ${pluralize(kills.guards, 'raider')}` : ''}${guardsKilled ? `; ${pluralize(guardsKilled, 'guard')} killed` : ''}.` : `${pluralize(guardUnits.length, 'contract guard')} stood ready; the crew broke off before it came to shooting.` });
  } else if ((g.guards?.staff.length ?? 0) > 0) lines.push({ layer: 'guards', held: false, text: 'Your guards were not in this fight.' });

  // dogs
  const bites = ev.filter(e => e.kind === 'snag' && e.what === 'a guard dog').length;
  if (bites > 0) lines.push({ layer: 'dogs', held: true, text: `The guard dogs bit ${pluralize(bites, 'raider')} on the ladder.` });
  else if (dogCount(g) > 0) lines.push({ layer: 'dogs', held: won, text: won ? 'The dogs raised the alarm; the crew never got into their reach.' : 'The dogs barked, but they could not stop the crew.' });

  // cameras
  const cams = (g.stock.cameras ?? 0) + (g.stock.thermal_cam ?? 0);
  if (cams > 0) {
    const powered = g.utilities.lit.length > 0 || (g.utilities.grid && g.disaster.tracks.grid > 0.5);
    lines.push({ layer: 'cameras', held: powered, text: powered ? `${pluralize(cams, 'camera')} gave the watch eyes on the crew: shots landed more often.` : `${pluralize(cams, 'camera')} sat dark with no power.` });
  } else lines.push({ layer: 'cameras', held: false, text: 'No cameras: the watch saw only what it could see by eye.' });

  // the family's own guns
  if (kills.family > 0) lines.push({ layer: 'family', held: true, text: `Your family dropped ${pluralize(kills.family, 'raider')} from the posts.` });
  else if (familyKilled > 0) lines.push({ layer: 'family', held: false, text: `${pluralize(familyKilled, 'person', 'people')} in the family died without stopping a raider.` });
  if (familyKilled > 0 && kills.family > 0) lines.push({ layer: 'family', held: false, text: `${pluralize(familyKilled, 'person', 'people')} in the family were killed.` });

  // hiding
  const hid = ev.filter(e => e.kind === 'hide').length;
  const sheltered = b.units.filter(u => u.side === 'home' && !isGuardUnit(u.id) && ev.some(e => e.kind === 'move' && e.unit === u.id && g.structures.some(s => s.kind.startsWith('bunker_') && near(s, e, 0.6)))).length;
  if (hid + sheltered > 0) lines.push({ layer: 'hiding', held: true, text: `${pluralize(hid + sheltered, 'person', 'people')} got out of sight (the shelter, the cellar or a closet).` });

  // supplies
  const stolen = f.loot.reduce((a, l) => a + l.n, 0);
  if (stolen > 0 || lost.length > 0) lines.push({ layer: 'supplies', held: false, text: `Supplies lost: ${[...f.loot.map(l => `${l.n} ${l.what}`), ...lost.map(([k2, n]) => `${n} ${k2}`)].slice(0, 6).join(', ')}.` });
  else lines.push({ layer: 'supplies', held: true, text: 'Nothing was carried off.' });

  const headline = won
    ? (f.linePassed ? 'You drove them back out of the yard.' : lines.find(l => l.layer === 'wall' && l.held) ? 'The wall held and the defenders did the rest.' : 'The defenders held them at the line.')
    : result === 'breached' ? 'They broke the line and reached the yard; the houses held.'
      : 'They broke the line and overran the houses.';
  return { result, headline, lines, kills, familyKilled, guardsKilled, raidersDown, wall: wk ? wallName(wk) : null };
}
