import { psyOf } from './mind';
import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, calendarOf, type GameState } from './state';
import { step } from './engine';
import { postureOf, resolve } from './encounters';
import { tallyDay } from './report';
import { migrate } from './save/migrations';
import { mulberry32 } from './rng';
import { planBattle } from './battle';
import { addLead, alliesFor, bringHome, fateHazard, fightAtCamp, isAway, LEAD_COLD, leadAge, openCaptives, raidProblem, recordBattle, recordTaken, rescueDay, startRescue, startTrip, tripFuel, tripProblem, type Captive } from './rescue';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.disaster.phase = 'survival';
  g.stock.canned = 60; g.stock.fuel = 20; g.stock.meds = 8; g.stock.staples = 2;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
/** A kid carried off by a savage crew today. */
function takeKid(g: GameState): Captive {
  const i = g.people.findIndex(p => p.kid);
  const n = g.personState[i].needs;
  n.died = dayIndex(g.clock.t); n.taken = true;
  return recordTaken(g, g.people[i].id, 7, 'savage', 1);
}
const kidOf = (g: GameState, c: Captive) => g.people.find(p => p.id === c.pid)!;
const adults = (g: GameState) => g.people.filter(p => !p.kid);
function arm(g: GameState, gear = true) {
  for (const [i, p] of adults(g).entries()) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
  }
  g.armory.ammo['556'] = 2000;
  if (gear) { g.stock.plate_carrier = 2; g.stock.helmet = 2; g.stock.nvg = 2; g.stock.ifak = 4; }
}
const nextDay = (g: GameState) => { g.clock.t += 1; };

