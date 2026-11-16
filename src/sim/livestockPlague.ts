/**
 * Livestock plague (WP7, docs/scenarios/livestock_plague.md): avian flu, foot-and-mouth, African swine fever, a zoonotic flu and a feed-borne prion.
 * Biosecurity is a score (measures the family takes), a case within the control radius or on the place raises the cull card, and the cull has
 * five answers (comply, selective, eat them, hide them, refuse). State lives in `disaster.fx.livestock`.
 * Writes: `stock` heads, `money`, `wildlife.henLossUntil` (a lost flock lays at 40 percent for the fallow), neighbor dispositions.
 */
import type { GameState } from './state';
import { dayIndex, calendarOf } from './state';
import { mulberry32 } from './rng';
import { butcher, butcherProblem } from './herd';
import { ANIMALS, type Animal } from './livestock';
import { coopCount } from './poultry';
import { isFinished } from './construction';
import type { FxCard, FxCtx, FxGoal } from './disasterFx';

export type PlagueId = 'hpai' | 'fmd' | 'asf' | 'mixed_zoonotic' | 'bse_like';
export interface PlagueDef { id: PlagueId; name: string; poultry: boolean; animals: Animal[]; /** Base daily chance of reaching an unprotected place once the case is in the county. */ base: number; /** Human tail (a small pandemic). */ human: boolean; feedBorne: boolean }
export const PLAGUES: Record<PlagueId, PlagueDef> = {
  hpai: { id: 'hpai', name: 'avian influenza', poultry: true, animals: [], base: 0.05, human: false, feedBorne: false },
  fmd: { id: 'fmd', name: 'foot-and-mouth disease', poultry: false, animals: ['cow', 'steer', 'pig', 'sheep', 'goat'], base: 0.04, human: false, feedBorne: false },
  asf: { id: 'asf', name: 'African swine fever', poultry: false, animals: ['pig'], base: 0.035, human: false, feedBorne: false },
  mixed_zoonotic: { id: 'mixed_zoonotic', name: 'a zoonotic flu', poultry: true, animals: ['cow', 'pig'], base: 0.05, human: true, feedBorne: false },
  bse_like: { id: 'bse_like', name: 'a feed-borne prion disease', poultry: false, animals: ['cow', 'steer', 'goat'], base: 0.03, human: false, feedBorne: true },
};

export type Measure = 'gate' | 'footbath' | 'boots' | 'net' | 'quarantine' | 'feed';
export const MEASURES: Record<Measure, { name: string; effect: number; usd: number; note: string }> = {
  gate: { name: 'Closed gate, no visitors to the barn', effect: 0.2, usd: 0, note: 'free, and you lose the trade' },
  footbath: { name: 'A bleach footbath at the barn door', effect: 0.15, usd: 20, note: 'changed every day or it does nothing' },
  boots: { name: 'Barn boots and coveralls', effect: 0.15, usd: 30, note: 'never worn off the place' },
  net: { name: 'A netted, roofed run', effect: 0.3, usd: 180, note: 'keeps wild birds out (avian flu only)' },
  quarantine: { name: 'No new animals; 30 days apart for any that come', effect: 0.2, usd: 0, note: 'a quarantine pen' },
  feed: { name: 'Your own feed and hay only', effect: 0.1, usd: 0, note: 'against the prion it is the whole defense' },
};
export type Decision = 'comply' | 'selective' | 'eat' | 'hide' | 'refuse';
export interface PlagueFx {
  v: PlagueId; measures: Measure[]; caseDay: number | null; /** The case reached the place itself. */ onPlace: boolean;
  decision: Decision | null; /** Day index the fallow ends. */ fallowUntil: number; hiddenSince: number | null; cullDay: number | null;
  asked: string[]; lost: number; ate: number; indemnity: number; found: boolean;
}

export const plagueVariant = (s: GameState): PlagueDef => PLAGUES[(s.disaster.variant as PlagueId)] ?? PLAGUES.hpai;
export function plagueOf(s: GameState): PlagueFx {
  const bag = (s.disaster.fx ??= {});
  if (bag.livestock) return bag.livestock as PlagueFx;
  const r = mulberry32(s.seed * 5801 + 9);
  const f: PlagueFx = { v: plagueVariant(s).id, measures: [], caseDay: 4 + Math.floor(r() * 8), onPlace: false, decision: null, fallowUntil: 0, hiddenSince: null, cullDay: null, asked: [], lost: 0, ate: 0, indemnity: 0, found: false };
  bag.livestock = f;
  return f;
}

