import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, dayIndex, type GameState, type Structure } from './state';
import { variedFamily } from './family';
import { BLUEPRINTS, homeBeds, HOME_BEDS } from './blueprints';
import { addWork, isFinished } from './construction';
import { resolve } from './encounters';
import { mulberry32 } from './rng';
import { cachedPlan } from './housing';
import { autoFit, plant, serviceOf, AUTO_REACH } from './utilities';
import { migrate } from './save/migrations';
import { fleetOf, VEHICLES } from './vehicles';
import { GUN } from './armory';
import { kinOf, kinDay, kinPool, makeKinRequest } from './kin';
import { admitNewcomers, moveOut, newcomersDay, strangerArrival, type Extras } from './newcomers';
import {
  anchorOf, autoSpot, claimForWaiting, claimWaitingRig, defaultStay, joinersDay, joinersOf, kitDetail, kitLine, modularQuote, ownBuildKind, parkRig, pendingStays, purseOf, rigLeaves,
  rollKit, settleStay, stayOptions, toolsFor,
} from './joinerHome';
import { orderProblem } from './economy';
import { isHome } from './blueprints';

const peace = (seed = 1): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.gate.next = 1e9;
  g.stock.canned = 40; g.stock.staples = 10;
  return g;
};
const fin = (s: GameState, kind: string, x = 0, z = 0): Structure => {
  const st: Structure = { id: `t${s.nextId++}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st);
  return st;
};
const arrival = (g: GameState, seed: number) => strangerArrival(g, mulberry32(seed), `e${seed}`, dayIndex(g.clock.t));
/** A stranger at the gate with chosen things. */
function at(g: GameState, seed: number, extras: Extras = {}, brings: Record<string, number> = {}) {
  const e = arrival(g, seed);
  e.extras = { ...extras };
  e.brings = { ...brings };
  g.gate.pending = e;
  return e;
}
const day = (g: GameState) => { g.clock.t += 1; };

describe('what a joiner brings', () => {
  it('is seeded: the same stranger carries the same things, and most carry savings', () => {
    const g = peace(2);
    const a = arrival(g, 11), b = arrival(g, 11);
    expect(a.extras).toEqual(b.extras);
    let cash = 0;
    for (let i = 1; i <= 60; i++) if ((arrival(g, i).extras?.cash ?? 0) > 0) cash++;
    expect(cash).toBeGreaterThan(40);
  });
  it('tools follow the trade and the skills, not the dice alone', () => {
    const g = peace(3);
    const fam = variedFamily(3, 0).people.filter(p => !p.kid);
    const carp = { ...fam[0], job: { title: 'Carpenter', wage: 200, id: 'carpenter' }, skills: { ...fam[0].skills, builder: 9 } };
    const t = toolsFor([carp], mulberry32(1));
    expect(t).toContain('circular_saw');
    expect(t).toContain('hammer');
    const nobody = { ...fam[0], job: undefined, skills: Object.fromEntries(Object.keys(fam[0].skills).map(k => [k, 1])) as typeof fam[0]['skills'] };
    expect(toolsFor([nobody], mulberry32(1))).toEqual([]);
    void g;
  });
  it('the card line is short: cash, a kit, a pickup, food', () => {
    const g = peace(2);
    const people = arrival(g, 5).people!;
    const line = kitLine({ canned: 12, staples: 3 }, { cash: 22_000, tools: ['hammer', 'circular_saw', 'cordless_drill'], vehicle: 'pickup' }, people);
    expect(line).toMatch(/^\$22k, a tool kit, a pickup, \d+ (weeks|days) of food$/);
    expect(kitDetail({ canned: 12 }, { cash: 22_000, tools: ['hammer'] }, people).join(' ')).toMatch(/\$22,000/);
    expect(kitLine({}, {}, people)).toBe('what is on their backs');
  });
  it('taking them in pools their cash, tools and pickup with the family', () => {
    const g = peace(4);
    const money = g.money, tools = g.tools?.items.length ?? 0, fleet = fleetOf(g).length;
    const e = at(g, 6, { cash: 9_000, tools: ['wrench_set', 'file'], vehicle: 'pickup' });
    g.stock.sleeping_bag = 0;
    const lines = resolve(g, 'take_in').lines;
    expect(g.money).toBe(money + 9_000);
    expect(g.tools!.items.length).toBe(tools + 2);
    expect(fleetOf(g).length).toBe(fleet + 1);
    expect(lines.join(' ')).toMatch(/\$9,000 goes into the family account/);
    expect(e.people!.every(p => g.people.some(q => q.id === p.id))).toBe(true);
  });
  it('a pickup is dropped when the fleet is full', () => {
    const g = peace(4);
    while (fleetOf(g).filter(v => v.kind === 'pickup').length < VEHICLES.pickup.max) fleetOf(g).push({ id: `v${g.nextId++}`, kind: 'pickup', mileage: 1, condition: 1, fuel: 1, oilAt: 0 });
    for (let i = 1; i <= 80; i++) expect(arrival(g, i).extras?.vehicle).not.toBe('pickup');
  });
  it('guns: only legal hunting or handgun models, never an assault rifle where the state bans them, never machine guns', () => {
    for (const region of ['pnw', 'mountain_west'] as const) {
      const g = peace(5);
      g.site.region = region;
      for (let i = 1; i <= 200; i++) for (const id of arrival(g, i).extras?.guns ?? []) {
        const m = GUN[id];
        expect(m.nfa).toBeFalsy(); expect(m.contraband).toBeFalsy(); expect(m.assault).toBeFalsy();
      }
    }
    // the pool step re-checks the law at the door
    const g = peace(5); g.site.region = 'pnw';
    const before = g.armory.guns.length;
    const e = at(g, 7, { guns: ['sw_mp15'] });
    resolve(g, 'take_in');
    expect(g.armory.guns.length).toBe(before);
    expect(e.extras!.guns).toEqual(['sw_mp15']);
  });
  it('a legal gun comes with a little ammunition and is not on the shop books', () => {
    const g = peace(5); g.site.region = 'mountain_west';
    const books = g.armory.onBooks;
    at(g, 8, { guns: ['rem_700'] });
    resolve(g, 'take_in');
    expect(g.armory.guns.some(x => x.model === 'rem_700')).toBe(true);
    expect(g.armory.ammo['308']).toBeGreaterThan(0);
    expect(g.armory.onBooks).toBe(books);
  });
});

describe('where they stay: the options', () => {
  it('a spare bed and a tent are always offered; a rig only when they own one', () => {
    const g = peace(6);
    const e = at(g, 9);
    expect(stayOptions(g, e).map(o => o.kind)).toEqual(['bed', 'modular', 'own_build', 'tent']);
    e.extras!.rig = 'travel_trailer';
    expect(stayOptions(g, e).map(o => o.kind)).toContain('rig');
  });
  it('the build-first path is for relatives only', () => {
    const g = peace(6);
    expect(stayOptions(g, at(g, 9)).some(o => o.kind === 'player_build')).toBe(false);
    const fam = variedFamily(6, 0).people;
    const kin = makeKinRequest(g, kinPool(6, 0, fam).slice(0, 1), false, mulberry32(1), 'k1');
    expect(stayOptions(g, kin).some(o => o.kind === 'player_build')).toBe(true);
  });
  it('each option is one line with cost and consequence, and the long answer is the tooltip', () => {
    const g = peace(6);
    const e = at(g, 9, { cash: 80_000, rig: 'rv_camper' });
    for (const o of stayOptions(g, e)) { expect(o.line.length).toBeLessThan(150); expect(o.tip.length).toBeGreaterThan(o.line.length); expect(o.line).not.toMatch(/\n/); }
  });
  it('a modular home is priced from the table and needs the joiner’s own money', () => {
    const g = peace(6);
    const q = modularQuote(g);
    expect(q.total).toBeGreaterThan(58_000);
    expect(q.total).toBeLessThan(75_000);
    const poor = stayOptions(g, at(g, 9, { cash: 12_000 })).find(o => o.kind === 'modular')!;
    expect(poor.off).toMatch(/needs \$\d/);
    g.money = 200_000;
    const rich = stayOptions(g, at(g, 9, { cash: 90_000 })).find(o => o.kind === 'modular')!;
    expect(rich.off).toBeNull();
    expect(rich.line).toMatch(/from their money/);
  });
  it('a modular home is not for sale once the dealers stop', () => {
    const g = peace(6);
    g.disaster.tracks = { ...g.disaster.tracks, deliveries: 0, banks: 0 };
    const o = stayOptions(g, at(g, 9, { cash: 90_000 })).find(x => x.kind === 'modular')!;
    expect(o.off).not.toBeNull();
  });
  it('the cabin they build is the smallest that sleeps them', () => {
    expect(ownBuildKind(1)).toBe('guest_house'); expect(ownBuildKind(2)).toBe('guest_house'); expect(ownBuildKind(3)).toBe('cottage'); expect(ownBuildKind(4)).toBe('timber_cabin'); expect(ownBuildKind(6)).toBe('log_house'); expect(ownBuildKind(9)).toBeNull();
  });
  it('the default is a bed, or their rig when the beds are short', () => {
    const g = peace(6);
    const e = at(g, 9, { rig: 'travel_trailer' });
    const free = cachedPlan(g).bedsFree;
    expect(defaultStay(g, e)).toBe(free >= e.people!.length + 1 ? 'bed' : 'rig');
    e.stay = 'tent';
    expect(defaultStay(g, e)).toBe('tent');
    e.stay = 'modular';   // they cannot afford it: falls back
    expect(defaultStay(g, e)).not.toBe('modular');
  });
});

describe('their own rig', () => {
  it('is parked finished on a pad near the house, counts as beds, and houses its owners', () => {
    const g = peace(7);
    fin(g, 'timber_cabin', 0, 0);
    const beds = homeBeds(g);
    const e = at(g, 10, { rig: 'travel_trailer', cash: 3_000 });
    e.stay = 'rig';
    const out = resolve(g, 'take_in');
    const rig = g.structures.find(x => x.kind === 'travel_trailer')!;
    expect(rig).toBeTruthy();
    expect(isFinished(rig)).toBe(true);
    expect(rig.rig!.owners.sort()).toEqual(e.people!.map(p => p.id).sort());
    expect(homeBeds(g)).toBe(beds + HOME_BEDS.travel_trailer);
    const housed = g.people.filter(p => p.home === rig.id).length;
    expect(housed).toBe(Math.min(e.people!.length, HOME_BEDS.travel_trailer));
    expect(out.lines.join(' ')).toMatch(/travel trailer backs onto a pad/);
  });
  it('is placed within reach of the house, off every footprint', () => {
    const g = peace(7);
    fin(g, 'timber_cabin', 0, 0);
    const spot = autoSpot(g, 'rv_camper')!;
    expect(spot).toBeTruthy();
    const a = anchorOf(g);
    expect(Math.hypot(spot.x - a.x, spot.z - a.z)).toBeLessThan(AUTO_REACH);
    expect(Math.hypot(spot.x - a.x, spot.z - a.z)).toBeGreaterThan(0.5);
  });
  it('hooks up to the water and power on its own within about 70 m (AUTO_REACH)', () => {
    const g = peace(7);
    g.utilities.grid = true;
    fin(g, 'well_drilled', 2, 2);
    const house = fin(g, 'timber_cabin', 3, 3);
    const rig = parkRig(g, 'travel_trailer', ['x'], { x: 3 + 6, z: 3, rot: 0 })!;
    autoFit(g, plant(g));
    const sv = serviceOf(g, plant(g), rig.id);
    expect(sv.power && sv.water).toBe(true);
    expect(g.utilities.fittings.some(f => f.building === rig.id && f.kind === 'wire')).toBe(true);
    expect(g.utilities.fittings.some(f => f.building === rig.id && f.kind === 'plumb')).toBe(true);
    // too far (100 m): no service
    const far = parkRig(g, 'rv_camper', ['y'], { x: 3 + 40, z: 3, rot: 0 })!;
    expect(serviceOf(g, plant(g), far.id).water).toBe(false);
    void house;
  });
  it('is mobile: when the owners leave, the rig goes with them', () => {
    const g = peace(7);
    fin(g, 'timber_cabin');
    const e = at(g, 10, { rig: 'rv_camper' }); e.stay = 'rig';
    resolve(g, 'take_in');
    const rig = g.structures.find(x => x.kind === 'rv_camper')!;
    const [a, ...rest] = e.people!;
    if (rest.length) { moveOut(g, a.id, 'went on'); expect(g.structures.includes(rig)).toBe(true); for (const p of rest) moveOut(g, p.id, 'went on'); }
    else moveOut(g, a.id, 'went on');
    expect(g.structures.some(x => x.id === rig.id)).toBe(false);
    expect(g.people.every(p => p.home !== rig.id)).toBe(true);
    expect(rigLeaves(g, a.id)).toBeNull();
  });
  it('the player can pick the pad: the rig waits, then is claimed by the stake', () => {
    const g = peace(7);
    fin(g, 'timber_cabin');
    const e = at(g, 10, { rig: 'travel_trailer' }); e.stay = 'rig'; e.placeRig = true;
    resolve(g, 'take_in');
    expect(g.structures.some(x => x.kind === 'travel_trailer')).toBe(false);
    expect(joinersOf(g).waiting).toHaveLength(1);
    const st: Structure = { id: `s${g.nextId++}`, kind: 'travel_trailer', x: 4, z: 4, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null };
    g.structures.push(st);
    expect(claimWaitingRig(g, st)).toBe(true);
    expect(isFinished(st)).toBe(true);
    expect(joinersOf(g).waiting).toHaveLength(0);
    expect(g.people.some(p => p.home === st.id)).toBe(true);
    // with nothing waiting a second one is not theirs
    const again: Structure = { ...st, id: `s${g.nextId++}`, stage: 0, finishedAt: null };
    expect(claimWaitingRig(g, again)).toBe(false);
  });
  it('a rig counts toward the "everybody has a bed" check and the shelter line', () => {
    const g = peace(7);
    g.people = g.people.slice(0, 2); g.personState = g.personState.slice(0, 2);
    const e = at(g, 10, { rig: 'rv_camper' }); e.stay = 'rig';
    resolve(g, 'take_in');
    const plan = cachedPlan(g);
    expect(plan.noBed).toBe(0);
    expect(homeBeds(g)).toBeGreaterThanOrEqual(Math.min(e.people!.length, HOME_BEDS.rv_camper));
  });
});

describe('a modular home they buy', () => {
  it('pays from their money, is staked and ordered, and they move in when it is set', () => {
    const g = peace(8);
    fin(g, 'timber_cabin');
    g.money = 5_000;
    const e = at(g, 12, { cash: 90_000 }); e.stay = 'modular';
    const quote = modularQuote(g);
    const before = g.money;
    const out = resolve(g, 'take_in');
    expect(out.lines.join(' ')).toMatch(/modular home with their own money/);
    // +cash -order -permit: the family is not out of pocket for the unit
    expect(g.money).toBeLessThanOrEqual(before + 90_000);
    expect(g.money).toBeGreaterThanOrEqual(before + 90_000 - quote.total - 1);
    const st = g.structures.find(x => x.kind === 'modular_home')!;
    expect(st.joiner!.kind).toBe('modular');
    expect(g.orders.some(o => o.lines.some(l => l.material === 'modular_unit'))).toBe(true);
    expect(g.stock.tent).toBeGreaterThan(0);
    // delivered and built
    for (const o of g.orders) { g.stock.modular_unit += o.lines.filter(l => l.material === 'modular_unit').reduce((a, l) => a + l.qty, 0); }
    g.stock.concrete += 10; g.stock.hardware += 10; g.stock.roofing += 5; g.stock.lumber += 10;
    st.permit = 'ok';
    addWork(g, st, 500);
    expect(isFinished(st)).toBe(true);
    day(g);
    const lines = joinersDay(g);
    expect(lines.join(' ')).toMatch(/move into the modular home they bought/);
    expect(g.people.filter(p => p.home === st.id).length).toBe(Math.min(HOME_BEDS.modular_home, e.people!.length));
    expect(joinersOf(g).stays).toHaveLength(0);
  });
  it('is quick to finish next to a cabin of the same size (the walls and roof arrive done)', () => {
    const hours = (k: string) => BLUEPRINTS[k].stages.reduce((a, s) => a + s.hours, 0);
    expect(hours('modular_home')).toBeLessThan(hours('cottage') / 4);
  });
  it('the county permit goes through the paperwork rules', () => {
    const g = peace(8);
    fin(g, 'timber_cabin');
    g.money = 5_000;
    at(g, 12, { cash: 90_000 }).stay = 'modular';
    resolve(g, 'take_in');
    const st = g.structures.find(x => x.kind === 'modular_home')!;
    expect(['review', 'none']).toContain(st.permit);
    if (g.paper.permits) expect(st.permit).toBe('review');
  });
});

describe('a cabin they build themselves', () => {
  it('is staked for them, built through the usual pipeline, and they move in', () => {
    const g = peace(9);
    fin(g, 'timber_cabin');
    const e = at(g, 13, { cash: 6_000 }); e.stay = 'own_build';
    resolve(g, 'take_in');
    const st = g.structures.find(x => x.joiner?.kind === 'own_build')!;
    expect(st).toBeTruthy();
    expect(st.kind).toBe(ownBuildKind(e.people!.length));
    expect(pendingStays(g)[0].pct).toBe(0);
    expect(g.stock.tent).toBeGreaterThan(0);
    // the family builds it with the materials
    g.stock.lumber += 100; g.stock.concrete += 50; g.stock.roofing += 50; g.stock.hardware += 50; g.stock.fixtures += 10; g.stock.cable += 10;
    st.permit = 'ok';
    addWork(g, st, 3000);
    expect(isFinished(st)).toBe(true);
    day(g);
    expect(joinersDay(g).join(' ')).toMatch(/they built/);
    expect(g.people.some(p => p.home === st.id)).toBe(true);
  });
  it('their own hands count: a staked cabin is an ordinary structure for the construction pipeline', () => {
    const g = peace(9);
    const e = at(g, 13); e.stay = 'own_build';
    resolve(g, 'take_in');
    const st = g.structures.find(x => x.joiner?.kind === 'own_build')!;
    expect(BLUEPRINTS[st.kind]).toBeTruthy();
    expect(st.joiner!.ids.every(id => g.people.some(p => p.id === id))).toBe(true);
  });
});

describe('a tent for now', () => {
  it('pitches tents and asks nothing of the stores', () => {
    const g = peace(10);
    const e = at(g, 14); e.stay = 'tent';
    const tents = g.stock.tent;
    resolve(g, 'take_in');
    expect(g.stock.tent).toBe(tents + Math.ceil(e.people!.length / 3));
  });
});

describe('the family builds them a place (relatives)', () => {
  const kinGame = (seed = 11) => {
    const base = variedFamily(seed, 0).people;
    const pool = kinPool(seed, 0, base);
    const g = newGame(seed, 105, 2027, { family: base, mode: 'scenario', kind: 'grid_down', peace: 'short', kinAway: pool, kinOpen: true });
    g.gate.next = 1e9;
    return g;
  };
  it('choosing it on the card turns "take them in" into the wait-list; staking a home tags it for them; they move in when it is finished', () => {
    const g = kinGame();
    const k = kinOf(g);
    const group = k.away.slice(0, 1);
    const e = makeKinRequest(g, group, false, mulberry32(3), 'k1');
    e.stay = 'player_build';
    g.gate.pending = e;
    const out = resolve(g, 'take_in');
    expect(out.title).toBe('Build them a place first');
    expect(k.waiting).toHaveLength(1);
    expect(g.people.some(p => p.id === group[0].id)).toBe(false);
    // the player stakes a guest house: it is theirs
    const st: Structure = { id: `s${g.nextId++}`, kind: 'guest_house', x: 5, z: 5, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null };
    g.structures.push(st);
    expect(claimForWaiting(g, st, k.waiting)).toBe(true);
    expect(k.waiting[0].build).toBe(st.id);
    expect(st.joiner!.kind).toBe('player_build');
    // unfinished: they keep waiting (other beds in the house do not end it)
    day(g);
    kinDay(g);
    expect(k.waiting).toHaveLength(1);
    // built from the family's stock
    g.stock.lumber += 100; g.stock.concrete += 50; g.stock.roofing += 50; g.stock.hardware += 50; g.stock.fixtures += 10; g.stock.cable += 10;
    st.permit = 'ok';
    addWork(g, st, 2000);
    expect(isFinished(st)).toBe(true);
    day(g);
    const lines = kinDay(g);
    expect(lines.join(' ')).toMatch(/the place you built is ready/);
    expect(k.waiting).toHaveLength(0);
    expect(g.people.find(p => p.id === group[0].id)!.home).toBe(st.id);
  });
  it('they come anyway if the heat comes first', () => {
    const g = kinGame(12);
    const k = kinOf(g);
    const group = k.away.slice(0, 1);
    const e = makeKinRequest(g, group, false, mulberry32(3), 'k1');
    e.stay = 'player_build'; g.gate.pending = e;
    resolve(g, 'take_in');
    const st: Structure = { id: `s${g.nextId++}`, kind: 'cottage', x: 5, z: 5, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null };
    g.structures.push(st);
    claimForWaiting(g, st, k.waiting);
    g.clock.t = Math.floor(g.disaster.hitAt) + 2;
    g.disaster.phase = 'impact';
    kinDay(g);
    expect(k.waiting).toHaveLength(0);
    expect(g.people.some(p => p.id === group[0].id)).toBe(true);
  });
  it('their patience follows the old rule: 150 days in peace, 75 in the warning, then they make other plans', () => {
    const g = kinGame(13);
    const k = kinOf(g);
    const group = k.away.slice(0, 1);
    const e = makeKinRequest(g, group, false, mulberry32(3), 'k1');
    e.stay = 'player_build'; g.gate.pending = e;
    resolve(g, 'take_in');
    const w = k.waiting[0];
    expect(w.until - w.since).toBe(g.disaster.phase === 'warning' ? 75 : 150);
    g.clock.t += w.until - w.since + 1;
    g.disaster.hitAt = g.clock.t + 500;
    kinDay(g);
    expect(k.waiting).toHaveLength(0);
    expect(k.away.some(p => p.id === group[0].id)).toBe(true);
  });
  it('relatives bring their own things too: tools, a rig or a pickup, pooled when they come', () => {
    const g = kinGame(14);
    const k = kinOf(g);
    let rig = 0, kit = 0;
    for (let i = 0; i < 40; i++) {
      const e = makeKinRequest(g, k.away.slice(0, 2), false, mulberry32(i + 1), `k${i}`);
      if (e.extras?.rig) rig++;
      if (e.extras?.tools?.length || e.extras?.vehicle) kit++;
      expect(e.dossier.some(l => l.startsWith('Brings: '))).toBe(true);
      expect(purseOf(e)).toBe(e.kin!.savings);
    }
    expect(kit).toBeGreaterThan(5);
    expect(rig).toBeGreaterThanOrEqual(0);
  });
});

describe('save v77', () => {
  it('an older save gains the joiners ledger and the new goods start at zero', () => {
    const old = JSON.parse(JSON.stringify(newGame(2))) as Record<string, unknown>;
    old.version = 76; delete old.joiners;
    delete (old.stock as Record<string, number>).modular_unit;
    const s = migrate(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(77);
    expect(s.joiners).toEqual({ stays: [], waiting: [], rigsParked: 0, day: -1 });
    expect(s.stock.modular_unit).toBe(0);
  });
  it('rigs and modular homes are homes for every table that lists homes', () => {
    for (const k of ['travel_trailer', 'rv_camper', 'modular_home']) { expect(isHome(k)).toBe(true); expect(HOME_BEDS[k]).toBeGreaterThan(0); expect(BLUEPRINTS[k].stages).toHaveLength(5); }
    void newcomersDay; void admitNewcomers; void rollKit; void settleStay; void orderProblem;
  });
});

describe('assigned quarters (sim/quarters.ts)', () => {
  it('a joiner household is a household, lives in its own rig, and nobody else is auto-assigned to it', async () => {
    const { householdsOf, quarterHomes } = await import('./quarters');
    const g = peace(7);
    fin(g, 'timber_cabin');
    const e = at(g, 10, { rig: 'rv_camper' }); e.stay = 'rig';
    resolve(g, 'take_in');
    const rig = g.structures.find(x => x.kind === 'rv_camper')!;
    const mine = e.people!.map(p => g.people.find(q => q.id === p.id)!);
    expect(householdsOf(g.people).some(h => mine.every(m => h.members.some(x => x.id === m.id)))).toBe(true);
    const beds = g.structures.filter(isFinished).map(st => ({ where: st.id, beds: HOME_BEDS[st.kind] ?? 0, kind: st.kind })).filter(b => b.beds > 0);
    const q = quarterHomes(g, g.people, beds, new Set());
    for (const p of g.people) if (!mine.some(m => m.id === p.id)) expect(q.get(p.id)).not.toBe(rig.id);
    for (const p of mine.slice(0, HOME_BEDS.rv_camper)) expect(q.get(p.id)).toBe(rig.id);
  });
});
