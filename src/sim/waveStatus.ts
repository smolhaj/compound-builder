/**
 * What the HUD shows about the siege-wave clock (sim/waves.ts): one read-only selector. Nothing is saved or simulated here.
 * Null when there is no clock to show (an old save, before the hit, or a county with order again and no wave ever sent).
 */
import { diffOf } from './difficulty';
import { strengthOf } from './encounters';
import { WAVE, crewFactor, intensity, nextWaveDay, phaseOf, type WavePhase } from './waves';
import { dayIndex, type GameState } from './state';

export interface WaveStatus {
  phase: WavePhase | 'over';
  /** The wave coming (1-based), waves so far, and the peak the ladder climbs to. */
  next: number;
  done: number;
  peak: number;
  /** Days until it (0 = today); the date is exact, the crew is not. */
  daysTo: number;
  /** 0-1: how far up the escalation the coming wave stands (the threat meter). */
  threat: number;
  /** Short chip text, and the plain-English line. */
  chip: string;
  tone: 'good' | 'warn' | 'bad';
  explain: string;
  /** What to expect, in words, given today's defense. */
  expect: string;
}

export const WAVE_EXPLAIN = 'Raiders now come in waves. Each wave is bigger and better armed than the last. Between waves it is quiet: repair, rotate guards, stock up.';

const crewWord = (f: number): string => f < 1.2 ? 'a small crew' : f < 1.5 ? 'a sizable crew' : f < 1.85 ? 'a large crew, well armed' : 'a very large, heavily armed crew';

export function waveStatus(s: GameState): WaveStatus | null {
  const w = s.gate.waves, d = s.disaster;
  if (!w || !d.kind || s.clock.t < d.hitAt) return null;
  const day = dayIndex(s.clock.t), wt = diffOf(d);
  if (d.tracks.law >= WAVE.LAW_END) {
    return w.n > 0 ? { phase: 'over', next: w.n + 1, done: w.n, peak: WAVE.PEAK, daysTo: 0, threat: 0, chip: 'No more waves', tone: 'good', explain: 'The county has order again. Nobody is organizing raids.', expect: '' } : null;
  }
  const due = nextWaveDay(s.seed, Math.floor(d.hitAt), w, wt.lull), phase = phaseOf(day, due), daysTo = Math.max(0, due - day), next = w.n + 1;
  const f = crewFactor(next, strengthOf(s), wt.wave);
  const when = daysTo === 0 ? 'today' : daysTo === 1 ? 'tomorrow' : `in ${daysTo} days`;
  const chip = phase === 'arriving' ? `Wave ${next}: today` : `Wave ${next} ${when}`;
  const expect = `Wave ${next} of ${WAVE.PEAK}: expect ${crewWord(f)}${intensity(next) >= 1 ? ' (waves stop growing here)' : next > 1 ? ', larger than the last' : ', the smallest you will see'}.`;
  return { phase, next, done: w.n, peak: WAVE.PEAK, daysTo, threat: intensity(next), chip, tone: phase === 'quiet' ? (daysTo > 14 ? 'good' : 'warn') : 'bad', explain: WAVE_EXPLAIN, expect };
}
