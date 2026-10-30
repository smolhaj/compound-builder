/**
 * Medical depth (people depth part 2; GDS 10.6 "chronic meds that run out,
 * infections, surgery checks against medic skill, childbirth, dental
 * emergencies"). Pure; once a day plus hooks. Game-level first aid and
 * nursing vocabulary only: courses of antibiotics, dressings, splints, rest.
 *
 * A case is an entry in `Needs.hurt` carrying a `med` record, so everything
 * that already reads `hurt` (the roster's fitness, the work rate, the Family
 * tab, the night's emergency) keeps working. Injuries and illnesses made
 * elsewhere (a fight wound, a fall, a toothache, a fever, bad water) are
 * adopted into the chain the first night. The daily course lives here.
 *
 *  Wound       open: dressed daily (dressings from the kit), kept clean it
 *              heals; neglected it goes septic. Infection needs a course of
 *              antibiotics or it spreads: sepsis kills most people without them.
 *  Fracture    needs a splint and someone who knows how (set well, it heals in
 *              5 to 12 weeks, off heavy work; set badly it heals crooked for good).
 *              A broken hip in the old is months in bed.
 *  Burn        the stove, the lamp, the canner: dressed, 2 to 4 weeks; infects.
 *  Frostbite   a long winter watch in the cold: warm it up, or lose fingertips.
 *  Abscess     a toothache left past a week: antibiotics settle it for a while,
 *              pulling the tooth ends it (dental kit; pliers if you must).
 *  Dysentery   bad water and a house without soap: days of flux, deadly to the
 *              little and the old if they dry out; rehydration salts; spreads.
 *  Flu         goes round a house in the winter, from the gate, the market, a
 *              scavenging run: the sick can be kept apart (quarantine), at a
 *              price; the weak get pneumonia.
 *  Childbirth  a pregnancy runs nine months; the delivery is safer with a
 *              medic and a midwife kit and safest at a hospital; weeks of
 *              recovery; postpartum low mood in about one in eight.
 *
 * Supplies: antibiotics (courses), the medical kit (`meds`: dressings and two
 * short courses), splints, rehydration salts, a dental kit, a midwife kit,
 * medical books. Antibiotics are the scarce one: a policy says whether they go
 * on every infection or only the serious ones. The hospital (county
 * `tracks.medical`) takes the serious cases while it works, for a bill.
 *
 * Chronic medicines (sim/body.ts) now have a shelf life, and supply
 * warnings go to the next-step card.
 */
import { frostChance } from './cold';
import { seepageChance } from './sanitation';
import { airliftBill, airliftCase, airliftReady } from './outposts';
import { dayIndex, calendarOf, type GameState } from './state';
import { isFinished } from './construction';
import { log } from './economy';
import { mulberry32 } from './rng';
import { practice } from './skills';
import { psyOf } from './mind';
import type { Person } from './family';

export type MedKind = 'wound' | 'burn' | 'fracture' | 'frostbite' | 'abscess' | 'infection' | 'dysentery' | 'flu' | 'postpartum' | 'infant';
export type Bone = 'wrist' | 'arm' | 'collarbone' | 'ribs' | 'ankle' | 'leg' | 'hip';
/** Days a fracture takes to knit (hips in the old take far longer: see `knitDays`). */
export const BONE_DAYS: Record<Bone, number> = { wrist: 35, collarbone: 42, arm: 49, ribs: 35, ankle: 49, leg: 70, hip: 84 };
export const MED_NAME: Record<MedKind, string> = {
  wound: 'wound', burn: 'burn', fracture: 'broken bone', frostbite: 'frostbite', abscess: 'tooth abscess', infection: 'infection', dysentery: 'dysentery', flu: 'flu', postpartum: 'recovering from childbirth', infant: 'infant illness',
};

export interface MedCase {
  kind: MedKind;
  /** Day it started. */
  day: number;
  /** What has been done, in words (the Family tab). */
  care: string;
  /** Dressed and clean today (wounds, burns). */
  clean?: boolean;
  bone?: Bone;
  /** Fracture: set and splinted, and how well. */
  set?: 'good' | 'bad';
  /** Day the course of antibiotics began (infection) or the last was given. */
  abx?: number;
  /** An infection already settled once; a relapse is likelier. */
  relapse?: boolean;
  /** Where the illness came from (for the log and quarantine): 'water', 'contact', 'house'. */
  src?: string;
  /** Sent to the hospital. */
  hosp?: boolean;
  /** The sepsis warning has been given. */
  noted?: boolean;
}

