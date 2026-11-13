import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure, blockedReason } from './construction';
import { BLUEPRINTS } from './blueprints';
import { MATERIAL_IDS, MATERIALS, emptyStock } from './materials';
import { PERIMETER_ORDER, planRun } from './perimeter';
import { plansNeedLines } from './guidance';
import { suggestions } from './guidance';
import { compoundBoard } from './compoundBoard';
import { operational } from './operational';
import { missLines, noteStalls, stuckRows, stallsDay, stuckProject, stuckShort, waiters, STALL_DAYS, ESCALATE_DAYS } from './stalls';
import { migrate } from './save/migrations';
import type { Fix } from './improvements';

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const fresh = (seed = 3): GameState => { const g = newGame(seed); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = []; return g; };

/** A random mid-game: projects of every kind, in every stage, with a stockpile that covers some of it. */
function randomGame(seed: number): GameState {
  const r = rng(seed), g = fresh(seed % 50 + 1);
  const kinds = Object.keys(BLUEPRINTS);
  for (let i = 0; i < 2 + Math.floor(r() * 6); i++) {
    const st = planStructure(g, kinds[Math.floor(r() * kinds.length)], i * 3, 0, 0);
    st.stage = Math.floor(r() * BLUEPRINTS[st.kind].stages.length);
    st.supplied = r() < 0.3;
    if (r() < 0.3) st.roofLost = true;
    if (r() < 0.4) { st.finishedAt = 0; st.stage = BLUEPRINTS[st.kind].stages.length; st.supplied = false;
      const parts = ['roof', 'wiring', 'plumbing', 'glass', 'film'] as const;
      const f: Fix = { part: parts[Math.floor(r() * parts.length)], cond: r() < 0.5 ? 'fair' : 'poor', done: 0, hours: 10, supplied: r() < 0.3 };
      st.fixes = [f]; }
  }
  for (let i = 0; i < Math.floor(r() * 3); i++) {
    const run = planRun(g, PERIMETER_ORDER[Math.floor(r() * PERIMETER_ORDER.length)], [[0, 10 + i], [6 + Math.floor(r() * 8), 10 + i]], [], 0, true);
    run.supplied = r() < 0.3;
  }
  const done = g.structures.filter(x => x.finishedAt !== null);
  for (const st of done) if (r() < 0.5) g.utilities.fittings.push({ building: st.id, kind: r() < 0.5 ? 'plumb' : 'wire', done: 0, hours: 5, supplied: r() < 0.3, finishedAt: null });
  for (const k of MATERIAL_IDS) if (r() < 0.25) g.stock[k] = Math.floor(r() * 6) + r();
  if (r() < 0.5) g.orders.push({ id: 'o1', lines: [{ material: 'lumber', qty: 5 }, { material: 'roofing', qty: 2 }], cost: 0, placedAt: 0, dueAt: 9, status: 'ordered' });
  return g;
}

describe('the order button covers every wait', () => {
  it('property: after the plans order lands, no project lacks anything that is for sale', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = randomGame(seed);
      for (const o of g.orders) for (const l of o.lines) g.stock[l.material] += l.qty;   // what is on the way arrives
      g.orders = [];
      for (const l of plansNeedLines(g)) g.stock[l.material] += l.qty;
      for (const w of waiters(g)) {
        const buyable = Object.keys(w.miss).filter(k => MATERIALS[k as keyof typeof MATERIALS].price !== null);
        expect(buyable, `seed ${seed}: ${w.key} still lacks ${buyable.join(', ')}`).toEqual([]);
      }
    }
  });
  it('property: each waiting project\'s own order lines fit inside the plans order', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = randomGame(seed), all = Object.fromEntries(plansNeedLines(g).map(l => [l.material, l.qty]));
      for (const w of waiters(g)) for (const l of missLines(g, w.miss)) expect(all[l.material] ?? 0, `seed ${seed}: ${w.key} ${l.material}`).toBeGreaterThanOrEqual(l.qty);
    }
  });
  it('a repair job and a plumbing kit count as needs', () => {
    const g = fresh();
    const st = planStructure(g, 'trailer', 0, 0, 0); st.finishedAt = 0; st.stage = BLUEPRINTS.trailer.stages.length;
    st.fixes = [{ part: 'plumbing', cond: 'fair', done: 0, hours: 20, supplied: false }];
    expect(plansNeedLines(g).map(l => l.material).sort()).toEqual(['hardware', 'pipe']);
  });
});

