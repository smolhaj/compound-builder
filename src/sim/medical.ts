/**
 * Medical depth with no hospital (decided with the user: "all of these",
 * docs/DECISIONS.md; GDS §10.6 "infections, surgery checks against medic
 * skill, childbirth, dental emergencies"). Pure; once a day plus hooks.
 *
 * Each condition is a case with its own course, shown on the Family tab
 * through the hurt list (needs.ts) with its treatment status. While the
 * county hospital runs (`tracks.medical`), the serious ones go there (and
 * the bill comes); after, it is the household's medic, the kit and the
 * bunker's medical bay. The best adult medic present does the work (not on
 * themselves), a level better with the medical books; every case they treat
 * is practice (skills.ts).
 *
 *  Dental abscess   once there's no dentist (body.ts toothache): antibiotics
 *                   settle it for now (a third come back); pulling the tooth
 *                   ends it, with the dental kit or, failing that, pliers.
 *                   Untreated it may drain, or spread (sepsis).
 *  Appendicitis     ≈ 1 in 1,000 a year (teens and twenties most). A skilled
 *                   medic (6+) with a surgical kit or the medical bay can
 *                   operate (≈ 3–25 % mortality by skill and kit); antibiotics
 *                   alone save most (≈ 8–16 %); nothing, about half die when
 *                   it bursts (pre-surgical-era figures).
 *  Broken bones     falls on the job, felling, kids, an elder's fall (a hip:
 *                   bedbound for months, dangerous without a hospital). Set and
 *                   splinted, 5–12 weeks off heavy work; set badly, it heals
 *                   crooked for good. An open fracture needs antibiotics.
 *  Burns            the stove, lamps, the canner; worse in a grid-down winter.
 *                   Serious ones need dressings or they go septic.
 *  Cuts, nails      saw and axe cuts want stitches (the suture kit) or they
 *                   heal slow and get infected; a rusty nail through the boot
 *                   and no booster in ten years can mean tetanus (lockjaw,
 *                   ≈ 50 % fatal without intensive care; vaccination is a prep).
 *  Infection,       any wound can go bad; untreated infection becomes sepsis,
 *  sepsis           which antibiotics and fluids can turn (≈ 15–25 %
 *                   fatal), and which kills most people without them.
 *  Dysentery        bad water (water.ts) or an outhouse too close to the hand
 *                   well: days of bloody flux, deadly to little kids and the old
 *                   if they dry out; oral rehydration and antibiotics; it spreads
 *                   without soap.
 *  Childbirth       lineage.ts births: a midwife or medic and the midwifery kit
 *                   cut the risk to mother and baby; weeks of recovery after;
 *                   postpartum depression in about 1 in 8 (mind.ts).
 *  Insulin          a type 1 diabetic out of insulin (body.ts) goes into
 *                   ketoacidosis: fluids and a medic buy days, not a life.
 *
 * Supplies (materials.ts): fish antibiotics (aquarium amoxicillin and
 * doxycycline: the same pills, gray-area, no prescription), suture, dental,
 * surgical and midwifery kits, the medical books; the medical kit (`meds`)
 * covers dressings and a basic course of antibiotics.
 */
import { dayIndex, type GameState } from './state';
import { isFinished } from './construction';
import { practice } from './skills';
import { psyOf } from './mind';
import { log } from './economy';
import { mulberry32 } from './rng';
import type { Person } from './family';

export type MedKind = 'abscess' | 'appendicitis' | 'fracture' | 'burn' | 'cut' | 'puncture' | 'tetanus' | 'sepsis' | 'dysentery' | 'postpartum' | 'dka';
export type Bone = 'wrist' | 'arm' | 'collarbone' | 'ribs' | 'ankle' | 'leg' | 'hip';

export interface MedCase {
  id: string;
  pid: string;
  kind: MedKind;
  /** Day it started. */
  day: number;
  sev: number;
  /** What was done, in words (the Family tab). */
  care: string;
  /** Treatment given: the plan, and when it ends. */
  plan?: string;
  until?: number;
  /** The day the outcome is decided (appendicitis, sepsis, tetanus), and whether it goes badly (decided then). */
  crisis?: number;
  fatal?: boolean;
  infected?: boolean;
  bone?: Bone;
  open?: boolean;
  badSet?: boolean;
  /** A rusty nail with no booster: the day lockjaw shows. */
  tetanusAt?: number;
  /** Abscess settled on antibiotics: it comes back on this day. */
  recurAt?: number;
  /** Its first day has been seen to (treatment chosen). */
  seen?: boolean;
  /** Day antibiotics were started for an infection. */
  abx?: number;
  /** How it started (for the log). */
  cause?: string;
}
export interface Medical {
  cases: MedCase[];
  /** Year of each person's last tetanus shot (absent: seeded from their age; see `lastShot`). */
  tetanus: Record<string, number>;
  /** Lasting effects: a crooked arm, a bad knee. */
  lasting: Record<string, string[]>;
  day: number;
  /** One-time notes already made (the outhouse by the well). */
  noted: string[];
}
export const newMedical = (): Medical => ({ cases: [], tetanus: {}, lasting: {}, day: -1, noted: [] });
export function medicalOf(s: GameState): Medical {
  s.medical ??= newMedical();
  return s.medical;
}

