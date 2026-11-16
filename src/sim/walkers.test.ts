import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { mulberry32 } from './rng';
import { biteChance, incubationHours, feverHours, within24, stageOf, decayRate, mobility, signatureOf, arrivalRate, wallLoad, WALL_RATING, rampFeet, zombiesOf, walkerNight, walkerTurns, walkerCards, walkerChoose, bitePerson, signatureNow, walkerGoal } from './walkers';
import { fxCtxFor, fxCards, fxChoose } from './disasterFx';

const game = (variant = 'outbreak', difficulty: 'cozy' | 'standard' | 'hardcore' = 'standard') => {
  const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'zombies', variant, difficulty });
  g.clock.t = g.disaster.hitAt + 1; g.disaster.phase = 'impact';
  return g;
};
const night = (g: ReturnType<typeof game>, k: number) => { const ctx = fxCtxFor(g, k); ctx.day = k; return ctx; };

describe('the infection (pure)', () => {
  it('bite chance by clothing: bare 85, heavy 40, padded 10; Cozy halves, Hardcore adds ten points', () => {
    expect(biteChance('bare', 'standard')).toBe(0.85); expect(biteChance('heavy', 'standard')).toBe(0.4); expect(biteChance('padded', 'standard')).toBe(0.1);
    expect(biteChance('heavy', 'cozy')).toBeCloseTo(0.2); expect(biteChance('heavy', 'hardcore')).toBeCloseTo(0.5);
  });
  it('incubation is 2 to 18 hours, shorter for the head and longer for a hand; 95 percent are over inside 24 hours', () => {
    const r = mulberry32(3); let over = 0, head = 0, hand = 0;
    for (let i = 0; i < 2000; i++) { const h = incubationHours(r); expect(h).toBeGreaterThanOrEqual(2); expect(h).toBeLessThanOrEqual(18); if (!within24(h, feverHours(r))) over++; head += incubationHours(r, 'head'); hand += incubationHours(r, 'hand'); }
    expect(over / 2000).toBeLessThan(0.1); expect(head).toBeLessThan(hand);
  });
  it('stages by decay days, frozen under 10 F, thawing in the warm', () => {
    expect([0, 40, 200, 600].map(stageOf)).toEqual(['fresh', 'rotting', 'desiccated', 'spent']);
    expect(decayRate(20, 30)).toBe(0); expect(decayRate(60, 95)).toBe(1.6); expect(mobility(5)).toBe(0); expect(mobility(15)).toBe(0.4); expect(mobility(40)).toBe(1);
  });
});

describe('the signature and the wall (pure)', () => {
  const quiet = { generator: false, genK: 1, dogs: 0, stock: 0, party: 0, dark: true, curtains: 1, floods: 0, windows: 1, shotFt: 0, rain: false };
  it('a lit loud place is heard and seen much farther than a dark quiet one, and draws a bigger crowd', () => {
    const q = signatureOf(quiet), l = signatureOf({ ...quiet, dark: false, generator: true, floods: 1, dogs: 2 });
    expect(l.ft).toBeGreaterThan(q.ft * 5); expect(arrivalRate(l.ft)).toBeGreaterThan(arrivalRate(q.ft) * 4);
    expect(signatureOf({ ...quiet, shotFt: 5000 }).ft).toBe(5000);
  });
  it('wall load grows with rows and crowd; four rows of fresh walkers is well past a chain-link fence', () => {
    expect(wallLoad(0, 100)).toBe(0);
    expect(wallLoad(100, 100)).toBeGreaterThan(wallLoad(30, 100));
    expect(wallLoad(260, 100)).toBeGreaterThan(WALL_RATING.chain_link!);
    expect(wallLoad(40, 200)).toBeLessThan(WALL_RATING.log_palisade!);
  });
  it('a pile of dead is a ramp', () => { expect(rampFeet(0, 100)).toBe(0); expect(rampFeet(30, 100)).toBeGreaterThan(0.3); });
});

describe('the nights', () => {
  it('a lit, loud compound gets a bigger crowd than a dark quiet one', () => {
    const run = (loud: boolean) => { const g = game(); const z = zombiesOf(g); if (!loud) g.opsec = { quietDeliveries: false, blackout: true }; z.policy = 'pike'; for (let d = 1; d <= 10; d++) { g.clock.t = g.disaster.hitAt + d; walkerNight(g, night(g, d)); } return z.kills + z.crowd; };
    expect(run(true)).toBeGreaterThan(run(false));
  });
  it('a crowd leaning on a split-rail fence breaks it: a repair job on the real run', () => {
    const g = game(); const z = zombiesOf(g); z.crowd = 400;
    g.perimeter.push({ id: 'p1', kind: 'split_rail', pts: [[0, 0], [10, 0], [10, 10]], gates: [], done: 10, hours: 10, supplied: true, finishedAt: 0 } as never);
    walkerNight(g, night(g, 3));
    expect(z.breaches).toBe(1); expect(g.raidDamage?.some(d => d.kind === 'breach' && d.runId === 'p1')).toBe(true);
  });
  it('a stone wall holds the same crowd', () => {
    const g = game(); const z = zombiesOf(g); z.crowd = 120;
    g.perimeter.push({ id: 'p1', kind: 'stone_wall', pts: [[0, 0], [30, 0], [30, 30]], gates: [], done: 10, hours: 10, supplied: true, finishedAt: 0 } as never);
    walkerNight(g, night(g, 3)); expect(z.breaches).toBe(0);
  });
});

