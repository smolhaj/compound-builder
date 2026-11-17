/**
 * The Build catalog (layout A Build drawer, docs/UX_AUDIT.md 11.3): every kit piece and wall run the Build tab lists, as flat entries with a
 * category and keywords, plus the pure parts of the drawer: search and filter, a card's state (available, suggested, dim with a reason, needs a
 * permit), the hover bill (itemized cost, time, what it needs, what it gives) and its text. Nothing here is new game logic: prices, reasons and
 * suggestions come from the same selectors the Build tab uses (sim/guidance.ts, sim/economy.ts, sim/paperwork.ts).
 */
import { BLUEPRINTS, totalBill, totalHours } from './blueprints';
import { MATERIALS, billText, type MaterialId } from './materials';
import { DELIVERY_FEE, orderCost } from './economy';
import { CREW_RATE, CREW_WEEK } from './crews';
import { drillExtra } from './site';
import { countyWorks, needsPermit, permitFee, reviewDays } from './paperwork';
import { buildOff, perimeterNote, perimeterOff, perimeterTiers, suggestions } from './guidance';
import { PERIMETER, UTILITY_LINES, runBill, runHours, type PerimeterKind } from './perimeter';
import { FT_PER_M, lengthText } from './units';
import { pluralize } from './words';
import type { GameState } from './state';
import { tierOfKind } from './dome/tiers';
import { domeFacts } from './dome/facts';
import { BUNKER_ORDER, DOME_ORDER, GATEHOUSE_ORDER, KIT, POD_ORDER, TERRACE_ORDER, TOWER_ORDER, UTILITY_ORDER } from '../game/buildkit/kit';

export type CatId = 'shelter' | 'work' | 'food' | 'water' | 'power' | 'defense' | 'underground' | 'enclosure' | 'walls' | 'lines';
export interface CatDef { id: CatId; label: string; /** Extra search words. */ words: string }
export const CATS: readonly CatDef[] = [
  { id: 'shelter', label: 'Shelter', words: 'home house cabin sleep bed room live dwelling' },
  { id: 'work', label: 'Work', words: 'shop barn garage yard tools store workshop' },
  { id: 'food', label: 'Food', words: 'grow farm garden crop animal eat harvest livestock' },
  { id: 'water', label: 'Water', words: 'well drink pump tank toilet septic sanitation' },
  { id: 'power', label: 'Power', words: 'electric energy solar battery generator light' },
  { id: 'defense', label: 'Defense', words: 'guard watch tower gate security raid' },
  { id: 'underground', label: 'Bunker', words: 'underground bunker shelter hatch tunnel basement' },
  { id: 'enclosure', label: 'Enclosure', words: 'dome glass greenhouse climate shell cover air weather fallout arcology geodesic earthen conservatory biosphere' },
  { id: 'walls', label: 'Walls', words: 'fence wall hedge perimeter line gate' },
  { id: 'lines', label: 'Lines', words: 'pipe cable wire drain utility' },
];
const CAT_OF_KIT: Record<string, CatId> = { home: 'shelter', work: 'work', food: 'food', sanitation: 'water', water: 'water', power: 'power', bunker: 'underground', defense: 'defense', enclosure: 'enclosure' };

export interface CatalogEntry {
  /** Stable key (the tool id). */
  key: string;
  /** What `arm` takes: the kit kind, or `fence:<kind>` for a run. */
  tool: string;
  name: string;
  cat: CatId;
  run: boolean;
  blurb: string;
}

