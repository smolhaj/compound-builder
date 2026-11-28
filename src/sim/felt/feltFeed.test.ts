import { describe, expect, it } from 'vitest';
import { TRACKS } from '../disaster';
import { fxCtxFor } from '../disasterFx';
import { newGame, type GameState } from '../state';
import { feltDaily } from './daily';
import { FEED_CAP, bandOf, feedOf, feltFeed } from './feed';
import { FELT_KINDS, feltSpec } from './registry';
import type { FeltKind } from './types';

function after(kind: FeltKind, day = 0, seed = 5): GameState {
  const g = newGame(seed);
  const d = g.disaster;
  d.kind = kind as never; d.phase = 'survival'; d.hitAt = g.clock.t; d.warnAt = g.clock.t - 10; d.fate = 'partial'; d.back = {};
  g.clock.t += day;
  return g;
}
const run = (g: GameState) => feltFeed(g, fxCtxFor(g, 3), feltSpec(g.disaster.kind)!);
const texts = (g: GameState) => feedOf(g)!.lines.map(l => l.text);

describe('the daily feed', () => {
  it('two ticker items at the same time get different line ids (the id is a React key)', () => {
    const g = after('grid_down', 1);
    for (const t of TRACKS) g.disaster.tracks[t] = 1;
    g.disaster.news.push({ t: g.clock.t, text: 'A truck went by twice.', tone: 0 }, { t: g.clock.t, text: 'Smoke over the ridge.', tone: 1 });
    run(g);
    const ids = feedOf(g)!.lines.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('bands: out under a quarter, patchy under two thirds, working after', () => {
    expect([0, 0.24, 0.25, 0.64, 0.65, 1].map(bandOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it('says what changed, and only that: a service going out, then nothing new', () => {
    const g = after('grid_down', 1);
    for (const t of TRACKS) g.disaster.tracks[t] = 1;
    g.disaster.tracks.grid = 0; g.disaster.tracks.phone = 0.4;
    run(g);
    expect(texts(g)).toContain('The grid is down. (Grid power, day 1.)');
    expect(texts(g)).toContain('Phones and internet drop in and out.');
    g.clock.t += 1; run(g);
    g.clock.t += 1; run(g);
    g.clock.t += 1; run(g);
    expect(texts(g).some(x => x.startsWith('Nothing new today. Still out: Grid power'))).toBe(true);
    expect(feedOf(g)!.lines.length).toBe(1);
  });
  it('a recovery is a line too', () => {
    const g = after('grid_down', 1);
    for (const t of TRACKS) g.disaster.tracks[t] = 1;
    g.disaster.tracks.grid = 0; run(g);
    g.clock.t += 1; g.disaster.tracks.grid = 0.9; run(g);
    expect(texts(g)).toContain('Grid power is back.');
  });
  it('lists neighbors who left, worst first, at most six lines', () => {
    const g = after('civil_war', 3);
    for (const t of TRACKS) g.disaster.tracks[t] = 0;
    for (const n of g.neighbors) n.status = 'left';
    run(g);
    const f = feedOf(g)!;
    expect(f.lines.length).toBe(FEED_CAP);
    const tones = f.lines.map(l => l.tone);
    expect([...tones].sort((a, b) => b - a)).toEqual(tones);
    expect(f.worse).toBe(true);
  });
  it('one feed a day: running twice the same day changes nothing, and the top line goes to the ticker once', () => {
    const g = after('wildfire', 2);
    for (const t of TRACKS) g.disaster.tracks[t] = 1;
    g.disaster.tracks.phone = 0; run(g);
    const n = g.disaster.news.length;
    expect(g.disaster.news[n - 1].tone).toBeLessThanOrEqual(1);
    run(g);
    expect(g.disaster.news.length).toBe(n);
  });
  it('is strictly true to the sim: every service line matches the track band', () => {
    for (const k of FELT_KINDS) {
      const g = after(k, 4);
      for (const t of TRACKS) g.disaster.tracks[t] = 0.9;
      g.disaster.tracks.stores = 0.5; g.disaster.tracks.banks = 0.1;
      run(g);
      const ids = feedOf(g)!.lines.map(l => l.id);
      expect(ids, k).toContain('svc.stores.1'); expect(ids, k).toContain('svc.banks.0');
      expect(ids.some(i => i.startsWith('svc.grid')), k).toBe(false);
    }
  });
  it('the dispatcher runs it from the hit on, and never before', () => {
    const g = after('wildfire', 2);
    for (const t of TRACKS) g.disaster.tracks[t] = 0.5;
    feltDaily(g, fxCtxFor(g, 3));
    expect(feedOf(g)).toBeDefined();
    const pre = after('wildfire', -2);
    feltDaily(pre, fxCtxFor(pre, 3));
    expect(feedOf(pre)).toBeUndefined();
  });
  it('round-trips through JSON (the save) and costs almost nothing over a year', () => {
    const g = after('mega_quake', 0);
    const t0 = performance.now();
    for (let day = 0; day < 365; day++) { g.clock.t = g.disaster.hitAt + day; g.disaster.tracks.grid = day % 40 < 20 ? 0 : 0.9; run(g); }
    expect((performance.now() - t0) / 365).toBeLessThan(5);
    expect(JSON.parse(JSON.stringify(feedOf(g)))).toEqual(feedOf(g));
  });
  it('a week of days always has at least one line a day', () => {
    const g = after('cyberattack', 0);
    for (let day = 0; day < 8; day++) { g.clock.t = g.disaster.hitAt + day; if (day === 2) g.disaster.tracks.banks = 0; run(g); expect(feedOf(g)!.lines.length).toBeGreaterThan(0); }
  });
});
