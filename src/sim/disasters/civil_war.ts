import { asKind, type KindFx } from '../disasterFx';
import { FACTION, FRONT, REQ, dipTo, newFront, requisitionDue, rollHolder, stepFront, warPrice, otherFaction } from '../occupation';
import { mulberry32 } from '../rng';
import { fxOf, hasPass, labelsFor, makeCard, resolveCard, since } from '../orderEncounters';
import { ensureFlags, frontReprisal, informantToday, neighborFires, returnees, shelterTick, sniperDay, sniperStart, tollOnRuns } from '../orderWorld';
import { dayIndex } from '../state';

const initFront = (s: Parameters<NonNullable<KindFx['onHit']>>[0]) => {
  const f = fxOf(s);
  if (!f.front) f.front = newFront(rollHolder(mulberry32(s.seed * 5273 + 11), s.site.region), 0);
  f.standing ??= { compact: 50, alliance: 50 }; f.collab ??= { compact: 0, alliance: 0 };
  ensureFlags(s, f);
  f.post = true;
  return f;
};
const reqDue = (s: Parameters<NonNullable<KindFx['onHit']>>[0]) => { const f = fxOf(s); return since(s) >= 14 && requisitionDue(since(s), f.lastReq ?? -1, s.disaster.difficulty ?? 'standard', REQ.FIRST) && (f.front?.contested ?? 0) === 0; };
const draftDue = (s: Parameters<NonNullable<KindFx['onHit']>>[0]) => { const f = fxOf(s), d = since(s); return s.disaster.difficulty !== 'cozy' && d >= 30 && (f.lastDraft === undefined || d - f.lastDraft >= 30); };

/** Civil war (WP3, docs/scenarios/civil_war.md): a weekly front-line holder, checkpoints, requisition and the draft, a sniper on the ridge, deserters. */
export const fx: KindFx = {
  onHit(s) {
    const f = initFront(s), h = f.front!.holder;
    return [`${FACTION[h].name[0].toUpperCase() + FACTION[h].name.slice(1)} holds the town. ${FACTION[otherFaction(h)].name[0].toUpperCase() + FACTION[otherFaction(h)].name.slice(1)} holds the passes. A post has gone up on the county road within two miles.`];
  },
  daily(s, ctx) {
    const f = initFront(s), out: string[] = [], front = f.front!;
    const was = front.holder, stay = s.disaster.variant === 'partition' ? FRONT.STAY_PARTITION : FRONT.STAY;
    const step = stepFront(front, ctx.day, ctx.r, stay);
    if (step === 'contest') { out.push(`The front is moving: the shooting is close, and the power and the phone are out for a few days. ${FACTION[front.to!].short} is coming.`); out.push(...sniperStart(s, ctx, true)); }
    if (step === 'flipped') { out.push(`${FACTION[front.holder].name[0].toUpperCase() + FACTION[front.holder].name.slice(1)} holds the town now. New rules, new papers.`); out.push(...frontReprisal(s, ctx, was)); }
    if (f.pass && f.pass.faction && f.pass.faction !== front.holder) { f.pass = undefined; }
    out.push(...sniperStart(s, ctx), ...sniperDay(s, ctx), ...neighborFires(s, ctx), ...tollOnRuns(s, ctx), ...returnees(s));
    // a neighbor of the other flag is talking: the next visit has its informant (p 0.15 a day per hostile neighbor)
    informantToday(s, ctx);
    out.push(...shelterTick(s, ctx, 0.01 + (informantToday(s, ctx) ? 0.04 : 0)));
    // the clocks bring the visits: the next requisition and the next draft notice are due, so the gate sees them the day they come
    const g = s.gate;
    if ((reqDue(s) || draftDue(s)) && !g.pending && !g.incoming) g.next = Math.min(g.next < 0 ? dayIndex(s.clock.t) : g.next, dayIndex(s.clock.t));
    return out;
  },
  serviceMods(s) {
    const c = fxOf(s).front?.contested ?? 0;
    if (c <= 0) return {};
    const t = s.disaster.tracks;
    return { grid: dipTo(t.grid, FRONT.DIP_LEVEL), phone: dipTo(t.phone, FRONT.DIP_LEVEL) };
  },
  encounterWeights(s, { w, p, scale }) {
    const f = initFront(s), d = Math.max(0, since(s)), month6 = Math.min(1, d / 180);
    const diff = s.disaster.difficulty ?? 'standard';
    // militia 25 at the hit falling to 10 by month 6 (the generic mix already holds one; replace it)
    w.push(['militia', (25 - 15 * month6) * (0.4 + p.fortress / 100 + p.visibility / 150)]);
    w.push(['patrol', 8]);
    scale('requisition', 0); scale('refugees', 2); scale('gang', 0.7); scale('trader', 0.3);
    if (f.post && !hasPass(s)) w.push([asKind('checkpoint_stop'), 16]);
    if (reqDue(s)) w.push([asKind('quota'), 400]);
    if (draftDue(s)) w.push([asKind('draft_notice'), 300]);
    if (d >= 60) w.push([asKind('deserters'), (3 + 6 * month6) * (diff === 'cozy' ? 0.5 : 1)]);
    if (!f.shelter) w.push([asKind('fugitive'), 6]);
  },
  makeExtra: (s, kind, r, id, day) => makeCard(s, kind, r, id, day),
  resolveExtra: (s, e, stance) => resolveCard(s, e, stance),
  stanceLabels: (s, e) => labelsFor(s, e),
  priceMods: s => (s.clock.t < s.disaster.hitAt ? 1 : warPrice(since(s), (fxOf(s).front?.contested ?? 0) > 0)),
  npcMods: () => 1.3,
  radioBulletins(s, ctx) {
    const f = fxOf(s), d = ctx.day, r = ctx.r, h = f.front?.holder ?? 'alliance';
    const kinds: Array<[string, 0 | 1 | 2 | 3]> = [
      [`Compact radio: "${3 + Math.floor(d / 3)} enemy dead, ${1 + Math.floor(d / 9)} of ours. The valley is secure." Alliance radio, same hour: "${5 + Math.floor(d / 2)} of ours, a Compact column in flight."`, 1],
      [`a cease-fire announced for noon, and denied by two o'clock.`, 2],
      [`a ham net: "Compact column on Route 12. Alliance trucks at the grain depot."`, 2],
      [`CB: "checkpoint at the grain elevator, no papers no pass."`, 1],
      [`a pastor reading the list of the missing, forty names and the same three surnames.`, 3],
      [`${FACTION[h].short} announces the draft age is unchanged. The other side says it has no draft. Both are lying.`, 2],
    ];
    if ((f.sniperUntil ?? -1) >= d && r() < 0.3) return { text: 'a shooter on the ridge above the Henderson road: stay under cover, move after dark.', tone: 2 };
    const [text, tone] = kinds[Math.floor(r() * kinds.length)];
    return { text, tone };
  },
  look: (s, l) => ({ convoy: Math.max(l.convoy, 0.6), traffic: Math.max(l.traffic, 0.35), flashes: Math.max(l.flashes, 0.35 * l.k), smoke: Math.max(l.smoke, 0.3 * l.k), fireGlow: Math.max(l.fireGlow, ((fxOf(s).front?.contested ?? 0) > 0 ? 0.6 : 0.2) * l.k) }),
  oasisWeight: () => 0.2,
};
