import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { planRun } from './perimeter';
import { resolve, postureOf, type Encounter, type EncounterKind } from './encounters';
import { crewStyle, decorateRaiders, sceneStyle, sceneTactic, raiderLooks, styleCaption, type CrewStyle } from './raiderKinds';
import { decorateDefenders } from './defenderMoments';
import { planSiege, sceneCaption } from './siege';
import { stageRaid, commitRaid } from './raidCutscene';
import { talkOffer, settleChance, ambushChance, willing, P_MAX, P_MIN, termStock, isTalk, TALK_STANCES, talkRoll } from './negotiation';
import { applyRaidDamage, addDamageWork, damagePenalty, nextDamage, openDamage, damageSummary, addBurnScar } from './raidDamage';
import { waiters } from './stalls';
import { plansNeed, suggestions } from './guidance';
import { migrate } from './save/migrations';
import { mulberry32 } from './rng';
import type { Battle } from './battleTypes';

function base(seed = 1, difficulty: 'cozy' | 'standard' | 'hardcore' = 'standard'): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.stock.canned = 40; g.stock.fuel = 20; g.stock.meds = 3; g.stock.lumber = 20; g.stock.hardware = 20;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], [{ at: 15, w: 2 }]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
  }
  g.armory.ammo['556'] = 2000;
  return g;
}
const enc = (kind: EncounterKind, o: Partial<Encounter> = {}): Encounter => ({ id: 'e1', kind, day: 5, title: 'A crew', dossier: [], size: 6, armed: true, strength: 70, wants: { canned: 5, fuel: 2 }, stances: ['hide', 'parley', 'defend'], temper: 'desperate', ...o });

describe('raider styles', () => {
  it('maps crew kinds to distinct styles and the dead to none', () => {
    expect(crewStyle('horde', 30, undefined, false, 1)).toBeNull();
    expect(crewStyle('patrol', 6, undefined, true, 1)).toBe('crew');
    expect(crewStyle('requisition', 5, undefined, true, 1)).toBe('crew');
    const seen = new Set<CrewStyle | null>();
    for (let sd = 1; sd < 60; sd++) for (const k of ['looters', 'gang', 'militia'] as EncounterKind[]) for (const t of ['desperate', 'hard', 'savage'] as const) for (const armed of [true, false]) seen.add(crewStyle(k, 3 + (sd % 9), t, armed, sd));
    for (const s of ['crowd', 'crew', 'families', 'opportunists']) expect(seen.has(s as CrewStyle)).toBe(true);
    expect(crewStyle('gang', 10, 'savage', true, 3)).toBe('crew');
  });
  it('a probe is two scouts, fires are a distraction, a crew flanks', () => {
    expect(sceneStyle('crowd', 'probe')).toBe('scouts');
    expect(sceneStyle('families', 'probe')).toBe('families');
    expect(sceneTactic('crowd', 'fires', 1)).toBe('distraction');
    expect(sceneTactic('crew', 'probe', 1)).toBe('probing');
    const t = new Set(Array.from({ length: 30 }, (_, i) => sceneTactic('crew', 'assault', i)));
    expect(t.has('flanking')).toBe(true);
  });
  it('looks: families have kids at the back, a crowd carries torches at night, a crew none', () => {
    const f = raiderLooks('families', 6, true, 3);
    expect(f.filter(l => l.role === 'kid').length).toBe(3);
    expect(f.slice(0, 3).every(l => l.role === 'parent')).toBe(true);
    expect(raiderLooks('crew', 8, true, 3).some(l => l.torch)).toBe(false);
    expect(raiderLooks('crowd', 12, true, 3).filter(l => l.torch).length).toBeGreaterThan(2);
    expect(raiderLooks('crowd', 12, false, 3).some(l => l.torch)).toBe(false);
  });
  it('planSiege stamps every scene with a style and a tactic, and the captions differ by style', () => {
    const plan = planSiege({ kind: 'gang', size: 10, temper: 'hard', hour: 2.25, seed: 4, fought: true, fightSeconds: 80, armed: true });
    expect(plan.style).toBe('crew');
    for (const sc of plan.scenes) { expect(sc.style).toBeTruthy(); expect(sc.tactic).toBeTruthy(); }
    const lines = new Set<string>();
    for (const st of ['scouts', 'crowd', 'crew', 'families', 'opportunists'] as CrewStyle[]) for (let sd = 0; sd < 12; sd++) { const l = styleCaption(st, 'rushing', 'lead', true, sd); if (l) lines.add(l); }
    expect(lines.size).toBeGreaterThan(8);
    expect(sceneCaption(plan, plan.scenes[0], 'lead', 4).length).toBeGreaterThan(10);
  });
  it('flanking swings half the crew round the house, keeps their moves with them, and does not touch the input', () => {
    const b: Battle = { night: true, duration: 30, units: [
      { id: 'h_a', side: 'home', x: 0, z: 0, personId: 'a' },
      ...[0, 1, 2, 3].map(i => ({ id: `r${i}`, side: 'raider' as const, x: 30, z: i })),
    ], events: [{ t: 1, kind: 'move', unit: 'r1', x: 10, z: 1 }, { t: 2, kind: 'move', unit: 'r0', x: 10, z: 0 }, { t: 30, kind: 'end', result: 'fled' }] };
    const before = JSON.stringify(b);
    const d = decorateRaiders(b, 'crew', 'flanking', true, 5);
    expect(JSON.stringify(b)).toBe(before);
    expect(d.units.find(u => u.id === 'r0')!.x).toBe(30);
    const r1 = d.units.find(u => u.id === 'r1')!;
    expect(r1.x).not.toBe(30);
    const m = d.events.find(e => e.kind === 'move' && e.unit === 'r1') as { x: number; z: number };
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(Math.hypot(10, 1), 1);
    expect(d.units.filter(u => u.side === 'raider').every(u => u.look)).toBe(true);
  });
});

