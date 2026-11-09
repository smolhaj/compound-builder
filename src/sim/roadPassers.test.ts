/**
 * Warning on the road and passers-by (sim/roadWarn.ts, sim/roadPassers.ts): sight decides the warning, a prepared answer moves the
 * posture only while its card is up, the day's passes are deterministic and only after the hit, what shows from the road decides who
 * notices, trading at the line moves real goods, a block costs word and risk, rumors follow what passed, and nothing crashes on odd data.
 */
import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { postureOf, type Encounter } from './encounters';
import { WINDOW } from './roadTraffic';
import { passesOfDay, roadDay, passStep, noticeChance, roadGiveAway, hailable, hailPass, answerHail, buildBlock, removeBlock, setBlockPolicy, blockProblem, passerRumor, simHandles, trafficCtx, freshRoad, roadOf, markKind, type Pass } from './roadPassers';
import { sightParts, sightUnits, warnFrom, warnMinutes, roadWarnStep, prepare, prepProblem, prepPosture, setRoadSightProbe, roadSightK } from './roadWarn';
import { leadMinutes } from './roadLead';
import { radioDay } from './radio';
import { barterOf } from './barter';
import { step } from './engine';

const world = (seed = 3): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'standard' });
  g.clock.t = g.disaster.hitAt + 30 + 0.5;
  g.disaster.phase = 'survival';
  return g;
};
const visitor = (kind: Encounter['kind'] = 'arrival'): Encounter =>
  ({ id: 'e77', kind, day: 4, title: 'Strangers', dossier: ['4 on foot.'], size: 4, armed: false, strength: 0, stances: ['take_in', 'turn_away'] }) as Encounter;
const hold = (g: GameState, e = visitor(), lead = 120): void => { g.gate.pending = null; g.gate.incoming = { e, at: g.clock.t + lead / 1440, from: g.clock.t }; };
const passOf = (cls: 'raiders' | 'wanderers' | 'traffic' | 'convoy', heads = 3, at = 0): Pass => ({ id: `t${cls}${heads}`, at, party: { id: `t${cls}${heads}`, cls, dir: 1, speed: 1, members: [{ kind: cls === 'wanderers' ? 'walker' : cls === 'raiders' ? 'raider' : cls === 'convoy' ? 'military' : 'pickup', gap: 0, lat: 0, tint: 0.5, riders: 0, loaded: false }], lights: true, heads } });

describe('sight and warning', () => {
  it('nothing watching gives no warning; a tower, cameras or a watch give some; more sight, more warning', () => {
    const g = world();
    expect(warnFrom(120, 0)).toBe(0);
    expect(warnFrom(120, 8)).toBe(0);
    expect(warnFrom(120, WINDOW)).toBe(120);
    expect(warnFrom(120, 60)).toBe(60);
    expect(warnFrom(60, 1000)).toBe(60);
    expect(warnFrom(120, 30)).toBeLessThan(warnFrom(120, 90));
    const base = sightUnits(g);
    g.stock.cameras = 2; g.stock.thermal_cam = 1; g.utilities.lit = ['x'];
    expect(sightUnits(g)).toBeGreaterThan(base);
    expect(sightParts(g).some(p => p.id === 'cameras')).toBe(true);
    expect(sightUnits(g)).toBeLessThanOrEqual(WINDOW);
  });
  it('the world\'s sightline measure scales it and a bad probe is ignored', () => {
    const g = world(); g.stock.cameras = 2; g.utilities.lit = ['x'];
    const k1 = sightUnits(g);
    setRoadSightProbe(() => 0.6); const lo = sightUnits(g);
    setRoadSightProbe(() => 1.4); const hi = sightUnits(g);
    setRoadSightProbe(() => NaN); expect(roadSightK()).toBe(1);
    setRoadSightProbe(null);
    expect(lo).toBeLessThan(k1); expect(hi).toBeGreaterThan(k1);
  });
  it('a held visitor is noticed once sight allows, logged once, and with no watchers the card is the first the family knows', () => {
    const g = world(); g.stock.cameras = 3; g.stock.thermal_cam = 1; g.utilities.lit = ['x'];
    hold(g, visitor(), 180);
    const inc = g.gate.incoming!;
    expect(warnMinutes(g)).toBeGreaterThanOrEqual(15);
    const w = warnMinutes(g);
    expect(roadWarnStep(g)).toBeNull();
    g.clock.t = inc.at - w / 1440;
    const n = g.log.length;
    expect(roadWarnStep(g)).toMatch(/county road/);
    expect(g.gate.incoming!.seen).toBeDefined();
    expect(roadWarnStep(g)).toBeNull();
    expect(g.log.length).toBe(n + 1);
    const q = world(); hold(q);
    q.clock.t = q.gate.incoming!.at - 0.01;
    expect(roadWarnStep(q)).toBeNull();
  });
  it('raids keep their own clock (no from, no warning step)', () => {
    const g = world(); g.gate.incoming = { e: visitor('looters'), at: g.clock.t + 0.1 };
    expect(warnMinutes(g)).toBe(0);
    expect(roadWarnStep(g)).toBeNull();
    expect(leadMinutes(visitor(), g.seed)).toBeGreaterThan(0);
  });
});

