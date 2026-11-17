/**
 * Layout A top bar fit (docs/UX_AUDIT.md section 11.1, reference docs/ux/topBarPlan.mjs): which chips show, in which
 * mode, and which fall into the overflow menu. Pure: window width and measured chip widths in, a plan out.
 *
 * Chips are kept in priority order (first kept, last dropped): threat, cash, (owe), food, water, power, Needs,
 * defense, morale, fuel. The bar never wraps and never exceeds the window: it tries `full` chips, and if the
 * result needs an overflow it retries with `compact` chips before dropping any.
 */
export type ChipId = 'threat' | 'cash' | 'debt' | 'food' | 'water' | 'power' | 'needs' | 'defense' | 'morale' | 'fuel';
/** Priority order, most important first (the debt chip rides right after cash while a debt exists). */
export const CHIP_ORDER: readonly ChipId[] = ['threat', 'cash', 'debt', 'food', 'water', 'power', 'needs', 'defense', 'morale', 'fuel'];
export interface ChipWidth { id: ChipId; full: number; compact: number }
export type BarMode = 'full' | 'compact';

export const BAR = {
  /** Window edge margin, the gap between items, the bar's own padding, the overflow chip, and a safety for font rounding. */
  edge: 16, gap: 6, pad: 16, overflow: 56, safety: 8,
  /** Fixed zones: date, menu button, the divider between speed and chips. All set as explicit CSS widths. */
  date: 104, menu: 34, divider: 13,
  /** A speed button, and the gap between speed buttons. */
  speedBtn: 34, speedGap: 4,
} as const;

/** The measured widths the design was fitted with (docs/ux/measureChips.mjs); the real bar measures its own chips and passes those. */
export const DESIGN_WIDTHS: readonly ChipWidth[] = [
  { id: 'threat', full: 150, compact: 84 }, { id: 'cash', full: 80, compact: 80 }, { id: 'debt', full: 96, compact: 70 },
  { id: 'food', full: 67, compact: 67 }, { id: 'water', full: 75, compact: 75 }, { id: 'power', full: 83, compact: 59 },
  { id: 'needs', full: 46, compact: 46 }, { id: 'defense', full: 110, compact: 50 }, { id: 'morale', full: 73, compact: 34 }, { id: 'fuel', full: 67, compact: 67 },
];

/** How many speed buttons fit: five (pause, 1x to 4x) from 1280, four from 900, three below. */
export const speedButtonsFor = (vw: number): 3 | 4 | 5 => (vw >= 1280 ? 5 : vw >= 900 ? 4 : 3);
export const speedWidth = (n: number): number => n * BAR.speedBtn + (n - 1) * BAR.speedGap;

export interface TopBarPlan {
  vw: number;
  mode: BarMode;
  speedButtons: 3 | 4 | 5;
  showDate: boolean;
  shown: ChipId[];
  overflow: ChipId[];
  /** The bar's content width and what is left of the window. */
  width: number;
  slack: number;
}

export interface PlanOpts { /** Chips that exist right now (the debt chip only while owing). Defaults to every chip but debt. */ present?: readonly ChipId[]; widths?: readonly ChipWidth[] }

export function topBarPlan(vw: number, opts: PlanOpts = {}): TopBarPlan {
  const present = new Set<ChipId>(opts.present ?? CHIP_ORDER.filter(c => c !== 'debt'));
  const table = new Map((opts.widths ?? DESIGN_WIDTHS).map(w => [w.id, w]));
  const chips = CHIP_ORDER.filter(c => present.has(c) && table.has(c)).map(c => table.get(c)!);
  const avail = vw - 2 * BAR.edge - BAR.safety;
  const speedButtons = speedButtonsFor(vw), showDate = vw >= 760;
  const fixed = BAR.pad + (showDate ? BAR.date : 0) + speedWidth(speedButtons) + BAR.menu + BAR.divider + 4 * BAR.gap;
  let last: TopBarPlan | null = null;
  for (const mode of ['full', 'compact'] as const) {
    let used = fixed; const shown: ChipId[] = [];
    for (const c of chips) {
      const w = c[mode] + BAR.gap, reserve = shown.length + 1 < chips.length ? BAR.overflow + BAR.gap : 0;
      if (used + w + reserve <= avail || (shown.length + 1 === chips.length && used + w <= avail)) { shown.push(c.id); used += w; } else break;
    }
    const overflow = chips.filter(c => !shown.includes(c.id)).map(c => c.id);
    const width = used + (overflow.length ? BAR.overflow + BAR.gap : 0);
    last = { vw, mode, speedButtons, showDate, shown, overflow, width, slack: avail - width };
    if (!overflow.length || mode === 'compact') return last;
  }
  return last!;
}

/** The overflow chip takes the worst tone of the chips it hides (a hidden red is never silent). */
export function worstTone<T extends 'good' | 'warn' | 'bad' | 'info' | 'dim'>(tones: readonly T[]): T | 'good' {
  return tones.includes('bad' as T) ? 'bad' as T : tones.includes('warn' as T) ? 'warn' as T : 'good';
}
