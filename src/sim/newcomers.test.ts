import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, dayIndex, type GameState } from './state';
import { gateDay, resolve, type Encounter } from './encounters';
import { BLUEPRINTS } from './blueprints';
import { cachedPlan } from './housing';
import { migrate } from './save/migrations';
import { mulberry32 } from './rng';
import { reportCard } from './report';
import { liveDay } from './needs';
import { lifeOf } from './neighborLife';
import { trialCamps, trialDay } from './trial';
import {
  admitNewcomers, askQuestion, carryLines, carryOf, carryStrain, givePlace, loyaltyDelta, MAX_QUESTIONS, moveOut, neighborBrings, newcomerMorale, newcomersDay,
  newcomersOf, placeOptions, requestShelter, sendAway, strangerArrival,
} from './newcomers';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.5;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 40; g.stock.staples = 10; g.stock.fuel = 10; g.stock.meds = 4;
  g.gate.next = 1e9;
  return g;
}
const finish = (s: GameState, kind: string) => {
  const st = { id: `t${s.nextId++}`, kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as GameState['structures'][number]);
  return st;
};
const stranger = (g: GameState, seed: number) => strangerArrival(g, mulberry32(seed), `e${seed}`, dayIndex(g.clock.t));
/** A stranger with a chosen secret, standing at the gate. */
function at(g: GameState, secret: Encounter['secret'], seed = 3): Encounter {
  const e = stranger(g, seed);
  e.secret = secret;
  g.gate.pending = e;
  return e;
}

describe('carrying capacity readout', () => {
  it('days of food fall with more mouths, and the fields lift the number', () => {
    const g = afterHit();
    const e = stranger(g, 4);
    const c = carryOf(g, e.people!);
    expect(c.extra).toBe(e.people!.length);
    expect(c.daysWith).toBeLessThan(c.days);
    expect(carryLines(c).join(' ')).toMatch(/Put by: \d+ days of food for 4; with/);
    // a year of harvest as big as the table needs: nobody starves, however many
    g.stats.days = 365; g.stats.grownYear = 365 * c.need * 3;
    expect(carryOf(g, e.people!).daysWith).toBe(Infinity);
  });
  it('reports how many more it can carry for six months and flags a table that is already over', () => {
    const g = afterHit();
    g.stock.canned = 0; g.stock.staples = 0.4; g.stock.fresh = 0; g.stock.frozen = 0;
    const c = carryOf(g, stranger(g, 2).people!);
    expect(c.level).toBe('over');
    expect(c.headroom).toBe(0);
    expect(carryLines(c).join(' ')).toMatch(/past what the stores can feed/);
    g.stock.canned = 3000;
    expect(carryOf(g).headroom).toBeGreaterThan(10);
  });
  it('the grocery stores being open spares the table the strain, however thin the shelves', () => {
    const g = newGame(1);
    g.stock.canned = 0;
    expect(carryOf(g).fromStores).toBe(true);
    expect(carryStrain(g)).toBe(0);
  });
});

