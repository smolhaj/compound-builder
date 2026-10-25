/**
 * Radiation sickness (decided with the user: "Realistic curve"). Pure.
 *
 * Effective dose with repair. The body mends most radiation damage: about
 * 90 % of it is repaired with a half-time of about a month, the other 10 %
 * stays for good (Kearny, "Nuclear War Survival Skills", ch. 2; the NCRP
 * operational-dose model). So a dose taken over weeks does far less than the
 * same dose in a day, and low chronic doses never add up to sickness.
 * `Needs.dose` stays the lifetime total (the cancer risk and the Family tab
 * read it); `Needs.rad.rep` is the part not yet repaired.
 *
 * Acute radiation syndrome by effective dose D (IAEA / CDC ARS guides):
 *   D < 1 Sv     nothing to see, or a queasy day.
 *   1–2 Sv       nausea for a day or two, a couple of weeks of feeling all
 *                right, then ten days of tiredness and low blood counts.
 *                Recovery is the rule.
 *   2–6 Sv       the hematopoietic syndrome: vomiting, a latent period of one
 *                to two weeks, then a month of fever, infections and
 *                bleeding as the marrow fails. About half die by 4 Sv
 *                untreated (LD50/60); with care (someone who knows
 *                medicine, antibiotics, clean water, food) the LD50 moves
 *                to about 6.5 Sv.
 *   6–8 Sv       usually fatal without a hospital.
 *   8 Sv +       the gut fails: fatal in a week or two whatever is done.
 * Who dies is set by a per-person draw against today's odds, so care that
 * arrives in the second week still saves someone.
 *
 * Long term: about 5 % added lifetime cancer risk a sievert (ICRP 103,
 * linear no-threshold), twice that for children, after a latency of years.
 * Radioactive iodine adds thyroid cancer in children above all; potassium
 * iodide taken at the strike blocks about 90 % of that, and nothing else.
 */
import type { GameState } from './state';
import type { Needs } from './needs';
import type { Person } from './family';
import { mulberry32 } from './rng';

/** Half-time of repair (days) and the share of dose that is never repaired. */
export const REPAIR_HALF_DAYS = 30, IRREPARABLE = 0.1;
/** Effective dose at which sickness starts (Sv). */
export const ARS_THRESHOLD = 1;
/** LD50/60 untreated and with full care (Sv), and the spread of the curve. */
export const LD50_UNTREATED = 4, LD50_CARE = 6.5, LD_SPREAD = 0.5;
/** Added lifetime cancer risk a sievert (adults; children twice). */
export const CANCER_PER_SV = 0.05;
/** Years before a radiation cancer can show. */
export const CANCER_LATENCY_DAYS = 2 * 365;

export interface ArsState {
  /** Effective dose the illness follows (Sv): the worst reached while it builds. */
  dose: number;
  /** Day it began. */
  at: number;
  /** This person's draw (0–1): they take the bad course while it is below today's odds of death. */
  u: number;
  /** Over (recovered). */
  done?: boolean;
}

export interface RadState {
  /** Lifetime dose already accounted for (Sv), to see what is new each day. */
  seen: number;
  /** Dose not yet repaired (Sv). */
  rep: number;
  /** Day of the first real dose. */
  first?: number;
  ars?: ArsState;
  /** Added lifetime cancer risk not yet drawn (0–1), of it thyroid from radioiodine. */
  risk: number;
  /** Took potassium iodide at the strike. */
  ki?: boolean;
  /** A cancer found: the day, and whether it will kill. */
  cancer?: { at: number; fatal: boolean };
}

export const freshRad = (dose = 0): RadState => ({ seen: dose, rep: 0, risk: 0 });
export const radOf = (n: Needs): RadState => (n.rad ??= freshRad(n.dose));

/** Effective dose (Sv): the unrepaired part plus the 10 % that never mends. */
export const effectiveDose = (n: Needs): number => (n.rad?.rep ?? 0) + IRREPARABLE * n.dose;

