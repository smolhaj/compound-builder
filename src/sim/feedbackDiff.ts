/**
 * "Purchases answer back": turn what a player action changed into one short message, and what a day brought into a celebration.
 * Nothing here is saved or simulated; the UI (ui/feel/feedbackWatcher.ts) feeds it the game before and after each change. Pure.
 *
 * A player action leaves the clock where it was; a tick moves it. So an action is a change with the same clock, and the
 * milestones are read on both.
 */
import { MILESTONE_NAME, MILESTONE_POINTS } from './lineage';
import { MATERIALS, qtyText, type MaterialId } from './materials';
import { KIT } from '../game/buildkit/kit';
import { PERIMETER, UTILITY_LINES } from './perimeter';
import { LAND_NAME, acresOf } from './land';
import { CREW_SIZE } from './crews';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { dayIndex, type GameState } from './state';
import { listText, materialCount, pluralize } from './words';
import { FOOD, type FoodItemId } from './pantry';
import { COURSES } from './courses';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export type FeedbackKind = 'order' | 'build' | 'land' | 'hire' | 'spend' | 'sale';
export interface FeedbackEvent {
  kind: FeedbackKind;
  /** What you got, in a sentence. */
  title: string;
  /** The money it took (negative: it brought money in). */
  cost: number;
  /** Extra short line (when it arrives, ...), or ''. */
  note: string;
  /** Row / tab keys to light briefly (`kit:<kind>`, `struct:<id>`, `tab:<id>`). */
  flash: string[];
}

const plural = pluralize;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const kitName = (kind: string) => lower(KIT[kind]?.name ?? kind.replace(/_/g, ' '));

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** Quantities for an order or a purchase: "30 lumber, 4 hardware and 2 more kinds of supplies". Up to three items by name. */
function linesText(lines: ReadonlyArray<{ material: MaterialId; qty: number; food?: FoodItemId; n?: number }>): string {
  const bits = lines.map(l => {
    if (l.food && FOOD[l.food]) return `${l.n ?? l.qty} ${FOOD[l.food].name.toLowerCase()}`;
    const q = qtyText(l.qty);
    return q === null ? null : materialCount(l.material, l.qty, MATERIALS[l.material]?.name ?? l.material, q);
  }).filter((x): x is string => !!x);
  if (bits.length <= 3) return listText(bits);
  return `${bits.slice(0, 3).join(', ')} and ${bits.length - 3} more kinds of supplies`;
}

/**
 * What a player action did, as events (empty when nothing worth a toast changed). A change with a moving clock, or a different
 * game (another seed or a loaded save), is not an action.
 */