export interface Epidemic { kind: 'flu' | 'dysentery'; since: number; quarantine: boolean; asked: boolean; cases: number }
export interface Pregnancy { due: number; since: number; father: string; prenatal: boolean }
export interface Medical {
  day: number;
  /** Lasting effects: a crooked arm, a stiff hip, a limp, fingertips lost. */
  lasting: Record<string, string[]>;
  pregnancies: Record<string, Pregnancy>;
  epidemic: Epidemic | null;
  /** Antibiotics on every infection, or only the serious ones (saves them for when it counts). */
  policy: 'serious' | 'all';
  /** Cases seen (the report). */
  seen: number;
  noted: string[];
}
export const newMedical = (): Medical => ({ day: -1, lasting: {}, pregnancies: {}, epidemic: null, policy: 'serious', seen: 0, noted: [] });
export function medicalOf(s: GameState): Medical { s.medical ??= newMedical(); return s.medical; }

const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const here = (s: GameState, p: Person) => { const n = s.personState.find(x => x.id === p.id)?.needs; return !!n && n.died == null && !n.taken && !n.left; };
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const cozy = (s: GameState) => s.disaster.difficulty === 'cozy';
/** Hardcore is realistic: untreated sepsis and dehydration kill adults too. Cozy and Standard are gentle (a healthy adult usually pulls through). */
export const harsh = (s: GameState) => s.disaster.difficulty === 'hardcore';
const hospitalOpen = (s: GameState) => s.disaster.tracks.medical >= 0.5 && s.disaster.tracks.banks >= 0.5;
export const HOSPITAL_USD = 3500;
/** Kit units one short course of antibiotics takes out of the medical kit. */
export const KIT_PER_COURSE = 0.4;

// ── who helps, with what ──

export interface Care {
  /** The best able adult who is not the patient. */
  medic: Person | null;
  skill: number;
  bay: boolean;
  hospital: boolean;
  books: boolean;
}
/** Who tends a patient and with what: the best medic present (not the patient, not themselves in bed), a book above the skill, the bay, the hospital. */
export function careFor(s: GameState, patientId: string): Care {
  const able = s.people.filter(p => p.id !== patientId && here(s, p) && (!p.kid || p.age >= 14) && (s.personState.find(x => x.id === p.id)?.needs.health ?? 0) >= 30);
  const medic = [...able].sort((a, b) => b.skills.medic - a.skills.medic)[0] ?? null;
  const books = (s.stock.medical_books ?? 0) >= 1;
  return { medic, books, skill: medic ? Math.min(10, medic.skills.medic + (books ? 1 : 0)) : 0, bay: s.structures.some(x => x.kind === 'bunker_medical' && isFinished(x)), hospital: hospitalOpen(s) };
}
/** Antibiotic courses on hand (loose courses plus the kit's). */
export const courses = (s: GameState): number => Math.floor((s.stock.antibiotics ?? 0) + 1e-6) + Math.floor(s.stock.meds / KIT_PER_COURSE + 1e-6);
/** Take a course: loose courses first, then the kit's. */
export function takeCourse(s: GameState): boolean {
  if ((s.stock.antibiotics ?? 0) >= 1 - 1e-9) { s.stock.antibiotics -= 1; return true; }
  if (s.stock.meds >= KIT_PER_COURSE - 1e-9) { s.stock.meds -= KIT_PER_COURSE; return true; }
  return false;
}
const takeDressings = (s: GameState): boolean => { if (s.stock.meds >= 0.1 - 1e-9) { s.stock.meds -= 0.1; return true; } return false; };
const hygieneOk = (s: GameState) => s.disaster.tracks.stores >= 0.5 || s.stock.hygiene >= 0.5;
const bayOn = (s: GameState) => s.structures.some(x => x.kind === 'bunker_medical' && isFinished(x));

/** Is a course worth spending here under the policy: everything on `all`, only the serious ones (sepsis, the old and the little, deep infections) on `serious`. */
function worthCourse(s: GameState, p: Person, sev: number): boolean {
  return medicalOf(s).policy === 'all' || sev >= 45 || p.kid && p.age < 8 || p.elder || p.age >= 65;
}

export const casesOf = (s: GameState, pid: string) => (s.personState.find(x => x.id === pid)?.needs.hurt ?? []).filter(h => h.med);
export const lastingOf = (s: GameState, pid: string): string[] => s.medical?.lasting[pid] ?? [];
/** The work rate cost of lasting effects (a bad leg, a stiff arm, fingertips lost): 1 = none. */
export function lastingWork(s: GameState, pid: string): number {
  const l = lastingOf(s, pid);
  return l.length ? Math.max(0.7, 1 - 0.08 * l.length) : 1;
}

// ── adoption: injuries made elsewhere join the chain ──

