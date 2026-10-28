import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { HOME_RECT, CLASSIC, type Acres } from './site';
import type { RegionId } from './regions';
import { REGIONS } from './regions';
import type { PerimeterKind, PerimeterRun, Pt } from './perimeter';
import { PERIMETER, PREDATOR_BLOCK } from './perimeter';
import { enclosure } from './enclosure';
import { ANIMALS } from './livestock';
import {
  WILD_BY_REGION, SPECIES, activity, attractants, capacity, count, gameCount, killShare, layFactor, ownedAcres, populations, predatorLine,
  hurtKid, predatorRisk, predatorSpecies, proof, recoveryPerDay, wildlifeDay, wildlifeNight, wildlifeView, type SpeciesId,
} from './wildlife';
import { floodlightLit, lightsOf, setAiSensor, setAllAi, aiModulesUsed, ARMORY_LIGHTS, animalNearby, raiseAnimalAlert, SENSOR_HOLD, threatNearby } from './lights';
import { exposureParts } from './opsec';
import { wildDay } from './wildfood';
import { defenseReport } from './defenseReport';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const place = (acres: Acres, region: RegionId = 'mountain_west', over: Partial<GameState['site']> = {}, seed = 11): GameState => {
  const g = newGame(seed);
  g.site = { ...CLASSIC, region, acres, home: HOME_RECT[acres], ...over };
  return g;
};
let n = 0;
const run = (kind: PerimeterKind, pts: Pt[], gates: PerimeterRun['gates'] = []): PerimeterRun => ({ id: `w${n++}`, kind, pts, gates, done: 1, hours: 1, supplied: true, finishedAt: 0 });
const loop = (g: GameState, kind: PerimeterKind, gates: PerimeterRun['gates'] = []) => {
  const h = g.site.home;
  return run(kind, [[h.x0, h.z0], [h.x1, h.z0], [h.x1, h.z1], [h.x0, h.z1], [h.x0, h.z0]], gates);
};
const total = (g: GameState, sp: SpeciesId, seeds = 12) => { let t = 0; for (let k = 1; k <= seeds; k++) { const h = structuredClone(g); h.seed = k * 97; t += count(h, sp); } return t / seeds; };

describe('species by region', () => {
  it('every region has a list of known species, deer and small game where they live, and only some regions have bears, cougars and wolves', () => {
    for (const id of Object.keys(REGIONS) as RegionId[]) {
      expect(WILD_BY_REGION[id].length).toBeGreaterThan(4);
      for (const sp of WILD_BY_REGION[id]) expect(SPECIES[sp]).toBeDefined();
      expect(WILD_BY_REGION[id]).toContain('coyote');
    }
    expect(WILD_BY_REGION.mountain_west).toEqual(expect.arrayContaining(['elk', 'bear', 'cougar', 'wolf']));
    expect(WILD_BY_REGION.desert).toEqual(expect.arrayContaining(['javelina', 'cougar']));
    expect(WILD_BY_REGION.desert).not.toContain('bear');
    expect(WILD_BY_REGION.north_woods).toContain('moose');
    expect(WILD_BY_REGION.plains).not.toContain('bear');
    expect(WILD_BY_REGION.rust_belt).not.toContain('wolf');
  });
  it('the game the hunt lists (regions.ts) is among the wildlife', () => {
    for (const id of Object.keys(REGIONS) as RegionId[]) for (const gm of REGIONS[id].game) if (['deer', 'elk', 'moose', 'turkey', 'javelina', 'antelope', 'rabbit', 'grouse', 'waterfowl'].includes(gm)) expect(WILD_BY_REGION[id]).toContain(gm as SpeciesId);
  });
});

