/**
 * What the player sees and decides in the physical shocks (WP6 felt data; docs/FELT_LAYER.md did not exist when this was written, so the
 * named data lives here for it to restyle): decision cards (each a pure `Card` with choices and a resolver), a signature goal chain per
 * kind, and short gauge chips. `src/ui/PhysicalPanel.tsx` draws them. Pure; the resolvers mutate the draft they are handed.
 */
import type { DisasterKind } from './disaster';
import type { GameState } from './state';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { pendingFixes } from './improvements';
import { treated } from './sanitation';
import { bridgeDown } from './roadFx';
import { log } from './economy';
import { buyRetrofit, buyStraps, jumpQueue, physicalOf, repairMarket, STRAPS_USD } from './physical';
import { quakeOf } from './disasters/mega_quake';
import { chlorinateWell, floodOf, muckOut } from './disasters/dam_flood';
import { ashDepth, ashOf, ashOptsOf, type AshOpts } from './ashState';
import { shovelRoofs } from './disasters/ashShared';
import { ROOF_CAP, roofRatio, forecast } from './ashfall';
import { arcOf, asteroidOf, daysLeft } from './disasters/asteroid';
import { arrivalMin } from './floodMath';
import { omoriP } from './quake';

export interface CardChoice { id: string; label: string; usd?: number }
export interface Card { id: string; kind: DisasterKind; title: string; body: string; choices: CardChoice[] }
export interface Goal { id: string; label: string; done: boolean; hint: string }

const ashOpts = (k: DisasterKind | null): AshOpts | null => ashOptsOf(k);
const warning = (s: GameState) => s.disaster.phase === 'warning';
const hitDone = (s: GameState) => !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;
const mainHome = (s: GameState) => s.structures.find(x => isHome(x.kind) && isFinished(x));

/** The worst roof's load over capacity right now (0 with none). */
export function worstRoof(s: GameState, o: AshOpts): number {
  const a = ashOf(s, o.key, o.scale), depth = ashDepth(s, o), P = physicalOf(s);
  let w = 0;
  for (const st of s.structures) if (isFinished(st) && st.kind in ROOF_CAP) w = Math.max(w, roofRatio(depth - (a.base[st.id] ?? 0), ROOF_CAP[st.kind], true, (P.retrofit[st.id] ?? []).includes('rafters')));
  return w;
}

