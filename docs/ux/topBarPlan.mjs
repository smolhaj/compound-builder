/**
 * Reference algorithm for the layout-A top bar (docs/UX_AUDIT.md section 11.1). The real one is a pure `sim/topBarPlan.ts` fed by measured widths;
 * these widths are the design budget. Run: node docs/ux/topBarPlan.mjs
 */
export const EDGE = 16, GAP = 6, PAD = 16, OVERFLOW_W = 44;
export const CHIPS = [   // priority order: first kept, last dropped into the overflow menu; widths measured from the mockup (node docs/ux/measureChips.mjs)
  { id: 'threat', full: 150, compact: 84 }, { id: 'cash', full: 80, compact: 80 }, { id: 'food', full: 67, compact: 67 }, { id: 'water', full: 75, compact: 75 },
  { id: 'power', full: 83, compact: 59 }, { id: 'needs', full: 46, compact: 46 }, { id: 'defense', full: 110, compact: 50 }, { id: 'morale', full: 73, compact: 34 }, { id: 'fuel', full: 67, compact: 67 },
];
const MENU = 34, DATE = 96, SPEED5 = 186, SPEED4 = 150, SPEED3 = 114, DIVIDER = 13;
export function topBarPlan(vw, { debt = false } = {}) {
  const avail = vw - 2 * EDGE - 8;   // 8 px safety for font rounding
  const speed = vw >= 1280 ? SPEED5 : vw >= 900 ? SPEED4 : SPEED3, date = vw >= 760 ? DATE : 0;
  const chips = debt ? [CHIPS[0], CHIPS[1], { id: 'debt', full: 96, compact: 70 }, ...CHIPS.slice(2)] : CHIPS;
  for (const mode of ['full', 'compact']) {
    const fixed = PAD + date + speed + MENU + DIVIDER + 4 * GAP;
    let used = fixed; const shown = [];
    for (const c of chips) { const w = c[mode] + GAP; const reserve = shown.length + 1 < chips.length ? OVERFLOW_W + GAP : 0; if (used + w + reserve <= avail || (shown.length + 1 === chips.length && used + w <= avail)) { shown.push(c.id); used += w; } else break; }
    const hidden = chips.filter(c => !shown.includes(c.id)).map(c => c.id);
    const total = used + (hidden.length ? OVERFLOW_W + GAP : 0);
    if (!hidden.length || mode === 'compact') return { vw, mode, speedButtons: vw >= 1280 ? 5 : vw >= 900 ? 4 : 3, showDate: date > 0, shown, overflow: hidden, width: total, slack: avail - total };
  }
}
if (process.argv[1] && process.argv[1].endsWith('topBarPlan.mjs')) for (const w of [1512, 1440, 1280, 1100, 900, 760]) console.log(JSON.stringify(topBarPlan(w)));
