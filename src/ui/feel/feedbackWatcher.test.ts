// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { newGame, type GameState } from '../../sim/state';
import { planStructure } from '../../sim/construction';
import { BLUEPRINTS } from '../../sim/blueprints';
import { startFeedback } from './feedbackWatcher';

const store = new Map<string, string>();
Object.assign(globalThis, { window: globalThis, localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });

let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; });

const fresh = (): GameState => { const g = newGame(11); g.structures = g.structures.filter(x => x.pre); g.perimeter = []; return g; };

describe('goal cards come on the day the goal is done, however the clock is stepped', () => {
  it('a well finished inside one big step shows its card at once, with the day it was done', () => {
    const g = fresh();
    useGameStore.setState({ game: g });
    stop = startFeedback();
    useFeelStore.setState({ cards: [], goalsClosed: null });
    const next = structuredClone(g);
    const w = planStructure(next, 'well_hand', 0, 0, 0);
    w.stage = BLUEPRINTS.well_hand.stages.length; w.finishedAt = next.clock.t + 10; w.pre = false;
    next.clock.t += 10.4;   // ten days in one step, no player action
    useGameStore.setState({ game: next });
    const cards = useFeelStore.getState().cards;
    expect(cards.map(c => c.id)).toContain('goal_water');
    expect(cards.find(c => c.id === 'goal_water')?.bornDay).toBeGreaterThanOrEqual(10);
  });
  it('waiting goal cards merge into one rather than queueing behind each other', () => {
    const g = fresh();
    useGameStore.setState({ game: g });
    stop = startFeedback();
    const card = (id: string, n: number) => ({ id, title: id, line: '', points: 0, flash: [], kicker: `Goal ${n} of 6 done`, bornDay: n });
    useFeelStore.setState({ cards: [] });
    useFeelStore.getState().pushCards([card('goal_a', 1)]);
    useFeelStore.getState().pushCards([card('goal_b', 2)]);
    useFeelStore.getState().pushCards([card('goal_c', 3)]);
    const q = useFeelStore.getState().cards;
    expect(q).toHaveLength(2);   // the one on screen, and one merged waiting card
    expect(q[1].kicker).toBe('Goal 3 of 6 done');
    expect(q[1].title).toMatch(/goal_b/);
    expect(q[1].title).toMatch(/goal_c/);
  });
});

describe('a late card says so', () => {
  it('staleNote is empty for a fresh card and counts days for a waiting one', async () => {
    const { staleNote } = await import('../../sim/feedbackDiff');
    expect(staleNote({ bornDay: 10 }, 10)).toBe('');
    expect(staleNote({ bornDay: 10 }, 11)).toBe('');
    expect(staleNote({ bornDay: 10 }, 30)).toBe('done 20 days ago');
    expect(staleNote({}, 30)).toBe('');
  });
});

describe('the roof goal card fires when the extra home finishes an under-sized household', () => {
  it('a cabin that sleeps 4 of 5 shows no card; the home that closes the gap does', () => {
    const g = fresh();
    while (g.people.length < 5) { const p = structuredClone(g.people[0]); p.id = `x${g.people.length}`; g.people.push(p); g.personState.push(structuredClone(g.personState[0])); }
    const cab = planStructure(g, 'timber_cabin', 0, 0, 0);
    cab.stage = BLUEPRINTS.timber_cabin.stages.length; cab.finishedAt = 0; cab.pre = false;
    useGameStore.setState({ game: g });
    stop = startFeedback();
    useFeelStore.setState({ cards: [], goalsClosed: null });
    const same = structuredClone(g); same.clock.t += 1;
    useGameStore.setState({ game: same });
    expect(useFeelStore.getState().cards.map(c => c.id)).not.toContain('goal_roof');
    const next = structuredClone(same);
    const more = planStructure(next, 'cottage', 10, 0, 0);
    more.stage = BLUEPRINTS.cottage.stages.length; more.finishedAt = next.clock.t; more.pre = false;
    next.clock.t += 1;
    useGameStore.setState({ game: next });
    expect(useFeelStore.getState().cards.map(c => c.id)).toContain('goal_roof');
  });
});
