/**
 * Voices for the human moments the battle sim marks with an event (a reload, a jam, a man frozen with fear, a friend covered or dragged, a flare, scouts,
 * a decoy, an ambush, a crew pulling out) when the sim has not already put a line in that person's mouth at that moment. Pure; one picker for the scene, so nothing
 * repeats (sim/raidDialogue.ts `LineDirector`). Nothing here changes what happens.
 */
import type { Battle, BattleEvent } from './battleTypes';
import type { LineDirector, Ctx } from './raidDialogue';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function voiceMoments(b: Battle, dir: LineDirector, nameOf: (unitId: string) => string | undefined = () => undefined): Battle {
  dir.noteAll(b); dir.noteUnits(b.units);
  const side = new Map(b.units.map(u => [u.id, u.side]));
  const spoke = new Map<string, number[]>();
  for (const e of b.events) if (e.kind === 'say' && e.who) spoke.set(e.who, [...(spoke.get(e.who) ?? []), e.t]);
  const out: BattleEvent[] = [];
  const dead = new Map<string, number>();
  for (const e of b.events) if (e.kind === 'death') dead.set(e.unit, e.t);
  const say = (t: number, unit: string | undefined, ctx: Ctx, vars?: Record<string, string>, variants?: string[]) => {
    if (!unit || !side.has(unit) || (dead.get(unit) ?? Infinity) <= t) return;
    if ((spoke.get(unit) ?? []).some(x => Math.abs(x - t) < 1.6)) return;
    const text = dir.pick(side.get(unit) === 'home' ? 'defender' : 'raider', ctx, { speaker: unit, vars, variants });
    if (!text) return;
    spoke.set(unit, [...(spoke.get(unit) ?? []), t]);
    out.push({ t: r2(t), kind: 'say', text, who: unit, ctx });
  };
  const kinName = (unit: string) => b.units.find(u => u.id === unit)?.traits?.kin[0]?.name;
  for (const e of b.events) {
    switch (e.kind) {
      case 'reload': say(e.t + 0.1, e.unit, 'reload'); break;
      case 'jam': say(e.t + 0.1, e.unit, 'jam'); break;
      case 'panic': if (e.how === 'freeze') { const n = e.kin ? kinName(e.unit) : undefined; say(e.t + 0.3, e.unit, 'panic_freeze', n ? { n } : undefined, e.kin && n ? ['kin'] : undefined); } break;
      case 'heroic': say(e.t + 0.2, e.unit, e.act === 'cover' ? 'heroic_cover' : e.act === 'drag' ? 'heroic_drag' : 'heroic_avenge', e.for ? { n: nameOf(e.for) ?? kinName(e.unit) ?? 'friend' } : undefined); break;
      case 'scout': say(e.t + 1.2, e.units[0], 'scouting'); break;
      case 'flare': say(e.t + 0.2, e.by, 'flare_up'); { const h = b.units.find(u => u.side === 'home' && !u.civilian && !u.machine && !u.bystander); say(e.t + 1.6, h?.id, 'flare_up'); } break;
      case 'diversion': say(e.t + 0.4, e.decoys[0], 'decoy'); say(e.t + 2.2, e.pulled[0] ?? b.units.find(u => u.side === 'home' && !u.civilian && !u.machine)?.id, 'decoy'); break;
      case 'ambush': say(e.t + 0.2, e.by, 'ambush_cry'); { const h = b.units.find(u => u.side === 'home' && !u.civilian && !u.machine && u.id !== e.unit); say(e.t + 1.4, h?.id, 'ambush_cry'); } break;
      case 'withdraw': say(e.t + 0.3, e.units[0], 'pull_out'); break;
      default: break;
    }
  }
  if (!out.length) return b;
  return { ...b, events: [...b.events, ...out].sort((p, q) => p.t - q.t) };
}