/** The kit pieces the Build tab lists, by group (the same lists as its Home & work, Food, Water & power and Watch groups, plus Underground). */
export const KIT_LISTS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['home', 'Home & work', ['timber_cabin', 'log_house', 'cottage', 'guest_house', 'moms_house', 'modular_home', 'stilted_house', 'cabin_village', 'outhouse', 'workshop', 'forge', 'metal_garage', 'barn', 'equipment_yard', 'helipad', 'boat_dock', 'marina', ...TERRACE_ORDER]],
  ['food', 'Food', ['garden', 'greenhouse', 'polytunnel', 'high_tunnel', 'greenhouse_heated', 'aquaponics', 'orchard', 'orchard_grove', 'orchard_terraced', 'field', 'chicken_coop', 'sheep_barn', 'pond', 'root_cellar', 'wood_oven', 'apiary', 'sugar_shack', 'barnyard']],
  ['water', 'Water & power', UTILITY_ORDER],
  ['defense', 'Watch towers & gatehouse', [...TOWER_ORDER, ...POD_ORDER, ...GATEHOUSE_ORDER]],
];

const per100 = (): number => 100 / FT_PER_M / 6;   // world units in 100 ft (the Build tab's "per 100 ft")

/** Every catalog entry, in menu order (a pure function of the data; no game state). */
export function catalogEntries(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const kit = (k: string) => { const d = KIT[k]; if (d) out.push({ key: k, tool: k, name: d.name, cat: CAT_OF_KIT[d.category] ?? 'work', run: false, blurb: d.blurb }); };
  for (const [, , kinds] of KIT_LISTS) kinds.forEach(kit);
  BUNKER_ORDER.forEach(kit);
  DOME_ORDER.forEach(kit);
  const run = (k: PerimeterKind, cat: CatId) => out.push({ key: `fence:${k}`, tool: `fence:${k}`, name: PERIMETER[k].name, cat, run: true, blurb: PERIMETER[k].blurb });
  run('escape_tunnel', 'underground'); run('underground_passage', 'underground');
  for (const t of perimeterTiers()) t.kinds.forEach(k => run(k, 'walls'));
  UTILITY_LINES.forEach(k => run(k, 'lines'));
  // a piece in two lists appears once
  const seen = new Set<string>();
  return out.filter(e => (seen.has(e.key) ? false : (seen.add(e.key), true)));
}

const catLabel = (c: CatId): string => CATS.find(x => x.id === c)!.label;
const catWords = (c: CatId): string => CATS.find(x => x.id === c)!.words;

/** Lower-case words of a query. */
export const queryWords = (q: string): string[] => q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** How well an entry matches a query: 0 = no match. All words must match something; a name-word hit beats a category or keyword hit beats a part of a word beats the description. */
export function matchScore(e: CatalogEntry, words: readonly string[]): number {
  if (!words.length) return 1;
  const name = e.name.toLowerCase(), cat = `${catLabel(e.cat)} ${catWords(e.cat)}`.toLowerCase(), blurb = e.blurb.toLowerCase();
  let total = 0;
  for (const w of words) {
    const nameWords = name.split(/[^a-z0-9]+/);
    const s = nameWords.some(x => x.startsWith(w)) ? 100 : name.includes(w) ? 30 : cat.split(/[^a-z0-9]+/).some(x => x.startsWith(w)) ? 50 : blurb.includes(w) ? 15 : 0;
    if (!s) return 0;
    total += s;
  }
  return total;
}

export interface CatalogFilter { query: string; cat: CatId | null; /** Only these keys (the Recommended chip). */ only?: ReadonlySet<string> | null }

/** The entries a search and chip leave, best match first (menu order breaks ties). Pure. */
export function filterCatalog(all: readonly CatalogEntry[], f: CatalogFilter): CatalogEntry[] {
  const words = queryWords(f.query);
  return all
    .map((e, i) => ({ e, i, s: (f.cat && e.cat !== f.cat) || (f.only && !f.only.has(e.key)) ? 0 : matchScore(e, words) }))
    .filter(x => x.s > 0)
    .sort((a, b) => (words.length ? b.s - a.s : 0) || a.i - b.i)
    .map(x => x.e);
}

// ---- card state and price ----

export type CardKind = 'ok' | 'next' | 'permit' | 'off';
export interface CardState {
  kind: CardKind;
  /** Why it is dim (kind off). */
  reason?: string;
  /** One short line under the name: the suggestion, the permit, or the time. */
  line: string;
  /** Short badge on the card ("Suggested", "Permit $2,500"). */
  badge?: string;
  /** Price to show on the card; `null` is "free" or not priced. */
  price: number | null;
}

