import { DRAWERS } from '../../ui/hud/drawerRegistry';
import { PAGES } from '../../ui/hud/subPages';
import { compoundBoard } from '../../sim/compoundBoard';
import { topChips } from '../../sim/vitals';
import { CHIP_ORDER } from '../../sim/topBarPlan';
import { QUALITY_TIERS } from '../../engine/perf/qualityHelp';
import { OTHER_KEYS } from '../keys';
import { bullets, table } from '../md';
import { baseline } from './common';

type ChipKey = (typeof CHIP_ORDER)[number];
/** What each chip in the top bar tells you. Every chip id needs one (the manual test checks). */
export const CHIP_MEANING: Record<ChipKey, string> = {
  threat: 'The next thing to fear: warning signs, the wave clock, or "All quiet". Open the Board for the reasons.',
  cash: 'Your checking balance. Hover for net worth and what you owe.',
  debt: 'Only shows when you owe money on the card. It grows at the card rate and can bring a lien on the land.',
  food: 'Days of food in the pantry at the family\'s pace, with nothing grown or bought.',
  water: 'Days of stored water, or "Source OK" when a working well fills the tanks as you draw.',
  power: 'Power you can make now, in kW. "None" means nothing is wired or no source is built.',
  needs: 'How many decisions and gaps wait on you. Open the Board to see them.',
  defense: 'How hard the place is to take, with a word and a number.',
  morale: 'The household mood. Low morale hurts work and, in time, keeps people from staying.',
  fuel: 'Days of fuel for the generator and vehicles.',
};

export function chips(): string {
  const s = baseline(), real = new Map(topChips(s, compoundBoard(s)).map(c => [c.id, c.label]));
  return table(['Chip', 'Name', 'What it tells you'], CHIP_ORDER.map(id => [id, real.get(id) ?? (id === 'debt' ? 'Owed' : id), CHIP_MEANING[id]]));
}

export function drawers(): string {
  return table(['Panel', 'Key', 'What is in it', 'Pages'], DRAWERS.map(d => [d.title, d.key, d.blurb, (PAGES[d.id] ?? []).map(p => p.label).join(', ') || 'none']));
}

export function drawerPages(): string {
  return Object.entries(PAGES).map(([id, pages]) => `**${DRAWERS.find(d => d.id === id)?.title ?? id}**\n\n${bullets(pages!.map(p => `${p.label}: ${p.blurb}`))}`).join('\n\n');
}

export function hotkeys(): string {
  return table(['Key', 'What it does'], [...DRAWERS.map(d => [d.key, `Open or close ${d.title}: ${d.blurb}.`.replace(/\.\./g, '.')]), ...OTHER_KEYS.map(k => [k.keys, k.does])]);
}

export function quality(): string {
  return table(['Quality', 'What it does'], QUALITY_TIERS.map(t => [t.name, t.what]));
}

import { operational } from '../../sim/operational';
/** The Get operational checklist as it reads on a bare lot. */
export function operationalRows(): string {
  return table(['Row', 'Reads at the start of a sample game'], operational(baseline()).map(i => [i.label, i.line]));
}
