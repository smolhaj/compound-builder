import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { addSkirt, canEnter, hasSkirt, planRun, runBill, skirtProblem, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import { resolve } from './encounters';
import { applyBattle, planBattle } from './battle';
import { adoptDog } from './pets';
import { boltPassages } from './compounds';
import { gateDay } from './encounters';
import { ambushOdds, ambushParty, chosenParty, ambushShape, combine, detectChances, digChancePerDay, digDay, digDefense, floodChance, newDigs, type Dig } from './tunnelers';
import { defenseReport } from './defenseReport';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 400) + 0.25;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  for (const p of g.people) p.skills.hunter = 0;   // nobody on the watch unless a test says so
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
const done = (g: GameState, kind: PerimeterKind, pts: Pt[]): PerimeterRun => { const r = planRun(g, kind, pts); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return r; };
const square = (g: GameState, kind: PerimeterKind, cx = 0, cz = 0, h = 5) => done(g, kind, [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h], [cx - h, cz - h]]);
const armedFamily = (g: GameState) => {
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 2000;
};
const dig = (g: GameState, run: PerimeterRun, over: Partial<Dig> = {}): Dig => {
  const d: Dig = { id: 'd1', run: run.id, at: [0, -5], startDay: dayIndex(g.clock.t), days: 8, size: 6, temper: 'desperate', detectedDay: null, by: null, skirtChecked: false, floodChecked: false, warned: false, ignored: false, passage: null, ...over };
  g.digs = { ...newDigs(), active: d };
  return d;
};
/** Run a dig day by day; returns what ended it. */
function play(g: GameState, days = 14): 'skirt' | 'flooded' | 'warned' | 'inside' | 'running' {
  for (let i = 0; i < days; i++) {
    g.clock.t += 1;
    digDay(g);
    if (g.gate.pending?.dig) return g.gate.pending.dig.phase === 'warning' ? 'warned' : 'inside';
    if (!g.digs!.active) return g.digs!.turnedBySkirt ? 'skirt' : g.digs!.flooded ? 'flooded' : 'running';
  }
  return 'running';
}

describe('tunnelers: when and how rare', () => {
  it('never before the collapse, nor with no wall worth digging under, and rarely after', () => {
    const g = afterHit(1);
    expect(digChancePerDay(g)).toBe(0);       // no wall
    square(g, 'steel_wall');
    expect(digChancePerDay(g)).toBeGreaterThan(0);
    expect(digChancePerDay(g)).toBeLessThan(0.004);   // roughly once in a couple of years
    g.clock.t = g.disaster.hitAt + 30;
    expect(digChancePerDay(g)).toBe(0);       // too early in the collapse
    const peace = newGame(1); square(peace, 'steel_wall');
    expect(digChancePerDay(peace)).toBe(0);
    // later in the collapse they are likelier
    const mid = afterHit(1); square(mid, 'steel_wall'); mid.clock.t = mid.disaster.hitAt + 200;
    const later = afterHit(1); square(later, 'steel_wall'); later.clock.t += 600;
    expect(digChancePerDay(later)).toBeGreaterThan(digChancePerDay(mid));
    expect(digChancePerDay(mid)).toBeGreaterThan(0);
  });
});

