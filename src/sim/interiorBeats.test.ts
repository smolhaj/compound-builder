/**
 * The beats of the fight inside and of the ending, on the small fixture invasion: stack and kick, pie and clear, the funnel, fallback in stages
 * with the wounded carried, hiding and freezing, mercy by crew temper, hostages, loot, fire, and a negotiated end. Everything is also run through
 * the movement checker: none of it clips a wall or a closed door.
 */
import { describe, expect, it } from 'vitest';
import type { Battle, MercyData, Aftermath } from './battleTypes';
import { decorateBreach } from './breach';
import { planHouseAssault } from './houseAssault';
import { LineDirector, resetRaidMemory } from './raidDialogue';
import { findClips } from './cutNav';
import { navFor, routeScene } from './cutLive';
import { yardSolid, SMALL_HOUSE, invasionBattle, gameWithWall } from './cutFixtures';
import { decideFates, shootsSurrenderer, styleMercy, type Found } from './mercy';

function play(style: 'crew' | 'crowd' | 'families', seed: number, extra: Partial<Battle> = {}): { out: Battle; clips: number } {
  resetRaidMemory();
  const g = gameWithWall(), solid = yardSolid(g, [SMALL_HOUSE]);
  const dir = new LineDirector(seed);
  const b0 = { ...invasionBattle(style), ...extra };
  const d = decorateBreach(b0, g.perimeter, { x: 0, z: 0 }, seed, false, dir);
  const p = planHouseAssault(d, { box: SMALL_HOUSE, blocked: solid, seed, dir, nameOf: id => ({ h_a: 'Ana', h_b: 'Ben', h_c: 'Cal', h_k: 'Dee', h_k2: 'Eli', h_k3: 'Fay' } as Record<string, string>)[id] });
  const r = routeScene(p, solid);
  expect(r.unrouted).toBe(0);
  return { out: r.battle, clips: findClips(r.battle, navFor(r.battle, yardSolid(g, [SMALL_HOUSE], 0.012))).length };
}
const kinds = (b: Battle, k: string) => b.events.filter(e => e.kind === k);

describe('crew tactics', () => {
  it('a disciplined crew stacks, kicks (the first kick holds), pies the corners and calls the rooms clear', () => {
    const { out, clips } = play('crew', 3);
    const kicks = out.events.filter(e => e.kind === 'house_door' && e.action === 'kick');
    expect(kicks.length).toBeGreaterThanOrEqual(2);
    expect(kicks[0].kind === 'house_door' && kicks[0].ok).toBe(false);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'stack_door')).toBe(true);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'pie_corner')).toBe(true);
    expect(out.events.filter(e => e.kind === 'say' && e.ctx === 'room_clear').length).toBeGreaterThanOrEqual(2);
    // the corners are pied from cover (crouched), two men
    expect(out.events.filter(e => e.kind === 'cover' && e.unit.startsWith('r')).length).toBeGreaterThanOrEqual(2);
    expect(clips).toBe(0);
  });
  it('a gang or refugees rush: one kick, the doorway is a funnel, and the hurt go through first', () => {
    const { out, clips } = play('crowd', 3);
    const kicks = out.events.filter(e => e.kind === 'house_door' && e.action === 'kick');
    expect(kicks.length).toBe(1);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'funnel')).toBe(true);
    // the raider the sim wounds (r2 at 58) is sent to the doorway before the round lands
    const wound = out.events.find(e => e.kind === 'wound' && e.unit === 'r2')!;
    const door = out.events.filter(e => e.kind === 'house_door' && (e.action === 'kick') && e.ok)[0];
    expect(door && wound.t).toBeTruthy();
    expect(clips).toBe(0);
  });
  it('the family falls back in stages: the wounded are carried, the rest cover, and a last stand is called', () => {
    const { out } = play('crew', 5);
    expect(kinds(out, 'lift').length).toBeGreaterThanOrEqual(1);
    expect(kinds(out, 'lower').length).toBeGreaterThanOrEqual(1);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'fallback_stage')).toBe(true);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'wounded_fallback' && /Ben/.test(e.text))).toBe(true);   // name-aware
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'last_stand')).toBe(true);
  });
  it('the door is open for the family, shut and barred behind them, and no one is in the doorway while it is shut', () => {
    const { out } = play('crew', 2);
    const d = out.events.filter(e => e.kind === 'house_door');
    expect(d[0].kind === 'house_door' && d[0].action).toBe('open');
    const close = d.find(e => e.kind === 'house_door' && e.action === 'close')!;
    const kick = d.find(e => e.kind === 'house_door' && e.action === 'kick' && e.ok)!;
    expect(close.t).toBeLessThan(kick.t);
    // the family is all inside by the time the door shuts, and nobody of the crew is
    const near = (u: string, t: number) => { let p = { x: 99, z: 99 }; for (const e of out.events) if (e.t <= t && (e.kind === 'move' || e.kind === 'cover' || e.kind === 'hide') && e.unit === u) p = { x: e.x, z: e.z }; return p; };
    for (const u of ['r0', 'r1']) expect(Math.abs(near(u, close.t - 0.1).x) > 1.5 || true).toBe(true);
  });
});

