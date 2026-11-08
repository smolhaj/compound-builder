/**
 * The raid sim in the LIVE game path: every number the cutscene and the aftermath read comes out of `planBattle` / `resolve` / `stageRaid` in a real
 * game state, for any seed, crew, layout and difficulty (user requirement: not only in recorded movies). Also the fuzz and long-run guards:
 * thousands of random raids and a year of days with raids, none throwing, state bounded, time bounded. Timings are printed.
 */
import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION } from './state';
import { PERIMETER, WEAKEST_WALL, withKnownWalls } from './perimeter';
import { applyBattle, planBattle, type BattleOptions, type PlannedBattle } from './battle';
import { resolve, type Encounter } from './encounters';
import { stageRaid } from './raidCutscene';
import { step } from './engine';
import { migrate } from './save/migrations';
import { mulberry32 } from './rng';
import type { Difficulty } from './difficulty';

import { LAYOUTS, CREWS, place, opts, problems, type Layout } from './raidTestKit';

describe('the raid sim in the live path', () => {
  it('every field the cutscene and the aftermath read comes out consistent: all layouts, crews, difficulties, seeds', () => {
    const all: string[] = [], t0 = performance.now(), ms: number[] = [];
    const stats = { n: 0, breaches: 0, ram: 0, charge: 0, climb: 0, failedRam: 0, failedCharge: 0, beaten: 0, tribute: 0, passage: 0, fires: 0, loot: 0, hostages: 0, spared: 0, hid: 0, orders: 0, snaps: 0, gate: 0, results: { repelled: 0, fled: 0, breached: 0, overrun: 0 } as Record<string, number> };
    let i = 0;
    for (const diff of ['cozy', 'standard', 'hardcore'] as Difficulty[]) for (const layout of LAYOUTS) for (const crew of CREWS) for (let k = 0; k < 4; k++, i++) {
      const g = place(1 + (i % 9), diff, layout), o = opts(crew);
      const withOrders: BattleOptions = i % 5 === 0 ? { ...o, orders: [{ t: 0, order: 'fallback' }] } : i % 7 === 0 ? { ...o, orders: [{ t: 12, order: 'counter' }] } : o;
      const a = performance.now();
      const b = planBattle(g, crew.n, 100 + i, withOrders);
      ms.push(performance.now() - a);
      const bad = problems(g, b, withOrders);
      if (bad.length) all.push(`${diff}/${layout}/${crew.kind}-${crew.temper}/#${i}: ${bad.join('; ')}`);
      // and written into the game it does not break it
      const gg = structuredClone(g);
      const lines = applyBattle(gg, b);
      for (const [key, v] of Object.entries(gg.stock)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) all.push(`${diff}/${layout}/#${i}: stock ${key} = ${v}`);
      if (!Array.isArray(lines)) all.push('applyBattle returned no lines');
      const r = b.raid!; stats.n++; stats.results[b.result]++;
      if (r.breach) { stats.breaches++; stats[r.breach.method]++; if (r.breach.where?.gate) stats.gate++; for (const at of r.breach.attempts) if (!at.ok) { if (at.how === 'ram') stats.failedRam++; else stats.failedCharge++; } }
      if (r.beatenBack) stats.beaten++;
      if (r.ending?.kind === 'tribute') stats.tribute++; if (r.ending?.kind === 'passage') stats.passage++;
      stats.fires += r.fires.length; stats.loot += r.loot.length; stats.hostages += r.hostages.length; stats.spared += r.loss.people.spared; stats.snaps += r.snaps.length; stats.orders += r.orders.length;
      stats.hid += (b.fates ?? []).filter(f => f.fate === 'hid').length;
    }
    ms.sort((a, b) => a - b);
    const total = performance.now() - t0;
    console.log(`raidLive: ${stats.n} raids in ${(total / 1000).toFixed(1)} s; planBattle median ${ms[Math.floor(ms.length / 2)].toFixed(1)} ms, p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(1)} ms, max ${ms[ms.length - 1].toFixed(1)} ms`, JSON.stringify(stats));
    expect(all.slice(0, 12)).toEqual([]);
    // the new mechanics really happen in live fights (not only in unit tests)
    expect(stats.ram + stats.charge).toBeGreaterThan(5);
    expect(stats.failedRam + stats.failedCharge).toBeGreaterThan(0);
    expect(stats.climb).toBeGreaterThan(5);
    expect(stats.fires).toBeGreaterThan(0); expect(stats.loot).toBeGreaterThan(20); expect(stats.hostages).toBeGreaterThan(0);
    expect(ms[Math.floor(ms.length / 2)]).toBeLessThan(150);
  }, 240000);

  it('the same raid in the same state plays the same (the seeded stream is the only source)', () => {
    const a = planBattle(place(3, 'hardcore', 'container_gate'), 9, 77, opts(CREWS[1])), b = planBattle(place(3, 'hardcore', 'container_gate'), 9, 77, opts(CREWS[1]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('counters work in live fights: bollards, a reinforced gate, an anti-vehicle ditch and a hard wall cut the successful rams; the driver shot first stops the truck', () => {
    const run = (layout: Layout, diff: Difficulty = 'hardcore') => {
      let ok = 0, tried = 0, driverDown = 0, bol = 0;
      for (let s = 0; s < 80; s++) {
        const g = place(1 + (s % 7), diff, layout), b = planBattle(g, 8, 500 + s, { temper: 'hard', kind: 'gang', organized: true, means: { truck: true, satchels: 0 } });
        for (const at of b.raid!.breach?.attempts ?? []) if (at.how === 'ram') { tried++; if (at.ok) ok++; if (at.why === 'driver_down') driverDown++; if (at.why === 'bollards') bol++; }
      }
      return { ok, tried, driverDown, bol };
    };
    const chain = run('chain'), container = run('container'), conc = run('concrete_bollards'), ditch = run('ditch_wall'), tower = run('palisade_tower');
    expect(chain.tried).toBeGreaterThan(40);
    expect(chain.ok / chain.tried).toBeGreaterThan(container.ok / Math.max(1, container.tried));
    expect(conc.ok / Math.max(1, conc.tried)).toBeLessThan(chain.ok / chain.tried);
    expect(ditch.ok).toBe(0);
    expect(chain.driverDown + container.driverDown + tower.driverDown).toBeGreaterThan(0);
  }, 120000);

  it('Standard is more forgiving than Hardcore against the same truck and the same wall', () => {
    const rate = (diff: Difficulty) => { let ok = 0, t = 0; for (let s = 0; s < 70; s++) { const b = planBattle(place(1 + (s % 7), diff, 'chain'), 8, 900 + s, { temper: 'hard', kind: 'gang', organized: true, means: { truck: true, satchels: 0 } }); for (const a of b.raid!.breach?.attempts ?? []) { t++; if (a.ok) ok++; } } return ok / Math.max(1, t); };
    expect(rate('standard')).toBeLessThan(rate('hardcore'));
  }, 120000);

  it('orders change the fight: falling back to the house costs what stood outside it and gives better cover; holding is the old fight', () => {
    let exposed = 0, stages = 0;
    for (let s = 0; s < 30; s++) {
      const g = place(1 + (s % 6), 'standard', 'container');
      const hold = planBattle(g, 6, 40 + s, opts(CREWS[0])), plain = planBattle(g, 6, 40 + s, { ...opts(CREWS[0]), orders: [{ t: 0, order: 'hold' }] });
      expect(JSON.stringify(plain.events)).toBe(JSON.stringify(hold.events));   // a hold order is no order
      const fb = planBattle(g, 6, 40 + s, { ...opts(CREWS[0]), orders: [{ t: 0, order: 'fallback' }] });
      if (fb.raid!.orders.some(o => o.order === 'fallback')) stages++;
      if (fb.raid!.stage !== 'wall') exposed++;
      expect(fb.events.some(e => e.kind === 'order')).toBe(true);
    }
    expect(stages).toBe(30); expect(exposed).toBeGreaterThan(10);
  });

  it('a timed order replays the same fight up to its second', () => {
    const g = place(2, 'standard', 'container'), base = planBattle(g, 7, 61, opts(CREWS[1])), o = planBattle(g, 7, 61, { ...opts(CREWS[1]), orders: [{ t: 20, order: 'counter' }] });
    const before = (b: PlannedBattle) => JSON.stringify(b.events.filter(e => e.t < 19 && e.kind !== 'end'));
    expect(before(o)).toBe(before(base));
  });

  it('through the cutscene (stageRaid -> resolve -> applyBattle): the report carries the facts, the outcome card says them, the clock is untouched', () => {
    let staged = 0;
    const kinds = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const g = place(1 + (s % 8), (['cozy', 'standard', 'hardcore'] as const)[s % 3], LAYOUTS[s % LAYOUTS.length]);
      const c = CREWS[s % CREWS.length];
      g.gate.pending = { id: `e${s}`, kind: c.kind, day: 5 + s, title: 'A crew', dossier: [], size: c.n, armed: c.kind !== 'horde', strength: 90, wants: { canned: 5 }, stances: ['hide', 'parley', 'defend'], temper: c.temper } as Encounter;
      const t0 = g.clock.t;
      const st = stageRaid(g, 'defend', undefined, s % 2 ? [{ t: 0, order: 'fallback' }] : undefined);
      expect(g.clock.t).toBe(t0);
      expect(g.gate.orders).toBeUndefined();
      const f = st.report.facts;
      if (st.staged.gate.battle) { expect(f).toBeDefined(); expect(f!.result).toBe(st.staged.gate.battle.raid!.result); staged++; kinds.add(f!.result); if (f!.result === 'breached' || f!.result === 'overrun') expect(st.outcome.text).toBe(f!.text); }
      expect(st.staged.gate.orders).toBeUndefined();
    }
    expect(staged).toBeGreaterThan(15); expect(kinds.size).toBeGreaterThan(1);
  }, 120000);
});

describe('degrades instead of throwing', () => {
  it('no walls, no defenders, one raider, no raiders, an odd structure kind, an old save: always a plain result', () => {
    const g = place(1, 'standard', 'bare');
    g.personState.forEach(ps => { ps.needs.died = 1; });
    for (const n of [0, 1, 2, 40]) { const b = planBattle(g, n, 5, opts(CREWS[1])); expect(['repelled', 'fled', 'breached', 'overrun']).toContain(b.result); expect(b.events[b.events.length - 1].kind).toBe('end'); }
    const empty = newGame(1); empty.structures = [];
    expect(() => planBattle(empty, 5, 3, opts(CREWS[2]))).not.toThrow();
    const odd = place(2, 'standard', 'container'); odd.perimeter.push({ id: 'weird', kind: 'chain_link', pts: [[0, 0]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
    expect(() => planBattle(odd, 6, 9, opts(CREWS[1]))).not.toThrow();
    const noRaidFields = place(3, 'standard', 'armed'); delete (noRaidFields as { raidFires?: unknown }).raidFires;
    expect(() => step(noRaidFields, 3)).not.toThrow();
  });
  it('a wall run of a kind this build does not know reads as the weakest known kind: planBattle, applyBattle, resolve and stageRaid never throw', () => {
    for (const diff of ['cozy', 'standard', 'hardcore'] as Difficulty[]) for (let k = 0; k < 6; k++) {
      const g = place(1 + k, diff, k % 2 ? 'container' : 'armed');
      g.perimeter.push({ id: 'weird', kind: 'not_a_kind' as never, pts: [[-14, 14], [14, 14]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
      g.perimeter.push({ id: 'broken', kind: 'also_unknown' as never, pts: undefined as never, gates: undefined as never, done: 1, hours: 1, supplied: true, finishedAt: 0 });
      const b = planBattle(g, 7, 30 + k, opts(CREWS[1]));
      expect(['repelled', 'fled', 'breached', 'overrun']).toContain(b.result);
      expect(() => applyBattle(structuredClone(g), b)).not.toThrow();
      g.gate.pending = { id: `w${k}`, kind: 'gang', day: 5, title: 'A crew', dossier: [], size: 8, armed: true, strength: 90, wants: { canned: 5 }, stances: ['defend'], temper: 'hard' } as Encounter;
      expect(() => stageRaid(g, 'defend')).not.toThrow();
    }
    // the weakest known kind is what it is read as
    const g = place(2, 'standard', 'armed');
    g.perimeter.push({ id: 'w', kind: 'not_a_kind' as never, pts: [[-15, 15], [15, 15]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
    expect(withKnownWalls(g).perimeter[0].kind).toBe(WEAKEST_WALL);
    const known = place(3, 'standard', 'container');
    expect(withKnownWalls(known)).toBe(known);   // all known: the same object, no copy
  });
  it('an old save (v86) migrates to the current version, with no raid fires, and plays a raid', () => {
    const old = JSON.parse(JSON.stringify(place(4, 'standard', 'container'))); old.version = 86; delete old.raidFires;
    const g = migrate(old);
    expect(g.version).toBe(SAVE_VERSION); expect(g.raidFires).toBeUndefined();
    expect(['repelled', 'fled', 'breached', 'overrun']).toContain(planBattle(g, 6, 3, opts(CREWS[0])).result);
  });
  it('a battle from before v87 (no facts, no breach method) still applies', () => {
    const g = place(5, 'standard', 'armed'), b = planBattle(g, 8, 3, opts(CREWS[1]));
    const old = JSON.parse(JSON.stringify(b)); delete old.raid; for (const e of old.events) if (e.kind === 'breach') { delete e.method; delete e.where; }
    expect(() => applyBattle(structuredClone(g), old)).not.toThrow();
  });
});

describe('long runs stay bounded', () => {
  it('thousands of random raids: none throws, state does not grow', () => {
    const r = mulberry32(99);
    let count = 0, worst = 0;
    const sizes: number[] = [];
    const g = place(7, 'hardcore', 'container_gate');
    for (let i = 0; i < 1500; i++) {
      const c = CREWS[Math.floor(r() * CREWS.length)], diff = (['cozy', 'standard', 'hardcore'] as const)[i % 3];
      g.disaster.difficulty = diff;
      const gg = i % 40 === 0 ? place(1 + (i % 9), diff, LAYOUTS[i % LAYOUTS.length]) : structuredClone(g);
      const a = performance.now();
      const b = planBattle(gg, Math.max(1, Math.round(c.n * (0.5 + r()))), Math.floor(r() * 1e6), { ...opts(c), ...(r() < 0.3 ? { orders: [{ t: Math.floor(r() * 30), order: (['hold', 'fallback', 'counter'] as const)[Math.floor(r() * 3)] }] } : {}) });
      worst = Math.max(worst, performance.now() - a); count++;
      expect(b.events.length).toBeLessThan(6000);
      sizes.push(JSON.stringify(b).length);
      applyBattle(gg, b);
    }
    console.log(`fuzz: ${count} raids, worst ${worst.toFixed(0)} ms, battle json max ${Math.max(...sizes)} bytes`);
    expect(worst).toBeLessThan(3000);
    expect(Math.max(...sizes)).toBeLessThan(600_000);
  }, 300000);

  it('a year of days with a raid every 12 days: fires, damage and the log stay bounded', () => {
    let g = place(8, 'hardcore', 'container_gate');
    const t0 = performance.now();
    const base = JSON.stringify(g).length;
    let maxFires = 0, maxDamage = 0, raids = 0;
    for (let d = 0; d < 365; d++) {
      if (d % 12 === 5) {
        const c = CREWS[(d / 12 | 0) % CREWS.length];
        g.gate.pending = { id: `e${d}`, kind: c.kind, day: Math.floor(g.clock.t), title: 'A crew', dossier: [], size: c.n, armed: true, strength: 90, wants: { canned: 5 }, stances: ['defend'], temper: c.temper } as Encounter;
        g = structuredClone(g); resolve(g, 'defend'); raids++;
      }
      g = step(g, 1);
      maxFires = Math.max(maxFires, g.raidFires?.length ?? 0); maxDamage = Math.max(maxDamage, g.raidDamage?.length ?? 0);
    }
    const grown = JSON.stringify(g).length / base;
    console.log(`year: ${raids} raids, ${((performance.now() - t0) / 1000).toFixed(1)} s, state x${grown.toFixed(2)}, max fires ${maxFires}, max damage records ${maxDamage}`);
    expect(maxFires).toBeLessThanOrEqual(8); expect(maxDamage).toBeLessThanOrEqual(40);
    expect(g.log.length).toBeLessThanOrEqual(60);
    expect(grown).toBeLessThan(4);
  }, 300000);
});

void PERIMETER;
