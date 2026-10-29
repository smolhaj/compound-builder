import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { newGame, type GameState, type Structure } from '../src/sim/state';
import { step } from '../src/sim/engine';
import { CLASSIC } from '../src/sim/site';
import type { RegionId } from '../src/sim/regions';

const mk = (id: string, kind: string, x: number): Structure => ({ id, kind, x, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -400 });
describe.skipIf(!process.env.FK)('farm harness', () => {
  it('runs', () => {
    const out: string[] = [];
    for (const region of ['mountain_west', 'appalachia', 'plains', 'upper_midwest'] as RegionId[]) for (const cellar of [true, false]) {
      let s: GameState = newGame(5, 105);
      s.site = { ...CLASSIC, region };
      const kinds = ['timber_cabin', 'garden', 'field', 'field', 'field', 'chicken_coop', ...(cellar ? ['root_cellar'] : [])];
      kinds.forEach((k, i) => s.structures.push(mk('h' + i, k, 10 + i * 3)));
      s.stock.lids = 500; s.stock.canner = 1; s.stock.seed = 6; s.stock.seed_saved = 4;
      s.stock.staples = 3; s.stock.canned = 2;
      s.disaster.tracks = { ...s.disaster.tracks, stores: 0, banks: 0 };
      const T = [0, 0, 0, 0]; let spoil = 0, produced = 0, ate = 0, need = 0;
      for (let d = 0; d < 365 * 3; d++) { s = step(s, 1); produced += s.food.producedKcal; spoil += s.food.spoiledKcal; ate += s.food.ateKcal; need += s.food.needKcal; if (d % 365 === 364) { T[Math.floor(d / 365)] = produced; } }
      const alive = s.personState.filter(p => p.needs.died == null).length;
      const stored = Math.round((s.stock.fresh * 2000 + s.stock.canned * 6000 + s.stock.staples * 80000 + s.stock.frozen * 10000) / 1000);
      out.push(`${region} cellar=${cellar} produced/yr=${Math.round(produced / 3 / 1000)}k spoiled/yr=${Math.round(spoil / 3 / 1000)}k ate/need=${(ate / need).toFixed(3)} alive=${alive} storedK=${stored} end fresh=${s.stock.fresh.toFixed(1)} canned=${s.stock.canned.toFixed(1)} staples=${s.stock.staples.toFixed(2)} seed=${s.stock.seed},${s.stock.seed_saved}`);
    }
    writeFileSync(process.env.FK!, out.join('\n') + '\n');
  }, 600000);
});
