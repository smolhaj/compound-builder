import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { addWork, isFinished } from './construction';
import { BLUEPRINTS, totalBill, totalHours } from './blueprints';
import { billCost } from './materials';
import { planBattle } from './battle';
import { postureOf } from './encounters';
import { defenseReport } from './defenseReport';
import { migrate } from './save/migrations';
import {
  TOWERS, TOWER_CHAIN, TOWER_NEXT, floodReady, heavyCaliber, mountReady, towerPosture, towersBuilt, towerUpgradeProblem, turretsReady, upgradeTower,
} from './towers';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;   // midday
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
const night = (g: GameState) => { g.clock.t = Math.floor(g.clock.t) + 0.75; return g; };   // 00:00 + 6 h → hourOf = 0
const tower = (g: GameState, kind: string, id = 't1', x = 0, z = 6): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const armWithRifles = (g: GameState) => {
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
  }
  g.armory.ammo['556'] = 600;
};
const power = (g: GameState) => { g.utilities.lit = ['house']; };
const dark = (g: GameState) => { g.utilities.lit = []; g.utilities.grid = false; };

describe('the tower chain', () => {
  it('runs rise → wood → concrete → floodlights → manned mount → turret, each tier stronger and dearer', () => {
    expect(TOWER_CHAIN).toEqual(['rise_lookout', 'watchtower_wood', 'watchtower_concrete', 'watchtower_flood', 'watchtower_mount', 'watchtower_turret']);
    let k: string | undefined = TOWER_CHAIN[0], steps = 0, last = TOWERS[TOWER_CHAIN[0]];
    for (let i = 1; i < TOWER_CHAIN.length; i++) {
      const prev = TOWERS[TOWER_CHAIN[i - 1]], cur = TOWERS[TOWER_CHAIN[i]];
      expect(TOWER_NEXT[prev.kind]).toBe(cur.kind);
      expect(cur.tier).toBe(prev.tier + 1);
      expect(cur.post.cover).toBeLessThan(prev.post.cover);        // better cover (fewer hits land)
      expect(cur.post.value).toBeGreaterThan(prev.post.value);
      expect(cur.post.y).toBeGreaterThan(prev.post.y);
      expect(cur.post.reach).toBeGreaterThanOrEqual(prev.post.reach);
      expect(cur.view).toBeGreaterThanOrEqual(prev.view);
      expect(cur.viewR).toBeGreaterThanOrEqual(prev.viewR);
      expect(billCost(totalBill(BLUEPRINTS[cur.kind]))).toBeGreaterThan(billCost(totalBill(BLUEPRINTS[prev.kind])));
      expect(totalHours(BLUEPRINTS[cur.kind])).toBeGreaterThan(totalHours(BLUEPRINTS[prev.kind]));
    }
    while (k) { steps++; k = TOWER_NEXT[k]; last = TOWERS[TOWER_CHAIN[Math.min(steps, 5)]]; }
    expect(steps).toBe(6);
    expect(last.turret).toBe(true);
    // only the top tiers fight with more than a rifle
    expect(TOWER_CHAIN.filter(c => TOWERS[c].mount)).toEqual(['watchtower_mount', 'watchtower_turret']);
    expect(TOWER_CHAIN.filter(c => TOWERS[c].turret)).toEqual(['watchtower_turret']);
    expect(TOWER_CHAIN.filter(c => TOWERS[c].flood)).toEqual(['watchtower_flood', 'watchtower_mount', 'watchtower_turret']);
  });

  it('higher tiers raise "seen coming" and the gate posture', () => {
    let last = -1, lastDet = -1;
    for (const kind of TOWER_CHAIN) {
      const g = afterHit(2); tower(g, kind); power(g);
      const p = towerPosture(g);
      expect(p.detection).toBeGreaterThanOrEqual(last);
      last = p.detection;
      const det = postureOf(g).detection;
      expect(det).toBeGreaterThanOrEqual(lastDet);
      lastDet = det;
    }
    const none = postureOf(afterHit(2)).detection, rise = (() => { const g = afterHit(2); tower(g, 'rise_lookout'); return postureOf(g).detection; })();
    expect(rise).toBeGreaterThan(none);
  });

  it('the defense report names the tower tier and the top tiers\' needs', () => {
    const g = afterHit(2); tower(g, 'watchtower_turret'); dark(g);
    const d = defenseReport(g);
    expect(d.watch.find(c => c.id === 'tower')?.detail).toMatch(/automated turret/);
    expect(d.watch.find(c => c.id === 'mount')?.ok).toBe(false);
    expect(d.watch.find(c => c.id === 'turret')?.ok).toBe(false);
    expect(d.watch.find(c => c.id === 'towerlights')?.ok).toBe(false);
    expect(d.improvements).toContain(TOWERS.watchtower_turret.name);
  });
});