const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const needsOf = (s: GameState, pid: string) => s.personState.find(x => x.id === pid)?.needs;
const here = (s: GameState, p: Person) => { const n = needsOf(s, p.id); return !!n && n.died == null && !n.taken; };
const hash = (t: string) => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const yearOf = (s: GameState) => s.clock.startYear + Math.floor((s.clock.startDoy - 1 + dayIndex(s.clock.t)) / 365);

// ── who helps, with what ──

export interface Care {
  /** The best helper present (not the patient), their effective skill (+1 with the medical books). */
  medic: Person | null;
  skill: number;
  bay: boolean;
  hospital: boolean;
  books: boolean;
}
const BEDRIDDEN: MedKind[] = ['appendicitis', 'sepsis', 'tetanus'];
export function careFor(s: GameState, patientId: string): Care {
  const M = medicalOf(s);
  const able = s.people.filter(p => p.id !== patientId && here(s, p) && (!p.kid || p.age >= 14) && (needsOf(s, p.id)!.health >= 30) && !M.cases.some(c => c.pid === p.id && !c.until && BEDRIDDEN.includes(c.kind)));
  const medic = able.sort((a, b) => b.skills.medic - a.skills.medic)[0] ?? null;
  const books = (s.stock.medical_books ?? 0) >= 1;
  return {
    medic, books,
    skill: medic ? Math.min(10, medic.skills.medic + (books ? 1 : 0)) : 0,
    bay: s.structures.some(x => x.kind === 'bunker_medical' && isFinished(x)),
    hospital: s.disaster.tracks.medical >= 0.5,
  };
}
/** A course of antibiotics: the fish antibiotics first (a bottle is about four courses), else the medical kit's. */
export function takeAntibiotics(s: GameState): 'fish' | 'kit' | null {
  if ((s.stock.fish_antibiotics ?? 0) >= 0.25 - 1e-9) { s.stock.fish_antibiotics -= 0.25; return 'fish'; }
  if (s.stock.meds >= 0.5) { s.stock.meds -= 0.5; return 'kit'; }
  return null;
}
const haveAntibiotics = (s: GameState) => (s.stock.fish_antibiotics ?? 0) >= 0.25 - 1e-9 || s.stock.meds >= 0.5;
/** Dressings for a day (part of a medical kit). */
function dress(s: GameState, amt: number): boolean {
  if (s.stock.meds >= amt) { s.stock.meds -= amt; return true; }
  return false;
}
/** The bill while the hospital runs (a deductible's worth). */
function bill(s: GameState, usd: number): number {
  const paid = Math.max(0, Math.min(s.money, usd));
  s.money -= paid;
  return usd;
}
const medXp = (s: GameState, c: Care, hours: number) => { if (c.medic && hours > 0) practice(s, c.medic.id, 'medic', hours); };
const cozy = (s: GameState) => s.disaster.difficulty === 'cozy';

/** The year of their last tetanus shot: kids are up to date; about 4 in 10 adults have had a booster in ten years. */
export function lastShot(s: GameState, p: Person): number {
  const M = medicalOf(s);
  if (M.tetanus[p.id] != null) return M.tetanus[p.id];
  const start = s.clock.startYear;
  if (p.age < 18) return start - Math.max(0, p.age - 11);
  const u = hash(p.id + p.first + 'tdap') % 100;
  return u < 40 ? start - (u % 10) : start - 11 - (u % 20);
}
export const tetanusCovered = (s: GameState, p: Person) => yearOf(s) - lastShot(s, p) < 10;
/** Tdap boosters for everyone due, while the clinic runs ($65 an adult; kids' shots are covered). */
export function vaccinate(s: GameState): string | null {
  if (s.disaster.tracks.medical < 0.5 || s.disaster.tracks.banks < 0.5) return 'the clinic is closed';
  const due = s.people.filter(p => here(s, p) && !tetanusCovered(s, p));
  if (!due.length) return 'everyone is up to date';
  const cost = due.filter(p => !p.kid).length * 65;
  if (s.money < cost) return 'not enough money';
  s.money -= cost;
  for (const p of due) medicalOf(s).tetanus[p.id] = yearOf(s);
  log(s, `Tetanus boosters at the clinic for ${due.map(p => p.first).join(', ')} ($${cost}).`);
  return null;
}

// ── cases ──