export function diffAction(prev: GameState, next: GameState): FeedbackEvent[] {
  if (prev === next || prev.seed !== next.seed || prev.clock.t !== next.clock.t) return [];
  const out: FeedbackEvent[] = [];
  const spent = prev.money - next.money;
  // orders
  const seenOrders = new Set(prev.orders.map(o => o.id));
  const fresh = next.orders.filter(o => !seenOrders.has(o.id));
  if (fresh.length) {
    const lines = fresh.flatMap(o => o.lines.map(l => ({ material: l.material, qty: l.qty, food: l.food, n: l.n })));
    const due = Math.max(...fresh.map(o => o.dueAt)) - next.clock.t;
    out.push({ kind: 'order', title: `Ordered ${linesText(lines)}`, cost: fresh.reduce((a, o) => a + o.cost, 0), note: due >= 1 ? `Arrives in about ${plural(Math.round(due), 'day')}.` : 'Arrives today.', flash: ['tab:supplies'] });
  }
  // staked buildings and fence runs
  const seenSt = new Set(prev.structures.map(x => x.id));
  const built = next.structures.filter(x => !seenSt.has(x.id) && !x.pre && !x.unplaced && !x.joiner);
  if (built.length) {
    const names = [...new Set(built.map(x => kitName(x.kind)))];
    out.push({ kind: 'build', title: `Staked out the ${listNames(names)}`, cost: built.length ? Math.max(0, spent) : 0, note: 'The family starts when the materials are in.', flash: [...built.map(x => `kit:${x.kind}`), ...built.map(x => `struct:${x.id}`), 'tab:projects'] });
  }
  const seenRuns = new Set(prev.perimeter.map(r => r.id));
  // (the pipes and cables that come with a staked building are part of it, not a purchase of their own)
  const runs = next.perimeter.filter(r => !seenRuns.has(r.id) && !UTILITY_LINES.includes(r.kind));
  if (runs.length) out.push({ kind: 'build', title: `Laid out ${plural(runs.length, 'run')} of ${listNames([...new Set(runs.map(r => (PERIMETER[r.kind]?.name ?? r.kind).toLowerCase()))])}`, cost: 0, note: 'See the Projects tab.', flash: ['tab:projects', ...runs.map(r => `struct:${r.id}`)] });
  // land
  const mine = new Set(prev.land.parcels.filter(p => p.owner === 'you').map(p => p.id));
  const bought = next.land.parcels.filter(p => p.owner === 'you' && !mine.has(p.id));
  if (bought.length) {
    const acres = bought.reduce((a, p) => a + acresOf(p.rect), 0);
    out.push({ kind: 'land', title: `Bought ${plural(acres, 'acre')} of ${listNames([...new Set(bought.map(p => LAND_NAME[p.kind]))])}`, cost: bought.reduce((a, p) => a + (p.paid ?? 0), 0), note: bought.length === 1 ? bought[0].name[0].toUpperCase() + bought[0].name.slice(1) + ' is yours now.' : '', flash: ['tab:land', ...bought.map(p => `parcel:${p.id}`)] });
  }
  // hires
  const crewsBefore = new Set(prev.crews.map(c => c.id));
  const newCrews = next.crews.filter(c => !crewsBefore.has(c.id));
  if (newCrews.length) {
    const target = next.structures.find(x => x.id === newCrews[0].target);
    out.push({ kind: 'hire', title: `Hired ${newCrews.length === 1 ? `a crew of ${CREW_SIZE}` : pluralize(newCrews.length, 'crew')}${target ? ` for the ${kitName(target.kind)}` : ''}`, cost: Math.max(0, spent), note: 'They are paid for the hours they work.', flash: ['tab:projects', ...newCrews.map(c => `struct:${c.target}`)] });
  }
  const guardsBefore = prev.guards?.staff.length ?? 0, guardsNow = next.guards?.staff.length ?? 0;
  if (guardsNow > guardsBefore) out.push({ kind: 'hire', title: `Hired a guard (${plural(guardsNow, 'guard')} on staff)`, cost: Math.max(0, spent), note: 'Paid by the month.', flash: ['tab:defense'] });
  // a course signed up for
  const seenCourses = new Set((prev.courses?.enrolled ?? []).map(e => e.id));
  const signed = (next.courses?.enrolled ?? []).filter(e => !seenCourses.has(e.id));
  if (signed.length) {
    const who = (pid: string) => next.people.find(p => p.id === pid)?.first ?? 'Someone';
    out.push({ kind: 'spend', title: `Signed ${listText(signed.map(e => who(e.pid)))} up for the ${listText([...new Set(signed.map(e => COURSES[e.course].name.toLowerCase()))])}`, cost: Math.max(0, spent), note: '', flash: ['tab:family'] });
  }
  // anything else that cost or brought money: say what came in
  if (!out.length && Math.abs(spent) >= 1) {
    const got = (Object.keys(next.stock) as MaterialId[]).map(k => ({ material: k, qty: (next.stock[k] ?? 0) - (prev.stock[k] ?? 0) })).filter(l => l.qty > 0.005 && MATERIALS[l.material]);
    const gone = (Object.keys(next.stock) as MaterialId[]).map(k => ({ material: k, qty: (prev.stock[k] ?? 0) - (next.stock[k] ?? 0) })).filter(l => l.qty > 0.005 && MATERIALS[l.material]);
    if (spent > 0) out.push({ kind: 'spend', title: got.length ? `Bought ${linesText(got)}` : 'Paid', cost: spent, note: '', flash: ['tab:supplies'] });
    else out.push({ kind: 'sale', title: gone.length ? `Sold ${linesText(gone)}` : 'Money came in', cost: spent, note: '', flash: ['tab:supplies'] });
  }
  return out;
}

/** The one-line text of a message: "Ordered 30 lumber for $1,240. Cash left: $8,760. Arrives in about 5 days." */
export function messageText(e: FeedbackEvent, cashLeft: number): string {
  const money = e.cost > 0 ? ` for ${usd(e.cost)}` : e.cost < 0 ? `: ${usd(-e.cost)} in` : '';
  return `${e.title}${money}. Cash left: ${usd(cashLeft)}.${e.note ? ' ' + e.note : ''}`;
}

export interface ToastModel { id: number; at: number; events: FeedbackEvent[]; cashLeft: number; flash: string[] }

