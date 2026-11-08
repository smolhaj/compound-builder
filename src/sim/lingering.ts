/**
 * Wounds and nerves that last into the next fight (coordinator decision 2): a sling, a limp, a head that is not right, and the weeks of shaken aim
 * after a bad night. Pure. sim/battle.ts reads `woundFx` for every defender and `nervesAim` from the mind (sim/mind.ts), so a person hurt in one raid
 * is a weaker fighter in the next until the wound heals (`needs.hurt` shrinks as it heals) and the trauma fades.
 */
export interface WoundFx {
  /** Multiplier on accuracy (an arm in a sling shoots worse). */
  acc: number;
  /** Multiplier on the time to get to a post (a leg wound limps). */
  limp: number;
  /** Multiplier on speed under fire (carried as the same limp for movement). */
  speed: number;
}

/** What a list of open wounds does to a fighter. Reads the words the wound was logged with (battle.ts applyCasualties). */
export function woundFx(hurt: ReadonlyArray<{ what: string; sev: number }> | undefined): WoundFx {
  let acc = 1, limp = 1;
  for (const h of hurt ?? []) {
    const w = h.what.toLowerCase(), sev = Math.max(0, Math.min(100, h.sev));
    if (/\barm\b|hand|shoulder|grazed/.test(w) && !/leg/.test(w)) acc *= 1 - Math.min(0.35, sev / 190);
    else if (/\bleg\b|knee|foot|ankle/.test(w)) limp *= 1 + Math.min(1.1, sev / 70);
    else if (/head|concuss/.test(w)) acc *= 1 - Math.min(0.2, sev / 300);
    else if (/body|chest|rib|blast|shrapnel/.test(w)) { acc *= 1 - Math.min(0.15, sev / 400); limp *= 1 + Math.min(0.4, sev / 200); }
  }
  return { acc: Math.max(0.5, acc), limp: Math.min(3, limp), speed: 1 / Math.min(3, limp) };
}

/** How many points of skill the strain of the last weeks takes (0-1.4): trauma and stress spoil the aim. */
export function nervesAim(psyche: { trauma?: number; stress?: number } | undefined): number {
  if (!psyche) return 0;
  return Math.min(1.4, (psyche.trauma ?? 0) / 100 * 1.1 + Math.max(0, (psyche.stress ?? 0) - 60) / 40 * 0.4);
}
