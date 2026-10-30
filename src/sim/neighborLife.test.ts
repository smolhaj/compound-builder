import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { answerCallout, askPact, deathYear, dies, happen, holdChance, joinGroup, lifeOf, localsOf, neighborLifeDay, perDay, raidChance, raidHousehold, burnedFarms, stateWord } from './neighborLife';
import { defenders, MILITIA_MEN } from './pact';
import { resolve, type Encounter } from './encounters';
import { mulberry32 } from './rng';
import { ensurePlaces } from './scavenge';

function afterHit(seed = 1, days = 60): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + days;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, fuel: 0, medical: 0, grid: 0 };
  return g;
}
/** Run the neighbors' days only (fast). */
function days(g: GameState, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) { g.clock.t += 1; out.push(...neighborLifeDay(g)); if (g.gate.pending) g.gate.pending = null; g.gate.card = null; }
  return out;
}

describe('neighbors: aging, sickness, death', () => {
  it('Gompertz odds: rare young, common old, worse after the collapse', () => {
    expect(deathYear(30)).toBeCloseTo(0.001, 4);
    expect(deathYear(80)).toBeGreaterThan(0.05);
    expect(deathYear(80)).toBeLessThan(0.1);
    expect(deathYear(80, 3)).toBeCloseTo(deathYear(80) * 3, 6);
    expect(perDay(0.5)).toBeCloseTo(1 - Math.pow(0.5, 1 / 365), 8);
  });
  it('heads of households age a year at the new year', () => {
    const g = afterHit();
    const n = g.neighbors[0];
    neighborLifeDay(g);
    const a = lifeOf(g, n).head;
    days(g, 365);
    if (n.status === 'home') expect(lifeOf(g, n).head).toBe(a + 1);
  });
  it('over a few hard years households shrink, empty, leave; the empty farms open to scavenging', () => {
    let lost = 0, events = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = afterHit(seed, 20);
      const m0 = g.neighbors.reduce((a, n) => a + n.members, 0);
      days(g, 3 * 365);
      lost += m0 - g.neighbors.filter(n => !n.id.endsWith('_r')).reduce((a, n) => a + n.members, 0);
      events += g.neighbors.reduce((a, n) => a + lifeOf(g, n).history.length, 0);
      if (g.neighbors.some(n => n.status === 'left' || n.status === 'gone')) expect(ensurePlaces(g).some(p => p.neighbor)).toBe(true);
    }
    expect(lost).toBeGreaterThan(5);
    expect(events).toBeGreaterThan(10);
  });
});

describe('neighbors: raids, fire, news', () => {
  it('raids come once the law is gone; fewer inside a pact', () => {
    const g = afterHit();
    const n = g.neighbors[0];
    expect(raidChance(g, n)).toBeGreaterThan(0);
    const alone = raidChance(g, n);
    n.disposition = 60; askPact(g, n.id);
    expect(raidChance(g, n)).toBeLessThan(alone);
    g.disaster.tracks.law = 1;
    expect(raidChance(g, n)).toBe(0);
  });
  it('a household with guns and numbers holds more often', () => {
    const g = afterHit();
    const n = { ...g.neighbors[0], kind: 'prepper' as const, members: 4 };
    expect(holdChance(n, 4)).toBeGreaterThan(holdChance({ ...n, kind: 'widow', members: 1 }, 4));
    expect(holdChance(n, 4, 3)).toBeGreaterThan(holdChance(n, 4));
  });
  it('a savage crew burns the place; the family hears shots, then sees smoke, then gets the story', () => {
    const g = afterHit();
    const n = g.neighbors[0];
    n.km = 2; n.members = 1; n.kind = 'widow';
    const r = mulberry32(5);
    const res = raidHousehold(g, n, 10, 'savage', r);
    expect(res.held).toBe(false);
    expect(n.status).toBe('gone');
    happen(g, n, res.text, 'raid', r);
    const L = localsOf(g);
    expect(L.news.some(x => x.how === 'shots')).toBe(true);
    expect(lifeOf(g, n).history.at(-1)!.known).toBe(false);
    const out = days(g, 12);
    expect(out.some(l => /Shooting in the night/.test(l))).toBe(true);
    expect(lifeOf(g, n).history.at(-1)!.known).toBe(true);
    expect(burnedFarms(g)[0]).toBe(lifeOf(g, n).farm === 'burned');
  });
  it('news far off with no radio and nobody to gossip never comes', () => {
    const g = afterHit();
    const n = g.neighbors[0];
    n.km = 9; n.radio = false;
    for (const x of g.neighbors.slice(1)) x.status = 'gone';
    happen(g, n, 'Something happened out there.', 'quiet', mulberry32(1));
    expect(localsOf(g).news.length).toBe(0);
  });
});

describe('neighbors: joining, refugees, groups', () => {
  it('a household left alone asks to come in; taken in, they become family', () => {
    let asked = 0, joined = 0;
    for (let seed = 1; seed <= 12 && !joined; seed++) {
      const g = afterHit(seed, 40);
      for (const n of g.neighbors) { n.disposition = 60; if (n.kind === 'widow' || n.kind === 'old_farmer') n.members = 1; }
      for (let i = 0; i < 400 && !g.gate.pending; i++) { g.clock.t += 1; neighborLifeDay(g); g.gate.card = null; }
      const e = g.gate.pending as Encounter | null;
      if (!e?.neighbor) continue;
      asked++;
      const n = g.neighbors.find(x => x.id === e.neighbor)!;
      const before = g.people.length;
      resolve(g, 'take_in');
      expect(g.people.length).toBeGreaterThan(before);
      g.clock.t += 1; neighborLifeDay(g);
      expect(n.status).toBe('joined');
      expect(stateWord(g, n)).toBe('living with you');
      joined++;
    }
    expect(asked).toBeGreaterThan(0);
    expect(joined).toBe(1);
  });
  it('refugees settle nearby in the first year (up to three households)', () => {
    let settled = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = afterHit(seed, 20);
      days(g, 380);
      const r = g.neighbors.filter(n => lifeOf(g, n).origin === 'refugees');
      expect(r.length).toBeLessThanOrEqual(3);
      settled += r.length;
    }
    expect(settled).toBeGreaterThan(0);
  });
  it('the neighbors organize: a militia where it\'s lawless; the family can join', () => {
    let formed = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = afterHit(seed, 46);
      days(g, 200);
      const L = localsOf(g);
      if (!L.group) continue;
      formed++;
      const leader = g.neighbors.find(n => n.id === L.group!.leader);
      if (leader) leader.disposition = 50;
      expect(joinGroup(g)).toBeNull();
      expect(L.member).toBe(true);
    }
    expect(formed).toBeGreaterThan(2);
  });
});

