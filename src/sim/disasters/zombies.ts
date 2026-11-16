import type { KindFx } from '../disasterFx';
import { signatureNow, walkerBulletin, walkerCards, walkerChoose, walkerGoal, walkerNight, walkerTurns, walkerVisitor, zombiesOf } from '../walkers';

/** Zombies (WP4): infection by bite, the 24-hour rule, a crowd at the wall that follows noise and light, wall load, decay, freeze and thaw (sim/walkers.ts). */
export const fx: KindFx = {
  legacy: { economy: 'market.ts: the market closes for good' },
  onHit: () => ['They are walking up the county road. Lights out, and keep the dogs inside.'],
  daily: (s, ctx) => [...walkerNight(s, ctx), ...walkerTurns(s, ctx), ...walkerVisitor(s, ctx)],
  encounterWeights(s, { w, p, scale }) {
    const z = zombiesOf(s), sig = signatureNow(s).ft;
    w.push(['horde', Math.min(160, 60 + 2 * z.crowd + sig / 60) * (0.5 + p.visibility / 100)]);
    scale('trader', 0.2); scale('refugees', 0.5); scale('requisition', 0);
  },
  npcMods: s => 1 + Math.min(2, 0.4 + (s.clock.t - s.disaster.hitAt) / 30),
  medical: () => ({ contact: 0, spread: 0 }),
  radioBulletins: (s, ctx) => walkerBulletin(s, ctx),
  oasisWeight: s => 0.3 + Math.min(0.3, zombiesOf(s).crowd / 100),
  cards: s => walkerCards(s),
  choose: (s, c) => walkerChoose(s, c),
  goal: s => walkerGoal(s),
};
