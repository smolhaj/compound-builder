import { describe, expect, it } from 'vitest';
import { readSaveFile, saveFileName, MAX_SAVE_BYTES } from './saveFile';
import { exportJson } from './migrations';
import { newGame, SAVE_VERSION } from '../state';
import { decisionOpen, resumeSpeed } from '../clockResume';

describe('save file', () => {
  it('names the file with family and date', () => {
    const g = newGame(3);
    g.lineage.family = "O'Brien Smith";
    expect(saveFileName(g, new Date('2026-11-04T10:00:00Z'))).toBe('compound-builder-o-brien-smith-2026-11-04.json');
  });
  it('round-trips an export', () => {
    const r = readSaveFile(exportJson(newGame(5)));
    expect(r.ok && r.state.version).toBe(SAVE_VERSION);
  });
  it('rejects bad files with a message, never throwing', () => {
    const g = newGame(5);
    const bad = [
      'not json', '[]', 'null', '{}',
      JSON.stringify({ game: 'other' }),
      JSON.stringify({ game: 'compound-builder', version: SAVE_VERSION + 1 }),
      JSON.stringify({ game: 'compound-builder', version: SAVE_VERSION }),
      exportJson({ ...g, money: g.money, gate: undefined } as never),
    ];
    for (const t of bad) {
      const r = readSaveFile(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
    }
    expect(readSaveFile('{}', MAX_SAVE_BYTES + 1).ok).toBe(false);
  });
});

describe('clock resume rule', () => {
  const g = newGame(1);
  it('resumes at the remembered speed once no decision is open', () => {
    expect(resumeSpeed(3, 0, false)).toBe(3);
  });
  it('waits while a card is open', () => {
    expect(resumeSpeed(3, 0, true)).toBeNull();
  });
  it('leaves a hand-paused clock alone', () => {
    expect(resumeSpeed(null, 0, false)).toBeNull();
  });
  it('does nothing when already running', () => {
    expect(resumeSpeed(2, 1, false)).toBeNull();
  });
  it('detects open decisions', () => {
    expect(decisionOpen(g, null)).toBe(false);
    expect(decisionOpen(g, {})).toBe(true);
    expect(decisionOpen({ ...g, gate: { ...g.gate, card: { title: 't', text: '', tone: 'good', lines: [] } } }, null)).toBe(true);
  });
});

describe('save sanitising', () => {
  it('clamps absurd values with a warning and loads a legit save untouched', () => {
    const clean = readSaveFile(exportJson(newGame(5)));
    expect(clean.ok && clean.warnings).toEqual([]);
    const g = newGame(5);
    g.money = -5e9; g.stock.staples = 9e15; g.clock.t = -4;
    const bad = readSaveFile(exportJson(g));
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(bad.state.money).toBe(-100_000_000);
      expect(bad.state.stock.staples).toBe(10_000_000);
      expect(bad.state.clock.t).toBe(0);
      expect(bad.warnings[0]).toMatch(/corrected/);
    }
    const nul = JSON.parse(exportJson(newGame(5)));
    if (nul.state) nul.state.money = null; else nul.money = null;
    const r = readSaveFile(JSON.stringify(nul));
    expect(r.ok && r.state.money).toBe(0);
  });
  it('trims a household of thousands', () => {
    const g = newGame(5);
    while (g.people.length < 300) { g.people.push(g.people[0]); g.personState.push(g.personState[0]); }
    const r = readSaveFile(exportJson(g));
    expect(r.ok && r.state.people.length).toBe(200);
  });
});