describe('preparing', () => {
  it('needs a sighting; a greeter raises detection and the gate raises the line, only while that card is up, then clears', () => {
    const g = world(); g.stock.cameras = 3; g.stock.thermal_cam = 1; g.utilities.lit = ['x'];
    hold(g);
    expect(prepProblem(g, 'greeter')).toMatch(/seen/);
    g.gate.incoming!.seen = g.clock.t;
    const p0 = postureOf(g);
    expect(prepare(g, 'greeter')).toBeNull();
    expect(prepProblem(g, 'gate')).toMatch(/already/);
    expect(prepPosture(g).detection).toBe(0);
    const e = g.gate.incoming!.e; g.gate.incoming = null; g.gate.pending = e;
    expect(postureOf(g).detection).toBeGreaterThan(p0.detection);
    g.gate.pending = null; roadWarnStep(g);
    expect(g.road!.prep).toBeUndefined();
    const h = world(); hold(h); h.gate.incoming!.seen = h.clock.t;
    const f0 = postureOf(h).fighters;
    expect(prepare(h, 'gate')).toBeNull();
    const e2 = h.gate.incoming!.e; h.gate.incoming = null; h.gate.pending = e2;
    expect(postureOf(h).fighters).toBeGreaterThan(f0);
  });
  it('is never a way to make a defense weaker (monotone)', () => {
    for (const seed of [1, 2, 3]) for (const kind of ['greeter', 'gate'] as const) {
      const g = world(seed); hold(g); g.gate.incoming!.seen = g.clock.t;
      const a = postureOf(g);
      prepare(g, kind);
      const e = g.gate.incoming!.e; g.gate.incoming = null; g.gate.pending = e;
      const b = postureOf(g);
      expect(b.detection).toBeGreaterThanOrEqual(a.detection); expect(b.barrier).toBeGreaterThanOrEqual(a.barrier); expect(b.fighters).toBeGreaterThanOrEqual(a.fighters);
    }
  });
});

describe('the day\'s passes', () => {
  it('are deterministic, only real classes, and none before the hit', () => {
    const g = world(5); const day = dayIndex(g.clock.t);
    const a = passesOfDay(g, day), b = passesOfDay(g, day);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const p of a) { expect(['traffic', 'wanderers', 'refugees', 'raiders', 'convoy']).toContain(p.party.cls); expect(p.at).toBeGreaterThanOrEqual(day - 0.25); expect(p.at).toBeLessThan(day + 0.75); }
    const peace = newGame(5, 105, 2027, { mode: 'scenario', peace: 'long', kind: 'grid_down' });
    roadDay(peace); expect(peace.road!.passes.length).toBe(0);
    expect(simHandles(trafficCtx(peace, 12))).toBe(false);
    expect(simHandles(trafficCtx(g, 12))).toBe(true);
  });
  it('a run of days yields a sensible number of real passers-by', () => {
    const g = world(9); let total = 0;
    const d0 = dayIndex(g.clock.t);
    for (let d = d0; d < d0 + 60; d++) total += passesOfDay(g, d).length;
    expect(total).toBeGreaterThan(3);
    expect(total / 60).toBeLessThan(8);
  });
  it('roadDay schedules once a day and prunes', () => {
    const g = world(9); roadDay(g); const n = g.road!.passes.length; roadDay(g);
    expect(g.road!.passes.length).toBe(n);
    g.clock.t += 3; roadDay(g);
    expect(g.road!.passes.every(p => p.at > g.clock.t - 1.2)).toBe(true);
  });
});

