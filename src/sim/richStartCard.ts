/** The setup card's price lines for the rich starts, from the pricing module (kept apart from richStart.ts so state.ts need not import the dome sim). Pure. */
import { shellFt, TIER } from './dome/tiers';
import { domeCostSummary } from './dome/costSummary';
import { RICH_START, type RichStart } from './richStart';

/** "$33M", "$1.1B", "$420k": two or three digits, for a card. */
export function compactUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  return `$${Math.round(n / 1000)}k`;
}

/**
 * The real price of each dome a start is for ("a 150 ft glass dome costs about $33M"), from the pricing module. A dome that costs more than the
 * start's whole budget says so, so nobody picks Founder to build the 150 ft glass dome and finds it $8 million short.
 */
export function richPriceLines(kind: RichStart): string[] {
  const budget = RICH_START[kind].budget;
  return RICH_START[kind].domes.map(([t, size]) => {
    const cells = size === 'smallest' ? TIER[t].minCells : TIER[t].cells, sum = domeCostSummary(t, cells);
    const noun = t === 'geodesic' ? 'geodesic dome' : t === 'glass' ? 'glass dome' : 'arcology';
    return `a ${Math.round(shellFt(t, cells))} ft ${noun} costs about ${compactUsd(sum.totalUsd)}${sum.totalUsd > budget ? ', more than this start has' : ''}`;
  });
}
