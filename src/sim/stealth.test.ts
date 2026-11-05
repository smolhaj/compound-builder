import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { planBattle } from './battle';
import { BLUEPRINTS } from './blueprints';
import { demandNow } from './heating';
import { exposure, exposureParts, giveAwayReadout, raidPressure } from './opsec';
import { floodlightArmed, floodlightLit, lightsOf, raiseAnimalAlert, raiseAlert, setAiSensor } from './lights';
import { nightWork } from './blackout';
import { adoptDog } from './pets';
import { chill, chillMorale, chimneyPoints, quietDogsProblem, setDogsQuiet, setStealth, stealthCosts } from './stealth';
import { DOG_TRAINER, insulationCover, stealthOf, woodK } from './stealthState';
import { coldExposure } from './cold';
import { postureOf } from './encounters';

afterEach(() => setGroundOverride(null));
const N = 150;

/** A lot after the hit on a cold night, the stove going, with everything that gives a place away. */
function lot(seed = 3): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.site = { ...g.site, creek: false };
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, grid: 0 };
  g.utilities.lit = ['h'];
  g.stock.firewood = 40; g.heat.burned = 0;
  g.stock.goat = 6; g.stock.pig = 3;
  g.stock.floodlights = 3;
  g.money = 100_000;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 3000;
  adoptDog(g, { ageYears: 3, training: 80, guard: true });
  adoptDog(g, { ageYears: 2, training: 60, guard: false });
  // the coldest night in the next two years
  let best = 0, bestT = 0;
  for (let d = 60; d < 60 + 500; d++) { g.clock.t = Math.floor(g.disaster.hitAt) + d + 0.9; const x = demandNow(g); if (x > best) { best = x; bestT = g.clock.t; } }
  g.clock.t = bestT;
  g.daily!.social.noise = 8; g.daily!.social.noiseAt = g.clock.t - 0.1;
  return g;
}
const mild = (g: GameState): GameState => { for (let d = 60; d < 560; d++) { g.clock.t = Math.floor(g.disaster.hitAt) + d + 0.9; if (demandNow(g) < 0.05) return g; } return g; };

const OPTIONS: Array<[string, (g: GameState) => void]> = [
  ['a smokeless stove', g => setStealth(g, 'burn', 'smokeless')],
  ['a dusk-only stove', g => setStealth(g, 'burn', 'dusk')],
  ['quiet hours', g => setStealth(g, 'quiet', true)],
  ['dogs trained quiet', g => { expect(setDogsQuiet(g, true)).toBeNull(); }],
  ['wall insulation', g => { g.stock.wall_insulation = 1; }],
  ['full stealth', g => setStealth(g, 'full', true)],
  ['full stealth with insulation and quiet dogs', g => { setStealth(g, 'full', true); g.stock.wall_insulation = 1; setDogsQuiet(g, true); }],
];

describe('every stealth option only lowers what the place gives away', () => {
  for (const [name, add] of OPTIONS) {
    it(`${name}: exposure and raid pressure never rise, and no give-away does`, () => {
      const a = lot(), b = lot(); add(b);
      expect(exposure(b)).toBeLessThanOrEqual(exposure(a));
      expect(raidPressure(b)).toBeLessThanOrEqual(raidPressure(a) + 1e-9);
      const pa = exposureParts(a), pb = exposureParts(b);
      for (const k of Object.keys(pa) as Array<keyof typeof pa>) expect(pb[k]).toBeLessThanOrEqual(pa[k] + 1e-9);
      const ga = giveAwayReadout(a), gb = giveAwayReadout(b);
      for (const [i, x] of ga.entries()) expect(gb[i].points).toBeLessThanOrEqual(x.points + 1e-9);
      expect(postureOf(b).visibility).toBeLessThanOrEqual(postureOf(a).visibility + 1e-9);
    });
  }
  it('the plain lot has a chimney plume, noisy stock and dogs and a lit house to give away', () => {
    const g = lot();
    expect(chimneyPoints(g)).toBeGreaterThan(1);
    const [light, smoke, noise, heat] = giveAwayReadout(g);
    expect(light.points).toBeGreaterThan(0); expect(smoke.points).toBeGreaterThan(0); expect(noise.points).toBeGreaterThan(0); expect(heat.points).toBeGreaterThan(0);
    expect(heat.counts).toBe(false);
  });
  it('full stealth cuts every counted give-away, and the readout lists light, smoke, noise and heat as numbers', () => {
    const a = lot(), b = lot(); setStealth(b, 'full', true);
    const ga = giveAwayReadout(a), gb = giveAwayReadout(b);
    expect(gb.map(x => x.id)).toEqual(['light', 'smoke', 'noise', 'heat']);
    for (const i of [0, 1, 2]) expect(gb[i].points).toBeLessThan(ga[i].points);
    expect(exposure(b)).toBeLessThan(exposure(a));
  });
  it('nothing shows by day, before the hit, or on a mild night', () => {
    const g = lot(); g.clock.t = Math.floor(g.clock.t) + 0.5; expect(chimneyPoints(g)).toBe(0);
    const h = mild(lot()); expect(chimneyPoints(h)).toBe(0);
  });
});

