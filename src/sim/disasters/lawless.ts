import { asKind, type KindFx } from '../disasterFx';
import { lawlessMix, lawlessPrice, titheDue, variantOf } from '../lawlessMath';
import { fxOf, hasPass, labelsFor, makeCard, resolveCard, since } from '../orderEncounters';
import { committeeTick, salvageFound, tollOnRuns } from '../orderWorld';

/** The end of the rule of law (WP3, docs/scenarios/lawless.md): the walkout, the blackout of order and the drift; the toll at the bridge, the posse's tithe, the watch committee and the empty houses. */
export const fx: KindFx = {
  legacy: { npcs: 'neighborLife / locals: groups form when law < 0.5, neighbors raid' },
  onHit: s => { fxOf(s); return ['Nobody is coming.']; },
  daily(s, ctx) {
    const f = fxOf(s), d = ctx.day, out: string[] = [];
    // men take the bridge on the county road about week three
    if (!f.post && d >= 21 && ctx.once('bridge-held')) { f.post = true; out.push('Men with deer rifles have taken the bridge on the county road. They want a toll to cross.'); }
    out.push(...tollOnRuns(s, ctx), ...salvageFound(s), ...committeeTick(s, ctx));
    return out;
  },
  encounterWeights(s, { w, p, scale }) {
    const f = fxOf(s), d = Math.max(0, since(s)), v = variantOf(s.disaster.variant);
    const m = lawlessMix(d, s.disaster.difficulty ?? 'standard', s.site.region, v);
    scale('looters', m.looters); scale('gang', m.gang); scale('militia', m.militia); scale('trader', m.trader); scale('refugees', m.refugees);
    const prot = (f.protectedUntil ?? -1) >= d ? 0.5 : (f.defiantUntil ?? -1) >= d ? 1.5 : 1;
    scale('looters', prot); scale('gang', prot);
    const post = !!f.post && !hasPass(s);
    if (post) w.push([asKind('tollkeeper'), m.tollkeeper * (0.5 + p.visibility / 100)]);
    if (m.posse > 0 && (f.posseBrokenUntil ?? -1) < d && titheDue(d, f.lastTithe ?? -1)) w.push([asKind('posse'), 60 * (0.5 + p.visibility / 100)]);
    if (m.watch_pact > 0 && !f.committee?.length && (f.lastPact === undefined || d - f.lastPact > 20) && s.neighbors.filter(n => n.status === 'home').length >= 2) w.push([asKind('watch_pact'), m.watch_pact]);
    if (m.salvage > 0) w.push([asKind('salvage'), m.salvage]);
  },
  makeExtra: (s, kind, r, id, day) => makeCard(s, kind, r, id, day),
  resolveExtra: (s, e, stance) => resolveCard(s, e, stance),
  stanceLabels: (s, e) => labelsFor(s, e),
  priceMods: s => (s.clock.t < s.disaster.hitAt ? 1 : lawlessPrice(since(s), s.disaster.tracks.banks)),
  // a held bridge slows what crosses it: deliveries run at 60% without a pass
  serviceMods: s => (fxOf(s).post && !hasPass(s) ? { deliveries: 0.6 } : {}),
  npcMods: () => 1.25,
  radioBulletins(s, ctx) {
    const f = fxOf(s), d = ctx.day, v = variantOf(s.disaster.variant), r = ctx.r;
    if (f.deal !== undefined && r() < 0.5) return { text: 'the Maple Road committee has an agreement with the posse.', tone: 1 };
    if (f.post && r() < 0.3) return { text: 'a trucker on the CB: "toll at mile 41, two gallons or a rifle."', tone: 1 };
    const early = ['the sheriff\'s last message: "Please be patient. Stay in your homes."', 'a county commissioner meeting that broke up in shouting; the feed went to music.', 'a church network reading a watch roster by the half hour.'];
    const mid = ['a ham net naming which towns hold and which have fallen.', 'smoke over the town again tonight, and a rumor that the pharmacy is empty.', 'somebody says the posse took the feed store and a man was shot in the lot.'];
    const drift = ['a station that used to be the county\'s says the deputies are "working to restore order", for the ninth week running.', 'the price of a gallon of gas, in rounds of .22 this time.'];
    const list = v === 'drift' ? drift : d < 20 ? early : mid;
    return { text: list[Math.floor(r() * list.length)], tone: d < 20 ? 1 : 2 };
  },
  look: (_s, l) => ({ smoke: Math.max(l.smoke, 0.25 * l.k), haze: Math.max(l.haze, 0.1 * l.k), fireGlow: Math.max(l.fireGlow, 0.1 * l.k), traffic: l.traffic * 0.6 }),
  oasisWeight: () => 0.25,
};
