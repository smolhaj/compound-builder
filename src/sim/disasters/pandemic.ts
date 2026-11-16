import type { KindFx } from '../disasterFx';
import { contagionNow, outbreakBulletin, outbreakCards, outbreakChoose, outbreakDaily, outbreakGoal, outbreakPrice, outbreakServices, risk } from '../outbreak';

/** Pandemic (WP7): a wave clock, exposure with incubation, masks, a drop box, a held-apart arrival rule, immune runners (sim/outbreak.ts). */
export const fx: KindFx = {
  legacy: { npcs: 'neighborLife: neighbor plague mortality 4x, refugees 2x' },
  encounterWeights(s, { scale }) {
    const day = s.clock.t - s.disaster.hitAt;
    scale('arrival', 1.4); scale('refugees', 1.5); scale('trader', 0.5 + 0.5 * (1 - Math.min(1, risk(s))));
    if (day >= 0 && day < 60) scale('looters', 0.6);
  },
  medical: s => contagionNow(s),
  daily: (s, ctx) => outbreakDaily(s, ctx),
  priceMods: s => s.clock.t >= s.disaster.hitAt - 20 ? outbreakPrice(s) : 1,
  serviceMods: s => outbreakServices(s),
  radioBulletins: (s, ctx) => outbreakBulletin(s, ctx),
  oasisWeight: s => 0.25 * Math.min(1, risk(s)),
  cards: s => outbreakCards(s),
  choose: (s, c) => outbreakChoose(s, c),
  goal: s => outbreakGoal(s),
};
