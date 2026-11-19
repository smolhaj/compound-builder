import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setGroundOverride } from '../terrainState';
import { place } from '../raidTestKit';
import { dayIndex, type GameState } from '../state';
import { runFinished } from '../perimeter';
import { DOME_KIND, TIER, type DomeTier } from './tiers';
import { domesOf } from './standing';
import { AIRLOCK_CYCLE_S } from './siege';
import { domeRouteProblem, nearestAirlock } from './crossing';
import { digStops } from './crossing';
import {
  LINK, SAFE_PLAIN_FT, bestLink, capacityOf, collapseLink, depthCapFt, depthChoices, depthWord, feederPartners, freeAngle, groupOf, joined, linkDay, linkGroups, linkCapacity,
  linkState, linksBetween, nodeOf, orderLink, quoteLink, redundant, repairLink, ringOf, stageOf, stormDownChance, supplemented, tunnelReach, linksOf, takenAngles, progressOf,
} from './links';
import { tripExposed } from '../compounds';
import { yardGeometry, hasYard } from './plantYard';
import { migrate } from '../save/migrations';

beforeEach(() => setGroundOverride({ h: () => 0, creek: null }));
afterEach(() => setGroundOverride(null));
const dome = (g: GameState, id: string, tier: DomeTier, x: number, z: number, stage = 99): void => {
  g.structures.push({ id, kind: DOME_KIND[tier], x, z, rot: 0, stage, done: 0, supplied: true, finishedAt: stage >= 99 ? 0 : null });
};
/** Two domes 14 units (280 ft) apart on open ground, with a lot of money. */
const two = (a: DomeTier = 'geodesic', b: DomeTier = 'glass', gap = 14): GameState => {
  const g = place(3, 'standard', 'bare');
  g.perimeter = [];
  g.money = 5_000_000;
  dome(g, 'dA', a, 33 - gap / 2, 33); dome(g, 'dB', b, 33 + gap / 2, 33);
  return g;
};
const finish = (g: GameState): void => { for (const l of linksOf(g)) { const r = g.perimeter.find(x => x.id === l.runId)!; r.done = r.hours; r.supplied = true; r.finishedAt = 0; } };

describe('the link airlock', () => {
  it('is a dedicated airlock on the shell, separate from the person airlocks and the plant service airlock', () => {
    const g = two('glass', 'glass'); orderLink(g, 'dA', 'dB', 'walkway');
    const d = domesOf(g).find(x => x.id === 'dA')!, links = d.airlocks.filter(a => a.role === 'link'), person = d.airlocks.filter(a => a.role !== 'link');
    expect(links.length).toBe(1);
    expect(person.length).toBe(TIER.glass.airlocks);
    const ang = (a: number, b: number) => { let x = Math.abs(a - b) % (Math.PI * 2); if (x > Math.PI) x = Math.PI * 2 - x; return x; };
    for (const p of person) expect(ang(links[0].angle, p.angle)).toBeGreaterThanOrEqual(LINK.MIN_AIRLOCK_GAP - 1e-9);
    const y = hasYard('glass') ? yardGeometry('glass', d.r, d.structure.rot) : null;
    if (y) expect(ang(links[0].angle, y.phi)).toBeGreaterThanOrEqual(y.W / 2 / d.r + 0.18 - 1e-9);
  });
  it('faces the partner dome when the way is free', () => {
    const g = two('geodesic', 'geodesic'); orderLink(g, 'dA', 'dB', 'tunnel');
    const l = domeLinkOf(g); expect(Math.abs(l.ends[0].angle! - Math.PI / 2)).toBeLessThan(0.7);
  });
  it('person-crossing code never picks a link airlock', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway');
    const d = domesOf(g).find(x => x.id === 'dA')!;
    const n = nearestAirlock(d, d.x + d.r, d.z)!;
    expect(n.airlock.role).toBeUndefined();
  });
  it('freeAngle keeps its distance from everything taken', () => {
    const g = two('glass', 'glass'); const d = domesOf(g)[0];
    for (let k = 0; k < 40; k++) { const a = freeAngle(d, k * 0.157); for (const t of takenAngles(d)) { let x = Math.abs(a - t.angle) % (Math.PI * 2); if (x > Math.PI) x = Math.PI * 2 - x; expect(x).toBeGreaterThanOrEqual(t.gap - 1e-9); } }
  });
});
const domeLinkOf = (g: GameState) => linksOf(g)[0];