describe('population by acreage and habitat', () => {
  it('owns the acres the site says; buying a neighbor adds to it', () => {
    for (const a of [5, 20, 40, 80] as Acres[]) expect(Math.abs(ownedAcres(place(a)) - a)).toBeLessThan(a * 0.08 + 0.6);
  });
  it('a few deer on 5 acres, a herd on 80, growing with the land', () => {
    const d = ([5, 20, 40, 80] as Acres[]).map(a => total(place(a, 'appalachia', { timber: 1, creek: true }), 'deer'));
    expect(d[0]).toBeGreaterThanOrEqual(1); expect(d[0]).toBeLessThanOrEqual(3.5);
    expect(d[3]).toBeGreaterThanOrEqual(10); expect(d[3]).toBeLessThanOrEqual(22);
    expect(d[1]).toBeGreaterThan(d[0]); expect(d[2]).toBeGreaterThan(d[1]); expect(d[3]).toBeGreaterThan(d[2]);
  });
  it('habitat matters: waterfowl want water, squirrels timber, pronghorn open ground', () => {
    const creek = place(40, 'plains', { creek: true, spring: false, timber: 0.5 }), dry = place(40, 'plains', { creek: false, spring: false, timber: 0.5 });
    expect(capacity(creek, 'waterfowl')).toBeGreaterThan(capacity(dry, 'waterfowl') * 3);
    const wooded = place(40, 'ozarks', { timber: 1.4 }), bare = place(40, 'ozarks', { timber: 0.3 });
    expect(capacity(wooded, 'squirrel')).toBeGreaterThan(capacity(bare, 'squirrel') * 2);
    const open = place(40, 'plains', { timber: 0.3 }), timb = place(40, 'plains', { timber: 1.4 });
    expect(capacity(open, 'antelope')).toBeGreaterThan(capacity(timb, 'antelope'));
  });
  it('a species the region lacks is never there', () => {
    const g = place(80, 'plains');
    expect(count(g, 'bear')).toBe(0); expect(count(g, 'elk')).toBe(0);
    expect(populations(g).map(p => p.sp)).not.toContain('bear');
  });
  it('predators are rare: a bear is not on every place, and one place rarely holds more than one or two', () => {
    const small = total(place(5, 'appalachia'), 'bear', 40), big = total(place(80, 'appalachia', { timber: 1.3 }), 'bear', 40);
    expect(small).toBeLessThan(0.3);
    expect(big).toBeGreaterThan(0.2); expect(big).toBeLessThan(1.8);
  });
  it('the same seed gives the same count', () => {
    const a = place(40), b = place(40);
    expect(populations(a)).toEqual(populations(b));
  });
});

describe('depletion and recovery', () => {
  it('a kill takes one animal\'s share of the bar: half the deer on 5 acres, a small share on 80', () => {
    expect(killShare(place(5, 'appalachia'), 'big')).toBeGreaterThan(killShare(place(80, 'appalachia'), 'big') * 3);
    expect(killShare(place(80, 'appalachia'), 'big')).toBeLessThan(0.1);
    expect(killShare(place(5, 'appalachia'), 'big')).toBeLessThanOrEqual(0.6);
  });
  it('overhunting thins the visible count and it comes back slowly, faster on a small place', () => {
    const g = place(40, 'appalachia', { timber: 1 }, 5);
    const full = count(g, 'deer');
    g.wild.abundance.big = 0.2;
    const thin = count(g, 'deer');
    expect(thin).toBeLessThan(full);
    expect(thin).toBeLessThanOrEqual(Math.ceil(full * 0.2) + 1);
    // recovery per day is small (years), and quicker per acre on a small place
    expect(recoveryPerDay(g, 'big') * 365).toBeLessThan(0.35);
    expect(recoveryPerDay(place(5), 'big')).toBeGreaterThan(recoveryPerDay(place(80), 'big'));
    for (let d = 0; d < 365 * 4; d++) { g.clock.t = d; wildDay(g, true); }
    expect(g.wild.abundance.big).toBeGreaterThan(0.2);
    expect(g.wild.abundance.big).toBeLessThanOrEqual(1);
  });
  it('hunting really depletes: each deer taken drops the bar by its share, so a small place empties fast', () => {
    const mk = (a: Acres) => {
      const g = place(a, 'appalachia', { timber: 1 }, 3);
      g.people[0].skills.hunter = 10; g.money = 5000;
      g.armory.guns.push({ id: 'g', model: 'rem_700', condition: 1, fired: 0, where: 'safe', carrier: null });
      g.armory.ammo['308'] = 400;
      g.disaster.kind = 'ash_winter' as never; g.disaster.hitAt = -1;      // after the collapse: no seasons
      return g;
    };
    const lost = (g: GameState) => { g.disaster.tracks.stores = 1; const b = g.wild.abundance.big; for (let d = 0; d < 200; d++) { g.clock.t = 100 + d; wildDay(g, true); } return b - g.wild.abundance.big; };
    expect(lost(mk(5))).toBeGreaterThan(0);
  });
  it('predators taken are replaced from the neighbors\' ranges in about a year', () => {
    const g = place(80, 'appalachia', { timber: 1.4 }, 3);
    const had = Object.fromEntries((['bear', 'coyote'] as const).map(sp => [sp, count(g, sp)]));
    g.wildlife = { ...g.wildlife!, gone: { bear: 1, coyote: 1 } };
    expect(count(g, 'bear')).toBe(Math.max(0, (had.bear ?? 0) - 1));
    for (let d = 0; d < 330; d++) { g.clock.t = d; wildlifeDay(g, true); }
    expect(count(g, 'bear')).toBe(had.bear);
  });
  it('a hunt on a tiny place finds fewer animals than on a big one', () => {
    expect(gameCount(place(5, 'appalachia'), 'big')).toBeLessThan(gameCount(place(80, 'appalachia'), 'big'));
  });
});