describe('upgrading a tower in place', () => {
  it('stakes the next tier beside the old one; the old keeps working until the new is finished, then goes with half its materials back', () => {
    const g = afterHit(3);
    const old = tower(g, 'watchtower_wood', 'w1', 4, 4);
    expect(towerUpgradeProblem(g, old)).toBeNull();
    expect(upgradeTower(g, old.id)).toBeNull();
    const up = g.structures.find(x => x.replaces === old.id)!;
    expect(up.kind).toBe('watchtower_concrete');
    expect(Math.hypot(up.x - old.x, up.z - old.z)).toBeGreaterThan(0.4);          // beside it, not on top of it
    expect(Math.hypot(up.x - old.x, up.z - old.z)).toBeLessThan(1.2);
    expect(towerUpgradeProblem(g, old)).toMatch(/under way/);
    // the old tier still stands and still keeps the watch
    expect(towersBuilt(g).map(x => x.st.id)).toEqual([old.id]);
    expect(isFinished(up)).toBe(false);
    // pay for it and build it
    g.paper.permits = false;
    up.permit = 'ok';
    for (const [m, n] of Object.entries(totalBill(BLUEPRINTS[up.kind]))) (g.stock as unknown as Record<string, number>)[m] += n as number;
    const before = { ...g.stock };
    for (let i = 0; i < 200 && !isFinished(up); i++) addWork(g, up, 100);
    expect(isFinished(up)).toBe(true);
    expect(g.structures.some(x => x.id === old.id)).toBe(false);
    expect(up.replaces).toBeUndefined();
    expect(towersBuilt(g).map(x => x.st.id)).toEqual([up.id]);
    // half the old tier's materials are back (the new tier's own were spent)
    const oldBill = totalBill(BLUEPRINTS.watchtower_wood) as Record<string, number>, newBill = totalBill(BLUEPRINTS.watchtower_concrete) as Record<string, number>;
    for (const [m, n] of Object.entries(oldBill)) {
      const spent = newBill[m] ?? 0;
      expect((g.stock as unknown as Record<string, number>)[m]).toBe((before as unknown as Record<string, number>)[m] - spent + Math.floor(n * 0.5));
    }
    expect(towerUpgradeProblem(g, up)).toBeNull();      // and the next one up is open
  });

  it('the top tier has nothing to upgrade to, an unfinished tower cannot be upgraded, and a non-tower is refused', () => {
    const g = afterHit(3);
    const top = tower(g, 'watchtower_turret');
    expect(towerUpgradeProblem(g, top)).toMatch(/nothing better/);
    const half: Structure = { id: 'x', kind: 'watchtower_wood', x: 3, z: 3, rot: 0, stage: 1, done: 0, supplied: false, finishedAt: null };
    g.structures.push(half);
    expect(towerUpgradeProblem(g, half)).toMatch(/not finished/);
    expect(upgradeTower(g, 'house')).toMatch(/not a tower/);
    expect(upgradeTower(g, 'nope')).toMatch(/no such/);
  });

  it('walks the whole chain from the rise to the turret, one upgrade at a time', () => {
    const g = afterHit(4);
    g.paper.permits = false;
    let cur = tower(g, 'rise_lookout', 'r', 8, 8);
    for (let tier = 2; tier <= 6; tier++) {
      expect(upgradeTower(g, cur.id)).toBeNull();
      const up = g.structures.find(x => x.replaces === cur.id)!;
      expect(TOWERS[up.kind as keyof typeof TOWERS].tier).toBe(tier);
      for (const [m, n] of Object.entries(totalBill(BLUEPRINTS[up.kind]))) (g.stock as unknown as Record<string, number>)[m] += n as number;
      for (let i = 0; i < 300 && !isFinished(up); i++) addWork(g, up, 200);
      expect(isFinished(up)).toBe(true);
      cur = up;
    }
    expect(cur.kind).toBe('watchtower_turret');
    expect(g.structures.filter(x => x.kind in TOWERS).length).toBe(1);
  });
});