const WOUND_RE = /shot|grazed|shrapnel|head wound|blast|beaten|firearm|armor|roadblock|wounded|cut|gash/;
function adopt(s: GameState, p: Person, h: { what: string; sev: number; trauma?: boolean; med?: MedCase }, r: () => number): void {
  if (h.med) return;
  const day = dayIndex(s.clock.t), w = h.what;
  const make = (kind: MedKind, extra: Partial<MedCase> = {}): void => { h.med = { kind, day, care: 'not treated yet', ...extra }; medicalOf(s).seen++; };
  if (h.trauma && WOUND_RE.test(w)) return make('wound');
  if (/^toothache/.test(w)) return make('abscess');
  if (/^fever/.test(w)) return make('flu', { src: 'contact' });
  if (/giardia|bad water/.test(w)) { h.what = 'dysentery (bad water)'; h.sev = Math.max(h.sev, 35); return make('dysentery', { src: 'water' }); }
  if (/a fall|hunting accident|fall taking a risk|flying debris|firearm accident|hurt in the crush/.test(w)) {
    const old = p.age >= 70;
    if (r() < (old ? 0.4 : p.kid ? 0.22 : 0.18)) {
      const bone: Bone = old && r() < 0.6 ? 'hip' : (['wrist', 'arm', 'collarbone', 'ribs', 'ankle', 'leg'] as const)[Math.floor(r() * 6)];
      h.what = `broken ${bone === 'hip' ? 'hip' : bone}`; h.sev = bone === 'hip' ? 70 : bone === 'leg' ? 55 : 45;
      return make('fracture', { bone });
    }
    if (/hunting|firearm|debris/.test(w)) return make('wound');
  }
  if (/burn/.test(w)) return make('burn');
}

// ── the course of each case ──

/** Days a fracture takes to knit (the old take longer). */
export const knitDays = (bone: Bone, p: Person): number => Math.round(BONE_DAYS[bone] * (p.elder || p.age >= 65 ? 1.4 : p.kid ? 0.7 : 1));

interface Ctx { s: GameState; p: Person; n: NonNullable<GameState['personState'][number]['needs']>; h: { what: string; sev: number; trauma?: boolean; med?: MedCase }; c: MedCase; care: Care; r: () => number; out: string[] }