describe('what stealth costs', () => {
  it('a dusk-only stove burns a fifth less wood and chills the house on a cold night; smokeless burns more wood', () => {
    const g = lot(); expect(woodK(g)).toBe(1); expect(chill(g)).toBe(0); expect(chillMorale(g)).toBe(0);
    setStealth(g, 'burn', 'dusk'); expect(woodK(g)).toBeLessThan(1); expect(chill(g)).toBeGreaterThan(0.3); expect(chillMorale(g)).toBeLessThan(-2);
    expect(coldExposure(g)).toBeGreaterThan(0);                  // wood in hand, and still a cold morning
    expect(stealthCosts(g).join(' ')).toMatch(/cold house/);
    const h = lot(); setStealth(h, 'burn', 'smokeless'); expect(woodK(h)).toBeGreaterThan(1); expect(chill(h)).toBe(0);
    const m = mild(lot()); setStealth(m, 'burn', 'dusk'); expect(chill(m)).toBe(0);   // mild nights: no chill
  });
  it('quiet hours halve night work between 21:00 and 05:00 and leave the day alone', () => {
    const g = lot(); expect(nightWork(g, 23)).toBe(1);
    setStealth(g, 'quiet', true);
    expect(nightWork(g, 23)).toBeCloseTo(0.5); expect(nightWork(g, 3)).toBeCloseTo(0.5); expect(nightWork(g, 12)).toBe(1);
  });
  it('quiet dogs cost a trainer once per dog, cannot be bought without the money or a dog, and bark again for free', () => {
    const g = lot(), m = g.money;
    expect(setDogsQuiet(g, true)).toBeNull(); expect(g.money).toBe(m - 2 * DOG_TRAINER);
    expect(setDogsQuiet(g, false)).toBeNull(); expect(setDogsQuiet(g, true)).toBeNull(); expect(g.money).toBe(m - 2 * DOG_TRAINER);
    const poor = lot(); poor.money = 10; expect(quietDogsProblem(poor)).toMatch(/trainer/); expect(setDogsQuiet(poor, true)).toMatch(/trainer/);
    const none = lot(); none.dogs = []; expect(quietDogsProblem(none)).toMatch(/no dogs/);
  });
  it('insulation covers houses in sets, mutes sound and trims the stove, and a plain lot is untouched', () => {
    const g = lot(); expect(insulationCover(g)).toBe(0);
    const d0 = demandNow(g); g.stock.wall_insulation = 1;
    expect(insulationCover(g)).toBe(1); expect(demandNow(g)).toBeLessThan(d0);
    expect(stealthOf(lot())).toEqual({});
  });
});

