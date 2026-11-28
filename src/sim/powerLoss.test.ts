import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { listings } from './site';
import { weatherDay } from './weatherThreats';
import { burnStructure, isFinished } from './construction';
import { applyLevel } from './physical';
import { lostPower, reportPowerLoss, rebuildLines } from './powerLoss';
import { suggestions } from './guidance';

const F = (id: string, kind: string) => ({ id, kind, x: 20, z: 20, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
function lot(seed: number): GameState {
  const site = listings(seed, 'upper_midwest' as never, undefined, 6, 900000)[0];
  const g = newGame(seed, 105, 2027, { site, mode: 'scenario', peace: 'short', kind: 'water_war' as never });
  g.structures.push(F('h', 'timber_cabin'), F('sol', 'solar_array'), F('w', 'well_drilled') as never);
  return g;
}
const nameOfPower = (g: GameState) => g.disaster.news.some(n => /solar array/.test(n.text) && n.tone === 3);

describe('a lost power source is never silent', () => {
  it('regression: a tornado or derecho that takes the solar array raises a ticker line, a chronicle entry and a rebuild card', () => {
    let found = 0;
    for (let seed = 1; seed <= 150 && found < 3; seed++) {
      const g = lot(seed);
      for (let day = 0; day < 1100; day++) {
        g.clock.t = day + 0.3;
        weatherDay(g);
        const sol = g.structures.find(x => x.id === 'sol')!;
        if (isFinished(sol)) continue;
        found++;
        expect(sol.lost).toBe(true);
        expect(nameOfPower(g)).toBe(true);
        expect(g.lineage.chronicle.some(c => /solar array was lost/.test(c.text))).toBe(true);
        expect(g.log.some(l => /Lost the solar array/.test(l.text))).toBe(true);
        expect(lostPower(g).map(x => x.id)).toEqual(['sol']);
        const card = suggestions(g, 40).find(c => c.id === 'power_lost_sol');
        expect(card?.acts?.length).toBeGreaterThan(0);
        break;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
  it('fire and damage states report too, and a non-power structure does not', () => {
    const g = lot(3);
    expect(burnStructure(g, g.structures.find(x => x.id === 'sol')!)).toBe(true);
    expect(nameOfPower(g)).toBe(true);
    const g2 = lot(3);
    applyLevel(g2, g2.structures.find(x => x.id === 'sol')!, 3, 'quake', 'The ground shook.');
    expect(nameOfPower(g2)).toBe(true);
    const g3 = lot(3);
    expect(reportPowerLoss(g3, g3.structures.find(x => x.id === 'w')!, 'fire')).toBeNull();
    expect(g3.disaster.news.some(n => n.tone === 3)).toBe(false);
  });
  it('the rebuild lines price the panels', () => {
    const g = lot(3);
    burnStructure(g, g.structures.find(x => x.id === 'sol')!);
    expect(rebuildLines(g, g.structures.find(x => x.id === 'sol')!).some(l => l.material === 'solar_panel')).toBe(true);
  });
});