/** The daily course: returns true when the case ends (healed, died or sent away). */
function course(x: Ctx): boolean {
  const { s, p, n, h, c, care, r, out } = x;
  const day = dayIndex(s.clock.t), age = day - c.day;
  const skill = care.skill + (care.bay ? 2 : 0);
  const nameOf = p.first;
  const die = (why: string) => {
    if (cozy(s)) { n.health = Math.max(n.health, 5); h.sev = Math.min(h.sev, 60); return false; }
    n.health = 0; n.died = Math.floor(s.clock.t); out.push(`${nameOf} died of ${why}.`); return true;
  };
  // the air ambulance, with a helipad on the place (sim/outposts.ts): the bad wounds, burns and broken legs and hips fly out
  if (!c.hosp && airliftReady(s) && airliftCase(c.kind, h.sev, c.bone) && s.money >= airliftBill(s)) {
    const bill = airliftBill(s);
    s.money -= bill; c.hosp = true; h.sev = Math.min(h.sev, 25); c.care = 'flown to the trauma centre';
    out.push(`${nameOf} was flown out from the pad to the trauma centre: $${bill.toLocaleString('en-US')}${s.paper.insured ? ' after insurance' : ''}.`);
    if (c.kind === 'fracture') c.set = 'good';
    if (c.kind !== 'fracture') return true;
  }
  // the serious ones go to the hospital while it works (for a bill)
  if (care.hospital && !c.hosp && (c.kind === 'infection' && h.sev >= 75 || c.kind === 'fracture' && c.bone === 'hip' || c.kind === 'dysentery' && h.sev >= 70) && s.money >= HOSPITAL_USD) {
    s.money -= HOSPITAL_USD; c.hosp = true; h.sev = Math.min(h.sev, 25); c.care = 'at the county hospital';
    out.push(`${nameOf} went to the county hospital (${'$' + HOSPITAL_USD.toLocaleString('en-US')}).`);
    if (c.kind === 'fracture') c.set = 'good';
    if (c.kind !== 'fracture') return true;
  }
  const practiceIt = (hrs: number) => { if (care.medic) practice(s, care.medic.id, 'medic', hrs); };
  switch (c.kind) {
    case 'wound':
    case 'burn': {
      // dressed and kept clean (someone who knows, or the bay), or not
      const dressed = takeDressings(s), improv = !dressed && care.skill >= 3;   // a practiced hand makes do with boiled cloth
      const clean = dressed || improv;
      c.clean = clean;
      c.care = dressed ? (care.bay ? 'dressed daily in the medical bay' : 'dressed daily') : improv ? 'dressed with boiled cloth' : (care.medic ? 'no dressings left' : 'nobody to dress it');
      if (clean) practiceIt(0.5);
      const infect = 0.035 * (dressed ? 0.22 : improv ? 0.4 : 1) * (hygieneOk(s) ? 1 : 1.5) * (care.bay ? 0.5 : 1) / (1 + skill * 0.08) * (c.kind === 'burn' ? 0.8 : 1) * (age < 1 ? 0.3 : 1);
      if (r() < infect && h.sev >= 8) {
        c.kind = 'infection'; c.day = day; c.care = 'infected: needs antibiotics'; h.what = `${h.what.replace(/ \(infected\)/, '')} (infected)`; h.sev = clamp(h.sev + 14);
        out.push(`${nameOf}'s ${c.kind === 'infection' ? 'wound' : MED_NAME[c.kind]} has gone bad: hot, red and swollen. It needs antibiotics.`);
        break;
      }
      // (anyone can put on a dressing from the kit; a practiced hand does it better)
      const heal = dressed ? 2.5 + 0.5 * care.skill + (care.bay ? 2.5 : 0) : improv ? 1 + 0.5 * care.skill + (care.bay ? 2.5 : 0) : 0.3;
      h.sev = Math.max(0, h.sev - heal * (c.kind === 'burn' ? 0.7 : 1));
      break;
    }
    case 'infection': {
      const given = c.abx !== undefined && day - c.abx < 7;
      if (!given && worthCourse(s, p, h.sev) && courses(s) >= 1 && takeCourse(s)) { c.abx = day; out.push(`${nameOf} started a course of antibiotics.`); practiceIt(0.5); }
      const on = c.abx !== undefined && day - c.abx < 7;
      if (on) { c.care = `on antibiotics since day ${c.abx}`; h.sev = Math.max(0, h.sev - (10 + care.skill * 0.5 + (care.bay ? 2 : 0))); if (h.sev <= 10) { h.sev = 0; out.push(`${nameOf}'s infection has cleared.`); } }
      else {
        c.care = courses(s) < 1 ? 'no antibiotics left' : 'waiting: saved for worse cases';
        // untreated it creeps up; the body can turn the corner (a healthy adult more often), and about half do not
        h.sev = clamp(h.sev + 1.3 - skill * 0.1);
        if (h.sev >= 60 && n.health >= 50 && r() < 0.05 + skill * 0.01) { h.sev = Math.max(0, h.sev - 25); c.care = 'the fever broke'; }
        if (h.sev >= 85 && r() < (0.07 - skill * 0.004) * (n.health >= 60 && !p.kid && !p.elder && !harsh(s) ? 0.3 : 1)) return die('blood poisoning');   // (a healthy adult more often pulls through)
        if (h.sev >= 70 && !c.noted) { c.noted = true; out.push(`${nameOf} has a fever and a racing heart: the infection is in the blood. It needs antibiotics now.`); }
      }
      if (on && h.sev > 80 && r() < 0.03) return die('blood poisoning');
      break;
    }
    case 'fracture': {
      const bone = c.bone ?? 'arm', T = knitDays(bone, p);
      if (!c.set) {
        const splint = (s.stock.splints ?? 0) >= 1 - 1e-9 ? 'kit' : s.stock.lumber >= 0.05 && care.skill >= 2 ? 'wood' : null;
        if (care.hospital && s.money >= 1200 && bone !== 'ribs') { s.money -= 1200; c.set = 'good'; c.care = 'set at the clinic'; out.push(`${nameOf}'s ${bone} was set at the clinic ($1,200).`); }
        else if ((care.skill >= 1 || care.bay) && splint) {
          if (splint === 'kit') s.stock.splints -= 1; else s.stock.lumber -= 0.05;
          c.set = (care.skill + (splint === 'kit' ? 2 : 0) + (care.bay ? 2 : 0) >= 4 || r() < 0.4 + 0.1 * care.skill) ? 'good' : 'bad';
          c.care = `${bone} set and splinted${c.set === 'bad' ? ' (roughly)' : ''}`; out.push(`${care.medic?.first ?? 'Someone'} set ${nameOf}'s ${bone} and splinted it.`); practiceIt(2);
        } else if (age >= 3) { c.set = 'bad'; c.care = 'strapped up with what there was'; out.push(`${nameOf}'s ${bone} was strapped up with a board and torn cloth: it will have to do.`); }
        else { c.care = splint ? 'nobody who knows how to set it' : 'no splint and nobody to set it'; h.sev = Math.max(h.sev, 40); n.morale -= 0.3; }
      }
      if (c.set) {
        const t = day - c.day, base = bone === 'hip' ? 70 : bone === 'leg' ? 55 : 45;
        const k = (c.set === 'good' ? 1 : 1.2);
        h.sev = Math.max(0, base * (1 - t / (T * k)));
        if (t >= T * k) {
          h.sev = 0;
          if (c.set === 'bad' && r() < 0.7 || bone === 'hip' && p.elder && r() < 0.4) {
            const l = bone === 'hip' ? 'a stiff hip' : bone === 'leg' || bone === 'ankle' ? 'a limp' : 'a crooked ' + bone;
            (medicalOf(s).lasting[p.id] ??= []).push(l); out.push(`${nameOf}'s ${bone} has healed, but ${l} is left.`);
          } else out.push(`${nameOf}'s ${bone} has knit.`);
        }
      } else if (bone === 'hip' && p.elder && age >= 20 && r() < 0.02) return die('complications after the broken hip');
      break;
    }
    case 'frostbite': {
      const warm = s.heat.burned >= 1 || s.structures.some(st => isFinished(st) && st.kind.includes('cabin'));
      c.care = warm ? 'warmed up and dressed' : 'cold: nowhere warm';
      h.sev = Math.max(0, h.sev - (warm ? 2.2 : 0.3));
      if (age === 1 && !warm && r() < 0.5 || age === 2 && warm && h.sev > 30 && r() < 0.15) { (medicalOf(s).lasting[p.id] ??= []).push('fingertips lost'); out.push(`${nameOf} lost the tips of two fingers to the frost.`); }
      break;
    }
    case 'abscess': {
      if (age < 7) { c.care = 'toothache: painkillers'; h.sev = Math.max(15, h.sev); n.morale -= 0.15; if (r() < 0.03 && age > 2) { h.sev = Math.max(0, h.sev - 10); } break; }
      // past a week it is an abscess
      h.what = 'tooth abscess';
      const kit = (s.stock.dental_kit ?? 0) >= 1 - 1e-9;
      if ((kit || care.skill >= 3) && r() < 0.5) { if (kit) s.stock.dental_kit -= 1; h.sev = 0; out.push(`${care.medic?.first ?? 'Someone'} pulled ${nameOf}'s bad tooth${kit ? '' : ' with pliers: not pretty, but it is out'}.`); practiceIt(1); break; }
      if (c.abx === undefined && worthCourse(s, p, 45) && courses(s) >= 1 && takeCourse(s)) { c.abx = day; c.care = 'antibiotics: settled for now'; h.sev = 12; c.relapse = true; }
      else if (c.abx !== undefined && day - c.abx > 25 && c.relapse) { c.abx = undefined; c.care = 'the swelling is back'; h.sev = 40; }
      else if (c.abx === undefined) { c.care = 'swollen jaw: needs the tooth out or antibiotics'; h.sev = clamp(h.sev + 1.2, 25, 80); if (h.sev >= 75 && r() < 0.01) { c.kind = 'infection'; c.day = day; h.what = 'infection spreading from a tooth'; out.push(`${nameOf}'s abscess has spread into the blood.`); } }
      n.morale -= 0.1;
      break;
    }
    case 'dysentery': {
      const salts = (s.stock.ors ?? 0) >= 0.1 - 1e-9;
      const little = p.kid && p.age < 8 || p.elder || p.age >= 70;
      if (salts) { s.stock.ors -= 0.1; c.care = 'rehydration salts and rest'; } else c.care = care.skill >= 2 ? 'sips of boiled water, salt and sugar' : 'nothing to rehydrate with';
      const fluids = salts ? 1 : care.skill >= 2 ? 0.6 : 0;
      let heal = 3 + fluids * 3;
      if (c.abx === undefined && h.sev >= 50 && worthCourse(s, p, h.sev) && courses(s) >= 1 && takeCourse(s)) { c.abx = day; out.push(`${nameOf} started antibiotics for dysentery.`); }
      if (c.abx !== undefined && day - c.abx < 5) heal += 4;
      h.sev = Math.max(0, h.sev + (fluids === 0 ? 2.5 : -heal));
      if (fluids < 0.5 && (little || harsh(s) && n.health < 60) && h.sev >= 65 && r() < (harsh(s) ? 0.09 : 0.05)) return die('dehydration');
      // it goes round a house without soap and clean water
      if (!hygieneOk(s) || !s.utilities.report || s.utilities.report.shortL > 0) spread(x, 0.03);
      else spread(x, 0.01);
      if (h.sev <= 0) out.push(`${nameOf} is over the dysentery.`);
      break;
    }
    case 'flu': {
      const weak = p.elder || p.age >= 65 || p.kid && p.age < 5 || n.health < 50;
      const rest = (s.personState.find(q => q.id === p.id)?.task === 'sleep' || h.sev < 40);
      h.sev = Math.max(0, h.sev - (4 + care.skill * 0.15 + (care.bay ? 1 : 0)) * (rest ? 1 : 0.6));
      c.care = care.skill >= 2 ? 'nursed: fluids and rest' : 'rest';
      if (weak && age >= 4 && age <= 9 && r() < 0.028 + (s.disaster.kind === 'bioweapon' ? 0.05 : 0) - 0.003 * skill) { c.kind = 'infection'; c.day = day; h.what = 'pneumonia'; h.sev = clamp(h.sev + 25, 50, 85); out.push(`${nameOf}'s flu has turned to pneumonia. It needs antibiotics.`); break; }
      spread(x, 0.05);
      if (h.sev <= 0) out.push(`${nameOf} is over the flu.`);
      break;
    }
    case 'postpartum': {
      const t = day - c.day;
      h.sev = Math.max(0, 30 * (1 - t / 42));
      c.care = 'resting after the birth';
      break;
    }
    case 'infant': {
      const ok = care.skill >= 1 || (s.stock.meds ?? 0) >= 0.1;
      if (ok && s.stock.meds >= 0.1) s.stock.meds -= 0.1;
      h.sev = Math.max(0, h.sev + (ok ? -6 : 3));
      c.care = ok ? 'fluids and watching through the night' : 'nobody who knows what to do';
      if (!ok && h.sev >= 70 && r() < 0.1) return die('a fever at ' + p.age + ' months');
      break;
    }
  }
  return h.sev <= 0;
}