describe('what the top tiers need', () => {
  const mounted = (seed = 5) => { const g = afterHit(seed); tower(g, 'watchtower_mount'); return g; };
  const autoFromHome = (g: GameState, seed: number) => planBattle(g, 6, seed).events.filter(e => e.kind === 'shot' && e.from.startsWith('h_') && e.auto).length;

  it('a manned mount needs a person on the tower and rounds in the armory', () => {
    const g = mounted();
    expect(mountReady(g)).toBeNull();                                   // no ammunition
    g.armory.ammo['308'] = 400;
    expect(heavyCaliber(g, 60)).toBe('308');
    expect(mountReady(g)?.cal).toBe('308');
    g.armory.ammo['308'] = 30;                                           // too few rounds to man it
    expect(mountReady(g)).toBeNull();
    g.armory.ammo['308'] = 400;
    for (const ps of g.personState) ps.needs.died = 3;                  // nobody left alive to go up
    expect(mountReady(g)).toBeNull();
  });

  it('in the battle the mount fires full-auto bursts from the tower only with a person and ammunition, and burns the rounds', () => {
    let withAmmo = 0, without = 0, spent = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const a = mounted(seed); armWithRifles(a); a.armory.ammo['308'] = 900; a.armory.ammo['556'] = 0;   // rifles are dry: only the mount shoots
      const pa = planBattle(a, 6, seed);
      withAmmo += pa.events.filter(e => e.kind === 'shot' && e.from.startsWith('h_') && e.auto).length;
      spent += pa.spent['308'] ?? 0;
      const b = mounted(seed); armWithRifles(b); b.armory.ammo['556'] = 0; b.armory.ammo['308'] = 0;
      without += autoFromHome(b, seed);
    }
    expect(withAmmo).toBeGreaterThan(0);
    expect(spent).toBeGreaterThan(0);
    expect(without).toBe(0);
  });

  it('a turret needs power and a lot of ammunition; nobody has to be on it', () => {
    const g = afterHit(6); tower(g, 'watchtower_turret'); power(g);
    g.armory.ammo['556'] = 150;
    expect(turretsReady(g)).toHaveLength(0);                             // not enough rounds
    g.armory.ammo['556'] = 800;
    expect(turretsReady(g)).toHaveLength(1);
    dark(g);
    expect(turretsReady(g)).toHaveLength(0);                             // no power: it does not fire
    power(g);
    // the battle: a turret unit that is not a person, and it shoots with every resident hiding
    let shots = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const h = afterHit(seed + 10); tower(h, 'watchtower_turret'); power(h); h.armory.ammo['556'] = 800;
      for (const p of h.people) p.kid = true;                             // nobody to fight
      const b = planBattle(h, 5, seed);
      const t = b.units.find(u => u.machine === 'turret');
      expect(t).toBeTruthy();
      expect(t!.personId).toBeUndefined();
      shots += b.events.filter(e => e.kind === 'shot' && e.from === t!.id).length;
    }
    expect(shots).toBeGreaterThan(0);
    // dark or dry: no turret unit
    const c = afterHit(7); tower(c, 'watchtower_turret'); dark(c); c.armory.ammo['556'] = 800;
    expect(planBattle(c, 5, 1).units.some(u => u.machine)).toBe(false);
    const d = afterHit(7); tower(d, 'watchtower_turret'); power(d);
    expect(planBattle(d, 5, 1).units.some(u => u.machine)).toBe(false);
  });

  it('a turret can jam', () => {
    let jams = 0;
    for (let seed = 1; seed <= 300 && !jams; seed++) {
      const h = afterHit(seed + 20); tower(h, 'watchtower_turret'); power(h); h.armory.ammo['556'] = 5000;
      for (const p of h.people) p.kid = true;
      jams += planBattle(h, 8, seed).events.filter(e => e.kind === 'jam' && e.unit.startsWith('t_')).length;
    }
    expect(jams).toBeGreaterThan(0);
  });

  it('floodlights on a tower need power: dark without it, a lit approach with it', () => {
    const g = night(afterHit(8)); tower(g, 'watchtower_flood'); dark(g);
    expect(floodReady(g)).toBe(false);
    expect(defenseReport(g).watch.find(c => c.id === 'towerlights')?.ok).toBe(false);
    const darkP = towerPosture(g);
    power(g); lightsOf(g).mode = 'on';
    expect(floodReady(g)).toBe(true);
    expect(towerPosture(g).detection).toBeGreaterThan(darkP.detection);
    expect(towerPosture(g).visibility).toBeGreaterThan(darkP.visibility);
    // a wooden tower has no lamps whatever the power
    const w = afterHit(8); tower(w, 'watchtower_wood'); power(w);
    expect(floodReady(w)).toBe(false);
    // at night in the fight: the lights come on from the masts only with power
    const lit = night(afterHit(9)); tower(lit, 'watchtower_flood'); power(lit);
    const bl = planBattle(lit, 5, 3);
    const ev = bl.events.find(e => e.kind === 'lights');
    expect(ev && ev.kind === 'lights' && ev.masts?.length).toBeGreaterThan(0);
    const unlit = night(afterHit(9)); tower(unlit, 'watchtower_flood'); dark(unlit);
    expect(planBattle(unlit, 5, 3).events.some(e => e.kind === 'lights')).toBe(false);
  });

  it('a higher tier is a better post: more cover and a taller view in the battle', () => {
    const g = afterHit(11); tower(g, 'watchtower_concrete');
    const b = planBattle(g, 4, 2);
    const up = b.events.filter(e => e.kind === 'move' && e.y !== undefined);
    expect(up.some(e => e.kind === 'move' && Math.abs((e.y ?? 0) - TOWERS.watchtower_concrete.post.y) < 1e-6)).toBe(true);
  });
});