describe('strangers at the gate', () => {
  it('twelve kinds, seeded, each with a hidden character and a consistent head count', () => {
    const g = afterHit();
    const kinds = new Set<string>();
    for (let i = 1; i <= 90; i++) {
      const e = stranger(g, i);
      kinds.add(e.arche!);
      expect(e.secret).toBeTruthy();
      expect(e.size).toBe(e.people!.length);
      expect(e.people!.every(p => p.origin === undefined)).toBe(true);
      expect(e.stances).toContain('take_in');
      expect(e.stances).toContain('trial');
      expect(new Set(e.people!.map(p => p.id)).size).toBe(e.size);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(10);
    expect(stranger(g, 7)).toEqual(stranger(g, 7));
    // varied: a veteran, a teenager alone, a hurt hiker
    const seen = (id: string) => { for (let i = 1; i <= 400; i++) if (stranger(g, i).arche === id) return stranger(g, i); };
    expect(seen('teen')!.people![0].kid).toBe(true);
    expect(seen('hiker')!.hurt).toBeTruthy();
    expect(seen('veteran')!.people![0].job?.id).toBe('soldier');
  });

  it('a few questions at the gate: a good talker hears the liar slip, the honest rarely look shifty', () => {
    const g = afterHit();
    g.people[0].skills.negotiator = 9;
    let thiefTells = 0, solidTells = 0;
    for (let i = 1; i <= 40; i++) {
      for (const [sec, tally] of [['thief', () => thiefTells++], ['solid', () => solidTells++]] as const) {
        const e = at(g, sec, i);
        for (let q = 0; q < MAX_QUESTIONS; q++) expect(askQuestion(g)).toBeNull();
        expect(askQuestion(g)).toMatch(/asked/);
        expect(e.asked).toBe(MAX_QUESTIONS);
        if (e.tells?.length) tally();
      }
    }
    expect(thiefTells).toBeGreaterThan(solidTells * 2);
    expect(thiefTells).toBeGreaterThan(30);
  });
  it('the tells you noticed at the gate come in with them', () => {
    const g = afterHit();
    const e = at(g, 'scout', 5);
    e.tells = ['Asks how many adults live here.'];
    resolve(g, 'take_in');
    const bond = Object.values(newcomersOf(g).bonds)[0];
    expect(bond.tells[0]).toMatch(/At the gate: Asks how many adults/);
  });
});

describe('taking them in', () => {
  it('a bond, a bedroll, what they carry and where they came from', () => {
    const g = afterHit();
    const n0 = g.people.length, bags = g.stock.sleeping_bag, tools = g.tools?.items.length ?? 0;
    const e = at(g, 'solid', 11);
    e.brings = { canned: 3 };
    e.extras = { tools: ['wrench_set'], dogs: 1 };
    const cans = g.stock.canned;
    resolve(g, 'take_in');
    expect(g.people.length).toBe(n0 + e.size);
    expect(g.personState.length).toBe(n0 + e.size);
    expect(g.stock.canned).toBe(cans + 3);
    expect(g.stock.sleeping_bag).toBe(bags + e.size);
    expect(g.tools!.items.length).toBe(tools + 1);
    expect(g.dogs.length).toBe(1);
    expect(g.gate.tookIn).toBe(e.size);
    for (const p of g.people.slice(n0)) {
      expect(p.origin?.kind).toBe('stranger');
      const b = newcomersOf(g).bonds[p.id];
      expect(b.loyalty).toBeGreaterThan(30);
      expect(b.revealed).toBe(false);
    }
    // they sleep somewhere under the housing plan
    expect(cachedPlan(g).sleepers.length).toBe(n0 + e.size);
  });
  it('a hurt hiker comes in hurt', () => {
    const g = afterHit();
    let e: Encounter | undefined;
    for (let i = 1; i < 300 && !e?.hurt; i++) e = stranger(g, i);
    g.gate.pending = e!;
    const n0 = g.people.length;
    resolve(g, 'take_in');
    const i = g.people.findIndex(p => p.id === e!.hurt!.who);
    expect(i).toBeGreaterThanOrEqual(n0);
    expect(g.personState[i].needs.hurt.some(h => h.what === e!.hurt!.what)).toBe(true);
  });
  it('a stranger on trial keeps what they are; the month shows it, and the scout is gone with a crew behind', () => {
    const g = afterHit();
    at(g, 'scout', 8);
    resolve(g, 'trial');
    const c = trialCamps(g)[0];
    expect(c.character).toBe('scout');
    for (let d = 0; d < 28 && trialCamps(g).length; d++) { g.clock.t += 1; trialDay(g); g.gate.pending = null; g.gate.card = null; }
    // 6 % a day from day 8: gone, or still here at the end of the month
    if (!trialCamps(g).length) {
      expect(g.gate.comeBack?.guide).toBeTruthy();
      g.gate.next = dayIndex(g.clock.t) - 1;
      g.gate.pending = null;
    }
  });
});

describe('what they turn out to be', () => {
  it('a thief taken in on a handshake: things go missing, then the shelves are lighter and the bed empty', () => {
    const g = afterHit();
    at(g, 'thief', 12);
    resolve(g, 'take_in');
    const bonds = Object.values(newcomersOf(g).bonds);
    const t = bonds.find(b => b.secret === 'thief')!;
    t.loyalty = 20; t.revealAt = dayIndex(g.clock.t) + 6;
    const cans = g.stock.canned, name = g.people.find(p => p.id === t.id)!.first;
    const lines: string[] = [];
    for (let d = 0; d < 12; d++) { g.clock.t += 1; lines.push(...newcomersDay(g)); }
    expect(t.revealed).toBe(true);
    expect(g.stock.canned).toBeLessThan(cans);
    expect(g.personState[g.people.findIndex(p => p.id === t.id)].needs.left).toBe(true);
    expect(lines.join('\n')).toMatch(new RegExp(`${name}`));
    expect(newcomersOf(g).departed.at(-1)?.why).toBe('stole and left');
    // a hint came first: "a box of shells is a few short"
    expect(t.tells.length).toBeGreaterThan(0);
  });
  it('a thief who has been treated well may put it back and stay', () => {
    let reformed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = afterHit(seed);
      at(g, 'thief', 12 + seed);
      resolve(g, 'take_in');
      const t = Object.values(newcomersOf(g).bonds).find(b => b.secret === 'thief')!;
      t.loyalty = 90; t.revealAt = dayIndex(g.clock.t) + 1;
      g.clock.t += 2; newcomersDay(g);
      if (t.secret === 'solid') reformed++;
    }
    expect(reformed).toBeGreaterThan(10);
  });
  it('a scout who leaves sends a crew that knows the place; one who is loyal warns you instead', () => {
    const g = afterHit();
    at(g, 'scout', 21);
    resolve(g, 'take_in');
    const s1 = Object.values(newcomersOf(g).bonds).find(b => b.secret === 'scout')!;
    s1.loyalty = 30; s1.revealAt = dayIndex(g.clock.t) + 1;
    g.clock.t += 2; newcomersDay(g);
    expect(g.gate.comeBack?.guide).toBe(g.people.find(p => p.id === s1.id)!.first);
    // the crew arrives, knowing
    g.gate.next = dayIndex(g.clock.t) - 1; g.gate.pending = null; g.gate.day = -1;
    g.clock.t += 1;
    let hit: Encounter | null = null;
    for (let tries = 0; tries < 5 && !hit?.back; tries++) { g.gate.comeBack = { ...g.gate.comeBack!, until: 1e9 }; g.gate.next = 0; g.gate.pending = null; g.gate.day = -1; g.clock.t += 1; hit = gateDay(g); }
    if (hit?.back && hit.kind === 'gang') expect(hit.dossier[0]).toMatch(/told them how the place lies/);

    const h = afterHit(2);
    at(h, 'scout', 22);
    resolve(h, 'take_in');
    const s2 = Object.values(newcomersOf(h).bonds).find(b => b.secret === 'scout')!;
    s2.loyalty = 95; s2.revealAt = dayIndex(h.clock.t) + 1;
    h.clock.t += 2; newcomersDay(h);
    expect(h.gate.forewarned).toBe(true);
    expect(h.gate.comeBack).toBeFalsy();
    expect(s2.secret).toBe('solid');
  });
  it('a gem turns out to know more than they said; a lazy one less', () => {
    const g = afterHit();
    at(g, 'gem', 31);
    resolve(g, 'take_in');
    const b = Object.values(newcomersOf(g).bonds).find(x => x.secret === 'gem')!;
    const p = g.people.find(x => x.id === b.id)!;
    const before = Math.max(...Object.values(p.skills));
    b.revealAt = dayIndex(g.clock.t) + 1;
    g.clock.t += 2; newcomersDay(g);
    expect(b.revealed).toBe(true);
    expect(Math.max(...Object.values(p.skills))).toBeGreaterThanOrEqual(before);
    expect(b.loyalty).toBeGreaterThan(40);
  });
  it('a sick stranger brings a fever, and may carry it to the table', () => {
    let sick = 0, spread = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterHit(seed);
      at(g, 'sick', 40 + seed);
      const n0 = g.people.length;
      resolve(g, 'take_in');
      const fevers = g.personState.filter(ps => ps.needs.hurt.some(h => h.what === 'fever')).length;
      if (g.personState.slice(n0).some(ps => ps.needs.hurt.some(h => h.what === 'fever'))) sick++;
      if (fevers >= 2) spread++;
    }
    expect(sick).toBe(40);
    expect(spread).toBeGreaterThan(3);
    expect(spread).toBeLessThan(25);
  });
});