describe('a stuck project is loud', () => {
  const roofless = () => {
    const g = fresh(), st = planStructure(g, 'trailer', 0, 0, 0);
    const roof = BLUEPRINTS.trailer.stages.findIndex(x => x.id === 'roof');
    st.stage = roof; st.roofLost = true; g.money = 300000;
    return { g, st };
  };
  it('says nothing before the limit, then raises the card, the board line and a log line with one order that unblocks it', () => {
    const { g, st } = roofless();
    expect(blockedReason(g, st)).toMatch(/^Waiting for/);
    noteStalls(g);
    expect(stuckProject(g)).toBeNull();
    g.clock.t += STALL_DAYS + 0.5;
    const lines = stallsDay(g);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/days waiting on/);
    expect(stallsDay(g)).toEqual([]);   // said once
    const stuck = stuckProject(g)!;
    expect(stuck).not.toBeNull();
    expect(suggestions(g, 3)[0].id).toBe('stalled');
    expect(suggestions(g, 3)[0].acts![0].act).toEqual({ type: 'order', lines: stuck.lines });
    expect(compoundBoard(g).decisions[0].id).toBe('stalled');
    expect(operational(g)[0].act!.act).toEqual({ type: 'order', lines: stuck.lines });
    for (const l of stuck.lines) g.stock[l.material] += l.qty;
    expect(blockedReason(g, st)).toBeNull();
  });
  it('keeps quiet when the money is not there, or the order is already on the way', () => {
    const { g } = roofless();
    noteStalls(g); g.clock.t += 10; g.money = 5;
    expect(stuckProject(g)).toBeNull();
    g.money = 300000;
    g.orders.push({ id: 'o9', lines: plansNeedLines(g), cost: 0, placedAt: 0, dueAt: 20, status: 'ordered' });
    expect(stuckProject(g)).toBeNull();
  });
  it('forgets a project once it no longer waits', () => {
    const { g, st } = roofless();
    noteStalls(g); expect(Object.keys(g.stalls!)).toHaveLength(1);
    st.supplied = true;
    noteStalls(g); g.clock.t += 2; noteStalls(g); expect(g.stalls).toEqual({});   // (a wait is forgotten two days after it ends)
  });
  it('save v82 -> v83 adds the clock', () => {
    const raw = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown> & { version: number };
    raw.version = 82; delete raw.stalls;
    expect(migrate(raw).stalls).toEqual({});
  });
});

describe('the Water tick is honest', () => {
  it('stays off while the home has no running water, even with a well standing', () => {
    const g = fresh();
    for (const [k, x] of [['trailer', 0], ['well_drilled', 4]] as const) { const st = planStructure(g, k, x, 0, 0); st.finishedAt = 0; st.stage = BLUEPRINTS[k].stages.length; }
    const row = operational(g).find(o => o.id === 'water')!;
    expect(row.done).toBe(false);
    expect(row.line).toMatch(/no running water|no power/i);
  });
});

