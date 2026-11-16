import type { KindFx } from '../disasterFx';
import { contagionNow, outbreakBulletin, outbreakCards, outbreakChoose, outbreakDaily, outbreakGoal, outbreakPrice, outbreakServices, risk } from '../outbreak';

/** Engineered bioweapon (WP4): the pandemic model at higher dose and fatality, no mild first wave, filtered bunker air as a real shelter, strangers as the weapon. */
export const fx: KindFx = {
  legacy: { supplies: 'scavenge.ts: scavenging sickness', npcs: 'neighborLife: neighbor plague 4x, refugees 2x' },
  encounterWeights(s, { scale }) { scale('arrival', 1.4); scale('refugees', 1.5); scale('trader', 0.3 + 0.4 * (1 - Math.min(1, risk(s)))); scale('looters', 0.7); },
  medical: s => contagionNow(s),
  daily: (s, ctx) => outbreakDaily(s, ctx),
  priceMods: s => outbreakPrice(s) * 1.1,
  serviceMods: s => outbreakServices(s),
  radioBulletins: (s, ctx) => outbreakBulletin(s, ctx),
  oasisWeight: s => 0.3 * Math.min(1, risk(s)),
  cards: s => outbreakCards(s),
  choose: (s, c) => outbreakChoose(s, c),
  goal: s => outbreakGoal(s),
};
