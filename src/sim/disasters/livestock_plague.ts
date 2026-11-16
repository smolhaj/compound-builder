import type { KindFx } from '../disasterFx';
import { plagueBulletin, plagueCards, plagueChoose, plagueDaily, plagueGoal, plagueOf, plagueVariant } from '../livestockPlague';
import { contagionNow, outbreakDaily } from '../outbreak';

/** Livestock plague (WP7): biosecurity, the cull card, the movement ban and a slow human tail for the zoonotic flu (sim/livestockPlague.ts). */
export const fx: KindFx = {
  daily: (s, ctx) => [...plagueDaily(s, ctx), ...(plagueVariant(s).human ? outbreakDaily(s, ctx) : [])],
  priceMods: s => 1 + (plagueOf(s).onPlace ? 0.12 : 0.06),
  encounterWeights(s, { scale }) { scale('trader', 0.6); scale('refugees', 0.8); if (plagueOf(s).decision === 'hide') scale('arrival', 0.7); },
  medical: s => plagueVariant(s).human ? contagionNow(s) : null,
  radioBulletins: (s, ctx) => plagueBulletin(s, ctx),
  oasisWeight: s => plagueOf(s).onPlace ? 0.15 : 0.05,
  cards: s => plagueCards(s),
  choose: (s, c) => plagueChoose(s, c),
  goal: s => plagueGoal(s),
};
