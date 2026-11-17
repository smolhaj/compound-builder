/**
 * Global famine (WP10; docs/scenarios/global_famine.md). The harvests fail everywhere at once, the world's money still works for a while
 * and buys nothing. The county grows less (the existing famine growth factor), the state levies grain, strangers come for food, and
 * neighbors go hungry. Seed and stored grain are the game.
 */
import type { FxCard, KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { kindBag } from '../physical';
import { bulletin, shelf, since, sev, takeShare, warnFrac, clamp01, type Line } from './kit';

export interface FamineState { levied: number; hid: boolean; lastLevy: number; due: boolean }
export const famineOf = (s: GameState): FamineState => kindBag<FamineState>(s, 'global_famine', () => ({ levied: 0, hid: false, lastLevy: -1, due: false }));
/** The county's famine strength (0 to ~0.8): the growth cut `1 - 0.35 * famine` the threats module also uses, by variant. */
export function famineLevel(variant: string, day: number, fate: string): number {
  const top = variant === 'export_ban' ? 0.35 : variant === 'monoculture_blight' ? 0.5 : 0.65;
  const ramp = clamp01(day / 60), fade = fate === 'full' ? clamp01(1 - (day - 330) / 330) : 1;
  return top * ramp * fade;
}
const level = (s: GameState): number => (since(s) < 0 ? 0 : famineLevel(s.disaster.variant, since(s), s.disaster.fate));

const LINES: Line[] = [
  [0, 5, 'flour is rationed to five pounds a family; the mill in town has stopped taking cash.', 3],
  [3, 60, 'the state will levy a fifth of stored grain every 90 days; "hiding grain is hoarding".', 2],
  [10, 200, 'the church kitchen fed four hundred on Sunday and turned away more.', 2],
  [30, 400, 'seed corn sells for more than gold; guard your seed.', 1],
  [60, 500, 'a grain trader came through: fair price in spring, extortion by fall.', 1],
  [120, 700, 'the first neighbors have gone hungry for a week; the county asks for work parties.', 2],
];

export const fx: KindFx = {
  onWarning: () => ['Export bans and a failed harvest overseas: flour is up 30% and the farm store is out of seed. Buy staples and seed now.'],
  onHit: s => [s.gate.government === 'help' ? 'The state has opened distribution points and will drop a ration at the end of the road.' : 'The state has declared a grain emergency: expect a levy on stored grain every 90 days.'],
  daily(s, ctx) {
    const F = famineOf(s), out: string[] = [];
    // the state levy, every 90 days from day 30: a fifth of the grain, unless it is hidden (a hidden store is searched for later)
    if (ctx.day >= 30 && (ctx.day - 30) % 90 === 0 && ctx.once(`famine_levy_${ctx.day}`)) {
      if (s.gate.government === 'hindrance') { F.due = true; F.lastLevy = ctx.day; }
      else if (ctx.day <= 210) { s.stock.staples += 2; out.push('A state ration drop: two bags of grain left at the end of the road.'); }
    }
    if (F.due && ctx.day - F.lastLevy >= 5) { F.due = false; const take = takeShare(s, ['staples'], 0.2 * sev(s)); F.levied += take; out.push(`The grain levy was taken at the gate: ${take.toFixed(1)} bags.`); }
    return out;
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.5 * warnFrac(s) : 1 + 0.9 * level(s) + 0.5 * (1 - shelf(s))),
  supplyMods: s => ({ grow: 1 - 0.35 * level(s) }),
  encounterWeights(_s, { scale }) { scale('refugees', 3); scale('kin', 3); scale('looters', 1.5); scale('gang', 1.5); scale('requisition', 2); scale('trader', 0.7); },
  npcMods: s => 1 + 1.2 * level(s),
  serviceMods: () => ({ banks: 0.95 }),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.6 * level(s),
  cards(s): FxCard[] {
    const F = famineOf(s);
    if (!F.due) return [];
    return [{ id: 'famine_levy', title: 'The grain levy is due', why: 'A state truck will take a fifth of the stored grain in five days. A hidden store may be searched for.', urgency: 70, tone: 'alarm', acts: [{ label: 'Pay the levy', choice: 'famine:pay' }, { label: 'Hide some of the grain', choice: 'famine:hide' }] }];
  },
  choose(s, c) {
    const F = famineOf(s);
    if (c === 'famine:pay') { F.due = false; const take = takeShare(s, ['staples'], 0.2); F.levied += take; s.gate.humanity = Math.min(100, s.gate.humanity + 1); return `You paid the levy: ${take.toFixed(1)} bags of grain went to the county.`; }
    if (c === 'famine:hide') { F.due = false; F.hid = true; const found = (s.seed + Math.floor(s.clock.t)) % 10 < 4; const take = takeShare(s, ['staples'], found ? 0.35 : 0.08); F.levied += take; s.gate.humanity = Math.max(0, s.gate.humanity - 2); return found ? 'They searched the barn and found the false wall: a third of the grain went, and a warning.' : 'You hid some of the grain under the floor; the truck took a token share.'; }
    return null;
  },
};
