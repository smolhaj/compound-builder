/**
 * The hit moment (docs/FELT_LAYER.md 5.1): the short cinematic that plays over the frozen frame before the day card. Pure: beat selection (a kind's own
 * `FeltSpec.hit`, else the table below, else a generic one), the reduced-motion filter and the timeline sampler. Real time, the sim is paused.
 * The per-kind table lives here (not in kinds/<kind>.ts) so the content packages that own those files cannot conflict with it; a kind's own `hit` wins.
 */
import { DISASTERS } from '../disaster';
import { feltSpec } from './registry';
import type { FeltKind, HitBeat } from './types';

export interface HitSeq { title: string; beats: HitBeat[] }

/** Seconds the last beat (the title line) stays up after it starts. */
export const HOLD = 1.6;
/** The longest a hit moment may run. */
export const MAX_SECONDS = 6;
export const duration = (h: HitSeq): number => (h.beats.length ? h.beats[h.beats.length - 1].at + HOLD : 0);

const B = (at: number, o: Omit<HitBeat, 'at'> = {}): HitBeat => ({ at, ...o });

/** Kind-specific sequences. Present tense, plain, no sounds. The last beat carries the title and no caption of its own. */
export const HIT_BY_KIND: Partial<Record<FeltKind, HitSeq>> = {
  grid_down: { title: 'The lights are out across the region', beats: [B(0, { flash: 0.5, tint: [0, 0, 0], caption: 'Every light on the road goes out at once.' }), B(2, { caption: 'The hum from the lines stops.' }), B(3.8)] },
  solar_flare: { title: 'The sky turns red and green', beats: [B(0, { flash: 0.5, tint: [0.4, 1, 0.5], caption: 'The sky shimmers where it never has.' }), B(2, { flash: 0.3, tint: [1, 0.3, 0.3], caption: 'The phone screen dies in your hand.' }), B(3.8)] },
  emp: { title: 'One flash, and everything with a chip is dead', beats: [B(0, { flash: 0.9, caption: 'A flash with no sound behind it.' }), B(1.6, { caption: 'Cars stop where they are. Clocks go blank.' }), B(3.6)] },
  mega_quake: { title: 'The ground gives way', beats: [B(0, { shake: 1, caption: 'The floor rolls under your feet.' }), B(2, { shake: 0.7, caption: 'The shaking has lasted a minute.' }), B(3.8, { shake: 0.2 })] },
  dam_flood: { title: 'The dam has let go upstream', beats: [B(0, { shake: 0.3, caption: 'A roar comes down the valley.' }), B(2, { tint: [0.35, 0.45, 0.55], flash: 0.2, caption: 'The creek is a wall of brown water.' }), B(3.8, { bearing: 'road' })] },
  wildfire: { title: 'The fire is coming this way', beats: [B(0, { tint: [1, 0.45, 0.1], flash: 0.5, bearing: 'fire', caption: 'The ridge is burning.' }), B(2, { tint: [1, 0.35, 0.1], flash: 0.4, caption: 'Ash falls like snow.' }), B(3.8, { bearing: 'fire' })] },
  nuclear: { title: 'A second sun on the horizon', beats: [B(0, { flash: 1, tint: [1, 1, 1], bearing: 'town', caption: 'Light, then a long silence.' }), B(2, { shake: 0.6, flash: 0.3, caption: 'The windows shudder and the glass holds.' }), B(3.8, { bearing: 'town' })] },
  reactor_meltdown: { title: 'The plant has failed', beats: [B(0, { flash: 0.6, tint: [1, 0.9, 0.5], bearing: 'town', caption: 'A column rises over the river.' }), B(2.2, { caption: 'The siren in town winds up and stops.' }), B(4)] },
  asteroid: { title: 'It is here', beats: [B(0, { flash: 0.95, tint: [1, 0.96, 0.85], caption: 'A second sun crosses the sky.' }), B(1.8, { shake: 0.9, caption: 'The sky cracks like a whip.' }), B(3.6, { shake: 0.4 })] },
  supervolcano: { title: 'The sky is going dark at noon', beats: [B(0, { shake: 0.5, tint: [0.4, 0.3, 0.25], caption: 'A rumble that does not end.' }), B(2.2, { tint: [0.1, 0.08, 0.07], flash: 0.45, caption: 'Noon goes dim, then dark.' }), B(4)] },
  ash_winter: { title: 'Ash is falling and the sun is gone', beats: [B(0, { tint: [0.08, 0.07, 0.07], flash: 0.5, caption: 'The sun is a dim coin.' }), B(2, { tint: [0.1, 0.09, 0.08], flash: 0.35, caption: 'Gray flakes settle on the porch.' }), B(3.8)] },
  pandemic: { title: 'The county goes quiet', beats: [B(0, { tint: [0.6, 0.65, 0.7], caption: 'The road is empty at rush hour.' }), B(2, { caption: 'The radio reads a list of closures.' }), B(3.8, { bearing: 'town' })] },
  zombies: { title: 'The dead are walking', beats: [B(0, { tint: [0.5, 0.2, 0.2], flash: 0.2, caption: 'Something is wrong with the people on the road.' }), B(2, { caption: 'They do not stop at the fence line.' }), B(3.8, { bearing: 'road' })] },
  invasion: { title: 'The county is under foreign guns', beats: [B(0, { shake: 0.3, flash: 0.3, bearing: 'war', caption: 'Distant thunder with no storm.' }), B(2, { caption: 'Aircraft go over low, heading east.' }), B(3.8, { bearing: 'war' })] },
  civil_war: { title: 'The country has split', beats: [B(0, { shake: 0.2, bearing: 'town', caption: 'Gunfire in town, then more of it.' }), B(2, { caption: 'The radio has two stories and neither agrees.' }), B(3.8)] },
  cyberattack: { title: 'The screens go dark', beats: [B(0, { flash: 0.3, tint: [0.2, 0.9, 0.5], caption: 'Every screen shows the same message.' }), B(2, { caption: 'The card reader at the feed store is dead.' }), B(3.8)] },
  financial: { title: 'The banks are shut', beats: [B(0, { tint: [0.8, 0.75, 0.55], caption: 'A line of people outside the bank in town.' }), B(2, { caption: 'The shelves are bare by noon.' }), B(3.8, { bearing: 'town' })] },
  drought: { title: 'The rain has not come', beats: [B(0, { tint: [0.9, 0.75, 0.5], caption: 'The creek is a ribbon of cracked mud.' }), B(2, { caption: 'The well pump runs dry for a minute.' }), B(3.8)] },
  lawless: { title: 'The law has left the county', beats: [B(0, { tint: [0.55, 0.45, 0.35], flash: 0.2, caption: 'The sheriff\'s line rings and rings.' }), B(2, { caption: 'Cars slow at your gate and look in.' }), B(3.8, { bearing: 'road' })] },
  bioweapon: { title: 'A sickness made on purpose', beats: [B(0, { tint: [0.45, 0.65, 0.4], flash: 0.2, caption: 'The news says this one was not natural.' }), B(2, { caption: 'Nobody wants to shake hands.' }), B(3.8, { bearing: 'town' })] },
  unknown: { title: 'Nobody can say what has happened', beats: [B(0, { flash: 0.3, tint: [0.7, 0.7, 0.75], caption: 'The radio gives static, a voice, then static.' }), B(2, { caption: 'Every channel says something different.' }), B(3.8)] },
  crop_blight: { title: 'The crops are dying in the field', beats: [B(0, { tint: [0.6, 0.55, 0.3], flash: 0.2, caption: 'The leaves curl and spot overnight.' }), B(2, { caption: 'The neighbor\'s rows look the same.' }), B(3.8)] },
  livestock_plague: { title: 'The herd is sick', beats: [B(0, { tint: [0.55, 0.5, 0.4], flash: 0.2, caption: 'One animal stands apart at the fence, head down.' }), B(2, { caption: 'The vet\'s line is busy all day.' }), B(3.8)] },
  satellite_loss: { title: 'The sky has gone quiet', beats: [B(0, { flash: 0.3, tint: [0.5, 0.6, 0.8], caption: 'Every phone loses its signal at once.' }), B(2, { caption: 'The map in the truck spins and gives up.' }), B(3.8)] },
  oil_shock: { title: 'The pumps are running dry', beats: [B(0, { tint: [0.6, 0.55, 0.45], flash: 0.15, caption: 'A long line of trucks at the only station.' }), B(2, { caption: 'The price on the sign changes twice by noon.' }), B(3.8, { bearing: 'road' })] },
  global_famine: { title: 'The food is running out everywhere', beats: [B(0, { tint: [0.65, 0.6, 0.45], flash: 0.2, caption: 'The grain news is bad, then worse.' }), B(2, { caption: 'The store limits each shopper to one bag.' }), B(3.8, { bearing: 'town' })] },
  water_war: { title: 'The water is being fought over', beats: [B(0, { tint: [0.45, 0.55, 0.65], flash: 0.2, caption: 'The creek runs low, and upstream has a gate.' }), B(2, { caption: 'Men with rifles sit at the headgate.' }), B(3.8)] },
  cult_takeover: { title: 'A new faith has taken the county', beats: [B(0, { tint: [0.6, 0.3, 0.3], flash: 0.2, caption: 'Banners go up on the town hall overnight.' }), B(2, { caption: 'The new preacher knows everyone\'s name.' }), B(3.8, { bearing: 'town' })] },
  runaway_heat: { title: 'The heat is not going to break', beats: [B(0, { tint: [1, 0.93, 0.7], flash: 0.25, caption: 'The thermometer on the porch is past a hundred and twenty.' }), B(2, { tint: [1, 0.9, 0.65], caption: 'The sky is white and the air does not move.' }), B(3.8)] },
  ice_age: { title: 'The snow is not going to melt', beats: [B(0, { tint: [0.6, 0.7, 0.85], flash: 0.2, caption: 'The sun is a pale coin behind the haze.' }), B(2, { tint: [0.65, 0.74, 0.88], caption: 'The drifts have not shrunk in a month.' }), B(3.8)] },
  mass_exodus: { title: 'Everyone is leaving', beats: [B(0, { tint: [0.7, 0.65, 0.55], flash: 0.15, caption: 'Cars stream past your gate, loaded to the roof.' }), B(2, { caption: 'Houses down the road stand open and empty.' }), B(3.8, { bearing: 'road' })] },
};

