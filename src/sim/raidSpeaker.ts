import type { Battle } from './battleTypes';

/**
 * Who is speaking, for the caption of a raid line (pure). The leader is "Their leader"; every other raider is numbered by his place in the crew, so two lines from
 * two different men never read as one voice ("Raider 3", "Raider 5"). A lone raider keeps the plain word.
 */
export function raiderLabel(b: Pick<Battle, 'units'>, id: string): string {
  const crew = b.units.filter(u => u.side === 'raider' && !u.machine && !u.civilian && !u.bystander);
  const u = crew.find(x => x.id === id);
  if (!u) return 'Raider';
  if (u.leader || id === 'r0') return 'Their leader';
  const rank = crew.filter(x => !(x.leader || x.id === 'r0')).findIndex(x => x.id === id);
  return crew.length <= 2 || rank < 0 ? 'Raider' : `Raider ${rank + 1}`;
}
