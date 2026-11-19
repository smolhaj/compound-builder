import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { blockedReason, blueprintOf, canGoOn, orderHold } from '../construction';
import { TIER, type DomeTier } from './tiers';
import { shellFt } from './tiers';
import { digStops } from './crossing';
import { bunkerRows, bunkerShellPct, bunkerSite, domeRefuge, skirtDepthFt, stampUnderDome, under } from './bunkerLive';
import { bpHours, floorFt, shellR } from './bunker';
import { domeAt } from './bunker';

const KIND: Record<DomeTier, string> = { earthen: 'dome_earthen_4', geodesic: 'dome_geodesic', glass: 'dome_glass', arcology: 'dome_arcology' };
const S = (id: string, kind: string, x: number, z: number, stage = 0, extra: Partial<Structure> = {}): Structure => ({ id, kind, x, z, rot: 0, stage, done: 0, supplied: true, finishedAt: null, ...extra });
const game = (tier: DomeTier, stage = 0): GameState => { const g = newGame(7); g.structures = [S('dm', KIND[tier], 0, 0, stage, stage >= 5 ? { finishedAt: 0 } : {})]; return g; };
const FL = floorFt(1, 1 - 0.8);
const rect = (x: number, z: number) => ({ x0: x - 0.25, z0: z - 0.25, x1: x + 0.25, z1: z + 0.25 });

describe('what the placing card says', () => {
  it('shows skirt depth against bunker depth for every built tier; earthen needs a footing', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) {
      const s = bunkerSite(game(t), 'bunker_hatch', rect(0, 0), FL)!;
      expect(s.cover.state).toBe('covered');
      expect(s.line).toMatch(/Protected by the skirt/);
      expect(s.line).toContain(`${TIER[t].skirtFt}`);
      expect(s.line).toContain(`${Math.round(FL)} ft down`);
    }
    // a skirt taken deeper: a floor 25 ft down under the geodesic dome needs 28 ft of skirt
    const e = bunkerSite(game('geodesic'), 'bunker_hatch', rect(0, 0), 25)!;
    expect(e.cover.state).toBe('footing');
    expect(e.footYd).toBeGreaterThan(0);
    expect(e.line).toMatch(/deep footing/);
    expect(bunkerSite(game('earthen'), 'bunker_hatch', rect(0, 0), FL)).toBeNull();
  });
  it('a piece outside the ring is not under the dome', () => {
    const g = game('geodesic');
    expect(bunkerSite(g, 'bunker_hatch', rect(shellR(domeAt('dome_geodesic', 0, 0)!) + 2, 0), FL)).toBeNull();
  });
  it('with the dome only while the crater is open; never once it is backfilled or finished', () => {
    expect(bunkerSite(game('geodesic', 0), 'bunker_dorm', rect(0, 0), FL)!.canWith).toBe(true);
    expect(bunkerSite(game('geodesic', 1), 'bunker_dorm', rect(0, 0), FL)!.canWith).toBe(true);
    expect(bunkerSite(game('geodesic', 2), 'bunker_dorm', rect(0, 0), FL)!.canWith).toBe(false);
    expect(bunkerSite(game('geodesic', 99), 'bunker_dorm', rect(0, 0), FL)!.canWith).toBe(false);
  });
  it('the crew has a cap: once the combined hours fill the crater work, the next piece goes in after', () => {
    const g = game('geodesic', 0);
    let n = 0;
    for (; n < 80; n++) {
      const site = bunkerSite(g, 'bunker_dorm', rect(0, 0), FL)!;
      if (!site.canWith) break;
      const st = S(`b${n}`, 'bunker_dorm', 0.2 * ((n % 5) - 2), 0.2 * (Math.floor(n / 5) % 5 - 2)); g.structures.push(st); stampUnderDome(g, st, site, true);
    }
    expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(80);
    const next = bunkerSite(g, 'bunker_dorm', rect(0, 0), FL)!;
    expect(next.canWith).toBe(false); expect(next.room).toBeLessThan(next.withHours);
  });
});

