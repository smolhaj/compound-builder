/**
 * The felt radio (FL3, docs/FELT_LAYER.md section 5.3). `feltRadioLine` is called from `radioDay` (sim/radio.ts) after the usual reception roll:
 * `hear` and `truth` stay as tuned, and this only decides WHAT is said on a day something is heard. It picks among the kind's eligible
 * `RadioLine`s of the class the truth coin asked for: a true line only while its claim holds, a false line only while its claim does not,
 * so every false line is provably false in this world and scouting settles it (sim/rumors.ts).
 * Channels by set: ham hears official, ham and trade; shortwave hears official and rumor (a thin slice of ham); no radio hears only
 * the fence line (local and rumor). Same seed and day, same line.
 */
import type { GameState } from '../state';
import type { FxCtx } from '../disasterFx';
import type { RadioSet, RumorKind } from '../radio';
import { claimRumorKind, evalClaim, type Claim } from './claims';
import { feltPhase } from './state';
import { feltSpec } from './registry';
import type { GenLine } from './lineKit';
import type { FeltSpec, RadioChannel, RadioLine } from './types';

/** Which channels a set can hear. */
export const CHANNELS: Record<RadioSet, readonly RadioChannel[]> = {
  ham: ['official', 'ham', 'trade'],
  shortwave: ['official', 'rumor'],
  none: ['local', 'rumor'],
};
/** The share of days a heard broadcast is a felt line (the rest stay the existing fate hints, raider warnings and service reports). */
export const FELT_SHARE = 0.65;
/** A shortwave set catches a ham exchange now and then. */
const HAM_SLICE = 0.25;
const RECENT = 6;

export interface FeltLineHeard { id: string; text: string; tone: 0 | 1 | 2 | 3; kind: RumorKind; truth: boolean; claim?: Claim }

const hasClaim = (l: RadioLine): l is GenLine => typeof (l as GenLine).claimOf === 'function';

/** Lines that could be said today for this set: right channel and phase, `when` holds, and the claim matches the truth asked for. */
export function eligibleLines(s: GameState, set: RadioSet, want: boolean, ham: boolean): RadioLine[] {
  const lines = feltSpec(s.disaster.kind)?.radio;
  const phase = feltPhase(s);
  if (!lines || !phase) return [];
  const heard = new Set<RadioChannel>(CHANNELS[set]);
  if (set === 'shortwave' && ham) heard.add('ham');
  return lines.filter(l => {
    if (!heard.has(l.channel) || !l.phases.includes(phase) || !l.when(s)) return false;
    if (want) return l.truth === 'true' && l.claim?.(s) !== false;
    return l.truth !== 'true' && l.claim?.(s) === false;
  });
}

/** The line for today, or null (no kind, nothing eligible, or today's broadcast is left to the usual news). Writes only `fx.feltRadio.recent`. */
export function feltRadioLine(s: GameState, set: RadioSet, want: boolean, ctx: FxCtx): FeltLineHeard | null {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt) return null;
  const share = ctx.r(), slice = ctx.r() < HAM_SLICE, pickR = ctx.r();
  if (share > FELT_SHARE) return null;
  const pool = eligibleLines(s, set, want, slice);
  if (!pool.length) return null;
  const bag = ((d.fx ??= {}).feltRadio ??= { recent: [] as string[] }) as { recent: string[] };
  const fresh = pool.filter(l => !bag.recent.includes(l.id));
  const notLast = pool.filter(l => l.id !== bag.recent[bag.recent.length - 1]);
  const from = fresh.length ? fresh : notLast.length ? notLast : pool;
  const line = from[Math.floor(pickR * from.length)];
  bag.recent.push(line.id);
  if (bag.recent.length > RECENT) bag.recent.splice(0, bag.recent.length - RECENT);
  const claim = hasClaim(line) ? line.claimOf(s) : undefined;
  return { id: line.id, text: line.text(s, ctx.r), tone: line.tone, kind: claim ? claimRumorKind(claim) : 'service', truth: want, claim };
}

/** Is a line's claim true now (for tests and tools)? A line with no claim reads as its label. */
export const lineHolds = (s: GameState, l: RadioLine): boolean => hasClaim(l) ? evalClaim(s, l.claimOf(s)) : l.truth === 'true';

/** The daily dispatcher's radio step: the radio itself speaks inside `radioDay`, so there is nothing to do here. */
export function feltRadio(_s: GameState, _ctx: FxCtx, _spec: FeltSpec): string[] {
  return [];
}
