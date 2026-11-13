import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { fightOdds, generateNeighbors, gateDay, hideFoundChance, breachText, postureOf, raiderTemper, resolve, whoComes, type Encounter, type EncounterKind } from './encounters';
import { planRun, canEnter } from './perimeter';
import { mulberry32 } from './rng';

/** A game a few days after a grid-down hit, with the law gone. */
function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + 20;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  return g;
}
const wall = (g: GameState) => {
  const r = planRun(g, 'container_wall', [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
};

describe('neighbors and the gate', () => {
  it('4–6 named neighbor households, deterministic', () => {
    for (let s = 1; s < 20; s++) {
      const n = generateNeighbors(s);
      expect(n.length).toBeGreaterThanOrEqual(4);
      expect(n.length).toBeLessThanOrEqual(6);
      expect(new Set(n.map(x => x.name)).size).toBe(n.length);
    }
    expect(generateNeighbors(3)).toEqual(generateNeighbors(3));
  });

  it('nobody comes in peacetime; after the hit, people do', () => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    for (let d = 0; d < 30; d++) { g.clock.t = d + 0.1; expect(gateDay(g)).toBeNull(); }
    const h = afterHit();
    let seen = 0;
    for (let d = 0; d < 120 && seen < 3; d++) { h.clock.t += 1; if (gateDay(h)) { seen++; resolve(h, h.gate.pending!.stances[0]); } }
    expect(seen).toBe(3);
  });

  it('threat matrix: a fortress look puts off looters and draws organized gangs', () => {
    const count = (fortress: number) => {
      const g = afterHit();
      const p = { ...postureOf(g), fortress, visibility: 60 };
      const r = mulberry32(5);
      const tally: Partial<Record<EncounterKind, number>> = {};
      for (let i = 0; i < 4000; i++) { const k = whoComes(g, p, r); tally[k] = (tally[k] ?? 0) + 1; }
      return tally;
    };
    const open = count(0), fort = count(100);
    expect(fort.looters!).toBeLessThan(open.looters! * 0.5);
    expect(fort.gang!).toBeGreaterThan(open.gang! * 1.5);
  });

  it('taking people in grows the family and raises humanity; turning them away lowers it', () => {
    const g = afterHit(2);
    g.gate.pending = null;
    let arrival = null;
    for (let d = 0; d < 400 && !arrival; d++) { g.clock.t += 1; const e = gateDay(g); if (e?.kind === 'arrival') arrival = e; else if (e) resolve(g, e.stances[0]); }
    expect(arrival).not.toBeNull();
    const n = g.people.length, h = g.gate.humanity;
    resolve(g, 'take_in');
    expect(g.people.length).toBe(n + arrival!.size);
    expect(g.personState.length).toBe(g.people.length);
    expect(g.gate.humanity).toBeGreaterThan(h);
    expect(g.gate.tookIn).toBe(arrival!.size);
  });

  it('walls and fighters hold the line more often than an open place does', () => {
    const run = (walled: boolean) => {
      let held = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = afterHit(seed);
        if (walled) wall(g);
        g.gate.pending = { id: 'x', kind: 'looters', day: Math.floor(g.clock.t), title: 'Looters', dossier: [], size: 4, armed: true, strength: 40, wants: { canned: 3 }, stances: ['defend'] };
        if (resolve(g, 'defend').tone === 'good') held++;
      }
      return held;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('hiding in a bunker keeps the family safe when they find the place but not the way down (sim/bunkerHide.test.ts: when the bunker is found, it does not)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = afterHit(seed);
      Object.assign(g.stock, { canned: 60, water_jugs: 40 });
      g.structures.push({ id: 'b', kind: 'bunker_hatch', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
      g.gate.pending = { id: 'x', kind: 'gang', day: 1, title: 'Gang', dossier: [], size: 8, armed: true, strength: 96, wants: { canned: 8 }, stances: ['hide'] };
      const o = resolve(g, 'hide');
      if (o.bunker && o.bunker.fight !== 'hidden') continue;
      expect(g.personState.every(ps => ps.needs.hurt.length === 0)).toBe(true);
    }
  });

  it('the escape tunnel is never a way in, whatever happens at the gate', () => {
    const g = afterHit();
    const t = planRun(g, 'escape_tunnel', [[5, 5], [30, 5]]);
    expect(canEnter(t, 'outside')).toBe(false);
    expect(canEnter(t, 'inside')).toBe(true);
  });
  it('the longer and more permanent the collapse, the more ruthless the crews', () => {
    const count = (fate: 'full' | 'never', days: number) => {
      const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
      g.disaster.fate = fate; g.clock.t = g.disaster.hitAt + days;
      const r = mulberry32(9); let savage = 0;
      for (let i = 0; i < 2000; i++) if (raiderTemper(g, 'gang', r) === 'savage') savage++;
      return savage / 2000;
    };
    expect(count('full', 30)).toBeLessThan(0.12);
    expect(count('never', 500)).toBeGreaterThan(0.3);
  });
});

describe('round 4: honest odds, hiding has a cost, no double take', () => {
  const looters = (g: GameState, size = 4, extra: Partial<Encounter> = {}): Encounter => {
    const e: Encounter = { id: `x${size}`, kind: 'looters', day: Math.floor(g.clock.t), title: 'Looters', dossier: ['d0', 'd1'], size, armed: true, strength: size * 9, wants: { canned: 3, fuel: 2 }, stances: ['hide', 'warn', 'defend', 'parley'], temper: 'desperate', ...extra };
    g.gate.pending = e;
    return e;
  };
  const rifles = (g: GameState) => { for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 4; } g.armory.ammo['556'] = 2000; return g; };
  const house = (g: GameState) => { g.structures.push({ id: 'house', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); return g; };

  it('the fight odds come from the battle itself: deterministic, cached, and they rank the places', () => {
    const open = house(afterHit(3)), held = rifles(house(afterHit(3)));
    wall(held);
    const a = fightOdds(open, looters(open)), b = fightOdds(held, looters(held));
    expect(fightOdds(open, open.gate.pending!)).toBe(a);   // cached
    expect(b.win).toBeGreaterThan(a.win);
    expect(b.loseSomeone).toBeLessThanOrEqual(a.loseSomeone);
    const again = house(afterHit(3)); looters(again);
    again.gate.pending!.id = 'other';
    expect(fightOdds(again, again.gate.pending!)).toEqual(a);
  });

  it('a lost fight takes applyBattle\'s share of the stores, not the raiders\' wants on top', () => {
    let checked = 0;
    for (let seed = 1; seed <= 20 && checked < 3; seed++) {
      const g = house(afterHit(seed));
      g.stock.canned = 20;
      looters(g, 8);
      const card = resolve(g, 'defend');
      if (card.tone !== 'bad') continue;
      checked++;
      const b = g.gate.battle!;
      // (raid depth, save v87: the loss is the crew's itemized loot, planned from what it wanted, reached and could carry: sim/raidOutcomes.ts)
      const took = b.raid!.loot.filter(l => l.what === 'canned').reduce((a, l) => a + l.n, 0);
      expect(g.stock.canned).toBe(20 - took);
      expect(took).toBeLessThanOrEqual(Math.floor(20 * 0.9));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('hiding when they find the place costs more than what they came for, and they come back', () => {
    let found = 0, backs = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = house(afterHit(seed));
      // a place that shows: sheds and a shop round the house
      for (let k = 0; k < 8; k++) g.structures.push({ id: `sh${k}`, kind: 'workshop', x: 14 + k, z: 4, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      g.stock.canned = 40; g.stock.staples = 10;
      looters(g, 5, { temper: 'hard' });
      const card = resolve(g, 'hide');
      if (card.tone !== 'bad') continue;
      found++;
      expect(g.stock.canned).toBeLessThan(40 - 3 * 1.5);   // more than 1.5 × the wants
      expect(g.stock.staples).toBeLessThan(10);
      if (g.gate.comeBack) {
        expect(g.gate.next).toBeLessThanOrEqual(Math.floor(g.clock.t) + 25);
        // the crew that comes back knows somebody lives here
        let back: Encounter | null = null;
        for (let d = 0; d < 60 && !back; d++) { g.clock.t += 1; const e = gateDay(g); if (e?.back) back = e; else if (e) g.gate.pending = null; }
        if (back) {
          backs++;
          expect(back.kind).toBe('looters');
          expect(hideFoundChance(g, back)).toBeGreaterThan(hideFoundChance(g, { ...back, back: false }));
          // and a crew back for the second time doesn't promise a third visit
          g.gate.comeBack = null;
          g.gate.pending = back;
          resolve(g, 'hide');
          expect(g.gate.comeBack).toBeNull();
        }
      }
    }
    expect(found).toBeGreaterThan(5);
    expect(backs).toBeGreaterThan(0);
  });
});

describe('raid aftermath copy matches what happened', () => {
  it('says nothing was taken when nothing was, with or without a fight', () => {
    const none = breachText(false, { lostStock: false, harmed: false, fought: false });
    expect(none).toMatch(/found nothing worth taking/);
    expect(none).not.toMatch(/took what they came for/);
    expect(breachText(true, { lostStock: false, harmed: false, fought: true })).toMatch(/but found nothing worth taking and left/);
    expect(breachText(true, { lostStock: false, harmed: false, fought: true })).not.toMatch(/without a fight/);
    expect(none).toMatch(/without a fight/);
  });
  it('names what did happen', () => {
    expect(breachText(false, { lostStock: true, harmed: false, fought: true })).toMatch(/took what they came for/);
    expect(breachText(true, { lostStock: false, harmed: true, fought: true })).toMatch(/hurt people, but found nothing/);
    expect(breachText(true, { lostStock: true, harmed: true, fought: true })).toMatch(/took what they could carry/);
  });
});
