/** What the top-bar collapse chip says (ui/CollapseChip.tsx): the countdown through the warning days, then the day count. Pure. */
import { DISASTERS } from './disaster';
import { dayIndex, type GameState } from './state';

export interface CollapseChipInfo { chip: string; tone: 'warn' | 'bad' | 'dim'; title: string; /** 0-1 through the warning (the bar). */ w: number }

export function collapseChip(s: GameState): CollapseChipInfo | null {
  const d = s.disaster, t = s.clock.t;
  if (!d.kind || t < d.warnAt) return null;
  const name = DISASTERS[d.kind]?.name ?? 'Trouble';
  if (t < d.hitAt) {
    const left = Math.max(1, Math.ceil(d.hitAt - t)), w = Math.min(1, (t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt));
    return { chip: left === 1 ? 'Impact: within a day' : `Impact in ${left} days`, tone: left <= 3 || w > 0.7 ? 'bad' : 'warn', w, title: `${name}. The warning signs are showing; the news strip has the latest. Get ready now.` };
  }
  const day = dayIndex(t) - dayIndex(d.hitAt) + 1;
  return { chip: `Day ${day}`, tone: day <= 3 ? 'bad' : 'dim', w: 1, title: `${day} days since the collapse (${name}).` };
}