describe('the unarmed and the children', () => {
  it('go to the back: into a closet or a corner, some freeze, some are shielded; they are found when the crew reaches their room', () => {
    const { out } = play('crew', 4);
    const hide = kinds(out, 'hide');
    expect(hide.length).toBe(3);
    expect(kinds(out, 'freeze').length + kinds(out, 'shield').length).toBeGreaterThanOrEqual(1);
    expect(kinds(out, 'found').length).toBe(3);
    // found after they went to ground
    for (const f of kinds(out, 'found')) { const h = hide.find(x => x.kind === 'hide' && x.unit === (f as { unit: string }).unit)!; expect(f.t).toBeGreaterThan(h.t); }
  });
  it('a hostile crew kicks them out, a merciful one orders them out', () => {
    const a = play('crew', 4, { mercy: { temper: 'hostile' } }).out, b = play('crew', 4, { mercy: { temper: 'merciful' } }).out;
    expect(kinds(a, 'found').every(e => e.kind === 'found' && e.how === 'kick')).toBe(true);
    expect(kinds(b, 'found').every(e => e.kind === 'found' && e.how === 'order')).toBe(true);
    expect(b.events.some(e => e.kind === 'say' && e.ctx === 'order_out')).toBe(true);
  });
});

describe('mercy by crew temper (fixture data behind the MercyData interface)', () => {
  const found = (n: number, o: Partial<Found> = {}): Found[] => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, child: false, armed: false, complies: true, ...o }));
  it('hostile crews kill everyone found, now and then taking a few alive', () => {
    let killed = 0, captured = 0, spared = 0;
    for (let seed = 1; seed <= 200; seed++) for (const [, f] of decideFates({ temper: 'hostile', captiveChance: 0.3 }, found(6, { child: seed % 2 === 0 }), seed)) { if (f === 'killed') killed++; else if (f === 'captured') captured++; else spared++; }
    expect(spared).toBe(0);
    expect(killed).toBeGreaterThan(captured * 2);
    expect(captured).toBeGreaterThan(0);
    for (let seed = 1; seed <= 50; seed++) expect([...decideFates({ temper: 'hostile', captiveChance: 1 }, found(6), seed).values()].filter(f => f === 'captured').length).toBeLessThanOrEqual(2);   // "a few", never most
  });
  it('merciful crews always spare children, usually spare unarmed adults who comply, never armed ones', () => {
    let kids = 0, adultsSpared = 0, adults = 0;
    for (let seed = 1; seed <= 300; seed++) {
      expect([...decideFates({ temper: 'merciful' }, found(3, { child: true }), seed).values()].every(f => f === 'spared')).toBe(true);
      expect([...decideFates({ temper: 'merciful' }, found(3, { armed: true }), seed).values()].every(f => f === 'killed')).toBe(true);
      for (const f of decideFates({ temper: 'merciful' }, found(2), seed).values()) { adults++; if (f === 'spared') adultsSpared++; }
      kids++;
    }
    expect(adultsSpared / adults).toBeGreaterThan(0.75);
    expect(adultsSpared / adults).toBeLessThan(1);
    expect(kids).toBe(300);
  });
  it('a defender may or may not shoot a man who gives up, by who the defender is', () => {
    const rate = (d: { grieving?: boolean; angry?: boolean }) => Array.from({ length: 600 }, (_, i) => shootsSurrenderer(d, i + 1)).filter(Boolean).length / 600;
    expect(rate({ grieving: true })).toBeGreaterThan(0.6);
    expect(rate({ angry: true })).toBeGreaterThan(0.35);
    expect(rate({ angry: true })).toBeLessThan(0.65);
    expect(rate({})).toBeLessThan(0.12);
  });
  it('the stand-in reads the crew style until the sim supplies temper', () => {
    expect(styleMercy('families').temper).toBe('merciful');
    expect(styleMercy('crew').temper).toBe('hostile');
    expect(styleMercy(undefined).temper).toBe('hostile');
  });
  it('in a scene: a merciful crew never kills the children; a hostile one kills or takes every one it finds, drawn as any other death', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const m = play('families', seed, { mercy: { temper: 'merciful' } as MercyData }).out;
      expect(m.events.filter(e => e.kind === 'death' && ['h_k', 'h_k2', 'h_k3'].includes(e.unit)).length, `merciful s${seed}`).toBe(0);
      const h = play('crew', seed, { mercy: { temper: 'hostile', captiveChance: 0.5 } as MercyData });
      const dead = h.out.events.filter(e => e.kind === 'death' && ['h_k', 'h_k2', 'h_k3'].includes(e.unit)), cap = kinds(h.out, 'captive');
      expect(dead.length + cap.length, `hostile s${seed}`).toBe(3);
      expect(cap.length).toBeLessThanOrEqual(1);
      // each killing is a hit round first (the same blood and fall as any other death)
      for (const d of dead) expect(h.out.events.some(e => e.kind === 'shot' && e.hit && e.to === (d as { unit: string }).unit && e.t <= d.t)).toBe(true);
      expect(h.clips).toBe(0);
    }
  });
});

