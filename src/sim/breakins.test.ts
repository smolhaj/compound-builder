import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { gateDay, resolve } from './encounters';
import { breakInDay, breakInRate, investigate, legalDay, plainView, responseMinutes, SHERIFF, shootingOf } from './breakins';
import { planBattle } from './battle';
import { mulberry32 } from './rng';
import { REGION_IDS } from './regions';

const g0 = (seed = 1): GameState => newGame(seed);
const withGun = (g: GameState, model = 'glock_19') => {
  g.armory.guns.push({ id: `g${g.nextId++}`, model, condition: 1, fired: 0, where: 'house', carrier: g.people[0].id });
  g.armory.ammo['9mm'] = 200;
};
const night = (g: GameState) => { g.clock.t = Math.floor(g.clock.t) + 0.85; };   // 02:24

describe('peacetime break-ins', () => {
  it('are very rare: about once in 40–60 years at an ordinary place; a talked-about one tops out near once in 10–15', () => {
    const g = g0();
    for (let i = 0; i < 12; i++) g.orders.push({ id: `o${i}`, lines: [], cost: 500, placedAt: 0, dueAt: 0, status: 'delivered' });
    const perYear = breakInRate(g);
    expect(1 / perYear).toBeGreaterThan(40);
    expect(1 / perYear).toBeLessThan(60);
    // the daily roll agrees over a long run
    for (let d = 0; d < 365 * 3000; d++) breakInDay(g, d);
    expect(g.breakins!.count / 3000).toBeGreaterThan(perYear * 0.75);
    expect(g.breakins!.count / 3000).toBeLessThan(perYear * 1.3);
    // everything showing, everyone knowing, close to town, no dog
    const loud = g0();
    for (let i = 0; i < 40; i++) loud.orders.push({ id: `o${i}`, lines: [], cost: 3000, placedAt: 0, dueAt: 0, status: 'delivered' });
    loud.armory.onBooks = 20; loud.fin.onBooks = 100_000; loud.site = { ...loud.site, miles: 0 };
    loud.breakins!.newsAt = 0;
    for (const kind of ['bunker_hatch', 'water_tower', 'solar_array']) loud.structures.push({ id: kind, kind, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    expect(1 / breakInRate(loud)).toBeGreaterThan(10);
    expect(1 / breakInRate(loud)).toBeLessThan(15);
  });

  it('most runs see none in ten years of peace', () => {
    let none = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const g = g0(seed);
      for (let i = 0; i < 12; i++) g.orders.push({ id: `o${i}`, lines: [], cost: 500, placedAt: 0, dueAt: 0, status: 'delivered' });
      for (let d = 0; d < 3650; d++) breakInDay(g, d);
      if (!g.breakins!.count) none++;
    }
    expect(none).toBeGreaterThan(70);
  });

  it('go up with visibility, down with a dog, an alarm and cameras', () => {
    const quiet = g0(), loud = g0(), dog = g0();
    for (const g of [loud]) { for (let i = 0; i < 20; i++) g.orders.push({ id: `o${i}`, lines: [], cost: 3000, placedAt: 0, dueAt: 0, status: 'delivered' }); g.armory.onBooks = 8; }
    expect(breakInRate(loud)).toBeGreaterThan(breakInRate(quiet) * 1.5);
    dog.stock.dog = 1; dog.stock.driveway_alarm = 1;
    expect(breakInRate(dog)).toBeLessThan(breakInRate(quiet) * 0.3);
  });

  it('never happen while the law is down', () => {
    const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster.tracks = { ...g.disaster.tracks, law: 0.4 };
    expect(breakInRate(g)).toBe(0);
    for (let d = 0; d < 20000; d++) expect(breakInDay(g, d)).toBeNull();
    // and gateDay never offers one either
    g.clock.t = g.disaster.hitAt + 20;
    for (let d = 0; d < 400; d++) { g.clock.t += 1; const e = gateDay(g); expect(e?.kind).not.toBe('break_in'); if (e) resolve(g, e.stances[0]); }
  });

  it('a pending night break-in comes through gateDay with the three stances', () => {
    const g = g0(5);
    for (let i = 0; i < 40; i++) g.orders.push({ id: `o${i}`, lines: [], cost: 3000, placedAt: 0, dueAt: 0, status: 'delivered' });
    let e = null;
    for (let d = 1; d < 365 * 200 && !e; d++) { g.clock.t = d + 0.01; e = gateDay(g); }
    expect(e?.kind).toBe('break_in');
    expect(e!.size).toBeGreaterThanOrEqual(1);
    expect(e!.size).toBeLessThanOrEqual(3);
    expect(e!.stances).toEqual(['call_911', 'shout', 'confront']);
    const out = resolve(g, 'call_911');
    expect(out.lines.join(' ')).toMatch(/deput/i);
  });

  it('911 response time comes out by region: 15–45 minutes, faster where it is denser', () => {
    const avg: Record<string, number> = {};
    for (const id of REGION_IDS) {
      const g = g0(); g.site = { ...g.site, region: id };
      const r = mulberry32(9);
      let sum = 0;
      for (let i = 0; i < 200; i++) { const m = responseMinutes(g, r); expect(m).toBeGreaterThanOrEqual(SHERIFF[id].min); expect(m).toBeLessThanOrEqual(SHERIFF[id].max); sum += m; }
      avg[id] = sum / 200;
      expect(SHERIFF[id].min).toBeGreaterThanOrEqual(15);
      expect(SHERIFF[id].max).toBeLessThanOrEqual(45);
    }
    expect(avg.upper_midwest).toBeLessThan(avg.mountain_west);
    expect(avg.pnw).toBeLessThan(avg.desert);
  });

  it('peacetime intruders break fast and never breach', () => {
    for (let seed = 1; seed < 15; seed++) {
      const g = g0(seed); withGun(g); night(g);
      const b = planBattle(g, 3, seed, { armed: true, peacetime: true });
      expect(['fled', 'repelled']).toContain(b.result);
      expect(b.duration).toBeLessThan(40);
      expect(b.events.some(e => e.kind === 'throw' || e.kind === 'rocket' || e.kind === 'breach')).toBe(false);
    }
  });

  it('a justified shooting inside at night costs lawyer fees and holds the gun as evidence', () => {
    const g = g0(2); withGun(g); g.money = 100_000;
    const sh = { shooters: [g.people[0].id], inside: 1, fleeing: 0, killed: 0, night: true, mine: false };
    // a seed where the ruling is justified (≈ 96 % in Idaho)
    let lines: string[] = [];
    for (let k = 1; k < 20; k++) {
      const t = structuredClone(g);
      lines = investigate(t, sh, mulberry32(k));
      if (lines.some(l => /justified/.test(l))) {
        expect(t.money).toBeLessThanOrEqual(100_000 - 5_000);
        expect(t.money).toBeGreaterThanOrEqual(100_000 - 25_000 - 8_000);
        expect(t.armory.guns.length).toBe(0);
        expect(t.breakins!.evidence.length).toBe(1);
        expect(t.breakins!.prohibited).toBe(false);
        expect(t.breakins!.newsAt).toBe(t.clock.t);
        // it comes back after 30–120 days
        t.clock.t += 121;
        expect(legalDay(t).join(' ')).toMatch(/released/);
        expect(t.armory.guns.length).toBe(1);
        return;
      }
    }
    throw new Error('no justified ruling found');
  });

  it('shooting someone who is running away brings charges', () => {
    let charged = 0;
    for (let k = 1; k < 60; k++) {
      const g = g0(2); withGun(g); g.money = 200_000;
      investigate(g, { shooters: [g.people[0].id], inside: 0, fleeing: 1, killed: 0, night: true, mine: false }, mulberry32(k));
      if (g.breakins!.charged) charged++;
      expect(g.money).toBeLessThan(200_000 - 30_000 + 1);
    }
    expect(charged).toBe(59);
  });

  it('contraband or mines found by the deputies: a felony, everything illegal seized', () => {
    const g = g0(4); g.money = 200_000;
    g.armory.guns.push({ id: 'cx', model: 'm4_contraband', condition: 1, fired: 0, where: 'house', carrier: null });
    g.stock.grenades = 4; g.stock.mines = 6;
    const lines = plainView(g, mulberry32(1), 1);
    expect(lines.join(' ')).toMatch(/felony/i);
    expect(g.armory.guns.some(x => x.model === 'm4_contraband')).toBe(false);
    expect(g.stock.grenades).toBe(0);
    expect(g.stock.mines).toBe(0);
    expect(g.paper.fines).toBeGreaterThan(25_000);
    expect(g.breakins!.charged).toBe(1);
  });

  it('a confrontation plays a peacetime battle and reads the shooting from it', () => {
    const g = g0(7); withGun(g); night(g); g.money = 100_000;
    g.gate.pending = { id: 'e1', kind: 'break_in', day: 1, title: 'Someone is in the house', dossier: [], size: 2, armed: false, strength: 10, wants: {}, stances: ['call_911', 'shout', 'confront'] };
    const out = resolve(g, 'confront');
    expect(g.gate.battle).toBeTruthy();
    expect(g.gate.aftermath ?? null).toBeNull();
    const sh = shootingOf(g.gate.battle!);
    if (sh.shooters.length) expect(out.lines.join(' ')).toMatch(/sheriff|deput/i);
  });
});