describe('what is drawn', () => {
  it('visible counts follow the sim count and the time of day (crepuscular deer are out at dawn, hidden at noon)', () => {
    const g = place(80, 'appalachia', { timber: 1 });
    const at = (h: number) => wildlifeView(g, h, false).filter(c => c.sp === 'deer').length;
    expect(at(7)).toBeLessThanOrEqual(count(g, 'deer'));
    expect(at(7)).toBeGreaterThan(at(13) - 1);
    expect(at(2)).toBeLessThanOrEqual(at(7));
    expect(activity('deer', 7)).toBeGreaterThan(activity('deer', 13));
    expect(activity('bear', 2)).toBeGreaterThan(activity('bear', 13));
    expect(activity('turkey', 13)).toBeGreaterThan(activity('turkey', 2));
    g.wild.abundance.big = 0.1;
    expect(wildlifeView(g, 7, false).filter(c => c.sp === 'deer').length).toBeLessThan(count(place(80, 'appalachia', { timber: 1 }), 'deer'));
  });
  it('animals are sized to scale: a person is 0.28; a deer is shoulder-high to a child, a rabbit a quarter of that', () => {
    expect(SPECIES.deer.h).toBeGreaterThan(0.12); expect(SPECIES.deer.h).toBeLessThan(0.22);
    expect(SPECIES.moose.h).toBeLessThan(0.34);
    expect(SPECIES.rabbit.h).toBeLessThan(0.06);
    for (const sp of Object.values(SPECIES)) { expect(sp.h).toBeLessThan(0.34); expect(sp.len).toBeLessThan(0.5); }
  });
});

