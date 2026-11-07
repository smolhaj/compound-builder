import { beforeEach, describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planningHold } from './clockResume';
import { useGameStore } from '../store/gameStore';

describe('the clock holds while the player plans', () => {
  beforeEach(() => { const g = newGame(4); g.clock.speed = 2; useGameStore.setState({ game: g, tool: null, planOpen: false, cutscene: null, dayCard: null, welcome: false }); });
  it('pure rule', () => {
    expect(planningHold(null, false)).toBe(false);
    expect(planningHold('well_hand', false)).toBe(true);
    expect(planningHold(null, true)).toBe(true);
  });
  it('an armed tool or an open starter plan stops the sim clock and keeps the speed', () => {
    const t0 = useGameStore.getState().game.clock.t;
    useGameStore.getState().setTool('fence:woven_wire');
    for (let i = 0; i < 20; i++) useGameStore.getState().tick(0.5);
    expect(useGameStore.getState().game.clock.t).toBe(t0);
    expect(useGameStore.getState().game.clock.speed).toBe(2);
    useGameStore.getState().setTool(null);
    useGameStore.getState().setPlanOpen(true);
    useGameStore.getState().tick(0.5);
    expect(useGameStore.getState().game.clock.t).toBe(t0);
    useGameStore.getState().setPlanOpen(false);
    useGameStore.getState().tick(0.5);
    expect(useGameStore.getState().game.clock.t).toBeGreaterThan(t0);
    expect(useGameStore.getState().game.clock.speed).toBe(2);
  });
});

describe('a project that becomes stuck says so with a toast', () => {
  it('the store raises a one-line toast the day a project first waits past the limit', async () => {
    const { planStructure } = await import('./construction');
    const g = newGame(6);
    g.structures = []; g.stock = { ...g.stock, logs: 0, lumber: 999, concrete: 999, fieldstone: 999 }; g.money = 500_000;
    const st = planStructure(g, 'log_house', 0, 0, 0); st.stage = 2;
    g.clock.speed = 3;
    useGameStore.setState({ game: g, tool: null, planOpen: false, cutscene: null, dayCard: null, welcome: false, toast: null });
    let said = '';
    for (let i = 0; i < 600 && !said; i++) { useGameStore.getState().tick(1); said = useGameStore.getState().toast?.text ?? ''; }
    expect(said).toMatch(/waiting for \d+ logs/);
  });
});