const heads = (s: GameState, a: Animal): number => Math.floor((s.stock as unknown as Record<string, number>)[a] ?? 0);
const setHeads = (s: GameState, a: Animal, n: number): void => { (s.stock as unknown as Record<string, number>)[a] = n; };
/** Animals the plague could take: the flock (a finished coop) and the listed species with heads on the place. */
export function atRisk(s: GameState): { poultry: boolean; animals: Array<[Animal, number]> } {
  const d = plagueVariant(s);
  return { poultry: d.poultry && coopCount(s) > 0, animals: d.animals.map(a => [a, heads(s, a)] as [Animal, number]).filter(([, n]) => n > 0) };
}
export const hasStockAtRisk = (s: GameState): boolean => { const a = atRisk(s); return a.poultry || a.animals.length > 0; };

/** The biosecurity score, 0..0.9: the measures taken (the net only counts against flu; own feed is the whole defense against the prion). */
export function biosecurity(s: GameState): number {
  const f = plagueOf(s), d = plagueVariant(s);
  let sum = 0;
  for (const m of f.measures) {
    if (m === 'net' && !d.poultry) continue;
    sum += m === 'feed' && d.feedBorne ? 0.8 : MEASURES[m].effect;
  }
  return Math.min(0.9, sum);
}

/** The daily chance the disease reaches an unprotected place (rises once a case is in the county; wild birds in fall and spring for flu). */
export function exposureChance(s: GameState): number {
  const f = plagueOf(s), d = plagueVariant(s), day = Math.floor(s.clock.t - s.disaster.hitAt);
  if (f.caseDay === null || day < f.caseDay || f.onPlace) return 0;
  const doy = calendarOf(s.clock).doy, migrating = (doy > 250 && doy < 330) || (doy > 60 && doy < 130);
  const season = d.poultry && migrating ? 1.8 : 1, hard = s.disaster.difficulty === 'hardcore' ? 1.5 : s.disaster.difficulty === 'cozy' ? 0.6 : 1;
  return d.base * season * hard * (1 - biosecurity(s));
}

/** Dollars a head is worth in an indemnity (full fate pays 60 percent, partial 30, never nothing). */
const VALUE: Record<Animal, number> = { cow: 1400, steer: 1100, pig: 300, sheep: 180, goat: 200, rabbit: 15 };
export const indemnityRate = (s: GameState): number => s.disaster.fate === 'full' ? 0.6 : s.disaster.fate === 'partial' ? 0.3 : 0;

/** Take the animals: returns the number lost and the dollar value. */
function takeStock(s: GameState): { n: number; usd: number; poultry: boolean } {
  const a = atRisk(s); let n = 0, usd = 0;
  for (const [an, c] of a.animals) { n += c; usd += c * VALUE[an]; setHeads(s, an, 0); }
  if (a.poultry) { const flock = 12 * coopCount(s); n += flock; usd += flock * 12; }
  return { n, usd, poultry: a.poultry };
}

function loseFlock(s: GameState, days: number): void { const w = (s.wildlife ??= { gone: {}, lastSight: -9, lastLightLog: -9, lastHour: -1, henLossUntil: -1, encounters: 0, shot: 0 } as never) as { henLossUntil: number }; w.henLossUntil = Math.max(w.henLossUntil, s.clock.t + days); }

