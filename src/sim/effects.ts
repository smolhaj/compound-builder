/**
 * What each disaster does beyond the outside world's services (GDS §4; the
 * research in docs/research_disasters.md). The collapse clock says what
 * breaks out there; these say what it does to the place itself: wells that
 * fail in a drought, a winter that doesn't end after an eruption or an
 * impact, ash on long roofs, a fire front that takes what's close to the
 * timber, a sickness that comes in with strangers, neighbors who are simply
 * gone. Pure.
 */
import { burnStructure, isFinished, knockBack } from './construction';
import { insuranceClaim } from './paperwork';
import { BLUEPRINTS } from './blueprints';
import { mulberry32 } from './rng';
import type { GameState } from './state';

/** Growing-season and warmth factor after a full exchange: 1–3 years of nuclear winter. */
export function winterFactor(s: GameState): { grow: number; cold: number } {
  if (s.disaster.kind !== 'nuclear' || s.disaster.variant !== 'exchange' || s.clock.t < s.disaster.hitAt) return { grow: 1, cold: 0 };
  const years = (s.clock.t - s.disaster.hitAt) / 365;
  const k = years < 1 ? 1 : years < 2.5 ? 1 - (years - 1) / 1.5 : 0;
  return { grow: 1 - 0.8 * k, cold: 0.5 * k };
}

const since = (s: GameState) => s.disaster.kind ? s.clock.t - s.disaster.hitAt : -1;
const hit = (s: GameState, ...k: string[]) => !!s.disaster.kind && k.includes(s.disaster.kind) && s.clock.t >= s.disaster.hitAt;

/** Wells: share of their yield left (drought draws the water table down). */
export function wellYield(s: GameState, kind: string): number {
  if (!hit(s, 'drought')) return 1;
  const d = since(s);
  return kind === 'well_hand' ? Math.max(0, 1 - d / 45) : Math.max(0.35, 1 - d / 200);
}

/** The growing season and the cold: a nuclear winter, an ash winter (1–2 years), an impact winter (2–3), drought. */
export function climate(s: GameState): { grow: number; cold: number } {
  const n = winterFactor(s);
  const d = since(s);
  let grow = n.grow, cold = n.cold;
  if (hit(s, 'ash_winter')) { const k = d < 365 ? 1 : d < 730 ? 1 - (d - 365) / 365 : 0; grow = Math.min(grow, 1 - 0.75 * k); cold = Math.max(cold, 0.4 * k); }
  if (hit(s, 'asteroid')) { const k = d < 730 ? 1 : d < 1100 ? 1 - (d - 730) / 370 : 0; grow = Math.min(grow, 1 - 0.9 * k); cold = Math.max(cold, 0.6 * k); }
  if (hit(s, 'drought')) {
    // a garden on stored water (a cistern or tank with water in it) gets by; on the creek alone it withers
    const stored = s.utilities.storedL > 2000;
    grow = Math.min(grow, stored ? 0.75 : 0.3);
  }
  return { grow, cold };
}

/** How catching the sickness is: per contact at the gate, and spread at home per sick person a day. */
export function contagion(s: GameState): { contact: number; spread: number } {
  if (hit(s, 'bioweapon')) return { contact: 0.55, spread: 0.12 };
  if (hit(s, 'pandemic')) return { contact: 0.25, spread: 0.06 };
  return { contact: 0, spread: 0 };
}

/** Someone catches it (from a contact at the gate). */
export function infect(s: GameState, r: () => number, from: string): string | null {
  const sick = s.personState.map((ps, i) => [ps, i] as const).filter(([ps]) => ps.needs.died == null && !ps.needs.hurt.some(h => h.what === 'fever'));
  if (!sick.length) return null;
  const [ps, i] = sick[Math.floor(r() * sick.length)];
  ps.needs.hurt.push({ what: 'fever', sev: s.disaster.kind === 'bioweapon' ? 75 : 45 });
  return `${s.people[i].first} has a fever (${from}).`;
}

/**
 * Once a day. The one-time blows (ash on the roofs, the fire front, the
 * vanishing) and the daily ones (the sickness spreading at home). Returns lines for the log.
 */
export function effectsDay(s: GameState): string[] {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt) return [];
  const day = Math.floor(since(s));
  const r = mulberry32(s.seed * 6007 + day * 3 + 1);
  const out: string[] = [];
  const once = (key: string) => { if (d.done?.includes(key)) return false; (d.done ??= []).push(key); return true; };
  // ash: long, low-pitched roofs give way under wet ash (about 10 cm of it is enough)
  if (d.kind === 'ash_winter' && day >= 4 && once('ash_roofs')) {
    for (const st of s.structures.filter(isFinished)) {
      if (!['workshop', 'chicken_coop', 'garden'].includes(st.kind) || r() > 0.55) continue;
      const roof = BLUEPRINTS[st.kind].stages.findIndex(x => x.id === 'roof');
      if (roof < 0) continue;
      knockBack(s, st, roof);
      out.push(`The ${st.kind.replace('_', ' ')} roof came down under the wet ash: it has to be rebuilt.`);
      const paid = insuranceClaim(s, st, 0.4);
      if (paid) out.push(paid);
    }
  }
  // the fire front: buildings burn by the fuel round them (trees close in, measured by the world); bunkers and stone don't
  if (d.kind === 'wildfire' && day === 0 && once('fire_front')) {
    const fuel = d.fuel ?? {};
    for (const st of s.structures.filter(isFinished)) {
      if (st.kind.startsWith('bunker_') || st.kind === 'root_cellar') continue;
      const near = fuel[st.id] ?? 6;
      const p = Math.min(0.85, 0.05 + near * 0.06);
      if (r() > p) continue;
      if (!burnStructure(s, st)) continue;
      out.push(st.kind === 'well_drilled' ? 'The pump house over the drilled well burned. The bore and the pump down it came through; the pump house, pressure tank and controls have to be redone.'
        : st.kind === 'well_hand' ? 'The well house burned. The stoned shaft and the hand pump came through; it needs a new roof.' : `The ${st.kind.replace('_', ' ')} burned: embers in the timber${near > 8 ? ' right up against it' : ''}.`);
      const paid = insuranceClaim(s, st, st.kind.startsWith('well_') ? 0.2 : 1);
      if (paid) out.push(paid);
    }
    if (!out.length) out.push('The fire went round: every building is standing. The cleared ground saved it.');
  }
  // the unknown: half the neighbors are simply gone
  if (d.kind === 'unknown' && once('vanished')) {
    for (const n of s.neighbors) if (r() < 0.5) { n.status = 'gone'; out.push(`${n.name[0].toUpperCase() + n.name.slice(1)} are gone. Their trucks are still in the drive.`); }
  }
  // sickness spreads at home (a medical bay lets you keep the sick apart)
  const c = contagion(s);
  if (c.spread > 0) {
    const sick = s.personState.filter(ps => ps.needs.died == null && ps.needs.hurt.some(h => h.what === 'fever')).length;
    const bay = s.structures.some(st => st.kind === 'bunker_medical' && isFinished(st));
    for (let k = 0; k < sick; k++) if (r() < c.spread * (bay ? 0.25 : 1) * (s.medical?.epidemic?.quarantine ? 0.4 : 1)) { const l = infect(s, r, 'caught it at home'); if (l) out.push(l); }
  }
  return out;
}