describe('quote, cost and rules', () => {
  it('a walkway is cheaper and faster than a tunnel over the same distance; both are priced in US dollars and feet', () => {
    const g = two(); const w = quoteLink(g, 'dA', 'dB', 'walkway'), t = quoteLink(g, 'dA', 'dB', 'tunnel');
    expect(w.problem).toBeNull(); expect(t.problem).toBeNull();
    expect(w.lenFt).toBeGreaterThan(100);
    expect(w.totalUsd).toBeLessThan(t.totalUsd); expect(w.hours).toBeLessThan(t.hours);
    expect(w.fitLines.length).toBeGreaterThan(1);
  });
  it('a deeper tunnel costs more and takes longer (monotone)', () => {
    const g = two('glass', 'glass'); let last = { usd: 0, h: 0 };
    for (const d of depthChoices(depthCapFt(nodeOf(g, 'dA')!, nodeOf(g, 'dB')!))) { const q = quoteLink(g, 'dA', 'dB', 'tunnel', d); expect(q.totalUsd).toBeGreaterThanOrEqual(last.usd); expect(q.hours).toBeGreaterThanOrEqual(last.h); last = { usd: q.totalUsd, h: q.hours }; }
  });
  it('the depth is capped at the skirt of the shallower dome', () => {
    const g = two('earthen', 'arcology');
    expect(depthCapFt(nodeOf(g, 'dA')!, nodeOf(g, 'dB')!)).toBe(TIER.earthen.skirtFt);
    expect(quoteLink(g, 'dA', 'dB', 'tunnel', 60).depthFt).toBe(TIER.earthen.skirtFt);
    const g2 = two('glass', 'arcology'); expect(quoteLink(g2, 'dA', 'dB', 'tunnel', 60).depthFt).toBe(TIER.glass.skirtFt);
  });
  it('enforces the minimum and maximum distance', () => {
    expect(quoteLink(two('geodesic', 'geodesic', 3.5), 'dA', 'dB', 'walkway').problem).toMatch(/Too close/);
    expect(quoteLink(two('geodesic', 'geodesic', 100), 'dA', 'dB', 'walkway').problem).toMatch(/Too far|runs off your land/);
  });
  it('refuses the same kind twice, and a dome to itself', () => {
    const g = two(); expect(orderLink(g, 'dA', 'dB', 'walkway')).toBeNull();
    expect(quoteLink(g, 'dA', 'dB', 'walkway').problem).toMatch(/already joined/);
    expect(quoteLink(g, 'dA', 'dA', 'tunnel').problem).toMatch(/different/);
  });
  it('both is two separate links with their own cost', () => {
    const g = two(); const m0 = g.money;
    expect(orderLink(g, 'dA', 'dB', 'walkway')).toBeNull(); expect(orderLink(g, 'dA', 'dB', 'tunnel')).toBeNull();
    expect(linksOf(g).map(l => l.kind).sort()).toEqual(['tunnel', 'walkway']);
    expect(linksOf(g)[0].runId).not.toBe(linksOf(g)[1].runId);
    expect(m0 - g.money).toBe(linksOf(g).reduce((a, l) => a + l.feeUsd, 0));
    expect(domesOf(g).find(d => d.id === 'dA')!.airlocks.filter(a => a.role === 'link').length).toBe(2);
  });
  it('needs the money for the fit-out, and an end that is a finished dome', () => {
    const g = two(); g.money = 100; expect(orderLink(g, 'dA', 'dB', 'tunnel')).toMatch(/account holds/);
    const h = two(); h.structures.find(s => s.id === 'dB')!.stage = 1; h.structures.find(s => s.id === 'dB')!.finishedAt = null;
    expect(quoteLink(h, 'dA', 'dB', 'walkway').problem).toMatch(/finished/);
  });
  it('a walkway will not cross the creek without a bridge, and says why', () => {
    const g = two();
    expect(quoteLink(g, 'dA', 'dB', 'walkway').problem).toBeNull();
    g.structures.find(s => s.id === 'dB')!.z = 45;
    setGroundOverride({ h: () => 0, creek: { zAt: () => 39, waterY: () => 0, halfWidth: 1 } });
    const w = quoteLink(g, 'dA', 'dB', 'walkway');
    expect(w.problem).toMatch(/without a bridge/);
    const t = quoteLink(g, 'dA', 'dB', 'tunnel', 30);
    expect(t.problem === null || /deep/.test(t.problem)).toBe(true);
    setGroundOverride({ h: x => x * 0.5, creek: null });
    expect(quoteLink(g, 'dA', 'dB', 'walkway').problem).toMatch(/Too steep/);
    expect(quoteLink(g, 'dA', 'dB', 'tunnel').problem).toBeNull();
  });
  it('a line through a third dome is refused', () => {
    const g = two('geodesic', 'geodesic', 20); dome(g, 'dC', 'glass', 33, 33);
    expect(quoteLink(g, 'dA', 'dB', 'walkway').problem).toMatch(/through another dome|Too far|off your land/);
    void domeRouteProblem;
  });
});

