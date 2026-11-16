/**
 * Mega-earthquake (WP6; docs/scenarios/mega_quake.md). The variant and shaking band come from the region; the main shock rolls every
 * structure (finished and part-built) through structureDamage.ts; Omori aftershocks keep re-rolling the cracked and the half-built for a
 * year; crews are booked for `3 x (1 + 8 x share)` days; earthquake is excluded from ordinary insurance (a rider is a peacetime choice).
 * The first two weeks are kind (neighbors, strangers in need), the third is the hard one.
 */
import type { KindFx } from '../disasterFx';
import type { GameState, Structure } from '../state';
import { TRACKS, tension, type Track } from '../disaster';
import { isFinished } from '../construction';
import { pendingFixes } from '../improvements';
import { addFix } from '../improvements';
import { dropRoadBridge, roadBridgeOf } from '../roadFx';
import { floodCandidates } from '../terrainFx';
import { treated } from '../sanitation';
import { startCase } from '../medical';
import { isHome } from '../blueprints';
import { DIFFICULTY } from '../difficulty';
import { applyLevel, hitUnfinished, kindBag, loseFood, physicalOf, reachable, retrofitsOf, setRepairLead, unfinishedWalls } from '../physical';
import { quakeBase, resistance, rollLevel, type DamageLevel } from '../structureDamage';
import { BAND_SEV, BAND_SHARE, MAIN_MAG, TAIL_DAYS, VARIANT_OF, aftershockMag, bandFor, bandMmi, omoriP, redTags, shakeSeconds, surge, type Band, type QuakeVariant } from '../quake';