/** Spread to the others in the house: each sick person gives it a chance a day to everyone who lives with them (less with isolation, soap, a bay). */
function spread(x: Ctx, rate: number): void {
  const { s, p, c, r, out } = x;
  const E = medicalOf(s).epidemic;
  const iso = E?.quarantine ? (bayOn(s) ? 0.15 : 0.3) : 1;
  for (const q of s.people) {
    if (q.id === p.id || !here(s, q)) continue;
    const qs = s.personState.find(z => z.id === q.id)!;
    if (qs.needs.hurt.some(z => z.med?.kind === c.kind)) continue;
    const carer = x.care.medic?.id === q.id ? 1.6 : 1;
    if (r() < rate * iso * carer * (qs.needs.health < 50 ? 1.4 : 1)) {
      qs.needs.hurt.push({ what: c.kind === 'flu' ? 'flu' : 'dysentery (caught at home)', sev: c.kind === 'flu' ? 38 : 32, med: { kind: c.kind, day: dayIndex(s.clock.t), care: 'just started', src: 'house' } });
      out.push(`${q.first} has caught it too.`);
      if (E) E.cases++;
    }
  }
}

// ── sources ──

/** A new case of illness or injury (for other systems). */
export function startCase(s: GameState, pid: string, kind: MedKind, sev: number, extra: Partial<MedCase> = {}, what?: string): boolean {
  const p = person(s, pid), n = s.personState.find(x => x.id === pid)?.needs;
  if (!p || !n || n.died != null) return false;
  const day = dayIndex(s.clock.t);
  if (n.hurt.some(h => h.med?.kind === kind && kind !== 'wound')) return false;
  n.hurt.push({ what: what ?? MED_NAME[kind], sev, ...(kind === 'wound' ? { trauma: true } : {}), med: { kind, day, care: 'not treated yet', ...extra } });
  medicalOf(s).seen++;
  return true;
}

