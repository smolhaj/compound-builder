/**
 * Counting words for player-facing text (pure, tested). One place for "1 day / 2 days", "a, b and c" and the
 * singular of a material that is named in the plural ("1 snares", "1 doors, windows & hardware" were QA run 5).
 * Build every "N things" string with these instead of `${n} things`.
 */
import type { MaterialId } from './materials';

const IRREGULAR: Record<string, string> = { person: 'people', child: 'children', man: 'men', woman: 'women', foot: 'feet', mouse: 'mice', loaf: 'loaves', knife: 'knives', calf: 'calves', wolf: 'wolves', sheep: 'sheep', fish: 'fish' };

/** The plural of a regular English noun ("day" -> "days", "box" -> "boxes", "pantry" -> "pantries", "person" -> "people"). */
export function pluralOf(one: string): string {
  const i = one.lastIndexOf(' ') + 1, head = one.slice(0, i), w = one.slice(i), irr = IRREGULAR[w.toLowerCase()];
  if (irr) return head + (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? irr[0].toUpperCase() + irr.slice(1) : irr);
  if (/[^aeiou]y$/i.test(w)) return head + w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(w)) return head + w + 'es';
  return head + w + 's';
}

/** "1 day", "2 days", "0 days": the count and its noun. `many` overrides the regular plural. A fraction below 2 other than exactly 1 is plural ("1.5 days"). */
export function pluralize(n: number | string, one: string, many?: string): string {
  return `${typeof n === 'string' ? n : fmtCount(n)} ${Number(n) === 1 ? one : many ?? pluralOf(one)}`;
}

/** Just the noun that goes with `n` ("day" / "days"), for strings that format the number their own way. */
export function nounFor(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? pluralOf(one);
}

/** "is" or "are" for a count. */
export const isAre = (n: number): string => (n === 1 ? 'is' : 'are');

/** A whole number gets thousands separators; a fraction keeps one decimal at most. */
function fmtCount(n: number): string {
  if (Number.isInteger(n)) return Math.abs(n) >= 10_000 ? n.toLocaleString('en-US') : String(n);
  return String(Math.round(n * 10) / 10);
}

/** "a", "a and b", "a, b and c". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** How long something lasted, in the unit that reads right: "40 days", "18 months", "3 years" (never "1 year" for a year and a half). */
export function spanText(days: number): string {
  const d = Math.max(1, Math.round(days));
  if (d < 90) return pluralize(d, 'day');
  if (d < 730) return pluralize(Math.round(d / 30.4), 'month');
  return pluralize(Math.floor(d / 365), 'year');
}

/** "a, b and c", and past `cap` items "a, b, c and 4 more" (a long order reads as a sentence, not a comma salad). */
export function listCapped(items: readonly string[], cap = 3): string {
  if (items.length <= cap) return listText(items);
  return `${items.slice(0, cap).join(', ')} and ${items.length - cap} more`;
}

/**
 * How a material reads after a count: [one, many]. Only the ones whose store name is a plural, a mass of parts or an
 * acronym need an entry; the rest ("lumber", "concrete", "metal roofing") read the same either way.
 */
export const MATERIAL_WORDS: Partial<Record<MaterialId, readonly [string, string]>> = {
  hardware: ['door and window kit', 'door and window kits'],
  pipe: ['coil of PEX pipe', 'coils of PEX pipe'],
  fixtures: ['set of plumbing fixtures', 'sets of plumbing fixtures'],
  snares: ['dozen snares', 'dozen snares'],
  crocks: ['fermenting crock', 'fermenting crocks'],
  solar_panel: ['solar panel', 'solar panels'],
  battery: ['battery', 'batteries'],
  batteries: ['battery', 'batteries'],
  fruit_trees: ['fruit tree', 'fruit trees'],
  seedlings: ['bundle of hedge whips', 'bundles of hedge whips'],
  logs: ['log', 'logs'],
  staples: ['bag of bulk staples', 'bags of bulk staples'],
  meds: ['medical kit', 'medical kits'],
  ifak: ['first aid kit', 'first aid kits'],
  canned: ['case of canned food', 'cases of canned food'],
  cameras: ['security camera', 'security cameras'],
  radios: ['GMRS radio', 'GMRS radios'],
  floodlights: ['motion floodlight', 'motion floodlights'],
  sandbags: ['sandbag', 'sandbags'],
  window_bars: ['set of window bars', 'sets of window bars'],
  ground_sensor: ['ground sensor', 'ground sensors'],
  tripwire: ['tripwire alarm', 'tripwire alarms'],
  traps: ['trap or bait station', 'traps and bait stations'],
  manuals: ['how-to manual', 'how-to manuals'],
  maple_taps: ['maple tap', 'maple taps'],
  sow: ['sow', 'sows'],
  boar: ['boar', 'boars'],
  lids_reuse: ['sleeve of reusable lids', 'sleeves of reusable lids'],
  hive_supplies: ['set of hive supplies', 'sets of hive supplies'],
  medical_books: ['medical book', 'medical books'],
  paperbacks_bag: ['bag of used paperbacks', 'bags of used paperbacks'],
  picture_books: ['picture book', 'picture books'],
  blackout_curtains: ['set of blackout curtains', 'sets of blackout curtains'],
  gen_baffles: ['set of generator baffles', 'sets of generator baffles'],
  vehicle_parts: ['vehicle part kit', 'vehicle part kits'],
  trellis_gates: ['security gate', 'security gates'],
  grenades: ['hand grenade', 'hand grenades'],
  rpg_rounds: ['launcher round', 'launcher rounds'],
  window_shutters: ['steel roll-down shutter', 'steel roll-down shutters'],
  ballistic_panels: ['ballistic window panel', 'ballistic window panels'],
  tilapia_fry: ['tilapia fingerling', 'tilapia fingerlings'],
  trout_fry: ['trout fingerling', 'trout fingerlings'],
  crayfish_stock: ['crayfish breeder', 'crayfish breeders'],
  lids: ['canning lid', 'canning lids'],
  games: ['game', 'games'],
  novels: ['paperback', 'paperbacks'],
  toys: ['toy', 'toys'],
};

/** "1 door and window kit", "3 door and window kits", "1 snare dozen": a count of a material as a person says it. `name` is the store name, used when the material needs no special wording. */
export function materialCount(id: MaterialId, n: number, name: string, text = String(Math.round(n * 10) / 10)): string {
  const w = MATERIAL_WORDS[id];
  if (!w) return `${text} ${name.toLowerCase()}`;
  return `${text} ${text === '1' ? w[0] : w[1]}`;
}
