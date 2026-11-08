import { describe, expect, it } from 'vitest';
import { arsonOdds, holdingsOf, parleyAccepted, parleyOffer, planLoot, TRIBUTE_SHARE, FIREPROOF, type ParleyCtx } from './raidOutcomes';
import { raidText, leaderNameOf, lootLines } from './raidFacts';
import { mulberry32 } from './rng';
import { newGame } from './state';

const have = { canned: 30, staples: 20, frozen: 10, fresh: 8, fuel: 12, meds: 6, ifak: 4, animals: 5, ammo: 2000, guns: 3 };

describe('looting is specific items', () => {
  it('a gang goes for ammunition and guns first; hungry looters for food and medicine', () => {
    const r = () => 0.5;
    const gang = planLoot(have, { kind: 'gang', men: 8, truck: true, reached: 'house', share: 0.6 }, r), looters = planLoot(have, { kind: 'looters', men: 8, truck: false, reached: 'house', share: 0.6 }, r);
    expect(gang[0].what).toBe('ammo'); expect(looters[0].what).toBe('canned');
    expect(gang.map(i => i.what)).toContain('guns'); expect(looters.some(i => i.what === 'meds')).toBe(true);
  });
  it('a crew that holds only the yard takes animals and fuel and hardly touches the pantry; one in the house takes the house goods', () => {
    const r = () => 0.5;
    const yard = planLoot(have, { kind: 'looters', men: 8, truck: false, reached: 'yard', share: 0.4 }, r), house = planLoot(have, { kind: 'looters', men: 8, truck: false, reached: 'house', share: 0.6 }, r);
    const food = (l: ReturnType<typeof planLoot>) => l.filter(i => i.what === 'canned' || i.what === 'staples').reduce((a, i) => a + i.n, 0);
    expect(yard.some(i => i.from === 'yard')).toBe(true); expect(food(yard)).toBeLessThan(food(house) / 2);
  });
  it('is bounded by what is there and what they can carry; a truck carries more; nothing is invented', () => {
    const r = () => 0.5;
    for (const it of planLoot(have, { kind: 'gang', men: 8, truck: false, reached: 'house', share: 0.9 }, r)) expect(it.n).toBeLessThanOrEqual(have[it.what as keyof typeof have]);
    const two = planLoot(have, { kind: 'looters', men: 2, truck: false, reached: 'house', share: 0.9 }, r), eight = planLoot(have, { kind: 'looters', men: 8, truck: true, reached: 'house', share: 0.9 }, r);
    const sum = (l: ReturnType<typeof planLoot>) => l.reduce((a, i) => a + i.n, 0);
    expect(sum(two)).toBeLessThan(sum(eight));
    expect(planLoot({}, { kind: 'gang', men: 8, truck: true, reached: 'house', share: 0.9 }, r)).toEqual([]);
    expect(planLoot(have, { kind: 'horde', men: 8, truck: false, reached: 'house', share: 0.9 }, r)).toEqual([]);
  });
  it('reads the holdings off a game', () => {
    const g = newGame(1); g.stock.canned = 7; g.armory.guns.push({ id: 'g', model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: null as never });
    const h = holdingsOf(g as never);
    expect(h.canned).toBe(7); expect(h.guns).toBe(1);
  });
  it('says what was taken in words', () => { expect(lootLines([{ what: 'canned', n: 3, from: 'house' }, { what: 'ammo', n: 400, from: 'house' }])).toEqual(['3 cases of canned food', '400 rounds of ammunition']); });
});
describe('arson', () => {
  it('hostile crews burn, merciful ones almost never; a house only when it has fallen', () => {
    expect(arsonOdds('merciful', 'hard', false, true)).toBeLessThan(0.05); expect(arsonOdds('merciful', 'hard', true, true)).toBe(0);
    expect(arsonOdds('hostile', 'savage', false, false)).toBeGreaterThan(arsonOdds('hostile', 'hard', false, false));
    expect(arsonOdds('hostile', 'savage', true, false)).toBe(0); expect(arsonOdds('hostile', 'savage', true, true)).toBeGreaterThan(0);
  });
  it('stone, steel and the cellar do not burn', () => { for (const k of ['stone_house', 'bunker_stores', 'root_cellar', 'container_shop']) expect(FIREPROOF.test(k)).toBe(true); expect(FIREPROOF.test('barn')).toBe(false); });
});
describe('a mid-fight parley', () => {
  const ctx = (o: Partial<ParleyCtx> = {}): ParleyCtx => ({ disposition: 'merciful', temper: 'hard', kind: 'militia', crewLoss: 0.35, familyLoss: 0.3, leaderUp: true, ammo: 0.6, negotiator: 3, talk: 1, ...o });
  const rate = (f: () => unknown, N = 3000) => { let n = 0; for (let i = 0; i < N; i++) if (f()) n++; return n / N; };
  it('never from a savage crew, a horde or a crew whose leader is down; only once the crew is hurt but not broken', () => {
    const r = mulberry32(1);
    expect(rate(() => parleyOffer(ctx({ temper: 'savage' }), r))).toBe(0); expect(rate(() => parleyOffer(ctx({ kind: 'horde' }), r))).toBe(0); expect(rate(() => parleyOffer(ctx({ leaderUp: false }), r))).toBe(0);
    expect(rate(() => parleyOffer(ctx({ crewLoss: 0.05 }), r))).toBe(0); expect(rate(() => parleyOffer(ctx({ crewLoss: 0.9 }), r))).toBe(0);
    expect(rate(() => parleyOffer(ctx(), r))).toBeGreaterThan(0.2);
  });
  it('disciplined crews offer more than gangs; Hardcore talks less', () => {
    const r = mulberry32(2);
    expect(rate(() => parleyOffer(ctx({ kind: 'militia' }), r))).toBeGreaterThan(rate(() => parleyOffer(ctx({ kind: 'gang' }), r)));
    expect(rate(() => parleyOffer(ctx({ talk: 0.85 }), r))).toBeLessThan(rate(() => parleyOffer(ctx({ talk: 1.12 }), r)));
  });
  it('the family takes terms when it is hurt and short of ammunition, and refuses when it is winning', () => {
    const r = mulberry32(3);
    expect(rate(() => parleyAccepted(ctx({ familyLoss: 0.6, ammo: 0.2 }), r))).toBeGreaterThan(0.6);
    expect(rate(() => parleyAccepted(ctx({ familyLoss: 0, ammo: 1, crewLoss: 0.55, negotiator: 0 }), r))).toBeLessThan(0.3);
    expect(TRIBUTE_SHARE).toBeGreaterThan(0); expect(TRIBUTE_SHARE).toBeLessThan(0.5);
  });
});
describe('the result in words', () => {
  const base = { linePassed: true, beatenBack: false, reached: 'yard' as const, loot: [], fires: [], hostages: [], disposition: 'hostile' as const, killed: 0, spared: 0, held: 0 };
  it('breached and overrun read differently, and say how the wall fell', () => {
    const b = { method: 'ram' as const, where: { runId: 'r', kind: 'chain_link', gate: true, at: 1, w: 1, x: 0, z: 0, heading: 0, out: { x: 0, z: 1 }, dist: 10 }, t: 12, attempts: [], crewHad: { truck: true, satchels: 0 } };
    const yard = raidText({ ...base, result: 'breached', breach: b, loot: [{ what: 'fuel', n: 4, from: 'yard' }] }), over = raidText({ ...base, result: 'overrun', reached: 'house', breach: b, killed: 2 });
    expect(yard).toMatch(/holds the yard/); expect(yard).toMatch(/rammed the gate/); expect(yard).toMatch(/4 cans of fuel/);
    expect(over).toMatch(/overran the houses/); expect(over).toMatch(/2 killed/);
  });
  it('says a failed ram and a talked end', () => {
    const b = { method: 'climb' as const, where: null, t: -1, attempts: [{ how: 'ram' as const, ok: false, why: 'bollards', t: 9, odds: 0.4 }], crewHad: { truck: true, satchels: 0 } };
    expect(raidText({ ...base, linePassed: false, result: 'repelled', reached: 'wall', breach: b })).toMatch(/bollards/);
    expect(raidText({ ...base, result: 'fled', ending: { kind: 'tribute', at: 5 } })).toMatch(/paid/);
  });
  it('names the leader the same way every time', () => { expect(leaderNameOf(7, 'gang')).toBe(leaderNameOf(7, 'gang')); expect(leaderNameOf(7, 'gang')).toMatch(/boss/); });
});