/** Quarantine: keep the sick apart from the rest (a bay, or a spare room). Returns a note. */
export function setQuarantine(s: GameState, on: boolean): string | null {
  const E = medicalOf(s).epidemic;
  if (!E) return 'Nobody is going round sick.';
  E.quarantine = on; E.asked = true;
  log(s, on ? `The sick are being kept apart${bayOn(s) ? ' in the medical bay' : ' in a spare room'}. Whoever tends them keeps a mask on and washes up.` : 'The family decided to carry on as they were.');
  return null;
}
export function setPolicy(s: GameState, p: Medical['policy']): void { medicalOf(s).policy = p; }

// ── childbirth ──

/** Risk to the baby and the mother at the delivery, from who and what is there. */
export function birthRisk(s: GameState, mother: Person): { baby: number; mother: number; how: string } {
  const care = careFor(s, mother.id), mid = (s.stock.midwife_kit ?? 0) >= 1;
  const age = mother.age >= 38 || mother.age < 20 ? 1.5 : 1;
  if (care.hospital) return { baby: 0.004, mother: 0.001, how: 'at the county hospital' };
  if (care.skill >= 5 && (mid || care.bay)) return { baby: 0.012 * age, mother: 0.004 * age, how: 'with a skilled medic and a midwife kit' };
  if (care.skill >= 3 || mid) return { baby: 0.025 * age, mother: 0.01 * age, how: 'with someone who knew what to do' };
  return { baby: 0.06 * age, mother: 0.025 * age, how: 'with no one to help' };
}
/** A pregnancy begins (lineage.ts decided on one). */
export function startPregnancy(s: GameState, mother: Person, father: Person): void {
  const M = medicalOf(s), day = dayIndex(s.clock.t);
  M.pregnancies[mother.id] = { due: day + 270, since: day, father: father.id, prenatal: false };
}
export const pregnantNow = (s: GameState, pid: string) => !!s.medical?.pregnancies[pid];

