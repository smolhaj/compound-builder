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
  solar_flare: { title: 'The sky turns red and green', beats: [B(0, { flash: 0.4, tint: [0.4, 1, 0.5], caption: 'The sky shimmers where it never has.' }), B(2, { flash: 0.3, tint: [1, 0.3, 0.3], caption: 'The phone screen dies in your hand.' }), B(3.8)] },
  emp: { title: 'One flash, and everything with a chip is dead', beats: [B(0, { flash: 0.9, caption: 'A flash with no sound behind it.' }), B(1.6, { caption: 'Cars stop where they are. Clocks go blank.' }), B(3.6)] },
  mega_quake: { title: 'The ground gives way', beats: [B(0, { shake: 1, caption: 'The floor rolls under your feet.' }), B(2, { shake: 0.7, caption: 'The shaking has lasted a minute.' }), B(3.8, { shake: 0.2 })] },
  dam_flood: { title: 'The dam has let go upstream', beats: [B(0, { shake: 0.3, caption: 'A roar comes down the valley.' }), B(2, { tint: [0.35, 0.45, 0.55], flash: 0.2, caption: 'The creek is a wall of brown water.' }), B(3.8, { bearing: 'road' })] },
  wildfire: { title: 'The fire is coming this way', beats: [B(0, { tint: [1, 0.45, 0.1], flash: 0.35, bearing: 'fire', caption: 'The ridge is burning.' }), B(2, { tint: [1, 0.35, 0.1], flash: 0.25, caption: 'Ash falls like snow.' }), B(3.8, { bearing: 'fire' })] },
  nuclear: { title: 'A second sun on the horizon', beats: [B(0, { flash: 1, bearing: 'town', caption: 'Light, then a long silence.' }), B(2, { shake: 0.6, flash: 0.3, caption: 'The windows shudder and the glass holds.' }), B(3.8, { bearing: 'town' })] },
  reactor_meltdown: { title: 'The plant has failed', beats: [B(0, { flash: 0.6, tint: [1, 0.9, 0.5], bearing: 'town', caption: 'A column rises over the river.' }), B(2.2, { caption: 'The siren in town winds up and stops.' }), B(4)] },
  asteroid: { title: 'It is here', beats: [B(0, { flash: 0.9, caption: 'A second sun crosses the sky.' }), B(1.8, { shake: 0.9, caption: 'The sky cracks like a whip.' }), B(3.6, { shake: 0.4 })] },
  supervolcano: { title: 'The sky is going dark at noon', beats: [B(0, { shake: 0.5, tint: [0.4, 0.3, 0.25], caption: 'A rumble that does not end.' }), B(2.2, { tint: [0.25, 0.2, 0.18], flash: 0.2, caption: 'Noon goes dim, then dark.' }), B(4)] },
  ash_winter: { title: 'Ash is falling and the sun is gone', beats: [B(0, { tint: [0.45, 0.42, 0.4], flash: 0.2, caption: 'The sun is a dim coin.' }), B(2, { caption: 'Gray flakes settle on the porch.' }), B(3.8)] },
  pandemic: { title: 'The county goes quiet', beats: [B(0, { tint: [0.6, 0.65, 0.7], caption: 'The road is empty at rush hour.' }), B(2, { caption: 'The radio reads a list of closures.' }), B(3.8, { bearing: 'town' })] },
  zombies: { title: 'The dead are walking', beats: [B(0, { tint: [0.5, 0.2, 0.2], flash: 0.2, caption: 'Something is wrong with the people on the road.' }), B(2, { caption: 'They do not stop at the fence line.' }), B(3.8, { bearing: 'road' })] },
  invasion: { title: 'The county is under foreign guns', beats: [B(0, { shake: 0.3, flash: 0.3, bearing: 'war', caption: 'Distant thunder with no storm.' }), B(2, { caption: 'Aircraft go over low, heading east.' }), B(3.8, { bearing: 'war' })] },
  civil_war: { title: 'The country has split', beats: [B(0, { shake: 0.2, bearing: 'town', caption: 'Gunfire in town, then more of it.' }), B(2, { caption: 'The radio has two stories and neither agrees.' }), B(3.8)] },
  cyberattack: { title: 'The screens go dark', beats: [B(0, { flash: 0.3, tint: [0.2, 0.9, 0.5], caption: 'Every screen shows the same message.' }), B(2, { caption: 'The card reader at the feed store is dead.' }), B(3.8)] },
  financial: { title: 'The banks are shut', beats: [B(0, { tint: [0.8, 0.75, 0.55], caption: 'A line of people outside the bank in town.' }), B(2, { caption: 'The shelves are bare by noon.' }), B(3.8, { bearing: 'town' })] },
  drought: { title: 'The rain has not come', beats: [B(0, { tint: [0.9, 0.75, 0.5], caption: 'The creek is a ribbon of cracked mud.' }), B(2, { caption: 'The well pump runs dry for a minute.' }), B(3.8)] },
};

/** A hit beat for any kind with no entry above (and for kinds the registry does not know): the headline, a flash and one line. */
export function genericHit(kind: string): HitSeq {
  const def = (DISASTERS as Record<string, { name: string; hit: string[] } | undefined>)[kind];
  const title = (def?.hit[0] ?? 'Everything changes today').replace('{cause}', def?.name.toLowerCase() ?? 'something terrible').replace(/\.$/, '');
  return { title: title.length > 90 ? title.slice(0, 87).trimEnd() + '...' : title, beats: [B(0, { flash: 0.45, caption: 'Something is very wrong.' }), B(2, { caption: 'The news comes in all at once.' }), B(3.8)] };
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
