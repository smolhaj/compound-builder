import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planRun } from './perimeter';
import { backgroundOf } from './family';
import { skillOf } from './armory';
import { applyBattle, canRigMines, minesDay, planBattle, type PlannedBattle } from './battle';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;   // midday
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
function fortify(g: GameState): GameState {
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  g.structures.push({ id: 'tw', kind: 'water_tower', x: 0, z: 6, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  g.stock.sandbags = 3;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
  }
  g.armory.ammo['556'] = 2000;
  return g;
}
const losses = (b: PlannedBattle) => b.events.filter(e => (e.kind === 'wound' || e.kind === 'death') && e.unit.startsWith('h_')).length;

describe('the battle at the compound', () => {
  it('is deterministic and its events come in time order, ending with a result', () => {
    const a = planBattle(fortify(afterHit(3)), 6, 42), b = planBattle(fortify(afterHit(3)), 6, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (let i = 1; i < a.events.length; i++) expect(a.events[i].t).toBeGreaterThanOrEqual(a.events[i - 1].t);
    expect(a.events[a.events.length - 1].kind).toBe('end');
    expect(a.events.some(e => e.kind === 'alarm')).toBe(true);
    expect(a.events.some(e => e.kind === 'move' && e.unit.startsWith('h_'))).toBe(true);
  });

  it('a defended compound repels more and loses fewer people; no guns gets breached more', () => {
    let goodHeld = 0, openHeld = 0, goodLoss = 0, openLoss = 0, openBreach = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const good = planBattle(fortify(afterHit(seed)), 6, seed), open = planBattle(afterHit(seed), 6, seed);
      if (good.result === 'repelled' || good.result === 'fled') goodHeld++;
      if (open.result === 'repelled' || open.result === 'fled') openHeld++;
      if (open.result === 'breached' || open.result === 'overrun') openBreach++;
      goodLoss += losses(good); openLoss += losses(open);
    }
    expect(goodHeld).toBeGreaterThan(openHeld);
    expect(goodLoss).toBeLessThan(openLoss);
    expect(openBreach).toBeGreaterThan(15);
  });

  it('mines along the approach go off', () => {
    let mines = 0;
    for (let seed = 1; seed <= 10; seed++) { const g = fortify(afterHit(seed)); g.stock.mines = 8; mines += planBattle(g, 6, seed).events.filter(e => e.kind === 'mine').length; }
    expect(mines).toBeGreaterThan(0);
    expect(canRigMines(afterHit(1))).toBe(true);
  });

  it('a breach can kill people, and applyBattle writes it into the game', () => {
    let killed = false;
    for (let seed = 1; seed <= 40 && !killed; seed++) {
      const g = afterHit(seed);
      const b = planBattle(g, 10, seed);
      if (b.events.some(e => e.kind === 'breach') && b.events.some(e => e.kind === 'death' && e.unit.startsWith('h_'))) {
        const lost = g.gate.raidsLost;
        applyBattle(g, b);
        killed = g.personState.some(p => p.needs.died != null);
        if (b.result === 'breached' || b.result === 'overrun') expect(g.gate.raidsLost).toBe(lost + 1);
      }
    }
    expect(killed).toBe(true);
  });

  it('raiders in cover take fewer hits than raiders moving in the open', () => {
    let coverShots = 0, coverHits = 0, openShots = 0, openHits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const b = planBattle(fortify(afterHit(seed)), 6, seed);
      const inCover = new Set<string>();
      for (const e of b.events) {
        if (e.kind === 'cover') inCover.add(e.unit);
        else if (e.kind === 'move') inCover.delete(e.unit);
        else if (e.kind === 'shot' && e.to.startsWith('r')) {
          if (inCover.has(e.to)) { coverShots++; if (e.hit) coverHits++; } else { openShots++; if (e.hit) openHits++; }
        }
      }
    }
    expect(coverShots).toBeGreaterThan(10);
    expect(coverHits / coverShots).toBeLessThan(openHits / Math.max(1, openShots));
  });

  it('explosions hit what is in their radius; a repelled raid can leave grenades behind', () => {
    let blasts = 0, recovered = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = fortify(afterHit(seed));
      const b = planBattle(g, 6, seed, { grenades: 4, rockets: 1 });
      for (const e of b.events) if (e.kind === 'explosion' && e.hits.length) blasts++;
      const before = g.stock.grenades ?? 0;
      applyBattle(g, b);
      if ((b.result === 'repelled' || b.result === 'fled') && (g.stock.grenades ?? 0) > before) recovered++;
    }
    expect(blasts).toBeGreaterThan(0);
    expect(recovered).toBeGreaterThan(0);
  });


  it('a wounded fighter shoots worse and slower: the hurt start weaker', () => {
    let fitHits = 0, fitShots = 0, hurtHits = 0, hurtShots = 0, fitTime = 0, hurtTime = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const fit = planBattle(fortify(afterHit(seed)), 6, seed);
      const hurtG = fortify(afterHit(seed));
      for (const ps of hurtG.personState) ps.needs.health = 30;
      const hurt = planBattle(hurtG, 6, seed);
      fitTime += fit.duration; hurtTime += hurt.duration;
      for (const [b, h] of [[fit, true], [hurt, false]] as const) for (const e of b.events) if (e.kind === 'shot' && e.from.startsWith('h_')) {
        if (h) { fitShots++; if (e.hit) fitHits++; } else { hurtShots++; if (e.hit) hurtHits++; }
      }
    }
    expect(hurtShots / hurtTime).toBeLessThan(fitShots / fitTime);
    expect(hurtHits / Math.max(1, hurtShots)).toBeLessThan(fitHits / Math.max(1, fitShots));
  });

  it('the dialogue names who is talking: the wounded call it out themselves', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const b = planBattle(afterHit(seed), 6, seed);
      const w = b.events.find(e => e.kind === 'wound' && e.unit.startsWith('h_'));
      if (!w || w.kind !== 'wound') continue;
      expect(b.events.some(e => e.kind === 'say' && e.who === w.unit && e.t >= w.t)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    const any = planBattle(fortify(afterHit(2)), 6, 2);
    expect(any.events.some(e => e.kind === 'say' && e.who?.startsWith('r'))).toBe(true);   // the raiders shout too
  });

  it('a fight wound is a trauma wound that needs treating', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterHit(seed);
      const b = planBattle(g, 6, seed);
      if (!b.events.some(e => e.kind === 'wound' && e.unit.startsWith('h_'))) continue;
      applyBattle(g, b);
      const w = g.personState.flatMap(ps => ps.needs.hurt).find(h => h.trauma);
      expect(w).toBeTruthy();
      expect(w!.what).toMatch(/grazed|shot/);
      return;
    }
    throw new Error('no wounded resident in 40 seeds');
  });

  it('body armor and helmets keep people alive; some rounds are stopped outright', () => {
    let bare = 0, armored = 0, stopped = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = planBattle(fortify(afterHit(seed)), 8, seed, { grenades: 0, rockets: 0 });
      const gArm = fortify(afterHit(seed)); gArm.stock.plate_carrier = 6; gArm.stock.helmet = 6;
      const b = planBattle(gArm, 8, seed, { grenades: 0, rockets: 0 });
      bare += a.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length;
      armored += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length;
      stopped += b.events.filter(e => e.kind === 'wound' && e.stopped).length;
    }
    expect(armored).toBeLessThan(bare);
    expect(stopped).toBeGreaterThan(0);
  });

  it('veterans and ex-police start as better shots; most people never served', () => {
    let vets = 0, total = 0;
    for (let seed = 1; seed <= 200; seed++) for (const p of newGame(seed).people) if (!p.kid && p.age >= 22) { total++; if (backgroundOf(p)) vets++; }
    expect(vets / total).toBeGreaterThan(0.03);
    expect(vets / total).toBeLessThan(0.2);
    const g = newGame(7);
    const p = g.people.find(q => !q.kid)!;
    const base = skillOf(g, p.id);
    p.first = 'Vet'; p.id = 'vet_search';
    for (let k = 0; k < 500 && backgroundOf(p) !== 'military'; k++) p.id = `vet_${k}`;
    expect(backgroundOf(p)).toBe('military');
    expect(skillOf(g, p.id)).toBeGreaterThanOrEqual(Math.max(6, base > 6 ? base : 6));
  });

  it('buried mines are a standing risk: deer, strangers, your own', () => {
    let blasts = 0, own = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = afterHit(seed);
      g.stock.mines = 16;
      for (let d = 0; d < 365; d++) {
        g.clock.t = d;
        const lines = minesDay(g);
        blasts += lines.length;
        own += lines.filter(l => l.includes('stepped on')).length;
      }
    }
    expect(blasts).toBeGreaterThan(20);           // about 4 a year with 16 down
    expect(blasts).toBeLessThan(20 * 30);
    expect(own).toBeGreaterThan(0);
    const none = afterHit(1);
    for (let d = 0; d < 365; d++) { none.clock.t = d; expect(minesDay(none)).toEqual([]); }
  });

  it('kids hide; a teenager fights only when there aren\'t two adults who can', () => {
    const g = afterHit(4);
    const teen = g.people.find(p => p.kid);
    if (teen) { teen.age = 16; }
    const b = planBattle(fortify(g), 6, 4);
    const adults = g.people.filter(p => !p.kid).length;
    const teenPosted = teen ? b.events.some(e => e.kind === 'shot' && e.from === `h_${teen.id}`) : false;
    if (adults >= 2) expect(teenPosted).toBe(false);
    // with one adult left the teenager picks up a gun
    const g1 = fortify(afterHit(4));
    const t1 = g1.people.find(p => p.kid);
    if (t1) {
      t1.age = 16;
      g1.people.filter(p => !p.kid).slice(1).forEach(p => { g1.personState[g1.people.indexOf(p)].needs.died = 1; });
      const b1 = planBattle(g1, 6, 4);
      expect(b1.events.some(e => e.kind === 'move' && e.unit === `h_${t1.id}`)).toBe(true);
      expect(b1.units.find(u => u.id === `h_${t1.id}`)).toBeTruthy();
    }
  });

  it('the tunnel gets the sheltering family out of a breach, but only if it was built', () => {
    let escaped = 0, without = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const built of [true, false]) {
        const g = afterHit(seed);           // no guns: breached often
        if (built) { const t = planRun(g, 'escape_tunnel', [[0, 0], [60, 0]]); t.done = t.hours; t.supplied = true; t.finishedAt = 0; }
        const b = planBattle(g, 8, seed);
        const n = b.events.filter(e => e.kind === 'move' && e.x === 60 && e.z === 0).length;
        if (built) escaped += n; else without += n;
      }
    }
    expect(escaped).toBeGreaterThan(0);
    expect(without).toBe(0);
  });
  it('guns run dry: magazines get changed, tubes reloaded a round at a time, worn guns jam', () => {
    let reloads = 0, jams = 0, jamsWorn = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = fortify(afterHit(seed)); for (const gn of g.armory.guns) gn.model = 'marlin_336'; g.armory.ammo['3030'] = 500;
      const b = planBattle(g, 8, seed, { grenades: 0, rockets: 0 });
      reloads += b.events.filter(e => e.kind === 'reload' && e.unit.startsWith('h_')).length;
      jams += b.events.filter(e => e.kind === 'jam' && e.unit.startsWith('h_')).length;
      const w = fortify(afterHit(seed)); for (const gn of w.armory.guns) gn.condition = 0.2;
      jamsWorn += planBattle(w, 8, seed, { grenades: 0, rockets: 0 }).events.filter(e => e.kind === 'jam' && e.unit.startsWith('h_')).length;
    }
    expect(reloads).toBeGreaterThan(0);
    expect(jamsWorn).toBeGreaterThan(jams);
  });

  it('open wounds bleed: a tourniquet or the medic stops it, and some bleed out', () => {
    let aid = 0, bledOut = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = afterHit(seed); g.stock.ifak = 4;
      const b = planBattle(g, 8, seed);
      aid += b.events.filter(e => e.kind === 'aid').length;
      // a death with no fatal hit right before it: bled out
      for (const d of b.events.filter(e => e.kind === 'death')) if (!b.events.some(e => (e.kind === 'shot' || e.kind === 'explosion') && Math.abs(e.t - d.t) < 0.2)) bledOut++;
    }
    expect(aid).toBeGreaterThan(0);
    expect(bledOut).toBeGreaterThan(0);
  });

  it('desperate looters break sooner than an organized crew late in the collapse', () => {
    let earlyFled = 0, lateFled = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const early = fortify(afterHit(seed));
      const late = fortify(afterHit(seed)); late.clock.t = late.disaster.hitAt + 400.25;
      const be = planBattle(early, 6, seed, { grenades: 0, rockets: 0 }), bl = planBattle(late, 6, seed, { grenades: 0, rockets: 0 });
      if (be.result === 'fled') earlyFled += be.duration < 60 ? 1 : 0;
      if (bl.result === 'fled') lateFled += bl.duration < 60 ? 1 : 0;
    }
    expect(earlyFled).toBeGreaterThan(lateFled);
  });

  it('night vision gives back the dark: more hits at night without lights', () => {
    let blind = 0, nv = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = fortify(afterHit(seed)); g.clock.t = Math.floor(g.clock.t) + 0.8;   // ~1 a.m.
      const h = (b: PlannedBattle) => b.events.filter(e => e.kind === 'shot' && e.from.startsWith('h_') && e.hit).length / Math.max(1, b.events.filter(e => e.kind === 'shot' && e.from.startsWith('h_')).length);
      blind += h(planBattle(g, 6, seed, { grenades: 0, rockets: 0 }));
      const n = fortify(afterHit(seed)); n.clock.t = g.clock.t; n.stock.nvg = 6;
      nv += h(planBattle(n, 6, seed, { grenades: 0, rockets: 0 }));
    }
    expect(nv).toBeGreaterThan(blind);
  });
  it('first aid is done once per wound, not every second (a line once, a kit once)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = afterHit(seed); g.stock.ifak = 6;
      const b = planBattle(g, 8, seed);
      const selfAid = b.events.filter(e => e.kind === 'aid' && e.by === e.unit);
      const per = new Map<string, number>();
      for (const e of selfAid) if (e.kind === 'aid') per.set(e.unit, (per.get(e.unit) ?? 0) + 1);
      for (const n of per.values()) expect(n).toBe(1);
      const lines = b.events.filter(e => e.kind === 'say').map(e => e.kind === 'say' ? `${e.who}|${e.text}|${Math.floor(e.t)}` : '');
      expect(new Set(lines).size).toBe(lines.length);
    }
  });
  it('a savage crew that gets in leaves nobody: the wounded are finished, the children taken; a desperate one holds people at gunpoint', () => {
    let executed = 0, taken = 0, desperateKilledHiding = 0, wiped = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = afterHit(seed);                       // no guns: they get in
      const b = planBattle(g, 6, seed, { temper: 'savage' });
      executed += b.events.filter(e => e.kind === 'death' && e.executed).length;
      taken += b.events.filter(e => e.kind === 'taken').length;
      applyBattle(g, b);
      if (g.personState.every(ps => ps.needs.died != null)) wiped++;
      for (const ps of g.personState) if (ps.needs.taken) expect(ps.needs.died).not.toBeNull();
      const d = planBattle(afterHit(seed), 6, seed, { temper: 'desperate' });
      expect(d.events.some(e => e.kind === 'taken' || (e.kind === 'death' && e.executed))).toBe(false);
      desperateKilledHiding += d.events.filter(e => e.kind === 'death').length;
    }
    expect(taken).toBeGreaterThan(0);
    expect(wiped).toBeGreaterThan(0);
    expect(executed + taken).toBeGreaterThan(desperateKilledHiding);
  });

  it('the tunnel still gets the children out ahead of a savage crew', () => {
    let out = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = afterHit(seed);
      const t = planRun(g, 'escape_tunnel', [[0, 0], [0, -30]]); t.done = t.hours; t.supplied = true; t.finishedAt = 0;
      const b = planBattle(g, 6, seed, { temper: 'savage' });
      expect(b.events.some(e => e.kind === 'taken')).toBe(false);
      if (b.events.some(e => e.kind === 'breach')) out++;
    }
    expect(out).toBeGreaterThan(0);
  });
});