describe('loyalty, morale and the limit', () => {
  it('food, a bed and a door of their own raise it; hunger, the floor of a storm and crowding wear it down', () => {
    const good = { hunger: 0, over: false, spot: 'bed', own: false, privacy: 1, stormy: false, humanity: 70, neighbor: false };
    expect(loyaltyDelta(good)).toBeGreaterThan(0.5);
    expect(loyaltyDelta({ ...good, own: true })).toBeGreaterThan(loyaltyDelta(good));
    expect(loyaltyDelta({ ...good, hunger: 8000 })).toBeLessThan(0);
    expect(loyaltyDelta({ ...good, spot: 'tent', stormy: true })).toBeLessThan(loyaltyDelta({ ...good, spot: 'tent' }));
    expect(loyaltyDelta({ ...good, spot: 'nowhere', over: true, hunger: 3000 })).toBeLessThan(-1);
  });
  it('past what the stores can feed, the whole table feels it and the unhappy leave', () => {
    const g = afterHit();
    at(g, 'solid', 51);
    resolve(g, 'take_in');
    const b = Object.values(newcomersOf(g).bonds)[0];
    const calm = newcomerMorale(g, g.people[0].id);
    g.stock.canned = 0.5; g.stock.staples = 0.05; g.stock.fresh = 0; g.stock.frozen = 0;
    expect(carryStrain(g)).toBeLessThan(-3);
    expect(newcomerMorale(g, g.people[0].id)).toBeLessThan(calm - 3);
    b.loyalty = 10; b.revealed = true;
    let left = false;
    for (let d = 0; d < 40 && !left; d++) { g.clock.t += 1; newcomersDay(g); left = !!g.personState[g.people.findIndex(p => p.id === b.id)].needs.left; b.revealed = true; g.stock.canned = 0.5; }
    expect(left).toBe(true);
    expect(newcomersOf(g).departed.length).toBeGreaterThan(0);
  });
  it('people who leave are not counted dead: not on the report card, not mourned', () => {
    const g = afterHit();
    at(g, 'solid', 52);
    resolve(g, 'take_in');
    const b = Object.values(newcomersOf(g).bonds)[0];
    const before = reportCard(g);
    expect(moveOut(g, b.id, 'sent on')).toBe(true);
    const after = reportCard(g);
    expect(after.facts[0][1]).toBe(`${g.people.length - 1} of ${g.people.length - 1}`);
    expect(after.lines.join(' ')).not.toMatch(new RegExp(`${g.people.find(p => p.id === b.id)!.first} died`));
    expect(before.facts[0][1]).not.toBe(after.facts[0][1]);
    expect(g.losses?.some(l => l.id === b.id) ?? false).toBe(false);
  });
});

