/**
 * The road post as a roster duty (sim/roadPost.ts): the named crew and the greeter are tied up as the duty `post`, shown in the schedule
 * grid and on the compound board; delivery trucks lose time at a block and neighbors never do; and under the wave clock a roving crew's mark
 * brings a probe-style crew that neither adds a raid nor grows a wave.
 */
import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { dutyAt, DUTY, canDo, autoPlan } from './daily';
import { buildBlock, postDay, roadOf, passStep, type Pass } from './roadPassers';
import { onPost, postHour, roadPostLine, truckHold, HOLD_DAYS, postNeed } from './roadPost';
import { prepare } from './roadWarn';
import { compoundBoard } from './compoundBoard';
import { gateDay } from './encounters';
import { deliverOrders } from './economy';
import { step } from './engine';

const atHour = (g: GameState, h: number): void => { g.clock.t = Math.floor(g.clock.t) + ((h - 6 + 24) % 24) / 24; };
const world = (seed = 3): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'standard' });
  g.clock.t = g.disaster.hitAt + 30;
  g.disaster.phase = 'survival';
  g.stock.lumber = 30; g.stock.hardware = 10;
  return g;
};
const adults = (g: GameState) => g.people.filter(p => !p.kid);

describe('the crew is a roster duty', () => {
  it('a checkpoint names two adults, a barrier one; they are on `post` in the day and not at night', () => {
    const g = world(); autoPlan(g, { build: true, fell: false });
    expect(buildBlock(g, 'checkpoint')).toBeNull();
    const crew = g.road!.block!.crew;
    expect(crew.length).toBe(postNeed('checkpoint'));
    const [a, b] = [g.people.find(p => p.id === crew[0])!, g.people.find(p => p.id === crew[1])!];
    for (const h of [8, 12, 16]) { expect(dutyAt(g, a, h)).toBe('post'); expect(dutyAt(g, b, h)).toBe('post'); }
    for (const h of [3, 7, 17, 22]) expect(dutyAt(g, a, h)).not.toBe('post');
    const other = g.people.find(p => !crew.includes(p.id))!;
    expect(dutyAt(g, other, 12)).not.toBe('post');
    expect(postHour(8)).toBe(true); expect(postHour(17)).toBe(false);
    expect(onPost(g, a.id, 12)).toBe('block'); expect(onPost(g, a.id, 20)).toBeNull();
    // the planner never hands it out and the player cannot brush it
    expect(canDo(a, 'post')).toBe(false);
    expect(DUTY.post.work).toBe(true);
  });
  it('the crew do the duty in the sim step: their task reads as the watch at the drive while on post', async () => {
    const g = world(); g.money = 5000;
    buildBlock(g, 'barrier'); atHour(g, 11);
    const id = g.road!.block!.crew[0];
    const next = step(g, 0.05);
    const ps = next.personState.find(p => p.id === id)!;
    expect(['watch', 'idle', 'leisure']).toContain(ps.task);
  });
  it('a greeter is on post from the moment they go down until the card is answered', () => {
    const g = world();
    g.gate.incoming = { e: { id: 'e1', kind: 'arrival', day: 1, title: 'x', dossier: [], size: 3, armed: false, strength: 0, stances: ['take_in'] } as never, at: g.clock.t + 0.1, from: g.clock.t - 0.05, seen: g.clock.t };
    expect(prepare(g, 'greeter')).toBeNull();
    const pid = g.road!.prep!.pid!, p = g.people.find(x => x.id === pid)!;
    for (const h of [2, 11, 23]) expect(dutyAt(g, p, h)).toBe('post');
    g.gate.incoming = null; g.gate.pending = null;
    // (roadWarnStep clears it; the post ends with it)
    delete g.road!.prep;
    expect(dutyAt(g, p, 11)).not.toBe('post');
  });
  it('a greeter is never someone already on the block crew in the day', () => {
    const g = world(); buildBlock(g, 'barrier'); atHour(g, 11);
    g.gate.incoming = { e: { id: 'e1', kind: 'arrival', day: 1, title: 'x', dossier: [], size: 3, armed: false, strength: 0, stances: ['take_in'] } as never, at: g.clock.t + 0.1, from: g.clock.t - 0.05, seen: g.clock.t };
    const crew = g.road!.block!.crew;
    if (adults(g).length > crew.length) { prepare(g, 'greeter'); expect(crew).not.toContain(g.road!.prep!.pid); }
  });
});