const BONE_WEEKS: Record<Bone, number> = { wrist: 6, arm: 6, collarbone: 6, ribs: 5, ankle: 8, leg: 8, hip: 12 };
const BONE_WORK: Record<Bone, number> = { wrist: 0.55, arm: 0.45, collarbone: 0.5, ribs: 0.5, ankle: 0.25, leg: 0.15, hip: 0 };
const NAME: Record<MedKind, string> = {
  abscess: 'dental abscess', appendicitis: 'appendicitis', fracture: 'broken bone', burn: 'burn', cut: 'deep cut', puncture: 'nail through the foot',
  tetanus: 'tetanus (lockjaw)', sepsis: 'sepsis', dysentery: 'dysentery', postpartum: 'recovering from the birth', dka: 'diabetic ketoacidosis',
};
/** Work rate while a case is open (engine.ts via `medicalWork`). */
function caseWork(c: MedCase): number {
  switch (c.kind) {
    case 'appendicitis': case 'sepsis': case 'tetanus': return 0;
    case 'fracture': return BONE_WORK[c.bone ?? 'arm'];
    case 'burn': return c.sev >= 35 ? 0.5 : 0.85;
    case 'cut': return 0.75;
    case 'puncture': return 0.85;
    case 'abscess': return 0.8;
    case 'dysentery': return 0.3;
    case 'postpartum': return 0.4;
    case 'dka': return 0.2;
  }
}
export function medicalWork(s: GameState, pid: string): number {
  const M = s.medical;
  if (!M) return 1;
  let f = 1;
  for (const c of M.cases) if (c.pid === pid) f = Math.min(f, caseWork(c));
  if (M.lasting[pid]?.length) f *= 0.92;
  return f;
}
export const openCases = (s: GameState, pid?: string) => (s.medical?.cases ?? []).filter(c => !pid || c.pid === pid);

/** Start a case (and its line on the hurt list). */
export function startCase(s: GameState, pid: string, kind: MedKind, sev: number, extra: Partial<MedCase> = {}): MedCase | null {
  const n = needsOf(s, pid), p = person(s, pid);
  if (!n || !p || n.died != null) return null;
  const M = medicalOf(s);
  if (M.cases.some(c => c.pid === pid && c.kind === kind) && kind !== 'cut' && kind !== 'burn') return null;
  const c: MedCase = { id: `mc${s.nextId++}`, pid, kind, day: dayIndex(s.clock.t), sev, care: 'untreated', ...extra };
  M.cases.push(c);
  n.hurt.push({ what: label(s, c), sev, med: c.id });
  return c;
}
function label(s: GameState, c: MedCase): string {
  const day = dayIndex(s.clock.t);
  const left = c.until != null ? Math.max(0, c.until - day) : null;
  const wk = left != null ? (left >= 14 ? `${Math.round(left / 7)} weeks to go` : left > 1 ? `${left} days to go` : 'nearly healed') : '';
  const name = c.kind === 'fracture' ? `broken ${c.bone}${c.open ? ' (open)' : ''}` : NAME[c.kind];
  const inf = c.infected ? ', infected' : '';
  return `${name}${inf}: ${c.care}${wk ? `, ${wk}` : ''}`;
}
function sync(s: GameState, c: MedCase): void {
  const n = needsOf(s, c.pid);
  if (!n) return;
  const h = n.hurt.find(x => x.med === c.id);
  if (h) { h.what = label(s, c); h.sev = Math.max(0.5, c.sev); } else n.hurt.push({ what: label(s, c), sev: Math.max(0.5, c.sev), med: c.id });
}
function close(s: GameState, c: MedCase): void {
  const M = medicalOf(s);
  M.cases = M.cases.filter(x => x !== c);
  const n = needsOf(s, c.pid);
  if (n) n.hurt = n.hurt.filter(h => h.med !== c.id);
}
/** Dies of it (never on Cozy: pulls through, slowly). Returns the line. */
function dies(s: GameState, c: MedCase, cause: string): string {
  const p = person(s, c.pid)!, n = needsOf(s, c.pid)!;
  if (cozy(s)) { c.fatal = false; c.plan = 'survived'; c.crisis = undefined; c.care = 'pulled through, barely'; c.until = dayIndex(s.clock.t) + 21; c.sev = 40; n.health = Math.max(5, Math.min(n.health, 20)); return `${p.first} nearly died of ${cause}, and pulled through.`; }
  for (const x of medicalOf(s).cases.filter(x => x.pid === c.pid)) close(s, x);
  n.hurt.push({ what: cause, sev: 100, med: c.id });   // (what it was, for the report)
  n.health = 0; n.died = Math.floor(s.clock.t);
  return `${p.first} ${p.last} died of ${cause}.`;
}

// ── appendicitis: the decision ──

export type AppendixPlan = 'hospital' | 'surgery' | 'antibiotics' | 'none';
/**
 * What the household can do for appendicitis and the chance it kills:
 * the lowest-risk plan they have. Surgery needs a medic of 6+ (with the books)
 * and a surgical kit or the medical bay.
 */
export function appendicitisPlan(s: GameState, pid: string): { plan: AppendixPlan; pDeath: number } {
  const c = careFor(s, pid);
  if (c.hospital) return { plan: 'hospital', pDeath: 0.002 };
  const abx = haveAntibiotics(s);
  const kit = (s.stock.surgical_kit ?? 0) >= 0.25 - 1e-9;
  const options: Array<{ plan: AppendixPlan; pDeath: number }> = [{ plan: 'none', pDeath: 0.5 }];
  // knowing what it is: a medic of 3+, or anyone with the books
  const knows = c.skill >= 3 || (c.books && !!c.medic);
  if (knows && abx) options.push({ plan: 'antibiotics', pDeath: Math.max(0.08, 0.16 - 0.01 * Math.max(0, c.skill - 3) - (c.bay ? 0.03 : 0)) });
  if (c.skill >= 6 && (kit || c.bay)) options.push({ plan: 'surgery', pDeath: Math.max(0.03, 0.3 - 0.03 * (c.skill - 6) - (c.bay ? 0.08 : 0) - (kit ? 0.07 : 0) - (abx ? 0.06 : 0)) });
  return options.sort((a, b) => a.pDeath - b.pDeath)[0];
}

