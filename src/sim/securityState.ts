/**
 * What the family has bought into for its security: an armed-response subscription (sim/armedResponse.ts) and a neighborhood watch (sim/watch.ts).
 * Optional on the game state (`GameState.security`): absent means neither, which is how every older save loads. Pure.
 */
import type { GameState } from './state';

export interface ResponseSub {
  /** Game day it started, and the day the last month was paid. */
  since: number;
  paidDay: number;
  /** Months the firm could not be paid (the banks are closed): two and it lapses. */
  missed: number;
  /** Consecutive days with the banks and the law both under the permanent-collapse threshold; at `DOWN.days` the firm is gone for good. */
  downDays: number;
  /** Game day the firm stopped answering (collapse or a lapse), else null. */
  ended: number | null;
  /** Times the panic button was answered. */
  calls: number;
}

export interface Watch {
  name: string;
  founded: number;
  /** Neighbor ids in the watch (the family is a member while this object exists). */
  members: string[];
  leader: string;
  /** Day the dues were last paid, and the day of the last alert. */
  paidDay: number;
  alertedFor: number;
  /** Alerts the watch has sent the family. */
  alerts: number;
}

export interface Security {
  response?: ResponseSub | null;
  watch?: Watch | null;
}

export const securityOf = (s: GameState): Security => (s.security ??= {});