describe('a staked piece and its bill', () => {
  it('built with the dome is cheaper in hours than after it, and a deep floor pays its footing', () => {
    const g = game('geodesic', 1), a = S('b1', 'bunker_dorm', 0, 0), b = S('b2', 'bunker_dorm', 0.5, 0.5);
    g.structures.push(a, b);
    stampUnderDome(g, a, { dome: 'dm', floorFt: FL }, true);
    stampUnderDome(g, b, { dome: 'dm', floorFt: FL }, false);
    expect(a.underDome!.with).toBe(true); expect(b.underDome!.with).toBe(false);
    expect(bpHours(blueprintOf(a))).toBeLessThan(bpHours(BLUEPRINTS.bunker_dorm));
    expect(bpHours(blueprintOf(b))).toBeGreaterThan(bpHours(BLUEPRINTS.bunker_dorm));
    const ge = game('geodesic', 0), c = S('c', 'bunker_hatch', 0, 0); ge.structures.push(c);
    stampUnderDome(ge, c, { dome: 'dm', floorFt: 25 }, true);
    expect(c.underDome!.footYd).toBeGreaterThan(0);
    expect(blueprintOf(c).stages[1].materials.concrete!).toBeGreaterThan(BLUEPRINTS.bunker_hatch.stages[1].materials.concrete!);
  });
  it('the footing is paid once: a second piece under the same dome owes only what is left', () => {
    const g = game('geodesic', 0), a = S('a', 'bunker_hatch', 0, 0), b = S('b', 'bunker_hatch', 0.3, 0.3); g.structures.push(a, b);
    stampUnderDome(g, a, { dome: 'dm', floorFt: 25 }, true); stampUnderDome(g, b, { dome: 'dm', floorFt: 25 }, true);
    expect(a.underDome!.footFt).toBeGreaterThan(0); expect(b.underDome!.footFt).toBe(0);
  });
});

describe('the skirt really goes deeper once the footing is poured', () => {
  it('only finished pieces count, and a deeper skirt never turns fewer digs', () => {
    const g = game('geodesic', 99), a = S('a', 'bunker_hatch', 0, 0, 0); g.structures.push(a);
    stampUnderDome(g, a, { dome: 'dm', floorFt: 25 }, false);
    expect(skirtDepthFt(g, g.structures[0])).toBe(TIER.geodesic.skirtFt);
    a.stage = 99; a.finishedAt = 1;
    const d = skirtDepthFt(g, g.structures[0]);
    expect(d).toBeGreaterThanOrEqual(25 + 3);
    expect(digStops(d, 1)).toBeGreaterThanOrEqual(digStops(TIER.geodesic.skirtFt, 1));
  });
});

describe('order: the crater, the walls and the backfill', () => {
  it('a piece waits for the crater, and the dome waits for the walls and roof', () => {
    const g = game('geodesic', 0), a = S('a', 'bunker_dorm', 0, 0, 1); a.done = 0; g.structures.push(a);
    stampUnderDome(g, a, { dome: 'dm', floorFt: FL }, true);
    g.structures[0].done = 0;
    expect(orderHold(g, a)).toMatch(/crater/);
    expect(canGoOn(g, a)).toBe(false);
    expect(blockedReason(g, a)).toMatch(/crater/);
    // the dome digs on: foundation stage, crater at depth
    g.structures[0].stage = 1; g.structures[0].done = 0;
    expect(orderHold(g, a)).toBeNull();
    // the dome reaches its backfill stage while the bunker has no roof yet
    g.structures[0].stage = 2;
    expect(orderHold(g, g.structures[0])).toMatch(/walls and roof/);
    expect(canGoOn(g, g.structures[0])).toBe(false);
    a.stage = 4;
    expect(orderHold(g, g.structures[0])).toBeNull();
  });
  it('no deadlock: with nothing linked a dome is never held, and a held dome frees when the piece is gone', () => {
    const g = game('geodesic', 2);
    expect(orderHold(g, g.structures[0])).toBeNull();
    const a = S('a', 'bunker_dorm', 0, 0, 1); g.structures.push(a); stampUnderDome(g, a, { dome: 'dm', floorFt: FL }, false);
    expect(a.underDome!.with).toBe(false);
    expect(orderHold(g, g.structures[0])).toBeNull();
  });
});

describe('the progress readout and the refuge', () => {
  it('the shell percent follows the stages and rows list what is under the dome', () => {
    const g = game('geodesic', 1), a = S('a', 'bunker_dorm', 0, 0, 0); g.structures.push(a); stampUnderDome(g, a, { dome: 'dm', floorFt: FL }, true);
    expect(bunkerShellPct(g, 'dm')).toBe(0);
    let prev = -1;
    for (let st = 0; st < 5; st++) { a.stage = st; a.done = 0; const p = bunkerShellPct(g, 'dm')!; expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
    expect(prev).toBe(100);
    expect(bunkerRows(g, 'dm')).toHaveLength(1);
    expect(under(g, g.structures[0])).toHaveLength(1);
    expect(bunkerShellPct(game('geodesic'), 'dm')).toBeNull();
  });
  it('a finished bunker is a refuge for the people in the dome', () => {
    const g = game('geodesic', 99);
    g.structures.push(S('h', 'bunker_hatch', 0, 0, 99, { finishedAt: 1 }), S('d', 'bunker_dorm', 0.5, 0.5, 99, { finishedAt: 1 }));
    const r = domeRefuge(g, 'dm', 'breach', 6, true);
    expect(r.open).toBe(true); expect(r.sheltered).toBe(6); expect(r.power).toBe('dome');
    expect(shellFt('geodesic', 7)).toBeGreaterThan(0);
  });
});
