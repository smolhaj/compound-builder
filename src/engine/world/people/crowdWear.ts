/**
 * crowdWear.ts
 * What the crowd wears: seasonal clothing (winter coats + beanies in dark
 * tones, light tees and shorts in summer, sweaters and jackets in between),
 * team colors on game day, backpacks, joggers' kit. Pure (colors as sRGB
 * hex); AgentRenderer uploads them as per-instance attributes.
 */

export type WearSeason = 'summer' | 'fall' | 'winter' | 'spring';

export interface Wear {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  pack: number;
  hasPack: boolean;
  longHair: boolean;
  /** 0–1 shoe tone (dark → white trainers). */
  shoe: number;
  /** Coat length: 0 none, 1 hip, 2 mid-thigh, 3 academic gown to the ankle (the coat color is `shirt`). */
  coat: 0 | 1 | 2 | 3;
  /** Bare legs below the knee. */
  shorts: boolean;
  /** Knit hat color, or -1 for none. */
  hat: number;
}

const SKIN_TONES = [0xf6d7bf, 0xf1c9a5, 0xe0ac7e, 0xc68a5c, 0xa0694a, 0x7a4e35, 0x5a3a28];
const HAIR_COLORS = [0x1a1512, 0x2a1d14, 0x3a2618, 0x5c3b22, 0x8a6440, 0xc9a468, 0x7a3a22, 0x16110e];
const PACK_COLORS = [0x1f2022, 0x26324a, 0x55585c, 0x4a5038, 0x5a2430, 0x8a7458, 0x2c5458, 0x3a3a40];

const SHIRTS: Record<WearSeason, number[]> = {
  // light tees, polos, tanks
  summer: [0xf2f0ea, 0xe6e4df, 0xbcd4ea, 0x9fc3e0, 0xf3e3a0, 0xf2c6c2, 0xbfe0c8, 0xd9d2c3, 0x2b3a55, 0xc8423a, 0x6b86a6, 0xffffff, 0x8a8d91, 0xe9a86b],
  // sweaters, flannel, denim jackets
  fall: [0x6e2433, 0xb88a2e, 0x5b6143, 0x2b3a55, 0x6d7178, 0x8a4a2a, 0x3d4a5c, 0x7a5a8a, 0xc7b89a, 0x2f4a3a, 0x9a3324, 0x4a4f57, 0xd9d2c3, 0x1f5c6b],
  // heavy coats and puffers
  winter: [0x1b1c1f, 0x2a2c31, 0x23304a, 0x3a3a3e, 0x8a6a48, 0x4a4a30, 0x5a2430, 0x30373f, 0x6a6e74, 0x9c2a2a, 0x1f3f6a, 0x2f4a3a, 0xb8a78a],
  // light jackets, hoodies
  spring: [0x9fb8d0, 0xe6e4df, 0xc7b89a, 0x6b8f5a, 0xb9a6d0, 0xf0d98a, 0x6b86a6, 0xd98a8a, 0x2b3a55, 0x8a8d91, 0xf2f0ea, 0x4f7a6a],
};
const PANTS: Record<WearSeason, number[]> = {
  summer: [0x6f86a8, 0x3b4a66, 0xa89a78, 0xd8cdb2, 0x5d6066, 0x1e1e20, 0x8c7c62],
  fall: [0x3b4a66, 0x283247, 0x1e1e20, 0xa89a78, 0x5d6066, 0x4d5238, 0x2d3340],
  winter: [0x283247, 0x1e1e20, 0x2d3340, 0x3a3a3e, 0x3b4a66, 0x4a4036],
  spring: [0x3b4a66, 0x6f86a8, 0xa89a78, 0x5d6066, 0x1e1e20, 0xc9bfa8],
};
/** Knit hat colors (the figure shader indexes this palette). */
export const HATS = [0x2a2c31, 0x9c2a2a, 0x23304a, 0xd9d2c3, 0x4a4a30, 0xb88a2e, 0x6a6e74];
const JOG_SHIRTS = [0xe8f04a, 0xff6a3a, 0x3ad0ff, 0xf2f0ea, 0xe0407a, 0x2b2b2b, 0x6af07a];