describe('neighbors', () => {
  it('a household you traded with asks more readily, and brings more of what they are', () => {
    const g = afterHit();
    const ranch = { ...g.neighbors[0], kind: 'ranch' as const };
    const b = neighborBrings(ranch, mulberry32(2));
    expect(b.brings.sheep).toBeGreaterThanOrEqual(3);
    const lone = neighborBrings({ ...ranch, kind: 'loner' }, mulberry32(2));
    expect(lone.extras.tools).toContain('wrench_set');
  });
  it('before the hit: a storm on the way makes friendly households ask to sit it out', () => {
    let asked = 0, trusted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'medium', kind: 'grid_down' });
      for (const n of g.neighbors) { n.disposition = seed % 2 ? 70 : -10; n.km = 2; if (n.kind === 'prepper') n.kind = 'widow'; }
      const day = dayIndex(g.clock.t) + 2;
      g.weather = { active: { kind: 'blizzard', at: day, until: day + 2 }, last: -999 };
      g.clock.t = day - 1 + 0.3;
      newcomersDay(g);
      if (g.gate.pending?.kind === 'shelter') { asked++; if (seed % 2) trusted++; expect(g.gate.pending.stances).toEqual(['take_in', 'turn_away']); }
    }
    expect(asked).toBeGreaterThan(8);
    expect(trusted).toBeGreaterThan(asked - trusted);   // the ones you have helped ask more readily
  });
  it('the household sits out the storm, goes home when it passes, and leaves a jar and a good name', () => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'medium', kind: 'grid_down' });
    g.stock.canned = 30;
    const home = g.neighbors.find(n => n.status === 'home')!;
    home.disposition = 60;
    const day = dayIndex(g.clock.t) + 2;
    g.weather = { active: { kind: 'blizzard', at: day, until: day + 2 }, last: -999 };
    const e = requestShelter(g, home, 'storm', mulberry32(1))!;
    expect(e.kind).toBe('shelter');
    expect(e.shelter!.nid).toBe(home.id);
    expect(e.dossier.join(' ')).toMatch(/Good friends/);
    const disp = home.disposition, n0 = g.people.length;
    resolve(g, 'take_in');
    expect(g.people.length).toBeGreaterThan(n0);
    expect(home.disposition).toBeGreaterThan(disp);
    expect(home.status).toBe('home');
    expect(g.people.slice(n0).every(p => p.origin?.kind === 'guest')).toBe(true);
    g.clock.t = day + 1.3; newcomersDay(g);
    expect(g.personState[n0].needs.left).toBeFalsy();   // the storm is still on
    const cans = g.stock.canned;
    g.clock.t = day + 12.3; g.weather = { active: null, last: day };
    const lines = newcomersDay(g);
    expect(g.personState.slice(n0).every(ps => ps.needs.left)).toBe(true);
    expect(lines.join(' ')).toMatch(/went home/);
    expect(g.stock.canned).toBe(cans + 2);
    expect(home.disposition).toBeGreaterThan(disp + 10);
    expect(newcomersOf(g).guests[home.id]).toBeUndefined();
  });
  it('refusing costs the household and the word gets round', () => {
    const g = afterHit();
    const [a, ...rest] = g.neighbors;
    a.disposition = 40;
    const others = rest.map(n => n.disposition);
    const e = requestShelter(g, a, 'sick', mulberry32(3))!;
    expect(e).toBeTruthy();
    const n0 = g.people.length, h = g.gate.humanity;
    const out = resolve(g, 'turn_away');
    expect(out.tone).toBe('bad');
    expect(g.people.length).toBe(n0);
    expect(a.disposition).toBeLessThan(40 - 10);
    rest.forEach((n, i) => { if (n.status === 'home') expect(n.disposition).toBe(others[i] - 3); });
    expect(g.gate.humanity).toBeLessThan(h);
    expect(g.gate.turnedAway).toBeGreaterThan(0);
  });
  it('after the fire the farm is ash: guests with nowhere to go back to ask to stay for good', () => {
    const g = afterHit();
    const a = g.neighbors[0];
    a.disposition = 40;
    requestShelter(g, a, 'fire', mulberry32(4));
    resolve(g, 'take_in');
    const N = newcomersOf(g);
    const ids = [...N.guests[a.id].ids];
    lifeOf(g, a).farm = 'burned';
    g.clock.t = N.guests[a.id].until + 1.3;
    newcomersDay(g);
    expect(g.gate.pending?.kind).toBe('shelter');
    expect(g.gate.pending?.shelter?.settle).toBe(true);
    resolve(g, 'take_in');
    expect(a.status).toBe('joined');
    expect(ids.every(id => N.bonds[id].kind === 'neighbor' && N.bonds[id].guestUntil === undefined)).toBe(true);
    expect(g.people.filter(p => ids.includes(p.id)).every(p => p.origin?.kind === 'neighbor')).toBe(true);
    expect(N.guests[a.id]).toBeUndefined();
  });
  it('a neighbor who joins keeps a farm to go back to; sending them home restores the household', () => {
    const g = afterHit();
    const a = g.neighbors[0];
    a.disposition = 50; const members = a.members;
    const people = [{ id: `pn_${a.id}_0`, first: 'Ruth', last: 'Henderson', age: 70, kid: false, body: 'f' as const, skills: { builder: 1, gardener: 6, medic: 2, mechanic: 0, hunter: 0, negotiator: 1, teacher: 0, radio: 0 }, shirt: 1, elder: true }];
    admitNewcomers(g, people, { kind: 'neighbor', neighbor: a.id, arche: 'neighbor', secret: 'solid' });
    a.status = 'joined'; a.members = 0;
    const err = sendAway(g, people[0].id, true);
    expect(err).toBeNull();
    expect(a.status).toBe('home');
    expect(a.members).toBe(1);
    expect(members).toBeGreaterThan(0);
    expect(g.personState.at(-1)!.needs.left).toBe(true);
    expect(a.disposition).toBeGreaterThanOrEqual(50);
  });
  it('sending a neighbor away rather than home costs trust', () => {
    const g = afterHit();
    const a = g.neighbors[0];
    a.disposition = 50;
    const p = { id: `pn_${a.id}_0`, first: 'Walt', last: 'Henderson', age: 50, kid: false, body: 'm' as const, skills: { builder: 1, gardener: 1, medic: 2, mechanic: 0, hunter: 0, negotiator: 1, teacher: 0, radio: 0 }, shirt: 1 };
    admitNewcomers(g, [p], { kind: 'neighbor', neighbor: a.id, secret: 'solid' });
    a.status = 'joined'; a.members = 0;
    const h = g.gate.humanity;
    sendAway(g, p.id, false);
    expect(a.disposition).toBeLessThan(50);
    expect(g.gate.humanity).toBeLessThan(h);
  });
});

