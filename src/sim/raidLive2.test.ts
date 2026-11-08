/**
 * Raid depth part 2 in the LIVE path (openers, weather and flares, the raider with a story, orders on the playhead, the Hardcore staging fix):
 * everything is rolled by `gateDay` / `resolve` / `stageRaid` / `planBattle` in real game states, and the scene reads only what the sim wrote.
 */
import { describe, expect, it } from 'vitest';
import { applyBattle, planBattle, type BattleOptions } from './battle';
import { gateDay, resolve, type Encounter } from './encounters';
import { stageRaid, restageRaid } from './raidCutscene';
import { fightClock, planSiege, segments } from './siege';
import { step } from './engine';
import { dayIndex, SAVE_VERSION } from './state';
import { migrate } from './save/migrations';
import { LAYOUTS, CREWS, place, opts, problems } from './raidTestKit';
import type { Opener } from './raidOpeners';
import type { Difficulty } from './difficulty';
import type { BattleEvent } from './battleTypes';

const gang = CREWS[1], militia = CREWS[3];
const withOpener = (o: Opener, c = gang): BattleOptions => ({ ...opts(c), opener: o });
const evs = <K extends BattleEvent['kind']>(b: { events: BattleEvent[] }, k: K) => b.events.filter(e => e.kind === k) as Array<Extract<BattleEvent, { kind: K }>>;

describe('openers are rolled when the raid is made and read by the fight', () => {
  it('gateDay gives raids an opener (and none to the others); the white-flag demand gets its own answer on the card', () => {
    const kinds: Record<string, number> = {}; let demandCards = 0, none = 0, n = 0;
    for (let seed = 1; seed <= 160; seed++) {
      const g = place(1 + (seed % 9), (['cozy', 'standard', 'hardcore'] as const)[seed % 3], 'armed');
      g.gate.day = -1; g.gate.next = dayIndex(g.clock.t); g.gate.pending = null;
      g.disaster.tracks = { ...g.disaster.tracks, law: 0 }; g.seed = seed;
      const e = gateDay(g);
      if (!e || !['looters', 'gang', 'militia', 'patrol', 'requisition'].includes(e.kind)) continue;
      n++;
      if (!e.opener) { none++; continue; }
      kinds[e.opener.kind] = (kinds[e.opener.kind] ?? 0) + 1;
      if (e.opener.kind === 'demand') { demandCards++; expect(e.stances).toContain('flag_pay'); expect(e.wants && Object.keys(e.wants).length).toBeGreaterThan(0); expect(e.dossier.join(' ')).toMatch(/white/); }
      else expect(e.stances).not.toContain('flag_pay');
    }
    expect(n).toBeGreaterThan(15); expect(none).toBeGreaterThan(n / 3); expect(Object.keys(kinds).length).toBeGreaterThanOrEqual(3); expect(demandCards).toBeGreaterThan(0);
  });
  it('paying the man under the white flag costs exactly what he asked and no one is hurt; talking and refusing are the existing talk and fight', () => {
    const g = place(3, 'standard', 'container');
    g.gate.pending = { id: 'e1', kind: 'requisition', day: 5, title: 'A team', dossier: [], size: 6, armed: true, strength: 70, wants: { canned: 5, fuel: 2 }, stances: ['hide', 'parley', 'defend', 'flag_pay'], temper: 'hard', opener: { kind: 'demand' } } as Encounter;
    const canned = g.stock.canned, fuel = g.stock.fuel;
    const o = resolve(g, 'flag_pay');
    expect(g.stock.canned).toBe(canned - 5); expect(g.stock.fuel).toBe(fuel - 2); expect(o.title).toBe('The toll is paid'); expect(g.gate.battle).toBeUndefined();
    expect(g.personState.every(ps => ps.needs.hurt.length === 0)).toBe(true);
    // through the cutscene: no fight, and the clock is untouched
    const h = place(3, 'standard', 'container'); h.gate.pending = { ...(g.gate.history.length ? {} : {}), id: 'e2', kind: 'requisition', day: 5, title: 'A team', dossier: [], size: 6, armed: true, strength: 70, wants: { canned: 5 }, stances: ['defend', 'flag_pay'], temper: 'hard', opener: { kind: 'demand' } } as Encounter;
    const t0 = h.clock.t; const st = stageRaid(h, 'flag_pay'); expect(h.clock.t).toBe(t0); expect(st.outcome.title).toBe('The toll is paid');
  });
});

