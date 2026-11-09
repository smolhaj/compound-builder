/**
 * How someone died, in a word the report card can print. Pure and type-only: it imports no game state, so the
 * places that kill a person (hunger, a wound, a raid, old age) and the wipe ending can all use it.
 *
 * Most deaths record their cause when they happen (`Needs.cause`). A death that did not (an older save, a rare path)
 * is worked out from the body: the wound or illness it carried, hunger, thirst, radiation.
 */
import type { Needs } from './needs';

export type DeathCause = 'starvation' | 'thirst' | 'cold' | 'illness' | 'wound' | 'raid' | 'radiation' | 'old age' | 'childbirth' | 'wild animal' | 'the road' | 'unknown';

/** The line for one death: "starved", "died of the cold". Plain American English. */
export const CAUSE_TEXT: Record<DeathCause, string> = {
  starvation: 'starved',
  thirst: 'died of thirst',
  cold: 'died of the cold',
  illness: 'died of an illness',
  wound: 'died of a wound',
  raid: 'was killed in a raid',
  radiation: 'died of radiation sickness',
  'old age': 'died of old age',
  childbirth: 'died in childbirth',
  'wild animal': 'was killed by a wild animal',
  'the road': 'was lost on the road',
  unknown: 'died, cause unknown',
};

const ILLNESS = /flu|dysentery|infection|abscess|fever|poison|giardia|botulism|infant|sick/;

/** The cause of a death worked out from the body (see above). `thirsty`: the household was short of water. */
export function inferCause(n: Pick<Needs, 'hurt' | 'hunger' | 'dose' | 'starved' | 'cause'>, thirsty = false): DeathCause {
  if (n.cause) return n.cause;
  // (the body repairs most radiation damage, sim/radiation.ts: a big lifetime dose alone is not the cause; the sickness it left is)
  if (n.hurt.some(h => /^radiation sickness/.test(h.what) && h.sev >= 30) || (!n.hurt.length && n.dose >= 4)) return 'radiation';
  if (n.hurt.some(h => /dehydrated/.test(h.what))) return 'thirst';
  if (n.hurt.some(h => /^hypothermia/.test(h.what))) return 'cold';
  const worst = [...n.hurt].sort((a, b) => b.sev - a.sev)[0];
  const hurtCause = (): DeathCause => {
    if (!worst) return 'unknown';
    if (worst.med?.kind === 'frostbite' || /frost|cold/.test(worst.what)) return 'cold';
    if (worst.trauma || (worst.med && ['wound', 'burn', 'fracture'].includes(worst.med.kind))) return 'wound';
    return ILLNESS.test(worst.what) || worst.med ? 'illness' : 'wound';
  };
  // a serious wound or illness is the cause even on an empty stomach
  if (worst && worst.sev >= 50) return hurtCause();
  if ((n.starved ?? 0) > 0 || n.hunger >= 15000) return 'starvation';
  if (thirsty) return 'thirst';
  return worst ? hurtCause() : 'unknown';
}