describe('tunnelers: how each counter changes the odds', () => {
  it('sensors only listen with power; dogs and a watch add up; together they find almost every long dig', () => {
    const g = afterHit(2);
    const run = square(g, 'container_wall');
    const base = digDefense(g, run, [0, -5]);
    expect(combine(detectChances(base))).toBe(0);
    g.stock.ground_sensor = 2;
    expect(detectChances(digDefense(g, run, [0, -5])).sensors).toBe(0);      // no power
    g.utilities.lit = ['house'];
    const wired = detectChances(digDefense(g, run, [0, -5]));
    expect(wired.sensors).toBeGreaterThan(0.05);
    adoptDog(g); adoptDog(g);
    const withDogs = combine(detectChances(digDefense(g, run, [0, -5])));
    expect(withDogs).toBeGreaterThan(combine(wired));
    // over eight days nearly every dig is noticed
    let found = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const h = afterHit(seed); const r = square(h, 'container_wall'); h.stock.ground_sensor = 3; adoptDog(h); adoptDog(h); h.utilities.lit = ['house'];
      dig(h, r); if (play(h) === 'warned') found++;
    }
    expect(found).toBeGreaterThanOrEqual(27);
  });

  it('with no counters they come up inside the wall, and the battle treats it as breached from the start', () => {
    let inside = 0, breachedEarly = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = afterHit(seed); const r = square(g, 'container_wall'); armedFamily(g);
      dig(g, r);
      if (play(g) !== 'inside') continue;
      inside++;
      const e = g.gate.pending!;
      expect(e.size).toBeLessThan(6);          // a few of them
      expect(e.dig?.phase).toBe('inside');
      resolve(g, 'defend');
      const b = g.gate.battle!;
      if (b.events.some(x => x.kind === 'breach' && x.t <= 2)) breachedEarly++;
    }
    expect(inside).toBe(12);
    expect(breachedEarly).toBeGreaterThanOrEqual(10);
  });

  it('a buried skirt stops the dig; the cheaper fence can add one, the steel tiers have it built in', () => {
    const tally = (kind: PerimeterKind, skirt: boolean) => {
      let stopped = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const g = afterHit(seed); const r = square(g, kind); if (skirt) r.skirtAt = 0;
        dig(g, r); if (play(g) === 'skirt') stopped++;
      }
      return stopped;
    };
    expect(tally('container_wall', false)).toBe(0);
    expect(tally('container_wall', true)).toBeGreaterThanOrEqual(26);
    expect(tally('steel_wall', false)).toBeGreaterThanOrEqual(26);   // deep footing built in
    const g = afterHit(3); const r = square(g, 'log_palisade');
    expect(hasSkirt(r, g.clock.t)).toBe(false);
    expect(skirtProblem(g, r)).toMatch(/Waiting/);
    g.stock.rebar = 20; g.stock.concrete = 30;
    const before = g.stock.concrete;
    expect(addSkirt(g, r.id)).toBeNull();
    expect(g.stock.concrete).toBeLessThan(before);
    expect(hasSkirt(r, g.clock.t)).toBe(false);          // the crew is still at it
    expect(hasSkirt(r, g.clock.t + 7)).toBe(true);
    expect(addSkirt(g, r.id)).toMatch(/already/);
    expect(skirtProblem(g, square(g, 'steel_wall'))).toMatch(/footing/);
  });

  it('a ditch outside the wall floods the tunnel with some probability', () => {
    const g = afterHit(4); const r = square(g, 'container_wall');
    expect(floodChance(g, digDefense(g, r, [0, -5]))).toBe(0);
    done(g, 'ditch', [[-6, -6], [6, -6]]);      // just outside the north wall
    expect(digDefense(g, r, [0, -5]).ditch).toBe(true);
    expect(floodChance(g, { ditch: true })).toBeGreaterThan(0.4);
    let flooded = 0, through = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const h = afterHit(seed); const w = square(h, 'container_wall'); done(h, 'ditch', [[-6, -6], [6, -6]]);
      dig(h, w); const out = play(h);
      if (out === 'flooded') flooded++; else through++;
    }
    expect(flooded).toBeGreaterThan(14);
    expect(through).toBeGreaterThan(3);      // not certain: some dig through
  });
});

describe('tunnelers: what you do when you hear them', () => {
  it('offers the ambush only to an armed party, the flood only with a ditch, the collapse only with the means', () => {
    const g = afterHit(5); const r = square(g, 'container_wall');
    dig(g, r, { detectedDay: dayIndex(g.clock.t), by: 'dogs' }); adoptDog(g);
    expect(ambushParty(g)).toEqual([]);
    digDay(g);
    expect(g.gate.pending!.stances).toEqual(['ignore']);
    const h = afterHit(5); const w = square(h, 'container_wall'); armedFamily(h); done(h, 'ditch', [[-6, -6], [6, -6]]); h.stock.excavator = 1;
    dig(h, w, { detectedDay: dayIndex(h.clock.t), by: 'dogs' });
    digDay(h);
    expect(h.gate.pending!.stances).toEqual(['ambush', 'flood', 'collapse', 'ignore']);
  });

  it('warned early and well armed, the ambush at the breakout usually holds; warned late it holds less', () => {
    const g = afterHit(6); square(g, 'container_wall'); armedFamily(g);
    const early = ambushOdds(g, { size: 6, lead: 7 }), late = ambushOdds(g, { size: 6, lead: 0 });
    expect(early.win).toBeGreaterThanOrEqual(late.win);
    expect(early.win).toBeGreaterThan(0.6);
    const a = ambushShape(6, 7), b = ambushShape(6, 0);
    expect(a.surprise).toBeGreaterThan(b.surprise);
    expect(a.crew).toBeLessThanOrEqual(b.crew);
  });

  it('sending the party leaves the house thin for a day, and the dig is over', () => {
    const g = afterHit(7); const r = square(g, 'container_wall'); armedFamily(g);
    dig(g, r, { detectedDay: dayIndex(g.clock.t), by: 'watch' });
    digDay(g);
    const fightersBefore = ambushParty(g).length;
    expect(fightersBefore).toBeGreaterThan(0);
    const out = resolve(g, 'ambush');
    expect(['The ambush held', 'They broke out anyway']).toContain(out.title);
    expect(g.digs!.active).toBeNull();
    expect(g.digs!.ambushed).toBe(1);
    expect(g.digs!.party!.ids.length).toBe(fightersBefore);
    g.clock.t += 1;
    expect(ambushParty(g).length).toBe(0);      // away tomorrow: no one left to send
  });

  it('flooding or collapsing the tunnel ends the dig; ignoring it does not', () => {
    for (const stance of ['flood', 'collapse', 'ignore'] as const) {
      const g = afterHit(8); const r = square(g, 'container_wall'); done(g, 'ditch', [[-6, -6], [6, -6]]); g.stock.excavator = 1;
      dig(g, r, { detectedDay: dayIndex(g.clock.t), by: 'watch' });
      digDay(g);
      resolve(g, stance);
      expect(!!g.digs!.active).toBe(stance === 'ignore');
    }
  });
});

