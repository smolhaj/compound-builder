import { describe, expect, it } from 'vitest';
import { GOD_FUNDS, isGod, topUp, unscripted } from './godMode';
import { newGame } from './state';
import { reportCard } from './report';

describe('God Mode', () => {
  it('is unscripted like Free build, Surprise is not', () => {
    expect(unscripted('god')).toBe(true); expect(unscripted('sandbox')).toBe(true); expect(unscripted('surprise')).toBe(false);
  });
  it('keeps checking full and flags the report card', () => {
    const s = newGame(7, 100, 2027, { mode: 'god' });
    expect(isGod(s)).toBe(true);
    s.money = 10; expect(topUp(s)).toBe(true); expect(s.money).toBe(GOD_FUNDS);
    expect(reportCard(s).grade).toBe('S');
    expect(reportCard(s).lines.join(' ')).toMatch(/Sandbox run/);
  });
  it('does nothing in a normal run', () => {
    const s = newGame(7, 100, 2027, { mode: 'surprise' }); s.money = 10;
    expect(topUp(s)).toBe(false); expect(s.money).toBe(10);
  });
});