/** Childbirth risk for this mother now: the baby's and hers (lineage.ts). The hospital: none counted. */
export function birthRisk(s: GameState, mother: Person): { baby: number; mother: number } {
  const c = careFor(s, mother.id);
  if (c.hospital) return { baby: 0, mother: 0 };
  const kit = (s.stock.midwifery_kit ?? 0) >= 0.5 - 1e-9;
  const sk = Math.min(8, c.skill);
  return {
    baby: Math.max(0.01, 0.04 - 0.003 * sk - (kit ? 0.006 : 0) - (c.bay ? 0.004 : 0)),
    mother: Math.max(0.002, 0.012 - 0.0008 * sk - (kit ? 0.003 : 0) - (c.bay ? 0.002 : 0)),
  };
}
/** After a birth at home (lineage.ts): the kit used, the medic's practice, weeks of recovery, and sometimes the dark weeks after. */
export function afterBirth(s: GameState, mother: Person, babyLived: boolean): string[] {
  const out: string[] = [];
  const c = careFor(s, mother.id), day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 7717 + day * 13 + hash(mother.id) % 997);
  if (c.hospital) return out;
  if ((s.stock.midwifery_kit ?? 0) >= 0.5 - 1e-9) s.stock.midwifery_kit -= 0.5;
  medXp(s, c, 12);
  if (c.medic && r() < 0.15) out.push(`A hard birth. ${c.medic.first} got the bleeding stopped.`);
  const pc = startCase(s, mother.id, 'postpartum', 20, { care: c.medic ? `${c.medic.first} is looking after her` : 'resting', until: day + 21 });
  if (pc) sync(s, pc);
  // postpartum depression: about 1 in 8; more after a loss
  if (r() < (babyLived ? 0.12 : 0.5)) { const ps = psyOf(s, mother.id); ps.low = Math.min(100, ps.low + (babyLived ? 35 : 45)); }
  return out;
}

/** A toothache with no dentist (body.ts): it's an abscess. */
export function dentalEmergency(s: GameState, pid: string): string {
  const p = person(s, pid)!;
  startCase(s, pid, 'abscess', 30, { cause: 'a bad tooth' });
  return `${p.first} has an abscessed tooth and there's no dentist: face swollen, can't eat on that side.`;
}
/** Sick from the water (water.ts): giardia mostly, sometimes dysentery. */
export function waterSickness(s: GameState, pid: string, r: () => number): string {
  const p = person(s, pid), n = needsOf(s, pid);
  if (!p || !n) return '';
  if (r() < 0.25 && startCase(s, pid, 'dysentery', p.age < 5 || p.elder ? 45 : 35, { cause: 'bad water' })) return `${p.first} has dysentery from the water: cramps and blood. Filter it or boil it, and keep them drinking.`;
  n.hurt.push({ what: 'giardia (bad water)', sev: 25 });
  return 'Someone is sick from the creek water. Filter it or boil it.';
}

// ── the day ──

const BONES_ADULT: Bone[] = ['wrist', 'wrist', 'arm', 'collarbone', 'ribs', 'ankle', 'ankle', 'leg'];