export function plagueDaily(s: GameState, ctx: FxCtx): string[] {
  const f = plagueOf(s), d = plagueVariant(s), out: string[] = [], day = dayIndex(s.clock.t);
  if (!f.onPlace && f.decision === null && hasStockAtRisk(s) && ctx.r() < exposureChance(s)) {
    f.onPlace = true; out.push(d.poultry && atRisk(s).poultry ? 'Birds are dying in the coop: three this morning, more by noon. The state vet will want to know.' : 'Animals are drooling and lame. The sick ones will not eat. This is the disease the county has been warned about.');
  }
  if (f.decision === 'hide') {
    if (f.hiddenSince === null) f.hiddenSince = day;
    const found = 0.05 + 0.1 * (1 - (s.disaster.tracks.law ?? 1));
    for (const n of s.neighbors) if (n.status === 'home' && ctx.r() < 0.08) n.disposition -= 6;
    if (!f.found && ctx.r() < found) {
      f.found = true; const t = takeStock(s); f.lost += t.n; f.fallowUntil = day + 90; if (t.poultry) loseFlock(s, 90);
      s.money -= Math.min(Math.max(0, s.money), 500);
      out.push(`The state vet's truck came up the drive. The animals were taken, the place is under a trading ban for 90 days, and a $500 fine is on the table. The neighbors know what you hid.`);
      for (const n of s.neighbors) n.disposition -= 15;
    }
  }
  if (f.cullDay !== null && day >= f.fallowUntil && !f.asked.includes('fallow_done')) { f.asked.push('fallow_done'); out.push('The fallow is over: the barn can be stocked again, from clean sources, with a quarantine for each new animal.'); }
  return out;
}

export function plagueBulletin(s: GameState, ctx: FxCtx): { text: string; tone: 0 | 1 | 2 | 3 } | null {
  const d = plagueVariant(s), f = plagueOf(s);
  if (ctx.r() > 0.5) return null;
  if (ctx.day < 10) return { text: d.poultry ? 'the state veterinarian bans all poultry and livestock movement for thirty days. Auctions are cancelled.' : 'a quarantine zone is declared round a farm two counties over. Do not move animals, and do not visit other barns.', tone: 2 };
  if (f.onPlace) return { text: 'control areas are being drawn: infected premises and the three-mile ring around them are to be culled. Pyres are burning.', tone: 3 };
  if (d.feedBorne) return { text: 'the feed mills are under investigation. If you buy bagged feed, check the lot number against the recall.', tone: 2 };
  return { text: ['egg and milk prices are up again this week.', 'sick animals reported on three farms within ten miles. Keep your boots at the door.', 'a lot of smoke from the north: they are burning stock at the Larson dairy.'][ctx.day % 3], tone: 1 };
}

// ── cards ──

export function plagueCards(s: GameState): FxCard[] {
  const f = plagueOf(s), d = plagueVariant(s), cards: FxCard[] = [], day = dayIndex(s.clock.t);
  if (!hasStockAtRisk(s) && !f.onPlace && f.decision === null) return cards;
  if (f.onPlace && f.decision === null) {
    const a = atRisk(s), rate = indemnityRate(s);
    const price = Math.round(a.animals.reduce((x, [an, c]) => x + c * VALUE[an], 0) * rate) + (a.poultry ? Math.round(12 * coopCount(s) * 12 * rate) : 0);
    cards.push({ id: 'lp_cull', title: `${d.name[0].toUpperCase() + d.name.slice(1)} is on the place`, urgency: 98, tone: 'alarm',
      why: `The state vet's rule is a cull. ${rate > 0 ? `Indemnity would be about $${price.toLocaleString('en-US')}.` : 'Nobody is paying for the animals, and nobody may come to take them.'} A homesteader who can process quickly can turn the herd into food.`,
      acts: [{ label: 'Comply: cull and bury', choice: 'lp:comply' }, { label: 'Kill only the sick (needs a medic)', choice: 'lp:selective' }, { label: 'Butcher and put up the meat', choice: 'lp:eat' }, { label: 'Hide them', choice: 'lp:hide' }] });
    return cards;
  }
  if (!f.onPlace && f.decision === null) {
    const taken = new Set(f.measures);
    (Object.keys(MEASURES) as Measure[]).filter(m => !taken.has(m) && !(m === 'net' && !d.poultry) && !(m === 'feed' && !d.feedBorne && false)).slice(0, 2).forEach(m =>
      cards.push({ id: `lp_${m}`, title: `Biosecurity: ${MEASURES[m].name.toLowerCase()}`, urgency: 62, why: `Protects the stock by about ${Math.round((m === 'feed' && d.feedBorne ? 0.8 : MEASURES[m].effect) * 100)}% (${MEASURES[m].note}). Now ${Math.round(biosecurity(s) * 100)}%.`, acts: [{ label: MEASURES[m].usd ? `Do it ($${MEASURES[m].usd})` : 'Do it', choice: `lp:m:${m}` }] }));
  }
  if (f.decision === 'hide' && !f.found) cards.push({ id: 'lp_hidden', title: 'You are hiding sick animals', urgency: 80, tone: 'alarm', why: 'Every day the vet may find them; the neighbors lose trust the longer it spreads.', acts: [{ label: 'Come clean and cull', choice: 'lp:comply' }] });
  void day;
  return cards;
}

