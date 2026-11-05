import { afterEach, describe, expect, it } from 'vitest';
import { newGame, hourOf, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { planBattle } from './battle';
import { hireGuard, onShift } from './guards';
import { INSIDER, insiderDay, isPlant, isThreat, isVetted, loyaltyTarget, startVet, startVetBond, suspectCard, turnChance } from './insider';
import { resolve } from './encounters';
import { admitNewcomers, newcomersOf } from './newcomers';
import { BLUEPRINTS } from './blueprints';
import type { Person } from './family';

afterEach(() => setGroundOverride(null));
const game = (seed = 2): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.money = 500_000;
  g.structures.push({ id: 'home', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  return g;
};
const person = (id: string): Person => ({ id, first: id, last: 'X', age: 30, kid: false, body: 'm', skills: { builder: 1, gardener: 1, medic: 1, mechanic: 1, hunter: 1, negotiator: 1, teacher: 1, radio: 1 }, shirt: 0 });
const days = (g: GameState, n: number): string[] => { const out: string[] = []; for (let i = 0; i < n; i++) { g.clock.t += 1; out.push(...insiderDay(g)); } return out; };
/** Hire until the first guard is (or is not) a plant. */
const withGuard = (plant: boolean): GameState => {
  for (let seed = 1; seed < 400; seed++) { const g = game(seed); hireGuard(g); if (!!g.guards.staff[0].plant === plant) return g; }
  throw new Error('no such seed');
};

describe('plants and wages', () => {
  it('the plant is fixed by the seed and his id, and a few percent of applicants', () => {
    expect(isPlant(3, 'g9')).toBe(isPlant(3, 'g9'));
    const n = Array.from({ length: 2000 }, (_, i) => isPlant(7, `g${i}`)).filter(Boolean).length;
    expect(n).toBeGreaterThan(50); expect(n).toBeLessThan(160);
  });
  it('a below-rate wage pulls loyalty down and buys him sooner; a high wage lifts it', () => {
    const g = game(); hireGuard(g); const x = g.guards.staff[0];
    g.guards.wage = 'low'; const low = loyaltyTarget(g, x);
    g.guards.wage = 'fair'; const fair = loyaltyTarget(g, x);
    g.guards.wage = 'high'; const high = loyaltyTarget(g, x);
    expect(low).toBeLessThan(fair); expect(fair).toBeLessThan(high);
    expect(turnChance(low)).toBeGreaterThan(turnChance(fair));
    expect(turnChance(high)).toBeLessThanOrEqual(turnChance(fair));
    expect(turnChance(100)).toBeLessThan(INSIDER.BASE);
  });
});

describe('background checks', () => {
  it('cost money, take days, and a clean man is cleared: loyal for good', () => {
    const g = withGuard(false); const id = g.guards.staff[0].id, m = g.money;
    expect(startVet(g, id)).toBeNull(); expect(g.money).toBe(m - INSIDER.VET_COST);
    expect(startVet(g, id)).toMatch(/under way/);
    days(g, INSIDER.VET_DAYS - 2); expect(g.guards.staff[0].vet).toBe('pending');
    days(g, 3); expect(isVetted(g.guards.staff[0])).toBe(true);
    expect(startVet(g, id)).toMatch(/already cleared/);
    const poor = withGuard(false); poor.money = 10; expect(startVet(poor, poor.guards.staff[0].id)).toMatch(/costs/);
  });
  it('they find a plant nine times in ten; the tenth is cleared and never a threat again', () => {
    let found = 0, passed = 0;
    for (let seed = 1; seed < 900; seed++) {
      const g = game(seed); hireGuard(g); const x = g.guards.staff[0];
      if (!x.plant) continue;
      startVet(g, x.id); days(g, INSIDER.VET_DAYS + 1);
      if (!g.guards.staff.includes(x)) continue;   // (he acted before the result and drove off)
      if (x.vet === 'flagged') found++; else { passed++; expect(x.vet).toBe('cleared'); expect(isThreat(x)).toBe(false); }
      g.gate.pending = null;
    }
    expect(found + passed).toBeGreaterThan(20);
    expect(found / (found + passed)).toBeGreaterThan(0.75);
  });
  it('screening new hires starts the check at hiring', () => {
    const g = game(); g.guards.vetNew = true; const m = g.money; hireGuard(g);
    expect(g.guards.staff[0].vet).toBe('pending'); expect(g.money).toBe(m - INSIDER.VET_COST);
  });
});

describe('the insider threat applies only to the unvetted', () => {
  it('a vetted guard never turns, never acts and never raises a card, however low his loyalty or wage', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = game(seed); hireGuard(g); const x = g.guards.staff[0];
      startVet(g, x.id); days(g, INSIDER.VET_DAYS + 1);
      if (x.vet !== 'cleared') continue;   // (a flagged plant is dismissed, below)
      g.gate.pending = null; g.guards.wage = 'low';
      const lines: string[] = [];
      for (let d = 0; d < 365; d++) { g.clock.t += 1; x.loyalty = 0; lines.push(...insiderDay(g)); expect(g.gate.pending).toBeNull(); }
      expect(x.turned).toBeFalsy(); expect(g.gate.comeBack).toBeFalsy(); expect(lines).toEqual([]); expect(g.guards.staff.length).toBe(1);
    }
  });
  it('an unvetted guard on a below-rate wage is bought within a couple of years; on a high wage rarely', () => {
    let low = 0, high = 0;
    for (let seed = 1; seed <= 80; seed++) {
      for (const wage of ['low', 'high'] as const) {
        const g = game(seed); g.guards.wage = wage; hireGuard(g); const x = g.guards.staff[0]; x.plant = false;
        let t = false;
        for (let d = 0; d < 730 && !t; d++) { g.clock.t += 1; insiderDay(g); g.gate.pending = null; g.gate.comeBack = null; t = !!x.turned; }
        if (t) { if (wage === 'low') low++; else high++; }
      }
    }
    expect(low).toBeGreaterThan(50); expect(high).toBeLessThan(25);
  });
  it('a compromised guard leaks, opens the gate or steals, and sometimes is noticed (a dismissal card)', () => {
    let crew = 0, open = 0, stole = 0, cards = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const g = game(seed); g.fin.cash = 4000; g.armory.ammo['556'] = 400; hireGuard(g); g.guards.staff[0].plant = true;
      for (let d = 0; d < 300 && g.guards.staff.length; d++) {
        g.clock.t += 1; const lines = insiderDay(g);
        if (g.gate.pending?.kind === 'insider') { cards++; break; }
        if (g.gate.comeBack?.insider) { open++; break; }
        if (g.gate.comeBack) { crew++; break; }
        if (lines.some(l => /half the cash/.test(l))) { stole++; expect(g.fin.cash).toBe(2000); expect(g.armory.ammo['556']).toBe(200); break; }
      }
    }
    expect(cards).toBeGreaterThan(20); expect(crew + open + stole).toBeGreaterThan(5);
  });
  it('the dismissal card: let him go removes him; keep him leaves him and the card is not repeated for a month', () => {
    const g = game(); hireGuard(g); const x = g.guards.staff[0]; x.plant = true;
    g.gate.pending = suspectCard(g, { kind: 'guard', id: x.id, name: x.name }, 'noticed');
    expect(resolve(g, 'dismiss').tone).toBe('good'); expect(g.guards.staff.length).toBe(0);
    const h = game(); hireGuard(h); const y = h.guards.staff[0]; y.plant = true;
    h.gate.pending = suspectCard(h, { kind: 'guard', id: y.id, name: y.name }, 'noticed');
    resolve(h, 'ignore'); expect(h.guards.staff.length).toBe(1); expect(y.ignoredAt).toBeDefined();
    let cards = 0;
    for (let d = 0; d < INSIDER.REASK - 1; d++) { h.clock.t += 1; insiderDay(h); if (h.gate.pending) { cards++; h.gate.pending = null; } h.gate.comeBack = null; }
    expect(cards).toBe(0);
  });
  it('a loner taken in at the end of the contract is loyal for good: no roll touches him', () => {
    const g = game(); hireGuard(g); const x = g.guards.staff[0]; x.alone = true;
    g.gate.pending = { id: 'gs', kind: 'guard_stay', day: 0, guardId: x.id, title: '', dossier: [], size: 1, armed: true, strength: 0, people: [x.person], stances: ['take_in', 'turn_away'] };
    resolve(g, 'take_in');
    const b = newcomersOf(g).bonds[x.person.id];
    expect(b.vet).toBe('cleared'); expect(b.secret).toBe('solid');
    for (let d = 0; d < 800; d++) { g.clock.t += 1; b.loyalty = 0; b.revealed = false; insiderDay(g); }
    expect(b.secret).toBe('solid');
  });
  it('an unvetted joiner who is badly unhappy can be bought; a checked one cannot', () => {
    let bought = 0, kept = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = game(seed);
      admitNewcomers(g, [person('pa')], { kind: 'stranger' }); admitNewcomers(g, [person('pb')], { kind: 'stranger' });
      const A = newcomersOf(g).bonds.pa, B = newcomersOf(g).bonds.pb;
      expect(startVetBond(g, 'pb')).toBeNull();
      for (let d = 0; d < 400; d++) { g.clock.t += 1; A.loyalty = 0; B.loyalty = 0; A.revealed = false; B.revealed = false; insiderDay(g); g.gate.pending = null; }
      if (A.secret === 'scout') bought++;
      if (B.secret === 'solid' && B.vet === 'cleared') kept++;
    }
    expect(bought).toBeGreaterThan(40); expect(kept).toBe(60);
  });
  it('a flagged joiner gets the dismissal card', () => {
    for (let seed = 1; seed < 100; seed++) {
      const g = game(seed);
      admitNewcomers(g, [person('pt')], { kind: 'stranger', secret: 'thief' });
      startVetBond(g, 'pt');
      for (let d = 0; d < 6; d++) { g.clock.t += 1; insiderDay(g); }
      if (g.gate.pending?.kind === 'insider') {
        expect(g.gate.pending.suspect?.kind).toBe('joiner'); resolve(g, 'dismiss');
        expect(g.personState[g.people.findIndex(p => p.id === 'pt')].needs.left).toBe(true); return;
      }
    }
    throw new Error('never flagged');
  });
});

