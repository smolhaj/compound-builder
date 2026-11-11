import { describe, expect, it } from 'vitest';
import { burialWords, cleanupCaptions, graveCaptions, interrogationScene, raiderFace, traumaBeats } from './aftermathScenes';

describe('aftermath scenes', () => {
  const m = [{ id: 'a', name: 'Ana', kin: true }, { id: 'b', name: 'Ben', kid: true }, { id: 'c', name: 'Cy' }];
  it('burial words: spoken by the mourners, nothing empty, no repeat, a child speaks as a child', () => {
    for (let seed = 1; seed < 40; seed++) {
      const b = burialWords({ name: 'Wren', age: 40, kid: false, elder: false, mourners: m, seed });
      expect(b.length).toBe(3);
      expect(b.every(l => l.kind === 'say' && l.text.trim().length > 8 && !l.text.includes('{') && m.some(x => x.id === l.who))).toBe(true);
      expect(new Set(b.map(l => l.text)).size).toBe(b.length);
    }
    expect(burialWords({ name: 'Wren', age: 40, kid: false, elder: false, mourners: [{ id: 'k', name: 'K', kid: true }], seed: 3 })[0].who).toBe('k');
  });
  it('captions name the person and describe only an action (dig, carry, lay, fill, rake, nail)', () => {
    const g = graveCaptions('Wren', ['Ana', 'Cy']), c = cleanupCaptions('Ben', 'Wren', 'Cy');
    expect(g.dig).toBe('Ana and Cy dig the grave.');
    expect(Object.values({ ...g, ...c }).every(t => t.length > 12 && !t.includes('{'))).toBe(true);
    expect(c.stain).toContain('rakes'); expect(c.repair).toContain('nails');
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