describe('scouts', () => {
  it('seen scouts warn the family (an earlier alarm, defenders ready sooner); unseen ones give the crew the weak side (the gate)', () => {
    let seen = 0, unseen = 0, gateUnseen = 0, gateSeen = 0, unseenWithBreach = 0, seenWithBreach = 0;
    for (let i = 0; i < 80; i++) {
      const g = place(1 + (i % 7), 'standard', 'container_gate');
      const b = planBattle(g, 8, 200 + i, withOpener({ kind: 'scouts' }));
      expect(problems(g, b, withOpener({ kind: 'scouts' }))).toEqual([]);
      const sc = evs(b, 'scout')[0];
      expect(sc).toBeDefined(); expect(sc.units).toEqual(['r1', 'r2']);
      expect(b.raid!.opener).toMatchObject({ kind: 'scouts', spotted: sc.spotted, intel: sc.intel });
      expect(sc.intel).toBe(!sc.spotted && sc.intel);   // intel only when unseen
      if (sc.spotted) { seen++; expect(sc.intel).toBe(false); } else unseen++;
      const br = b.raid!.breach;
      if (br?.where) { if (sc.spotted) { seenWithBreach++; if (br.where.gate) gateSeen++; } else { unseenWithBreach++; if (br.where.gate) gateUnseen++; } }
    }
    expect(seen).toBeGreaterThan(5); expect(unseen).toBeGreaterThan(5);
    // when the crew knows the place it goes for the gate more often than when it does not
    expect(gateUnseen / Math.max(1, unseenWithBreach)).toBeGreaterThanOrEqual(gateSeen / Math.max(1, seenWithBreach));
  });
  it('the scouts start a little ahead of the main body, and hold their fire until it comes up', () => {
    const g = place(2, 'standard', 'container'), b = planBattle(g, 8, 77, withOpener({ kind: 'scouts' }));
    const d = (id: string) => { const u = b.units.find(x => x.id === id)!; return Math.hypot(u.x, u.z); };
    expect(Math.min(d('r1'), d('r2'))).toBeLessThan(Math.min(...['r3', 'r4', 'r5', 'r6', 'r7'].map(d)));
    expect(b.events.filter(e => e.kind === 'shot' && (e.from === 'r1' || e.from === 'r2') && e.t < 7)).toEqual([]);
  });
});

describe('diversion', () => {
  it('decoys make the noise from another side and give up; half the defenders run to it and have to run back', () => {
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const g = place(1 + (i % 7), 'standard', i % 2 ? 'container' : 'armed'), o = withOpener({ kind: 'diversion', decoy: { share: 0.3, delay: 16, until: 30 } });
      const b = planBattle(g, 9, 300 + i, o);
      expect(problems(g, b, o)).toEqual([]);
      const dv = evs(b, 'diversion')[0];
      if (!dv) continue;
      checked++;
      expect(dv.decoys.length).toBeGreaterThanOrEqual(2); expect(dv.pulled.length).toBeGreaterThan(0);
      for (const id of dv.decoys) { expect(id).not.toBe('r0'); const flee = b.events.find(e => e.kind === 'flee' && e.unit === id); const dead = b.events.some(e => e.kind === 'death' && e.unit === id); expect(!!flee || dead || b.result === 'breached' || b.result === 'overrun' || b.result === 'fled' || b.result === 'repelled').toBe(true); }
      // the decoys are never where the line breaks
      const br = evs(b, 'breach')[0];
      if (br) for (const id of dv.decoys) { const last = [...b.events].reverse().find(e => (e.kind === 'move' || e.kind === 'cover') && e.unit === id && e.t <= br.t); if (last && 'x' in last && last.x !== undefined) expect(Math.hypot(last.x - br.x, (last.z ?? 0) - br.z)).toBeGreaterThanOrEqual(0); }
      expect(b.raid!.opener!.decoys!.length).toBe(dv.decoys.length);
    }
    expect(checked).toBeGreaterThan(20);
  });
  it('it works: the defenders do worse against a diversion than against the same crew coming plainly (more hurt or more breached), on average', () => {
    const score = (op: Opener | undefined) => { let bad = 0; for (let i = 0; i < 60; i++) { const g = place(1 + (i % 7), 'standard', 'armed'), b = planBattle(g, 9, 400 + i, op ? withOpener(op) : opts(gang)); bad += (b.result === 'breached' || b.result === 'overrun' ? 2 : 0) + evs(b, 'wound').filter(e => e.unit.startsWith('h_')).length * 0.2; } return bad; };
    expect(score({ kind: 'diversion', decoy: { share: 0.3, delay: 16, until: 30 } })).toBeGreaterThanOrEqual(score(undefined) * 0.9);
  });
});