export interface QuakeState { variant: QuakeVariant; band: Band; mag: number; mmi: number; seconds: number; strong: number; lastMag: number; flue: Record<string, true>; rescued: number }
const q = (s: GameState): QuakeState => kindBag<QuakeState>(s, 'mega_quake', () => {
  const r = (k: number) => ((Math.sin(s.seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const band = bandFor(s.site.region, r(1));
  return { variant: VARIANT_OF[s.site.region], band, mag: MAIN_MAG[VARIANT_OF[s.site.region]], mmi: bandMmi(band, r(2)), seconds: shakeSeconds(band, r(3)), strong: 0, lastMag: 0, flue: {}, rescued: 0 };
});
export const quakeOf = q;
const since = (s: GameState) => s.clock.t - s.disaster.hitAt;
const name = (st: Structure) => st.kind.replace(/_/g, ' ');

/** Roll the buildings against a base hazard. `onlyHurt`: aftershocks reach only what is already cracked and what is half built. */
function rollAll(s: GameState, base: number, r: () => number, why: string, onlyHurt: boolean): string[] {
  const P = physicalOf(s), out: string[] = [], minor: string[] = [];
  for (const st of reachable(s)) {
    const fin = isFinished(st), rec = P.damage[st.id];
    if (onlyHurt && !(rec || unfinishedWalls(st))) continue;
    const soft = floodCandidates(s, [st]).length > 0;
    const res = resistance('quake', st.kind, { retrofits: retrofitsOf(s, st.id), grade: st.grade, soft, unfinished: !fin });
    let level = rollLevel(base, res, r()) as DamageLevel;
    if (level >= 1 && Math.abs(st.grade ?? 0) > 0.25 && r() < 0.15) level = Math.min(3, level + 1) as DamageLevel;
    if (!level) continue;
    if (!fin) { const l = hitUnfinished(st, level); if (l) out.push(l); continue; }
    if (rec && rec.level >= level) continue;
    const line = applyLevel(s, st, level, 'quake', why);
    if (level === 1) minor.push(name(st)); else if (line) out.push(line);
  }
  if (minor.length) out.push(`${why} ${minor.length > 4 ? `${minor.length} buildings are` : `The ${minor.join(', the ')} ${minor.length > 1 ? 'are' : 'is'}`} cracked: repair jobs are in Projects.`);
  return out;
}

export const fx: KindFx = {
  legacy: {},
  onWarning(s) { return ['A swarm of small quakes under the valley: the dog will not come in and the well has gone cloudy. Bolting the sill and strapping the water heater costs a weekend, if it comes to nothing.'].concat(q(s).band === 'C' ? [] : []); },
  onHit(s) {
    const Q = q(s), out: string[] = [];
    const share = BAND_SHARE[Q.band];
    setRepairLead(s, share, 'earthquake');
    out.push(`The ground rolled for ${Math.round(Q.seconds / 60 * 10) / 10 || 1} minutes (about magnitude ${Q.mag.toFixed(1)}, shaking ${Q.mmi.toFixed(1)} here). ${Q.band === 'A' ? 'Chimneys are down across the county.' : Q.band === 'B' ? 'Things fell off shelves and the road is cracked in places.' : 'It was felt, and little more; the shock is in the supply lines.'}`);
    const r = (k: number) => ((Math.sin(s.seed * 4.1 + k * 91.7) * 43758.5453) % 1 + 1) % 1;
    if (Q.band !== 'C' && roadBridgeOf(s) && r(7) < (Q.band === 'A' ? 0.5 : 0.15)) { const l = dropRoadBridge(s); if (!l) out.push('The bridge on the way in has dropped at one end. Nothing with wheels crosses until it is rebuilt.'); }
    // the jars
    const P = physicalOf(s);
    const lost = loseFood(s, (0.1 + 0.2 * r(9)) * BAND_SEV[Q.band] * (P.straps ? 0.4 : 1), ['canned']);
    if (lost > 0.5) out.push(`Jars came off the pantry shelves and broke${P.straps ? ' (the lipped shelves kept most of them)' : ''}.`);
    // neighbors
    const ru = ((): (() => number) => { let i = 20; return () => r(i++); })();
    const base = quakeBase(Q.mmi);
    for (const n of s.neighbors.filter(x => x.status === 'home')) {
      const k = { old_farmer: 1.4, widow: 1.3, loner: 1.2, ranch: 1.0, young_family: 0.9, prepper: 0.6 }[n.kind] ?? 1;
      if (ru() < base * k * 1.3) { out.push(`${n.name[0].toUpperCase() + n.name.slice(1)}${n.name.endsWith('s') ? "'" : "'s"} chimney is in their yard${ru() < 0.3 ? ' and someone is calling from under the porch' : ''}.`); n.disposition = Math.min(100, n.disposition + 2); }
    }
    return out;
  },
  structureDamage(s, ctx) {
    const Q = q(s), out: string[] = [], d = ctx.day;
    if (d === 0 && ctx.once('quake_main')) {
      const base = quakeBase(Q.mmi);
      out.push(...rollAll(s, base, ctx.r, 'The shaking did it.', false));
      // the chimneys fall on their own roll (2x)
      for (const st of s.structures.filter(x => isFinished(x) && isHome(x.kind))) {
        if (rollLevel(base, 2.0 * (retrofitsOf(s, st.id).includes('sill') ? 0.7 : 1), ctx.r()) && addFix(st, { part: 'roof', cond: 'fair', done: 0, hours: 30, supplied: false })) { Q.flue[st.id] = true; out.push(`The ${name(st)}'s chimney is cracked. Do not light the stove until the flue is mended.`); }
      }
      // the family: inside a braced house is safest, running out is worst
      const homeOk = s.structures.some(x => isFinished(x) && isHome(x.kind) && !(physicalOf(s).damage[x.id]?.level === 3));
      for (let i = 0; i < s.people.length; i++) {
        const p = s.people[i], ps = s.personState[i];
        if (!ps || ps.needs.died != null) continue;
        const away = ['gone', 'away', 'town', 'job'].includes(ps.task as string) || !!ps.employed;
        const pHurt = (away ? 0.07 : homeOk ? 0.05 : 0.14) * BAND_SEV[Q.band] * DIFFICULTY[s.disaster.difficulty].price;
        if (ctx.r() < pHurt) {
          const bad = ctx.r() < 0.25;
          if (bad) startCase(s, p.id, 'fracture', 40, { bone: 'leg' }, 'a broken leg from falling masonry'); else startCase(s, p.id, 'wound', 24, {}, 'cuts and bruises from falling glass');
          out.push(`${p.first} was ${bad ? 'caught under something heavy' : 'cut by falling glass'}${away ? ' away from home' : ''}.`);
        }
      }
    } else if (d > 0 && d <= TAIL_DAYS) {
      if (ctx.r() < omoriP(d, Q.band)) {
        const mag = aftershockMag(Q.mag, d, ctx.r());
        Q.strong++; Q.lastMag = mag;
        const base = quakeBase(Q.mmi - (Q.mag - mag) * 0.9) * 0.35 * 1.2;
        const l = rollAll(s, base, ctx.r, `A magnitude ${mag.toFixed(1)} aftershock hit.`, true);
        out.push(l.length ? l[0] : `A magnitude ${mag.toFixed(1)} aftershock rattled the place. Nothing new fell.`, ...l.slice(1));
      }
    }
    // a cracked flue and a lit stove
    for (const [id] of Object.entries(Q.flue)) {
      const st = s.structures.find(x => x.id === id);
      if (!st || !pendingFixes(st).some(f => f.part === 'roof')) { delete Q.flue[id]; continue; }
      if (s.stock.firewood >= 1 && ctx.r() < 0.06) { delete Q.flue[id]; const l = applyLevel(s, st, 2, 'fire', 'The cracked flue started a fire in the roof.'); if (l) out.push(l); }
    }
    return out;
  },
  daily(s, ctx) {
    const Q = q(s), d = ctx.day, out: string[] = [];
    if (d >= 8 && d <= 30 && !treated(s) && Q.band !== 'C') {
      for (let i = 0; i < s.people.length; i++) if (s.personState[i]?.needs.died == null && ctx.r() < 0.012 * BAND_SEV[Q.band]) { if (startCase(s, s.people[i].id, 'dysentery', 30, { src: 'water' })) out.push(`${s.people[i].first} has cramps and the flux: the water mains are broken and the tank was not treated.`); }
    }
    if (d === 21 && ctx.once('quake_hard_week') && Q.band !== 'C') out.push('The third week: the aid trucks are thinning out and the roads are not open. The kindness is wearing off.');
    return out;
  },
  priceMods(s) { return s.clock.t < s.disaster.hitAt ? 1 + 0.05 * tension(s.disaster, s.clock.t) : surge(since(s), q(s).band); },
  serviceMods(s) {
    const sev = BAND_SEV[q(s).band], out: Partial<Record<Track, number>> = {};
    if (sev >= 1) return out;
    for (const t of TRACKS) { const lv = s.disaster.tracks[t]; if (lv > 0.001 && lv < 1) out[t] = (1 - (1 - lv) * sev) / lv; }
    return out;
  },
  npcMods(s) { return 1 + 0.6 * BAND_SEV[q(s).band] * Math.max(0, 1 - since(s) / 90); },
  encounterWeights(s, { scale }) {
    const Q = q(s), d = since(s);
    if (d < 0) return;
    if (d < 14) { scale('looters', 0.4); scale('gang', 0.3); scale('arrival', 1.4); scale('stranded', 1.6); scale('neighbor_help', 1.5); }
    else { const hard = s.disaster.tracks.deliveries < 0.3 && Q.band === 'A'; scale('looters', hard ? 1.4 : 1); scale('gang', 1 + (1 - s.disaster.tracks.law)); }
    if (Q.band === 'A') scale('refugees', 2);
  },
  medical(s) { const d = since(s), Q = q(s); return d >= 8 && d <= 45 && Q.band !== 'C' ? { contact: 0.03, spread: 0.03 * BAND_SEV[Q.band] } : null; },
  radioBulletins(s, ctx) {
    const Q = q(s), d = Math.floor(since(s)), P = BAND_SHARE[Q.band];
    const forecast = Math.round(Math.min(90, 100 * omoriP(d + 1, Q.band)));
    const lines: Array<[string, 0 | 1 | 2 | 3]> = [];
    if (d <= 3) lines.push(['County emergency net: the highway bridge is closed; boil water in the valley; shut off the gas if you smell it.', 2]);
    if (d <= 40 && Q.band !== 'C') lines.push([`USGS: a ${forecast}% chance of a magnitude 5 or larger aftershock tonight. Sleep outside if the house is cracked.`, 2]);
    if (d >= 7 && d <= 60) lines.push([`Inspectors have tagged ${redTags(P, d)} houses red in the county so far.`, 1]);
    if (d >= 14 && d <= 60) lines.push(['Hardware and farm supply are open cash-only. Plywood, tarps and hand pumps go first.', 1]);
    if (d >= 3 && Q.band === 'A') lines.push(['The aid convoys are on the interstate, not the county roads. Neighbors are asked to share.', 1]);
    return lines.length ? (([text, tone]) => ({ text, tone }))(lines[Math.floor(ctx.r() * lines.length)]) : null;
  },
  look(s, look) { const d = since(s), k = Math.max(0, 1 - d / 6); return { haze: Math.max(look.haze, 0.45 * k * BAND_SEV[q(s).band]), fireGlow: Math.max(look.fireGlow, d < 4 && q(s).band === 'A' ? 0.25 : 0) }; },
  oasisWeight(s) { return 0.35 * (1 - Math.min(s.disaster.tracks.deliveries, s.disaster.tracks.fuel)); },
};