/** The open decision cards. */
export function cardsFor(s: GameState): Card[] {
  const k = s.disaster.kind, P = physicalOf(s), out: Card[] = [];
  if (!k) return out;
  const open = (id: string) => !P.cards[id]?.done;
  const week = Math.floor((s.clock.t - s.disaster.hitAt) / 7);
  if (k === 'mega_quake') {
    if (warning(s) && open('q_prep')) out.push({ id: 'q_prep', kind: k, title: 'A swarm under the valley', body: 'Small quakes four days running and the well has gone cloudy. It may be nothing. Strapping the tanks and bolting the sill is a weekend of work.', choices: [{ id: 'both', label: 'Strap the tanks and bolt the house sill', usd: STRAPS_USD + 650 }, { id: 'straps', label: 'Strap the tanks and shelves only', usd: STRAPS_USD }, { id: 'skip', label: 'Wait and see' }] });
    if (hitDone(s) && repairMarket(s).leadDays > 0 && Object.keys(P.damage).length && open(`q_jump_${week}`)) out.push({ id: `q_jump_${week}`, kind: k, title: 'Every crew is booked', body: `${repairMarket(s).why}.`, choices: [{ id: 'jump', label: 'Pay the premium: a crew now, at 1.5 times the rate for a month' }, { id: 'wait', label: 'Wait for the queue and do it by hand' }] });
    if (hitDone(s) && s.clock.t - s.disaster.hitAt < 14 && open('q_share')) out.push({ id: 'q_share', kind: k, title: 'The kind weeks', body: 'The neighbors are camped in their yards with no water. The aid trucks are on the interstate. Share while the roads are cut, or hold your stores for the hard weeks.', choices: [{ id: 'share', label: 'Share water and food with the neighbors', usd: 250 }, { id: 'hold', label: 'Hold your stores' }] });
  } else if (k === 'dam_flood') {
    const F = floodOf(s);
    if (warning(s) && open('f_prep')) out.push({ id: 'f_prep', kind: k, title: 'The siren and the wave', body: `If the siren sounds the water is here in about ${arrivalMin(F.miles, s.site.region === 'hill_country')} minutes. Move the stock, the vehicles, the papers and the pantry to the bench now.`, choices: [{ id: 'move', label: 'Move everything to high ground', usd: 150 }, { id: 'stay', label: 'Trust the dam' }] });
    if (hitDone(s) && Object.values(P.damage).some(r => r.hazard === 'flood' && !r.dried) && open(`f_muck_${week}`)) out.push({ id: `f_muck_${week}`, kind: k, title: 'Mud-out: 48 hours', body: 'Wet drywall molds in two days and a ruined room is lost in ten. Tear it out now.', choices: [{ id: 'family', label: 'All hands: tear it out ourselves (cuts and infections are the price)', usd: 60 }, { id: 'crew', label: 'Hire a crew (dear; booked after a flood)', usd: 1200 }, { id: 'wait', label: 'Wait for help' }] });
    if (hitDone(s) && F.fouledAt >= 0 && F.chlorinated === null && open('f_well')) out.push({ id: 'f_well', kind: k, title: 'The well went under', body: 'Floodwater is sewage, fuel and pesticide. The well is not safe until it is shock-chlorinated and tested.', choices: [{ id: 'chlorinate', label: 'Shock-chlorinate it with bleach', usd: 40 }, { id: 'skip', label: 'Boil the water instead' }] });
    if (hitDone(s) && s.clock.t - s.disaster.hitAt < 10 && open('f_host')) out.push({ id: 'f_host', kind: k, title: 'The neighbors from the bottoms', body: 'They lost the house and the truck. They are asking to camp on the bench.', choices: [{ id: 'host', label: 'Take them in' }, { id: 'turn', label: 'Turn them away' }] });
  } else if (ashOpts(k)) {
    const o = ashOpts(k)!;
    if (hitDone(s) && worstRoof(s, o) >= 0.5 && open(`a_roofs_${week}_${Math.floor((s.clock.t - s.disaster.hitAt) / 3)}`)) out.push({ id: `a_roofs_${week}_${Math.floor((s.clock.t - s.disaster.hitAt) / 3)}`, kind: k, title: 'The roofs are loading up', body: `The worst roof carries ${Math.round(worstRoof(s, o) * 100)}% of what it can hold, and wet ash is twice as heavy. Shovel before it gives. The panels need wiping too.`, choices: [{ id: 'family', label: 'The family shovels (falls are the risk)' }, { id: 'crew', label: 'Hire a crew (dear, double in the first week)' }, { id: 'wait', label: 'Leave it a day' }] });
  } else if (k === 'asteroid') {
    const A = asteroidOf(s), arc = arcOf(s);
    if (warning(s) && arc.stage !== 'quiet' && arc.stage !== 'discovery' && arc.stage !== 'odds' && A.impact.band !== 'far' && open('x_move')) out.push({ id: 'x_move', kind: k, title: `Impact zone: ${A.impact.zone}`, body: `You are ${A.impact.band === 'near' ? 'inside the zone' : 'in the regional band'}, about ${A.impact.miles} miles out. Staying wins only with a dug-in shelter. The roads jam the closer it gets.`, choices: [{ id: 'leave', label: 'Take the family to a farther region', usd: 1500 }, { id: 'stay', label: 'Stay and dig in' }] });
  }
  return out;
}

