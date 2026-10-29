/**
 * The evenings (people depth, part 3): what the household does with its free
 * hours and how much it lifts the strain. Pure.
 *
 *  Goods      cards and board games, a guitar, a radio and music player,
 *             paperbacks, the little ones' toys and picture books. Each is
 *             a "kit" with a condition 0 (worn out) to 1 (new) that falls
 *             with use: the deck loses cards and the game its pieces, the
 *             strings break, the batteries run down, the paperbacks are
 *             passed round until the covers come off, the toys are loved to
 *             pieces. A worn kit still does something (a third to a quarter
 *             of its lift) until it is restocked. Restock goods are cheap
 *             and sit on the Shop's "Courses & evenings" shelf: new pieces
 *             and cards, strings, batteries, a bag of used paperbacks. With
 *             one on the shelf the kit is made good by itself when it wears
 *             thin; a second box of the same also swaps in.
 *  Lift       a full kit is worth more than it was: cards 4 points of
 *             strain (5 for a kid), music 3, a book 3 (2 for a kid), the
 *             little ones' toys 5 and picture books 3, and three working
 *             kinds on the same evening are worth 2 more as "a full evening
 *             kit". Points come off the strain the days settle toward
 *             (mind.ts `reading`), so an ordinary day, with next to no
 *             strain, reads exactly as before.
 *  Shared     a gathering (cookout, campfire, birthday, neighbors over, a
 *             service) lifts more when there are games and music and
 *             something to read: gatherings.ts adds `gatheringKitLift`.
 *  Service    a service or meeting (a gathering of its own, gatherings.ts)
 *             lifts people of faith a lot and the rest of the household a
 *             little for the following week.
 *
 * Wear and lift are the only effects; nothing here changes a day on which
 * nobody owns any of the goods.
 */
import { dayIndex, type GameState } from './state';
import type { MaterialId } from './materials';
import type { Person } from './family';

export type KitId = 'games' | 'guitar' | 'player' | 'books' | 'toys' | 'kidbooks';
export const KIT_IDS: readonly KitId[] = ['games', 'guitar', 'player', 'books', 'toys', 'kidbooks'];

export interface KitDef {
  id: KitId;
  name: string;
  /** The stock good that makes it a kit. */
  base: MaterialId;
  /** The cheap good that makes a worn kit good again, and how much condition one unit puts back. */
  restock: MaterialId;
  gives: number;
  /** Condition lost per user-evening (shared goods wear a little less than linearly with the number of users). */
  per: number;
  /** The lift of a worn-out kit, as a share of a new one. */
  floor: number;
  /** Log lines: wearing thin, worn out, made good. */
  thin: string;
  worn: string;
  fixed: string;
}

export const KITS: Record<KitId, KitDef> = {
  games: { id: 'games', name: 'Cards and board games', base: 'games', restock: 'game_pieces', gives: 1, per: 0.012, floor: 0.35,
    thin: 'The cards are soft and dog-eared, and the dice are down to one.', worn: 'Half the game pieces have gone missing and the deck is short a few cards. Evenings are checkers and arguments.', fixed: 'New cards and dice came out of the bag, and the games box is whole again.' },
  guitar: { id: 'guitar', name: 'The guitar', base: 'instrument', restock: 'guitar_strings', gives: 1, per: 0.018, floor: 0.25,
    thin: 'The guitar has gone flat, and the G string is fraying.', worn: 'A string snapped on the guitar. It plays, badly.', fixed: 'The guitar is restrung and in tune.' },
  player: { id: 'player', name: 'The music player', base: 'music_player', restock: 'batteries', gives: 1, per: 0.022, floor: 0,
    thin: 'The music player is fading: the batteries are nearly flat.', worn: 'The batteries in the music player are dead.', fixed: 'Fresh batteries went into the music player.' },
  books: { id: 'books', name: 'Paperbacks', base: 'novels', restock: 'paperbacks_bag', gives: 0.6, per: 0.0035, floor: 0.3,
    thin: 'The paperbacks have been passed round until the covers are coming off.', worn: 'The last of the paperbacks are in pieces. Everyone has read every one.', fixed: 'A bag of used paperbacks went on the shelf: something new to read.' },
  toys: { id: 'toys', name: 'The kids\' toys', base: 'toys', restock: 'toys', gives: 1, per: 0.006, floor: 0.35,
    thin: 'The kids have loved the toys half to pieces.', worn: 'The toys are in pieces. The little ones are bored.', fixed: 'Out came a fresh box of toys.' },
  kidbooks: { id: 'kidbooks', name: 'Picture books', base: 'picture_books', restock: 'picture_books', gives: 1, per: 0.008, floor: 0.4,
    thin: 'The picture books are held together with tape.', worn: 'The picture books are in rags; the little ones know them by heart.', fixed: 'A crate of new picture books for the little ones.' },
};

