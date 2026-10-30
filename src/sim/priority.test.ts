import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { planRun } from './perimeter';
import { focusOf, projectRows, setFocus } from './priority';
import { workQueue } from './pace';
import { nextBuildTarget, step } from './engine';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const fresh = (): GameState => { const g = newGame(11); g.structures = []; g.perimeter = []; return g; };

describe('work on this first (sim/priority.ts)', () => {
  it('lists everything under way, and puts the focus first', () => {
    const g = fresh();
    const a = planStructure(g, 'cottage', 10, 10, 0);
    const run = planRun(g, 'split_rail', [[0, 0], [20, 0]], []);
    expect(projectRows(g).map(r => r.id)).toEqual([a.id, run.id]);
    expect(setFocus(g, run.id)).toBeNull();
    const rows = projectRows(g);
    expect(rows[0].id).toBe(run.id);
    expect(rows[0].first).toBe(true);
    expect(workQueue(g)[0].id).toBe(run.id);
    expect(setFocus(g, null)).toBeNull();
    expect(projectRows(g)[0].id).toBe(a.id);
    expect(setFocus(g, 'nope')).toBe('that is finished');
  });

  it('the family works on the focused wall while a staked building waits', () => {
    const g = fresh();
    g.stock.lumber = 100; g.stock.hardware = 50; g.stock.wire = 200; g.stock.concrete = 100; g.stock.roofing = 50; g.stock.logs = 50; g.stock.fieldstone = 50; g.stock.seedlings = 50;
    const b = planStructure(g, 'cottage', 10, 10, 0);
    const run = planRun(g, 'split_rail', [[0, 0], [60, 0]], []);
    g.stock.lumber += 400;
    expect(nextBuildTarget(g)?.id).toBe(b.id);
    setFocus(g, run.id);
    const s = step(g, 0.6);
    const r = s.perimeter.find(x => x.id === run.id)!;
    expect(r.done).toBeGreaterThan(0);
    expect(s.structures.find(x => x.id === b.id)!.done + s.structures.find(x => x.id === b.id)!.stage).toBe(0);
  });

  it('a focus that is waiting on materials is skipped: nobody stands idle', () => {
    const g = fresh();
    const b = planStructure(g, 'cottage', 10, 10, 0);
    const run = planRun(g, 'chain_link', [[0, 0], [12, 0]], []);   // no wire or hardware in the stockpile
    g.stock.wire = 0; g.stock.hardware = 0;
    g.stock.lumber = 100; g.stock.hardware = 50;
    setFocus(g, run.id);
    expect(focusOf(g)?.run?.id).toBe(run.id);
    const s = step(g, 2);
    expect(s.perimeter.find(x => x.id === run.id)!.done).toBe(0);
    expect(s.structures.find(x => x.id === b.id)!.done + s.structures.find(x => x.id === b.id)!.stage).toBeGreaterThan(0);
  });

  it('the focus clears itself when the project is finished', () => {
    const g = fresh();
    const b = planStructure(g, 'outhouse', 10, 10, 0);
    setFocus(g, b.id);
    b.stage = 99; b.finishedAt = 0;
    expect(focusOf(g)).toBeNull();
  });

  it('an old save gets focus: null and no puppies unless allowed', () => {
    const raw = JSON.parse(JSON.stringify(newGame(5))) as Record<string, unknown>;
    raw.version = 52; delete raw.focus; raw.petLife = { nextDog: 1, grief: {}, lost: [], auto: true, report: null };
    const up = migrate(raw);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.focus).toBeNull();
    expect(up.petLife?.allowPups).toBe(false);
  });
});