describe('defender moments', () => {
  it('names the dogs and the kids, pulls children indoors, stands the guards, and fires a warning shot', () => {
    const g = base(2);
    g.dogs.push({ id: 'd1', name: 'Biscuit', health: 90 } as never);
    const e = enc('looters'); g.gate.pending = e;
    const st = stageRaid(g, 'warn');
    const b = st.battles[0];
    const text = b.events.filter(x => x.kind === 'say').map(x => (x as { text: string }).text).join(' | ');
    expect(text).toContain('Biscuit');
    expect(b.events.some(x => x.kind === 'shot' && !x.hit)).toBe(true);
    const kids = g.people.filter(p => p.kid);
    if (kids.length) expect(b.units.some(u => u.civilian)).toBe(true);
  });
  it('leaves the original battle alone', () => {
    const g = base(2);
    const b: Battle = { night: false, duration: 10, units: [{ id: 'h_a', side: 'home', x: 0, z: 0, personId: g.people[0].id }, { id: 'r0', side: 'raider', x: 20, z: 0 }], events: [{ t: 10, kind: 'end', result: 'fled' }] };
    const s = JSON.stringify(b);
    decorateDefenders(b, g, null, 1);
    expect(JSON.stringify(b)).toBe(s);
  });
});

describe('raid damage', () => {
  const breachBattle = (x: number, z: number): Battle => ({ night: true, duration: 10, units: [], events: [{ t: 3, kind: 'breach', x, z }, { t: 10, kind: 'end', result: 'breached' }] });
  it('a breach opens a gap on the nearest wall, weakens the line, and is mended with material and work', () => {
    const g = base(3);
    const before = postureOf(g).barrier;
    const lines = applyRaidDamage(g, breachBattle(0, -10.5), false, mulberry32(1));
    expect(lines.join(' ')).toMatch(/gap|gate/);
    expect(openDamage(g).length).toBe(1);
    expect(postureOf(g).barrier).toBeLessThan(before);
    expect(damagePenalty(g)).toBeGreaterThan(0);
    expect(damageSummary(g).length).toBeGreaterThan(0);
    for (const k of Object.keys(openDamage(g)[0].bill)) (g.stock as Record<string, number>)[k] = 50;
    const d = nextDamage(g)!;
    const lumber = g.stock.lumber;
    addDamageWork(g, d, 1);
    expect(lumber).toBeGreaterThan(0);
    addDamageWork(g, d, 100);
    expect(openDamage(g).length).toBe(0);
    expect(postureOf(g).barrier).toBeCloseTo(before, 5);
  });
  it('a crew through the house breaks the windows (the building repair job)', () => {
    const g = base(3);
    applyRaidDamage(g, breachBattle(0, 1), true, mulberry32(1));
    const house = g.structures.find(s => s.id === 'house')!;
    expect(house.fixes?.some(f => f.part === 'glass' && f.cond === 'poor')).toBe(true);
    expect(damageSummary(g)).toContain('broken windows');
  });
  it('missing material becomes a stuck project and a Next-steps card', () => {
    const g = base(3);
    applyRaidDamage(g, breachBattle(0, -10.5), false, mulberry32(1));
    for (const k of Object.keys(openDamage(g)[0].bill)) (g.stock as Record<string, number>)[k] = 0;
    expect(nextDamage(g)).toBeNull();
    expect(waiters(g).some(w => w.key.startsWith('d:'))).toBe(true);
    expect(Object.keys(plansNeed(g)).length).toBeGreaterThan(0);
    expect(suggestions(g, 12).some(s => s.id === 'raid_damage')).toBe(true);
  });
  it('a burn scar is cleared with work alone', () => {
    const g = base(3);
    addBurnScar(g, 4, 4, 'shed');
    expect(nextDamage(g)?.kind).toBe('burn');
    addDamageWork(g, nextDamage(g)!, 50);
    expect(openDamage(g).length).toBe(0);
  });
  it('a lost fight leaves damage in the committed game, and it survives a JSON round trip', () => {
    let found = false;
    for (let sd = 1; sd <= 12 && !found; sd++) {
      const g = base(sd);
      for (const p of g.people) g.armory.guns = g.armory.guns.filter(x => x.carrier !== p.id);
      g.armory.ammo['556'] = 0;
      g.gate.pending = enc('gang', { size: 14, strength: 170, stances: ['defend'] });
      const st = stageRaid(g, 'defend');
      const done = commitRaid(st);
      if (openDamage(done).length) { found = true; expect(JSON.parse(JSON.stringify(done)).raidDamage).toEqual(done.raidDamage); expect(st.report.lines.join(' ')).toMatch(/gap|gate|window/); expect(st.report.damage.length).toBeGreaterThan(0); }
    }
    expect(found).toBe(true);
  });
});