/** Sentence case, no ending period; an ellipsis-free short title (at most `max` characters, cut at a word end, then a full stop is never added). */
export function shortTitle(text: string, max = 44): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  const first = (t.split(/[.:;!?]\s/)[0] ?? t).trim();
  let out = first.length <= max ? first : first.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[,;:\s-]+$/, '').replace(/\b(and|or|the|a|an|of|to|in|on|with|but)$/i, '').trim();
  if (!out) out = 'Everything changes today';
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** A hit beat for any kind with no entry above (and for kinds the registry does not know): the headline, a flash and one line. */
export function genericHit(kind: string): HitSeq {
  const def = (DISASTERS as Record<string, { name: string; hit: string[] } | undefined>)[kind];
  const title = shortTitle((def?.hit[0] ?? 'Everything changes today').replace('{cause}', def?.name.toLowerCase() ?? 'something terrible'));
  return { title, beats: [B(0, { flash: 0.45, caption: 'The news comes in all at once.' }), B(2, { caption: 'Nothing looks the same as it did this morning.' }), B(3.8)] };
}

/** The hit sequence for a kind: its own spec, else the table, else the generic one. Never null for a real kind. */
export function hitFor(kind: string | null | undefined): HitSeq | null {
  if (!kind) return null;
  const own = feltSpec(kind)?.hit;
  return own ?? HIT_BY_KIND[kind as FeltKind] ?? genericHit(kind);
}

