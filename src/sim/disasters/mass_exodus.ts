/**
 * Mass exodus and martial law (WP10; docs/scenarios/mass_exodus.md). The cities empty onto the county road: a flow that peaks in the first
 * week (refugees, stranded travelers, rogue Guard units), then martial law with a curfew, a food levy and a billeting order. The government
 * posture (gate.government) decides whether the Guard helps or takes. Cozy never forces billeting.
 */
import type { FxCard, KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { kindBag } from '../physical';
import { bulletin, since, sev, takeShare, warnFrac, clamp01, type Line } from './kit';

export interface ExodusState { martialUntil: number; billetDue: boolean; billeted: number; levied: number }
export const exodusOf = (s: GameState): ExodusState => kindBag<ExodusState>(s, 'mass_exodus', () => ({ martialUntil: s.disaster.hitAt + (s.disaster.variant === 'fleeing_front' ? 120 : 75), billetDue: false, billeted: 0, levied: 0 }));
/** The flow of arrivals at the gate by day since the hit: peaks around day 5 and is mostly over by day 14. */
export const flow = (d: number): number => (d < 0 ? Math.exp(-(d + 3) * (d + 3) / 18) * 0.3 : Math.exp(-(d - 5) * (d - 5) / 18));
const martial = (s: GameState): boolean => since(s) >= 0 && s.clock.t < exodusOf(s).martialUntil;

const LINES: Line[] = [
  [0, 3, 'the Guard asks every household on the county road to show a pass; curfew is 8 p.m. to 5 a.m.', 3],
  [1, 14, 'the interstate is a parking lot for forty miles; gas is gone at every exit.', 3],
  [3, 30, 'the Red Cross camp at the fairgrounds is full; the sheriff asks for spare rooms.', 2],
  [8, 60, 'martial law continues: no travel after dark and no firearms in the open.', 2],
  [14, 90, 'the governor says evacuees may begin to go home "when it is safe".', 1],
  [30, 150, 'the Guard is gone from the road; a few of the evacuees are still in the barns.', 1],
];

export const fx: KindFx = {
  onWarning: () => ['The county road is carrying twice its usual traffic: cars with mattresses on the roof, headed away from the city. Fill the tank and the water barrels.'],
  onHit: () => ['The governor has declared martial law: curfew at 8 p.m., passes at every checkpoint, and the Guard may requisition food, vehicles and rooms.'],
  daily(s, ctx) {
    const E = exodusOf(s), out: string[] = [];
    // the food levy under martial law: a share of the pantry every 14 days from day 5, unless the posture is help
    if (martial(s) && ctx.day >= 5 && (ctx.day - 5) % 14 === 0 && ctx.once(`levy_${ctx.day}`) && s.gate.government === 'hindrance') {
      const n = takeShare(s, ['staples', 'canned'], 0.15 * sev(s)); E.levied += n; out.push(`A Guard truck requisitioned ${n.toFixed(1)} units of food at the end of the drive.`);
    }
    if (martial(s) && ctx.day >= 5 && (ctx.day - 5) % 14 === 0 && s.disaster.difficulty !== 'cozy' && ctx.once(`billet_${ctx.day}`)) E.billetDue = true;
    if (ctx.day === Math.ceil(E.martialUntil - s.disaster.hitAt) && ctx.once('martial_end')) out.push('Martial law is lifted. The checkpoints are gone, and the curfew with them.');
    return out;
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.25 * warnFrac(s) : 1 + 0.5 * flow(since(s)) + 0.2 * (1 - s.disaster.tracks.fuel)),
  encounterWeights(s, { scale, w }) {
    const A = flow(since(s));
    scale('refugees', 1 + 4 * A); scale('stranded', 1 + 2 * A); scale('looters', 1.2); scale('trader', 1.5);
    if (martial(s)) w.push(['requisition', 6 * (1 + 2 * A)], ['patrol', 6]);
  },
  npcMods: s => (martial(s) ? 0.8 : 1),
  serviceMods: s => ({ phone: since(s) < 14 ? 0.9 : 1, grid: since(s) < 30 ? 0.95 : 1 }),
  medical: s => (s.disaster.variant === 'quarantine_flight' && since(s) <= 40 ? { contact: 0.12, spread: 0.02 } : since(s) >= 0 && since(s) <= 21 ? { contact: 0.01, spread: 0.01 } : null),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.3 * clamp01(1 - s.disaster.tracks.fuel) + 0.1 * (martial(s) ? 1 : 0),
  cards(s): FxCard[] {
    const E = exodusOf(s);
    if (!E.billetDue) return [];
    return [{ id: 'exodus_billet', title: 'A Guard sergeant orders you to take evacuees', why: 'Six to twenty people, a spare room, and the food to go with them. Taking them in feeds you more mouths and earns you the county\'s trust.', urgency: 65, acts: [{ label: 'Take them in', choice: 'exodus:take' }, { label: 'Argue and refuse', choice: 'exodus:refuse' }] }];
  },
  choose(s, c) {
    const E = exodusOf(s);
    if (c === 'exodus:take') { E.billetDue = false; E.billeted += 8; takeShare(s, ['staples', 'canned'], 0.1); s.gate.humanity = Math.min(100, s.gate.humanity + 6); s.gate.tookIn += 1; for (const n of s.neighbors) if (n.status === 'home') n.disposition = Math.min(100, n.disposition + 2); return 'Eight evacuees slept in the barn and the spare room; they ate a tenth of the pantry and left in a week with thanks.'; }
    if (c === 'exodus:refuse') { E.billetDue = false; s.gate.humanity = Math.max(0, s.gate.humanity - 4); const fine = Math.min(s.money, 400 * sev(s)); s.money -= fine; return `The sergeant wrote you up: a fine of $${Math.round(fine)}, and the neighbors heard about it.`; }
    return null;
  },
};