describe('the closed property line keeps predators out', () => {
  const wooded = () => place(40, 'mountain_west', { timber: 1.3, creek: false }, 5);
  it('has a predator-block value per wall tier: solid walls stop them, split rail and barbed wire do not, a game fence keeps deer but not bears', () => {
    for (const k of ['log_palisade', 'container_wall', 'chain_link', 'wrought_iron', 'iron_barbed', 'steel_wall', 'electric_steel'] as PerimeterKind[]) expect(PREDATOR_BLOCK[k]).toBeGreaterThanOrEqual(0.9);
    for (const k of ['split_rail', 'barbed_wire', 'woven_wire', 'earth_berm', 'ditch'] as PerimeterKind[]) expect(PREDATOR_BLOCK[k]).toBeLessThan(0.5);
    expect(PERIMETER.woven_wire.blocks.animals).toBeGreaterThanOrEqual(0.9);
    for (const k of Object.keys(PERIMETER) as PerimeterKind[]) expect(PREDATOR_BLOCK[k]).toBeGreaterThanOrEqual(0);
  });
  it('with no wall, nothing is kept out; a solid wall all round does it; wire and split rail do not', () => {
    const g = wooded();
    expect(proof(g, 'predators').closed).toBe(false);
    g.perimeter.push(loop(g, 'chain_link'));
    expect(proof(g, 'predators').closed).toBe(true);
    expect(proof(g, 'predators').why).toMatch(/holds/);
    for (const k of ['barbed_wire', 'split_rail', 'woven_wire'] as PerimeterKind[]) { g.perimeter = [loop(g, k)]; expect(proof(g, 'predators').closed).toBe(false); }
    g.perimeter = [loop(g, 'woven_wire')];
    expect(proof(g, 'hoofed').closed).toBe(true);        // the game fence keeps deer out
    expect(proof(g, 'hoofed').closed && proof(g, 'predators').closed).toBe(false);
  });
  it('a gap, an open gate or an open creek lets them in', () => {
    const g = wooded(), h = g.site.home;
    g.perimeter.push(loop(g, 'steel_wall', [{ at: 20, w: 2 }]));
    expect(proof(g, 'predators').closed).toBe(true);          // a shut gate holds
    g.gate.pending = { id: 'x' } as never;                      // somebody at the gate with it open
    expect(proof(g, 'predators').closed).toBe(false);
    expect(proof(g, 'predators').why).toMatch(/gate/);
    g.gate.pending = null;
    // a gap: the wall stops short on the east side
    g.perimeter = [run('steel_wall', [[h.x0, h.z0], [h.x1, h.z0], [h.x1, h.z1 - 10]]), run('steel_wall', [[h.x0, h.z1], [h.x0, h.z0]])];
    const p = proof(g, 'predators');
    expect(p.closed).toBe(false); expect(p.openShare).toBeGreaterThan(0.1); expect(p.gaps.length).toBeGreaterThan(0);
    // the creek
    const c = place(40, 'mountain_west', { creek: true, timber: 1.3 }, 5);
    c.perimeter.push(loop(c, 'steel_wall'));
    expect(proof(c, 'predators').closed).toBe(false);
    expect(proof(c, 'predators').why).toMatch(/creek/);
    const mid = (c.site.home.x0 + c.site.home.x1) / 2;
    c.perimeter.push(run('creek_bars', [[mid - 8, 10], [mid - 8, 14]]), run('creek_bars', [[mid + 8, 10], [mid + 8, 14]]));
    expect(proof(c, 'predators').closed).toBe(true);
    expect(enclosure(c).creekOpen).toBe(0);
  });
  it('the enclosure of people is unchanged by the animal modes', () => {
    const g = wooded(); g.perimeter.push(loop(g, 'log_palisade'));
    expect(enclosure(g).openShare).toBe(enclosure(g, g.clock.t, 'people').openShare);
  });
  it('a closed line puts predators outside the wall in the picture, an open one lets them wander', () => {
    let g = wooded(); for (let k = 1; k < 30 && count(g, 'bear') + count(g, 'coyote') === 0; k++) g = place(40, 'mountain_west', { timber: 1.3, creek: false }, k * 13);
    expect(predatorSpecies(g).length).toBeGreaterThan(0);
    const open = wildlifeView(g, 1).filter(c => c.sp === 'bear' || c.sp === 'coyote');
    for (const c of open) expect(c.side).toBe('free');
    g.perimeter.push(loop(g, 'steel_wall'));
    const shut = wildlifeView(g, 1).filter(c => c.sp === 'bear' || c.sp === 'coyote');
    for (const c of shut) expect(c.side).toBe('out');
  });
});