describe('noticing the place', () => {
  it('lights, smoke and noise raise the chance; convoys barely look; capped', () => {
    const g = world(); g.utilities.lit = [];
    const quiet = noticeChance(g, 'wanderers');
    g.stock.smoker = 1; g.disaster.tracks.stores = 0.1;
    const loud = noticeChance(g, 'wanderers');
    expect(loud).toBeGreaterThanOrEqual(quiet);
    expect(noticeChance(g, 'convoy')).toBeLessThan(noticeChance(g, 'wanderers') + 1e-9);
    expect(roadGiveAway(g).points).toBeGreaterThanOrEqual(0);
    expect(noticeChance(g, 'raiders')).toBeLessThanOrEqual(0.75);
  });
  it('a roving crew that notices marks the place and the next roll comes sooner; people on foot turn up the drive as a real card', () => {
    let marked = 0, cards = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const g = world(seed); g.stock.smoker = 1; g.disaster.tracks.stores = 0.1; g.gate.next = dayIndex(g.clock.t) + 30;
      roadOf(g).passes = [passOf('raiders', 5, g.clock.t - 0.001)];
      passStep(g);
      if (g.road!.mark) { marked++; expect(g.gate.next).toBeLessThan(dayIndex(g.clock.t) + 6); expect(markKind(g, dayIndex(g.clock.t))).not.toBeNull(); }
      const h = world(seed); h.stock.smoker = 1; h.disaster.tracks.stores = 0.1;
      roadOf(h).passes = [passOf('wanderers', 3, h.clock.t - 0.001)];
      passStep(h);
      if (h.gate.pending) { cards++; expect(['arrival', 'refugees']).toContain(h.gate.pending.kind); }
    }
    expect(marked).toBeGreaterThan(0);
    expect(cards).toBeGreaterThan(0);
  });
  it('a convoy that nobody sees leaves no mark and no card', () => {
    const g = world(); g.utilities.lit = [];
    roadOf(g).passes = [passOf('convoy', 8, g.clock.t - 0.001)];
    passStep(g);
    expect(g.road!.mark).toBeNull();
    expect(g.gate.pending).toBeNull();
  });
});

describe('trading at the line', () => {
  function withHail(seed = 1): GameState {
    for (let s = seed; s < seed + 120; s++) {
      const g = world(s); g.stock.canned = 40; g.stock.staples = 40; g.stock.fresh = 40; g.stock.fuel = 20; g.stock.meds = 10; g.stock.hygiene = 10; g.stock.firewood = 40;
      const p = passOf('traffic', 1, g.clock.t - 0.01); p.done = true; p.seen = true; p.fate = 'went_on';
      roadOf(g).passes = [p];
      if (hailable(g).length && hailPass(g, p.id) === null && g.road!.hail) return g;
    }
    throw new Error('no hail');
  }
  it('a seen passer can be waved down; the swap moves the goods and raises word', () => {
    const g = withHail();
    const h = g.road!.hail!;
    const before = { ...g.stock };
    expect(answerHail(g, 'accept')).toBeNull();
    expect(g.road!.hail).toBeNull();
    expect(barterOf(g).trades).toBe(1);
    expect(g.road!.word).toBeGreaterThan(0);
    for (const l of h.offer) if (!String(l.good).includes(':')) expect(g.stock[l.good as 'fuel']).toBe(before[l.good as 'fuel'] + l.qty - (h.want.find(w => w.good === l.good)?.qty ?? 0));
  });
  it('declining, haggling once and not enough goods all behave', () => {
    const g = withHail(); expect(answerHail(g, 'haggle')).toBeNull();
    if (g.road!.hail) expect(answerHail(g, 'haggle')).toMatch(/already/);
    const d = withHail(); expect(answerHail(d, 'decline')).toBeNull(); expect(d.road!.hail).toBeNull(); expect(answerHail(d, 'accept')).toMatch(/nobody/);
    const p = withHail(); for (const k of Object.keys(p.stock)) (p.stock as Record<string, number>)[k] = 0;
    expect(answerHail(p, 'accept')).toMatch(/do not have/);
    expect(p.road!.hail).not.toBeNull();
  });
  it('a hail expires; a gone-by pass cannot be hailed', () => {
    const g = withHail(); g.clock.t += 1; passStep(g); expect(g.road!.hail).toBeNull();
    const h = world(); roadOf(h).passes = [{ ...passOf('traffic', 1, h.clock.t - 0.2), done: true, seen: true, fate: 'went_on' }];
    expect(hailable(h)).toEqual([]);
    expect(hailPass(h, 'nope')).toMatch(/gone/);
  });
});