describe('negotiation', () => {
  const place = (g: GameState) => postureOf(g);
  it('is a real decision: every term costs something, nothing is certain, and savage crews never talk', () => {
    let opened = 0;
    for (let sd = 1; sd <= 40; sd++) {
      const g = base(sd % 5 + 1); const e = enc('gang', { id: `e${sd}`, day: sd });
      const o = talkOffer(g, e, place(g));
      if (!o.open) continue;
      opened++;
      expect(o.terms.length).toBeGreaterThan(0);
      for (const t of o.terms) {
        expect(t.pSettle).toBeLessThanOrEqual(P_MAX); expect(t.pSettle).toBeGreaterThanOrEqual(P_MIN);
        expect(Object.keys(t.stock).length > 0 || t.humanity !== 0 || t.stance === 'neg_redirect').toBe(true);
        expect(t.cost).not.toBe('nothing');
      }
    }
    expect(opened).toBeGreaterThan(3);
    expect(opened).toBeLessThan(40);
    for (let sd = 1; sd <= 40; sd++) expect(willing(base(1), enc('gang', { id: `s${sd}`, day: sd, temper: 'savage' }))).toBe(false);
    expect(willing(base(1), enc('horde'))).toBe(false);
  });
  it('depends on the kind, the temper, the talker, the walls and the difficulty', () => {
    const g = base(1), p = place(g);
    const desp = settleChance(g, enc('looters'), 'neg_toll', p), hard = settleChance(g, enc('looters', { temper: 'hard' }), 'neg_toll', p);
    expect(hard).toBeLessThan(desp);
    expect(settleChance(g, enc('requisition'), 'neg_toll', p)).toBeGreaterThan(settleChance(g, enc('gang'), 'neg_toll', p));
    const talker = structuredClone(g); talker.people[0].skills.negotiator = 8;
    expect(settleChance(talker, enc('gang'), 'neg_toll', p)).toBeGreaterThanOrEqual(settleChance(g, enc('gang'), 'neg_toll', p));
    expect(settleChance(base(1, 'cozy'), enc('gang'), 'neg_toll', p)).toBeGreaterThan(settleChance(base(1, 'hardcore'), enc('gang'), 'neg_toll', p));
    const soft = { ...p, fortress: 0 }, hardP = { ...p, fortress: 100 };
    expect(settleChance(g, enc('gang'), 'neg_toll', hardP)).toBeGreaterThan(settleChance(g, enc('gang'), 'neg_toll', soft));
    const e = enc('gang', { temper: 'hard' });
    expect(ambushChance(g, e, 'neg_toll', 0.5)).toBeGreaterThan(ambushChance(g, enc('gang'), 'neg_toll', 0.5));
    expect(ambushChance(base(1, 'hardcore'), e, 'neg_toll', 0.5)).toBeGreaterThan(ambushChance(g, e, 'neg_toll', 0.5));
    // a hard crew's trap is more likely than a desperate one's, and aid is only offered to the desperate
    expect(talkOffer(g, enc('looters', { temper: 'hard', id: 'x', day: 1 }), p).terms.some(t => t.stance === 'neg_aid')).toBe(false);
  });
  it('the dice honor the odds shown (rolled many times)', () => {
    const g = base(1), p = place(g), e = enc('looters');
    for (const t of TALK_STANCES) {
      let ok = 0, trap = 0; const N = 2000;
      for (let i = 0; i < N; i++) { const o = talkRoll(g, e, t, p, mulberry32(i * 7 + 1)); if (o.result === 'settled') ok++; if (o.result === 'ambush') trap++; }
      expect(Math.abs(ok / N - settleChance(g, e, t, p))).toBeLessThan(0.04);
      expect(Math.abs(trap / N - ambushChance(g, e, t, settleChance(g, e, t, p)))).toBeLessThan(0.04);
    }
  });
  it('routes through resolve: paying a toll takes stores, a redirect costs humanity and the neighbors, a trap is a fight with the crew inside', () => {
    const outcomes = new Set<string>();
    for (let sd = 1; sd <= 60; sd++) {
      for (const t of TALK_STANCES) {
        const g = base(sd % 7 + 1); const e = enc('looters', { day: sd, id: `t${sd}` }); g.gate.pending = e;
        const canned = g.stock.canned, hum = g.gate.humanity, disp = g.neighbors.map(n => n.disposition);
        const out = resolve(g, t);
        const tally = g.gate.talks!; expect(tally.held).toBe(1);
        const last = g.gate.history[g.gate.history.length - 1];
        if (last.stance === t) {
          outcomes.add('settled'); expect(tally.settled).toBe(1); expect(g.gate.battle).toBeUndefined();
          if (t === 'neg_toll') expect(g.stock.canned).toBeLessThan(canned);
          if (t === 'neg_aid') { expect(g.stock.canned).toBeLessThan(canned); expect(g.gate.humanity).toBeGreaterThan(hum); }
          if (t === 'neg_redirect') { expect(g.gate.humanity).toBeLessThan(hum); expect(g.neighbors.some((n, i) => n.disposition < disp[i])).toBe(true); expect(g.stock.canned).toBe(canned); }
          expect(out.tone).not.toBe('bad');
        } else {
          expect(last.stance).toBe('defend'); expect(g.gate.battle).toBeDefined();
          outcomes.add(tally.ambushed ? 'ambush' : 'refused');
        }
      }
    }
    expect([...outcomes].sort()).toEqual(['ambush', 'refused', 'settled']);
  });
  it('cannot offer what the family does not have', () => {
    const g = base(1); g.stock.canned = 0; g.stock.fuel = 0;
    const e = enc('looters', { id: 'a1', day: 1 });
    for (let d = 1; d < 80; d++) { const o = talkOffer(g, { ...e, day: d }, place(g)); if (o.open) { expect(o.terms.find(t => t.stance === 'neg_toll')!.blocked).toBeTruthy(); return; } }
    throw new Error('never open');
  });
  it('helpers', () => { expect(isTalk('neg_toll')).toBe(true); expect(isTalk('defend')).toBe(false); expect(termStock(enc('gang'), 'neg_toll').canned).toBe(2); });
});