describe('the mutual-defense pact', () => {
  it('only households that trust the family take it', () => {
    const g = afterHit();
    const n = g.neighbors[0];
    n.disposition = 0;
    expect(askPact(g, n.id)).toMatch(/trust/);
    n.disposition = 70;
    expect(askPact(g, n.id)).toBeNull();
    expect(localsOf(g).pact).toContain(n.id);
  });
  it('pact members come when there\'s shooting, radio or not (within earshot); the militia sends men', () => {
    const g = afterHit();
    const n = g.neighbors[0];
    n.radio = false; n.km = 2; n.disposition = 35; n.status = 'home'; n.members = 3; n.kind = 'ranch';
    expect(defenders(g).some(x => x.id === n.id)).toBe(false);
    askPact(g, n.id);
    expect(defenders(g).some(x => x.id === n.id)).toBe(true);
    n.km = 6;
    expect(defenders(g).some(x => x.id === n.id)).toBe(false);
    const L = localsOf(g);
    L.group = { kind: 'militia', name: 'the Bench Militia', founded: 0, leader: n.id, members: [n.id] };
    L.member = true;
    expect(defenders(g).find(x => x.id === 'militia')?.members).toBe(MILITIA_MEN);
  });
  it('at the gate: the pact cuts the raiders the family faces', () => {
    const fight = (pact: boolean) => {
      const g = afterHit(3, 60);
      for (const n of g.neighbors) { n.radio = false; n.disposition = 40; n.km = 1; n.members = 4; }
      if (pact) for (const n of g.neighbors) askPact(g, n.id);
      const e: Encounter = { id: 'e1', kind: 'gang', day: dayIndex(g.clock.t), title: 'An armed crew', dossier: [], size: 12, armed: true, strength: 140, wants: { canned: 4 }, stances: ['defend'] };
      g.gate.pending = e;
      resolve(g, 'defend');
      return g.gate.battle!.units.filter(u => u.side === 'raider').length;
    };
    expect(fight(true)).toBeLessThan(fight(false));
  });
  it('a pact member under attack calls; going helps them, staying home costs the pact', () => {
    let held = 0, tries = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = afterHit(seed, 60);
      const n = g.neighbors[0];
      n.disposition = 60; n.members = 3;
      askPact(g, n.id);
      const L = localsOf(g);
      L.callout = { neighbor: n.id, day: dayIndex(g.clock.t), raiders: 4, temper: 'hard' };
      const team = g.people.filter(p => !p.kid).map(p => p.id);
      expect(answerCallout(g, team)).toBeNull();
      tries++;
      if (lifeOf(g, n).history.at(-1)!.text.includes('broke and ran')) { held++; expect(n.disposition).toBeGreaterThan(60); }
    }
    expect(held).toBeGreaterThan(tries / 3);
    // nobody comes
    const g = afterHit(2, 60);
    const n = g.neighbors[0];
    n.disposition = 45; n.members = 3; n.kind = 'ranch';
    askPact(g, n.id);
    localsOf(g).callout = { neighbor: n.id, day: dayIndex(g.clock.t), raiders: 4, temper: 'hard' };
    g.clock.t += 1;
    neighborLifeDay(g);
    expect(localsOf(g).callout).toBeNull();
    expect(n.disposition).toBeLessThan(45);
    expect(localsOf(g).pact).not.toContain(n.id);
  });
  it('a shared work day every two weeks: hands on the family\'s build, or one of theirs away for the day', () => {
    const g = afterHit(1, 60);
    const n = g.neighbors[0];
    n.disposition = 60; n.members = 3;
    askPact(g, n.id);
    g.structures.push({ id: 'st1', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 0, done: 0, supplied: true, finishedAt: null });
    const L = localsOf(g);
    const out = days(g, 30);
    expect(out.some(l => /Work day/.test(l))).toBe(true);
    expect(out.some(l => /went to the work day/.test(l))).toBe(true);
    expect(L.workDay).toBeGreaterThan(dayIndex(g.clock.t) - 14);
  });
});

describe('neighbors: the last member of a household dies', () => {
  it('names the dead without throwing, for every household type', () => {
    const kinds = ['old_farmer', 'widow', 'young_family', 'prepper', 'ranch', 'loner'] as const;
    for (const kind of kinds) {
      const g = afterHit();
      const n = { ...g.neighbors[0], kind, members: 1 };
      const l = lifeOf(g, n);
      const text = dies(n, l, mulberry32(7), 'died in the night.');
      expect(n.members).toBe(0);
      expect(text).toMatch(/died in the night\.$/);
      expect(text).not.toMatch(/undefined|NaN/);
      expect(text[0]).toBe(text[0].toUpperCase());
      if (kind === 'old_farmer') expect(text.startsWith('Old ')).toBe(true);
    }
  });
});