/** A burst of actions inside this many milliseconds is one toast. */
export const COALESCE_MS = 1200;

/** Fold a new event into the toast on screen when it came right after (a burst), else start a fresh one. */
export function coalesce(cur: ToastModel | null, evs: FeedbackEvent[], cashLeft: number, nowMs: number, id: number): ToastModel {
  const burst = !!cur && nowMs - cur.at <= COALESCE_MS;
  return { id: burst ? cur!.id : id, at: nowMs, events: burst ? [...cur!.events, ...evs] : evs, cashLeft, flash: [...(burst ? cur!.flash : []), ...evs.flatMap(e => e.flash)] };
}

/** One message for a toast: a single event reads as itself; a burst is summed ("3 purchases: ... for $4,100"). */
export function toastText(t: ToastModel): string {
  if (t.events.length === 1) return messageText(t.events[0], t.cashLeft);
  const cost = t.events.reduce((a, e) => a + e.cost, 0);
  const titles = t.events.map(e => e.title);
  const same = t.events.every(e => e.kind === t.events[0].kind);
  const head = same && t.events[0].kind === 'order' ? `${plural(t.events.length, 'order')} placed` : same && t.events[0].kind === 'build' ? `${plural(t.events.length, 'thing')} staked out` : `${plural(t.events.length, 'purchase')}`;
  return `${head}: ${listNames(titles.map(lower))}${cost > 0 ? ` for ${usd(cost)}` : ''}. Cash left: ${usd(t.cashLeft)}.`;
}

// ---- celebrations ------------------------------------------------------------------------------------------------------

export interface Celebration { id: string; title: string; line: string; points: number; flash: string[] }

/** One line of why each lineage milestone matters (plain words); others fall back to the points. */
const MILESTONE_LINE: Record<string, string> = {
  first_winter: 'The first winter is the hardest. You are through it.',
  off_grid_winter: 'A whole winter on your own power and water.',
  a_home: 'Your own walls and roof, built by your family.',
  first_era: 'The first hard stretch is behind you.',
  born_here: 'A child was born on this land.',
  heir: 'The first child of the place is grown.',
  three_gen: 'Grandparents, parents and children, all under one roof.',
  dozen: 'Twelve people sit down to eat together.',
  self_fed_year: 'A year when the place fed the family.',
};

/** First-of-a-kind moments the lineage list does not have, read from the state (each fires once, on the change). */
const FIRSTS: Array<{ id: string; title: string; line: string; test: (s: GameState) => boolean }> = [
  { id: 'first_roof', title: 'First night under a roof', line: 'The home you built kept the family dry through the night.',
    // the first night after the roof went on: one or two days after it was finished, never later (a stale or reloaded home is not "the first night")
    test: s => s.structures.some(x => {
      if (x.pre || !isFinished(x) || !isHome(x.kind) || x.finishedAt === null) return false;
      const nights = dayIndex(s.clock.t) - dayIndex(x.finishedAt);
      return nights >= 1 && nights <= 2;
    }) },
  { id: 'first_harvest', title: 'First harvest', line: 'Food from your own ground is on the table.',
    test: s => s.food.producedKcal >= 500 && s.structures.some(x => isFinished(x) && /garden|field|orchard|greenhouse|tunnel|coop/.test(x.kind)) },
  { id: 'first_wave', title: 'First wave survived', line: 'They came, and the place held. The next wave will be bigger.',
    test: s => (s.gate.waves?.n ?? 0) >= 1 && !s.gate.pending && !s.gate.aftermath && s.people.length > 0 },
];

/** Celebrations the change from `prev` to `next` brought: new lineage milestones and first-of-a-kind moments. `done` is what was already shown. */
export function celebrations(prev: GameState, next: GameState, done: ReadonlySet<string> = new Set()): Celebration[] {
  if (prev === next || prev.seed !== next.seed) return [];
  const out: Celebration[] = [];
  const before = new Set(prev.lineage.milestones);
  for (const id of next.lineage.milestones) if (!before.has(id) && !done.has(id) && MILESTONE_NAME[id]) {
    const pts = MILESTONE_POINTS[id] ?? 0;
    out.push({ id, title: MILESTONE_NAME[id], line: MILESTONE_LINE[id] ?? 'Another chapter for the family.', points: pts, flash: ['tab:chronicle'] });
  }
  for (const f of FIRSTS) if (!done.has(f.id) && !f.test(prev) && f.test(next)) out.push({ id: f.id, title: f.title, line: f.line, points: 0, flash: ['tab:chronicle'] });
  return out;
}
