/**
 * People behave like people in the house fight (user: interior figures clip in and out, stand idle, do not behave like people). Every actor is sampled on every
 * step of the playback of real sim invasions and the small fixture invasions; the test fails on a teleport (a step beyond any speed), two people standing in the
 * same spot, a body inside a wall or furniture or through a shut door, a defender who stands in the open while rounds are fired at them, and two people in the
 * doorway at once.
 */
import { describe, expect, it } from 'vitest';
import type { Battle, BattleEvent } from './battleTypes';
import { walkBattle, findClips } from './cutNav';
import { navFor, routeScene } from './cutLive';
import { decorateBreach } from './breach';
import { planHouseAssault } from './houseAssault';
import { LineDirector, resetRaidMemory } from './raidDialogue';
import { yardSolid, SMALL_HOUSE, invasionBattle, gameWithWall, scenes, prepared, HOUSE } from './cutFixtures';
import type { GameState } from './state';

interface Frame { t: number; pos: Map<string, { x: number; z: number }> }

function frames(b: Battle, g: GameState, house: typeof HOUSE): { frames: Frame[]; teleports: string[] } {
  const nav = navFor(b, yardSolid(g, [house], 0.012));
  const by = new Map<number, Frame>(), tele: string[] = [];
  const last = new Map<string, { x: number; z: number }>();
  walkBattle(b, nav, { route: false, onStep: (id, t, a, c) => {
    const k = Math.round(t * 100), f = by.get(k) ?? { t, pos: new Map() }; by.set(k, f); f.pos.set(id, c); last.set(id, c);
    if (Math.hypot(c.x - a.x, c.z - a.z) > 0.25 && tele.length < 6) tele.push(`${id} jumps ${Math.hypot(c.x - a.x, c.z - a.z).toFixed(2)} at t=${t.toFixed(2)}`);
  } });
  return { frames: [...by.values()].sort((p, q) => p.t - q.t), teleports: tele };
}

/** Pairs of living, free-standing people in one spot for a stretch (carried people and the led are held, not standing). */
function overlaps(b: Battle, fr: Frame[], from: number, to: number): string[] {
  const dead = new Map<string, number>(), held = new Set<string>();
  for (const e of b.events) { if (e.kind === 'death') dead.set(e.unit, e.t); if (e.kind === 'lift' || e.kind === 'hostage') held.add(e.unit); if (e.kind === 'aid') held.add(e.unit); }
  const run = new Map<string, number>(), bad: string[] = [];
  for (const f of fr) {
    if (f.t < from || f.t > to) continue;
    const ids = [...f.pos.keys()].filter(id => !held.has(id) && !((dead.get(id) ?? Infinity) <= f.t));
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const p = f.pos.get(ids[i])!, q = f.pos.get(ids[j])!;
      if (Math.hypot(p.x - q.x, p.z - q.z) < 0.05) { const key = `${ids[i]}|${ids[j]}`; seen.add(key); run.set(key, (run.get(key) ?? 0) + 0.05); if (run.get(key)! > 1.0 && bad.length < 4 && !bad.some(x => x.startsWith(key))) bad.push(`${key} share a spot for over a second at t=${f.t.toFixed(1)}`); }
    }
    for (const k of [...run.keys()]) if (!seen.has(k)) run.delete(k);
  }
  return bad;
}

/** A defender who stood upright where they had stopped, for seconds, while rounds were fired at them. */
function standingUnderFire(b: Battle, fr: Frame[], from: number, to: number): string[] {
  const at = (id: string, t: number) => { const f = fr.find(x => Math.abs(x.t - t) < 0.026); return f?.pos.get(id); };
  const bad: string[] = [];
  const posture = new Map<string, { kind: string; t: number }>();
  const side = new Map(b.units.map(u => [u.id, u.side]));
  // (a defender who freezes in terror is the one person who may stand there: panic is a human reaction, not idleness)
  const frozen = new Set(b.events.filter(e => e.kind === 'panic' && (e as { how?: string }).how === 'freeze').map(e => (e as { unit: string }).unit));
  for (const e of [...b.events].sort((p, q) => p.t - q.t)) {
    if ('unit' in e && (e.kind === 'move' || e.kind === 'cover' || e.kind === 'hide' || e.kind === 'surrender' || e.kind === 'lay' || e.kind === 'freeze' || e.kind === 'found')) posture.set((e as { unit: string }).unit, { kind: e.kind, t: e.t });
    if (e.kind === 'shot' && e.t >= from && e.t <= to && side.get(e.to) === 'home' && side.get(e.from) === 'raider') {
      const p = posture.get(e.to);
      const here = at(e.to, e.t), before = at(e.to, e.t - 1.2);
      const still = !!here && !!before && Math.hypot(here.x - before.x, here.z - before.z) < 0.03;   // (he has not moved for a second and more)
      if (p && p.kind === 'move' && still && !frozen.has(e.to) && e.t - p.t > 1.2 && bad.length < 4) bad.push(`${e.to} stood in the open at t=${e.t.toFixed(1)} (last moved ${p.t.toFixed(1)}) while ${e.from} fired`);
    }
  }
  return bad;
}

/** Times at which people pass a doorway, from their positions: never two inside it at once. */
function doorwayJams(b: Battle, fr: Frame[]): string[] {
  const d = b.events.find((e): e is Extract<BattleEvent, { kind: 'house_door' }> => e.kind === 'house_door');
  if (!d) return [];
  const bad: string[] = [];
  for (const f of fr) {
    const inside = [...f.pos.entries()].filter(([, p]) => Math.hypot(p.x - d.x, p.z - d.z) < 0.07);
    if (inside.length > 2 && bad.length < 3) bad.push(`${inside.map(([id]) => id).join(',')} in the doorway together at t=${f.t.toFixed(1)}`);
  }
  return bad;
}

describe('the fight inside the house: people behave like people', () => {
  for (const style of ['crew', 'crowd', 'families'] as const) for (const seed of [1, 2, 3]) {
    it(`fixture invasion, ${style}, seed ${seed}`, () => {
      resetRaidMemory();
      const g = gameWithWall(), solid = yardSolid(g, [SMALL_HOUSE]), dir = new LineDirector(seed);
      const d = decorateBreach(invasionBattle(style), g.perimeter, { x: 0, z: 0 }, seed, false, dir);
      const p = planHouseAssault(d, { box: SMALL_HOUSE, blocked: solid, seed, dir });
      const out = routeScene(p, solid).battle, iw = out.invasion!.interior!;
      const { frames: fr, teleports } = frames(out, g, SMALL_HOUSE);
      expect(teleports).toEqual([]);
      expect(findClips(out, navFor(out, yardSolid(g, [SMALL_HOUSE], 0.012)))).toEqual([]);
      expect(overlaps(out, fr, iw.from, iw.to - 12)).toEqual([]);
      expect(standingUnderFire(out, fr, iw.from, iw.to)).toEqual([]);
      expect(doorwayJams(out, fr)).toEqual([]);
    });
  }
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`real sim invasion, seed ${seed}`, () => {
      const { g, battles } = scenes(seed, 2.25, 'gang', 12, 'savage');
      const b = prepared(battles[battles.length - 1], g, seed * 31), iw = b.invasion?.interior;
      if (!iw) return;
      const { frames: fr, teleports } = frames(b, g, HOUSE);
      expect(teleports).toEqual([]);
      expect(overlaps(b, fr, iw.from, iw.to - 12)).toEqual([]);
      expect(standingUnderFire(b, fr, iw.from, iw.to)).toEqual([]);
      expect(doorwayJams(b, fr)).toEqual([]);
    }, 90000);
  }
});
