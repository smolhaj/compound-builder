/**
 * Asteroid impact (WP6; docs/scenarios/asteroid.md). The arc is public and numeric (odds, a corridor that narrows, an interceptor); the
 * ground it hits is rolled once from the seed (variant, zone, distance, band); blast bands decide each building's state; the shared winter
 * engine (sim/winter.ts) replaces the single two-year dark; a rare deflection ends the scenario.
 */
import type { KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { FULL } from '../disaster';
import { burnStructure, isFinished } from '../construction';
import { burnChance } from '../fireRisk';
import { emberFactor } from '../housingStyles';
import { emberK } from '../houseHardening';
import { isHome } from '../blueprints';
import { insuranceClaim } from '../paperwork';
import { startCase } from '../medical';
import { DIFFICULTY } from '../difficulty';
import { applyLevel, hitUnfinished, kindBag, physicalOf, reachable, retrofitsOf, setRepairLead } from '../physical';
import { resistance, rollLevel, type DamageLevel } from '../structureDamage';
import { arcAt, blastHazard, panic, rollImpact, type Impact } from '../impactZone';
import { coldIndex, winterAt } from '../winter';

export interface AsteroidState { impact: Impact; evacuated: boolean; deflected: boolean; shifted: boolean }
export const asteroidOf = (s: GameState): AsteroidState => kindBag<AsteroidState>(s, 'asteroid', () => ({ impact: rollImpact(s.seed, s.site.region, s.disaster.difficulty), evacuated: false, deflected: false, shifted: false }));
const since = (s: GameState) => s.clock.t - s.disaster.hitAt;
export const daysLeft = (s: GameState): number => s.disaster.hitAt - s.clock.t;
export const arcOf = (s: GameState) => arcAt(daysLeft(s), asteroidOf(s).impact, DIFFICULTY[s.disaster.difficulty].warn);

export const fx: KindFx = {
  legacy: { economy: 'finance.ts: the market crash', atmosphere: 'collapseLook: flash, dust, a two-year dark' },
  onWarning(s) { const A = asteroidOf(s); return [arcAt(daysLeft(s), A.impact).line || 'Astronomers have found an object on a path that may cross the Earth.']; },
  onHit(s) {
    const A = asteroidOf(s), I = A.impact, out: string[] = [];
    if (I.deflection === 'success') {
      A.deflected = true;
      s.disaster.variant = 'deflected';   // no such variant: every service curve reads as normal (disaster.levelsOf)
      s.disaster.tracks = { ...FULL };
      return ['The interceptor worked. The object passed the Earth with room to spare, and the whole world is outside, cheering. You have a stocked compound and a story.'];
    }
    const band = I.band, share = band === 'near' ? 0.8 : band === 'regional' ? 0.5 : 0.1;
    setRepairLead(s, share, 'impact');
    out.push(band === 'far' ? 'A second sunrise in the east, silent, then a long low thump and the windows rattling. The sky is going brown.' : band === 'regional' ? 'A flash brighter than the sun, then the blast wave: the windows came in and a hot wind flattened the trees.' : 'A flash, and then nothing in the world was standing.');
    if (band !== 'far' || I.variant === 'airburst') {
      const r = ((x: number) => ((Math.sin(s.seed * 3.3 + x * 71.9) * 43758.5453) % 1 + 1) % 1);
      for (let i = 0; i < s.people.length; i++) {
        const ps = s.personState[i];
        if (!ps || ps.needs.died != null || ['sleep', 'shelter'].includes(ps.task as string)) continue;
        if (r(i + 1) < 0.3 * (A.evacuated ? 0 : 1)) { startCase(s, s.people[i].id, 'burn', 22, {}, 'flash burns and sore eyes from looking at the flash'); out.push(`${s.people[i].first} was outside and looked toward the flash: burns and sore eyes.`); }
      }
    }
    return out;
  },
  structureDamage(s, ctx) {
    const A = asteroidOf(s), I = A.impact, out: string[] = [];
    if (A.deflected || ctx.day !== 0 || !ctx.once('impact_main')) return out;
    const base = blastHazard(I.variant, I.miles), P = physicalOf(s);
    for (const st of reachable(s)) {
      const fin = isFinished(st);
      const res = resistance('blast', st.kind, { retrofits: retrofitsOf(s, st.id), blast: st.hardening?.blast ?? 0 });
      const level = rollLevel(base, res, ctx.r()) as DamageLevel;
      if (level && !fin) { const l = hitUnfinished(st, level); if (l) out.push(l); continue; }
      if (level && fin) { const l = applyLevel(s, st, level, 'blast', level === 1 ? 'The blast wave broke the glass.' : 'The blast wave and the wind took it.'); if (l) out.push(l); }
    }
    // fires from the thermal pulse in the regional band: the same ember rules as the wildfire front
    if (I.band !== 'far') {
      const fuel = s.disaster.fuel ?? {};
      for (const st of s.structures.filter(isFinished)) {
        if (st.kind.startsWith('bunker_') || st.kind === 'root_cellar') continue;
        if (ctx.r() > burnChance(fuel[st.id] ?? 6, emberFactor(st.kind), isHome(st.kind) ? emberK(s) : 1) * (I.band === 'near' ? 1 : 0.5)) continue;
        if (burnStructure(s, st)) { out.push(`The ${st.kind.replace(/_/g, ' ')} burned: the heat of the flash lit it.`); const paid = insuranceClaim(s, st, 1); if (paid) out.push(paid); }
      }
    }
    void P;
    return out;
  },
  daily(s, ctx) {
    const A = asteroidOf(s), d = ctx.day, out: string[] = [];
    if (A.deflected) return out;
    if (d >= 1 && d <= 30) for (let i = 0; i < s.people.length; i++) if (s.personState[i]?.needs.died == null && ctx.r() < 0.012 && startCase(s, s.people[i].id, 'flu', 20, { src: 'house' }, 'a sooty cough')) out.push(`${s.people[i].first} has a sooty cough from the air.`);
    if (d === 3 && ctx.once('black_rain')) out.push('The rain is black. Do not drink from open water.');
    return out;
  },
  priceMods(s) { const A = asteroidOf(s); return A.deflected ? 1 : panic(daysLeft(s)) * (since(s) > 0 ? 1 + 0.2 * winterAt(since(s) - 20, A.impact.winter, s.site.region).foodStress : 1); },
  encounterWeights(s, { scale }) {
    const A = asteroidOf(s), left = daysLeft(s);
    if (left > 0 && left < 30) scale('looters', 1.3);
    if (left <= 0 && !A.deflected) scale('refugees', since(s) < 60 ? 2.5 : 1.3);
  },
  supplyMods(s) {
    const A = asteroidOf(s);
    if (A.deflected) return {};
    const d = since(s), k = d < 730 ? 1 : d < 1100 ? 1 - (d - 730) / 370 : 0, w = winterAt(d - 20, A.impact.winter, s.site.region);
    return { grow: w.grow / (1 - 0.9 * k), cold: coldIndex(w.coldF) - 0.6 * k };
  },
  npcMods(s) { return asteroidOf(s).deflected ? 1 : 1 + 0.5 * Math.max(0, 1 - since(s) / 60); },
  medical(s) { const d = since(s); return d >= 0 && d <= 45 && !asteroidOf(s).deflected ? { contact: 0.03, spread: 0.02 } : null; },
  radioBulletins(s, ctx) {
    const A = asteroidOf(s), d = since(s);
    if (A.deflected) return d < 14 ? { text: 'The world is celebrating: the object missed. Markets are open and the banks are lending.', tone: 0 } : null;
    const lines: Array<[string, 0 | 1 | 2 | 3]> = [['The sky is brown and the sun is a dim red disc. Light levels are a third of normal.', 2], ['Refugees from the coasts are on the interstate heading inland. Relief centers are opening in the interior.', 2]];
    if (d <= 20) lines.push(['Soot is falling with the rain. Cover open cisterns and keep animals in.', 2]);
    if (d >= 30) lines.push([`The cold is deepening: temperatures are ${Math.round(-winterAt(d - 20, A.impact.winter, s.site.region).coldF) || 5} degrees below normal and the growing season is in doubt.`, 2]);
    return (([text, tone]) => ({ text, tone }))(lines[Math.floor(ctx.r() * lines.length)]);
  },
  oasisWeight(s) { return asteroidOf(s).deflected ? 0 : 0.25 * (1 - Math.min(s.disaster.tracks.stores, s.disaster.tracks.deliveries)); },
};
