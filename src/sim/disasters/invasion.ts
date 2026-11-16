import { asKind, type KindFx } from '../disasterFx';
import { REQ, TIER_NAME, cashMultiplier, decreePrice, maxTier, newFront, requisitionDue, rollTierClock, stepFront, tierAt } from '../occupation';
import { mulberry32 } from '../rng';
import { fxOf, hasPass, labelsFor, makeCard, resolveCard, since } from '../orderEncounters';
import { ambushWeek, curfewTick, returnees, shelterTick, tollOnRuns } from '../orderWorld';
import { dayIndex } from '../state';

type S = Parameters<NonNullable<KindFx['onHit']>>[0];
const init = (s: S) => {
  const f = fxOf(s);
  if (!f.clock) {
    const r = mulberry32(s.seed * 6151 + 17);
    f.clock = rollTierClock(r, s.disaster.difficulty ?? 'standard'); f.maxTier = maxTier(s.disaster.difficulty ?? 'standard', s.disaster.variant, s.disaster.fate ?? 'partial'); f.tier = 1; f.post = true;
    if (s.disaster.variant === 'contested') f.front = newFront('alliance', 0);
  }
  return f;
};
const reqDue = (s: S) => { const f = init(s), d = since(s); return d >= 7 && requisitionDue(d, f.lastReq ?? -1, s.disaster.difficulty ?? 'standard', 7) && (!f.front || f.front.holder === 'alliance'); };
const laborDue = (s: S) => { const f = init(s), d = since(s); return (f.tier ?? 1) >= 3 && (f.lastDraft === undefined || d - f.lastDraft >= 60); };

/** Invasion (WP3, docs/scenarios/invasion.md): checkpoints and requisitions at once; curfew and papers from day 60-90; informants and forced labor from day 150-240; the currency decree; partisans and reprisals. */
export const fx: KindFx = {
  onHit(s) { init(s); return ['Proclamation No. 1: weapons are to be surrendered by Friday, papers are required on the county roads, requisition orders will be issued.']; },
  daily(s, ctx) {
    const f = init(s), out: string[] = [], d = ctx.day;
    const was = f.tier ?? 1, now = tierAt(d, f.clock!, f.maxTier ?? 1);
    if (now !== was) { f.tier = now; out.push(`Tier ${now}: ${TIER_NAME[now]}.${now === 2 ? ' Curfew from eight to five. Identity cards. House searches.' : ' Informants are paid. One adult from each household for the labor detail. A notice on the church door lists hostages.'}`); }
    if (f.front) { const st = stepFront(f.front, d, ctx.r, 0.85); if (st === 'contest') out.push('Fighting on the river road: the occupiers are being pushed back, for now.'); if (st === 'flipped') out.push(f.front.holder === 'alliance' ? 'The occupiers are back in the town.' : 'The occupiers have withdrawn from the valley. For now.'); }
    if (d === 10 && ctx.once('decree-50')) out.push('Decree: old dollars are accepted at half their value.');
    if (d === 60 && ctx.once('decree-25')) out.push('Decree: old dollars are accepted at a quarter of their value. Occupation money only for the ration card.');
    out.push(...tollOnRuns(s, ctx), ...returnees(s), ...shelterTick(s, ctx, 0.01 + (f.tier ?? 1) * 0.015 + (f.known ? 0.02 : 0)), ...ambushWeek(s, ctx, f.tier ?? 1), ...curfewTick(s, ctx));
    const g = s.gate;
    if ((reqDue(s) || laborDue(s)) && !g.pending && !g.incoming) g.next = Math.min(g.next < 0 ? dayIndex(s.clock.t) : g.next, dayIndex(s.clock.t));
    return out;
  },
  encounterWeights(s, { w, p, scale }) {
    const f = init(s), d = Math.max(0, since(s)), tier = f.tier ?? 1;
    w.push(['patrol', 20 * (0.5 + p.visibility / 100) * (d > 30 ? 0.6 : 1)]);
    scale('requisition', 0); scale('looters', 0.6); scale('gang', 0.5); scale('trader', 0.5); scale('refugees', 1.8);
    if (!hasPass(s)) w.push([asKind('checkpoint_stop'), 18]);
    if (reqDue(s)) w.push([asKind('quota'), 400]);
    if (laborDue(s)) w.push([asKind('draft_notice'), 300]);
    if (tier >= 2) { w.push([asKind('informant'), 7]); if (d >= 40) w.push([asKind('partisan'), 8]); }
    w.push([asKind('lost_soldier'), 3], [asKind('fugitive'), f.shelter ? 0 : 5]);
    if (f.reprisalDue !== undefined && tier >= 1) w.push([asKind('reprisal'), 500]);
  },
  makeExtra: (s, kind, r, id, day) => makeCard(s, kind, r, id, day),
  resolveExtra: (s, e, stance) => resolveCard(s, e, stance),
  stanceLabels: (s, e) => labelsFor(s, e),
  priceMods: s => (s.clock.t < s.disaster.hitAt ? 1 : decreePrice(since(s))),
  // every truck is stopped at the bridge: deliveries run at 60% without a pass
  serviceMods: s => (!hasPass(s) ? { deliveries: 0.6 } : {}),
  npcMods: () => 1.2,
  radioBulletins(s, ctx) {
    const f = init(s), d = ctx.day, r = ctx.r, tier = f.tier ?? 1;
    const lines: Array<[string, 0 | 1 | 2 | 3]> = [
      ['the occupier\'s Proclamation No. 1, read in two languages: weapons surrendered by Friday, papers on every road.', 2],
      [`ration notices: ${tier === 1 ? 'flour one sack a family' : 'bread by card on odd days'}; old dollars at ${Math.round(cashMultiplier(d) * 100)}%.`, 1],
      ['a quiet voice at night, the Free Valley: "the blue goat sleeps at noon." Nothing else.', 2],
      [tier >= 2 ? 'the curfew: eight p.m. to five a.m., enforced.' : 'checkpoints on the bridge and the crossroads; papers required to cross the county line.', 2],
    ];
    if (tier >= 3) lines.push(['a list of hostages read in the town square, forty-one names.', 3]);
    if ((f.resistance ?? 0) > 0 && !f.radioSignal) f.radioSignal = true;
    const [text, tone] = lines[Math.floor(r() * lines.length)];
    return { text, tone };
  },
  look: (_s, l) => ({ convoy: Math.max(l.convoy, 0.7), traffic: Math.max(l.traffic, 0.4), flashes: Math.max(l.flashes, 0.25 * l.k), fireGlow: Math.max(l.fireGlow, 0.15 * l.k) }),
  oasisWeight: () => 0.25,
};
void REQ;