describe('tunnelers: sim integration', () => {
  it('is deterministic, saves with the game, and does nothing in a quiet world', () => {
    const g = afterHit(9); square(g, 'container_wall');
    const a = structuredClone(g), b = structuredClone(g);
    for (let i = 0; i < 40; i++) { a.clock.t += 1; digDay(a); b.clock.t += 1; digDay(b); }
    expect(JSON.stringify(a.digs)).toBe(JSON.stringify(b.digs));
    const q = newGame(1);
    digDay(q);
    expect(q.digs!.active).toBeNull();
  });

  it('shows in the Defense tab: the digging checklist and the skirt on offer', () => {
    const g = afterHit(10); square(g, 'log_palisade');
    const d = defenseReport(g);
    expect(d.digging.map(c => c.id)).toEqual(['skirt', 'sensors', 'moat', 'dogwatch', 'notice']);
    expect(d.digging.find(c => c.id === 'skirt')!.ok).toBe(false);
    expect(d.skirtable.length).toBe(1);
    const h = afterHit(10); square(h, 'steel_wall');
    expect(defenseReport(h).digging.find(c => c.id === 'skirt')!.ok).toBe(true);
  });

  it('an underground passage is a way in where a hatch comes up outside the wall; the escape tunnel never is', () => {
    expect(canEnter({ kind: 'underground_passage' }, 'outside')).toBe(true);
    expect(canEnter({ kind: 'underground_passage' }, 'inside')).toBe(true);
    expect(canEnter({ kind: 'escape_tunnel' }, 'outside')).toBe(false);
    expect(runBill('underground_passage', 6).passage_hatch).toBe(2);
    // a battle with one forced in is already breached
    const g = afterHit(11); square(g, 'container_wall'); armedFamily(g);
    const b = planBattle(g, 4, 3, { armed: true, organized: true, insideBreach: true });
    expect(b.events.find(e => e.kind === 'breach')!.t).toBeLessThanOrEqual(2);
    applyBattle(g, b);
  });

  it('collapsing the tunnel costs no humanity (only the excavator)', () => {
    const g = afterHit(12); const r = square(g, 'container_wall'); g.stock.excavator = 2;
    dig(g, r, { detectedDay: dayIndex(g.clock.t), by: 'watch' });
    digDay(g);
    const before = g.gate.humanity;
    resolve(g, 'collapse');
    expect(g.gate.humanity).toBe(before);
    expect(g.stock.excavator).toBe(1);
  });

  it('the player picks who goes to the dig site; the default is every armed adult but one', () => {
    const g = afterHit(13); const r = square(g, 'container_wall'); armedFamily(g);
    const all = ambushParty(g, true);
    expect(chosenParty(g)).toEqual(ambushParty(g));
    if (all.length >= 3) expect(chosenParty(g).length).toBe(all.length - 1);
    g.digs = { ...newDigs() };
    g.digs.partyPick = [all[0]];
    expect(chosenParty(g)).toEqual([all[0]]);
    dig(g, r, { detectedDay: dayIndex(g.clock.t), by: 'watch' });
    g.digs.partyPick = [all[0]];
    digDay(g);
    resolve(g, 'ambush');
    expect(g.digs!.party!.ids).toEqual([all[0]]);
  });

  it('passage hatches bolt themselves when a raid starts', () => {
    const g = afterHit(14);
    const p = done(g, 'underground_passage', [[0, -3], [0, -30]]);
    p.unlocked = true;
    boltPassages(g);
    expect(p.unlocked).toBe(false);
    p.unlocked = true;
    g.gate.next = 0; g.gate.day = -1; g.gate.pending = null;
    for (let i = 0; i < 80 && !g.gate.pending; i++) { g.clock.t += 1; gateDay(g); }
    const pend = g.gate.pending as { kind: string } | null;
    if (pend && !['arrival', 'trader', 'neighbor_help'].includes(pend.kind)) expect(p.unlocked).toBe(false);
  });
});