describe('save v85', () => {
  it('migrates a v84 save and keeps raid damage through a round trip', () => {
    const g = base(1);
    const old = JSON.parse(JSON.stringify(g)); old.version = 84; delete old.raidDamage; delete old.gate.talks;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(85);
    expect(m.raidDamage).toEqual([]);
    expect(m.gate.talks).toEqual({ held: 0, settled: 0, ambushed: 0, refused: 0 });
  });
});

import { blockedBetween } from '../game/battle/director';
import { coverBoxes } from '../game/battle/cameraObstacles';
describe('ground cover in the framing check', () => {
  const flat = () => 0;
  const bush = coverBoxes([{ x: 5, z: 0, r: 0.5, h: 0.3 }], { x: 0, z: 0 }, 70);
  it('a bush right in front of a figure blocks the view; one far down the ray, off to the side, or under a high camera does not', () => {
    const eye = { x: 0, y: 0.2, z: 0 };
    expect(blockedBetween(eye, { x: 8, y: 0.17, z: 0 }, bush, flat)).toBe(false);
    expect(blockedBetween(eye, { x: 5.6, y: 0.17, z: 0 }, bush, flat)).toBe(true);
    expect(blockedBetween(eye, { x: 5, y: 0.17, z: 0.9 }, bush, flat)).toBe(false);
    expect(blockedBetween(eye, { x: 8, y: 0.17, z: 3 }, bush, flat)).toBe(false);
    expect(blockedBetween({ x: 0, y: 1.5, z: 0 }, { x: 8, y: 0.17, z: 0 }, bush, flat)).toBe(false);
  });
});
describe('cover only counts right in front of a figure', () => {
  it('a bush a metre in front of the subject blocks; one far down the ray does not', () => {
    const flat = () => 0, eye = { x: 0, y: 0.2, z: 0 };
    const nearB = coverBoxes([{ x: 7.4, z: 0, r: 0.3, h: 0.3 }], { x: 0, z: 0 }, 70), farB = coverBoxes([{ x: 3, z: 0, r: 0.3, h: 0.3 }], { x: 0, z: 0 }, 70);
    expect(blockedBetween(eye, { x: 8, y: 0.17, z: 0 }, nearB, flat)).toBe(true);
    expect(blockedBetween(eye, { x: 8, y: 0.17, z: 0 }, farB, flat)).toBe(false);
  });
});
import { coverPusher } from '../game/battle/cameraObstacles';
describe('raiders are not put down in cover', () => {
  it('moves a point out of a bush, leaves a clear one alone, and settles among overlapping bushes', () => {
    const push = coverPusher([{ x: 10, z: 10, r: 0.5 }, { x: 10.6, z: 10, r: 0.5 }]);
    expect(push(2, 2)).toEqual({ x: 2, z: 2 });
    const p = push(10.1, 10);
    expect(Math.hypot(p.x - 10, p.z - 10)).toBeGreaterThanOrEqual(0.5 + 0.35 - 1e-6);
    expect(Math.hypot(p.x - 10.6, p.z - 10)).toBeGreaterThanOrEqual(0.5 + 0.35 - 0.25);
    expect(push(10, 10).x).not.toBe(10);
  });
});
describe('opportunists', () => {
  it('come with a pickup standing behind them, on the road side', () => {
    const b: Battle = { night: false, duration: 9, units: [{ id: 'h_a', side: 'home', x: 0, z: 0 }, { id: 'r0', side: 'raider', x: 20, z: 0 }, { id: 'r1', side: 'raider', x: 20, z: 2 }], events: [{ t: 9, kind: 'end', result: 'fled' }] };
    const d = decorateRaiders(b, 'opportunists', 'rushing', false, 3);
    expect(d.vehicle!.x).toBeGreaterThan(21);
    expect(decorateRaiders(b, 'crowd', 'rushing', false, 3).vehicle).toBeUndefined();
    expect(b.vehicle).toBeUndefined();
  });
});