/** What a sick person has: someone who knows medicine (skill), antibiotics and supplies, the medical bay, clean water, enough to eat. */
export interface RadCare { medic: number; meds: boolean; bay: boolean; cleanWater: boolean; fed: boolean }
/** Medical care 0–1 (someone who knows how, antibiotics, the bay). */
export function careScore(c: RadCare): number {
  return Math.min(1, 0.4 * Math.min(1, c.medic / 5) + 0.45 * (c.meds ? 1 : 0) + 0.15 * (c.bay ? 1 : 0));
}
/** The LD50 this person faces (Sv): 4 fed and with clean water but no medical care, up to 6.5 with full care; hunger and dirty water lower it. */
export function ld50Of(c: RadCare): number {
  return LD50_UNTREATED + (LD50_CARE - LD50_UNTREATED) * careScore(c) - (c.fed ? 0 : 0.5) - (c.cleanWater ? 0 : 0.3);
}

/** Odds of dying of acute radiation sickness at effective dose D (Sv), facing an LD50 (Sv). */
export function deathRisk(dose: number, ld50 = LD50_UNTREATED): number {
  if (dose < ARS_THRESHOLD) return 0;
  const p = 1 / (1 + Math.exp(-(dose - ld50) / LD_SPREAD));
  return dose >= 8 ? Math.max(p, 0.97) : p;
}

export type ArsPhase = 'prodrome' | 'latent' | 'manifest' | 'recovery' | 'done';

/** The course of the illness at dose D: days of each phase. */
export function arsCourse(dose: number): { prodrome: number; latent: number; manifest: number } {
  return {
    prodrome: dose < 4 ? 2 : 3,
    latent: dose < 4 ? 14 : dose < 6 ? 10 : dose < 8 ? 5 : 2,
    manifest: dose < 2 ? 10 : dose < 4 ? 30 : dose < 6 ? 35 : 20,
  };
}

/** Where the illness is `days` after it began, and how bad (severity 0–100 for the Family tab). */
export function arsPhase(dose: number, days: number): { phase: ArsPhase; sev: number } {
  const c = arsCourse(dose);
  const peak = Math.min(90, 15 + 15 * (dose - 1));
  if (days < c.prodrome) return { phase: 'prodrome', sev: Math.min(80, 15 + 8 * dose) };
  if (days < c.prodrome + c.latent) return { phase: 'latent', sev: Math.min(40, 5 + 3 * dose) };
  if (days < c.prodrome + c.latent + c.manifest) return { phase: 'manifest', sev: peak };
  const rec = peak - 1.5 * (days - c.prodrome - c.latent - c.manifest);
  return rec > 0 ? { phase: 'recovery', sev: rec } : { phase: 'done', sev: 0 };
}

const ARS_WHAT: Record<Exclude<ArsPhase, 'done'>, string> = {
  prodrome: 'radiation sickness: nausea and vomiting',
  latent: 'radiation sickness: weak, feeling better for now',
  manifest: 'radiation sickness: fever, infections, bleeding gums',
  recovery: 'radiation sickness: getting over it',
};
const CANCER_WHAT = 'cancer (radiation)';

/** Hurt entries this module runs (needs.ts leaves their healing to it). */
export const isRadiationHurt = (what: string) => what.startsWith('radiation sickness') || what === CANCER_WHAT;

/** The person's rng for the day (its own stream). */
const rngFor = (s: GameState, i: number, day: number, salt: number) => mulberry32(s.seed * 6007 + i * 977 + day * 13 + salt);

/**
 * One day of radiation for one person, after the day's fallout dose is in:
 * repair, the course of any sickness, a cancer showing. Returns the change
 * to health today (needs.ts adds it); keeps the hurt entry in step; logs.
 */
