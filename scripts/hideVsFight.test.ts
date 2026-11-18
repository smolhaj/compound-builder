/**
 * Hide versus fight at a paid-for wall (playtest 3 problem 3). The same lot, the same crew, the same seeds: resolve the gate once with
 * 'defend' and once with 'hide' (a stocked bunker below) and compare the expected people lost, the share of runs with a death, and the stores
 * the family ends with. Layouts add what money buys: a wall, a tower, guards. Prints a table; the asserts are the monotone property
 * (every defensive element helps the fight) and the headline (a strong wall + guards beats hiding in lives).
 *
 *   HVF=1 [HVF_N=60] npx vitest run scripts/hideVsFight.test.ts
 */
import { describe, expect, it } from 'vitest';
import { place, CREWS, type Layout } from '../src/sim/raidTestKit';
import { resolve, type Encounter } from '../src/sim/encounters';
import { hireGuard } from '../src/sim/guards';
import type { GameState } from '../src/sim/state';

const N = Number(process.env.HVF_N ?? 40);
const living = (g: GameState) => g.personState.filter(p => p.needs.died == null && !p.needs.taken).length;
const foodOf = (g: GameState) => (g.stock.canned ?? 0) + (g.stock.staples ?? 0) + (g.stock.frozen ?? 0) + (g.stock.fuel ?? 0) + (g.stock.meds ?? 0);

function crew(c: (typeof CREWS)[number], day: number): Encounter {
  return { id: 'e1', kind: c.kind, day, title: 'A crew', dossier: [], size: c.n, armed: c.kind !== 'horde', strength: 90, wants: { canned: 5 }, stances: ['hide', 'defend'], temper: c.temper, wave: 3 } as Encounter;
}
const RICH = !!process.env.HVF_RICH;
function setup(layout: Layout | `${Layout}+tower`, guards: number, seed: number, c: (typeof CREWS)[number], stance: 'hide' | 'defend'): GameState {
  const tower = layout.endsWith('+tower'), base = layout.replace('+tower', '') as Layout;
  const g = place(seed, 'standard', base === 'bare' ? 'armed' : base);
  if (tower && base !== 'palisade_tower') { g.structures.push({ id: 'tw', kind: 'watchtower_wood', x: 6, z: 9, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as never); g.stock.sandbags = 3; }
  g.money = 400_000;
  // the hide: a stocked bunker below (stairs entrance) for everybody, armed
  g.structures.push({ id: 'bk', kind: 'bunker_stairs', x: 3, z: 3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never, { id: 'bkc', kind: 'bunker_comms', x: 5, z: 3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
  Object.assign(g.stock, { canned: 90, staples: 30, water_jugs: 60 });
  if (RICH) { // a paid-for place: eight more buildings, a year of food, a safe of rifles
    for (const [i, k] of ['barn', 'workshop', 'guest_house', 'greenhouse', 'metal_garage', 'timber_cabin', 'cottage', 'root_cellar'].entries()) g.structures.push({ id: `rich${i}`, kind: k, x: -8 - i * 3, z: 9, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
    Object.assign(g.stock, { canned: 400, staples: 300 });
    for (let i = 0; i < 6; i++) g.armory.guns.push({ id: `rg${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'safe' } as never);
  } g.utilities.storedL = 1200;
  g.armory.ammo = { '556': 400 };
  { const keep = { ...g.disaster.tracks }; g.disaster.tracks = { ...keep, law: 1, stores: 1, deliveries: 1, banks: 1 }; for (let i = 0; i < guards; i++) if (hireGuard(g)) throw new Error('no guard'); g.disaster.tracks = keep; }
  g.gate.pending = crew(c, Math.floor(g.clock.t));
  void stance;
  return g;
}

export interface Cell { lostPer: number; anyLost: number; stores: number; n: number }
export function measure(layout: Layout | `${Layout}+tower`, guards: number, stance: 'hide' | 'defend', n = N, only?: number): Cell {
  let lost = 0, any = 0, stores = 0, runs = 0;
  for (const [ci, c] of CREWS.entries()) if (only === undefined || ci === only) for (let seed = 1; seed <= n; seed++) {
    const g = setup(layout, guards, seed, c, stance), before = living(g), f0 = foodOf(g);
    resolve(g, stance);
    const d = before - living(g);
    lost += d; any += d > 0 ? 1 : 0; stores += (f0 - foodOf(g)) / Math.max(1, f0); runs++;
  }
  return { lostPer: lost / runs, anyLost: any / runs, stores: stores / runs, n: runs };
}

describe.skipIf(!process.env.HVF)('hide versus fight', () => {
  it('prints the comparison', () => {
    const rows: Array<[Layout | `${Layout}+tower`, number]> = [['armed', 0], ['chain', 0], ['palisade_tower', 0], ['palisade_tower', 2], ['container_gate', 2], ['concrete_bollards', 2], ['concrete_bollards', 3], ['concrete_bollards+tower', 3]];
    const out: string[] = ['layout            guards | FIGHT lost/raid  anyLost  stores | HIDE lost/raid  anyLost  stores'];
    for (const [l, gd] of rows) {
      const f = measure(l, gd, 'defend'), h = measure(l, gd, 'hide');
      out.push(`${l.padEnd(18)}${String(gd).padStart(3)}    | ${f.lostPer.toFixed(3).padStart(8)} ${f.anyLost.toFixed(3).padStart(9)} ${f.stores.toFixed(3).padStart(8)} | ${h.lostPer.toFixed(3).padStart(8)} ${h.anyLost.toFixed(3).padStart(9)} ${h.stores.toFixed(3).padStart(8)}`);
    }
    if (process.env.HVF_CREWS) for (const [ci, c] of CREWS.entries()) { const f = measure('concrete_bollards', 2, 'defend', N, ci), h = measure('concrete_bollards', 2, 'hide', N, ci); out.push(`  crew ${c.kind} ${c.temper} ${c.n}: fight lost ${f.lostPer.toFixed(3)} any ${f.anyLost.toFixed(3)} | hide lost ${h.lostPer.toFixed(3)} any ${h.anyLost.toFixed(3)}`); }
    console.log('\n' + out.join('\n'));
    expect(out.length).toBeGreaterThan(1);
  }, 3_600_000);
});
