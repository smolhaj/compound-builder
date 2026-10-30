/**
 * Soap from the family's own lard and ash (GDS §10.5: "a forge, soap and
 * candles" under long-term self-reliance). Hygiene supplies (soap, paper,
 * toothpaste: sim/body.ts) are a bought good that runs out once the stores
 * close; and a house without soap gets dysentery (sim/medical.ts). A batch
 * takes a pail of rendered lard (the pigs, sim/kitchen.ts) and half a rick
 * of hardwood for the lye, four hours of someone who can cook, and gives
 * three person-months of hygiene supplies (the soap part of it; the paper
 * and the rest stay short). The kitchen's day is busier for it. Pure.
 */
import { foodUnits, takeFood } from './pantry';
import { addKitchenHours } from './kitchen';
import { levelFor } from './skills';
import { log } from './economy';
import type { GameState } from './state';

export const SOAP = { lard: 1, firewood: 0.5, hours: 4, hygiene: 3 } as const;

/** Why no soap can be made now, or null. */
export function soapProblem(s: GameState): string | null {
  if (foodUnits(s, 'lard') < SOAP.lard) return 'needs a pail of rendered lard (butcher a pig)';
  if (s.stock.firewood < SOAP.firewood) return 'needs half a rick of firewood for the lye';
  const cook = Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => levelFor(s, p, 'cooking')));
  if (cook < 1) return 'needs a grown-up who can cook';
  return null;
}

/** Boil a batch. Skill 4+ gets a fourth month out of it. Returns an error or null. */
export function makeSoap(s: GameState): string | null {
  const why = soapProblem(s);
  if (why) return why;
  takeFood(s, 'lard', SOAP.lard);
  s.stock.firewood -= SOAP.firewood;
  const cook = Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => levelFor(s, p, 'cooking')));
  const made = SOAP.hygiene + (cook >= 4 ? 1 : 0);
  s.stock.hygiene += made;
  addKitchenHours(s, SOAP.hours);
  log(s, `A batch of soap: ${made} person-months of supplies, and the kitchen smells of lye all day.`);
  return null;
}