describe('building, stages and the run', () => {
  it('lays a real run: a covered walkway or an underground passage, with stages like the dome dig', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway'); orderLink(g, 'dA', 'dB', 'tunnel');
    const [w, t] = linksOf(g);
    expect(g.perimeter.find(r => r.id === w.runId)!.kind).toBe('covered_walkway');
    expect(g.perimeter.find(r => r.id === t.runId)!.kind).toBe('underground_passage');
    expect(stageOf(g, t)).toBe('planned');
    const rt = g.perimeter.find(r => r.id === t.runId)!, rw = g.perimeter.find(r => r.id === w.runId)!;
    rt.supplied = rw.supplied = true;
    const seen = new Set<string>(), seenW = new Set<string>();
    for (let u = 0.05; u <= 1.001; u += 0.05) { rt.done = rt.hours * Math.min(1, u); rw.done = rw.hours * Math.min(1, u); if (u >= 1) { rt.finishedAt = 0; rw.finishedAt = 0; } seen.add(stageOf(g, t)); seenW.add(stageOf(g, w)); }
    expect([...seen]).toEqual(['excavate', 'lining', 'backfill', 'open']);
    expect([...seenW]).toEqual(['foundations', 'frame', 'glazing', 'open']);
    expect(progressOf(g, t)).toBe(1);
  });
  it('is not open until it is built', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway'); const l = linksOf(g)[0];
    expect(linkState(g, l)).toBe('building'); expect(capacityOf(g, l)).toBe(0); expect(joined(g, 'dA', 'dB')).toBe(false);
    finish(g); expect(linkState(g, l)).toBe('open'); expect(joined(g, 'dA', 'dB')).toBe(true);
    expect(runFinished(g.perimeter.find(r => r.id === l.runId)!)).toBe(true);
  });
});

describe('travel, ring, redundancy and the feeder', () => {
  it('daily travel between the domes drops: a covered trip, not an exposed one', () => {
    const g = two(); expect(tripExposed(g, [26, 33], [40, 33])).toBe(true);
    orderLink(g, 'dA', 'dB', 'walkway'); expect(tripExposed(g, [26, 33], [40, 33])).toBe(true);
    finish(g); expect(tripExposed(g, [26, 33], [40, 33])).toBe(false);
  });
  it('sealed domes: each end adds an airlock cycle; an unsealed dome adds none; a link that is down isolates', () => {
    const g = two('geodesic', 'glass'); orderLink(g, 'dA', 'dB', 'tunnel'); finish(g);
    const open = bestLink(g, 'dA', 'dB')!, sealed = bestLink(g, 'dA', 'dB', 'family', () => true)!;
    expect(open.cycles).toBe(0); expect(sealed.cycles).toBe(2);
    expect(sealed.seconds - open.seconds).toBe(AIRLOCK_CYCLE_S.geodesic + AIRLOCK_CYCLE_S.glass);
    collapseLink(g, linksOf(g)[0].id);
    expect(bestLink(g, 'dA', 'dB')).toBeNull(); expect(joined(g, 'dA', 'dB')).toBe(false);
  });
  it('both links: if one is cut the other still carries travel, supplies and the feeder', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway'); orderLink(g, 'dA', 'dB', 'tunnel'); finish(g);
    expect(redundant(g, 'dA', 'dB')).toBe(true);
    const [w, t] = linksOf(g);
    collapseLink(g, t.id);
    expect(linksBetween(g, 'dA', 'dB').map(l => l.id)).toEqual([w.id]);
    expect(bestLink(g, 'dA', 'dB')).not.toBeNull(); expect(feederPartners(g, 'dA')).toEqual(['dB']); expect(redundant(g, 'dA', 'dB')).toBe(false);
  });
  it('a vehicle uses the tunnel only', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway'); finish(g);
    expect(bestLink(g, 'dA', 'dB', 'vehicle')).toBeNull();
    orderLink(g, 'dA', 'dB', 'tunnel'); finish(g);
    expect(bestLink(g, 'dA', 'dB', 'vehicle')!.link.kind).toBe('tunnel');
  });
  it('one ring: guards and towers cover both domes', () => {
    const g = two(); expect(ringOf(g, 'dA')).toEqual(['dA']);
    orderLink(g, 'dA', 'dB', 'walkway'); finish(g);
    expect(ringOf(g, 'dA').sort()).toEqual(['dA', 'dB']); expect(groupOf(g, 'dB').sort()).toEqual(['dA', 'dB']);
    expect(linkGroups(g, 'tunnel').some(x => x.length === 2)).toBe(false);
  });
  it('the feeder lifts a weaker plant, never lowers it and never passes 1 (property)', () => {
    for (let own = 0; own <= 1.0001; own += 0.1) for (let p = 0; p <= 1.0001; p += 0.1) {
      const v = supplemented(own, [p]); expect(v).toBeGreaterThanOrEqual(own - 1e-9); expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(supplemented(own, [p + 0.1 > 1 ? 1 : p + 0.1])).toBeGreaterThanOrEqual(v - 1e-9);
    }
    expect(supplemented(0, [])).toBe(0);
  });
});

