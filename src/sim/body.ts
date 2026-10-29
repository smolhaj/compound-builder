/**
 * Body and household (decided with the user: "Body & household"). Pure.
 *
 *  Prescriptions  some people need a daily medicine: blood pressure pills,
 *                 thyroid, an asthma inhaler, insulin. While the pharmacy is
 *                 open it's refilled monthly at a copay; you can buy up to
 *                 90 days ahead (insurance won't cover more). When it runs
 *                 out: blood pressure and thyroid wear on you over weeks,
 *                 asthma brings attacks, and without insulin a type 1
 *                 diabetic has weeks. Insulin keeps about a month without a
 *                 fridge.
 *  Dental         toothaches come (about one a person every three years):
 *                 a dentist while town works, else it's pain until it settles
 *                 or the medic pulls it.
 *  Hygiene        soap, toilet paper, toothpaste, pads: bought with the
 *                 groceries; once the stores close it comes out of the stockpile
 *                 (about a unit per person a month). Without it morale sinks
 *                 and stomach bugs go round.
 *
 * Rough US prevalence: high blood pressure ~45 % of adults (most over 45),
 * hypothyroid ~5 %, asthma ~8 %, type 1 diabetes ~0.5 %.
 */
import type { GameState } from './state';
import type { Person } from './family';
import { mulberry32 } from './rng';
import { logGate } from './nag';
import { isStyleHome } from './housingStyles';

export type Condition = 'blood_pressure' | 'thyroid' | 'asthma' | 'insulin';
export const CONDITION: Record<Condition, { name: string; rx: string; monthly: number }> = {
  blood_pressure: { name: 'High blood pressure', rx: 'blood pressure pills', monthly: 15 },
  thyroid: { name: 'Underactive thyroid', rx: 'thyroid pills', monthly: 10 },
  asthma: { name: 'Asthma', rx: 'an inhaler', monthly: 30 },
  insulin: { name: 'Type 1 diabetes', rx: 'insulin', monthly: 35 },
};
/** Most refills a pharmacy will fill ahead (days). */
export const RX_AHEAD = 90;
export const DENTIST_USD = 450;

/** Seeded conditions for a person (its own stream: names and skills don't move). */
export function conditionsFor(p: Person, seed: number): Condition[] {
  const r = mulberry32(seed * 1879 + Number(p.id.replace(/\D/g, '') || 0) * 97 + 41);
  const out: Condition[] = [];
  const age = p.age;
  if (!p.kid && r() < (age >= 60 ? 0.6 : age >= 45 ? 0.35 : 0.12)) out.push('blood_pressure');
  if (!p.kid && r() < (age >= 60 ? 0.15 : 0.05)) out.push('thyroid');
  if (r() < 0.08) out.push('asthma');
  if (r() < 0.012) out.push('insulin');
  return out;
}

export interface Body {
  /** Days of each person's medicine on hand. */
  rx: Record<string, number>;
  /** Days each has gone without it. */
  without: Record<string, number>;
  /** Days since each person's stock was last filled: pills keep about two and a half years, then work half as well (sim/medical.ts reports it). */
  age?: Record<string, number>;
}
/** Days a bottle of pills keeps its strength. */
export const RX_SHELF = 900;
export const newBody = (): Body => ({ rx: {}, without: {} });

export const pharmacyOpen = (s: GameState) => s.disaster.tracks.medical >= 0.5 && s.disaster.tracks.banks >= 0.5;
export const monthlyRx = (p: Person) => (p.conditions ?? []).reduce((a, c) => a + CONDITION[c].monthly, 0);

/** Buy ahead: fill everyone up to 90 days past the month in hand. Returns the cost (0 if nothing to buy). */
export function stockUpRx(s: GameState): number {
  if (!pharmacyOpen(s)) return 0;
  let cost = 0;
  for (const p of s.people) {
    if (!p.conditions?.length) continue;
    const have = s.body.rx[p.id] ?? 0, want = 30 + RX_AHEAD;
    if (have >= want) continue;
    cost += monthlyRx(p) * (want - have) / 30;
    s.body.rx[p.id] = want;
    (s.body.age ??= {})[p.id] = 0;
  }
  s.money -= Math.round(cost);
  return Math.round(cost);
}

