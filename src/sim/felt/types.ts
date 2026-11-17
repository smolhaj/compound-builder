/**
 * The felt-layer contract (docs/FELT_LAYER.md section 4.2). Every kind supplies one `FeltSpec` in `kinds/<kind>.ts`; every member is
 * optional until the kind's content package lands, and `feltChecklist.test.ts` turns "optional" into "required" per kind (FELT_ENFORCE).
 * Specs hold functions; the saved state (`disaster.fx.felt`, state.ts) holds only JSON.
 */
import type { DisasterKind, Track } from '../disaster';
import type { FirstHourGoal } from '../firstHour';
import type { SuggestionAct } from '../guidance';
import type { MaterialId } from '../materials';
import type { GameState } from '../state';

/** The eight kinds that are designed (docs/scenarios) but not yet in the DisasterKind union; WP10 adds them and this alias collapses. */
export const PLANNED_KINDS = ['satellite_loss', 'oil_shock', 'reactor_meltdown', 'global_famine', 'water_war', 'cult_takeover', 'mass_exodus'] as const;
export type PlannedKind = typeof PLANNED_KINDS[number];
export type FeltKind = DisasterKind | PlannedKind;

/** warning: warnAt..hitAt; hit: day 0-7; month: 8-35; season: 36-120; year: 121+ */
export type FeltPhase = 'warning' | 'hit' | 'month' | 'season' | 'year';
export const FELT_PHASES: FeltPhase[] = ['warning', 'hit', 'month', 'season', 'year'];

export interface HitBeat {
  /** Seconds from the start (real time, sim paused). */
  at: number;
  /** One line, plain, present tense ("The shaking has lasted a minute."). */
  caption?: string;
  /** 0..1 camera shake amplitude (0 when reduced motion is on). */
  shake?: number;
  /** 0..1 white or tinted wash; the existing collapseLook day-one pulse is the floor. */
  flash?: number;
  tint?: [number, number, number];
  /** Turn the camera toward a skyline direction (collapseLook.az) by at most 25 degrees. */
  bearing?: 'fire' | 'war' | 'town' | 'road' | number;
}

/** A step of the day card's "Do first": `act` is a real handler (the union guidance.ts already uses); `dash` is a dashboard tab id. */
export interface FirstStep { label: string; why: string; act?: SuggestionAct | { dash: string } }

export type MarkKind =
  'ash' | 'ash_drift' | 'smoke' | 'pyre' | 'ruin' | 'flood' | 'mud_line' | 'dry_bed' | 'crack' | 'road_cut' | 'slump' | 'red_tag' | 'tarp' | 'boarded'
  | 'dark_house' | 'open_door' | 'dead_field' | 'burn_scar' | 'checkpoint' | 'barricade' | 'camp' | 'column' | 'queue' | 'banner' | 'sign' | 'zone' | 'stalled'
  /** FL2: wreckage and drift left by water, wind or a quake (logs, planks, a toppled fence). */
  | 'debris'
  /** A fallout or smoke plume standing on the sky (a stripe at a bearing). */
  | 'plume';
export type Anchor =
  | { at: 'compound' } | { at: 'structure'; id: string } | { at: 'neighbor'; i: number } | { at: 'town' }
  /** Meters along the county road window, as roadTraffic does. */
  | { at: 'road'; s: number }
  | { at: 'creek' } | { at: 'lowland'; level: number } | { at: 'field'; i: number } | { at: 'sky'; bearing: number };
export interface WorldMark { id: string; kind: MarkKind; anchor: Anchor; /** 0..1 */ sev: number; /** Game day. */ since: number; seed: number }

export type RadioChannel = 'official' | 'ham' | 'trade' | 'rumor' | 'local';
export interface RadioLine {
  id: string; channel: RadioChannel; phases: FeltPhase[];
  /** stale: was true up to a few days ago. */
  truth: 'true' | 'false' | 'stale';
  /** Eligible: tied to real state (a service is really out, a neighbor really left). */
  when(s: GameState): boolean;
  /** The fact the line asserts, checkable; scouting resolves it. */
  claim?(s: GameState): boolean;
  /** Interpolates real numbers (days, counts, prices). */
  text(s: GameState, r: () => number): string;
  tone: 0 | 1 | 2 | 3;
}

export interface FeedLine { id: string; text: string; tone: 0 | 1 | 2 | 3 }
/** What the feed compares against: the last day's look at the numbers (saved in `fx.felt.snap`). */
export interface FeltSnap { day: number; tracks: Partial<Record<Track, number>>; neighbors: number; marks: number }

export interface Cost { money?: number; stock?: Partial<Record<MaterialId, number>>; hours?: number; people?: number; humanity?: number; standing?: number }
export interface DecisionOption {
  id: string; label: string;
  /** The plain consequence line. */
  hint(s: GameState): string;
  /** Shown as chips, charged on choosing. */
  cost(s: GameState): Cost;
  /** Shown as "about 7 in 10"; p scales with DIFFICULTY. */
  odds?(s: GameState): { p: number; good: string; bad: string };
  /** Why it cannot be chosen now. */
  off?(s: GameState): string | null;
  /** The effect; returns log lines. */
  apply(s: GameState, r: () => number): string[];
}
export interface DecisionCard {
  id: string; phase: FeltPhase; once?: boolean; cooldownDays?: number;
  /** Eligibility from state, never from a timer alone. */
  when(s: GameState): boolean;
  title(s: GameState): string; text(s: GameState): string;
  options: DecisionOption[];
  timeoutDays?: number;
  /** Option id taken (and logged) if the card is left; default is the safest option. */
  fallback: string;
}

export interface GoalStep {
  id: string; short: string; title: string;
  line(s: GameState): string; why(s: GameState): string; done(s: GameState): boolean;
  act?(s: GameState): FirstHourGoal['act'] | null;
  reward: { title: string; line: string };
  pace?(s: GameState): string | null;
}
export interface GoalChain { id: string; title: string; startsAt: 'warning' | 'hit'; steps: GoalStep[] }

export interface FeltSpec {
  /** 1. The hit moment (2 to 4 beats, 6 s at most) and the title line shown over the last beat. */
  hit?: { title: string; beats: HitBeat[] };
  /** 1. The day card: what stays up, and the first three things to do (at most 3). Lost services are derived from the tracks by shared code. */
  card?: { stays?(s: GameState): string[]; first(s: GameState): FirstStep[] };
  /** 2. World state: marks as a pure function of the state and the day since the hit. Deterministic; capped by tier. */
  marks?(s: GameState, day: number): WorldMark[];
  /** 3. Radio and rumors (at least 5 distinct lines). */
  radio?: RadioLine[];
  /** 3. Extra feed lines beyond the generic diff of tracks, prices, neighbors and marks. */
  feed?(s: GameState, prev: FeltSnap | null): FeedLine[];
  /** 4. Decision cards by phase. */
  cards?: DecisionCard[];
  /** 5. The signature goal chain (3 to 5 steps); `second` is an optional follow-on chain that starts at the month phase. */
  goals?: GoalChain;
  second?: GoalChain;
}
