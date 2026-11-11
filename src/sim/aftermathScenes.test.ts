import { describe, expect, it } from 'vitest';
import { burialBeats, cleanupBeats, interrogationScene, raiderFace, traumaBeats } from './aftermathScenes';

describe('aftermath scenes', () => {
  const m = [{ id: 'a', name: 'Ana', kin: true }, { id: 'b', name: 'Ben', kid: true }, { id: 'c', name: 'Cy' }];
  it('burial: ordered, spoken by the mourners, nothing empty and no repeat', () => {
    for (let seed = 1; seed < 40; seed++) {
      const b = burialBeats({ name: 'Wren', age: 40, kid: false, elder: false, mourners: m, seed });
      expect(b.length).toBeGreaterThanOrEqual(6);
      expect(b.every(l => l.text.trim().length > 8 && !l.text.includes('{'))).toBe(true);
      expect(new Set(b.map(l => l.text)).size).toBe(b.length);
      expect(b.every((l, i) => i === 0 || l.dt >= b[i - 1].dt)).toBe(true);
      expect(b.filter(l => l.kind === 'say').every(l => m.some(x => x.id === l.who))).toBe(true);
    }
  });
  it('burial: the child speaks as a child', () => {
    const b = burialBeats({ name: 'Wren', age: 40, kid: false, elder: false, mourners: [{ id: 'k', name: 'K', kid: true }], seed: 3 });
    expect(b.some(l => l.kind === 'say' && l.who === 'k')).toBe(true);
  });
  it('cleanup follows the damage', () => {
    expect(cleanupBeats({ breached: true, fires: 2 }, 4).length).toBe(3);
    expect(cleanupBeats({ blood: false }, 4).length).toBe(1);
  });
  it('trauma: only the shaken, worst first, at most three', () => {
    const t = traumaBeats([{ id: 'a', name: 'A', trauma: 10 }, { id: 'b', name: 'B', trauma: 60 }, { id: 'c', name: 'C', trauma: 30 }, { id: 'd', name: 'D', trauma: 40 }, { id: 'e', name: 'E', trauma: 80 }], 2);
    expect(t.map(x => x.who)).toEqual(['e', 'b', 'd']);
    expect(t.every(x => x.text.length > 10)).toBe(true);
  });
  it('a raider keeps his face and his story', () => {
    expect(raiderFace('Dale', 5)).toEqual(raiderFace('Dale', 5));
    const ages = new Set(['Dale', 'Cody', 'Wade', 'Kyle', 'Luis', 'Terry'].map(n => raiderFace(n, 5).age));
    expect(ages.size).toBeGreaterThan(2);
    expect(raiderFace('Dale', 5).story.length).toBeGreaterThan(20);
  });
  it('interrogation reads as a conversation: your question, then his answer or his silence', () => {
    const a = interrogationScene('Dale', 'stash', 'kind', { ok: true, lines: ['Dale says it is under the old silo.'] }, 1);
    expect(a[0].who).toBe('you'); expect(a.slice(1).every(x => x.who === 'note')).toBe(true); expect(a.some(x => x.text.includes('silo'))).toBe(true);
    const b = interrogationScene('Dale', 'who_sent', 'harsh', { ok: false, lines: [] }, 1);
    expect(b.length).toBe(2); expect(b[1].text.length).toBeGreaterThan(10);
    expect(interrogationScene('Dale', 'next_crew', 'kind', { ok: false, lines: ['Dale looked at the floor and said nothing.'] }, 1)[1].text).toContain('floor');
  });
});