export interface WearOptions {
  season: WearSeason;
  /** Team colors (game day) or null. */
  team: { primary: number; secondary: number } | null;
  /** 0–1 share of people in team colors on game day. */
  teamShare?: number;
  jogger?: boolean;
}

/**
 * Pick an outfit. `rnd` is a 0–1 random source (Math.random in game, seeded
 * in tests). Skin / hair / long hair stay with the person across re-dresses
 * when `keep` is supplied.
 */
export function pickWear(rnd: () => number, opt: WearOptions, keep?: Pick<Wear, 'skin' | 'hair' | 'longHair' | 'pack'>): Wear {
  const pick = (a: number[]) => a[Math.floor(rnd() * a.length) % a.length];
  const s = opt.season;
  let shirt = pick(SHIRTS[s]);
  let pants = pick(PANTS[s]);
  let coat: 0 | 1 | 2 = 0;
  let shorts = false;
  let hat = -1;
  if (s === 'winter') {
    coat = rnd() < 0.55 ? 2 : rnd() < 0.85 ? 1 : 0;
    if (rnd() < 0.45) hat = pick(HATS);
  } else if (s === 'fall') {
    if (rnd() < 0.3) coat = 1;
  } else if (s === 'spring') {
    if (rnd() < 0.22) coat = 1;
  } else {
    shorts = rnd() < 0.45;
  }
  if (opt.team && rnd() < (opt.teamShare ?? 0.65)) {
    shirt = rnd() < 0.78 ? opt.team.primary : opt.team.secondary;
    if (s === 'winter' && coat === 0) coat = 1;
  }
  let hasPack = rnd() < 0.55;
  if (opt.jogger) {
    shirt = pick(JOG_SHIRTS);
    pants = rnd() < 0.5 ? 0x1e1e20 : 0x2d3340;
    shorts = s !== 'winter' || rnd() < 0.3;
    coat = 0; hasPack = false;
    if (s === 'winter' && rnd() < 0.5) hat = pick(HATS);
  }
  return {
    shirt, pants,
    skin: keep?.skin ?? pick(SKIN_TONES),
    hair: keep?.hair ?? (rnd() < 0.05 ? 0x9a9590 : pick(HAIR_COLORS)),
    pack: keep?.pack ?? pick(PACK_COLORS),
    hasPack,
    longHair: keep?.longHair ?? rnd() < 0.4,
    shoe: opt.jogger ? 0.9 : rnd(),
    coat, shorts, hat,
  };
}

// ── Personas (event days, townspeople) ──────────────────────────────────────

/** Sentinel `Wear.hat`: a graduation mortarboard (figureKit HAT_MORTARBOARD). */
export const MORTARBOARD = -2;

/**
 * Who a figure is, for what they wear:
 *  - student      the everyday campus crowd (pickWear);
 *  - graduate     black academic gown to the ankle + mortarboard (commencement);
 *  - faculty      a gown in the school color (the platform party / marshals);
 *  - parent       dressed up for the day (blazers, blouses, chinos), no backpack;
 *  - elder        grandparents: gray / white hair, cardigans and coats;
 *  - kid          a younger sibling (the caller draws them at ~0.6 scale);
 *  - resident     townspeople: no backpack, more jackets, a range of ages;
 *  - lecturer     an outdoor-class professor: tweed or navy jacket;
 *  - volunteer    Service Day: everyone in the same tee;
 *  - vendor       market stallholders: aprons over work clothes.
 */
export type Persona = 'student' | 'graduate' | 'faculty' | 'parent' | 'elder' | 'kid' | 'resident' | 'lecturer' | 'volunteer' | 'vendor';

const GRAY_HAIR = [0x9a9590, 0xc8c4bc, 0xb0aaa2, 0x6e6a66, 0xe2ded8];
const DRESS_SHIRTS = [0xf2f0ea, 0xbcd4ea, 0x2b3a55, 0x6e2433, 0xe6d6c0, 0x9fb8d0, 0xd9a0a8, 0x5b6143, 0x1f2a3a, 0xf0e2b0, 0x7a5a8a];
const DRESS_PANTS = [0x2a2c31, 0x3b4a66, 0xa89a78, 0x1e1e20, 0x5d6066, 0xc9bfa8];
const TWEED = [0x6a5440, 0x3a3a3e, 0x23304a, 0x5a4a3a, 0x4a5038];
const APRONS = [0x2f4a3a, 0x8a4a2a, 0xe8e2d0, 0x23304a, 0x6e2433];
const KID_SHIRTS = [0xe8f04a, 0xff6a3a, 0x3ad0ff, 0xe0407a, 0x6af07a, 0xf2f0ea, 0x9fc3e0, 0xf3e3a0];