describe('roadblocks and checkpoints', () => {
  it('cost lumber and hardware, need people, and can be taken down', () => {
    const g = world(); g.stock.lumber = 0;
    expect(blockProblem(g, 'barrier')).toMatch(/lumber/);
    g.stock.lumber = 20; g.stock.hardware = 0;
    expect(blockProblem(g, 'checkpoint')).toMatch(/hardware/);
    expect(buildBlock(g, 'barrier')).toBeNull();
    expect(g.stock.lumber).toBe(17);
    expect(buildBlock(g, 'barrier')).toMatch(/already/);
    expect(setBlockPolicy(g, 'inspect')).toMatch(/cannot/);
    expect(removeBlock(g)).toBeNull(); expect(removeBlock(g)).toMatch(/no block/);
  });
  it('turning back people on foot costs word, humanity and the good-neighbor record; an armed crew turned back raises respect and brings risk', () => {
    const g = world(); g.stock.lumber = 20; buildBlock(g, 'barrier');
    const t0 = g.gate.turnedAway, hum = g.gate.humanity;
    roadOf(g).passes = [passOf('wanderers', 4, g.clock.t - 0.001)];
    passStep(g);
    expect(g.road!.word).toBeLessThan(0); expect(g.gate.turnedAway).toBe(t0 + 1); expect(g.gate.humanity).toBeLessThan(hum);
    let hurt = 0, angry = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const h = world(seed); h.stock.lumber = 20; buildBlock(h, 'barrier');
      roadOf(h).passes = [passOf('raiders', 6, h.clock.t - 0.001)];
      passStep(h);
      expect(h.gate.respect ?? 0).toBeGreaterThan(0);
      if (h.personState.some(p => p.needs.hurt.length)) hurt++;
      if (h.road!.mark) angry++;
    }
    expect(hurt).toBeGreaterThan(0); expect(hurt).toBeLessThan(80);
    expect(angry).toBeGreaterThan(0);
  });
  it('a checkpoint that inspects lets people on foot through and sends some drivers to a trading stop', () => {
    let stops = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = world(seed); g.stock.lumber = 20; g.stock.hardware = 5; buildBlock(g, 'checkpoint');
      roadOf(g).passes = [passOf('wanderers', 3, g.clock.t - 0.002), passOf('traffic', 1, g.clock.t - 0.001)];
      const turned0 = g.gate.turnedAway;
      passStep(g);
      expect(g.gate.turnedAway).toBe(turned0);
      if (g.road!.hail?.by === 'block') stops++;
    }
    expect(stops).toBeGreaterThan(0);
  });
});

describe('rumors from the road', () => {
  it('follow what passed: true on good reception, false on poor; none with nothing passing', () => {
    const g = world(); expect(passerRumor(g, 'x:', 1)).toBeNull();
    const r = roadOf(g);
    const got = new Set<string>();
    for (let d = 0; d < 80; d++) { g.clock.t += 1; r.recent = [{ day: dayIndex(g.clock.t), cls: 'raiders', heads: 4, seen: true, id: 'a' }]; const t = passerRumor(g, 'x:', 0.9); if (t) got.add(`${t.truth}`); }
    expect(got.has('true')).toBe(true);
    const f = world(); const rf = roadOf(f);
    let falses = 0;
    for (let d = 0; d < 120; d++) { f.clock.t += 1; rf.recent = [{ day: dayIndex(f.clock.t), cls: 'convoy', heads: 8, seen: true, id: 'a' }]; const t = passerRumor(f, 'x:', 0.1); if (t && !t.truth) falses++; }
    expect(falses).toBeGreaterThan(0);
  });
  it('radioDay uses them and keeps the heard list consistent', () => {
    let used = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const g = world(seed); g.stock.sw_radio = 1; roadOf(g).block = { kind: 'barrier', policy: 'turn_back', since: 0, turned: 0, passed: 0 };
      for (let d = 0; d < 20; d++) { g.clock.t += 1; roadOf(g).recent.push({ day: dayIndex(g.clock.t), cls: 'wanderers', heads: 4, seen: true, id: `r${d}` }); radioDay(g); }
      used += (g.radio?.heard ?? []).filter(h => h.kind === 'travelers' || (h.kind === 'checkpoint' && /barrier|checkpoint/.test(h.text))).length;
      for (const h of g.radio?.heard ?? []) expect(typeof h.truth).toBe('boolean');
    }
    expect(used).toBeGreaterThan(0);
  });
});

describe('odd data', () => {
  it('a state with no road, no people, or junk never throws', () => {
    const g = world();
    expect(() => { passStep(g); roadWarnStep(g); hailable(g); prepPosture(g); }).not.toThrow();
    g.road = freshRoad();
    for (const p of g.personState) p.needs.died = 1;
    roadOf(g).passes = [passOf('raiders', 0, g.clock.t - 1), passOf('wanderers', 1000, g.clock.t - 1)];
    expect(() => { passStep(g); roadDay(g); }).not.toThrow();
    g.road = undefined; g.gate.incoming = { e: visitor(), at: 0, from: undefined };
    expect(() => { roadWarnStep(g); warnMinutes(g); }).not.toThrow();
    expect(buildBlock(g, 'barrier')).toBeTruthy();
  });
  it('a long run through the real engine never crashes and the road tallies add up', () => {
    let g = world(11); g.money = 50000;
    for (let i = 0; i < 40; i++) { g = step(g, 1); g.gate.pending = null; if (g.road?.hail) g.road.hail = null; if (g.ending) break; }
    const r = g.road;
    expect(r).toBeDefined();
    expect(r!.tally.passed).toBeGreaterThanOrEqual(r!.tally.noticed);
    expect(r!.tally.seen).toBeLessThanOrEqual(r!.tally.passed);
  });
});