export function radiationDay(s: GameState, i: number, p: Person, n: Needs, care: RadCare, out: string[]): number {
  const rad = radOf(n), day = Math.floor(s.clock.t + 0.25);
  // what came in since yesterday: 90 % of it repairable, the rest for good; the cancer risk it carries
  const fresh = Math.max(0, n.dose - rad.seen);
  rad.seen = n.dose;
  rad.rep = rad.rep * Math.pow(0.5, 1 / REPAIR_HALF_DAYS) + (1 - IRREPARABLE) * fresh;
  if (fresh > 0) {
    if (rad.first == null && fresh > 0.01) rad.first = day;
    rad.risk += CANCER_PER_SV * fresh * (p.kid ? 2 : 1);
    // radioiodine (I-131, 8-day half-life) in the first two weeks: thyroid cancer, mostly in children; potassium iodide blocks ~90 %
    const sinceHit = s.clock.t - s.disaster.hitAt;
    if (s.disaster.kind === 'nuclear' && sinceHit >= 0 && sinceHit < 14) rad.risk += fresh * (p.kid ? 0.03 : 0.005) * (rad.ki ? 0.1 : 1);
    rad.risk = Math.min(0.9, rad.risk);
  }
  const eff = effectiveDose(n);
  let dh = 0;
  // the illness begins (or comes again after a fresh, bigger dose)
  if (eff >= ARS_THRESHOLD && (!rad.ars || (rad.ars.done && eff > rad.ars.dose + 0.5))) {
    rad.ars = { dose: eff, at: day, u: rngFor(s, i, day, 1)() };
    out.push(`${p.first} is sick to the stomach and can't keep anything down: radiation sickness (${eff.toFixed(1)} Sv).`);
  }
  const a = rad.ars;
  n.hurt = n.hurt.filter(h => !h.what.startsWith('radiation sickness'));
  if (a && !a.done) {
    const days = day - a.at;
    const ph = arsPhase(a.dose, days);
    // while the dose is still building (the shelter weeks), the illness follows the worst of it
    if ((ph.phase === 'prodrome' || ph.phase === 'latent') && eff > a.dose) a.dose = eff;
    const c = arsCourse(a.dose);
    if (ph.phase === 'prodrome') dh -= 1 + a.dose;
    else if (ph.phase === 'latent') dh -= 0.3;
    else if (ph.phase === 'manifest') {
      if (care.meds) s.stock.meds = Math.max(0, s.stock.meds - 0.1);
      const failing = a.u < deathRisk(a.dose, ld50Of(care));
      dh -= failing ? 7 : 0.6 + 50 / c.manifest * Math.min(1, Math.max(0.2, (a.dose - 1) / 3));
      if (days === c.prodrome + c.latent) out.push(`${p.first}'s radiation sickness has come back: fever, sores, bleeding gums. ${careScore(care) < 0.5 ? 'Antibiotics, clean water and someone who knows medicine would give them a better chance.' : 'Being nursed.'}`);
    } else if (ph.phase === 'done') { a.done = true; out.push(`${p.first} has come through the radiation sickness.`); }
    if (ph.phase !== 'done') n.hurt.push({ what: ARS_WHAT[ph.phase], sev: Math.round(ph.sev) });
  }
  // a cancer, years on: the added risk spread over about 25 years after the latency
  if (!rad.cancer && rad.risk > 0 && rad.first != null && day - rad.first >= CANCER_LATENCY_DAYS) {
    const r = rngFor(s, i, day, 2);
    if (r() < rad.risk / (25 * 365)) {
      const treated = s.disaster.tracks.medical >= 0.5;
      rad.cancer = { at: day, fatal: r() > (treated ? 0.6 : 0.1) };
      rad.risk = 0;
      n.hurt.push({ what: CANCER_WHAT, sev: 30 });
      out.push(`${p.first} has cancer, likely from the fallout years ago.${treated ? ' The hospital can treat it.' : ' There is no hospital to treat it.'}`);
    }
  }
  const ca = n.hurt.find(h => h.what === CANCER_WHAT);
  if (ca && rad.cancer) {
    // treated and beaten over about eight months, or growing
    ca.sev = rad.cancer.fatal ? Math.min(100, ca.sev + 0.2) : ca.sev - 0.15;
    dh -= ca.sev / (rad.cancer.fatal ? 25 : 60);
    if (ca.sev <= 0) n.hurt = n.hurt.filter(h => h !== ca);
  }
  return dh;
}

/** At the strike: everyone takes potassium iodide if there's a pack for them (one pack a person). */
export function takeIodide(s: GameState): string | null {
  // the children first: radioiodine does them the most harm
  const living = s.personState.map((ps, i) => ({ ps, age: s.people[i]?.age ?? 99 })).filter(x => x.ps.needs.died == null && !x.ps.needs.taken).sort((a, b) => a.age - b.age).map(x => x.ps);
  let took = 0;
  for (const ps of living) {
    if ((s.stock.potassium_iodide ?? 0) < 1) break;
    s.stock.potassium_iodide -= 1;
    radOf(ps.needs).ki = true;
    took++;
  }
  if (!took) return null;
  return took < living.length ? `Potassium iodide for ${took} of ${living.length}, the youngest first: it guards the thyroid against radioactive iodine.` : 'Everyone took potassium iodide: it guards the thyroid against radioactive iodine (and nothing else).';
}
