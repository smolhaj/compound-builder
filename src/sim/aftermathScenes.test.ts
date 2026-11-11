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


// ── the aftermath is spoken, not written (same bar as peopleVoices.test.ts) ──
import { CURSE, contract } from './raidDialogue';
const UNCONTRACTED = /\b(do not|does not|did not|cannot|will not|would not|could not|should not|is not|are not|was not|were not|have not|let us|I am|I will|we are|we will|you are|you will|they are|they will|it is|that is|there is|he is|she is|what is|who is)\b/;
describe('aftermath voices', () => {
  const mourners = [{ id: 'a', name: 'Ana', kin: true }, { id: 'k', name: 'Kit', kid: true }, { id: 'o', name: 'Opa', elder: true }, { id: 'c', name: 'Cy' }];
  it('words at the grave and the questioning are contracted and spoken', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const l of burialWords({ name: 'Wren', age: 40, kid: false, elder: false, mourners, seed })) expect(l.text, l.text).not.toMatch(UNCONTRACTED);
      for (const q of ['next_crew', 'who_sent', 'stash'] as const) for (const a of ['kind', 'harsh'] as const) for (const x of interrogationScene('Dale', q, a, { ok: false, lines: [] }, seed)) expect(x.text, x.text).not.toMatch(UNCONTRACTED);
    }
  });
  it('grief may swear in an adult, never in a child, and an old devout person prays', () => {
    const lines = (m: { id: string; name: string; kid?: boolean; kin?: boolean; elder?: boolean }) => Array.from({ length: 60 }, (_, i) => burialWords({ name: 'Wren', age: 40, kid: false, elder: false, mourners: [m], seed: i + 1 })[0].text);
    expect(lines({ id: 'a', name: 'Ana', kin: true }).some(t => CURSE.test(t))).toBe(true);
    expect(lines({ id: 'k', name: 'Kit', kid: true }).some(t => CURSE.test(t))).toBe(false);
    const old = lines({ id: 'o', name: 'Opa', elder: true });
    expect(old.some(t => CURSE.test(t))).toBe(false); expect(old.some(t => /Lord|God/.test(t))).toBe(true);
  });
  it('a harsh question can swear; a kind one does not', () => {
    const harsh = Array.from({ length: 80 }, (_, i) => interrogationScene('Dale', (['next_crew', 'who_sent', 'stash'] as const)[i % 3], 'harsh', { ok: false, lines: [] }, i)[0].text);
    expect(harsh.some(t => CURSE.test(t))).toBe(true);
    for (let i = 0; i < 40; i++) expect(interrogationScene('Dale', 'stash', 'kind', { ok: false, lines: [] }, i)[0].text).not.toMatch(CURSE);
  });
  it('contract() leaves a noun and "is" alone and keeps capitals', () => {
    expect(contract('Do not go. Please do not go.')).toBe("Don't go. Please don't go.");
    expect(contract('The wall is down. I am hit.')).toBe("The wall is down. I'm hit.");
  });
});