describe('stalls: roadside piles, pre-built repairs, escalation', () => {
  it('a delivery left at the road counts as on the way: no second bill, no false stuck card', () => {
    const g = fresh(), st = planStructure(g, 'trailer', 0, 0, 0);
    st.stage = BLUEPRINTS.trailer.stages.findIndex(x => x.id === 'roof'); st.roofLost = true; g.money = 300000;
    const lines = plansNeedLines(g);
    expect(lines.length).toBeGreaterThan(0);
    g.roadside = [{ lines: lines.map(l => ({ ...l })), hours: 12, done: 3 }];
    expect(plansNeedLines(g)).toEqual([]);
    noteStalls(g); g.clock.t += 10;
    expect(stuckProject(g)).toBeNull();
  });
  it('property: a pre-built farmhouse with repair jobs, roadside piles and orders on the way: the plans order covers every wait', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed * 7 + 1), g = fresh(seed % 50 + 1);
      const parts = ['roof', 'wiring', 'plumbing', 'glass', 'film'] as const;
      const house = planStructure(g, 'farmhouse', 0, 0, 0);
      house.pre = true; house.finishedAt = 0; house.stage = BLUEPRINTS.farmhouse.stages.length; house.supplied = true;
      house.fixes = parts.filter(() => r() < 0.6).map(p => ({ part: p, cond: r() < 0.5 ? 'fair' as const : 'poor' as const, done: 0, hours: 20, supplied: r() < 0.2 }));
      if (r() < 0.5) planStructure(g, 'log_house', 12, 0, 0);
      for (const k of MATERIAL_IDS) if (r() < 0.2) g.stock[k] = Math.floor(r() * 4);
      if (r() < 0.5) g.roadside = [{ lines: [{ material: 'roofing', qty: 5 }, { material: 'hardware', qty: 2 }], hours: 6, done: 0 }];
      if (r() < 0.4) g.orders.push({ id: 'o1', lines: [{ material: 'cable', qty: 3 }], cost: 0, placedAt: 0, dueAt: 9, status: 'ordered' });
      for (const l of plansNeedLines(g)) g.stock[l.material] += l.qty;
      for (const x of g.roadside) for (const l of x.lines) g.stock[l.material] += l.qty;
      for (const o of g.orders) for (const l of o.lines) g.stock[l.material] += l.qty;
      for (const w of waiters(g)) {
        const buyable = Object.keys(w.miss).filter(k => MATERIALS[k as keyof typeof MATERIALS].price !== null);
        expect(buyable, `seed ${seed}: ${w.key}`).toEqual([]);
      }
    }
  });
  it('a stall older than two weeks with cash escalates: alarm card first, STUCK board line, a second log line', () => {
    const g = fresh(), st = planStructure(g, 'trailer', 0, 0, 0);
    st.stage = BLUEPRINTS.trailer.stages.findIndex(x => x.id === 'roof'); st.roofLost = true; g.money = 300000;
    noteStalls(g); g.clock.t += STALL_DAYS + 0.5;
    expect(stuckProject(g)!.escalated).toBe(false);
    expect(suggestions(g, 3)[0].tone).toBeUndefined();
    g.clock.t += ESCALATE_DAYS;
    const s = stuckProject(g)!;
    expect(s.escalated).toBe(true);
    const top = suggestions(g, 3)[0];
    expect(top.id).toBe('stalled'); expect(top.tone).toBe('alarm'); expect(top.title).toMatch(/^Stuck for \d+ days/);
    expect(compoundBoard(g).decisions[0].text).toMatch(/^STUCK:/);
    expect(stuckShort(s)).toMatch(/^Order it, \$[\d,]+$/);
  });
  it('the day it crosses two weeks the log says so once', () => {
    const g = fresh(), st = planStructure(g, 'trailer', 0, 0, 0);
    st.stage = BLUEPRINTS.trailer.stages.findIndex(x => x.id === 'roof'); st.roofLost = true; g.money = 300000;
    noteStalls(g);
    g.clock.t = ESCALATE_DAYS + 0.2;
    expect(stallsDay(g).some(l => l.startsWith('STILL STUCK'))).toBe(true);
    g.clock.t = ESCALATE_DAYS + 1.2;
    expect(stallsDay(g).some(l => l.startsWith('STILL STUCK'))).toBe(false);
  });
});

describe('waiting on logs (not for sale)', () => {
  const logHouse = (): GameState => {
    const g = fresh(5);
    const st = planStructure(g, 'log_house', 0, 0, 0);
    st.stage = 2; st.supplied = false;   // the foundation is in; the walls want 40 logs
    g.stock.lumber = 999; g.stock.concrete = 999; g.money = 600_000;
    return g;
  };
  it('a Next-steps card says "Mark trees for logs" with a one-click mark that carries the shortfall', async () => {
    const g = logHouse();
    const { logWait } = await import('./stalls');
    const w = logWait(g)!;
    expect(w.short).toBeGreaterThan(0);
    expect(w.need).toBe(w.short);
    const card = suggestions(g, 12).find(x => x.id === 'logs')!;
    expect(card.title).toMatch(/^Mark trees for logs/);
    const act = card.acts![0].act;
    expect(act.type).toBe('markTrees');
    if (act.type === 'markTrees') expect(act.logs).toBe(w.need);
  });
  it('once enough pines are marked the card changes to a waiting note, and a crew is named as idle', async () => {
    const g = logHouse();
    const { markTree } = await import('./forestry');
    for (let i = 0; i < 20; i++) markTree(g, { id: i + 1, x: 4, z: 4, kind: 'conifer', scale: 1 }, 3);
    g.clock.t = 10;
    g.stalls = { ['s:' + g.structures[0].id]: { since: 0 } };
    g.crews = [{ target: g.structures[0].id } as never];
    const card = suggestions(g, 12).find(x => x.id === 'logs')!;
    expect(card.title).toMatch(/marked trees are being felled/);
    expect(card.tone).toBe('alarm');
    expect(card.why).toMatch(/crew stands idle/);
  });
  it('no crew nudge while the walls wait on logs', async () => {
    const { crewNudge } = await import('./crewNudge');
    const g = logHouse();
    expect(crewNudge(g)).toBeNull();
  });
  it('the starter proposes a log house only when the land has the logs', async () => {
    const { homeKinds, planStarter } = await import('./starterCompound');
    expect(homeKinds(6, false)).toEqual(['timber_cabin', 'cottage']);
    expect(homeKinds(6)).toEqual(['log_house']);
    const g = newGame(7);
    g.people = g.people.slice(0, 1);
    while (g.people.length < 6) g.people.push({ ...g.people[0], id: 'x' + g.people.length });
    const h = g.site.home;
    const query = { height: () => 0, owned: (x: number, z: number) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1, water: () => false };
    const geo = { center: [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2] as [number, number], drive: [] as Array<[number, number]> };
    const none = planStarter(g, { query, geo });
    expect(none.pieces.some(p => p.kind === 'log_house')).toBe(false);
    const pines = Array.from({ length: 30 }, () => ({ kind: 'conifer' as const, scale: 1 }));
    const some = planStarter(g, { query, geo, trees: pines });
    expect(some.pieces.some(p => p.kind === 'log_house')).toBe(true);
    const cottonwoods = Array.from({ length: 60 }, () => ({ kind: 'broad' as const, scale: 1 }));
    expect(planStarter(g, { query, geo, trees: cottonwoods }).pieces.some(p => p.kind === 'log_house')).toBe(false);
  });
});

