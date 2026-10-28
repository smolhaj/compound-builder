import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step } from './engine';
import { REGION_IDS } from './regions';
import { planStructure } from './construction';
import { adoptDog } from './pets';

/** A raw float in player-facing text ("0.7967046720730114 L") is a bug: scan what the sim says over a few years. */
const RAW = /\d+\.\d{3,}/;

describe('no raw floats in the log or the ticker', () => {
  it('over three years in every region, with buildings, dogs, power and stock in play', () => {
    const offenders: string[] = [];
    for (const [i, region] of REGION_IDS.entries()) {
      let g: GameState = newGame(20 + i);
      g.site = { ...g.site, region };
      g.money = 400000;
      for (const [k, x, z] of [['cottage', 10, 10], ['solar_array', 14, 10], ['battery_shed', 18, 10], ['generator_shed', 22, 10], ['chicken_coop', 10, 16], ['garden', 14, 16]] as const) { const st = planStructure(g, k, x, z, 0); st.stage = 99; st.finishedAt = 0; }
      g.stock.fuel = 3.3; g.stock.firewood = 2.5; g.stock.staples = 3.7;
      adoptDog(g, { ageYears: 2 }); adoptDog(g, { puppy: true });
      for (let y = 0; y < 3 * 24; y++) {
        g = step(g, 15);
        for (const e of g.log) if (RAW.test(e.text)) offenders.push(`${region}: ${e.text}`);
        for (const n of g.disaster.news) if (RAW.test(n.text)) offenders.push(`news ${region}: ${n.text}`);
      }
    }
    expect([...new Set(offenders)].slice(0, 12)).toEqual([]);
  }, 120000);
});