// ── the daily pass ──

/** Once a day, after eating and the medicines (sim/body.ts): adopt new cases, run each course, new illnesses and accidents, the epidemic, pregnancies. Returns log lines. */
export function medicalDay(s: GameState): string[] {
  const M = medicalOf(s), day = dayIndex(s.clock.t);
  if (M.day === day) return [];
  M.day = day;
  const out: string[] = [];
  const r = mulberry32(s.seed * 7331 + day * 53 + 17);
  const { doy } = calendarOf(s.clock);
  const winter = doy > 320 || doy < 60;
  const living = s.people.filter(p => here(s, p));
  // new accidents and illnesses
  for (const p of living) {
    const ps = s.personState.find(x => x.id === p.id)!, n = ps.needs;
    // a burn at the stove
    if (ps.task === 'kitchen' && r() < 0.0009 && !n.hurt.some(h => h.med?.kind === 'burn')) { n.hurt.push({ what: 'a burn from the stove', sev: 18 + Math.floor(r() * 20), med: { kind: 'burn', day, care: 'not treated yet' } }); out.push(`${p.first} burned a hand on the stove.`); M.seen++; }
    // frostbite on a long cold watch
    if (ps.task === 'watch' && winter && r() < 0.006 && !n.hurt.some(h => h.med?.kind === 'frostbite')) { n.hurt.push({ what: 'frostbite', sev: 24 + Math.floor(r() * 14), med: { kind: 'frostbite', day, care: 'not treated yet' } }); out.push(`${p.first} came in off the cold watch with white, numb fingers.`); M.seen++; }
    // a cold house: the woodpile is bare on a hard-freeze night (sim/cold.ts)
    if (frostChance(s, p) > 0 && !n.hurt.some(h => h.med?.kind === 'frostbite') && r() < frostChance(s, p)) { n.hurt.push({ what: 'frostbite', sev: 24 + Math.floor(r() * 14), med: { kind: 'frostbite', day, care: 'not treated yet' } }); out.push(`${p.first} has white, numb fingers and toes: the house is freezing and the woodpile is bare.`); M.seen++; }
    // a baby's fever
    if (p.kid && p.age < 1 && r() < 0.0035 && !n.hurt.some(h => h.med?.kind === 'infant')) { n.hurt.push({ what: 'a baby\'s fever', sev: 40, med: { kind: 'infant', day, care: 'not treated yet' } }); out.push(`${p.first}, the baby, has a fever and won't feed.`); M.seen++; }
  }
  // dysentery from bad water: no filter and no boiling, or a house with no soap
  { const noSoap = !hygieneOk(s), dirty = s.utilities.hauling && !s.structures.some(x => x.kind === 'filtration_shed' && x.stage >= 5) && s.stock.water_filter < 0.01 && s.stock.firewood < 0.05;
    const seep = seepageChance(s);
    if ((noSoap || dirty || seep > 0) && r() < Math.max(dirty ? 0.006 : noSoap ? 0.0008 : 0, seep) * (harsh(s) ? 1.6 : 1) && living.length && !M.epidemic) {
      const p = living[Math.floor(r() * living.length)];
      if (startCase(s, p.id, 'dysentery', 38, { src: 'water' }, 'dysentery')) { out.push(`${p.first} has dysentery: cramps, a fever and the flux. ${dirty ? 'The water' : noSoap ? 'No soap in the house' : 'The well, too close to the privy,'} is the likely cause.`); M.epidemic = { kind: 'dysentery', since: day, quarantine: false, asked: false, cases: 1 }; }
    } }
  // flu going round in the winter: it needs someone coming in from outside
  { const outside = s.newcomers ? Object.keys(s.newcomers.guests ?? {}).length + (s.newcomers.bonds ? Object.keys(s.newcomers.bonds).length : 0) : 0;
    const contacts = outside + (s.disaster.kind && s.clock.t >= s.disaster.hitAt ? 0 : 2);
    if (winter && !M.epidemic && living.length >= 3 && r() < 0.0014 * (1 + 0.25 * contacts)) {
      const p = living[Math.floor(r() * living.length)];
      if (startCase(s, p.id, 'flu', 40, { src: 'contact' }, 'flu')) { out.push(`${p.first} is down with the flu. It goes round a house in winter.`); M.epidemic = { kind: 'flu', since: day, quarantine: false, asked: false, cases: 1 }; }
    } }
  // adopt and run every case
  for (const p of living) {
    const ps = s.personState.find(x => x.id === p.id)!, n = ps.needs;
    for (const h of n.hurt) adopt(s, p, h, r);
    const care = careFor(s, p.id);
    let ended = false;
    for (const h of [...n.hurt]) {
      if (!h.med) continue;
      const done = course({ s, p, n, h, c: h.med, care, r, out });
      if (n.died != null) { ended = true; break; }
      if (done || h.sev <= 0) n.hurt = n.hurt.filter(z => z !== h);
    }
    if (ended) continue;
    n.lasting = lastingWork(s, p.id) < 1 ? lastingWork(s, p.id) : undefined;
    if (n.lasting === undefined) delete n.lasting;
    // a hurt person's strain (sim/mind.ts reads the pain; the worst of it weighs here too)
    if (n.hurt.some(h => h.med && h.sev >= 60)) psyOf(s, p.id).stress = clamp(psyOf(s, p.id).stress + 1.5);
  }
  // fevers from elsewhere (the pandemic, a sick stranger) make an epidemic of their own
  if (!M.epidemic && s.personState.some(ps => ps.needs.died == null && ps.needs.hurt.some(h => h.med?.kind === 'flu'))) M.epidemic = { kind: 'flu', since: day, quarantine: false, asked: false, cases: 1 };
  // the epidemic ends when nobody has it
  if (M.epidemic && !s.personState.some(ps => ps.needs.died == null && ps.needs.hurt.some(h => h.med?.kind === M.epidemic!.kind))) {
    out.push(M.epidemic.kind === 'flu' ? 'The flu has run its course through the house.' : 'The dysentery has cleared the house.'); M.epidemic = null;
  }
  return out;
}