describe('food, beds and medicine escalate like a stuck project', () => {
  const sick = (): GameState => {
    const g = fresh(9);
    g.people[0].conditions = ['blood_pressure'];
    g.body.rx[g.people[0].id] = 0;
    g.stock.meds = 0;
    return g;
  };
  it('a person out of pills gets a Next-steps card, red with the days after three days', async () => {
    const g = sick();
    const { rxDaysOf } = await import('./body');
    expect(rxDaysOf(g, g.people[0])).toBe(0);
    g.clock.t = 1;
    noteStalls(g);
    let card = suggestions(g, 12).find(x => x.id === 'rx_out')!;
    expect(card.title).toMatch(/out of medicine/);
    expect(card.tone).toBeUndefined();
    g.clock.t = 6;
    noteStalls(g);
    card = suggestions(g, 12).find(x => x.id === 'rx_out')!;
    expect(card.title).toMatch(/Out of medicine for 5 days/);
    expect(card.tone).toBe('alarm');
    const lines = stallsDay(g);
    expect(lines.some(l => /out of their medicine for 5 days/.test(l))).toBe(true);
    expect(stallsDay(g).some(l => /out of their medicine/.test(l))).toBe(false);   // said once
  });
  it('the Board row and the Family tab read the same pills', async () => {
    const { runway } = await import('./runway');
    const g = sick();
    g.clock.t = 5;
    g.body.rx[g.people[0].id] = 29;
    const row = runway(g).find(r => r.id === 'medicine')!;
    expect(row.value).toMatch(/pills 29 days/);
    g.body.rx[g.people[0].id] = 0;
    const out = runway(g).find(r => r.id === 'medicine')!;
    expect(out.value).toMatch(/out of pills/);
    expect(out.tone).toBe('bad');
  });
});

describe('the Projects tab lists what is stuck', () => {
  it('a repair on a house that came with the land that waits for materials is listed, with the order that unblocks it', () => {
    const g = fresh();
    const st = planStructure(g, 'farmhouse', 0, 0, 0)!; st.pre = true; st.finishedAt = 0; st.stage = BLUEPRINTS.farmhouse.stages.length;
    st.fixes = [{ part: 'roof', cond: 'poor', done: 0, hours: 40, supplied: false }];
    g.money = 300_000;
    noteStalls(g);
    expect(stuckRows(g)).toEqual([]);   // not yet
    g.clock.t += 32;
    const rows = stuckRows(g);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ at: st.id, days: 32 });
    expect(rows[0].label).toMatch(/roof repair/);
    expect(rows[0].lines).toEqual(stuckProject(g)!.lines);   // the same order the Next-steps card offers
    expect(rows[0].cost).toBeGreaterThan(0);
  });
  it('keeps a wait the cash cannot fix (no order offered)', () => {
    const g = fresh();
    const st = planStructure(g, 'farmhouse', 0, 0, 0)!; st.pre = true; st.finishedAt = 0; st.stage = BLUEPRINTS.farmhouse.stages.length;
    st.fixes = [{ part: 'roof', cond: 'poor', done: 0, hours: 40, supplied: false }];
    g.money = 5; noteStalls(g); g.clock.t += 10;
    expect(stuckProject(g)).toBeNull();
    expect(stuckRows(g)[0].lines).toBeNull();
  });
});
