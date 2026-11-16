import { describe, expect, it } from 'vitest';
import { TRACKS } from '../disaster';
import { fxCtxFor } from '../disasterFx';
import { radioDay } from '../radio';
import { sendScout, scoutDay } from '../rumors';
import { newGame, type GameState } from '../state';
import { evalClaim } from './claims';
import { CHANNELS, eligibleLines, feltRadioLine, lineHolds } from './feltRadio';
import { FELT_KINDS, feltSpec } from './registry';
import type { FeltKind, RadioChannel } from './types';

/** A world `day` days after `kind` hit: services out, one household gone, deliveries stopped. */
function world(kind: FeltKind, day: number, seed = 5): GameState {
  const g = newGame(seed);
  const d = g.disaster;
  d.kind = kind as never; d.phase = 'survival'; d.hitAt = g.clock.t; d.warnAt = g.clock.t - 10; d.fate = 'never'; d.back = {};
  g.clock.t += day;
  for (const t of TRACKS) d.tracks[t] = 0.1;
  d.tracks.stores = 0.1; d.tracks.law = 0.2;
  g.neighbors[0].status = 'left';
  return g;
}
const DAYS = [2, 12, 40, 150];
const ctx = (s: GameState, salt = 17) => fxCtxFor(s, salt);

describe('felt radio: the generic line set', () => {
  it('every kind has at least 5 distinct lines, a true and a false one, and 2 or more channels', () => {
    for (const k of FELT_KINDS) {
      const lines = feltSpec(k)!.radio!;
      expect(lines.length, k).toBeGreaterThanOrEqual(5);
      expect(new Set(lines.map(l => l.id)).size, k).toBe(lines.length);
      expect(lines.some(l => l.truth === 'true'), k).toBe(true);
      expect(lines.some(l => l.truth === 'false'), k).toBe(true);
      expect(new Set(lines.map(l => l.channel)).size, k).toBeGreaterThanOrEqual(2);
    }
  });
  it('lines are kind-specific: no two kinds share a text for the same state', () => {
    const a = world('mega_quake', 12), b = world('wildfire', 12);
    const texts = (g: GameState) => new Set(feltSpec(g.disaster.kind)!.radio!.filter(l => l.when(g)).map(l => l.text(g, () => 0.5)));
    const ta = texts(a), tb = texts(b);
    const shared = [...ta].filter(x => tb.has(x));
    expect(ta.size).toBeGreaterThanOrEqual(5);
    expect(shared.length).toBeLessThan(ta.size / 2);
  });
  it('at least 2 lines per kind change their words with the state', () => {
    for (const k of FELT_KINDS) {
      const early = world(k, 2), late = world(k, 40);
      early.disaster.tracks.grid = 0; late.disaster.tracks.grid = 0; late.disaster.tracks.phone = 0.9;
      let changing = 0;
      for (const l of feltSpec(k)!.radio!) if (l.when(early) && l.when(late) && l.text(early, () => 0.5) !== l.text(late, () => 0.5)) changing++;
      expect(changing, k).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('felt radio: claims make the lie checkable', () => {
  it('a true line is eligible only while its claim holds, a false one only while its claim does not', () => {
    for (const k of FELT_KINDS) for (const day of DAYS) {
      const s = world(k, day);
      for (const want of [true, false]) for (const set of ['ham', 'shortwave', 'none'] as const) for (const l of eligibleLines(s, set, want, true)) {
        expect(lineHolds(s, l), `${k} day ${day} ${l.id}`).toBe(want);
        expect(l.claim?.(s), `${k} ${l.id}`).toBe(want);
      }
    }
  });
  it('every kind has eligible true and false lines in a ruined world, across phases', () => {
    for (const k of FELT_KINDS) {
      let t = 0, f = 0;
      for (const day of DAYS) { const s = world(k, day); t += eligibleLines(s, 'ham', true, true).length + eligibleLines(s, 'none', true, true).length; f += eligibleLines(s, 'ham', false, true).length + eligibleLines(s, 'none', false, true).length; }
      expect(t, k).toBeGreaterThan(0); expect(f, k).toBeGreaterThan(0);
    }
  });
  it('a false line stops being eligible once the world makes it true', () => {
    const s = world('grid_down', 12);
    expect(eligibleLines(s, 'ham', false, false).some(l => l.id.endsWith('ham_back_soon'))).toBe(true);
    s.disaster.tracks.grid = 0.9; s.disaster.tracks.fuel = 0.9; s.disaster.tracks.phone = 0.9; s.disaster.tracks.stores = 0.9; s.disaster.tracks.medical = 0.9; s.disaster.tracks.law = 0.9; s.disaster.tracks.deliveries = 0.9; s.disaster.tracks.banks = 0.9;
    expect(eligibleLines(s, 'ham', false, false).some(l => l.id.endsWith('ham_back_soon'))).toBe(false);
  });
  it('no line is eligible when the kind is not the active disaster', () => {
    const s = world('mega_quake', 12);
    const lines = feltSpec('mega_quake')!.radio!;
    s.disaster.kind = 'wildfire';
    for (const l of lines) expect(l.when(s), l.id).toBe(false);
    expect(eligibleLines(s, 'ham', true, true).every(l => l.id.startsWith('wildfire.'))).toBe(true);
    s.disaster.kind = null;
    expect(eligibleLines(s, 'ham', true, true)).toEqual([]);
  });
  it('before the hit nothing is eligible and nothing is said', () => {
    const s = world('wildfire', 2); s.clock.t = s.disaster.hitAt - 3;
    expect(eligibleLines(s, 'ham', true, true)).toEqual([]);
    expect(feltRadioLine(s, 'ham', true, ctx(s))).toBeNull();
  });
});

describe('felt radio: who hears what', () => {
  it('a ham set hears strictly more channels than no radio, and a line only comes from its set\'s channels', () => {
    expect(CHANNELS.ham.length).toBeGreaterThan(CHANNELS.none.length);
    for (const k of ['mega_quake', 'cyberattack', 'pandemic'] as const) {
      const s = world(k, 12);
      const chans = (set: 'ham' | 'shortwave' | 'none') => new Set<RadioChannel>([true, false].flatMap(w => eligibleLines(s, set, w, false).map(l => l.channel)));
      expect(chans('ham').size, k).toBeGreaterThan(chans('none').size);
      for (const c of chans('none')) expect(CHANNELS.none).toContain(c);
      for (const c of chans('ham')) expect(CHANNELS.ham).toContain(c);
    }
  });
  it('untrained civilians speak in short, broken fragments; operators in whole sentences', () => {
    const s = world('mega_quake', 12);
    for (const l of feltSpec('mega_quake')!.radio!.filter(x => (x.channel === 'local' || x.channel === 'rumor') && x.when(s))) {
      const sentences = l.text(s, () => 0.5).split(/[.!?]+\s/).filter(Boolean);
      expect(sentences.length, l.id).toBeGreaterThanOrEqual(3);
      expect(Math.max(...sentences.map(x => x.split(/\s+/).length)), l.id).toBeLessThanOrEqual(12);
    }
  });
  it('the same seed and day give the same line', () => {
    const a = world('dam_flood', 12), b = world('dam_flood', 12);
    for (const want of [true, false]) expect(feltRadioLine(a, 'ham', want, ctx(a))).toEqual(feltRadioLine(b, 'ham', want, ctx(b)));
  });
  it('does not say the same line two days running when there is another to say', () => {
    const s = world('wildfire', 12); const seen: string[] = [];
    for (let i = 0; i < 8; i++) { s.clock.t += 1; const l = feltRadioLine(s, 'ham', true, { ...ctx(s), r: () => 0.1 }); if (l) seen.push(l.id); }
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});

describe('felt radio: scouting settles it', () => {
  it('a scout who sees clearly says false for a false line and confirmed for a true one', () => {
    const outcome = { true: 0, false: 0 };
    for (const want of [true, false]) for (let seed = 1; seed <= 30 && outcome[String(want) as 'true' | 'false'] < 3; seed++) {
      const s = world('mega_quake', 12, seed);
      s.people[0].age = 30; for (const p of s.people) p.skills.hunter = 20;
      const line = feltRadioLine(s, 'none', want, { ...ctx(s), r: () => 0.01 });
      if (!line?.claim) continue;
      expect(evalClaim(s, line.claim)).toBe(want);
      const st = (s.radio ??= { warnedUntil: -1, bonus: 0, truths: 0, rumors: 0 });
      st.heard = [{ id: 'h1', day: 1, text: `Over the fence: ${line.text}`, kind: line.kind, truth: !want /* the label is wrong on purpose: the claim decides */, status: 'open', claim: line.claim }];
      if (sendScout(s, 'h1', s.people[0].id)) continue;
      s.clock.t += 1.5; scoutDay(s);
      const h = st.heard[0];
      if (h.status === 'unclear') continue;
      expect(h.status).toBe(want ? 'confirmed' : 'false');
      outcome[String(want) as 'true' | 'false']++;
    }
    expect(outcome.true).toBeGreaterThan(0); expect(outcome.false).toBeGreaterThan(0);
  });
  it('radioDay remembers the claim on what it heard', () => {
    let claimed = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = world('mega_quake', 12, seed);
      s.stock.sw_radio = 1;
      for (let i = 0; i < 12; i++) { s.clock.t += 1; radioDay(s); }
      claimed += (s.radio?.heard ?? []).filter(h => h.claim).length;
    }
    expect(claimed).toBeGreaterThan(0);
  });
});