describe('the tunnel against a dig (depth)', () => {
  it('a plain crew cannot reach a tunnel at 18 ft or more; a learned crew can reach 20 ft but not 30', () => {
    expect(SAFE_PLAIN_FT).toBe(17);
    expect(tunnelReach(20, 0)).toBe(0); expect(tunnelReach(20, 1)).toBeGreaterThan(0.5); expect(tunnelReach(30, 1)).toBe(0); expect(tunnelReach(8, 0)).toBeGreaterThan(0.5);
    expect(depthWord(30)).toMatch(/deeper/); expect(depthWord(20)).toMatch(/learned/); expect(depthWord(8)).toMatch(/plain crew can dig/);
  });
  it('reach never rises with depth and never falls as the crew learns (property)', () => {
    for (let a = 0; a <= 1.0001; a += 0.25) { let last = 2; for (let d = 4; d <= 80; d += 2) { const r = tunnelReach(d, a); expect(r).toBeLessThanOrEqual(last + 1e-9); last = r; } }
    for (let d = 4; d <= 80; d += 2) { let last = -1; for (let a = 0; a <= 1.0001; a += 0.25) { const r = tunnelReach(d, a); expect(r).toBeGreaterThanOrEqual(last - 1e-9); last = r; } }
    expect(tunnelReach(20, 0)).toBe(1 - Math.min(1, digStops(20, 0)) <= 0.01 ? 0 : 1 - digStops(20, 0));
  });
});

describe('collapse, weather, wear and repair', () => {
  it('a tunnel can be brought down and cleared; only a tunnel can be collapsed', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway'); orderLink(g, 'dA', 'dB', 'tunnel'); finish(g);
    const [w, t] = linksOf(g);
    expect(collapseLink(g, w.id)).toMatch(/only a tunnel/);
    expect(collapseLink(g, t.id)).toBeNull(); expect(linkState(g, t)).toBe('down'); expect(collapseLink(g, t.id)).toMatch(/already/);
    const q = t.down!.repairUsd; expect(q).toBeGreaterThan(0);
    expect(repairLink(g, t.id)).toBeNull(); expect(repairLink(g, t.id)).toMatch(/already/);
    g.clock.t = t.down!.clearsAt! + 0.1; linkDay(g); expect(linkState(g, t)).toBe('open');
  });
  it('the chance a storm downs a walkway rises with wear and never falls; a tunnel ignores snow and wind', () => {
    for (const storm of ['blizzard', 'tornado', 'hail', 'lightning_fire', 'windstorm']) { let last = -1; for (let w = 0; w <= 1.0001; w += 0.1) { const p = stormDownChance('walkway', storm, w); expect(p).toBeGreaterThanOrEqual(last - 1e-9); last = p; } expect(stormDownChance('tunnel', storm, 1)).toBe(0); }
    expect(stormDownChance('walkway', null, 1)).toBe(0);
  });
  it('capacity never rises as wear rises, and is nothing while down (monotonic degradation)', () => {
    let last = 2; for (let w = 0; w <= 1.0001; w += 0.05) { const c = linkCapacity(w, false); expect(c).toBeLessThanOrEqual(last + 1e-9); last = c; }
    expect(linkCapacity(0, true)).toBe(0);
  });
  it('wear creeps up daily and a walkway wears faster than a tunnel', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'walkway'); orderLink(g, 'dA', 'dB', 'tunnel'); finish(g);
    for (let i = 0; i < 30; i++) { g.clock.t += 1; linkDay(g); }
    const [w, t] = linksOf(g); expect(w.wear).toBeGreaterThan(t.wear); expect(t.wear).toBeGreaterThan(0);
    void dayIndex;
  });
});

describe('the save', () => {
  it('migrates v103 saves with no links and leaves them valid', () => {
    const g = two(); delete (g as { domeLinks?: unknown }).domeLinks;
    const m = migrate({ ...g, version: 103 } as never);
    expect(m.version).toBeGreaterThanOrEqual(104); expect(linksOf(m)).toEqual([]);
  });
  it('a game with links survives a JSON round trip', () => {
    const g = two(); orderLink(g, 'dA', 'dB', 'tunnel'); finish(g);
    const back = JSON.parse(JSON.stringify(g)) as GameState;
    expect(linksOf(back)).toEqual(linksOf(g)); expect(domesOf(back).find(d => d.id === 'dA')!.airlocks.some(a => a.role === 'link')).toBe(true);
  });
});