describe('stealth plus a lit response: floodlights', () => {
  const sensors = (): GameState => { const g = lot(); lightsOf(g).mode = 'sensor'; lightsOf(g).per.a = 'sensor'; lightsOf(g).per.b = 'sensor'; g.stock.ai_sensor_module = 1; expect(setAiSensor(g, 'b', true)).toBeNull(); return g; };
  it('an AI-sensor light stays dark for an animal and lights only for a person', () => {
    const g = sensors();
    expect(floodlightLit(g, 'b', null)).toBe(false);
    raiseAnimalAlert(g, 0); expect(floodlightLit(g, 'b')).toBe(false); expect(floodlightLit(g, 'a')).toBe(true);   // the basic light is fooled
    raiseAlert(g); expect(floodlightLit(g, 'b')).toBe(true);
  });
  it('lights out does not switch off an AI-sensor light near the fence: dark until a person comes, then lit', () => {
    for (const how of ['manual', 'dusk', 'stealth'] as const) {
      const g = sensors();
      if (how === 'manual') g.opsec = { quietDeliveries: false, blackout: true }; else if (how === 'dusk') g.opsec = { quietDeliveries: false, blackout: false, auto: 'dusk' }; else setStealth(g, 'full', true);
      expect(floodlightArmed(g, 'b')).toBe(true);
      expect(floodlightLit(g, 'b', 'animal')).toBe(false); expect(floodlightLit(g, 'b', null)).toBe(false);
      expect(floodlightLit(g, 'b', 'human')).toBe(true);
      // a plain sensor light under a plain lights-out stays forced off (the old rule); full stealth keeps it as a sensor light
      expect(floodlightLit(g, 'a', 'human')).toBe(how === 'stealth');
    }
  });
  it('the empty place left dark stays dark, and an off light stays off', () => {
    const g = sensors(); setStealth(g, 'full', true); lightsOf(g).per.b = 'off';
    expect(floodlightLit(g, 'b', 'human')).toBe(false);
  });
  it('full stealth turns an always-on light into a sensor light: dark, then lit for a person', () => {
    const g = lot(); lightsOf(g).mode = 'on'; setStealth(g, 'full', true);
    expect(floodlightLit(g, 'x', null)).toBe(false); expect(floodlightLit(g, 'x', 'human')).toBe(true);
  });
});

describe('a raid is never easier with stealth on (crews of 6 and 10, 150 seeded raids)', () => {
  const rate = (g: GameState, crew: number): number => { let n = 0; for (let seed = 1; seed <= N; seed++) { const r = planBattle(g, crew, seed).result; if (r === 'breached' || r === 'overrun') n++; } return n / N; };
  const notWorse = (without: number, withEl: number) => { const sd = Math.sqrt((without * (1 - without) + withEl * (1 - withEl)) / N); expect(withEl).toBeLessThanOrEqual(without + 2 * sd + 1e-9); };
  const night = (g: GameState): GameState => { g.clock.t = Math.floor(g.clock.t) + 0.9; return g; };
  const withSensors = (g: GameState): GameState => { lightsOf(g).mode = 'sensor'; g.stock.ai_sensor_module = 3; return g; };
  for (const crew of [6, 10]) {
    it(`full stealth (lit sensor floodlights, crew of ${crew})`, () => {
      const a = withSensors(night(lot())), b = withSensors(night(lot())); setStealth(b, 'full', true);
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
    it(`full stealth with always-on floodlights (crew of ${crew})`, () => {
      const a = night(lot()), b = night(lot()); lightsOf(a).mode = 'on'; lightsOf(b).mode = 'on'; setStealth(b, 'full', true);
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
    it(`lights out with AI-sensor floodlights (crew of ${crew})`, () => {
      const a = withSensors(night(lot())), b = withSensors(night(lot()));
      b.opsec = { quietDeliveries: false, blackout: true };
      for (const id of ['armory']) setAiSensor(b, id, true);
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
    it(`a smokeless stove, quiet hours, quiet dogs and insulation together (crew of ${crew})`, () => {
      const a = night(lot()), b = night(lot());
      setStealth(b, 'burn', 'smokeless'); setStealth(b, 'quiet', true); setDogsQuiet(b, true); b.stock.wall_insulation = 1;
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
  }
});