describe('crew changes and the board', () => {
  it('a hurt crew member is replaced the next morning; short-handed, the pole stays down and the manned check fails', () => {
    const g = world(); buildBlock(g, 'checkpoint'); atHour(g, 11);
    const crew0 = [...g.road!.block!.crew];
    const ps = g.personState.find(p => p.id === crew0[0])!;
    ps.needs.health = 10;
    postDay(g);
    const crew1 = g.road!.block!.crew;
    if (adults(g).length > 2) expect(crew1).not.toContain(crew0[0]);
    for (const x of g.personState) x.needs.died = 1;
    postDay(g);
    expect(g.log.some(l => /Nobody to man/.test(l.text))).toBe(true);
  });
  it('the compound board says who is at the drive, and why the pole is down', () => {
    const g = world(); buildBlock(g, 'checkpoint');
    atHour(g, 11);
    const day = compoundBoard(g);
    expect(day.threats.some(t => t.id === 'roadpost' && /checkpoint until 5 PM/.test(t.text))).toBe(true);
    atHour(g, 21);
    expect(roadPostLine(g)).toMatch(/unmanned until 8 AM/);
    delete g.road;
    expect(roadPostLine(g)).toBeNull();
    expect(compoundBoard(g).threats.some(t => t.id === 'roadpost')).toBe(false);
  });
  it('outside the posted hours a block only slows a vehicle: a crew that comes at night is not turned back', () => {
    let turned = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = world(seed); buildBlock(g, 'barrier'); atHour(g, 22);
      const p: Pass = { id: 'n1', at: g.clock.t - 0.001, party: { id: 'n1', cls: 'wanderers', dir: 1, speed: 1, members: [{ kind: 'walker', gap: 0, lat: 0, tint: 0.5, riders: 0, loaded: false }], lights: false, heads: 3 } };
      roadOf(g).passes = [p];
      passStep(g);
      if (p.fate === 'turned') turned++;
    }
    expect(turned).toBe(0);
  });
});

describe('delivery trucks and neighbors', () => {
  const order = (g: GameState, due: number) => { g.orders.push({ id: 'o1', lines: [{ material: 'lumber', qty: 5 }], cost: 10, placedAt: 0, dueAt: due, status: 'ordered' }); return g.orders[g.orders.length - 1]; };
  it('no block, no delay; a block holds the truck once, longest when nobody mans it; deliveries still arrive', () => {
    const g = world(); const o = order(g, g.clock.t - 0.1);
    deliverOrders(g); expect(o.status).toBe('delivered');
    const h = world(); buildBlock(h, 'checkpoint'); atHour(h, 11);
    const o2 = order(h, h.clock.t - 0.01);
    deliverOrders(h);
    expect(o2.status).toBe('ordered'); expect(o2.held).toBe(true);
    expect(o2.dueAt).toBeCloseTo(h.clock.t + HOLD_DAYS.checkpoint, 5);
    h.clock.t = o2.dueAt + 0.001; deliverOrders(h); expect(o2.status).toBe('delivered');
    const u = world(); buildBlock(u, 'barrier'); atHour(u, 22);
    expect(truckHold(u, {})).toBe(HOLD_DAYS.unmanned);
    expect(truckHold(u, { held: true })).toBe(0);
  });
  it('neighbors and their visits are never stopped: a neighbor card held on the road still reaches the gate', () => {
    const g = world(); buildBlock(g, 'checkpoint'); atHour(g, 11);
    const e = { id: 'n9', kind: 'neighbor_help', day: dayIndex(g.clock.t), title: 'A neighbor comes by', dossier: [], size: 2, armed: false, strength: 0, stances: ['trade'] } as never;
    g.gate.incoming = { e, at: g.clock.t + 0.01, from: g.clock.t - 0.05 };
    for (let i = 0; i < 6; i++) { g.clock.t += 0.25 / 24; }
    expect(g.gate.incoming).not.toBeNull();   // nothing in the road code touches it
    expect(g.road!.block!.turned).toBe(0);
  });
});

describe('a mark under the wave clock', () => {
  function waved(seed: number): GameState {
    const g = world(seed);
    g.disaster.tracks.law = 0.1;
    g.gate.waves = { n: 0, last: dayIndex(g.clock.t) + 300 };   // the next wave is far off
    g.gate.next = dayIndex(g.clock.t);
    roadOf(g).mark = { kind: 'looters', size: 5, until: dayIndex(g.clock.t) + 5, line: 'The crew that slowed at your drive has come back. They counted the windows.' };
    return g;
  }
  it('brings two or three men who look the place over: no follow-up crew, the wave count unchanged, the mark spent', () => {
    let probes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = waved(seed); g.gate.day = -1;
      const e = gateDay(g);
      if (e && e.title === 'Men who looked you over') {
        probes++;
        expect(e.size).toBeGreaterThanOrEqual(2); expect(e.size).toBeLessThanOrEqual(4);
        expect(e.probe).toBeUndefined();
        expect(g.gate.waves!.n).toBe(0);
        expect(g.gate.comeBack ?? null).toBeNull();
        expect(g.road!.mark).toBeNull();
        expect(e.dossier.length).toBeGreaterThan(1);
      }
    }
    expect(probes).toBeGreaterThan(0);
  });
});