/** The pregnancies due today (lineage.ts delivers each and calls `afterBirth`). */
export function duePregnancies(s: GameState): Array<{ mother: Person; father: Person | undefined }> {
  const M = s.medical; if (!M) return [];
  const day = dayIndex(s.clock.t);
  const out: Array<{ mother: Person; father: Person | undefined }> = [];
  for (const [mid, pr] of Object.entries(M.pregnancies)) {
    if (pr.due > day) continue;
    const mother = person(s, mid);
    delete M.pregnancies[mid];
    if (mother && here(s, mother)) out.push({ mother, father: person(s, pr.father) });
  }
  return out;
}
/** After a delivery: recovery weeks, postpartum low mood in about one mother in eight. */
export function afterBirth(s: GameState, mother: Person, r: () => number): void {
  const n = s.personState.find(x => x.id === mother.id)?.needs;
  if (!n || n.died != null) return;
  n.hurt.push({ what: 'recovering from childbirth', sev: 30, med: { kind: 'postpartum', day: dayIndex(s.clock.t), care: 'resting after the birth' } });
  if (r() < 0.125) { const ps = psyOf(s, mother.id); ps.low = clamp(ps.low + 35); log(s, `${mother.first} is low and tearful since the birth: not just tired. It is more common than people say, and it passes with rest and company.`); }
}

/** The household's medical picture for the Family tab and the next-step card. */
export interface MedReport { courses: number; kit: number; splints: number; salts: number; medic: Person | null; skill: number; bay: boolean; hospital: boolean; needs: string[]; lasting: Array<[string, string[]]>; pregnant: Array<[string, number]>; epidemic: Epidemic | null; policy: Medical['policy'] }
export function medReport(s: GameState): MedReport {
  const M = medicalOf(s), day = dayIndex(s.clock.t);
  const living = s.people.filter(p => here(s, p));
  const best = [...living].filter(p => !p.kid || p.age >= 14).sort((a, b) => b.skills.medic - a.skills.medic)[0] ?? null;
  const needs: string[] = [];
  for (const p of living) for (const h of casesOf(s, p.id)) {
    const c = h.med!;
    if (c.kind === 'infection' && courses(s) < 1 && h.sev >= 30) needs.push(`${p.first}'s infection needs antibiotics (none left)`);
    else if (c.kind === 'fracture' && !c.set) needs.push(`${p.first}'s ${c.bone} needs a splint and someone to set it`);
    else if (c.kind === 'dysentery' && (s.stock.ors ?? 0) < 0.1) needs.push(`${p.first} needs rehydration salts`);
    else if ((c.kind === 'wound' || c.kind === 'burn') && !c.clean && h.sev >= 15) needs.push(`${p.first}'s ${c.kind} needs dressings`);
  }
  return { courses: courses(s), kit: s.stock.meds, splints: s.stock.splints ?? 0, salts: s.stock.ors ?? 0, medic: best && best.skills.medic >= 2 ? best : null, skill: best?.skills.medic ?? 0, bay: bayOn(s), hospital: hospitalOpen(s), needs, lasting: Object.entries(M.lasting).filter(([id]) => living.some(p => p.id === id)), pregnant: Object.entries(M.pregnancies).map(([id, pr]) => [person(s, id)?.first ?? '?', pr.due - day] as [string, number]), epidemic: M.epidemic, policy: M.policy };
}