/** Once a day (after eating and medicine): accidents and illnesses, and each case's course. Returns log lines. */
export function medicalDay(s: GameState): string[] {
  const M = medicalOf(s), day = dayIndex(s.clock.t);
  if (M.day === day) return [];
  M.day = day;
  const out: string[] = [];
  const r = mulberry32(s.seed * 8123 + day * 37 + 29);
  const after = s.disaster.kind != null && s.clock.t >= s.disaster.hitAt;
  const doy = (s.clock.startDoy - 1 + day) % 365 + 1;
  const winter = doy > 310 || doy < 70;
  const living = s.people.filter(p => here(s, p));
  // ── new cases ──
  for (const p of living) {
    const w = s.learning?.today[p.id];
    const hb = w ? w.build + w.carry * 0.3 + w.fit * 0.5 : 0, hf = w ? w.fell : 0;
    const who = p.first;
    if (r() < 1.5e-4 * hb + 3e-4 * hf) {
      const c = startCase(s, p.id, 'cut', 15 + Math.round(r() * 15), { cause: hf > hb ? 'the chainsaw' : 'a slipped saw' });
      if (c) out.push(`${who} laid a hand open with ${c.cause}: it needs stitches.`);
    }
    if (r() < 2e-4 * hb) {
      const c = startCase(s, p.id, 'puncture', 8, { cause: 'a rusty nail' });
      if (c) {
        out.push(`${who} stepped on a rusty nail.`);
        if (!tetanusCovered(s, p)) {
          if (careFor(s, p.id).hospital) { bill(s, 90); M.tetanus[p.id] = yearOf(s); out.push(`No tetanus shot in ten years: a booster and immune globulin at the clinic ($90).`); }
          else if (r() < 0.03) c.tetanusAt = day + 5 + Math.floor(r() * 10);
        }
      }
    }
    // falls: on the job, kids being kids, an elder on the ice
    const fall = 2.5e-5 * hb + 5e-5 * hf + (p.kid && p.age >= 5 ? 0.012 / 365 : 0) + (p.elder ? 0.02 / 365 * (winter ? 1.6 : 1) : 0);
    if (r() < fall) {
      const bone: Bone = p.elder && r() < 0.5 ? 'hip' : BONES_ADULT[Math.floor(r() * BONES_ADULT.length)];
      const c = startCase(s, p.id, 'fracture', bone === 'hip' ? 55 : bone === 'leg' ? 40 : 30, { bone, open: bone !== 'hip' && bone !== 'ribs' && r() < 0.08, cause: hf > 0 ? 'a tree that kicked back' : hb > 0 ? 'a fall off the roof' : p.elder ? 'a fall' : 'a fall out of a tree' });
      if (c) out.push(`${who} broke ${p.body === 'f' ? 'her' : 'his'} ${bone} in ${c.cause}${c.open ? ': the bone came through the skin' : ''}.`);
    }
    // burns: the stove, the lamps, the canner (more in a grid-down winter; little kids and hot pans)
    const burnK = (after && winter ? 2 : 1) * (p.kid && p.age < 6 ? 1.5 : 1);
    if (r() < 0.12 / 365 * burnK) { const c = startCase(s, p.id, 'burn', 10 + Math.round(r() * 10), { cause: 'the stove' }); if (c) out.push(`${who} burned ${p.body === 'f' ? 'her' : 'his'} hand on the stove.`); }
    else if (r() < 0.008 / 365 * burnK) { const c = startCase(s, p.id, 'burn', 35 + Math.round(r() * 25), { cause: after ? 'a lamp that tipped over' : 'a grease fire' }); if (c) out.push(`${who} was badly burned by ${c.cause}.`); }
    // appendicitis: about 1 in 1,000 a year, most in the teens and twenties
    const ageK = p.age < 5 ? 0.3 : p.age < 10 ? 0.8 : p.age <= 30 ? 1.6 : p.age <= 50 ? 0.8 : 0.5;
    if (r() < 0.0011 / 365 * ageK) { startCase(s, p.id, 'appendicitis', 50, { cause: 'appendicitis' }); out.push(`${who} has a fever and a pain low on the right side of the belly that won't go away.`); }
  }
  // the outhouse too close to the hand well (GDS §10.5: under ~30 m and the well picks it up)
  const wells = s.structures.filter(x => x.kind === 'well_hand' && isFinished(x)), privies = s.structures.filter(x => x.kind === 'outhouse' && isFinished(x));
  const near = wells.some(w => privies.some(o => Math.hypot(w.x - o.x, w.z - o.z) < 5)) && !s.utilities.hauling;
  if (near) {
    if (!M.noted.includes('privy')) { M.noted.push('privy'); out.push('The outhouse is too close to the hand well: under 30 m, and the water can pick it up.'); }
    for (const p of living) if (r() < 0.0015 && startCase(s, p.id, 'dysentery', p.age < 5 || p.elder ? 45 : 35, { cause: 'the well' })) out.push(`${p.first} has dysentery. The outhouse is too close to the well.`);
  }
  // insulin gone: ketoacidosis
  for (const p of living) if (p.conditions?.includes('insulin')) {
    const w = s.body.without[p.id] ?? 0, c = M.cases.find(x => x.pid === p.id && x.kind === 'dka');
    if (w >= 2 && !c) startCase(s, p.id, 'dka', 50, { care: 'no insulin' });
    else if (w === 0 && c) { close(s, c); out.push(`${p.first} has insulin again.`); }
  }
  // dysentery spreads without soap
  const flux = M.cases.filter(c => c.kind === 'dysentery').length;
  if (flux) for (const p of living) if (!M.cases.some(c => c.pid === p.id && c.kind === 'dysentery') && r() < (s.stock.hygiene >= 0.5 || s.disaster.tracks.stores >= 0.5 ? 0.006 : 0.02) * flux) startCase(s, p.id, 'dysentery', p.age < 5 || p.elder ? 45 : 35, { cause: 'the sick room' });

  // ── each case's course ──
  for (const c of [...M.cases]) {
    const p = person(s, c.pid), n = needsOf(s, c.pid);
    if (!p || !n || n.died != null) { if (!n || n.died != null) close(s, c); continue; }
    if (!M.cases.includes(c)) continue;
    const care = careFor(s, c.pid);
    const age = day - c.day;
    const first = !c.seen; c.seen = true;
    const line = step(s, c, p, care, age, first, r);
    if (line) out.push(line);
    if (!M.cases.includes(c)) continue;
    // pain and worry
    if (c.sev >= 30) { n.morale = Math.max(0, n.morale - (c.kind === 'abscess' || c.kind === 'burn' || c.kind === 'fracture' ? 1.5 : 1)); psyOf(s, c.pid).stress = Math.min(100, psyOf(s, c.pid).stress + 0.5); }
    // the medic's hour a day with them
    if (!care.hospital && care.medic) medXp(s, care, c.sev >= 30 ? 1 : 0.5);
    sync(s, c);
  }
  // the fight wounds and illnesses the hurt list heals on its own (needs.ts): practice for whoever tends them
  for (const p of living) for (const h of needsOf(s, p.id)!.hurt) if (!h.med && h.sev > 5) { const care = careFor(s, p.id); if (!care.hospital) medXp(s, care, h.trauma ? 1.5 : 0.4); }
  return out;
}

