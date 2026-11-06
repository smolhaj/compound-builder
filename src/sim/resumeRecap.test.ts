import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planStructure } from './construction';
import { familyLine, resumeRecap, dateText } from './resumeRecap';
import { triggerDisaster } from './disaster';

describe('where we left off', () => {
  it('reads the date, cash, family, work in progress and three next steps', () => {
    const g = newGame(5);
    g.structures = []; g.perimeter = [];
    planStructure(g, 'timber_cabin', 0, 0, 0);
    const r = resumeRecap(g);
    expect(r.date).toMatch(/^[A-Z][a-z]{2} \d+, Year 1, \d+:\d\d (AM|PM)$/);
    expect(r.dayNumber).toBe(1);
    expect(r.money).toBe(Math.round(g.money));
    expect(r.family).toMatch(/well|need care/);
    expect(r.inProgress[0]).toMatch(/^Timber cabin: \d+% built\./);
    expect(r.nextSteps.every(x => x.why.split(/\s+/).length <= 13)).toBe(true);
    expect(r.nextSteps.length).toBeGreaterThan(0);
    expect(r.nextSteps.length).toBeLessThanOrEqual(3);
    expect(r.nextSteps.every(x => x.title.length > 0)).toBe(true);
  });

  it('names the next threat when the warning has started', () => {
    const g = newGame(5);
    expect(resumeRecap(g).threat === null || typeof resumeRecap(g).threat!.text === 'string').toBe(true);
    triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 14);
    g.clock.t += 1;
    const r = resumeRecap(g);
    expect(r.threat?.text).toMatch(/Impact in \d+ days?/);
  });

  it('says so when someone needs care', () => {
    const g = newGame(5);
    g.personState[0].needs.health = 20;
    const f = familyLine(g);
    expect(f.text).toMatch(/need care/);
    expect(f.tone).not.toBe('good');
  });

  it('formats the time of day on a 12-hour clock', () => {
    const g = newGame(5);
    for (const t of [0, 0.25, 0.5, 0.75]) { g.clock.t = t; expect(dateText(g)).toMatch(/^[A-Z][a-z]{2} \d+, Year 1, (1[0-2]|[1-9]):\d\d (AM|PM)$/); }
  });
});

import { short } from './resumeRecap';
describe('short reasons', () => {
  it('keeps one short sentence and cuts long ones cleanly', () => {
    expect(short('No roof yet.')).toBe('No roof yet');
    const t = short('the timber cabin is staked on a 34 % slope: the pad is cut into the hill and held by a dry-stack wall');
    expect(t.endsWith('…')).toBe(true);
    expect(t.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});
