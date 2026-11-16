/**
 * The daily "What's different" feed (FL3, docs/FELT_LAYER.md section 5.3). Strictly TRUE: every line is a difference between yesterday's
 * look at the live sim and today's (services up or down, the store's prices, ordering, neighbors home, days of food and water), so it is
 * what the player could see for themselves. Only the radio can be wrong (feltRadio.ts). Up to six lines, worst first, a quiet day says so,
 * and the top line goes to the Ticker. State: `disaster.fx.feltFeed` (JSON, in the same bag as the kind hooks, no save bump).
 */
import { canOrder, TRACKS, TRACK_NAME, type Track } from '../disaster';
import type { FxCtx } from '../disasterFx';
import { prices } from '../economy';
import { runway, type RunwayId, type RunwayTone } from '../runway';
import type { GameState } from '../state';
import { surname } from '../neighborLife';
import { OUT_BELOW, WORKING_FROM } from './claims';
import { feltDay } from './state';
import type { FeedLine, FeltSpec } from './types';

export const FEED_CAP = 6;
type Band = 0 | 1 | 2;   // out, patchy, working
type NeighborStatus = 'home' | 'left' | 'gone' | 'joined';

/** Yesterday's look. The first day is compared with a world where nothing had happened yet. */
export interface FeedSnap { day: number; band: Record<Track, Band>; price: number; ordering: boolean; neighbors: Record<string, NeighborStatus>; supply: Partial<Record<RunwayId, RunwayTone>> }
export interface FeedState { day: number; lines: FeedLine[]; /** Some line is a loss. */ worse: boolean; snap: FeedSnap; /** Game day each service last went out. */ outSince: Partial<Record<Track, number>> }

export const feedOf = (s: Pick<GameState, 'disaster'>): FeedState | undefined => s.disaster?.fx?.feltFeed as FeedState | undefined;

export const bandOf = (level: number): Band => level < OUT_BELOW ? 0 : level < WORKING_FROM ? 1 : 2;
const SUPPLY: RunwayId[] = ['food', 'water', 'power', 'fuel'];
const SUPPLY_NAME: Record<RunwayId, string> = { food: 'Food', water: 'Water', power: 'Power', heat: 'Heat', medicine: 'Medicine', defense: 'Defense', fuel: 'Fuel' };
const TONE_RANK: Record<RunwayTone, number> = { good: 0, warn: 1, bad: 2 };

/** What the player notices about each service, by band (out, patchy, working). */
const SAYS: Record<Track, [string, string, string]> = {
  grid: ['The grid is down.', 'Grid power is on and off.', 'Grid power is back.'],
  fuel: ['The pumps in town are dry.', 'Fuel at the pumps is rationed.', 'The pumps in town have fuel again.'],
  stores: ['The grocery shelves are bare.', 'The grocery shelves are half empty.', 'The grocery has stock again.'],
  deliveries: ['No delivery trucks are coming through.', 'Deliveries come only now and then.', 'Delivery trucks are running again.'],
  medical: ['The clinic and the pharmacy are closed.', 'The clinic is open for emergencies only.', 'The clinic has reopened.'],
  law: ['Nobody answers 911.', 'The sheriff answers slowly, if at all.', 'The sheriff is answering calls again.'],
  phone: ['Phones and internet are gone.', 'Phones and internet drop in and out.', 'Phones and internet are back.'],
  banks: ['The banks are shut and cards are declined.', 'Banks give out only a little cash.', 'Banks and cards work again.'],
};

/** Today's look at the world. */
export function snapNow(s: GameState): FeedSnap {
  const d = s.disaster;
  const band = {} as Record<Track, Band>;
  for (const t of TRACKS) band[t] = bandOf(d.tracks[t] ?? 1);
  const neighbors: Record<string, NeighborStatus> = {};
  for (const n of s.neighbors) neighbors[n.id] = n.status;
  const supply: Partial<Record<RunwayId, RunwayTone>> = {};
  for (const r of runway(s)) if (SUPPLY.includes(r.id) && r.days !== null) supply[r.id] = r.tone;
  return { day: feltDay(s), band, price: Math.round(prices(s) * 10) / 10, ordering: canOrder(d, s.clock.t), neighbors, supply };
}

/** The look before anything happened: every service working, list prices, every household home, nothing short. */
const peace = (s: GameState, day: number): FeedSnap => ({
  day, band: { grid: 2, fuel: 2, stores: 2, deliveries: 2, medical: 2, law: 2, phone: 2, banks: 2 }, price: 1, ordering: true,
  neighbors: Object.fromEntries(s.neighbors.map(n => [n.id, 'home' as NeighborStatus])), supply: {},
});

const daysText = (n: number): string => n >= 365 ? 'a year or more' : `about ${Math.floor(n)} ${Math.floor(n) === 1 ? 'day' : 'days'}`;
const timesNormal = (p: number): string => `${p.toFixed(1)} times normal`;