export interface Evenings {
  /** Condition per kit, 1 new … 0 worn out (absent = new). */
  cond: Partial<Record<KitId, number>>;
  /** Day a wear warning was last logged, per kit. */
  warned: Partial<Record<KitId, number>>;
  /** The last gathering that had the kit out: when (game time) and how many strain points it is worth. */
  sharedAt?: number;
  sharedPts?: number;
  day: number;
}
export const newEvenings = (): Evenings => ({ cond: {}, warned: {}, day: -1 });
export function eveningsOf(s: GameState): Evenings {
  s.evenings ??= newEvenings();
  return s.evenings;
}

const has = (s: GameState, m: MaterialId) => Math.floor((s.stock as Record<string, number>)[m] ?? 0);
const living = (s: GameState) => s.people.filter((_, i) => { const n = s.personState[i]?.needs; return !!n && n.died == null && !n.taken && !n.left; });
const power = (s: GameState) => s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
export const kitCond = (s: GameState, id: KitId): number => s.evenings?.cond[id] ?? 1;

/** Is a kid small enough for the toys / the picture books? */
export const toyAge = (p: Person) => p.kid && p.age >= 2 && p.age < 12;
export const bookAge = (p: Person) => p.kid && p.age >= 2 && p.age < 10;

/** How much of a new kit's lift it gives now (0–1): owned, covers the household, and not worn out. */
export function kitStrength(s: GameState, id: KitId): number {
  const D = KITS[id], c = kitCond(s, id), heads = Math.max(1, living(s).length);
  const kids = living(s).filter(p => p.kid).length;
  const n = has(s, D.base);
  if (n < 1) return 0;
  const worn = D.floor + (1 - D.floor) * Math.min(1, c / 0.5);   // full strength down to half-worn, then it falls to the floor
  switch (id) {
    case 'games': return Math.min(1, n / Math.ceil(heads / 4)) * worn;
    case 'books': return Math.min(1, n / Math.max(1, heads / 5)) * worn;
    case 'guitar': return worn;
    case 'player': return power(s) ? 1 : c > 0 || has(s, 'batteries') >= 1 ? 0.9 * Math.max(0.5, Math.min(1, c / 0.2)) : 0;
    case 'toys': return kids ? Math.min(1, n / Math.max(1, kids / 3)) * worn : 0;
    case 'kidbooks': return kids ? Math.min(1, n / Math.max(1, kids / 3)) * worn : 0;
  }
}

/** Music in the house: the better of the guitar and the player, a little more with both. */
export function musicStrength(s: GameState): number {
  const g = kitStrength(s, 'guitar'), p = kitStrength(s, 'player');
  return Math.min(1, Math.max(g, p) + 0.25 * Math.min(g, p));
}

export interface EveningHelps { helps: Array<[string, number]>; used: KitId[] }
/** The strain points the evening's goods take off one person who has a free evening (mind.ts `reading` adds them to its list), and which kits they use. */
export function eveningHelps(s: GameState, p: Person, free: boolean): EveningHelps {
  const out: EveningHelps = { helps: [], used: [] };
  if (!free) return out;
  const g = kitStrength(s, 'games'), m = musicStrength(s), b = kitStrength(s, 'books');
  const t = toyAge(p) ? kitStrength(s, 'toys') : 0, kb = bookAge(p) ? kitStrength(s, 'kidbooks') : 0;
  const push = (label: string, v: number, ...kits: KitId[]) => { if (v > 0.4) { out.helps.push([label, Math.round(v * 10) / 10]); out.used.push(...kits); } };
  push('cards and games', (p.kid ? 5 : 4) * g, 'games');
  push('music', 3 * m, ...(kitStrength(s, 'guitar') >= kitStrength(s, 'player') ? ['guitar' as const] : ['player' as const]));
  push('something to read', p.kid ? (p.age >= 7 ? 2 * b : 0) : 3 * b, 'books');
  push('toys', 5 * t, 'toys');
  push('picture books at bedtime', 3 * kb, 'kidbooks');
  // a parent reading to the little ones
  if (!p.kid) {
    const little = living(s).some(q => q.kid && bookAge(q) && (q.parents?.includes(p.id) || p.partner && q.parents?.includes(p.partner)));
    if (little) push('reading to the little ones', 1.5 * kitStrength(s, 'kidbooks'), 'kidbooks');
  }
  // three kinds working on the same evening: a good night in
  const working = [g, m, b, t].filter(v => v >= 0.6).length;
  if (working >= 3) out.helps.push(['a full evening kit', 2]);
  return out;
}

