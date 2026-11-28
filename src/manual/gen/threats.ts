import { BLURB } from '../../sim/disasterBlurbs';
import { DISASTERS, TRACKS, TRACK_NAME, type DisasterKind } from '../../sim/disaster';
import { THREAT_NAME } from '../../sim/threatState';
import { THREAT_DAYS } from '../../sim/threats';
import { SEASON } from '../../sim/weatherThreats';
import type { StormKind } from '../../sim/regions';
import { REGIONS } from '../../sim/regions';
import { bullets, table } from '../md';
import { words } from './common';

export const disasterKinds = (): DisasterKind[] => Object.keys(BLURB) as DisasterKind[];

/** Every disaster the game can roll, in plain words, with the warning it gives and what it can lead to. */
export function disasters(): string {
  return table(['Disaster', 'Warning before it hits', 'What it is', 'Comes in these forms', 'Can lead to'], disasterKinds().map(k => {
    const d = DISASTERS[k];
    const warn = d ? `${d.warn[0]} to ${d.warn[1]} days` : 'varies';
    const forms = d ? d.variants.map(v => v.name).join('; ') : '';
    const next = d ? d.chain.map(c => `${words(c.kind)} (${Math.round(c.p * 100)}%)`).join(', ') : '';
    return [`${d?.name ?? words(k)}${d?.pulpy ? ' (pulpy)' : ''}`, warn, BLURB[k], forms, next || 'nothing in particular'];
  }));
}

export function tracks(): string {
  return bullets(TRACKS.map(t => `**${TRACK_NAME[t]}**`));
}

const THREAT_TEXT: Record<keyof typeof THREAT_NAME, string> = {
  plague: `Fevers at home and a worse year for the neighbors. Lasts about ${THREAT_DAYS.plague} days. More likely when the hospitals and pharmacies are gone.`,
  famine: `A bad growing season. Lasts about ${THREAT_DAYS.famine} days. More likely when the stores are empty.`,
  hard_winter: 'A deep freeze that burns wood and fuel, and a thaw after it that spoils fresh and frozen food.',
  warlord: `More raids for about ${THREAT_DAYS.warlord} days. More likely when there is no law.`,
};
export function yearlyThreats(): string {
  return table(['Threat', 'What happens'], (Object.keys(THREAT_NAME) as Array<keyof typeof THREAT_NAME>).map(k => [THREAT_NAME[k], THREAT_TEXT[k]]));
}

const STORM_TEXT: Record<StormKind, string> = {
  blizzard: 'Heavy snow and wind. Roads shut, roofs load up, heat and firewood matter.',
  tornado: 'A narrow path of ruin. A low or weak building may go. A hardened safe room is the answer.',
  derecho: 'A line of straight-line wind that takes trees, roofs and power.',
  hail: 'Hail takes that season\'s crop and cracks glass and film.',
  heat_wave: 'Days of heat. Elders and anyone without fans or cool shade suffer.',
  flood: 'The creek floods the bottom land. Build above it.',
  lightning_fire: 'Lightning or a spark starts a grass or forest fire. Defensible space and a water source help.',
  ice_storm: 'Ice on lines and branches. The power is out for days.',
  hurricane_remnants: 'A foot of rain on the ridges. The creek floods, trees come down, the power is out a day or two.',
  flash_flood: 'A wash runs bank-full with no warning. A low structure may go and the drive is cut for the day.',
  windstorm: 'A big Pacific low. Big firs come down and the power is out a day or two.',
};
const monthOf = (doy: number): string => new Date(2027, 0, doy).toLocaleString('en-US', { month: 'short' });
export function storms(): string {
  const where = (k: StormKind) => Object.values(REGIONS).filter(r => (r.storms[k] ?? 0) > 0).map(r => r.name).join(', ') || 'none at start';
  return table(['Storm', 'Usual season', 'What it does', 'Where it comes'], (Object.keys(STORM_TEXT) as StormKind[]).map(k => [words(k), `${monthOf(SEASON[k][0])} to ${monthOf(SEASON[k][1])}`, STORM_TEXT[k], where(k)]));
}