export interface PersonaOptions extends WearOptions {
  /** Volunteer tee / faculty gown color. */
  color?: number;
}

/** Outfit for a persona (see Persona). Skin / hair stay with `keep` when given. */
export function pickPersonaWear(rnd: () => number, persona: Persona, opt: PersonaOptions, keep?: Pick<Wear, 'skin' | 'hair' | 'longHair' | 'pack'>): Wear {
  const pick = (a: number[]) => a[Math.floor(rnd() * a.length) % a.length];
  if (persona === 'student') return pickWear(rnd, opt, keep);
  const fanOk = persona === 'kid' || persona === 'resident' || persona === 'parent';
  const base = pickWear(rnd, { ...opt, team: fanOk ? opt.team : null, teamShare: (opt.teamShare ?? 0.5) * 0.8 }, keep);
  const inColors = !!opt.team && (base.shirt === opt.team.primary || base.shirt === opt.team.secondary);
  base.hasPack = false;
  switch (persona) {
    case 'graduate':
    case 'faculty':
      base.shirt = persona === 'faculty' ? (opt.color ?? 0x1d2c5c) : (rnd() < 0.06 ? 0x26324a : 0x141518);
      base.pants = 0x1e1e20;
      base.coat = 3; base.shorts = false;
      base.hat = MORTARBOARD;
      base.shoe = rnd() * 0.5;
      break;
    case 'parent':
      if (!inColors) base.shirt = pick(DRESS_SHIRTS);
      base.pants = pick(DRESS_PANTS);
      base.shorts = opt.season === 'summer' && rnd() < 0.2;
      if (opt.season !== 'summer' && rnd() < 0.35) base.coat = Math.max(base.coat, 1) as 1 | 2 | 3;
      if (base.hat >= 0 && rnd() < 0.6) base.hat = -1;
      if (!keep && rnd() < 0.3) base.hair = pick(GRAY_HAIR);
      break;
    case 'elder':
      base.shirt = pick([...DRESS_SHIRTS, ...TWEED]);
      base.pants = pick(DRESS_PANTS);
      base.shorts = false;
      base.coat = opt.season === 'summer' ? 0 : rnd() < 0.5 ? 2 : 1;
      if (!keep) base.hair = pick(GRAY_HAIR);
      base.longHair = base.longHair && rnd() < 0.4;
      base.shoe = rnd() * 0.5;
      break;
    case 'kid':
      if (!inColors) base.shirt = pick(KID_SHIRTS);
      base.hasPack = rnd() < 0.15;
      break;
    case 'resident':
      if (!keep && rnd() < 0.3) base.hair = pick(GRAY_HAIR);
      if (opt.season !== 'summer' && base.coat === 0 && rnd() < 0.4) base.coat = 1;
      base.hasPack = rnd() < 0.1;
      break;
    case 'lecturer':
      base.shirt = pick(TWEED);
      base.pants = pick(DRESS_PANTS);
      base.coat = 1; base.shorts = false; base.hat = -1;
      base.hasPack = rnd() < 0.3;
      if (!keep && rnd() < 0.45) base.hair = pick(GRAY_HAIR);
      break;
    case 'volunteer':
      base.shirt = opt.color ?? 0x2c8a7a;
      base.coat = 0;
      base.pants = pick([0x3b4a66, 0x283247, 0x6f86a8, 0x5d6066]);
      base.shorts = opt.season === 'summer' && rnd() < 0.5;
      base.hat = -1;
      break;
    case 'vendor':
      base.shirt = pick(APRONS);
      base.pants = pick([0x3b4a66, 0x4d5238, 0x5d6066]);
      base.coat = 1; // the apron reads as a hip-length layer in the shirt color
      base.shorts = false;
      if (!keep && rnd() < 0.3) base.hair = pick(GRAY_HAIR);
      break;
  }
  return base;
}