/** Once a day, after eating: medicine, toothaches, hygiene. Returns log lines. */
export function bodyDay(s: GameState): string[] {
  const out: string[] = [];
  const day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 3571 + day * 13 + 7);
  const pharmacy = pharmacyOpen(s), stores = s.disaster.tracks.stores >= 0.5 && s.disaster.tracks.banks >= 0.5;
  const fridge = s.utilities.lit.some(id => s.structures.find(x => x.id === id && (['timber_cabin', 'log_house', 'farmhouse', 'trailer', 'root_cellar'].includes(x.kind) || isStyleHome(x.kind))));
  const living = s.people.filter((_, i) => s.personState[i]?.needs.died == null);
  // hygiene supplies come out of the stockpile once the stores close
  let hygiene = true;
  if (!stores) {
    const use = living.length / 30;
    if (s.stock.hygiene >= use) s.stock.hygiene -= use; else { s.stock.hygiene = 0; hygiene = false; }
  }
  s.people.forEach((p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null) return;
    // medicine
    if (p.conditions?.length) {
      let have = s.body.rx[p.id] ?? 30;
      const ages = (s.body.age ??= {});
      if (pharmacy && have < 30) { s.money -= monthlyRx(p) * (30 - have) / 30; have = 30; ages[p.id] = 0; }
      else ages[p.id] = (ages[p.id] ?? 0) + 1;
      const stale = (ages[p.id] ?? 0) > RX_SHELF;
      if (stale && have > 0 && (ages[p.id] ?? 0) === RX_SHELF + 1) out.push(`${p.first}'s medicine is past its date: it still works, but only half as well, so it runs out twice as fast.`);
      // insulin spoils within about a month without a fridge: the stash past that goes bad
      if (p.conditions.includes('insulin') && !fridge && have > 28) have = 28;
      have = Math.max(0, have - (stale ? 2 : 1));
      s.body.rx[p.id] = have;
      const w = have > 0 ? 0 : (s.body.without[p.id] ?? 0) + 1;
      s.body.without[p.id] = w;
      if (w === 1) out.push(`${p.first} is out of ${p.conditions.map(c => CONDITION[c].rx).join(' and ')}.`);
      if (w > 0) {
        if (p.conditions.includes('insulin')) n.health -= 4;
        if (p.conditions.includes('blood_pressure') && w > 30) { n.health -= 0.15; if (r() < 0.0008) { n.hurt.push({ what: 'stroke', sev: 70 }); out.push(`${p.first} had a stroke.`); } }
        if (p.conditions.includes('thyroid') && w > 60) { n.health -= 0.05; n.morale -= 0.3; }
        if (p.conditions.includes('asthma') && r() < 0.02) { n.hurt.push({ what: 'asthma attack', sev: 30 }); out.push(`${p.first} had an asthma attack with no inhaler.`); }
      }
    }
    // a toothache, now and then
    if (r() < 1 / 1100) {
      if (stores) { s.money -= DENTIST_USD; out.push(`${p.first} had a toothache: the dentist in town fixed it ($${DENTIST_USD}).`); }
      else { n.hurt.push({ what: 'toothache', sev: 25 }); n.morale -= 6; out.push(`${p.first} has a bad toothache and there's no dentist.`); }
    }
    // no soap, no paper: morale sinks and stomach bugs go round
    if (!hygiene) {
      n.morale -= 0.4;
      if (r() < 0.004) n.hurt.push({ what: 'stomach bug', sev: 20 });
    }
    n.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 0, n.health);
    n.morale = Math.max(0, Math.min(100, n.morale));
  });
  if (!hygiene && logGate(s, 'soap', 60)) out.push('Out of soap and toilet paper. It\'s getting grim.');
  return out;
}