// ── monotone against the never-hired baseline ────────────────────────────
const N = 150;
function base(seed = 3): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.site = { ...g.site, creek: false };
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 3000;
  g.money = 500_000;
  g.clock.t = Math.floor(g.disaster.hitAt + 60) + 0.8;
  for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length;
  return g;
}
const rate = (g: GameState, crew: number, opts = {}): number => { let n = 0; for (let seed = 1; seed <= N; seed++) { const r = planBattle(g, crew, seed, opts).result; if (r === 'breached' || r === 'overrun') n++; } return n / N; };
const notWorse = (without: number, withEl: number) => { const sd = Math.sqrt((without * (1 - without) + withEl * (1 - withEl)) / N); expect(withEl).toBeLessThanOrEqual(without + 2 * sd + 1e-9); };
/** Guards on every shift, the clock at an hour when one is on. */
/** (hired before the agency closes: they stay through the collapse) */
const hire = (g: GameState, n: number): void => { const tr = g.disaster.tracks; g.disaster.tracks = { ...tr, law: 1, banks: 1 }; for (let i = 0; i < n; i++) hireGuard(g); g.disaster.tracks = tr; };
const guarded = (g: GameState, vet: boolean): void => { hire(g, 3); if (vet) for (const x of g.guards.staff) x.vet = 'cleared'; g.clock.t = Math.floor(g.clock.t) + 0.8; expect(g.guards.staff.some(x => onShift(x, hourOf(g.clock.t)))).toBe(true); };