describe('saves', () => {
  it('a v42 save gets the mount and turret goods at zero and loads at the current version', () => {
    const g = newGame(1) as unknown as Record<string, unknown>;
    const stock = { ...(g.stock as Record<string, number>) };
    delete stock.gun_mount; delete stock.turret_head;
    const up = migrate({ ...g, version: 42, stock });
    expect(up.stock.gun_mount).toBe(0);
    expect(up.stock.turret_head).toBe(0);
  });
});

import { lightsOf, floodlightLit, lightMode, newLights, ARMORY_LIGHTS, SENSOR_HOLD, raiseAlert, threatNearby } from './lights';
import { exposureParts } from './opsec';
import { highBonus, highGroundAt, setGroundProbe, stampHighGround, HIGH_FULL } from './towers';
describe('high ground', () => {
  const hill = (cx: number, cz: number, h: number) => (x: number, z: number) => h * Math.max(0, 1 - Math.hypot(x - cx, z - cz) / 9);
  it('is how far the site stands above the land round it, never negative, and flat ground gives none', () => {
    setGroundProbe(() => 3);
    expect(highGroundAt(10, 10)).toBe(0);
    setGroundProbe(hill(10, 10, 0.8));
    expect(highGroundAt(10, 10)).toBeGreaterThan(0.3);
    setGroundProbe((x) => -x * 0.2);                       // a hole relative to a slope
    expect(highGroundAt(0, 0)).toBeGreaterThanOrEqual(0);
    setGroundProbe(null);
    expect(highGroundAt(10, 10)).toBe(0);
  });

  it('adds modest, capped sight and warning, most to the low rise and least to a tall tower', () => {
    setGroundProbe(hill(6, 6, 2));
    const mk = (kind: string): Structure => { const st = { id: kind, kind, x: 6, z: 6, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as Structure; stampHighGround(st); return st; };
    const rise = mk('rise_lookout'), wood = mk('watchtower_wood'), top = mk('watchtower_turret');
    expect(rise.high).toBeGreaterThanOrEqual(HIGH_FULL);
    const br = highBonus(rise, 'rise_lookout'), bw = highBonus(wood, 'watchtower_wood'), bt = highBonus(top, 'watchtower_turret');
    expect(br.view).toBeGreaterThan(bw.view); expect(bw.view).toBeGreaterThan(bt.view); expect(bt.view).toBeGreaterThan(0);
    expect(br.view).toBeLessThanOrEqual(10); expect(br.viewR).toBeLessThanOrEqual(5); expect(br.reach).toBeLessThanOrEqual(0.2);
    // a huge hill adds nothing more
    setGroundProbe(hill(6, 6, 50));
    const big = mk('rise_lookout');
    expect(highBonus(big, 'rise_lookout')).toEqual(br);
    // none stamped: no bonus
    expect(highBonus({ ...rise, high: undefined } as Structure, 'rise_lookout').view).toBe(0);
    setGroundProbe(null);
  });

  it('a tower on a hill gives more warning than the same tower on the flat', () => {
    const run = (probe: ((x: number, z: number) => number) | null) => {
      setGroundProbe(probe);
      const g = afterHit(2); const st = tower(g, 'rise_lookout', 'r', 6, 6); stampHighGround(st);
      const d = towerPosture(g).detection;
      setGroundProbe(null);
      return d;
    };
    expect(run(hill(6, 6, 1.5))).toBeGreaterThan(run(null));
  });
});

describe('floodlight discipline', () => {
  it('defaults to the motion sensor, with a global default and per-light overrides', () => {
    const g = afterHit(1);
    expect(lightsOf(g).mode).toBe('sensor');
    expect(lightMode(g, 'tw')).toBe('sensor');
    lightsOf(g).mode = 'off'; lightsOf(g).per.tw = 'on';
    expect(lightMode(g, 'tw')).toBe('on');
    expect(lightMode(g, 'other')).toBe('off');
    expect(newLights().mode).toBe('sensor');
  });

  it('always on is lit with power and nothing else; the sensor needs a threat (and holds a while after); off is never lit; no power, no light', () => {
    const g = afterHit(1); power(g);
    lightsOf(g).per.a = 'on'; lightsOf(g).per.b = 'sensor'; lightsOf(g).per.c = 'off';
    expect([floodlightLit(g, 'a', false), floodlightLit(g, 'b', false), floodlightLit(g, 'c', false)]).toEqual([true, false, false]);
    expect([floodlightLit(g, 'a', true), floodlightLit(g, 'b', true), floodlightLit(g, 'c', true)]).toEqual([true, true, false]);
    // the sensors trip on an alarm and hold for a short time
    expect(threatNearby(g)).toBe(false);
    raiseAlert(g);
    expect(floodlightLit(g, 'b')).toBe(true);
    g.clock.t += SENSOR_HOLD + 0.001;
    expect(floodlightLit(g, 'b')).toBe(false);
    dark(g);
    expect([floodlightLit(g, 'a', true), floodlightLit(g, 'b', true)]).toEqual([false, false]);
  });

  it('a blackout (curtains) turns every light off whatever its mode', () => {
    const g = afterHit(1); power(g);
    lightsOf(g).per.a = 'on';
    expect(floodlightLit(g, 'a', true)).toBe(true);
    g.opsec = { quietDeliveries: false, blackout: true };
    expect(floodlightLit(g, 'a', true)).toBe(false);
  });

  it('the armory\'s yard lights and the towers\' masts share it; always-on lights raise the OPSEC exposure and the gate visibility, the sensor does not', () => {
    const mk = (mode: 'on' | 'sensor' | 'off') => { const g = afterHit(3); power(g); g.stock.floodlights = 1; tower(g, 'watchtower_flood', 'f1', 4, 4); lightsOf(g).mode = mode; return g; };
    const on = mk('on'), sensor = mk('sensor'), off = mk('off');
    expect(exposureParts(on).lights).toBeGreaterThan(exposureParts(sensor).lights);
    expect(exposureParts(sensor).lights).toBe(exposureParts(off).lights);
    expect(postureOf(on).visibility).toBeGreaterThan(postureOf(sensor).visibility);
    // warning: off gives none of the lights' share, the sensor and always-on do
    expect(postureOf(sensor).detection).toBeGreaterThan(postureOf(off).detection);
    expect(floodlightLit(on, ARMORY_LIGHTS, false)).toBe(true);
    // at night in a raid: the sensor lights come on (the raid trips them), off stays dark, per light
    const nightRaid = (g: GameState) => planBattle(night(g), 5, 3).events.find(e => e.kind === 'lights');
    expect(nightRaid(mk('sensor'))).toBeTruthy();
    expect(nightRaid(mk('off'))).toBeUndefined();
    const mixed = mk('off'); lightsOf(mixed).per.f1 = 'sensor';
    const ev = nightRaid(mixed);
    expect(ev && ev.kind === 'lights' && ev.masts?.length).toBe(1);
  });

  it('a v42 save gets the default floodlight mode', () => {
    const g = newGame(1) as unknown as Record<string, unknown>;
    const up = migrate({ ...g, version: 42, lights: undefined });
    expect(up.lights?.mode).toBe('sensor');
  });
});

describe('plan variants', () => {
  it('the octagonal timber and hexagonal concrete towers stand at their tier, a little better, cost real money, upgrade into the chain, and are in the price table', () => {
    expect(TOWERS.watchtower_octagon.tier).toBe(TOWERS.watchtower_wood.tier);
    expect(TOWERS.watchtower_hex.tier).toBe(TOWERS.watchtower_concrete.tier);
    expect(TOWERS.watchtower_octagon.post.cover).toBeLessThan(TOWERS.watchtower_wood.post.cover);
    expect(TOWERS.watchtower_hex.post.cover).toBeLessThan(TOWERS.watchtower_concrete.post.cover);
    expect(TOWERS.watchtower_octagon.post.cover).toBeGreaterThan(TOWERS.watchtower_concrete.post.cover);
    expect(TOWER_NEXT.watchtower_octagon).toBe('watchtower_concrete');
    expect(TOWER_NEXT.watchtower_hex).toBe('watchtower_flood');
    for (const k of ['watchtower_octagon', 'watchtower_hex'] as const) {
      const base = k === 'watchtower_octagon' ? 'watchtower_wood' : 'watchtower_concrete';
      expect(billCost(totalBill(BLUEPRINTS[k]))).toBeGreaterThan(billCost(totalBill(BLUEPRINTS[base])));
      expect(totalHours(BLUEPRINTS[k])).toBeGreaterThan(0);
    }
  });
});