const toBuy = (bill: Partial<Record<MaterialId, number>>) => Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
const kindBill = (e: CatalogEntry): Partial<Record<MaterialId, number>> => e.run ? runBill(e.key.slice(6) as PerimeterKind, per100()) : (BLUEPRINTS[e.key] ? totalBill(BLUEPRINTS[e.key]) : {});
const kindHours = (e: CatalogEntry): number => e.run ? runHours(e.key.slice(6) as PerimeterKind, per100()) : (BLUEPRINTS[e.key] ? totalHours(BLUEPRINTS[e.key]) : 0);
const hoursText = (h: number): string => `${Math.round(h)} h`;
const usd = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
const permitOn = (s: GameState, e: CatalogEntry): boolean => !e.run && needsPermit(e.key) && s.paper.permits && countyWorks(s);

/** What the suggestions say right now (worked out once per render, not once per card). */
export interface AdviceCtx { sug: Map<string, string> }
export function adviceCtx(s: GameState): AdviceCtx {
  const sug = new Map<string, string>();
  for (const x of suggestions(s)) if (x.kind && !sug.has(x.kind)) sug.set(x.kind, x.why);
  return { sug };
}

/** What a card shows for one entry in this game. */
export function cardState(s: GameState, e: CatalogEntry, ctx: AdviceCtx = adviceCtx(s)): CardState {
  const buy = toBuy(kindBill(e));
  const extra = e.key === 'well_drilled' ? drillExtra(s.site) : 0;
  const price = buy.length ? orderCost(buy) + extra : e.run ? null : extra;
  const hours = hoursText(kindHours(e));
  if (e.run) {
    const kind = e.key.slice(6) as PerimeterKind, off = perimeterOff(s, kind), note = perimeterNote(s, kind);
    if (off) return { kind: 'off', reason: off, line: off, price };
    return { kind: 'ok', line: `per 100 ft · ${hours}${note ? ` · ${note}` : ''}`, price };
  }
  const off = buildOff(s, e.key), why = ctx.sug.get(e.key);
  if (off) return { kind: 'off', reason: off, line: off, price };
  if (permitOn(s, e)) return { kind: why ? 'next' : 'permit', line: why ?? `${hours} · ${reviewDays(s, e.key)}-day review`, badge: `Permit ${usd(permitFee(s, e.key))}`, price };
  if (why) return { kind: 'next', line: why, badge: 'Suggested', price };
  return { kind: 'ok', line: hours, price };
}

/** The keys the Recommended chip shows: the entries the guidance selectors suggest right now. */
export function recommendedKeys(s: GameState, all: readonly CatalogEntry[], ctx: AdviceCtx = adviceCtx(s)): Set<string> {
  return new Set(all.filter(e => !e.run && ctx.sug.has(e.key) && !buildOff(s, e.key)).map(e => e.key));
}

// ---- the hover bill ----

export interface BillLine { label: string; usd: number }
export interface Bill {
  title: string;
  /** One or two sentences: what it gives. */
  gives: string;
  /** Plain facts: sleeps, shelters, footprint. */
  facts: string[];
  /** Materials, one line per kind that is bought. */
  materials: BillLine[];
  /** Delivery fee (the order's flat fee), permit fee, drilling extra: other cash lines. */
  other: BillLine[];
  /** Cash with the family building it: materials plus the other lines. */
  ownerUsd: number;
  /** Crew wages if you hire one to do the labor (about, rounded to $100). */
  crewLaborUsd: number;
  /** Cash with a crew: ownerUsd plus wages. */
  crewUsd: number;
  hours: number;
  /** Weeks one hired crew would take. */
  crewWeeks: number;
  /** Own materials that are not for sale (logs, stone off the land), as text; empty when none. */
  ownNeeds: string;
  /** What must be true: the reason it is dim, county review time, the logs. */
  needs: string[];
  state: CardKind;
}

