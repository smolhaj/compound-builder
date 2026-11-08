/**
 * Raid balance report (off by default): win / breach / overrun rates of the battle sim on the farmhouse holdouts, by difficulty and crew.
 *   RAID_BALANCE=40 RAID_BALANCE_OUT=/path/out.json npx vitest run src/sim/raidBalance.test.ts
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { newGame, type GameState } from '../src/sim/state';
import { planRun } from '../src/sim/perimeter';
import { planBattle, type BattleOptions } from '../src/sim/battle';
import type { Difficulty } from '../src/sim/difficulty';
import { MEANS_DIFF } from '../src/sim/breachMeans';

const N = Number(process.env.RAID_BALANCE ?? 0);
function afterHit(seed: number, diff: Difficulty): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.disaster.difficulty = diff;
  g.clock.t = Math.floor(g.disaster.hitAt + 200) + 0.5;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
const arm = (g: GameState) => { for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; } g.armory.ammo['556'] = 2000; };
const wall = (g: GameState, kind: 'container_wall' | 'chain_link') => { const r = planRun(g, kind, [[-15, -15], [15, -15], [15, 15], [-15, 15], [-15, -15]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0; };
const tower = (g: GameState) => { g.structures.push({ id: 'tw', kind: 'watchtower_wood', x: 6, z: 9, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }); g.stock.sandbags = 3; };
const SITES: Record<string, (g: GameState) => void> = {
  bare: () => {}, armed: arm, 'armed+chainlink': g => { arm(g); wall(g, 'chain_link'); }, 'armed+container': g => { arm(g); wall(g, 'container_wall'); }, 'armed+container+tower': g => { arm(g); wall(g, 'container_wall'); tower(g); },
};
const CREWS: Record<string, { n: number; o: BattleOptions }> = {
  'looters6': { n: 6, o: { temper: 'desperate', kind: 'looters' } },
  'gang8-hard': { n: 8, o: { temper: 'hard', kind: 'gang', organized: true } },
  'militia8': { n: 8, o: { temper: 'hard', kind: 'militia', organized: true } },
  'savage10': { n: 10, o: { temper: 'savage', kind: 'gang', organized: true } },
};
describe.skipIf(!N)('raid balance', () => {
  it('reports', () => {
    // QA: RAID_HC=odds,truck,satchel overrides the Hardcore means row (to try a softer Hardcore)
    if (process.env.RAID_HC) { const [o, t, c] = process.env.RAID_HC.split(',').map(Number); Object.assign(MEANS_DIFF.hardcore, { odds: o, truck: t, satchel: c }); }
    const out: Record<string, Record<string, number>> = {};
    for (const diff of ['cozy', 'standard', 'hardcore'] as Difficulty[]) for (const [sn, site] of Object.entries(SITES)) for (const [cn, crew] of Object.entries(CREWS)) {
      const c: Record<string, number> = { repelled: 0, fled: 0, breached: 0, overrun: 0, homeDead: 0, homeWounded: 0 };
      for (let i = 0; i < N; i++) {
        const g = afterHit(1 + (i % 8), diff); site(g);
        const b = planBattle(g, Math.round(crew.n * (diff === 'hardcore' ? 1.3 : diff === 'cozy' ? 0.7 : 1)), 100 + i, { ...crew.o, ...(process.env.RAID_OPENER ? { opener: { kind: process.env.RAID_OPENER as 'scouts' | 'diversion' | 'worker_ambush' | 'demand', ...(process.env.RAID_OPENER === 'diversion' ? { decoy: { share: 0.3, delay: 16, until: 30 } } : {}) } } : {}), ...(process.env.RAID_ORDER ? { orders: [{ t: 0, order: process.env.RAID_ORDER as 'hold' | 'fallback' | 'counter' }] } : {}) });
        c[b.result]++;
        c.homeDead += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length;
        c.homeWounded += b.events.filter(e => e.kind === 'wound' && !e.stopped && e.unit.startsWith('h_')).length;
      }
      out[`${diff} | ${sn} | ${cn}`] = c;
    }
    writeFileSync(process.env.RAID_BALANCE_OUT ?? '/tmp/claude-0/raidbal.json', JSON.stringify(out, null, 1));
  }, 600000);
});
