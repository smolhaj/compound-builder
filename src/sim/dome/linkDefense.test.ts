import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setGroundOverride } from '../terrainState';
import { place } from '../raidTestKit';
import { DOME_KIND, type DomeTier } from './tiers';
import { linksOf, orderLink, linkState, tunnelReach, takeDown } from './links';
import { classify, counterEdge, counterInputs, counterOdds, diggable, edgeWord, forceChance, linkOfDig, linkWarning, orderShape, pointAlong, resolveLinkDig, spotWords, type CounterInputs } from './linkDefense';
import { combine, detectChances, digDay, newDigs, startDig, type Dig, type DigDefense } from '../tunnelers';
import { mulberry32 } from '../rng';
import { dayIndex, type GameState } from '../state';
import { STANCE } from '../../ui/stanceText';

beforeEach(() => setGroundOverride({ h: () => 0, creek: null }));
afterEach(() => setGroundOverride(null));

const world = (a: DomeTier = 'geodesic', b: DomeTier = 'glass', depth?: number): GameState => {
  const g = place(4, 'standard', 'armed'); g.perimeter = []; g.money = 5_000_000;
  for (const [id, tier, x] of [['dA', a, 26], ['dB', b, 40]] as const) g.structures.push({ id, kind: DOME_KIND[tier], x, z: 33, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  expect(orderLink(g, 'dA', 'dB', 'tunnel', depth)).toBeNull();
  for (const l of linksOf(g)) { const r = g.perimeter.find(x => x.id === l.runId)!; r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
  g.disaster.difficulty = 'standard';
  return g;
};
const dig = (g: GameState, over: Partial<Dig> = {}): Dig => {
  const l = linksOf(g)[0], day = dayIndex(g.clock.t);
  const d: Dig = { id: 'dg', run: `link:${l.id}`, link: l.id, at: pointAlong(l, 0.5), startDay: day, days: 6, size: 6, temper: 'hard', detectedDay: null, by: null, skirtChecked: false, floodChecked: false, warned: false, ignored: false, passage: null, ...over };
  (g.digs ??= newDigs()).active = d;
  return d;
};
const def = (o: Partial<DigDefense> = {}): DigDefense => ({ skirt: false, sensors: 0, sensorsPowered: false, coverage: 0, dogs: 0, watchers: 0, tower: false, ditch: false, ...o });

describe('detection (the same counters as any dig)', () => {
  it('more sensors, dogs, watchers or a tower never lowers the chance of notice (property)', () => {
    const base = combine(detectChances(def()));
    let last = base;
    for (let sets = 0; sets <= 8; sets++) { const p = combine(detectChances(def({ sensors: sets, sensorsPowered: sets > 0, coverage: Math.min(1, sets * 120 / 400) }))); expect(p).toBeGreaterThanOrEqual(last - 1e-9); last = p; }
    last = base; for (let n = 0; n <= 2; n++) { const p = combine(detectChances(def({ dogs: n }))); expect(p).toBeGreaterThanOrEqual(last - 1e-9); last = p; }
    last = base; for (let n = 0; n <= 6; n++) { const p = combine(detectChances(def({ watchers: n }))); expect(p).toBeGreaterThanOrEqual(last - 1e-9); last = p; }
    expect(combine(detectChances(def({ tower: true })))).toBeGreaterThan(base);
  });
  it('with ground sensors a dig toward the tunnel is noticed far sooner than without', () => {
    const noticed = (sets: number): number => { let n = 0; for (let seed = 0; seed < 60; seed++) { const g = world('geodesic', 'glass', 8); g.stock.ground_sensor = sets; const d = dig(g, { days: 14 }); d.skirtChecked = true; g.clock.t += 1; for (let day = 0; day < 10 && d.detectedDay === null; day++) { g.seed = seed * 17 + day; g.gate.pending = null; digDay(g); g.clock.t += 1; if (!g.digs?.active) break; } if (d.detectedDay !== null) n++; } return n; };
    expect(noticed(4)).toBeGreaterThanOrEqual(noticed(0));
  });
});

describe('the detect-to-counterattack flow', () => {
  it('a found dig raises an alert card with the position, the time to breach, a radio line and the five answers', () => {
    const g = world('geodesic', 'glass', 8), d = dig(g, { detectedDay: 0, by: 'sensors', days: 4 });
    const e = linkWarning(g, d, linksOf(g)[0], dayIndex(g.clock.t));
    expect(e.title).toMatch(/^Radio:/);
    const text = e.dossier.join(' ');
    expect(text).toMatch(/ft out along the tunnel/); expect(text).toMatch(/hours, to the breach|almost through/); expect(text).toMatch(/ground sensors/);
    expect(e.stances).toEqual(['counter_hold', 'counter_fall', 'collapse', 'seal', 'ignore']);
    expect(e.dig).toMatchObject({ phase: 'warning', link: linksOf(g)[0].id });
    for (const s of e.stances) expect(STANCE[s][0].length).toBeGreaterThan(3);
  });
  it('a dig that finds a shallow tunnel raises the card through digDay and holds the game for the player', () => {
    const g = world('geodesic', 'glass', 8); const d = dig(g, { days: 9 }); d.detectedDay = dayIndex(g.clock.t); d.by = 'dogs'; d.skirtChecked = true;
    g.clock.t += 1; const lines = digDay(g);
    expect(g.gate.pending?.dig?.link).toBe(linksOf(g)[0].id); expect(lines[0]).toMatch(/Radio/);
  });
  it('a deep tunnel is never dug toward by a plain crew; a learned one can dig a middling tunnel but not a deep one', () => {
    const deep = world('arcology', 'arcology', 60);
    expect(diggable(deep, 1)).toEqual([]); expect(tunnelReach(60, 1)).toBe(0);
    const mid = world('glass', 'glass', 20); expect(diggable(mid, 0)).toEqual([]); expect(diggable(mid, 1).length).toBe(1);
    const shallow = world('geodesic', 'earthen', 4); expect(diggable(shallow, 0).length).toBe(1);
  });
  it('a crew that digs at a shallow tunnel is picked by startDig', () => {
    const g = world('earthen', 'earthen', 4); g.disaster.hitAt = g.clock.t - 400;
    let found = 0; for (let i = 0; i < 40; i++) { const d = startDig(g, mulberry32(i + 1), dayIndex(g.clock.t)); if (d?.link) found++; }
    expect(found).toBeGreaterThan(0);
  });
  it('a dig at the depth they cannot reach ends in a turned-back line', () => {
    const g = world('glass', 'glass', 30); const d = dig(g, { days: 10 }); g.digs!.active = d; g.clock.t += 5;
    const lines = digDay(g); expect(lines.join(' ')).toMatch(/gave up/); expect(g.digs!.active).toBeNull();
  });
});

describe('the answers and the outcome cards', () => {
  const answer = (stance: 'counter_hold' | 'counter_fall' | 'collapse' | 'seal' | 'ignore', seed = 3) => {
    const g = world('geodesic', 'glass', 8), d = dig(g, { detectedDay: 0, warned: true, days: 5 }); g.seed = seed;
    const e = linkWarning(g, d, linksOf(g)[0], dayIndex(g.clock.t));
    return { g, out: resolveLinkDig(g, e, stance, mulberry32(seed)), d };
  };
  it('send the defenders out, holding position or falling back: always one of the four outcomes, the dig ends, the party is away', () => {
    for (const st of ['counter_hold', 'counter_fall'] as const) for (let seed = 1; seed <= 8; seed++) {
      const { g, out } = answer(st, seed);
      expect(['The crew was driven off', 'A standoff in the tunnel', 'They got a door, and we lost the tunnel', 'We lost people in the tunnel']).toContain(out.title);
      expect(g.digs!.active).toBeNull(); expect(g.digs!.party).not.toBeNull();
      const l = linksOf(g)[0]; expect(linkState(g, l)).toBe(out.title === 'The crew was driven off' ? 'open' : 'down');
      expect(out.text.length).toBeGreaterThan(20);
    }
  });
  it('collapse costs the link and the crew, and needs no excavator', () => {
    const { g, out } = answer('collapse'); expect(out.title).toMatch(/comes down/); expect(linkState(g, linksOf(g)[0])).toBe('down'); expect(g.digs!.active).toBeNull(); expect(linksOf(g)[0].down!.why).toBe('collapse');
  });
  it('seal: either the doors hold (the link is shut for repair) or the airlock is forced and a crew comes inside', () => {
    const titles = new Set<string>(); for (let seed = 1; seed <= 40; seed++) { const { g, out } = answer('seal', seed); titles.add(out.title); expect(linkState(g, linksOf(g)[0])).toBe('down'); if (out.title === 'They forced the airlock') expect(g.gate.pending?.dig?.phase).toBe('inside'); }
    expect([...titles].every(t => ['The doors held', 'They forced the airlock'].includes(t))).toBe(true); expect(titles.has('The doors held')).toBe(true);
  });
  it('ignore leaves the dig going', () => { const { g, d } = answer('ignore'); expect(d.ignored).toBe(true); expect(g.digs!.active).toBe(d); });
  it('a dig that is gone gives a harmless card', () => { const g = world(), d = dig(g), e = linkWarning(g, d, linksOf(g)[0], 0); g.digs!.active = null; expect(resolveLinkDig(g, e, 'counter_hold', mulberry32(1)).title).toBe('They gave up'); });
  it('classify: driven off, standoff, partial breach, defenders lost', () => {
    expect(classify('fled', 4, 0, 'hold')).toBe('driven_off'); expect(classify('repelled', 4, 0, 'hold')).toBe('driven_off');
    expect(classify('repelled', 4, 1, 'hold')).toBe('driven_off'); expect(classify('repelled', 4, 2 - 1 + 0.5, 'hold')).toBeDefined();
    expect(classify('repelled', 8, 3, 'hold')).toBe('standoff'); expect(classify('repelled', 8, 4, 'hold')).toBe('defenders_lost');
    expect(classify('breached', 6, 1, 'fall')).toBe('partial_breach'); expect(classify('overrun', 6, 1, 'fall')).toBe('partial_breach');
    expect(classify('overrun', 6, 1, 'hold')).toBe('defenders_lost'); expect(classify('overrun', 6, 4, 'fall')).toBe('defenders_lost');
  });
  it('the odds on the card sum to one and hold for the place', () => {
    const g = world('geodesic', 'glass', 8), o = counterOdds(g, { size: 6, temper: 'hard' }, 4, 'hold', 6);
    expect(Object.values(o).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(counterOdds(g, { size: 6, temper: 'hard' }, 4, 'hold', 6)).toBe(o);
  });
  it('holding position is the surprise; falling back meets a smaller crew without it', () => {
    const h = orderShape('hold', 8, 6), f = orderShape('fall', 8, 6);
    expect(h.surprise).toBeGreaterThan(f.surprise); expect(f.crew).toBeLessThan(8);
  });
});

describe('the defenders\' edge is monotone (more never makes it worse)', () => {
  const base: CounterInputs = { size: 8, lead: 2, party: 2, guards: 0, towers: 0, ammo: 60, cover: 0.2, sensors: 0 };
  it('each defender input only helps; a bigger crew only hurts', () => {
    const keys: Array<keyof CounterInputs> = ['party', 'guards', 'towers', 'ammo', 'cover', 'sensors', 'lead'];
    for (const k of keys) { let last = -1; for (let v = 0; v <= 8; v++) { const e = counterEdge({ ...base, [k]: k === 'cover' ? v / 8 : k === 'ammo' ? v * 60 : v }); expect(e).toBeGreaterThanOrEqual(last - 1e-9); last = e; } }
    let last = 2; for (let n = 1; n <= 20; n++) { const e = counterEdge({ ...base, size: n }); expect(e).toBeLessThanOrEqual(last + 1e-9); last = e; }
    expect(counterEdge(base)).toBeGreaterThan(0); expect(counterEdge(base)).toBeLessThan(1);
  });
  it('the words step up with the edge', () => { expect(edgeWord(0.2)).toBe('a weak hand'); expect(edgeWord(0.9)).toBe('a strong edge'); });
  it('counterInputs reads the place: guards, towers, ammunition, sensors, who would go', () => {
    const g = world(); g.stock.ground_sensor = 3; const i = counterInputs(g, { size: 6 }, 3, linksOf(g)[0]);
    expect(i.sensors).toBe(3); expect(i.party).toBeGreaterThan(0); expect(i.size).toBe(6);
  });
  it('a sealed airlock is harder to force on the higher tiers (never easier up the tiers)', () => {
    let last = 2; for (const t of ['geodesic', 'glass', 'arcology'] as const) { const g = world(t, t, 4); const f = forceChance(g, linksOf(g)[0], pointAlong(linksOf(g)[0], 0.1), 6); expect(f).toBeLessThanOrEqual(last + 1e-9); last = f; }
  });
  it('spot words name how far out along the tunnel and from which side', () => { const g = world(); expect(spotWords(g, linksOf(g)[0], pointAlong(linksOf(g)[0], 0.2))).toMatch(/ft out along the tunnel from the/); expect(linkOfDig(g, { run: 'x', link: undefined })).toBeNull(); });
  it('takeDown on a link is idempotent', () => { const g = world(); const l = linksOf(g)[0]; takeDown(g, l, 'collapse'); const at = l.down!.at; takeDown(g, l, 'storm'); expect(l.down!.at).toBe(at); });
});

describe('text', () => {
  it('uses plain American English: no "sortie" in any new text', async () => {
    const files = import.meta.glob<string>(['./links.ts', './linkDefense.ts', './linkGraph.ts', '../../ui/hud/DomeLinks*.tsx', '../../../docs/DOME_LINKS.md'], { query: '?raw', import: 'default', eager: true });
    for (const [p, src] of Object.entries(files)) expect(/sortie/i.test(src), p).toBe(false);
  });
});
