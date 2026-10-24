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
    let fitHits = 0, fitShots = 0, hurtHits = 0, hurtShots = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const fit = planBattle(fortify(afterHit(seed)), 6, seed);
      const hurtG = fortify(afterHit(seed));
      for (const ps of hurtG.personState) ps.needs.health = 30;
      const hurt = planBattle(hurtG, 6, seed);
      for (const [b, h] of [[fit, true], [hurt, false]] as const) for (const e of b.events) if (e.kind === 'shot' && e.from.startsWith('h_')) {
        if (h) { fitShots++; if (e.hit) fitHits++; } else { hurtShots++; if (e.hit) hurtHits++; }
      }
    }
    expect(hurtShots).toBeLessThan(fitShots);
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
});
