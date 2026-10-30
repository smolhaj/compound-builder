/** Facts for the seasonal "in review" log line (sim/newsPool.ts decides the words). Pure. */
import { isFinished } from './construction';
import { enclosure } from './enclosure';
import { daysOfFood } from './needs';
import { calendarOf, type GameState } from './state';
import { livingDogs } from './pets';
import type { ReviewFacts, Season } from './newsPool';

export function reviewFacts(s: GameState, season: Season): ReviewFacts {
  const cal = calendarOf(s.clock);
  return {
    season, year: cal.year, years: Math.floor(s.clock.t / 365),
    buildings: s.structures.filter(x => isFinished(x) && x.kind !== 'garden' && x.kind !== 'field').length,
    people: s.personState.filter(p => p.needs.died == null).length,
    dogs: livingDogs(s).length,
    daysOfFood: daysOfFood(s),
    openShare: s.perimeter.length ? enclosure(s, s.clock.t).openShare : 1,
    firewood: s.stock.firewood,
    money: s.money,
    deaths: s.personState.filter(p => p.needs.died != null && !p.needs.left).length,
  };
}