/** Settle a card. Returns the line shown to the player. */
export function resolveCard(s: GameState, cardId: string, choice: string): string {
  const P = physicalOf(s), c = cardsFor(s).find(x => x.id === cardId);
  if (!c || !c.choices.some(x => x.id === choice)) return 'That decision has passed.';
  let line = '';
  const say = (t: string) => { line = t; log(s, t); };
  const help = () => { P.flags.helped = ((P.flags.helped as number) ?? 0) + 1; };
  switch (cardId.replace(/_\d.*$/, '')) {
    case 'q_prep': if (choice !== 'skip') { buyStraps(s); if (choice === 'both') { const h = mainHome(s); if (h) buyRetrofit(s, h, 'sill'); } } say(choice === 'skip' ? 'Waiting to see what the swarm does.' : 'The tanks are strapped and the house is bolted down.'); break;
    case 'q_jump': if (choice === 'jump') say(jumpQueue(s) ?? 'A crew will start now.'); else say('Waiting in the queue; the family will do what it can by hand.'); break;
    case 'q_share':
      if (choice === 'share') { if (s.money >= 250) { s.money -= 250; s.gate.humanity = Math.min(100, s.gate.humanity + 6); for (const n of s.neighbors) if (n.status === 'home') n.disposition = Math.min(100, n.disposition + 8); help(); say('You shared water and canned food with the neighbors. They will remember.'); } else say('There is not enough to share.'); }
      else say('You held your stores back.');
      break;
    case 'f_prep': if (choice === 'move' && s.money >= 150) { s.money -= 150; floodOf(s).prepared = true; say('Stock, vehicles and papers are on the bench.'); } else say('You trusted the dam.'); break;
    case 'f_muck': say(choice === 'wait' ? 'Waiting for help; the clock on the mold is running.' : muckOut(s, choice as 'family' | 'crew')); break;
    case 'f_well': say(choice === 'chlorinate' ? chlorinateWell(s) : 'Boiling the water until the well is tested.'); break;
    case 'f_host': if (choice === 'host') { s.gate.humanity = Math.min(100, s.gate.humanity + 6); for (const n of s.neighbors) if (n.status === 'home') n.disposition = Math.min(100, n.disposition + 6); help(); say('The neighbors from the bottoms are sleeping in the barn. They will help with the mud.'); } else { s.gate.humanity = Math.max(0, s.gate.humanity - 8); say('You turned them away.'); } break;
    case 'a_roofs': { const o = ashOpts(s.disaster.kind)!; say(choice === 'wait' ? 'Left the roofs a day.' : shovelRoofs(s, o, choice as 'family' | 'crew')); break; }
    case 'x_move': if (choice === 'leave' && s.money >= 1500) { s.money -= 1500; asteroidOf(s).evacuated = true; say('The family is packed and headed for the far band.'); } else say('Staying and digging in.'); break;
  }
  P.cards[cardId] = { t: s.clock.t, done: choice };
  return line;
}