/** A description cut at a sentence end near `max` characters. */
export function shortGives(text: string, max = 170): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max), at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (at > max * 0.45) return cut.slice(0, at + 1);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 0 ? sp : max)}...`;
}

export function billFor(s: GameState, e: CatalogEntry, ctx: AdviceCtx = adviceCtx(s)): Bill {
  const bill = kindBill(e), buy = toBuy(bill), hours = kindHours(e);
  const materials: BillLine[] = buy.map(l => ({ label: billText({ [l.material]: l.qty }), usd: orderCost([l]) - DELIVERY_FEE }));
  const delivery = buy.length ? orderCost(buy) - materials.reduce((a, l) => a + l.usd, 0) : 0;
  const other: BillLine[] = [];
  if (delivery) other.push({ label: 'Delivery', usd: delivery });
  const extra = e.key === 'well_drilled' ? drillExtra(s.site) : 0;
  if (extra) other.push({ label: `Drilling to ${lengthText(s.site.gwDepth)} (contractor)`, usd: extra });
  const permit = permitOn(s, e) ? permitFee(s, e.key) : 0;
  if (permit) other.push({ label: 'County permit', usd: permit });
  const ownerUsd = materials.reduce((a, l) => a + l.usd, 0) + other.reduce((a, l) => a + l.usd, 0);
  const crewLaborUsd = Math.round(hours * CREW_RATE / 100) * 100;
  const own = billText(Object.fromEntries(Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price === null)));
  const st = cardState(s, e, ctx);
  const d = e.run ? null : KIT[e.key];
  const facts: string[] = [];
  if (d) {
    if (d.sleeps) facts.push(`Sleeps ${d.sleeps}`);
    if (d.shelters) facts.push(`Shelters ${d.shelters}`);
    facts.push(`Footprint ${d.cellsX * 10} x ${d.cellsZ * 10} ft`);
  }
  { const dt = e.run ? null : tierOfKind(e.key); if (dt) facts.push(...domeFacts(dt)); }
  const needs: string[] = [];
  if (st.reason) needs.push(st.reason);
  if (own) needs.push(`From your own land: ${own}`);
  if (permit) needs.push(`County review about ${pluralize(reviewDays(s, e.key), 'day')} before work starts`);
  return { title: e.name, gives: shortGives(e.blurb), facts, materials, other, ownerUsd, crewLaborUsd, crewUsd: ownerUsd + crewLaborUsd, hours, crewWeeks: Math.max(1, Math.ceil(hours / CREW_WEEK)), ownNeeds: own, needs, state: st.kind };
}

/** The bill as plain text lines (also the card's tooltip for assistive tech). */
export function billLines(b: Bill): string[] {
  const out = [b.title, b.gives, ...b.facts];
  for (const l of [...b.materials, ...b.other]) out.push(`${l.label}: ${usd(l.usd)}`);
  out.push(`Cash, family builds it: ${usd(b.ownerUsd)}`, `Cash, with a crew: about ${usd(b.crewUsd)} (wages ${usd(b.crewLaborUsd)})`, `Time: ${hoursText(b.hours)} of work, a crew about ${pluralize(b.crewWeeks, 'week')}`);
  return [...out, ...b.needs];
}

/** The price chip on a card: "$1,900", "free" for a piece with nothing to buy, "from $X" for a run (per 100 ft is on the line below). */
export function priceText(c: CardState): string {
  return c.price === null || c.price === 0 ? 'free' : usd(c.price);
}

/** Arrow-key movement over a grid of `cols` columns: returns the next index (clamped, never wraps off the ends). */
export function moveIndex(i: number, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End', n: number, cols: number): number {
  if (n <= 0) return -1;
  const d = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -cols : key === 'ArrowDown' ? cols : 0;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  if (i < 0) return 0;
  return Math.max(0, Math.min(n - 1, i + d));
}