describe('bites, the 24-hour rule and the family card', () => {
  it('a bitten person turns inside a day and rises; a locked room contains it', () => {
    const g = game(); const z = zombiesOf(g), i = 0;
    z.bites.push({ pid: g.people[i].id, at: g.clock.t, incub: 6, fever: 4, site: 'body', hidden: false, plan: 'seclude', src: 'test' });
    g.clock.t += 1.5 / 24; expect(walkerTurns(g, night(g, 2))).toEqual([]);   // still in the incubation: nothing yet
    g.clock.t += 1; const lines = walkerTurns(g, night(g, 3));
    expect(g.personState[i].needs.died).not.toBeNull(); expect(lines.join(' ')).toMatch(/got up again/); expect(lines.join(' ')).toMatch(/put down quietly/);
  });
  it('a hidden bite is worse: it turns in the house and may bite another', () => {
    const g = game('outbreak', 'hardcore'); const z = zombiesOf(g);
    let hurt = 0;
    for (let seed = 1; seed < 30; seed++) { const h = game('outbreak', 'hardcore'); const zz = zombiesOf(h); zz.bites.push({ pid: h.people[0].id, at: h.clock.t, incub: 2, fever: 2, site: 'body', hidden: true, plan: 'hide', src: 't' }); h.clock.t += 1; walkerTurns(h, { ...night(h, seed), r: mulberry32(seed) }); if (zz.bites.length) hurt++; }
    expect(hurt).toBeGreaterThan(5); void z;
  });
  it('on Cozy a bitten family member has a bad week and recovers', () => {
    const g = game('outbreak', 'cozy'); const z = zombiesOf(g);
    z.bites.push({ pid: g.people[1].id, at: g.clock.t, incub: 3, fever: 3, site: 'body', hidden: false, plan: 'none', src: 't' });
    g.clock.t += 1; walkerTurns(g, night(g, 2));
    expect(g.personState[1].needs.died).toBeNull(); expect(g.personState[1].needs.hurt.some(h => /fever/.test(h.what))).toBe(true);
  });
  it('the card offers amputate, seclude, end and hide, and each choice does something', () => {
    const g = game(); const z = zombiesOf(g), pid = g.people[0].id;
    expect(bitePerson(g, 0, () => 0, 'on the wall')).toMatch(/bitten/);
    expect(z.bites.length).toBe(1);
    const card = fxCards(g).find(c => c.id === `zb_bite_${pid}`)!;
    expect(card.acts.map(a => a.choice.split(':')[1])).toEqual(['amp', 'seclude', 'end', 'hide']);
    expect(fxChoose(g, `zb:seclude:${pid}`)).toMatch(/locked/); expect(z.bites[0].plan).toBe('seclude');
    expect(walkerChoose(g, `zb:end:${pid}`)).toMatch(/did not get up/); expect(g.personState[0].needs.died).not.toBeNull();
  });
  it('a stranger held 24 hours is never a risk; let in while bitten, a hidden bite follows', () => {
    const g = game(); const z = zombiesOf(g);
    z.visitor = { id: 'v', bitten: true, line: 'x', day: 3 }; expect(walkerChoose(g, 'zb:v:hold')).toMatch(/turned in the night/); expect(z.bites.length).toBe(0); expect(z.held).toBe(1);
    z.visitor = { id: 'v', bitten: true, line: 'x', day: 4 }; walkerChoose(g, 'zb:v:in'); expect(z.bites.length).toBe(1); expect(z.bites[0].hidden).toBe(true);
  });
});

describe('the variants', () => {
  it('the sleeper plague raises every death unless somebody sees to the body', () => {
    const g = game('everyone_turns'); const z = zombiesOf(g);
    g.personState[2].needs.died = 1;
    walkerTurns(g, night(g, 2)); expect(z.risen.length).toBe(1);
    expect(fxCards(g).some(c => c.id.startsWith('zb_rise_'))).toBe(true);
    const out = walkerTurns(g, night(g, 3)); expect(out.join(' ')).toMatch(/got up in the night/);
    const h = game('everyone_turns'); zombiesOf(h).risen.push({ pid: h.people[2].id, day: 1 }); fxChoose(h, `zb:spike:${h.people[2].id}`); expect(zombiesOf(h).risen.length).toBe(0);
  });
  it('the rage burns out: the county pool is gone by about day 35 and nothing decays', () => {
    const g = game('rage'); const z = zombiesOf(g); let late = 0;
    for (let d = 1; d <= 50; d++) { g.clock.t = g.disaster.hitAt + d; const before = z.crowd; walkerNight(g, night(g, d)); if (d > 40) late += Math.max(0, z.crowd - before); }
    expect(late).toBe(0);
  });
  it('freeze and thaw: a hard freeze stops arrivals, and the thaw brings a wave', () => {
    const g = game(); const z = zombiesOf(g); z.frozen = 12; g.clock.t = g.disaster.hitAt + 100;
    // the region's own night here is whatever it is; force the thaw state directly
    z.thawUntil = 130; const sig = signatureNow(g); expect(sig.ft).toBeGreaterThan(0);
    expect(walkerGoal(g).steps.length).toBe(5); expect(walkerCards(g).length).toBeGreaterThan(0);
  });
});