/** The signature goal chain for the kind (null when the kind has none). */
export function goalChain(s: GameState): { title: string; steps: Goal[] } | null {
  const k = s.disaster.kind, P = physicalOf(s);
  if (!k) return null;
  const homesOk = s.structures.filter(x => isHome(x.kind)).every(x => isFinished(x) && pendingFixes(x).length === 0);
  const noDamage = Object.keys(P.damage).every(id => { const st = s.structures.find(x => x.id === id); return !st || (isFinished(st) && pendingFixes(st).length === 0); });
  const hit = hitDone(s);
  if (k === 'mega_quake') return { title: 'After the big one', steps: [
    { id: 'braced', label: 'Brace the place before it hits', done: !!P.straps || Object.values(P.retrofit).some(r => r.includes('sill')), hint: 'Strap the tanks and bolt the sill (Projects, Paperwork).' },
    { id: 'home', label: 'Make the home safe to sleep in', done: hit && homesOk, hint: 'Mend the roof and chimney; do not light a cracked flue.' },
    { id: 'water', label: 'Clean water', done: hit && treated(s), hint: 'A filter, or fuel to boil it, while the mains are broken.' },
    { id: 'repair', label: 'Everything repaired', done: hit && noDamage, hint: 'Crews are booked for days; hands or a premium.' },
    { id: 'road', label: 'The way in reopened', done: hit && !bridgeDown(s), hint: 'Order the bridge rebuilt.' },
    { id: 'kind', label: 'Help a neighbor in the kind weeks', done: ((P.flags.helped as number) ?? 0) > 0, hint: 'Share, or take in someone.' },
  ] };
  if (k === 'dam_flood') { const F = floodOf(s); return { title: 'High water', steps: [
    { id: 'bench', label: 'Move to the bench before the wave', done: F.prepared || hit, hint: 'Stock, vehicles, papers.' },
    { id: 'muck', label: 'Muck out inside 48 hours', done: hit && Object.values(P.damage).filter(r => r.hazard === 'flood').every(r => r.dried), hint: 'Family or crew.' },
    { id: 'well', label: 'A safe well', done: hit && (F.fouledAt < 0 || F.chlorinated !== null || s.clock.t > F.fouledAt + 30), hint: 'Shock-chlorinate and test.' },
    { id: 'host', label: 'Shelter a neighbor', done: ((P.flags.helped as number) ?? 0) > 0, hint: 'Help comes, but not to everyone at once.' },
    { id: 'rebuild', label: 'Rebuild or raise the home', done: hit && homesOk, hint: 'Rebuild above the flood line.' },
  ] }; }
  const o = ashOpts(k);
  if (o) return { title: 'Under the ash', steps: [
    { id: 'air', label: 'A clean-air room and spare filters', done: (s.stock.filter_set ?? 0) >= 1 || (s.stock.vehicle_parts ?? 0) >= 2, hint: 'HEPA filters and vehicle filter kits.' },
    { id: 'roofs', label: 'Keep every roof under 70% of its load', done: hit && worstRoof(s, o) < 0.7, hint: 'Shovel; brace the long low roofs.' },
    { id: 'hay', label: 'Food stored for two years', done: (s.pantry && Object.keys(s.pantry.items).length > 0) ? true : false, hint: 'The winter that follows is the long part.' },
    { id: 'winter', label: 'Heat and a greenhouse for the first winter', done: s.stock.firewood >= 5, hint: 'Five to ten cords.' },
  ] };
  if (k === 'asteroid') { const A = asteroidOf(s); return { title: 'The countdown', steps: [
    { id: 'read', label: 'Read the corridor', done: arcOf(s).stage !== 'quiet' && arcOf(s).stage !== 'discovery', hint: 'Watch the odds and the zone.' },
    { id: 'band', label: A.impact.band === 'far' ? 'Dig in where you are (you are in the far band)' : 'Leave or dig in', done: A.evacuated || s.structures.some(x => x.kind.startsWith('bunker_') && isFinished(x)) || A.impact.band === 'far', hint: 'Bunker or a farther region.' },
    { id: 'store', label: 'Two years of food and fuel', done: s.stock.firewood >= 5 && !!s.pantry && Object.keys(s.pantry.items).length > 0, hint: 'Early money is worth more.' },
    { id: 'after', label: 'Survive the first winter', done: hit && s.clock.t - s.disaster.hitAt > 365, hint: 'Cold, then hunger.' },
  ] }; }
  return null;
}

/** Short gauge chips for the HUD. */
export function gauges(s: GameState): string[] {
  const k = s.disaster.kind, out: string[] = [];
  if (!k) return out;
  const hit = hitDone(s), m = repairMarket(s);
  if (k === 'mega_quake' && hit) { const Q = quakeOf(s); out.push(`Aftershocks: ${Q.strong} strong${Q.lastMag ? `, last M${Q.lastMag.toFixed(1)}` : ''}; tonight ${Math.round(100 * omoriP(s.clock.t - s.disaster.hitAt + 1, Q.band))}%`); }
  if (k === 'dam_flood') { const F = floodOf(s); out.push(hit ? `River: ${Math.round(F.stage)} ft over normal at the first reach` : `Wave in about ${arrivalMin(F.miles, s.site.region === 'hill_country')} min after the siren`); }
  const o = ashOpts(k);
  if (o) { const a = ashOf(s, o.key, o.scale); out.push(hit ? `Ash: ${ashDepth(s, o).toFixed(1)} in on the ground; worst roof ${Math.round(worstRoof(s, o) * 100)}% loaded` : `Ash forecast: about ${forecast(a.target, Math.max(1, daysLeft(s)), s.seed).toFixed(0)} in`); }
  if (k === 'asteroid') { const A = asteroidOf(s), arc = arcOf(s); if (!hit && arc.line) out.push(`${Math.max(0, Math.ceil(daysLeft(s)))} days. ${arc.line}${arc.corridorMi ? ` Corridor about ${arc.corridorMi} mi wide; you are ${A.impact.band}.` : ''}`); }
  if (m.why) out.push(`Crews: ${m.leadDays} day${m.leadDays === 1 ? '' : 's'} to a start`);
  return out;
}