describe('round 4: the fight answers to walls, guns, armor and numbers', () => {
  const cabin = (seed: number) => { const g = afterHit(seed); g.structures = g.structures.filter(s => s.id !== 'house'); g.structures.push({ id: 'house', kind: 'timber_cabin', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); g.clock.t = Math.floor(g.disaster.hitAt + 200) + 0.5; return g; };
  const palisade = (g: GameState) => { const r = planRun(g, 'log_palisade', [[-15, -15], [15, -15], [15, 15], [-15, 15], [-15, -15]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return g; };
  const rifles = (g: GameState) => { for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 3; } g.armory.ammo['556'] = 2000; return g; };
  const held = (make: (seed: number) => GameState, n: number, N = 24) => { let w = 0; for (let i = 0; i < N; i++) { const b = planBattle(make(i % 6 + 1), n, 300 + i, { armed: true, temper: 'desperate' }); if (b.result === 'repelled' || b.result === 'fled') w++; } return w / N; };

  it('two armed looters rarely overrun a walled place with rifles (round 3: four times running)', () => {
    expect(held(s => rifles(palisade(cabin(s))), 2)).toBeGreaterThanOrEqual(0.8);
  });

  it('walls, guns and plates each help; more of them hurts', () => {
    const bare = held(cabin, 2), guns = held(s => rifles(cabin(s)), 2), walled = held(s => rifles(palisade(cabin(s))), 4), armored = held(s => { const g = rifles(palisade(cabin(s))); g.stock.plate_carrier = 4; g.stock.sandbags = 3; return g; }, 4);
    expect(guns).toBeGreaterThan(bare);
    expect(walled).toBeGreaterThan(held(s => rifles(cabin(s)), 4));
    expect(armored).toBeGreaterThanOrEqual(walled);
    expect(held(s => rifles(palisade(cabin(s))), 8)).toBeLessThan(walled);
  });

  it('a pickup of looters brings no rocket; they start out of sight beyond a wide wall', () => {
    for (let i = 0; i < 20; i++) {
      const g = rifles(palisade(cabin(i % 5 + 1)));
      const b = planBattle(g, 3, 500 + i, { armed: true, organized: false });
      expect(b.events.some(e => e.kind === 'rocket')).toBe(false);
      const start = b.units.filter(u => u.side === 'raider').map(u => Math.hypot(u.x, u.z));
      expect(Math.min(...start)).toBeGreaterThan(21 + 15);
    }
  });

  it('clubs against rifles behind a wall: they don\'t get over', () => {
    let over = 0;
    for (let i = 0; i < 20; i++) if (planBattle(rifles(palisade(cabin(i % 5 + 1))), 8, 700 + i, { armed: false }).result.match(/breached|overrun/)) over++;
    expect(over).toBeLessThanOrEqual(2);
  });
});
