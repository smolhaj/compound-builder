import { describe, expect, it } from 'vitest';
import type { Battle } from './battleTypes';
import { deadSilent, deadSpeakers } from './deadSilent';
import { scenes, prepared } from './cutFixtures';

const unit = (id: string, side: 'home' | 'raider') => ({ id, side, x: 0, z: 0, post: 'open' as const });

describe('the dead do not speak', () => {
  const b: Battle = {
    units: [unit('h_a', 'home'), unit('h_b', 'home'), unit('r0', 'raider')],
    events: [
      { t: 5, kind: 'death', unit: 'h_a' },
      { t: 4, kind: 'say', text: 'Hold the door!', who: 'h_a' },
      { t: 6, kind: 'say', text: 'I have the door, move!', who: 'h_a' },
      { t: 5.5, kind: 'say', text: 'Tell my wife...', who: 'h_a', ctx: 'last_words' },
      { t: 9, kind: 'say', text: 'Still here.', who: 'h_a' },
      { t: 10, kind: 'end', result: 'repelled' },
    ],
    duration: 10, night: false,
  } as unknown as Battle;
  it('hands a later line to a living person of the same side, and keeps last words', () => {
    expect(deadSpeakers(b).map(x => x.text)).toEqual(['I have the door, move!', 'Still here.']);
    const out = deadSilent(b);
    expect(deadSpeakers(out)).toEqual([]);
    const lines = out.events.filter(e => e.kind === 'say');
    expect(lines.map(l => l.kind === 'say' && l.who)).toEqual(['h_a', 'h_a', 'h_b', 'h_b']);
    expect(lines.some(l => l.kind === 'say' && l.text === 'Tell my wife...' && l.who === 'h_a')).toBe(true);
  });
  it('drops the line when nobody on the side is left to say it', () => {
    const all: Battle = { ...b, events: [...b.events, { t: 5, kind: 'death', unit: 'h_b' }] } as Battle;
    expect(deadSpeakers(deadSilent(all))).toEqual([]);
    expect(deadSilent(all).events.filter(e => e.kind === 'say').length).toBe(2);
  });
  for (const [label, hour, kind, size, temper] of [['night gang', 2.25, 'gang', 10, 'savage'], ['day raid', 12.5, 'gang', 8, 'hard'], ['invasion', 2.25, 'gang', 12, 'savage']] as const) for (const seed of [3, 5, 8]) {
    it(`${label} seed ${seed}: nobody speaks after dying in the prepared scene`, () => {
      const { g, battles } = scenes(seed, hour, kind, size, temper, 'log_palisade');
      for (const bb of battles) expect(deadSpeakers(prepared(bb, g, seed * 17))).toEqual([]);
    }, 90000);
  }
});