/** The differences between two looks, worst first (pure). `since` says how long a service has been out. */
export function diffLines(s: GameState, prev: FeedSnap, now: FeedSnap, outSince: Partial<Record<Track, number>>): FeedLine[] {
  const out: FeedLine[] = [];
  const day = now.day;
  for (const t of TRACKS) {
    const a = prev.band[t], b = now.band[t];
    if (a === b) continue;
    const worse = b < a;
    const tone = worse ? (b === 0 ? ((t === 'grid' || t === 'medical' || t === 'law') ? 3 : 2) : 1) : 0;
    out.push({ id: `svc.${t}.${b}`, text: SAYS[t][b] + (worse && b === 0 ? ` (${TRACK_NAME[t]}, day ${day}.)` : ''), tone: tone as FeedLine['tone'] });
  }
  if (now.ordering !== prev.ordering) out.push({ id: `ordering.${now.ordering ? 'on' : 'off'}`, text: now.ordering ? 'You can order from outside again.' : 'Nothing can be ordered from outside now.', tone: now.ordering ? 0 : 2 });
  else if (now.ordering && prev.price > 0 && Math.abs(now.price - prev.price) / prev.price >= 0.15) {
    const up = now.price > prev.price;
    out.push({ id: `price.${up ? 'up' : 'down'}`, text: `Prices at the store are ${timesNormal(now.price)}, ${up ? 'up' : 'down'} from ${timesNormal(prev.price)}.`, tone: up ? 1 : 0 });
  }
  for (const n of s.neighbors) {
    const a = prev.neighbors[n.id] ?? 'home', b = now.neighbors[n.id] ?? a;
    if (a === b) continue;
    if (b === 'left') out.push({ id: `nb.${n.id}.left`, text: `The ${surname(n)} place is empty: they've pulled out.`, tone: 2 });
    else if (b === 'gone') out.push({ id: `nb.${n.id}.gone`, text: `Nobody answers at the ${surname(n)} place anymore.`, tone: 2 });
    else if (b === 'home') out.push({ id: `nb.${n.id}.home`, text: `Someone is back at the ${surname(n)} place.`, tone: 0 });
  }
  for (const id of SUPPLY) {
    const a = prev.supply[id] ?? 'good', b = now.supply[id];
    if (!b || a === b) continue;
    const worse = TONE_RANK[b] > TONE_RANK[a];
    const row = runway(s).find(r => r.id === id);
    if (!row) continue;
    out.push({ id: `supply.${id}.${b}`, text: worse && row.days !== null && row.days < 1 ? `${SUPPLY_NAME[id]} has run out.` : worse ? `${SUPPLY_NAME[id]} is down to ${row.days === null ? row.value : daysText(row.days)}.` : `${SUPPLY_NAME[id]} is back up to ${row.days === null ? row.value : daysText(row.days)}.`, tone: worse ? (b === 'bad' ? 3 : 1) : 0 });
  }
  void outSince;
  return out;
}

/** The services still out, for a quiet day's line ("Still out: Grid power since day 3"). */
function stillOut(s: GameState, outSince: Partial<Record<Track, number>>, now: FeedSnap): string {
  const hit = s.disaster.hitAt;
  const names = TRACKS.filter(t => now.band[t] === 0).map(t => `${TRACK_NAME[t]}${outSince[t] !== undefined ? ` (since day ${Math.max(0, Math.floor(outSince[t]! - hit))})` : ''}`);
  return names.join(', ');
}

/** One day's feed: updates `fx.feltFeed`, puts the top line on the Ticker, and returns [] (the feed is a card, not a log). */
export function feltFeed(s: GameState, ctx: FxCtx, spec: FeltSpec): string[] {
  const d = s.disaster;
  const fx = (d.fx ??= {});
  const old = fx.feltFeed as FeedState | undefined;
  const now = snapNow(s);
  if (old && old.day === now.day) return [];
  const prev = old?.snap ?? peace(s, now.day - 1);
  const outSince: Partial<Record<Track, number>> = { ...(old?.outSince ?? {}) };
  for (const t of TRACKS) {
    if (now.band[t] === 0) outSince[t] ??= prev.band[t] === 0 ? d.hitAt : s.clock.t;
    else delete outSince[t];
  }
  let lines = diffLines(s, prev, now, outSince);
  const extra = spec.feed?.(s, null) ?? [];
  const seen = new Set(lines.map(l => l.id));
  for (const l of extra) if (!seen.has(l.id)) lines.push(l);
  const worse = lines.some(l => l.tone >= 2);
  lines = lines.map((l, i) => ({ l, i })).sort((a, b) => b.l.tone - a.l.tone || a.i - b.i).map(x => x.l).slice(0, FEED_CAP);
  if (!lines.length) {
    const still = stillOut(s, outSince, now);
    lines = [{ id: 'quiet', text: still ? `Nothing new today. Still out: ${still}.` : 'Nothing new today.', tone: 0 }];
  }
  fx.feltFeed = { day: now.day, lines, worse, snap: now, outSince } satisfies FeedState;
  const top = lines[0];
  if (top.id !== 'quiet' && d.news[d.news.length - 1]?.text !== top.text) {
    d.news.push({ t: s.clock.t, text: top.text, tone: Math.min(top.tone, 1) as 0 | 1 });
    if (d.news.length > 40) d.news.splice(0, d.news.length - 40);
  }
  void ctx;
  return [];
}