/** One case, one day. Returns a line for the log, or null. */
function step(s: GameState, c: MedCase, p: Person, care: Care, age: number, first: boolean, r: () => number): string | null {
  const day = dayIndex(s.clock.t), n = needsOf(s, p.id)!;
  const who = p.first, m = care.medic?.first;
  const healOver = (days: number) => { if (c.until == null) c.until = day + days; };
  const healing = () => {
    // an infection holds up the mending
    if (c.infected && c.until != null) c.until++;
    // done
    if (c.until != null && day >= c.until) {
      if (c.kind === 'fracture' && c.badSet) (medicalOf(s).lasting[p.id] ??= []).push(`a ${c.bone} that healed crooked`);
      close(s, c);
      return c.kind === 'fracture' ? `${who}'s ${c.bone} has knit${c.badSet ? ', not straight' : ''}.` : null;
    }
    if (c.until != null) c.sev = Math.max(1, c.sev * (1 - 1 / Math.max(2, c.until - day + 1)));
    return null;
  };
  // an infection: antibiotics, or it can become sepsis
  if (c.infected && c.kind !== 'sepsis') {
    if (care.hospital) { bill(s, 300); c.infected = false; c.care = 'antibiotics from the clinic'; }
    else if ((c.abx == null || day - c.abx > 10) && takeAntibiotics(s)) { c.abx = day; c.infected = false; c.care += ', antibiotics for the infection'; medXp(s, care, 1); return `${m ?? who} started ${who} on antibiotics for the infection.`; }
    else if (r() < 0.03) { close(s, c); const sc = startCase(s, p.id, 'sepsis', 85, { cause: `an infected ${NAME[c.kind]}` }); return sc ? `${who}'s infection has gone into the blood: fever, shaking, confused. Sepsis.` : null; }
  }
  switch (c.kind) {
    case 'cut': {
      if (first) {
        if (care.hospital) { bill(s, 250); c.care = 'stitched at urgent care'; c.plan = 'sutured'; }
        else if ((s.stock.suture_kit ?? 0) >= 0.05 && care.medic) { s.stock.suture_kit -= 0.05; c.care = `stitched by ${m}`; c.plan = 'sutured'; medXp(s, care, 2); }
        else if (s.stock.meds >= 0.1) { s.stock.meds -= 0.1; c.care = 'cleaned and taped shut'; c.plan = 'taped'; }
        else { c.care = 'wrapped in a clean rag'; c.plan = 'open'; }
        healOver(c.plan === 'open' ? 16 : 10);
      }
      if (!c.infected && age < 8 && r() < (c.plan === 'sutured' ? 0.003 : c.plan === 'taped' ? 0.008 : 0.015) * (care.bay ? 0.6 : 1)) { c.infected = true; return `${who}'s cut is red, hot and swelling: infected.`; }
      return healing();
    }
    case 'puncture': {
      if (first) { c.care = s.stock.meds >= 0.05 ? 'cleaned out' : 'washed'; if (s.stock.meds >= 0.05) s.stock.meds -= 0.05; healOver(6); }
      if (c.tetanusAt != null && day >= c.tetanusAt) { close(s, c); startCase(s, p.id, 'tetanus', 75, { cause: 'the nail' }); return `${who}'s jaw has locked and the muscles spasm: tetanus, from the nail.`; }
      if (!c.infected && age < 6 && r() < (c.care === 'cleaned out' ? 0.004 : 0.01)) { c.infected = true; return `${who}'s foot is infected where the nail went in.`; }
      if (c.tetanusAt != null && c.until != null && day >= c.until) { c.care = 'healed over'; c.sev = 1; c.until = c.tetanusAt + 1; }
      return healing();
    }
    case 'burn': {
      if (first) { c.care = care.hospital && c.sev >= 35 ? 'treated at the ER' : 'cooled and dressed'; if (care.hospital && c.sev >= 35) bill(s, 600); healOver(c.sev >= 35 ? 21 + Math.round(r() * 14) : 8); }
      const dressed = care.hospital || dress(s, c.sev >= 35 ? 0.15 : 0.05);
      if (!dressed) c.care = 'no clean dressings';
      if (c.sev >= 35 && !c.infected && r() < (dressed ? 0.004 : 0.02) * (care.bay ? 0.6 : 1)) { c.infected = true; return `${who}'s burn is infected.`; }
      return healing();
    }
    case 'fracture': {
      if (first) {
        if (care.hospital) { bill(s, c.bone === 'hip' ? 4000 : 800); c.care = c.bone === 'hip' ? 'a new hip at the hospital' : 'set and cast at the hospital'; }
        else {
          const good = care.skill >= 3 ? Math.min(0.97, 0.55 + 0.06 * care.skill + (care.books ? 0.05 : 0)) : 0.35 + 0.05 * care.skill;
          c.badSet = c.bone !== 'ribs' && c.bone !== 'hip' && r() >= good;
          const splint = s.stock.meds >= 0.2 ? (s.stock.meds -= 0.2, 'a splint from the kit') : 'a splint of boards and rags';
          c.care = c.bone === 'ribs' ? 'strapped, resting' : c.bone === 'hip' ? 'in bed, traction from a sandbag' : `${m ? `set by ${m}` : 'set as best they could'}, ${splint}`;
          medXp(s, care, 8);
          if (c.open && !takeAntibiotics(s)) c.infected = r() < 0.5;
        }
        healOver(BONE_WEEKS[c.bone ?? 'arm'] * 7);
        return care.hospital ? null : c.badSet ? `${m ?? 'They'} set ${who}'s ${c.bone}; it doesn't look quite straight.` : null;
      }
      // a broken hip in bed for months without a hospital: pneumonia, clots
      if (c.bone === 'hip' && !care.hospital && r() < (care.skill >= 4 ? 0.0018 : 0.0035)) return dies(s, c, 'complications of a broken hip');
      return healing();
    }
    case 'abscess': {
      if (c.recurAt != null) { if (day >= c.recurAt) { c.recurAt = undefined; c.sev = 30; c.care = 'flared up again'; c.until = undefined; c.plan = undefined; return `${who}'s tooth has flared up again.`; } c.sev = 1; c.care = 'settled on antibiotics, for now'; return null; }
      if (c.plan === 'pulled' || c.plan === 'abx') {
        if (c.plan === 'abx' && c.until != null && day >= c.until) {
          if (r() < 0.35) { c.recurAt = day + 30 + Math.floor(r() * 60); c.until = undefined; return null; }
          close(s, c); return null;
        }
        return healing();
      }
      // pull it: the dental kit and someone with a little training (or the books); else antibiotics; then, past bearing, pliers
      const kit = (s.stock.dental_kit ?? 0) >= 0.1 - 1e-9;
      if (care.medic && kit && (care.skill >= 2)) {
        s.stock.dental_kit -= 0.1; medXp(s, care, 6);
        if (r() < Math.min(0.95, 0.7 + 0.03 * care.skill + (care.books ? 0.05 : 0))) { c.plan = 'pulled'; c.care = `tooth pulled by ${m} with the dental kit`; healOver(5); takeAntibiotics(s); return `${m} pulled ${who}'s bad tooth with the dental kit.`; }
        c.infected = true; c.care = 'the root broke off'; return `${m} tried to pull ${who}'s tooth; the root broke off in the jaw.`;
      }
      if (haveAntibiotics(s) && c.plan !== 'broken') {
        const how = takeAntibiotics(s);
        c.plan = 'abx'; c.care = how === 'fish' ? 'on fish antibiotics' : 'on antibiotics'; healOver(7); medXp(s, care, 1);
        return `${who} is on antibiotics for the tooth${how === 'fish' ? ' (the aquarium amoxicillin)' : ''}.`;
      }
      if (age >= 3 && care.medic && !p.kid && c.plan !== 'broken') {
        medXp(s, care, 4);
        n.morale = Math.max(0, n.morale - 8); psyOf(s, p.id).stress = Math.min(100, psyOf(s, p.id).stress + 6);
        if (r() < 0.45 + 0.04 * care.skill + (care.books ? 0.05 : 0)) { c.plan = 'pulled'; c.care = `pulled with pliers by ${m}`; healOver(7); return `${m} pulled ${who}'s tooth with a pair of pliers and a shot of whiskey. It came out whole.`; }
        c.infected = true; c.care = 'pliers broke the tooth'; c.plan = 'broken'; return `${m} tried the pliers on ${who}'s tooth. It broke. The swelling is worse.`;
      }
      // untreated: it may drain on its own, or spread
      if (r() < 0.03) { c.plan = 'pulled'; c.care = 'drained on its own'; healOver(7); c.sev = 10; return `${who}'s abscess burst and drained. The swelling is going down.`; }
      if (r() < 0.006) { close(s, c); startCase(s, p.id, 'sepsis', 85, { cause: 'the tooth' }); return `The infection from ${who}'s tooth has spread: high fever, the face swollen shut. Sepsis.`; }
      c.care = 'clove oil and salt water'; return null;
    }
    case 'appendicitis': {
      if (c.plan == null && age >= 1) {
        const { plan, pDeath } = appendicitisPlan(s, p.id);
        c.plan = plan; c.crisis = day + 2; c.fatal = r() < pDeath;
        if (plan === 'hospital') { bill(s, 2500); c.care = 'appendix out at the hospital'; c.fatal = false; c.until = day + 14; return `${who} had an appendectomy at the county hospital ($2,500 after insurance).`; }
        if (plan === 'surgery') {
          if ((s.stock.surgical_kit ?? 0) >= 0.25 - 1e-9) s.stock.surgical_kit -= 0.25;
          const abx = takeAntibiotics(s);
          medXp(s, care, 25);
          c.care = `operated on by ${m}${care.bay ? ' in the medical bay' : ' on the kitchen table'}${abx ? ', antibiotics after' : ''}`;
          return `${m} took out ${who}'s appendix${care.bay ? ' in the medical bay' : ' on the kitchen table'}, working from the book.`;
        }
        if (plan === 'antibiotics') { takeAntibiotics(s); medXp(s, care, 3); c.care = `on antibiotics, ${m} watching the fever`; return `${m} thinks it's ${who}'s appendix. No one here can operate: antibiotics, and wait.`; }
        c.care = care.medic ? 'no one knows what to do' : 'no one to help';
        return `${who} is getting worse: the pain, the fever. ${care.skill >= 3 ? 'It\'s the appendix, and there\'s nothing to treat it with.' : 'Nobody knows what it is.'}`;
      }
      if (c.crisis != null && day >= c.crisis && c.until == null) {
        if (c.fatal) { c.sev = 95; c.care = 'it burst: peritonitis'; c.crisis = undefined; c.until = undefined; c.plan = 'dying'; return `${who}'s appendix has burst.`; }
        c.until = day + (c.plan === 'surgery' ? 21 : c.plan === 'antibiotics' ? 14 : 30);
        c.care = c.plan === 'none' ? 'it walled itself off; weak, mending' : c.plan === 'surgery' ? `the stitches holding, ${m ?? 'they'} keeping it clean` : 'the fever broke';
        return c.plan === 'none' ? `Against the odds, ${who}'s fever broke. The worst may be over.` : c.plan === 'surgery' ? `${who} is through the worst after the operation.` : `${who}'s fever broke on the antibiotics.`;
      }
      if (c.plan === 'dying' && day >= (c.day + 5)) return dies(s, c, 'a burst appendix');
      if (c.until != null) return healing();
      c.sev = Math.min(90, c.sev + 8);
      return null;
    }
    case 'sepsis': {
      if (c.plan == null) {
        let pDeath: number;
        if (care.hospital) { bill(s, 4000); c.care = 'in intensive care'; pDeath = 0.15; }
        else if (takeAntibiotics(s)) { c.care = `antibiotics${care.bay ? ' and IV fluids in the bay' : ', fluids by mouth'}${m ? `, ${m} at the bedside` : ''}`; pDeath = care.bay ? 0.15 : Math.max(0.15, 0.27 - 0.01 * care.skill); medXp(s, care, 4); }
        else { c.care = 'nothing to treat it with'; pDeath = 0.7; }
        c.plan = 'treated'; c.crisis = day + 3; c.fatal = r() < pDeath;
        return null;
      }
      if (c.crisis != null && day >= c.crisis) {
        if (c.fatal) return dies(s, c, 'sepsis');
        c.crisis = undefined; c.sev = 45; c.until = day + 14; c.care = 'through it, weak';
        return `${who} is through the sepsis. Weeks to get strength back.`;
      }
      return c.until != null ? healing() : null;
    }
    case 'tetanus': {
      if (c.plan == null) {
        let pDeath: number;
        if (care.hospital) { bill(s, 6000); c.care = 'in intensive care'; pDeath = 0.12; }
        else {
          const sedate = care.skill >= 4 && dress(s, 0.5);
          const abx = takeAntibiotics(s);
          pDeath = 0.5 - (sedate ? 0.15 : 0) - (abx ? 0.05 : 0) - (care.bay ? 0.1 : 0);
          c.care = `a dark, quiet room${abx ? ', antibiotics' : ''}${sedate ? `, ${m} keeping the spasms down` : ''}`;
          medXp(s, care, 5);
        }
        c.plan = 'treated'; c.crisis = day + 7 + Math.floor(r() * 7); c.fatal = r() < pDeath;
        return null;
      }
      if (c.crisis != null && day >= c.crisis) {
        if (c.fatal) return dies(s, c, 'tetanus');
        c.crisis = undefined; c.sev = 45; c.until = day + 21; c.care = 'the spasms easing';
        medicalOf(s).tetanus[p.id] = yearOf(s);   // (having it doesn't protect you; the family boosts after)
        return `${who}'s spasms are easing. They'll live.`;
      }
      return c.until != null ? healing() : null;
    }
    case 'dysentery': {
      if (first) {
        if (care.hospital) { bill(s, 150); c.care = 'antibiotics from the clinic'; healOver(4); }
        else if (takeAntibiotics(s)) { c.care = 'antibiotics and rehydration'; healOver(4); }
        else { c.care = 'rehydration: salt, sugar, boiled water'; healOver(8); }
        medXp(s, care, 1);
      }
      // drying out kills the little ones and the old: water and knowing how to rehydrate
      const vulnerable = p.age < 5 || p.age >= 70;
      const dry = s.utilities.report.shortL > s.utilities.report.useL * 0.3;
      const knows = care.hospital || care.skill >= 2 || care.books || s.stock.meds >= 0.1;
      if (!care.hospital && r() < (vulnerable ? 0.012 : 0.0015) * (dry ? 3 : 1) * (knows ? 0.3 : 1)) return dies(s, c, 'dysentery');
      if (knows && s.stock.meds >= 0.05) s.stock.meds -= 0.05;
      return healing();
    }
    case 'postpartum': return healing();
    case 'dka': {
      // fluids and salts in the bay, a medic watching: it slows, it doesn't stop
      if (care.bay && care.skill >= 4) { n.health = Math.min(100, n.health + 2); c.care = `no insulin; ${m} keeping fluids in`; }
      c.sev = Math.min(95, 50 + 3 * (s.body.without[p.id] ?? 0));
      return null;
    }
  }
}