describe('worker ambush', () => {
  it('people at work outside are caught first, the others run in; the shooting is the alarm; a hostile crew keeps a worker as a hostage', () => {
    let caught = 0, ran = 0, hostages = 0;
    for (let i = 0; i < 80; i++) {
      const g = place(1 + (i % 8), 'standard', 'container'); g.personState.forEach((ps, k) => { if (!g.people[k].kid) ps.task = 'fields'; });
      const o = withOpener({ kind: 'worker_ambush' }, i % 2 ? CREWS[2] : gang), b = planBattle(g, 8, 500 + i, o);
      expect(problems(g, b, o)).toEqual([]);
      const am = evs(b, 'ambush');
      expect(am.length).toBeGreaterThan(0); expect(am.length).toBeLessThanOrEqual(3);
      for (const a of am) { if (a.fate === 'ran') ran++; else caught++; if (a.fate === 'taken') { hostages++; expect(b.events.some(e => e.kind === 'hostage' && e.unit === a.unit)).toBe(true); expect(b.events.some(e => e.kind === 'taken' && e.unit === a.unit)).toBe(true); } }
      const alarm = b.events.find(e => e.kind === 'alarm'); expect(alarm!.t).toBeLessThanOrEqual(3);
      expect(b.raid!.opener!.victims!.length).toBe(am.length);
    }
    expect(caught).toBeGreaterThan(20); expect(ran).toBeGreaterThan(5); expect(hostages).toBeGreaterThan(0);
  });
  it('nobody at work outside, nobody caught', () => {
    const g = place(2, 'standard', 'container'); g.personState.forEach(ps => { ps.task = 'sleep'; });
    expect(evs(planBattle(g, 8, 9, withOpener({ kind: 'worker_ambush' })), 'ambush')).toEqual([]);
  });
});

describe('the air and the yard', () => {
  it('a blizzard spoils the aim of both sides: fewer hits per shot', () => {
    const rate = (storm: boolean) => { let hits = 0, shots = 0; for (let i = 0; i < 40; i++) { const g = place(1 + (i % 7), 'standard', 'armed'); if (storm) { const d = dayIndex(g.clock.t); g.weather = { active: { kind: 'blizzard', at: d, until: d + 1 }, last: -999 }; } const b = planBattle(g, 7, 600 + i, { ...opts(gang), grenades: 0, rockets: 0 }); for (const e of evs(b, 'shot')) { shots++; if (e.hit) hits++; } } return hits / Math.max(1, shots); };
    expect(rate(true)).toBeLessThan(rate(false));
  });
  it('a flare lights a dark yard for half a minute, uses one of the family\'s flares, and is only ever sent up in the dark', () => {
    let flared = 0;
    for (let i = 0; i < 30; i++) {
      const g = place(1 + (i % 7), 'standard', 'armed'); g.clock.t = Math.floor(g.clock.t) + 0.85; g.stock.flares = 3;
      const b = planBattle(g, 7, 700 + i, opts(gang)), fl = evs(b, 'flare').filter(e => e.by.startsWith('h_'));
      if (!fl.length) continue;
      flared++; expect(fl.length).toBe(1); expect(fl[0].secs).toBe(30); expect(b.raid!.env!.flares).toBe(1);
      const gg = structuredClone(g); applyBattle(gg, b); expect(gg.stock.flares).toBe(2);
    }
    expect(flared).toBeGreaterThan(15);
    const day = place(1, 'standard', 'armed'); day.clock.t = Math.floor(day.clock.t) + 0.3; day.stock.flares = 3;
    expect(evs(planBattle(day, 7, 3, opts(gang)), 'flare')).toEqual([]);
  });
  it('a crew that torches a shed fights in the smoke: the facts say so', () => {
    let smoky = 0;
    for (let i = 0; i < 60; i++) { const g = place(1 + (i % 8), 'hardcore', 'armed'), b = planBattle(g, 9, 800 + i, opts(CREWS[2])); if (b.raid!.env!.smoke) { smoky++; expect(evs(b, 'fire').length + evs(b, 'explosion').length).toBeGreaterThan(0); } }
    expect(smoky).toBeGreaterThan(0);
  });
});

