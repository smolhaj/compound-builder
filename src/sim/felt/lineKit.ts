/**
 * The pieces the generic radio lines are built from (FL3): a per-kind theme (what to call the event, how a scared neighbor says it), the
 * `GenLine` shape (a RadioLine that also names its claim as saveable JSON) and the small state readers the lines share.
 */
import type { GameState } from '../state';
import { surname } from '../neighborLife';
import type { Track } from '../disaster';
import { evalClaim, type Claim } from './claims';
import type { FeltKind, FeltPhase, RadioChannel, RadioLine } from './types';

/** A radio line plus the concrete claim it makes today (saved on the `Heard` entry so a scout can check it later). */
export interface GenLine extends RadioLine { claimOf(s: GameState): Claim }

export interface Theme {
  /** The event as a noun phrase: "the quake" ("Emergency management on the quake: ..."). */
  noun: string;
  /** One scared, broken line a civilian says about it. */
  frag: string;
}

export const THEME: Record<FeltKind, Theme> = {
  grid_down: { noun: 'the blackout', frag: 'Lights. All gone. Whole county.' },
  financial: { noun: 'the bank shutdown', frag: 'Cards. Declined. Everywhere. Cash, they want cash.' },
  lawless: { noun: 'the breakdown of order', frag: 'Nobody comes. Called. Nobody.' },
  drought: { noun: 'the drought', frag: 'Creek is dry. Dry. Wells too.' },
  pandemic: { noun: 'the sickness', frag: 'Coughing. Whole families. Stay back.' },
  nuclear: { noun: 'the attack', frag: 'Flash. Then nothing. Stay in. Stay in.' },
  solar_flare: { noun: 'the solar storm', frag: 'Sky went green. Then everything... dead.' },
  wildfire: { noun: 'the fire', frag: 'Smoke. Can\'t see the ridge. Orange, just orange.' },
  ash_winter: { noun: 'the ashfall', frag: 'Sun is gone. Gray. Cold. Still falling.' },
  cyberattack: { noun: 'the network outage', frag: 'Screens dead. Cards dead. Nobody knows why.' },
  zombies: { noun: 'the outbreak', frag: 'They\'re... don\'t go to town. Don\'t.' },
  invasion: { noun: 'the invasion', frag: 'Soldiers. Not ours. Trucks all night.' },
  civil_war: { noun: 'the fighting', frag: 'Shooting. Past the ridge. Both sides.' },
  bioweapon: { noun: 'the release', frag: 'Don\'t drink it. Don\'t touch. Birds, dead.' },
  asteroid: { noun: 'the impact', frag: 'Boom. Then dark. Windows, gone.' },
  unknown: { noun: 'whatever this is', frag: 'Nobody knows. Nobody. Just... stay home.' },
  emp: { noun: 'the pulse', frag: 'Truck won\'t start. Nothing starts. Nothing.' },
  mega_quake: { noun: 'the quake', frag: 'Ground. Moving. Roads, gone. Chimney, down.' },
  crop_blight: { noun: 'the blight', frag: 'Fields black. All of it. Overnight.' },
  dam_flood: { noun: 'the flood', frag: 'Water. Up the road. Fast. Get up high.' },
  supervolcano: { noun: 'the eruption', frag: 'Ash. Falling. Everywhere. Can\'t breathe.' },
  livestock_plague: { noun: 'the stock plague', frag: 'Cattle down. Burning them. Smell, awful.' },
  satellite_loss: { noun: 'the satellite loss', frag: 'Phone says wrong time. No signal. Nothing.' },
  oil_shock: { noun: 'the fuel shortage', frag: 'Pumps empty. Miles of cars. Fights.' },
  reactor_meltdown: { noun: 'the reactor accident', frag: 'Said stay in. Smell that? Stay in.' },
  global_famine: { noun: 'the famine', frag: 'Ships not coming. Bread, gone. Shelves, bare.' },
  water_war: { noun: 'the water war', frag: 'Ditch gates. Guns on the ditch. Don\'t go.' },
  cult_takeover: { noun: 'the Gathering', frag: 'They came to the door. Singing. Don\'t answer.' },
  mass_exodus: { noun: 'the evacuation', frag: 'Cars. Bumper to bumper. Everyone leaving.' },
};

export const dayN = (s: GameState): number => Math.max(0, Math.floor(s.clock.t - s.disaster.hitAt));
export const kindActive = (kind: FeltKind) => (s: GameState): boolean => s.disaster.kind === kind && s.clock.t >= s.disaster.hitAt;
export const days = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;
export const trackWord = (t: Track): string => TRACK_LOWER[t];
const TRACK_LOWER: Record<Track, string> = { grid: 'grid power', fuel: 'fuel', stores: 'the grocery stores', deliveries: 'deliveries', medical: 'the hospital and pharmacy', law: 'the sheriff', phone: 'phone and internet', banks: 'the banks' };

/** The first neighbor household matching, by id (so the text and the claim name the same one). */
export const firstNeighbor = (s: GameState, away: boolean) => s.neighbors.find(n => (n.status === 'left' || n.status === 'gone') === away && (away || n.status === 'home'));
export const familyName = (s: GameState, id: string): string => { const n = s.neighbors.find(x => x.id === id); return n ? surname(n) : 'neighbor'; };

const WITH_HIT: FeltPhase[] = ['hit', 'month', 'season', 'year'];
export const AFTER_WEEK: FeltPhase[] = ['month', 'season', 'year'];

export interface LineSpec {
  id: string; channel: RadioChannel; truth: 'true' | 'false'; tone: 0 | 1 | 2 | 3; phases?: FeltPhase[];
  /** Beyond "this kind is the active disaster and it has hit". */
  when?(s: GameState): boolean;
  claim(s: GameState): Claim;
  text(s: GameState, r: () => number): string;
}

export function genLine(kind: FeltKind, o: LineSpec): GenLine {
  const active = kindActive(kind);
  return {
    id: `${kind}.${o.id}`, channel: o.channel, truth: o.truth, tone: o.tone, phases: o.phases ?? WITH_HIT,
    when: s => active(s) && (o.when ? o.when(s) : true),
    claimOf: o.claim,
    claim: s => evalClaim(s, o.claim(s)),
    text: o.text,
  };
}
