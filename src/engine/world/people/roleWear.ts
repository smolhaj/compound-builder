/**
 * roleWear.ts
 * Who a person looks like and what they wear for their job, climate and season. Pure and deterministic: everything derives from a seed (a hash
 * of the person's id) so the same person is the same person every load and nothing needs saving.
 *
 *  - `looksFor`    skin, hair colour and style, beard and build from age / sex / seed (kids get a child's proportions, elders gray hair and a stoop);
 *  - `wearForRole` a full outfit for a role (farmer, builder, cook, guard, medic, neighbor, trader, scavenger, militia, tactical, …);
 *  - `dressForTask` the same person for the job in hand (an apron at the stove, gloves and a belt at the saw, a vest and radio on watch, a sun
 *                   hat in the field, a scarf and gloves in the cold).
 */
import { BUILD, GEAR, HAIR, HEADWEAR } from './figureKit';
import { HATS, type Wear, type WearSeason } from './crowdWear';

export type Role =
  | 'adult' | 'teen' | 'child' | 'elder'
  | 'farmer' | 'builder' | 'cook' | 'medic' | 'guard' | 'neighbor' | 'trader'
  | 'scavenger' | 'militia' | 'tactical';

export type Climate = 'cold' | 'mild' | 'hot';

export interface RoleCtx {
  season: WearSeason;
  climate?: Climate;
  female?: boolean;
  age?: number;
  /** Raiders and guards at night wear darker. */
  night?: boolean;
}