/** Extra morale for a gathering from what is on hand (cards, music, books to read aloud), and the kits it wears. */
export function gatheringKitLift(s: GameState, kind: string): { lift: number; used: KitId[] } {
  if (kind === 'funeral') return { lift: 0, used: [] };
  const used: KitId[] = [];
  let lift = 0;
  const g = kitStrength(s, 'games'), m = musicStrength(s), b = kitStrength(s, 'books');
  if (g > 0.3 && kind !== 'movie') { lift += 1.5 * g; used.push('games'); }
  if (m > 0.3 && kind !== 'movie') { lift += 2 * m; used.push(kitStrength(s, 'guitar') >= kitStrength(s, 'player') ? 'guitar' : 'player'); }
  if (b > 0.3 && (kind === 'campfire' || kind === 'service')) { lift += 1 * b; used.push('books'); }
  if (living(s).some(toyAge) && kitStrength(s, 'toys') > 0.3 && (kind === 'birthday' || kind === 'christmas' || kind === 'cookout' || kind === 'neighbors')) { lift += 1.5 * kitStrength(s, 'toys'); used.push('toys'); }
  return { lift: Math.min(5, lift), used };
}

/** Note a gathering that had the kit out: the mind layer counts it for a week. */
export function noteShared(s: GameState, pts: number): void {
  const E = eveningsOf(s);
  E.sharedAt = s.clock.t; E.sharedPts = Math.round(pts * 10) / 10;
}
/** Strain points still felt from the last gathering that had the games and music out. */
export const sharedPoints = (s: GameState): number => (s.evenings?.sharedAt != null && s.clock.t - s.evenings.sharedAt < 8 ? s.evenings.sharedPts ?? 0 : 0);

/**
 * Wear the kits by `users` (user-evenings each): condition falls, a cheap
 * restock goes in by itself when one is on the shelf and the kit is thin,
 * otherwise a line or two says what is wrong. Returns log lines.
 */
export function wearKits(s: GameState, users: Partial<Record<KitId, number>>): string[] {
  const E = eveningsOf(s), day = dayIndex(s.clock.t), out: string[] = [];
  for (const id of KIT_IDS) {
    const n = users[id] ?? 0;
    if (n <= 0) continue;
    const D = KITS[id], before = E.cond[id] ?? 1;
    let c = Math.max(0, before - D.per * n ** 0.85);
    // thin: put it right when the shelf has the means
    if (c <= 0.25) {
      if (has(s, D.restock) >= (D.restock === D.base ? 2 : 1)) {
        (s.stock as Record<string, number>)[D.restock] -= 1;
        c = Math.min(1, c + D.gives);
        out.push(D.fixed);
        E.cond[id] = c;
        continue;
      }
    }
    E.cond[id] = c;
    const cross = (lv: number) => before > lv && c <= lv;
    const nag = (E.warned[id] ?? -999) < day - 25;
    if (cross(0.5) && nag) { out.push(D.thin); E.warned[id] = day; }
    else if ((cross(0.2) || (c <= 0.2 && nag)) && has(s, D.restock) < 1) { out.push(`${D.worn} A ${restockName(id)} is cheap in the Shop.`); E.warned[id] = day; }
  }
  return out;
}

export const restockName = (id: KitId): string => {
  const m = KITS[id].restock;
  return ({ game_pieces: 'bag of cards, dice and game pieces', guitar_strings: 'set of strings', batteries: 'pack of batteries', paperbacks_bag: 'bag of used paperbacks', toys: 'box of toys', picture_books: 'crate of picture books' } as Partial<Record<MaterialId, string>>)[m] ?? m;
};