describe('the Defense tab says whether the line keeps predators out', () => {
  it('no where it fails, yes when it holds, and nothing to fear where no predator lives', () => {
    let g = place(80, 'appalachia', { timber: 1.4, creek: false }, 5);
    for (let k = 1; k < 80 && predatorSpecies(g).length === 0; k++) g = place(80, 'appalachia', { timber: 1.4, creek: false }, k * 5);
    expect(predatorSpecies(g).length).toBeGreaterThan(0);
    const find = (x: GameState) => defenseReport(x).walls.find(c => c.id === 'predators')!;
    expect(find(g).ok).toBe(false); expect(find(g).detail).toMatch(/^no: /);
    g.perimeter.push(loop(g, 'barbed_wire'));
    expect(find(g).ok).toBe(false);
    g.perimeter = [loop(g, 'wrought_iron')];
    expect(find(g).ok).toBe(true); expect(find(g).detail).toMatch(/^yes/);
    const p = place(80, 'plains', { creek: false }, 2);
    const none = find(p);
    if (predatorSpecies(p).length === 0) expect(none.ok).toBe(true);
  });
});

describe('predator risk', () => {
  /** A place that has a bear, a coop, stock and kids to lose. */
  const camp = () => {
    for (let k = 1; k < 200; k++) {
      const g = place(80, 'appalachia', { timber: 1.4, creek: false }, k * 7);
      if (count(g, 'bear') >= 1) return g;
    }
    throw new Error('no bear in 200 seeds');
  };
  it('is zero behind a closed line, and there is a line in the Defense text', () => {
    const g = camp(); g.stock.goat = 3;
    expect(predatorRisk(g, 'bear')).toBeGreaterThan(0);
    g.perimeter.push(loop(g, 'steel_wall'));
    expect(predatorRisk(g, 'bear')).toBe(0);
    expect(predatorLine(g).ok).toBe(true); expect(predatorLine(g).detail).toMatch(/^yes/);
  });
  it('food smells, an open coop, stock and no dog raise it; a dog lowers it', () => {
    const g = camp(); g.stock.fresh = 0;
    const base = predatorRisk(g, 'bear');
    g.stock.fresh = 5;
    expect(predatorRisk(g, 'bear')).toBeGreaterThan(base * 2);
    g.stock.fresh = 0; g.stock.dog = 1;
    expect(predatorRisk(g, 'bear')).toBeLessThan(base);
    g.stock.dog = 0; g.stock.goat = 2;
    expect(predatorRisk(g, 'coyote')).toBeGreaterThanOrEqual(0);
    expect(attractants(g).stock).toBe(true);
    expect(predatorLine(g).detail).toMatch(/^no/);
    expect(predatorLine(g).detail).toMatch(/visits a year/);
  });
  it('a careless place loses stock; a walled one never does', () => {
    const lose = (wall: boolean) => {
      let lost = 0;
      for (let k = 1; k <= 6; k++) {
        const g = place(80, 'appalachia', { timber: 1.4, creek: false }, k * 7);
        g.stock.goat = 4; g.stock.fresh = 4; g.stock.dog = 0; for (const x of ANIMALS) if (x !== 'goat') g.stock[x] = 0;
        if (wall) g.perimeter.push(loop(g, 'steel_wall'));
        const before = g.stock.goat;
        for (let d = 0; d < 365 * 2; d++) { g.clock.t = d; wildlifeDay(g, true); g.stock.fresh = 4; }
        lost += before - g.stock.goat;
      }
      return lost;
    };
    expect(lose(false)).toBeGreaterThan(0);
    expect(lose(true)).toBe(0);
  }, 60_000);
  it('a good shot fills the freezer: with a rifle at home a predator is shot and its meat comes in', () => {
    let meat = 0, shot = 0;
    for (let k = 1; k <= 10; k++) {
      const g = place(80, 'appalachia', { timber: 1.4 }, k * 7);
      g.people[0].skills.hunter = 9; g.stock.fresh = 4; g.stock.goat = 2;
      g.armory.guns.push({ id: 'g', model: 'rem_700', condition: 1, fired: 0, where: 'safe', carrier: null });
      g.armory.ammo['308'] = 300;
      const fresh0 = g.stock.fresh;
      for (let d = 0; d < 365 * 4; d++) { g.clock.t = d; wildlifeDay(g, true); g.stock.fresh = fresh0; }
      shot += g.wildlife!.shot; meat += g.pantry.items.game_meat ? 1 : 0;
    }
    expect(shot).toBeGreaterThan(0);
    expect(meat).toBeGreaterThan(0);
  });
  it('kids outside at dusk can be hurt by a bear or cougar when the place is open and without a dog', () => {
    let hurt = 0;
    for (let k = 1; k <= 25; k++) {
      const g = place(80, 'mountain_west', { timber: 1.4 }, k * 3);
      g.stock.fresh = 6; g.stock.dog = 0;
      for (let d = 0; d < 365 * 4; d++) { g.clock.t = d; wildlifeDay(g, true); g.stock.fresh = 6; }
      hurt += g.personState.filter(p => p.needs.hurt.some(w => /attack/.test(w.what))).length;
    }
    expect(hurt).toBeGreaterThan(0);
  });
  it('a kid caught by a predator is hurt but lives on Cozy and Standard and dies on Hardcore only', () => {
    for (const d of ['cozy', 'standard'] as const) {
      const g = place(40); g.disaster.difficulty = d;
      const r = hurtKid(g, 40, 'bear attack')!;
      expect(r.died).toBe(false);
      const kid = g.personState[g.people.findIndex(p => p.kid)];
      expect(kid.needs.died).toBeNull(); expect(kid.needs.hurt.length).toBe(1);
    }
    const h = place(40); h.disaster.difficulty = 'hardcore';
    const r = hurtKid(h, 40, 'bear attack')!;
    expect(r.died).toBe(true);
    expect(h.personState[h.people.findIndex(p => p.id === h.people.find(x => x.kid)!.id)].needs.died).not.toBeNull();
  });
  it('sightings and encounters go to the ticker, and not every day', () => {
    const g = place(80, 'appalachia', { timber: 1 }, 4);
    let lines = 0;
    for (let d = 0; d < 60; d++) { g.clock.t = d; lines += wildlifeDay(g, true).length; }
    expect(lines).toBeGreaterThan(2); expect(lines).toBeLessThan(40);
  });
  it('a coop raid takes the hens off the lay for a month', () => {
    const g = place(40);
    expect(layFactor(g)).toBe(1);
    g.wildlife!.henLossUntil = 30; g.clock.t = 10;
    expect(layFactor(g)).toBeLessThan(1);
    g.clock.t = 31;
    expect(layFactor(g)).toBe(1);
  });
});