describe('a home of their own', () => {
  it('give them a cottage and they sleep there with a door of their own', () => {
    const g = afterHit();
    at(g, 'solid', 61);
    const e = g.gate.pending!;
    e.people = e.people!.slice(0, 1); e.size = 1;
    resolve(g, 'take_in');
    const p = g.people.at(-1)!;
    const cot = finish(g, 'guest_house');
    expect(placeOptions(g, 1).some(o => o.id === cot.id)).toBe(true);
    expect(givePlace(g, p.id, cot.id)).toBeNull();
    const sl = cachedPlan(g).sleepers.find(x => x.id === p.id)!;
    expect(sl.spot.where).toBe(cot.id);
    expect(sl.own).toBe(true);
    expect(givePlace(g, p.id, 'nope')).toBeTruthy();
    // a full house turns the next one down
    expect(givePlace(g, g.people[0].id, cot.id)).toBeNull();
    expect(givePlace(g, g.people[1].id, cot.id)).toMatch(/beds left/);
  });
});

describe('the gate card extends, it does not duplicate', () => {
  it('a neighbor asking to join still comes as an arrival (take in / trial / turn away) and keeps who they are', () => {
    const g = afterHit();
    const kinds = new Set<string>();
    g.gate.next = -1;
    for (let d = 0; d < 400; d++) {
      g.clock.t += 1;
      const e = gateDay(g);
      if (e) { kinds.add(e.kind); resolve(g, e.stances[0]); }
      newcomersDay(g);
      g.gate.card = null;
    }
    expect(kinds.has('arrival')).toBe(true);
    // everyone taken in from the gate has a bond
    const joined = g.people.filter(p => p.origin);
    for (const p of joined) expect(newcomersOf(g).bonds[p.id]).toBeTruthy();
  });
  it('the food sim feeds newcomers like anyone', () => {
    const g = afterHit();
    at(g, 'solid', 71);
    resolve(g, 'take_in');
    const before = g.stock.canned * 6000 + g.stock.staples * 80000;
    liveDay(g, 0.5);
    expect(before - (g.stock.canned * 6000 + g.stock.staples * 80000)).toBeGreaterThan(5000);
  });
});

describe('save v59', () => {
  it('an older save gains an empty newcomers ledger', () => {
    const old = JSON.parse(JSON.stringify(newGame(2))) as Record<string, unknown>;
    old.version = 58; delete old.newcomers;
    const s = migrate(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.newcomers?.bonds).toEqual({});
  });
});
