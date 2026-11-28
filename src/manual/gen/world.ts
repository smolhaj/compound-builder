import { DIFFICULTY } from '../../sim/difficulty';
import { difficultySummary } from '../../sim/difficulty';
import { DIFFS, DIFF_MORE, MODES, PEACE } from '../../sim/startModes';
import { REGIONS } from '../../sim/regions';
import { LIFESTYLE } from '../../sim/site';
import { RICH_START, RICH_STARTS } from '../../sim/richStart';
import { LOT_KINDS, LOT_NAME } from '../../sim/lots';
import { bullets, table } from '../md';
import { usd } from './common';

export function modes(): string {
  return table(['Mode', 'What it is'], MODES.map(([, n, b]) => [n, b]));
}
export function peace(): string {
  return PEACE.map(([, l]) => l).join(', ') + ' (or random, 3 to 6 years, in Surprise).';
}
export function difficulty(): string {
  return DIFFS.map(([d, name, line]) => {
    const more = DIFF_MORE[d];
    return `### ${name}\n\n${line}.${more ? ` ${more}` : ''}\n\n${bullets(difficultySummary(d).length ? difficultySummary(d) : ['The reference level: every number is 1.'])}`;
  }).join('\n\n') + `\n\nThe waves climb ${DIFFICULTY.cozy.wave}, ${DIFFICULTY.standard.wave} and ${DIFFICULTY.hardcore.wave} on the three levels.`;
}
export function regions(): string {
  return table(['Region', 'Where', 'Hardiness zone', 'July high', 'January low', 'Land per acre', 'Look'], Object.values(REGIONS).map(r => [r.name, r.where, r.zone, `${r.julyHighF}°F`, `${r.janLowF}°F`, usd(r.perAcre), r.blurb]));
}
export function lifestyles(): string {
  return table(['Way of living', 'Starting money', 'What it means'], Object.values(LIFESTYLE).map(l => [l.name, usd(l.budget) + (l.passive ? `, plus ${usd(l.passive)} a year` : ''), l.blurb]));
}
export function richStarts(): string {
  return table(['Start', 'Budget', 'What it means'], RICH_STARTS.map(k => [RICH_START[k].name, usd(RICH_START[k].budget), RICH_START[k].blurb]));
}
export function lots(): string {
  return bullets(LOT_KINDS.map(k => LOT_NAME[k]));
}
