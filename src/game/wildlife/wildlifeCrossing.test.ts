import { describe, expect, it } from 'vitest';
import { CROSSERS, CROSS_REACH, advanceDeck, deckFrom, planCross, speciesCrosses, type Bridge } from './wildlifeCrossing';
import { stepBeast, speeds, type Beast, type StepCtx } from './wildlifeAI';

// a bridge along x from 10 to 50 over a gorge: the deck runs level at y = 4
const deck = Array.from({ length: 21 }, (_, i) => [10.1 + i * 1.99, 20, 4] as const);
const bridge: Bridge = { id: 'tb', deck, mouth: [[9.2, 20], [51.4, 20]] };
const beast = (sp: Beast['sp'], x: number, z: number): Beast => ({ id: 'b', sp, x, z, rot: 0, hx: x, hz: z, tx: x, tz: z, mood: 'graze', t: 5, phase: 0, vis: 1, want: true, head: 0, v: 0, male: true, side: 'out', group: 1, k: 0.5 });
const ctx = (): StepCtx => ({ threats: [], allowed: () => true, rnd: () => 0.5, speedK: 1 });

describe('who crosses and when', () => {
  it('only the grazers of open country and the dogs', () => {
    for (const sp of ['deer', 'elk', 'antelope', 'javelina', 'coyote', 'wolf'] as const) expect(speciesCrosses(sp)).toBe(true);
    for (const sp of ['bear', 'cougar', 'rabbit', 'squirrel', 'turkey', 'grouse', 'waterfowl', 'moose'] as const) expect(speciesCrosses(sp)).toBe(false);
    expect(CROSSERS.size).toBe(6);
  });
  it('plans a crossing only near a mouth, with the doors open', () => {
    const p = planCross('deer', 6, 20, [bridge], true)!;
    expect(p.from).toBe(0); expect(p.mouth).toEqual([9.2, 20]);
    expect(planCross('deer', 54, 21, [bridge], true)!.from).toBe(1);
    expect(planCross('deer', 6, 20, [bridge], false)).toBeNull();                    // doors shut (night, the alarm)
    expect(planCross('bear', 6, 20, [bridge], true)).toBeNull();
    expect(planCross('deer', 9.2 - CROSS_REACH - 1, 20, [bridge], true)).toBeNull();  // too far to think of it
    expect(planCross('deer', 6, 20, [], true)).toBeNull();
  });
  it('the deck in walking order ends on the far mouth, from either end', () => {
    const a = deckFrom(bridge, 0), b = deckFrom(bridge, 1);
    expect(a[0][0]).toBeLessThan(a[1][0]); expect(a[a.length - 1].slice(0, 2)).toEqual([51.4, 20]);
    expect(b[0][0]).toBeGreaterThan(b[1][0]); expect(b[b.length - 1].slice(0, 2)).toEqual([9.2, 20]);
    expect(a.every(p => p[2] === 4)).toBe(true);
  });
});

describe('walking the deck', () => {
  it('stepBeast carries a deer across at the deck height, taking the time the length asks, and sets it down on the far side', () => {
    const b = beast('deer', 9.2, 20); b.deck = deckFrom(bridge, 0);
    const len = 51.4 - 9.2, walk = speeds('deer').walk;
    let t = 0, ymax = -Infinity, ymin = Infinity, offLine = 0;
    while (b.deck && t < 2000) { stepBeast(b, 0.1, ctx()); t += 0.1; if (b.y !== undefined) { ymax = Math.max(ymax, b.y); ymin = Math.min(ymin, b.y); } offLine = Math.max(offLine, Math.abs(b.z - 20)); }
    expect(b.deck).toBeUndefined(); expect(b.y).toBeUndefined();
    expect(Math.abs(b.x - 51.4)).toBeLessThan(0.01);
    expect(ymin).toBeCloseTo(4, 6); expect(ymax).toBeCloseTo(4, 6);
    expect(offLine).toBeLessThan(1e-6);
    expect(t).toBeGreaterThan(len / walk - 1); expect(t).toBeLessThan(len / walk + 1);       // a walk, not a teleport
    expect(b.mood).toBe('graze');
    expect([b.hx, b.hz]).toEqual([b.x, b.z]);       // its range is the far side now
  });
  it('a person near does not make it bolt off the deck, and a sloped deck gives the heights in between', () => {
    const slope: Bridge = { id: 's', deck: [[0, 0, 1], [10, 0, 3]], mouth: [[-1, 0], [11, 0]] };
    const b = beast('coyote', -1, 0); b.deck = deckFrom(slope, 0);
    const c = { ...ctx(), threats: [[2, 0.3]] as Array<[number, number]> };
    let mid = 0;
    for (let i = 0; i < 4000 && b.deck; i++) { stepBeast(b, 0.1, c); if (b.x > 4.9 && b.x < 5.1 && b.y !== undefined) mid = b.y; if (b.deck) expect(b.mood).toBe('walk'); }
    expect(mid).toBeGreaterThan(1.9); expect(mid).toBeLessThan(2.1);
    expect(b.deck).toBeUndefined();
  });
  it('advanceDeck handles a step longer than a segment and an empty deck', () => {
    const b = { x: 0, z: 0, rot: 0, y: undefined as number | undefined, deck: [[1, 0, 2], [2, 0, 2], [2, 3, 2]] as Array<[number, number, number]> };
    expect(advanceDeck(b, 2.5)).toBe(false); expect(b.x).toBe(2); expect(b.z).toBeCloseTo(0.5, 9); expect(b.y).toBe(2);
    expect(advanceDeck(b, 10)).toBe(true); expect(b.deck).toBeUndefined();
    expect(advanceDeck({ x: 0, z: 0, rot: 0 }, 1)).toBe(true);
  });
});

describe('no actor floats: on the deck at the deck height, on the ground at the ground height, never a step in the air', () => {
  // ground: a rim at y=3.7 at each end (the deck is 4.0), falling away to a gorge floor under the span; the animal steps on at one mouth and off at the other
  const ground = (x: number) => (x < 10 || x > 51 ? 3.7 : 0.5);
  for (const sp of ['deer', 'elk', 'antelope', 'javelina', 'coyote', 'wolf'] as const) it(`${sp}: every sampled step`, () => {
    const b = beast(sp, 9.2, 20); b.y = ground(9.2); b.deck = deckFrom(bridge, 0, ground);
    const walk = speeds(sp).walk, dt = 0.1, samples: Array<{ x: number; y: number | undefined }> = [];
    let last = b.y!, maxJump = 0, onDeck = 0;
    for (let i = 0; i < 6000 && b.deck; i++) {
      stepBeast(b, dt, ctx());
      const y = b.y ?? ground(b.x);
      maxJump = Math.max(maxJump, Math.abs(y - last)); last = y; samples.push({ x: b.x, y: b.y });
      // inside the span (between the first and last deck point) it stands exactly at the deck height
      if (b.x > 10.2 && b.x < 49.8 && b.y !== undefined) { onDeck++; expect(b.y).toBeCloseTo(4, 6); }
    }
    expect(onDeck).toBeGreaterThan(50);
    // the ramps at the two ends: no jump larger than a step's worth of the steepest leg (0.3 u of rim-to-deck over ~0.9 u) plus nothing
    expect(maxJump).toBeLessThan(walk * dt * (0.4 / 0.8) + 1e-6);
    // off the deck it is on the ground (the renderer draws it at the terrain height there), and the last point it left was the ground's height
    expect(b.y).toBeUndefined();
    expect(Math.abs(last - ground(b.x))).toBeLessThan(1e-6);
  });
});
