import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { BLUEPRINTS, HOME_BEDS } from './blueprints';
import { emptyStock } from './materials';
import { crewQuote } from './crews';
import { homeAdvice, homeAdviceText, kitUsd, plannedBeds } from './homeAdvice';
import { housingFixes } from './housing';
import { suggestions } from './guidance';
import { firstHour } from './firstHour';
import { operational } from './operational';

const person = (g: GameState, n: number) => {
  while (g.people.length < n) { const p = structuredClone(g.people[0]); p.id = `x${g.people.length}`; p.first = `Guest${g.people.length}`; g.people.push(p); g.personState.push(structuredClone(g.personState[0])); }
  g.people.length = n; g.personState.length = n;
};
const fresh = (people: number, money = 400_000): GameState => {
  const g = newGame(11); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = []; g.money = money;
  person(g, people);
  g.site = { ...g.site, gwDepth: 5, improvements: { ...g.site.improvements, drive: false, power: false } };
  return g;
};
const finish = (g: GameState, kind: string) => { const st = planStructure(g, kind, 0, 0, 0)!; st.stage = 99; st.finishedAt = 0; return st; };

describe('one home recommendation', () => {
  it('a cabin that sleeps 4 of 5 is a different, solvable goal: the same bigger home on every screen', () => {
    const g = fresh(5);
    finish(g, 'timber_cabin');
    expect(plannedBeds(g)).toBe(HOME_BEDS.timber_cabin);
    const adv = homeAdvice(g)!;
    expect(adv.gap).toBe(1);
    expect(adv.beds).toBeGreaterThanOrEqual(1);
      // the Next-steps list / Build highlight, the Housing panel's Fix line and the first-hour card all name the same kit piece
    const beds = suggestions(g, 6).find(x => x.id === 'beds')!;
    expect(beds.kind).toBe(adv.kind);
    expect(beds.why).toContain(homeAdviceText(adv));
    const roof = firstHour(g).goals.find(x => x.id === 'roof')!;
    expect(roof.title).toBe('A bed for everyone');
    expect(roof.line).toBe('1 without a bed');
    expect(roof.act!.act).toEqual({ type: 'stake', kind: adv.kind });
    expect(operational(g).find(o => o.id === 'shelter')!.act!.act).toEqual({ type: 'stake', kind: adv.kind });
  });
  it('the Housing panel Fix line names the same piece when the plan really has people without a bed', () => {
    const g = fresh(9);
    finish(g, 'timber_cabin');
    const adv = homeAdvice(g)!;
    const fix = housingFixes(g, k => kitUsd(g, k)).find(f => f.action === 'build')!;
    expect(fix.item).toBe(adv.kind);
    expect(fix.text).toBe(`build ${homeAdviceText(adv)}`);
    expect(suggestions(g, 6).find(x => x.id === 'beds')!.kind).toBe(adv.kind);
  });
  it('an empty lot: the cheapest home that sleeps everybody, not a cabin that sleeps four of five', () => {
    const g = fresh(5);
    const adv = homeAdvice(g)!;
    expect(adv.beds).toBeGreaterThanOrEqual(5);
    expect(adv.stillShort).toBe(0);
    expect(suggestions(g, 6).find(x => x.id === 'roof')!.kind).toBe(adv.kind);
  });
  it('counts a home that is still going up, so it never recommends a second one on top of it', () => {
    const g = fresh(4);
    planStructure(g, 'timber_cabin', 0, 0, 0);
    expect(homeAdvice(g)).toBeNull();
    expect(housingFixes(g, k => kitUsd(g, k)).find(f => f.action === 'build')).toBeUndefined();
  });
  it('includes the crew price only where a crew is the easy path, and it matches the hire button', () => {
    const rich = fresh(5, 600_000);
    const adv = homeAdvice(rich)!;
    expect(adv.crewUsd).not.toBeNull();
    expect(homeAdviceText(adv)).toContain(`a crew of four builds it in about`);
    const st = planStructure(rich, adv.kind, 0, 0, 0)!;
    expect(crewQuote(st).usd).toBe(adv.crewUsd);
    expect(crewQuote(st).weeks).toBe(adv.crewWeeks);
    const poor = fresh(5, 30_000);
    expect(homeAdvice(poor)!.crewUsd).toBeNull();
    expect(homeAdviceText(homeAdvice(poor)!)).not.toContain('crew');
    expect(BLUEPRINTS[adv.kind]).toBeTruthy();
  });
});
