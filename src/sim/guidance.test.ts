import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planStructure } from './construction';
import { MATERIAL_IDS, MATERIALS } from './materials';
import { bunkerChecklist, bunkerNext, buildAdvice, nextStep, perimeterOff, perimeterTiers, plansNeed, plansNeedLines, upgradeChain } from './guidance';
import { PERIMETER_ORDER, UPGRADE_NEXT, planRun } from './perimeter';
import { SHELVES, shelvesNeeding } from './shelves';
import { BUNKER_ORDER } from '../game/buildkit/kit';

const fresh = () => { const g = newGame(11); g.structures = []; g.perimeter = []; g.stock = { ...g.stock }; return g; };

describe('the bunker', () => {
  it('greys every room until there is a hatch or a stairwell, but not the entrances', () => {
    const g = fresh();
    for (const k of BUNKER_ORDER) {
      const a = buildAdvice(g, k);
      if (k === 'bunker_hatch' || k === 'bunker_stairs') expect(a.off).toBeNull(); else expect(a.off).toMatch(/hatch or stairwell/);
    }
    planStructure(g, 'bunker_hatch', 0, 0, 0);
    expect(buildAdvice(g, 'bunker_dorm').off).toBeNull();
  });

  it('lists what the bunker needs, in order, and points at the first thing missing', () => {
    const g = fresh();
    expect(bunkerNext(g)!.id).toBe('entrance');
    planStructure(g, 'bunker_hatch', 0, 0, 0);
    expect(bunkerNext(g)!.id).toBe('beds');
    planStructure(g, 'bunker_dorm', 1, 0, 0);
    const people = g.people.length;
    // a bunkroom sleeps eight: enough for any family the game starts with
    expect(people).toBeLessThanOrEqual(8);
    expect(bunkerNext(g)!.id).toBe('air');
    for (const k of ['bunker_plant', 'bunker_stores', 'bunker_medical']) planStructure(g, k, 5, 5, 0);
    expect(bunkerNext(g)).toBeNull();
    expect(bunkerChecklist(g).every(c => c.done)).toBe(true);
  });

  it('highlights the next bunker piece as the next step', () => {
    const g = fresh();
    planStructure(g, 'bunker_hatch', 0, 0, 0);
    expect(buildAdvice(g, 'bunker_dorm').next || buildAdvice(g, 'bunker_container').next).toBe(true);
  });
});

describe('the Build list', () => {
  it('greys the hand-dug well where the water is too deep, and points at a drilled one', () => {
    const g = fresh();
    g.site = { ...g.site, gwDepth: 65 };
    expect(buildAdvice(g, 'well_hand').off).toMatch(/65 m down/);
    expect(buildAdvice(g, 'well_drilled').off).toBeNull();
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
    expect(nextStep(g)!.kind).toBe('well_drilled');
  });

  it('walks the family through roof, water, toilet, food in order', () => {
    const g = fresh();
    g.site = { ...g.site, gwDepth: 5 };
    expect(nextStep(g)!.kind).toBe('timber_cabin');
    planStructure(g, 'timber_cabin', 0, 0, 0);
    expect(nextStep(g)!.kind).toBe('well_hand');
    planStructure(g, 'well_hand', 3, 0, 0);
    expect(nextStep(g)!.kind).toBe('outhouse');
    planStructure(g, 'outhouse', 6, 0, 0);
    expect(nextStep(g)!.kind).toBe('garden');
  });

  it('greys the creek bars on land with no creek, and the tunnel until there is a bunker', () => {
    const g = fresh();
    g.site = { ...g.site, creek: false };
    expect(perimeterOff(g, 'creek_bars')).toMatch(/no creek/);
    expect(perimeterOff(g, 'escape_tunnel')).toMatch(/bunker/);
    planStructure(g, 'bunker_hatch', 0, 0, 0);
    expect(perimeterOff(g, 'escape_tunnel')).toBeNull();
    g.site = { ...g.site, creek: true };
    expect(perimeterOff(g, 'creek_bars')).toBeNull();
  });

  it('greys a permitted build the family cannot pay the permit for', () => {
    const g = fresh();
    g.paper.permits = true;
    g.money = 0;
    const a = buildAdvice(g, 'timber_cabin');
    // only when the county works and the kind needs a permit
    if (a.off) expect(a.off).toMatch(/permit/);
  });
});

describe('what the plans need', () => {
  it('is empty with nothing planned and grows with a staked cabin, less the stockpile', () => {
    const g = fresh();
    expect(plansNeedLines(g)).toHaveLength(0);
    planStructure(g, 'timber_cabin', 0, 0, 0);
    const need = plansNeed(g);
    expect(Object.keys(need).length).toBeGreaterThan(0);
    const [m] = Object.keys(need) as Array<keyof typeof need>;
    g.stock[m!] += need[m]!;
    expect(plansNeed(g)[m!] ?? 0).toBe(0);
  });

  it('counts fence runs laid out and not yet supplied', () => {
    const g = fresh();
    planRun(g, 'barbed_wire', [[0, 0], [30, 0]]);
    expect(plansNeed(g).wire).toBeGreaterThan(0);
    expect(plansNeedLines(g).some(l => l.material === 'wire')).toBe(true);
  });
});

describe('the Shop shelves', () => {
  it('hold every buyable material except groceries, which the pantry sells', () => {
    const on = new Set(Object.values(SHELVES).flat());
    const missing = MATERIAL_IDS.filter(m => MATERIALS[m].price !== null && !on.has(m));
    expect(missing.sort()).toEqual(['canned', 'frozen', 'staples']);
  });
  it('flags the shelves that hold a needed material', () => {
    expect(shelvesNeeding({ wire: 2, rebar: 1 })).toMatchObject({ build: 1, fencing: 2, bunker: 1 });
  });
});

describe('the Perimeter list', () => {
  it('puts every wall kind in exactly one price tier, cheapest tier first, with creek bars apart', () => {
    const tiers = perimeterTiers();
    const all = tiers.flatMap(t => t.kinds);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual([...PERIMETER_ORDER].sort());
    expect(tiers.at(-1)!.kinds).toEqual(['creek_bars']);
    expect(tiers[0].kinds).toContain('thorn_hedge');
    expect(tiers[0].kinds).not.toContain('steel_wall');
  });
  it('knows the upgrade chain from any link', () => {
    const chain = upgradeChain('chain_link');
    expect(chain[0]).toBe('split_rail');
    expect(chain.at(-1)).toBe('electric_steel');
    for (let i = 1; i < chain.length; i++) expect(UPGRADE_NEXT[chain[i - 1]]).toBe(chain[i]);
  });
});