export function plagueChoose(s: GameState, choice: string): string | null {
  if (!choice.startsWith('lp:')) return null;
  const f = plagueOf(s), d = plagueVariant(s), k = choice.slice(3), day = dayIndex(s.clock.t);
  if (k.startsWith('m:')) {
    const m = k.slice(2) as Measure, cost = MEASURES[m]?.usd ?? 0;
    if (!MEASURES[m] || f.measures.includes(m)) return null;
    if (s.money < cost) return `That takes $${cost}.`;
    s.money -= cost; f.measures.push(m); return `${MEASURES[m].name}: done. The stock is about ${Math.round(biosecurity(s) * 100)}% protected.`;
  }
  const cull = (): { n: number; usd: number; poultry: boolean } => { const t = takeStock(s); f.lost += t.n; f.cullDay = day; f.decision = k as Decision; f.fallowUntil = day + 45; if (t.poultry) loseFlock(s, 45); return t; };
  if (k === 'comply') { const t = cull(); const pay = Math.round(t.usd * indemnityRate(s)); s.money += pay; f.indemnity += pay; f.found = false; f.hiddenSince = null; return `The animals were culled and buried (${t.n} head).${pay ? ` The state paid $${pay.toLocaleString('en-US')}.` : ''} The barn stays empty for 45 days.`; }
  if (k === 'selective') {
    const medic = Math.max(0, ...s.people.map(p => p.skills.medic ?? 0));
    if (medic < 3 && d.id !== 'asf') return 'Only a medic (skill 3 or more) can pick the sick from the well. Choose another way.';
    const keep = d.id === 'asf' ? 0 : 0.35, a = atRisk(s);
    for (const [an, c] of a.animals) { const lose = Math.ceil(c * (1 - keep)); setHeads(s, an, c - lose); f.lost += lose; }
    if (a.poultry) { f.lost += 12 * coopCount(s); loseFlock(s, 30); }
    f.decision = 'selective'; f.cullDay = day; f.fallowUntil = day + 30;
    return d.id === 'asf' ? 'Every pig carries it: none could be saved.' : 'The sick and the exposed were put down. About a third of the herd stayed clean, and is watched for a month.';
  }
  if (k === 'eat') {
    let meat = 0;
    for (const [an, c] of atRisk(s).animals) {
      const n = Math.min(c, 4);
      if (butcherProblem(s, an, n) === null && butcher(s, an, n) === null) { meat += n; f.ate += n; }
      const left = heads(s, an); if (left > 0) { setHeads(s, an, 0); f.lost += left; }
    }
    if (atRisk(s).poultry) { f.ate += 12 * coopCount(s); loseFlock(s, 45); }
    f.decision = 'eat'; f.cullDay = day; f.fallowUntil = day + 45;
    return meat || f.ate ? 'A butchering week: everything that could be put up went into the smoker, the jars and the salt barrel. The rest was buried. A feast, and a full pantry.' : 'Too warm and too little room to put the meat up: the animals were buried.';
  }
  if (k === 'hide') { f.decision = 'hide'; return 'The animals stay in the barn behind a closed door. The disease keeps spreading, and the vet may come by.'; }
  return null;
}

export function plagueGoal(s: GameState): FxGoal {
  const f = plagueOf(s), day = dayIndex(s.clock.t);
  return { id: 'livestock', title: 'Get the stock through', steps: [
    { label: 'Close the barn (three biosecurity measures)', done: f.measures.length >= 3 },
    { label: 'Answer the cull', done: f.decision !== null && f.decision !== 'hide' },
    { label: 'Wait out the fallow', done: f.cullDay !== null && day >= f.fallowUntil },
    { label: 'Restock from clean sources', done: f.cullDay !== null && day >= f.fallowUntil && ANIMALS.some(a => heads(s, a) > 0) },
  ] };
}

export const finishedBarns = (s: GameState): number => s.structures.filter(st => isFinished(st) && (st.kind === 'barn' || st.kind === 'chicken_coop' || st.kind === 'sheep_barn')).length;
