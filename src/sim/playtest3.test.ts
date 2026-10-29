import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';

describe('playtest 3: the log does not fill up', () => {
  it('"Short of food" is said at most every third day, not every day of a famine', () => {
    let s = newGame(7, 105, 2027, { kind: 'zombies', peace: 'short', mode: 'scenario' });
    while (s.clock.t < s.disaster.hitAt + 40) s = step(s, 5);   // the stores are shut by now
    const t0 = s.clock.t;
    for (let i = 0; i < 20; i++) { s.disaster.tracks.stores = 0; s.disaster.tracks.deliveries = 0; for (const k of ['fresh', 'frozen', 'canned', 'staples'] as const) s.stock[k] = 0; s = step(s, 1); }
    const lines = s.log.filter(l => l.t >= t0 && l.text.startsWith('Short of food'));
    expect(lines.length).toBeGreaterThan(0);                  // it is still said
    expect(lines.length).toBeLessThanOrEqual(8);              // not 20 times in 20 days
  });
});
