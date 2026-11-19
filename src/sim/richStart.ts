/**
 * Rich starts (owner decision 2026-11-19, from the dome pricing audit): two optional, clearly labeled starts for players who want a glass dome or an
 * arcology on day one. "Founder" brings about $25 million; "Magnate" about $1.5 billion. They are sandbox-like conveniences: the run is flagged
 * (`GameState.richStart`), the report card is not graded, the dynasty score does not count and no milestone is awarded (`Lineage.unscored`).
 * The prices shown on the setup card come from the pricing module (`richStartCard.ts`), never typed by hand. PROPOSED numbers: docs/DECISIONS.md.
 * Pure (tested in richStart.test.ts).
 */
import type { GameState } from './state';
import type { StartFunds } from './startFunds';
import type { DomeTier } from './dome/tiers';

export type RichStart = 'founder' | 'magnate';
export const RICH_STARTS: RichStart[] = ['founder', 'magnate'];

/** PROPOSED. Cash to spend on land and building, before the land comes out. Founder meets the glass dome's $15 million gate; Magnate the arcology's $500 million. */
export const RICH_START: Record<RichStart, { name: string; budget: number; blurb: string; label: string; domes: DomeTier[] }> = {
  founder: { name: 'Founder', budget: 25_000_000, label: 'a sold company', blurb: 'The family sold a company. Sandbox-like: a rich start is not graded and does not count toward the dynasty score or milestones.', domes: ['geodesic', 'glass'] },
  magnate: { name: 'Magnate', budget: 1_500_000_000, label: 'a fortune', blurb: 'A fortune on the table. Sandbox-like: a rich start is not graded and does not count toward the dynasty score or milestones.', domes: ['glass', 'arcology'] },
};

/** The starting money of a rich start, in the same shape as the ordinary start's. */
export function richFunds(kind: RichStart): StartFunds {
  const r = RICH_START[kind];
  return { budget: r.budget, passive: 0, lines: [{ label: `${r.name} start: ${r.label}`, usd: r.budget }] };
}

export const isRichStart = (s: Pick<GameState, 'richStart'>): boolean => !!s.richStart;
