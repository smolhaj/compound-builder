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

/** The real price of each dome the start can afford, at its default size ("a 150 ft glass dome costs about $33M"), from the pricing module. */
export function richPriceLines(kind: RichStart): string[] {
  return RICH_START[kind].domes.map(t => {
    const sum = domeCostSummary(t);
    const noun = t === 'geodesic' ? 'geodesic dome' : t === 'glass' ? 'glass dome' : 'arcology';
    return `a ${Math.round(shellFt(t, TIER[t].cells))} ft ${noun} costs about ${compactUsd(sum.totalUsd)}`;
  });
}