describe('motion lights and animals', () => {
  const lit = () => {
    const g = place(40, 'appalachia', { timber: 1 }, 5);
    g.utilities.grid = true; g.disaster.tracks.grid = 1;
    g.stock.floodlights = 1;
    return g;
  };
  it('a basic sensor trips on an animal; an AI sensor ignores it and trips on a human; a blackout forces off; always-on is unaffected', () => {
    const g = lit();
    lightsOf(g).per.a = 'sensor'; lightsOf(g).per.b = 'sensor'; lightsOf(g).per.c = 'on'; lightsOf(g).per.d = 'off';
    g.stock.ai_sensor_module = 1;
    expect(setAiSensor(g, 'b', true)).toBeNull();
    expect(floodlightLit(g, 'a', 'animal')).toBe(true);        // basic: fooled
    expect(floodlightLit(g, 'b', 'animal')).toBe(false);       // AI: ignored
    expect(floodlightLit(g, 'b', 'human')).toBe(true);
    expect(floodlightLit(g, 'b', true)).toBe(true);            // (a raid passes true)
    expect(floodlightLit(g, 'a', 'human')).toBe(true);
    expect(floodlightLit(g, 'a', null)).toBe(false);
    expect(floodlightLit(g, 'c', 'animal')).toBe(true);
    expect(floodlightLit(g, 'd', 'human')).toBe(false);
    g.opsec = { quietDeliveries: false, blackout: true };
    expect([floodlightLit(g, 'a', 'animal'), floodlightLit(g, 'b', 'human'), floodlightLit(g, 'c', 'human')]).toEqual([false, false, false]);
  });
  it('the sensor reads what is nearby: an animal alert lights basic sensors for a while; a person beats an animal', () => {
    const g = lit();
    lightsOf(g).per.a = 'sensor'; lightsOf(g).per.b = 'sensor'; g.stock.ai_sensor_module = 1; setAiSensor(g, 'b', true);
    expect(animalNearby(g)).toBe(false);
    raiseAnimalAlert(g, 0);
    expect(animalNearby(g)).toBe(true);
    expect([floodlightLit(g, 'a'), floodlightLit(g, 'b')]).toEqual([true, false]);
    g.clock.t += SENSOR_HOLD + 0.001;
    expect(floodlightLit(g, 'a')).toBe(false);
    g.gate.pending = { id: 'x' } as never;
    expect(threatNearby(g)).toBe(true);
    expect([floodlightLit(g, 'a'), floodlightLit(g, 'b')]).toEqual([true, true]);
  });
  it('a module is a good in the shop: needs stock and power, one per light, set per light or for all', () => {
    const g = lit();
    expect(setAiSensor(g, 'a', true)).toMatch(/spare/);
    g.stock.ai_sensor_module = 2;
    expect(setAiSensor(g, 'a', true)).toBeNull();
    expect(setAllAi(g, ['a', 'b', 'c'], true)).toBe(1);        // only one left
    expect(aiModulesUsed(g)).toBe(2);
    setAiSensor(g, 'a', false);
    expect(aiModulesUsed(g)).toBe(1);
    g.utilities.grid = false; g.utilities.lit = [];
    expect(setAiSensor(g, 'a', true)).toMatch(/powered/);
  });
  it('animals walking by at night trip basic lights (and the road sees the glow); AI lights do not light at all', () => {
    let tripped = 0, glow = 0, aiTrips = 0, logs = 0;
    for (let k = 1; k <= 10; k++) {
      const g = lit(); g.seed = k * 31;
      lightsOf(g).mode = 'sensor';
      const base = exposureParts(g).lights;
      for (let q = 0; q < 96 * 14; q++) { g.clock.ticks = q; g.clock.t = 0.5 + q / 96; logs += wildlifeNight(g).length; if (animalNearby(g)) tripped++; }
      glow += exposureParts(g).lights - base;
      const a = lit(); a.seed = k * 31; a.stock.ai_sensor_module = 1; setAiSensor(a, ARMORY_LIGHTS, true);
      for (let q = 0; q < 96 * 14; q++) { a.clock.ticks = q; a.clock.t = 0.5 + q / 96; wildlifeNight(a); if (floodlightLit(a, ARMORY_LIGHTS)) aiTrips++; }
    }
    expect(tripped).toBeGreaterThan(0);
    expect(glow).toBeGreaterThan(0);
    expect(logs).toBeGreaterThan(0);
    expect(aiTrips).toBe(0);
  });
  it('no lights, nothing to trip; daytime does nothing', () => {
    const g = place(40, 'appalachia'); g.clock.t = 0.5;
    for (let q = 0; q < 96 * 5; q++) { g.clock.ticks = q; g.clock.t = 0.5 + q / 96; wildlifeNight(g); }
    expect(animalNearby(g)).toBe(false);
    const h = lit(); h.clock.t = 0.2;        // 11:00
    expect(wildlifeNight(h)).toEqual([]);
  });
});

describe('save v47', () => {
  it('upgrades a v46 save: wildlife state, the module in stock, the light fields', () => {
    const g = newGame(1) as unknown as Record<string, unknown>;
    const old = { ...g, version: 46, lights: { mode: 'sensor', per: {}, alertUntil: -1 }, stock: { ...(g.stock as object) } } as Record<string, unknown>;
    delete old.wildlife; delete (old.stock as Record<string, unknown>).ai_sensor_module;
    const up = migrate(old);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.wildlife).toBeDefined();
    expect(up.stock.ai_sensor_module).toBe(0);
    expect(up.lights!.ai).toEqual({}); expect(up.lights!.animalNights).toEqual([]);
  });
});