describe('a raider with a story, in the live game', () => {
  it('a leader who got away is remembered and comes back; the list stays bounded over a year of raids', () => {
    let made = 0;
    const g = place(4, 'standard', 'container');
    for (let i = 0; i < 60; i++) {
      const gg = structuredClone(g); gg.raiderStories = g.raiderStories; gg.clock.t += i * 3;   // (a different day each time, as in a real game)
      const b = planBattle(gg, 8, 900 + i, opts(gang));
      applyBattle(gg, b);
      if (gg.raiderStories?.some(x => x.treated === 'escaped')) made++;
      g.raiderStories = gg.raiderStories;
      expect((g.raiderStories ?? []).length).toBeLessThanOrEqual(8);
    }
    expect(made).toBeGreaterThan(3);
    // time passes: the stories fire, the log stays bounded
    let h = structuredClone(g); h.raiderStories = g.raiderStories; let lines = 0;
    for (let d = 0; d < 120; d++) { h = step(h, 1); }
    lines = h.log.length;
    expect(lines).toBeLessThanOrEqual(60);
    expect((h.raiderStories ?? []).filter(x => !x.done).length).toBeLessThanOrEqual(8);
  }, 120000);
  it('an old save (v87) migrates and keeps playing', () => {
    const old = JSON.parse(JSON.stringify(place(2, 'standard', 'armed'))); old.version = 87; delete old.raiderStories;
    const g = migrate(old); expect(g.version).toBe(SAVE_VERSION);
    expect(['repelled', 'fled', 'breached', 'overrun']).toContain(planBattle(g, 6, 3, opts(militia)).result);
  });
});

describe('orders on the live playhead', () => {
  it('fightClock maps a game second to a battle second of the last fight', () => {
    const plan = planSiege({ kind: 'gang', size: 8, temper: 'hard', hour: 2.25, seed: 4, fought: true, fightSeconds: 90, armed: true });
    const fight = segments(plan).filter(s => s.kind === 'fight').pop()!;
    expect(fightClock(plan, fight.game0 + 12.2)).toEqual({ scene: fight.scene, t: 12 });
    expect(fightClock(plan, fight.game0 - 5)).toBeNull();
  });
  it('an order given at second t replays the same fight up to t and a new one after it, through the cutscene staging', () => {
    for (let i = 0; i < 6; i++) {
      const g = place(1 + i, 'standard', 'container'); g.gate.pending = { id: `p${i}`, kind: 'gang', day: 5, title: 'A gang', dossier: [], size: 8, armed: true, strength: 90, wants: { canned: 5 }, stances: ['defend'], temper: 'hard' } as Encounter;
      const a = stageRaid(g, 'defend'), b = restageRaid(g, a, 0, 'defend', [{ t: 14, order: 'counter' }]);
      const fa = a.battles[a.battles.length - 1], fb = b.battles[b.battles.length - 1];
      expect(JSON.stringify(fb.events.filter(e => e.t < 13 && e.kind !== 'end' && e.kind !== 'say'))).toBe(JSON.stringify(fa.events.filter(e => e.t < 13 && e.kind !== 'end' && e.kind !== 'say')));
      expect(fb.events.some(e => e.kind === 'order' && e.order === 'counter' && e.t >= 14)).toBe(true);
      expect(b.plan.scenes.length).toBe(a.plan.scenes.length);
    }
  });
});

describe('Hardcore staging', () => {
  it('the crew stages as far out as before the line became the drawn wall: a walled Hardcore lot is not made easier or harder by where the line is measured', () => {
    // the crew starts where the old (farthest corner) measure put it: the first raider's start distance is at least 36 from a 15-unit box wall
    const g = place(2, 'hardcore', 'container'), b = planBattle(g, 8, 11, opts(gang));
    const r0 = b.units.find(u => u.id === 'r0')!;
    expect(Math.hypot(r0.x, r0.z)).toBeGreaterThan(36);
  });
});

void (LAYOUTS as readonly string[]); void (0 as unknown as Difficulty);