describe('monotone against the never-hired baseline (crews of 6 and 10)', () => {
  for (const crew of [6, 10]) {
    it(`three vetted guards never make a raid easier (crew of ${crew})`, () => {
      const a = base(), b = base(); guarded(b, true);
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
    it(`three unvetted but honest guards never make a raid easier (crew of ${crew})`, () => {
      const a = base(), b = base(); guarded(b, false);
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
    it(`vetting a plant out leaves the lot as the never-hired lot (crew of ${crew})`, () => {
      const b = base(); hire(b, 1); const x = b.guards.staff[0]; x.plant = true;
      startVet(b, x.id);
      for (let d = 0; d < INSIDER.VET_DAYS + 2; d++) { b.clock.t += 1; insiderDay(b); if (b.gate.pending?.kind === 'insider') resolve(b, 'dismiss'); }
      if (b.guards.staff.length) expect(isThreat(b.guards.staff[0])).toBe(false);   // the 1 in 10 the check missed: cleared, loyal
      expect(b.gate.comeBack ?? null).toBeNull();
      b.clock.t = Math.floor(b.clock.t) + 0.8;
      notWorse(rate(base(), crew), rate(b, crew));
    }, 120000);
  }
  it('the price of skipping the check: a raid a bought guard opened has no wall to stop it', () => {
    expect(rate(base(), 8, { insideBreach: true })).toBeGreaterThanOrEqual(rate(base(), 8));
  }, 120000);
});
