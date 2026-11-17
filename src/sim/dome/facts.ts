/** The plain facts a dome's hover bill shows (US units). Pure (tested for text lint with the rest of the player-facing strings). */
import { TIER, shellFt, type DomeTier } from './tiers';
import { domeGeometry } from './geometry';
import { SHELL, impervious } from './protection';
import { SEEN } from './exposure';
import { defaultKwh } from './climate';
import { lockdownClock, freshAir } from './air';

/** Who the sealed-air line imagines under each tier. */
const CREW: Record<DomeTier, number> = { earthen: 2, geodesic: 6, glass: 20, arcology: 100 };
const n = (x: number): string => Math.round(x).toLocaleString('en-US');
const days = (h: number): string => (h === Infinity ? 'as long as the seals hold' : h < 72 ? `${n(h)} hours` : `${n(h / 24)} days`);

export function domeFacts(tier: DomeTier): string[] {
  const t = TIER[tier], g = domeGeometry(tier, shellFt(tier, t.cells)), s = SHELL[tier];
  const clock = lockdownClock(freshAir(), { tier, cells: t.cells, people: CREW[tier], filtering: 'none', powered: true, beds: 0 });
  const out = [
    `${n(g.diameterFt)} ft across, ${n(g.heightFt)} ft at the crown, covers ${(g.footprintSf / 43560).toFixed(g.footprintSf < 43560 ? 2 : 1)} acre${g.footprintSf >= 43560 * 1.5 ? 's' : ''}`,
    `Buried skirt ${n(t.skirtFt)} ft deep: tunnelers cannot dig under it; tunnels cross by an airlock`,
    t.airlocks ? `${t.airlocks} airlocks` : 'One low door, no airlock',
  ];
  out.push(`Holds out wind to ${n(s.wind)} mph, hail to ${s.hail >= 20 ? 'any size' : `${s.hail} in`}, snow to ${n(s.snow)} lb per sq ft`);
  out.push(impervious(tier) ? 'Rifle fire, rockets and shrapnel do not get through the panels' : tier === 'earthen' ? 'Thick earth turns most bullets' : 'Does not stop a rifle: it is a glazed wall');
  out.push(`Climate: about ${n(defaultKwh(tier, 20, 'frost'))} kWh a day to stay frost-free on a 20 F night`);
  out.push(`Sealed with ${CREW[tier]} people and no scrubber the air lasts ${days(clock.hoursToAlarm)}`);
  out.push(`Seen from about ${SEEN[tier].day.toFixed(SEEN[tier].day < 1 ? 1 : 0)} mi by day, ${SEEN[tier].night.toFixed(SEEN[tier].night < 1 ? 1 : 0)} mi at night`);
  return out;
}