/** FNV-1a over a string (ids like "p3", "r12"); a number passes through. */
export function seedOf(id: string | number): number {
  if (typeof id === 'number') return id >>> 0;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small seeded generator (mulberry32); the first draws are well mixed even for neighbouring seeds. */
export function rngOf(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = [0xf6d7bf, 0xf1c9a5, 0xe0ac7e, 0xd29a6c, 0xc68a5c, 0xa0694a, 0x8a5a3c, 0x7a4e35, 0x5a3a28, 0x4a3022];
const HAIR_DARK = [0x1a1512, 0x2a1d14, 0x3a2618, 0x16110e];
const HAIR_BROWN = [0x5c3b22, 0x8a6440, 0x4a2e1a, 0x6a4a2c];
const HAIR_LIGHT = [0xc9a468, 0xd9bd7a, 0xa8864c, 0x7a3a22, 0x9a4a28];
const HAIR_GRAY = [0x9a9590, 0xc8c4bc, 0xb0aaa2, 0x6e6a66, 0xe2ded8];

export interface Looks {
  skin: number;
  hair: number;
  hairStyle: number;
  longHair: boolean;
  beard: number;
  build: number;
}

const pickOf = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

/** The person: skin tone, hair colour / style, beard and build from their age and sex. Draw order is fixed so a seed always gives the same person. */
export function looksFor(seed: number, o: { kid?: boolean; elder?: boolean; age?: number; female?: boolean }): Looks {
  const r = rngOf(seed);
  const age = o.age ?? (o.kid ? 9 : o.elder ? 70 : 35);
  const skin = pickOf(r, SKIN);
  const hairBase = r();
  const hairPick = r(), stylePick = r(), beardPick = r(), buildPick = r();
  const gray = o.elder || age >= 62 ? 1 : age >= 48 ? hairBase < 0.5 ? 1 : 0 : 0;
  const hair = gray ? pickOf(() => hairPick, HAIR_GRAY)
    : hairBase < 0.5 ? HAIR_DARK[Math.floor(hairPick * HAIR_DARK.length)] : hairBase < 0.8 ? HAIR_BROWN[Math.floor(hairPick * HAIR_BROWN.length)] : HAIR_LIGHT[Math.floor(hairPick * HAIR_LIGHT.length)];
  let hairStyle: number, longHair = false, beard = 0;
  if (o.kid) {
    hairStyle = o.female ? (stylePick < 0.45 ? HAIR.PONYTAIL : stylePick < 0.8 ? HAIR.LONG : HAIR.DEFAULT) : stylePick < 0.2 ? HAIR.BUZZ : HAIR.DEFAULT;
  } else if (o.female) {
    hairStyle = stylePick < 0.3 ? HAIR.LONG : stylePick < 0.5 ? HAIR.PONYTAIL : stylePick < 0.68 ? HAIR.BUN : stylePick < 0.82 ? HAIR.DEFAULT : stylePick < 0.92 ? HAIR.CURLY : HAIR.BUZZ;
    if (o.elder || age >= 62) hairStyle = stylePick < 0.5 ? HAIR.BUN : HAIR.DEFAULT;
  } else {
    hairStyle = stylePick < 0.45 ? HAIR.DEFAULT : stylePick < 0.65 ? HAIR.BUZZ : stylePick < 0.78 ? HAIR.CURLY : stylePick < 0.86 ? HAIR.PONYTAIL : HAIR.DEFAULT;
    if (age >= 55 && stylePick > 0.7) hairStyle = HAIR.BALD;
    if (age >= 18) beard = beardPick < 0.5 ? 0 : beardPick < 0.78 ? 1 : 2;
    if (age >= 60 && beardPick > 0.35) beard = Math.max(beard, 1);
  }
  longHair = hairStyle === HAIR.LONG;
  const build = o.kid ? BUILD.CHILD : o.elder || age >= 66 ? BUILD.ELDER : o.female ? (buildPick < 0.8 ? BUILD.SLENDER : BUILD.AVERAGE) : buildPick < 0.3 ? BUILD.BROAD : buildPick < 0.55 ? BUILD.SLENDER : BUILD.AVERAGE;
  return { skin, hair, hairStyle, longHair, beard, build };
}

const FLANNEL = [0x8a2a24, 0x2f4a3a, 0x6a5a3a, 0x3d4a5c, 0x9a3324, 0x5b6143, 0x4a4f57];
const DENIM = [0x3b4a66, 0x2d3a56, 0x4a5a7a, 0x283247];
const WORK_TAN = [0x8a6a48, 0x7a6a50, 0x6a5a3c, 0x9a8460];
const KID_BRIGHT = [0xe8f04a, 0xff6a3a, 0x3ad0ff, 0xe0407a, 0x6af07a, 0x9fc3e0, 0xf3e3a0, 0xd9742a];
const WARM = [0x6e2433, 0xb88a2e, 0x5b6143, 0x2b3a55, 0x8a4a2a, 0x7a5a8a, 0x1f5c6b];
const LIGHT = [0xf2f0ea, 0xbcd4ea, 0x9fc3e0, 0xf3e3a0, 0xf2c6c2, 0xbfe0c8, 0xd9d2c3];
const CARDIGAN = [0x6a5440, 0x4a5038, 0x6e6a66, 0x7a4a5a, 0x3d4a5c, 0xc7b89a];
const OD = [0x4a4f3a, 0x5a5a40, 0x3d4232, 0x4b5240];
const COYOTE = [0x6e6446, 0x7a6a4a, 0x5a5238];
const BLACK_GEAR = [0x24272a, 0x1c1e20, 0x2a2c31];
const RAG = [0x4b5240, 0x5b4c3a, 0x3f4a5a, 0x6b6a5a, 0x7a4a3c, 0x38403a, 0x62594a, 0x7a2a22];
const CAMO_ISH = [0x4b5a3a, 0x5a5a3a, 0x6a6a4a, 0x4a4a38];
const APRON_C = [0xe8e2d0, 0x2f4a3a, 0x8a4a2a, 0x23304a, 0x6e2433];

/** A full outfit for a role. The same seed always makes the same person; the role and the weather choose the clothes. */
export function wearForRole(seed: number, role: Role, ctx: RoleCtx): Wear {
  const looks = looksFor(seed, { kid: role === 'child' || role === 'teen' && (ctx.age ?? 15) < 13, elder: role === 'elder', age: ctx.age ?? (role === 'child' ? 8 : role === 'teen' ? 15 : role === 'elder' ? 70 : 36), female: ctx.female });
  const r = rngOf(seed ^ 0x51ed270b);
  const pick = <T,>(a: readonly T[]): T => pickOf(r, a);
  const s = ctx.season, climate = ctx.climate ?? 'mild';
  const cold = s === 'winter' || (climate === 'cold' && s !== 'summer') || (climate === 'cold' && r() < 0.4);
  const hot = s === 'summer' && climate !== 'cold' || climate === 'hot' && s !== 'winter';
  const cool = !cold && (s === 'fall' || s === 'spring');
  const w: Wear = {
    shirt: 0, pants: 0, skin: looks.skin, hair: looks.hair, pack: pick([0x1f2022, 0x26324a, 0x55585c, 0x4a5038, 0x5a2430, 0x8a7458]),
    hasPack: false, longHair: looks.longHair, shoe: r() * 0.45, coat: 0, shorts: false, hat: -1,
    hairStyle: looks.hairStyle, beard: looks.beard, headwear: HEADWEAR.NONE, gear: 0, build: looks.build,
  };
  let gear = 0;
  const coatFor = (): 0 | 1 | 2 => (cold ? (r() < 0.6 ? 2 : 1) : cool ? (r() < 0.5 ? 1 : 0) : 0);
  const knit = () => { if (cold && r() < 0.6) w.hat = pick(HATS.slice(0, 7)); };
  switch (role) {
    case 'child':
      w.shirt = pick(KID_BRIGHT); w.pants = pick(DENIM); w.coat = cold ? 1 : 0; w.shorts = hot && r() < 0.6; w.shoe = 0.5 + r() * 0.5;
      if (cold) { knit(); gear |= GEAR.SCARF; }
      if (hot && r() < 0.4) { w.headwear = HEADWEAR.CAP; w.hat = pick([0xb04030, 0x2c3a4a, 0xd9742a]); }
      break;
    case 'teen':
      w.shirt = pick([...WARM, ...KID_BRIGHT.slice(0, 3)]); w.pants = pick(DENIM); w.coat = coatFor(); w.shorts = hot && r() < 0.5;
      if (cold || cool) { w.headwear = r() < 0.4 ? HEADWEAR.HOOD : HEADWEAR.NONE; }
      if (r() < 0.45) { w.headwear = HEADWEAR.CAP; w.hat = pick([0x101112, 0x2c3a4a, 0xb04030]); }
      w.hasPack = r() < 0.5;
      break;
    case 'elder':
      w.shirt = pick(CARDIGAN); w.pants = pick([0x2a2c31, 0x3b4a66, 0xa89a78, 0x5d6066]); w.coat = cold ? 2 : cool ? 1 : 0;
      if (r() < 0.5) { w.headwear = r() < 0.5 ? HEADWEAR.CAP : HEADWEAR.BOONIE; w.hat = pick([0xc9b27a, 0x6a5a4a, 0x2c3a4a, 0xd9d2c3]); }
      if (cold) { knit(); gear |= GEAR.SCARF | GEAR.GLOVES; }
      break;
    case 'farmer':
      w.shirt = pick(FLANNEL); w.pants = pick(DENIM); w.coat = coatFor(); w.shorts = false; gear |= GEAR.BOOTS | GEAR.GLOVES;
      w.headwear = hot || s === 'spring' || s === 'fall' ? (r() < 0.6 ? HEADWEAR.BOONIE : HEADWEAR.CAP) : HEADWEAR.NONE; w.hat = pick([0xc9b27a, 0x4a3a2a, 0x6a5a4a, 0x2c3a4a]);
      if (cold) { w.headwear = HEADWEAR.NONE; knit(); gear |= GEAR.SCARF; }
      break;
    case 'builder':
      w.shirt = pick([...WORK_TAN, ...FLANNEL]); w.pants = pick([...WORK_TAN, ...DENIM]); w.coat = coatFor(); gear |= GEAR.BOOTS | GEAR.GLOVES | GEAR.BELT;
      w.headwear = HEADWEAR.CAP; w.hat = pick([0xd9742a, 0x2a2c31, 0xb88a2e, 0x6a6e74]);
      if (cold) { w.headwear = HEADWEAR.NONE; knit(); }
      break;
    case 'cook':
      w.shirt = pick(LIGHT.concat(WARM)); w.pants = pick(DENIM.concat([0x2a2c31])); w.coat = 0; gear |= GEAR.APRON; w.pack = pick(APRON_C);
      if (cold) w.coat = 0;
      break;
    case 'medic':
      w.shirt = pick([0x7a9a9a, 0x9fb8d0, 0xe8e2d0, 0x6b8f5a]); w.pants = pick([0x4a5a6a, 0x2d3340, 0x6b7a8a]); w.coat = 1; gear |= GEAR.RADIO | GEAR.BELT | GEAR.BOOTS | GEAR.GLOVES; w.pack = 0xe8e2d0; w.hasPack = false;
      break;
    case 'guard':
      w.shirt = pick(OD); w.pants = pick([0x4a4036, 0x4d5238, 0x3a3a3e]); w.coat = coatFor() || 1; w.pack = pick(COYOTE.concat(BLACK_GEAR));
      gear |= GEAR.VEST | GEAR.RADIO | GEAR.BELT | GEAR.BOOTS | GEAR.SLING | GEAR.GLOVES;
      w.headwear = r() < 0.5 ? HEADWEAR.CAP : HEADWEAR.HELMET; w.hat = pick([0x3d4232, 0x101112, 0x4a3a2a]);
      if (cold) { w.headwear = HEADWEAR.NONE; knit(); gear |= GEAR.SCARF; }
      break;
    case 'neighbor':
      w.shirt = pick([...FLANNEL, ...WARM, ...LIGHT]); w.pants = pick([...DENIM, 0x5d6066, 0xa89a78]); w.coat = coatFor();
      w.shorts = hot && r() < 0.35; w.hasPack = r() < 0.2;
      if (r() < 0.3) { w.headwear = HEADWEAR.CAP; w.hat = pick([0xb04030, 0x2c3a4a, 0x101112, 0x6a5a4a]); }
      if (cold) { w.headwear = HEADWEAR.NONE; knit(); }
      break;
    case 'trader':
      w.shirt = pick(CARDIGAN.concat(FLANNEL)); w.pants = pick(WORK_TAN.concat(DENIM)); w.coat = coatFor() || 1; w.hasPack = true; gear |= GEAR.RUCK | GEAR.BOOTS;
      w.pack = pick([0x4a5038, 0x8a7458, 0x5a2430, 0x55585c]); w.headwear = HEADWEAR.BOONIE; w.hat = pick([0xc9b27a, 0x4a3a2a, 0x6a5a4a]);
      if (cold) { w.headwear = HEADWEAR.NONE; knit(); gear |= GEAR.SCARF; }
      break;
    case 'scavenger':
      w.shirt = ctx.night ? 0x2a2622 : pick(RAG); w.pants = pick([0x35383c, 0x4a4436, 0x3d3a2e, 0x2d3340]); w.coat = 1; w.hasPack = true; gear |= GEAR.RUCK | GEAR.BOOTS | GEAR.SCARF;
      w.pack = pick([0x3a3a30, 0x55585c, 0x4a3a2a]);
      w.headwear = r() < 0.4 ? HEADWEAR.HOOD : r() < 0.5 ? HEADWEAR.CAP : HEADWEAR.NONE; w.hat = pick([0x1c2018, 0x6a5a4a, 0x2a2c31]);
      if (r() < 0.35) gear |= GEAR.SLING;
      if (!w.beard && looks.build !== BUILD.CHILD) w.beard = r() < 0.6 ? 1 : 0;
      break;
    case 'militia':
      w.shirt = ctx.night ? 0x23281e : pick(CAMO_ISH); w.pants = ctx.night ? 0x1a1c16 : pick([0x4a4a38, 0x4d5238]); w.coat = 1; w.pack = ctx.night ? 0x1d1d18 : pick(COYOTE);
      gear |= GEAR.VEST | GEAR.BOOTS | GEAR.SLING | GEAR.BELT | GEAR.GLOVES | (r() < 0.4 ? GEAR.RADIO : 0);
      w.headwear = r() < 0.65 ? HEADWEAR.HELMET : HEADWEAR.CAP; w.hat = ctx.night ? 0x1c2018 : 0x3d4232;
      break;
    case 'tactical':
      w.shirt = ctx.night ? 0x16181a : pick(BLACK_GEAR); w.pants = ctx.night ? 0x121315 : 0x1c1e20; w.coat = 1; w.pack = pick(BLACK_GEAR);
      gear |= GEAR.PLATE | GEAR.RADIO | GEAR.BELT | GEAR.BOOTS | GEAR.GLOVES | GEAR.SLING;
      w.headwear = HEADWEAR.HELMET; w.hat = 0x101112; w.beard = r() < 0.5 ? 2 : 0; w.hairStyle = HAIR.BUZZ; w.longHair = false;
      break;
    case 'adult':
    default:
      w.shirt = pick(s === 'summer' ? LIGHT.concat(KID_BRIGHT.slice(2, 4)) : WARM.concat(FLANNEL)); w.pants = pick(DENIM.concat([0x5d6066, 0x2d3340])); w.coat = coatFor();
      w.shorts = hot && r() < 0.4; w.hasPack = r() < 0.15;
      if (cold) knit();
      break;
  }
  if (cold && role !== 'cook') gear |= GEAR.GLOVES;
  if (cold && (w.coat >= 1)) gear |= GEAR.SCARF * (r() < 0.5 ? 1 : 0);
  if (hot && !GEAR.BOOTS) gear &= ~GEAR.BOOTS;
  w.gear = gear;
  if (w.headwear === HEADWEAR.HOOD) w.hat = -1;
  if (w.hairStyle === HAIR.LONG) w.longHair = true;
  return w;
}

/** The task kinds the sim gives people (sim/state TaskKind), grouped by what they put on. */
const KITCHEN = new Set(['kitchen', 'cleaning', 'laundry', 'meal']);
const HEAVY = new Set(['build', 'forestry', 'wood', 'repairs']);
const FIELD = new Set(['garden', 'fields', 'livestock', 'pets', 'water']);
const WATCH = new Set(['watch', 'drill']);

/**
 * The person at their job: the base look (static) plus what the task puts on or takes off. Returns `base` itself when nothing changes, so a
 * caller can compare references and only re-upload on a change.
 */
export function dressForTask(base: Wear, task: string, ctx: { season: WearSeason; climate?: Climate; armed?: boolean; kid?: boolean }): Wear {
  if (ctx.kid) return base;
  let gear = base.gear ?? 0, headwear = base.headwear ?? HEADWEAR.NONE, hat = base.hat;
  const warm = ctx.season === 'summer' || (ctx.climate === 'hot' && ctx.season !== 'winter');
  if (KITCHEN.has(task) && task !== 'meal') gear |= GEAR.APRON;
  if (HEAVY.has(task)) { gear |= GEAR.GLOVES | GEAR.BELT | GEAR.BOOTS; if (!headwear && !(hat >= 0) && warm) { headwear = HEADWEAR.CAP; hat = 0xd9742a; } }
  if (FIELD.has(task)) { gear |= GEAR.BOOTS; if (task === 'garden' || task === 'fields') { gear |= GEAR.GLOVES; if (!headwear && hat < 0 && warm) { headwear = HEADWEAR.BOONIE; hat = 0xc9b27a; } } }
  if (task === 'medic') gear |= GEAR.RADIO | GEAR.BELT | GEAR.APRON | GEAR.GLOVES;
  if (WATCH.has(task)) {
    gear |= GEAR.VEST | GEAR.RADIO | GEAR.BELT | GEAR.BOOTS | GEAR.SLING;
    if (ctx.armed === false) gear &= ~GEAR.SLING;
    if (!headwear && hat < 0) { headwear = HEADWEAR.CAP; hat = 0x3d4232; }
  }
  if (task === 'radio' || task === 'hunt') { gear |= GEAR.RADIO | (task === 'hunt' ? GEAR.BOOTS | GEAR.SLING | GEAR.RUCK : 0); }
  if (gear === (base.gear ?? 0) && headwear === (base.headwear ?? 0) && hat === base.hat) return base;
  return { ...base, gear, headwear, hat, hasPack: base.hasPack && !(gear & GEAR.RUCK) };
}

/** The role a family member plays in the picture, from the sim's person data. */
export function roleOfPerson(p: { kid: boolean; age: number; elder?: boolean; guard?: boolean; origin?: { kind: string } }): Role {
  if (p.kid) return p.age < 13 ? 'child' : 'teen';
  if (p.guard) return 'guard';
  if (p.elder || p.age >= 66) return 'elder';
  if (p.origin?.kind === 'neighbor' || p.origin?.kind === 'stranger') return 'neighbor';
  return 'adult';
}

/** The climate class from the season parameter `cold` (0 warm … 1 hard freeze) and the region's winter. */
export function climateOfCold(cold: number): Climate { return cold > 0.55 ? 'cold' : cold < 0.12 ? 'hot' : 'mild'; }