describe('the taken', () => {
  it('a kid carried off in a fight gets a record: the crew, the day, held', () => {
    const g = afterHit(2), c = takeKid(g);
    expect(c.crew).toMatch(/^the |'s people$/);
    expect(c.status).toBe('held');
    expect(c.known).toBe('nothing');
    expect(c.camp).toBeGreaterThanOrEqual(3);
    expect(openCaptives(g)).toHaveLength(1);
    // anyone taken with no record (an old save) gets one the first day
    const h = afterHit(3), i = h.people.findIndex(p => p.kid);
    h.personState[i].needs.died = dayIndex(h.clock.t); h.personState[i].needs.taken = true;
    rescueDay(h);
    expect(openCaptives(h).map(x => x.pid)).toEqual([h.people[i].id]);
  });

  it('the fate worsens with time: most are held after a week, few after two months', () => {
    expect(fateHazard({ temper: 'savage' }, 60)).toBeGreaterThan(fateHazard({ temper: 'savage' }, 1));
    expect(fateHazard({ temper: 'desperate' }, 30)).toBeLessThan(fateHazard({ temper: 'savage' }, 30));
    const g = afterHit(5);
    const R = g.rescue!;
    const day0 = dayIndex(g.clock.t);
    for (let k = 0; k < 300; k++) R.captives.push({ pid: `x${k}`, crew: 'the test crew', temper: 'savage', raiders: 6, camp: 6, where: 'the fairgrounds', km: 10, dir: 'north', day: day0, status: 'held', statusDay: day0, known: 'nothing', deals: false, leads: [] });
    const held: Record<number, number> = {};
    for (let d = 1; d <= 60; d++) {
      nextDay(g); rescueDay(g);
      if (d === 7 || d === 30 || d === 60) held[d] = R.captives.filter(c => c.pid.startsWith('x') && c.status === 'held').length / 300;
    }
    expect(held[7]).toBeGreaterThan(0.8);
    expect(held[30]).toBeLessThan(held[7]);
    expect(held[30]).toBeGreaterThan(0.35);
    expect(held[60]).toBeLessThan(0.35);
    const gone = R.captives.filter(c => c.pid.startsWith('x') && c.status !== 'held');
    expect(gone.some(c => c.status === 'traded') && gone.some(c => c.status === 'dead')).toBe(true);
  });

  it('leads arrive over the weeks (radio, neighbors) and go cold', () => {
    let got = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = afterHit(seed);
      g.stock.sw_radio = 1;
      for (const n of g.neighbors) n.disposition = 60;
      const c = takeKid(g);
      for (let d = 0; d < 30; d++) { nextDay(g); rescueDay(g); g.gate.pending = null; }
      if (c.leads.length) got++;
    }
    expect(got).toBeGreaterThanOrEqual(5);
    // a lead says where, how many, whether the child was seen; then it cools
    const g = afterHit(1), c = takeKid(g);
    arm(g);
    const line = addLead(g, c, 'prisoner', mulberry32(4));
    expect(line).toMatch(/km/);
    const l = c.leads[0];
    expect(l.count).toBeGreaterThan(1);
    expect(raidProblem(g, c.pid, [adults(g)[0].id])).toBeNull();
    g.clock.t += LEAD_COLD + 1;
    expect(leadAge(g, l)).toBeGreaterThan(LEAD_COLD);
    expect(raidProblem(g, c.pid, [adults(g)[0].id])).toMatch(/cold/);
  });

  it('a ransom brings the child home, or it is a double-cross', () => {
    let home = 0, crossed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterHit(seed), c = takeKid(g);
      arm(g, false);
      g.stock.canned = 200; g.stock.fuel = 50; g.stock.meds = 20;
      c.deals = true; c.offerDue = dayIndex(g.clock.t);
      rescueDay(g);
      expect(g.gate.pending?.kind).toBe('ransom');
      const fuel0 = g.stock.fuel, canned0 = g.stock.canned, meds0 = g.stock.meds, ammo0 = g.armory.ammo['556'] ?? 0;
      resolve(g, 'pay');
      const paid = g.stock.fuel < fuel0 || g.stock.canned < canned0 || g.stock.meds < meds0 || (g.armory.ammo['556'] ?? 0) < ammo0;
      expect(paid).toBe(true);
      const n = g.personState.find(ps => ps.id === c.pid)!.needs;
      if (n.died == null) { home++; expect(n.taken).toBe(false); expect(c.closed).toBe('home'); } else crossed++;
    }
    expect(home).toBeGreaterThan(10);
    expect(crossed).toBeGreaterThan(3);
    // a crew that no longer has the child always cheats
    const g = afterHit(9), c = takeKid(g);
    g.stock.canned = 200; g.stock.fuel = 50; g.stock.meds = 20; g.armory.ammo['556'] = 2000; g.armory.ammo['12ga'] = 2000;
    c.deals = true; c.offerDue = dayIndex(g.clock.t); c.status = 'dead';
    rescueDay(g);
    resolve(g, 'pay');
    expect(g.personState.find(ps => ps.id === c.pid)!.needs.died).not.toBeNull();
  });

  it('rescue odds rise with fighters and gear', () => {
    const freed = (g: GameState, team: string[]) => {
      let ok = 0;
      for (let seed = 1; seed <= 80; seed++) { const f = fightAtCamp(g, team, { camp: 6, temper: 'savage', status: 'held' }, seed); if (f.child === 'freed' || f.child === 'wounded') ok++; }
      return ok;
    };
    const weak = afterHit(1);
    weak.armory.guns.push({ id: 'g0', model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: adults(weak)[0].id });
    weak.armory.ammo['556'] = 300;
    const strong = afterHit(1);
    arm(strong);
    const one = freed(weak, [adults(weak)[0].id]), two = freed(strong, adults(strong).map(p => p.id));
    expect(two).toBeGreaterThan(one);
    expect(two).toBeGreaterThan(30);
    // the same team without armor and night vision does worse
    const bare = afterHit(1);
    arm(bare, false);
    expect(freed(bare, adults(bare).map(p => p.id))).toBeLessThan(two);
    // a bigger camp is harder
    let small = 0, big = 0;
    for (let seed = 1; seed <= 80; seed++) {
      if (fightAtCamp(strong, adults(strong).map(p => p.id), { camp: 4, temper: 'savage', status: 'held' }, seed).child === 'freed') small++;
      if (fightAtCamp(strong, adults(strong).map(p => p.id), { camp: 12, temper: 'savage', status: 'held' }, seed).child === 'freed') big++;
    }
    expect(small).toBeGreaterThan(big);
  });

  it('a raid takes them off the place (lightly held), fights, and brings them back', () => {
    const g = afterHit(4), c = takeKid(g);
    arm(g);
    addLead(g, c, 'prisoner', mulberry32(1));
    c.leads[0].true = true; c.leads[0].where = c.where; c.leads[0].km = 10;
    const before = postureOf(g).fighters;
    const team = adults(g).map(p => p.id);
    expect(startRescue(g, c.pid, team)).toBeNull();
    expect(isAway(g, team[0])).toBe(true);
    expect(postureOf(g).fighters).toBeLessThan(before);
    const s1 = step(g, 1);
    expect(s1.personState.find(ps => ps.id === team[0])!.task).toBe('away');
    const s3 = step(s1, 2.5);
    expect(s3.rescue!.raid).toBeNull();
    expect(s3.gate.card?.title).toBeTruthy();
    const back = s3.personState.filter(ps => team.includes(ps.id) && ps.needs.died == null);
    for (const ps of back) expect(ps.task).not.toBe('away');
  });

  it('a child who comes home rejoins cleanly: eats, ages, works, is on the Family tab', () => {
    const g = afterHit(6), c = takeKid(g);
    const kid = kidOf(g, c);
    // a day of eating without them
    const a = step(g, 1);
    const need0 = a.food.needKcal;
    expect(a.lineage.mourned).toContain(kid.id);
    // home, and a birthday tomorrow
    const h = structuredClone(a);
    const hc = h.rescue!.captives[0];
    const k = h.people.find(p => p.id === kid.id)!;
    const age0 = k.age;
    k.bday = calendarOf(h.clock, dayIndex(h.clock.t) + 1).doy;
    bringHome(h, hc, 'rescue');
    const ps = h.personState.find(x => x.id === kid.id)!;
    expect(ps.needs.died).toBeNull();
    expect(ps.needs.taken).toBe(false);
    expect(h.lineage.mourned).not.toContain(kid.id);
    expect(h.lineage.chronicle.some(e => e.kind === 'home')).toBe(true);
    // what they went through stays with them (sim/mind.ts), not as a wound
    expect(psyOf(h, kid.id).what).toBe('captivity');
    expect(psyOf(h, kid.id).trauma).toBeGreaterThan(25);
    const b = step(h, 2);
    expect(b.food.needKcal).toBeGreaterThan(need0);
    const bk = b.people.find(p => p.id === kid.id)!, bps = b.personState.find(x => x.id === kid.id)!;
    expect(bk.age).toBe(age0 + 1);
    expect(bps.task).not.toBe('gone');
    // the Family tab shows a task, not "Taken" / "Died"
    expect(bps.needs.taken || bps.needs.died != null).toBe(false);
    expect(openCaptives(b)).toHaveLength(0);
    // taken again later: a new record and a new chronicle line
    const n = bps.needs; n.died = dayIndex(b.clock.t); n.taken = true;
    rescueDay(b);
    expect(openCaptives(b)).toHaveLength(1);
  });

  it('a wipe still ends the game when nobody free is left', () => {
    const g = afterHit(7);
    const day = dayIndex(g.clock.t);
    for (const [i, p] of g.people.entries()) {
      const n = g.personState[i].needs;
      n.died = day;
      if (p.kid) { n.taken = true; recordTaken(g, p.id, 8, 'savage'); }
    }
    expect(openCaptives(g).length).toBeGreaterThan(0);
    const end = tallyDay(g);
    expect(end?.kind).toBe('wipe');
    // and nothing comes back for them after
    rescueDay(g);
    expect(g.gate.pending).toBeNull();
  });

  it('old saves migrate: v37 gets an empty rescue record', () => {
    const g = afterHit(1) as unknown as Record<string, unknown>;
    delete g.rescue;
    g.version = 37;
    const m = migrate(JSON.parse(JSON.stringify(g)));
    expect(m.rescue).toEqual({ captives: [], raid: null });
  });

  it('neighbors on the radio net can send men: better odds, and they can be hurt or killed', () => {
    const g = afterHit(1);
    arm(g, false);
    const team = adults(g).map(p => p.id);
    let alone = 0, helped = 0;
    for (let seed = 1; seed <= 80; seed++) {
      if (['freed', 'wounded'].includes(fightAtCamp(g, team, { camp: 7, temper: 'savage', status: 'held' }, seed).child)) alone++;
      if (['freed', 'wounded'].includes(fightAtCamp(g, team, { camp: 7, temper: 'savage', status: 'held' }, seed, 3).child)) helped++;
    }
    expect(helped).toBeGreaterThan(alone);
    // a real raid with them: goodwill rides on how it goes; they bury their dead
    let lostMen = 0, soured = 0, warmed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const h = afterHit(seed), c = takeKid(h);
      arm(h, false);
      h.neighbors.forEach((n, i) => { n.status = 'home'; n.radio = i === 0; n.disposition = i === 0 ? 80 : 0; n.members = 4; });
      expect(alliesFor(h)).toEqual([{ id: h.neighbors[0].id, name: h.neighbors[0].name, n: 2 }]);
      addLead(h, c, 'prisoner', mulberry32(1));
      Object.assign(c.leads[0], { true: true, where: c.where, km: 10 });
      c.camp = 9;
      expect(startRescue(h, c.pid, adults(h).map(p => p.id), true)).toBeNull();
      expect(h.rescue!.raid!.allies).toHaveLength(1);
      nextDay(h); rescueDay(h);
      const n = h.neighbors[0];
      if (n.members < 4) lostMen++;
      if (n.disposition < 80) soured++;
      if (n.disposition > 80) warmed++;
    }
    expect(lostMen).toBeGreaterThan(0);
    expect(soured).toBeGreaterThan(0);
    expect(warmed).toBeGreaterThan(0);
  });

  it('a child traded on: rare far rumors over months, then a long, costly trip with small odds', () => {
    let rumors = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = afterHit(seed), c = takeKid(g);
      g.stock.sw_radio = 1;
      c.status = 'traded'; c.known = 'traded';
      for (let d = 0; d < 240; d++) { nextDay(g); rescueDay(g); g.gate.pending = null; }
      if (c.leads.some(l => l.far)) rumors++;
    }
    expect(rumors).toBeGreaterThan(2);
    expect(rumors).toBeLessThan(12);
    // the trip: a truck, fuel there and back, days on the road
    let found = 0, trips = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterHit(seed), c = takeKid(g);
      arm(g, false);
      g.vehicles = [{ id: 'v1', kind: 'pickup', mileage: 130000, condition: 0.8, fuel: 90, oilAt: 0 }];
      g.stock.fuel = 30; g.stock.canned = 100; g.stock.meds = 10;
      c.status = 'traded'; c.known = 'traded'; c.farWhere = 'the salt flats market'; c.farKm = 240;
      c.leads.push({ day: dayIndex(g.clock.t), source: 'radio', where: c.farWhere, km: 240, count: 0, seenAlive: true, far: true, text: '', true: true });
      const team = [adults(g)[0].id];
      expect(tripProblem(g, c.pid, team)).toBeNull();
      const before = g.vehicles[0].fuel + g.stock.fuel * 20, need = tripFuel(g, 240).liters;
      expect(startTrip(g, c.pid, team)).toBeNull();
      expect(g.vehicles[0].fuel + g.stock.fuel * 20).toBeCloseTo(before - need, 3);
      expect(isAway(g, team[0])).toBe(true);
      for (let d = 0; d < 6; d++) { nextDay(g); rescueDay(g); }
      trips++;
      if (g.personState.find(ps => ps.id === c.pid)!.needs.died == null) found++;
      expect(g.rescue!.raid).toBeNull();
    }
    // even on a true lead, it's a long shot
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(trips);
    // no truck, no trip
    const g = afterHit(2), c = takeKid(g);
    c.known = 'traded'; c.leads.push({ day: dayIndex(g.clock.t), source: 'radio', where: 'x', km: 200, count: 0, seenAlive: true, far: true, text: '', true: false });
    g.vehicles = [{ id: 'v1', kind: 'pickup', mileage: 0, condition: 0.8, fuel: 0, oilAt: 0, fried: true }];
    expect(tripProblem(g, c.pid, [adults(g)[0].id])).toMatch(/truck/);
  });

  it('a hard crew that gets in takes a working-age adult; they deal more and kill less', () => {
    let workers = 0, kids = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterHit(seed);
      const b = planBattle(g, 8, seed, { temper: 'hard' });
      for (const e of b.events) if (e.kind === 'taken') {
        const p = g.people.find(x => x.id === b.units.find(u => u.id === e.unit)?.personId)!;
        if (p.kid) kids++; else { workers++; expect(p.age).toBeGreaterThanOrEqual(16); }
      }
      if (seed === 1 || workers === 1) {
        const h = structuredClone(g);
        // (written into the game: a captive held by a hard crew)
        const taken = b.events.find(e => e.kind === 'taken');
        if (taken) {
          const hb = structuredClone(b);
          const pid = hb.units.find(u => u.id === (taken as { unit: string }).unit)!.personId!;
          const ps = h.personState.find(x => x.id === pid)!; ps.needs.died = dayIndex(h.clock.t); ps.needs.taken = true;
          recordBattle(h, hb, 8, 'hard');
          expect(openCaptives(h)[0].temper).toBe('hard');
        }
      }
    }
    expect(workers).toBeGreaterThan(0);
    expect(kids).toBe(0);
    // over two months, fewer of a hard crew's captives are dead
    const deadShare = (temper: 'hard' | 'savage') => {
      const g = afterHit(5), R = g.rescue!, d0 = dayIndex(g.clock.t);
      for (let k = 0; k < 300; k++) R.captives.push({ pid: `y${k}`, crew: 'c', temper, raiders: 6, camp: 6, where: 'w', km: 10, dir: 'n', day: d0, status: 'held', statusDay: d0, known: 'nothing', deals: false, leads: [] });
      for (let d = 0; d < 90; d++) { nextDay(g); rescueDay(g); }
      const gone = R.captives.filter(c => c.status !== 'held');
      return gone.filter(c => c.status === 'dead').length / Math.max(1, gone.length);
    };
    expect(deadShare('hard')).toBeLessThan(deadShare('savage'));
    // and they're likelier to trade
    let hardDeals = 0, savageDeals = 0;
    for (let k = 0; k < 200; k++) {
      const g = afterHit(1); g.clock.t += k;
      const pid = g.people.find(p => !p.kid)!.id;
      if (recordTaken(g, pid, 6, 'hard').deals) hardDeals++;
      const h = afterHit(1); h.clock.t += k;
      if (recordTaken(h, pid, 6, 'savage').deals) savageDeals++;
    }
    expect(hardDeals).toBeGreaterThan(savageDeals);
  });
});