/** Reduced motion: no shake, flash capped at 0.3. */
export function reduceMotion(h: HitSeq): HitSeq {
  return { title: h.title, beats: h.beats.map(b => ({ ...b, ...(b.shake !== undefined ? { shake: 0 } : {}), ...(b.flash !== undefined ? { flash: Math.min(0.3, b.flash) } : {}) })) };
}

export interface HitFrame {
  caption: string;
  /** The title line is up (from the last beat). */
  title: string | null;
  shake: number;
  flash: number;
  tint: [number, number, number] | null;
  bearing: HitBeat['bearing'] | null;
  /** 0..1 of the whole run. */
  progress: number;
  done: boolean;
}

/** The look at `t` seconds: the latest caption stays until the next beat; shake and flash fade from their beat (flash 1.2 s, shake 1.5 s). */
export function at(h: HitSeq, t: number): HitFrame {
  const total = duration(h);
  let caption = '', shake = 0, flash = 0, tint: HitFrame['tint'] = null, bearing: HitBeat['bearing'] | null = null, titleUp = false;
  h.beats.forEach((b, i) => {
    if (t < b.at) return;
    const age = t - b.at;
    if (b.caption !== undefined) caption = b.caption;
    if (b.shake) shake = Math.max(shake, b.shake * Math.max(0, 1 - age / 1.5));
    if (b.flash) { const f = b.flash * Math.max(0, 1 - age / 1.2); if (f > 0) { flash = Math.max(flash, f); if (b.tint) tint = b.tint; } }
    if (b.bearing !== undefined) bearing = b.bearing;
    if (i === h.beats.length - 1) { titleUp = true; caption = ''; }
  });
  return { caption, title: titleUp ? h.title : null, shake, flash, tint, bearing, progress: total ? Math.min(1, t / total) : 1, done: t >= total };
}
