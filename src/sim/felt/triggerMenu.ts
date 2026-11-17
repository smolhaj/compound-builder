/**
 * The Free build / God Mode trigger menu: every kind that has a definition, with every variant, so a tester can start any disaster
 * (the new kinds appear here as soon as WP10 adds their DisasterDef; nothing to edit). Pure so a test can walk it.
 */
import { DISASTERS, type DisasterKind } from '../disaster';
import { FELT_KINDS } from './registry';
import { BLURB } from '../disasterBlurbs';

export interface TriggerChoice { kind: DisasterKind; name: string; blurb: string; variants: Array<{ id: string; name: string }> }

/** Kinds in registry order, then any defined kind the registry has not heard of (so a new kind is never hidden). */
export function triggerChoices(): TriggerChoice[] {
  const defined = Object.keys(DISASTERS) as DisasterKind[];
  const order = [...FELT_KINDS.filter(k => (defined as string[]).includes(k)), ...defined.filter(k => !(FELT_KINDS as string[]).includes(k))] as DisasterKind[];
  return order.map(kind => ({ kind, name: DISASTERS[kind]!.name, blurb: BLURB[kind] ?? '', variants: DISASTERS[kind]!.variants.map(v => ({ id: v.id, name: v.name })) }));
}

/** Kinds that have a felt spec but no DisasterDef yet (cannot be triggered until WP10 adds them). */
export const untriggerable = (): string[] => FELT_KINDS.filter(k => !(k in DISASTERS));