export interface KitRow { id: KitId; name: string; cond: number; strength: number; word: string; restock: MaterialId; restockHave: number }
const wordFor = (c: number) => (c > 0.7 ? 'good' : c > 0.4 ? 'well used' : c > 0.2 ? 'wearing thin' : 'worn out');
/** The kits the household owns (the Family tab's Evenings block and the Shop's note). */
export function kitRows(s: GameState): KitRow[] {
  return KIT_IDS.filter(id => has(s, KITS[id].base) >= 1 && (id !== 'toys' && id !== 'kidbooks' || living(s).some(p => p.kid))).map(id => ({
    id, name: KITS[id].name, cond: kitCond(s, id), strength: kitStrength(s, id), word: id === 'player' && power(s) ? 'on the house power' : wordFor(kitCond(s, id)),
    restock: KITS[id].restock, restockHave: has(s, KITS[id].restock) - (KITS[id].restock === KITS[id].base ? 1 : 0),
  }));
}

/** Restock goods worth ordering now: a kit that is wearing thin with nothing on the shelf to put it right. */
export function restockNeeds(s: GameState): MaterialId[] {
  const out: MaterialId[] = [];
  for (const r of kitRows(s)) if (r.cond <= 0.4 && r.restockHave < 1 && !(r.id === 'player' && power(s))) out.push(r.restock);
  return out;
}

/** What the evenings lack for people who are strained: the first of cards, music, something to read, and for the little ones toys and picture books. */
export function eveningGaps(s: GameState): MaterialId[] {
  const out: MaterialId[] = [];
  const kids = living(s).some(toyAge);
  if (has(s, 'games') < 1) out.push('games');
  if (has(s, 'instrument') < 1 && has(s, 'music_player') < 1) out.push('instrument');
  if (has(s, 'novels') < 1) out.push('novels');
  if (kids && has(s, 'toys') < 1) out.push('toys');
  if (kids && living(s).some(bookAge) && has(s, 'picture_books') < 1) out.push('picture_books');
  return out;
}

/** A line for the Shop card of a base or restock good: how worn the one in use is, or what the restock puts right. */
export function kitNote(s: GameState, m: MaterialId): { text: string; urgent: boolean } | null {
  for (const id of KIT_IDS) {
    const D = KITS[id], owned = has(s, D.base) >= 1;
    if (m === D.restock && m !== D.base) {
      const c = kitCond(s, id);
      return { text: owned ? `${D.name.toLowerCase()}: ${wordFor(c)}${c <= 0.4 ? ' - worth restocking' : ''}; it goes in by itself when the kit wears thin` : `a spare for ${D.name.toLowerCase()}, which you do not own yet`, urgent: owned && c <= 0.4 };
    }
    if (m === D.base) return owned ? { text: `in use: ${wordFor(kitCond(s, id))} (${Math.round(kitCond(s, id) * 100)} %)${D.restock === D.base ? '; a second one swaps in when it wears out' : ''}`, urgent: kitCond(s, id) <= 0.4 && D.restock === D.base } : null;
  }
  return null;
}

/** What shows on and by the family's table in the main home (game/buildkit/goodsDress.ts): each good owned, 1 in good shape, 2 worn thin. */
export function houseGoods(s: GameState): Partial<Record<'games' | 'guitar' | 'player' | 'books' | 'toys' | 'kidbooks', 1 | 2>> {
  const out: Partial<Record<'games' | 'guitar' | 'player' | 'books' | 'toys' | 'kidbooks', 1 | 2>> = {};
  const kids = living(s).some(toyAge);
  const put = (id: KitId, key: keyof typeof out) => { if (has(s, KITS[id].base) >= 1 && (id !== 'toys' && id !== 'kidbooks' || kids)) out[key] = kitCond(s, id) < 0.4 ? 2 : 1; };
  put('games', 'games'); put('guitar', 'guitar'); put('player', 'player'); put('books', 'books'); put('toys', 'toys'); put('kidbooks', 'kidbooks');
  return out;
}
/** A short key for the goods (the world rebuilds the home when it changes). */
export const goodsKey = (g: ReturnType<typeof houseGoods>): string => ['games', 'guitar', 'player', 'books', 'toys', 'kidbooks'].map(k => (g as Record<string, number>)[k] ?? 0).join('');