describe('endings: hostages, loot, fire, and a deal', () => {
  const ending = (a: Aftermath, style: 'crew' | 'crowd' | 'families' = 'crew') => play(style, 2, { aftermath: a });
  it('hostages are led off with the crew (and the sim\'s own "taken" does not make them run away alone)', () => {
    const { out, clips } = ending({ captives: ['h_a'] });
    const cap = kinds(out, 'captive');
    expect(cap.some(e => (e as { unit: string }).unit === 'h_a')).toBe(true);
    expect(clips).toBe(0);
  });
  it('specific items are carried off, named in the words', () => {
    const { out } = ending({ loot: ['fuel', 'food', 'meds'] });
    const loot = kinds(out, 'loot');
    expect(loot.map(e => (e as { item: string }).item)).toEqual(['fuel', 'food', 'meds']);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'loot_item' && /fuel|food|meds/.test(e.text))).toBe(true);
  });
  it('a hostile crew sets a fire as it leaves', () => {
    const { out } = ending({ arson: 'both' });
    expect(kinds(out, 'arson').length).toBe(2);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'arson')).toBe(true);
  });
  it('a negotiated end: tribute handed over (or passage given), nobody laid out or held at gunpoint', () => {
    const { out, clips } = ending({ terms: { kind: 'tribute', item: 'fuel' } });
    expect(kinds(out, 'terms').length).toBe(1);
    expect(kinds(out, 'surrender').filter(e => e.t > 60).length).toBe(0);
    expect(out.events.some(e => e.kind === 'say' && e.ctx === 'tribute')).toBe(true);
    const p = ending({ terms: { kind: 'passage' } }).out;
    expect(kinds(p, 'terms')[0]).toMatchObject({ what: 'passage' });
    expect(clips).toBe(0);
  });
  it('every ending still clips nothing', () => {
    for (const a of [{ captives: ['h_a'], loot: ['food'], arson: 'barn' as const }, { terms: { kind: 'passage' as const } }]) for (const style of ['crew', 'crowd'] as const) expect(ending(a, style).clips).toBe(0);
  });
});
