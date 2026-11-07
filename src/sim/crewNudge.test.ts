import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { emptyStock } from './materials';
import { crewNudge, CREW_NUDGE_SHARE, CREW_NUDGE_SLACK, CREW_NUDGE_WEEKS } from './crewNudge';
import { crewQuote, hireCrew } from './crews';
import { suggestions } from './guidance';
import { operational } from './operational';

const fresh = (money = 900_000): GameState => {
  const g = newGame(5); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = []; g.money = money;
  return g;
};

describe('the crew nudge', () => {
  it('offers a priced crew when the family would take more than a few weeks on the house', () => {
    const g = fresh();
    const home = planStructure(g, 'log_house', 0, 0, 0);
    const n = crewNudge(g)!;
    expect(n).not.toBeNull();
    expect(n.id).toBe(home.id);
    const q = crewQuote(home);
    expect(n.usd).toBe(q.usd);   // the same figure the hire button charges
    expect(n.crewWeeks).toBe(q.weeks);
    expect(n.familyWeeks === null || n.familyWeeks > CREW_NUDGE_WEEKS).toBe(true);
    expect(n.title).toMatch(/^Hire a crew to finish the .* in about \d+ weeks? \(~\$[\d,]+\)$/);
    const top = suggestions(g, 3).find(x => x.id === 'house_crew')!;
    expect(top.acts![0].act).toEqual({ type: 'crew', id: home.id });
    expect(operational(g).find(o => o.id === 'shelter')!.act!.act).toEqual({ type: 'crew', id: home.id });
  });
  it('stays quiet without the cash, with a crew already hired, or when the family is quick', () => {
    const g = fresh(2000);
    const home = planStructure(g, 'log_house', 0, 0, 0);
    expect(crewNudge(g)).toBeNull();
    g.money = crewQuote(home).usd + CREW_NUDGE_SLACK + 50_000;
    expect(crewNudge(g)).not.toBeNull();
    g.stock.lumber = 200; g.stock.roofing = 200; g.stock.hardware = 200; g.stock.concrete = 200; g.stock.fieldstone = 200;
    expect(hireCrew(g, home.id)).toBeNull();
    expect(crewNudge(g)).toBeNull();
  });
  it('shows the card once the cash covers most of the quote, and says the family finishes the rest', () => {
    const g = fresh(2000);
    const home = planStructure(g, 'log_house', 0, 0, 0), q = crewQuote(home).usd;
    g.money = Math.floor(q * CREW_NUDGE_SHARE + CREW_NUDGE_SLACK) - 100;
    expect(crewNudge(g)).toBeNull();
    g.money = Math.ceil(q * CREW_NUDGE_SHARE + CREW_NUDGE_SLACK) + 100;
    const n = crewNudge(g)!;
    expect(n).not.toBeNull();
    expect(n.why).toMatch(/runs low the crew goes home and the family finishes the rest/);
    g.money = q + CREW_NUDGE_SLACK + 100;
    expect(crewNudge(g)!.why).not.toMatch(/runs low/);
  });
  it('is quiet for a small job the family finishes in about a week', () => {
    const g = fresh();
    const st = planStructure(g, 'outhouse', 0, 0, 0);
    expect(st).toBeTruthy();
    expect(crewNudge(g)).toBeNull();   // an outhouse is not a home
  });
});
