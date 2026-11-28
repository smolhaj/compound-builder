import { ORDERS, ORDER_HINT, ORDER_NAME, STAGES } from '../../sim/raidOrders';
import { SCOUT_HINT, SCOUT_NAME, SCOUT_PLANS } from '../../sim/scoutPlans';
import { STANCE } from '../../ui/stanceText';
import { table } from '../md';

export function orders(): string {
  return table(['Order', 'What it does'], ORDERS.map(o => [ORDER_NAME[o], ORDER_HINT[o]]));
}
export function stages(): string {
  return `A fight moves through ${STAGES.length} stages: ${STAGES.join(', then ')}. Each has its own cover; the house is the best, the open yard the worst.`;
}
export function scouts(): string {
  return table(['Plan for spotted scouts', 'What it does'], SCOUT_PLANS.map(p => [SCOUT_NAME[p], SCOUT_HINT[p]]));
}
/** Every button the gate cards can show. */
export function gateChoices(): string {
  return table(['Choice', 'What it does'], Object.values(STANCE).map(([n, t]) => [n, t]));
}
