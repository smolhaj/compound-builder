/**
 * The per-kind disaster hook seam (WP0 of docs/DISASTER_TEETH.md).
 *
 * Every disaster kind has ONE module, `src/sim/disasters/<kind>.ts`, exporting a `fx: KindFx`. The shared sim files (engine, effects,
 * encounters, economy, radio, homeSafety, collapseLook, neighborLife, contagion, climate) call the dispatchers below and never name a kind,
 * so a work package that adds teeth to a kind edits only that kind's module (plus its own new pure module and tests).
 *
 * Rules for hooks: pure of rendering; deterministic from the state (use `ctx.r` for dice); every strength reads `DIFFICULTY[...]` so Cozy
 * stays gentle and Hardcore bites; per-kind state goes in `s.disaster.fx[<kind>]` (optional, JSON-safe, save v98) or `s.disaster.done` keys.
 * A stub returns nothing: with no hook the dispatcher is the identity, so the sim is unchanged until a package fills one in.
 *
 * Teeth columns (see disasterTeeth.test.ts): a kind covers a column when it defines the hook mapped to it in HOOK_COLUMN, or lists the
 * column in `legacy` (behaviour that predates the seam and still lives in another file; the note says where).
 */
import type { DisasterKind, Track } from './disaster';
import type { Encounter, EncounterKind, Outcome, Posture, Stance } from './encounters';
import type { GameState, Structure } from './state';
import type { CollapseLook } from './collapseLook';
import { mulberry32 } from './rng';
import { fx as gridDown } from './disasters/grid_down';
import { fx as nuclear } from './disasters/nuclear';
import { fx as lawless } from './disasters/lawless';
import { fx as financial } from './disasters/financial';
import { fx as drought } from './disasters/drought';
import { fx as pandemic } from './disasters/pandemic';
import { fx as solarFlare } from './disasters/solar_flare';
import { fx as wildfire } from './disasters/wildfire';
import { fx as ashWinter } from './disasters/ash_winter';
import { fx as cyberattack } from './disasters/cyberattack';
import { fx as zombies } from './disasters/zombies';
import { fx as invasion } from './disasters/invasion';
import { fx as civilWar } from './disasters/civil_war';
import { fx as bioweapon } from './disasters/bioweapon';
import { fx as asteroid } from './disasters/asteroid';
import { fx as unknown } from './disasters/unknown';
import { fx as emp } from './disasters/emp';
import { fx as megaQuake } from './disasters/mega_quake';
import { fx as cropBlight } from './disasters/crop_blight';
import { fx as damFlood } from './disasters/dam_flood';
import { fx as supervolcano } from './disasters/supervolcano';
import { fx as livestockPlague } from './disasters/livestock_plague';
import { fx as satelliteLoss } from './disasters/satellite_loss';
import { fx as oilShock } from './disasters/oil_shock';
import { fx as reactorMeltdown } from './disasters/reactor_meltdown';
import { fx as globalFamine } from './disasters/global_famine';
import { fx as waterWar } from './disasters/water_war';
import { fx as cultTakeover } from './disasters/cult_takeover';
import { fx as massExodus } from './disasters/mass_exodus';

/** The ten places a disaster can be felt (docs/DISASTER_TEETH.md section 2; Raiders and NPC merged into encounters / npcs, Sky = atmosphere). */
export type FxColumn = 'economy' | 'supplies' | 'encounters' | 'npcs' | 'atmosphere' | 'infrastructure' | 'buildings' | 'medical' | 'media';
export const FX_COLUMNS: FxColumn[] = ['economy', 'supplies', 'encounters', 'npcs', 'atmosphere', 'infrastructure', 'buildings', 'medical', 'media'];

/** A tick context: the day since the hit, a dice stream unique to (seed, day, kind) and a one-time-key helper backed by `disaster.done`. */
export interface FxCtx { day: number; r: () => number; once: (key: string) => boolean }

/** The weights `whoComes` rolls over; a hook edits them with `scale` / pushes new ones (kinds beyond EncounterKind need WP3/WP4's own union). */
export interface EncounterMix { w: Array<[EncounterKind, number]>; p: Posture; scale: (kind: EncounterKind, f: number) => void }

/**
 * Encounter kinds a disaster adds without touching the `EncounterKind` union (WP3 rule; later packages append their own). An extra kind
 * rides in `Encounter.kind` cast by `asKind`; the kind's `makeExtra` builds the card, `resolveExtra` answers a stance (null: let the
 * generic threat path fight it, after setting `e.kind` to a base crew kind), `stanceLabels` words the buttons with odds and costs.
 */
export type ExtraEncounterKind = 'tollkeeper' | 'posse' | 'watch_pact' | 'salvage' | 'deserters' | 'checkpoint_stop' | 'quota' | 'draft_notice'
  | 'fugitive' | 'partisan' | 'informant' | 'lost_soldier' | 'reprisal';
/** The header line over the card (GateCard) and whether the kind plays as a raid cutscene (hostile, fought at the wall). */
export const EXTRA_META: Record<ExtraEncounterKind, { kicker: string; raid?: true }> = {
  tollkeeper: { kicker: 'A toll on the county road' }, posse: { kicker: 'The posse comes to collect' }, watch_pact: { kicker: 'The watch committee' }, salvage: { kicker: 'An empty house on the road' },
  deserters: { kicker: 'Armed men off the line', raid: true }, checkpoint_stop: { kicker: 'A checkpoint on the county road' }, quota: { kicker: 'A requisition order' }, draft_notice: { kicker: 'A notice with your name on it' },
  fugitive: { kicker: 'Someone running from the war' }, partisan: { kicker: 'Night visitors' }, informant: { kicker: 'A neighbor with questions' }, lost_soldier: { kicker: 'A soldier at the gate, alone' }, reprisal: { kicker: 'The punitive column', raid: true },
};
export const isExtraKind = (k: string): k is ExtraEncounterKind => Object.prototype.hasOwnProperty.call(EXTRA_META, k);
/** The header over a card for an extra kind (null for any other kind). */
export const extraKicker = (k: string): string | null => (isExtraKind(k) ? EXTRA_META[k].kicker : null);
/** An extra kind that is a raid (plays as a cutscene, fought at the wall). */
export const isExtraRaid = (k: string): boolean => isExtraKind(k) && !!EXTRA_META[k].raid;
/** Put an extra kind in an `Encounter` or an encounter mix. */
export const asKind = (k: ExtraEncounterKind): EncounterKind => k as unknown as EncounterKind;

/** What a hit does to one finished building (see structureDamage.ts for the shared roll). */
export interface StructureHit { structure: Structure; day: number; r: () => number }

/** A decision card: a title, why it matters, and one button per choice (the choice string goes back to `KindFx.choose`). */
export interface FxCard { id: string; title: string; why: string; urgency: number; tone?: 'alarm'; acts: Array<{ label: string; choice: string }> }
/** A signature goal chain: ordered steps, each done or not. */
export interface FxGoal { id: string; title: string; steps: Array<{ label: string; done: boolean }> }

export interface KindFx {
  /** Behaviour that already exists outside the seam: column -> where. Counted by the teeth test; move it behind a hook when convenient. */
  legacy?: Partial<Record<FxColumn, string>>;
  /** The first day of the warning signs. Returns log lines. */
  onWarning?(s: GameState): string[];
  /** The moment of the hit (phase turns to impact). Returns log lines. */
  onHit?(s: GameState): string[];
  /** Once a day from the hit on (effectsDay). Returns log lines. */
  daily?(s: GameState, ctx: FxCtx): string[];
  /** economy: a multiplier on prices (1 = none), applied on top of disaster.priceFactor. */
  priceMods?(s: GameState): number;
  /** infrastructure: multipliers on the eight service tracks, applied right after the daily track update (so they stack with fate and ceilings). */
  serviceMods?(s: GameState): Partial<Record<Track, number>>;
  /** supplies: growing-season and cold adjustments (grow is a multiplier, cold is added), applied at the end of climate(). */
  supplyMods?(s: GameState): { grow?: number; cold?: number };
  /** encounters: edit the mix of who comes to the gate (scale existing weights, push new ones). */
  encounterWeights?(s: GameState, mix: EncounterMix): void;
  /** encounters: build the card for one of this kind's extra encounter kinds (null: not mine). */
  makeExtra?(s: GameState, kind: ExtraEncounterKind, r: () => number, id: string, day: number): Encounter | null;
  /** encounters: answer a stance on one of its extra kinds. Null: fall through to the generic threat path (after setting `e.kind` to a base crew kind). */
  resolveExtra?(s: GameState, e: Encounter, stance: Stance): Outcome | null;
  /** encounters: the buttons for an extra kind, worded with odds and costs (GateCard). */
  stanceLabels?(s: GameState, e: Encounter): Partial<Record<Stance, [string, string]>> | null;
  /** npcs: a multiplier on how hard life is for neighbors (neighborLife.hardship; 1 = none). */
  npcMods?(s: GameState): number;
  /** buildings: roll damage on the finished buildings (use structureDamage.ts). Called on the hit day and each day after; gate with ctx.once. */
  structureDamage?(s: GameState, ctx: FxCtx): string[];
  /** medical: how catching the sickness is (per contact at the gate, spread at home per sick person a day). */
  medical?(s: GameState): { contact: number; spread: number } | null;
  /** media: a radio bulletin for today (null = the usual news). Spoken in the radio's own voice by radio.ts; tone 0 calm .. 3 grave. */
  radioBulletins?(s: GameState, ctx: FxCtx): { text: string; tone: 0 | 1 | 2 | 3 } | null;
  /** atmosphere: adjust the sky and light (collapseLook) after the shared profile has run. */
  look?(s: GameState, look: CollapseLook): Partial<CollapseLook>;
  /** Decision cards for the Next-steps board (docs/DECISIONS.md "WP4 + WP7"): what the player is asked right now. Pure of the state. */
  cards?(s: GameState): FxCard[];
  /** Apply the choice a card's button carries (`FxCard.acts[].choice`); returns a note for the player, or null. May change the state. */
  choose?(s: GameState, choice: string): string | null;
  /** The kind's signature goal chain (steps ticked from the state), shown as a quiet card on the board. */
  goal?(s: GameState): FxGoal | null;
  /** atmosphere: added to the oasis contrast (collapseProgress, 0..1 overall) so a kind can read as collapsed even with the grid up. */
  oasisWeight?(s: GameState): number;
}

/** Which teeth column each hook covers (hooks absent here, such as onHit and daily, are plumbing and do not count alone). */
export const HOOK_COLUMN: Partial<Record<keyof KindFx, FxColumn>> = {
  priceMods: 'economy', supplyMods: 'supplies', encounterWeights: 'encounters', npcMods: 'npcs', look: 'atmosphere', oasisWeight: 'atmosphere',
  serviceMods: 'infrastructure', structureDamage: 'buildings', medical: 'medical', radioBulletins: 'media',
};

export const FX: Record<DisasterKind, KindFx> = {
  grid_down: gridDown, nuclear, lawless, financial, drought, pandemic, solar_flare: solarFlare, wildfire, ash_winter: ashWinter, cyberattack,
  zombies, invasion, civil_war: civilWar, bioweapon, asteroid, unknown, emp, mega_quake: megaQuake, crop_blight: cropBlight, dam_flood: damFlood, supervolcano, livestock_plague: livestockPlague,
  satellite_loss: satelliteLoss, oil_shock: oilShock, reactor_meltdown: reactorMeltdown, global_famine: globalFamine, water_war: waterWar, cult_takeover: cultTakeover, mass_exodus: massExodus,
};

/** The columns a kind covers right now: by hook, plus the legacy notes. */
export function columnsOf(kind: DisasterKind): FxColumn[] {
  const f = FX[kind], out = new Set<FxColumn>(Object.keys(f.legacy ?? {}) as FxColumn[]);
  for (const [hook, col] of Object.entries(HOOK_COLUMN) as Array<[keyof KindFx, FxColumn]>) if (typeof f[hook] === 'function') out.add(col);
  return FX_COLUMNS.filter(c => out.has(c));
}

/** A tick context for callers outside effectsDay: dice unique to (seed, day, salt), once-keys backed by `disaster.done`. */
export function fxCtxFor(s: GameState, salt: number): FxCtx {
  const d = s.disaster, day = Math.floor(s.clock.t - d.hitAt);
  return { day, r: mulberry32(s.seed * 6029 + Math.floor(s.clock.t) * 7 + salt), once: key => { if (d.done?.includes(key)) return false; (d.done ??= []).push(key); return true; } };
}

// ── dispatchers (each is the identity when the active kind has no hook) ────────────────────────────

/** The active kind's fx, once the hit has happened (the hooks below that act on the aftermath use this). A chained follow-on has no hooks of its own yet. */
const after = (s: GameState): KindFx | null => s.disaster.kind && s.clock.t >= s.disaster.hitAt ? FX[s.disaster.kind] : null;
const active = (s: GameState): KindFx | null => s.disaster.kind ? FX[s.disaster.kind] : null;

export const fxOnWarning = (s: GameState): string[] => active(s)?.onWarning?.(s) ?? [];
export const fxOnHit = (s: GameState): string[] => active(s)?.onHit?.(s) ?? [];
export const fxDaily = (s: GameState, ctx: FxCtx): string[] => after(s)?.daily?.(s, ctx) ?? [];
export const fxStructureDamage = (s: GameState, ctx: FxCtx): string[] => after(s)?.structureDamage?.(s, ctx) ?? [];
export const fxPriceMod = (s: GameState): number => active(s)?.priceMods?.(s) ?? 1;
export const fxNpcMod = (s: GameState): number => after(s)?.npcMods?.(s) ?? 1;
export const fxMedical = (s: GameState): { contact: number; spread: number } => after(s)?.medical?.(s) ?? { contact: 0, spread: 0 };
export const fxSupplyMods = (s: GameState): { grow: number; cold: number } => { const m = after(s)?.supplyMods?.(s); return { grow: m?.grow ?? 1, cold: m?.cold ?? 0 }; };
export const fxRadio = (s: GameState, ctx: FxCtx) => after(s)?.radioBulletins?.(s, ctx) ?? null;
export const fxCards = (s: GameState): FxCard[] => active(s)?.cards?.(s) ?? [];
export const fxChoose = (s: GameState, choice: string): string | null => active(s)?.choose?.(s, choice) ?? null;
export const fxGoal = (s: GameState): FxGoal | null => active(s)?.goal?.(s) ?? null;
export const fxMakeExtra = (s: GameState, kind: string, r: () => number, id: string, day: number): Encounter | null => (isExtraKind(kind) ? active(s)?.makeExtra?.(s, kind, r, id, day) ?? null : null);
export const fxResolveExtra = (s: GameState, e: Encounter, stance: Stance): Outcome | null => (isExtraKind(e.kind) ? active(s)?.resolveExtra?.(s, e, stance) ?? null : null);
export const fxStanceLabels = (s: GameState, e: Encounter): Partial<Record<Stance, [string, string]>> | null => (isExtraKind(e.kind) ? active(s)?.stanceLabels?.(s, e) ?? null : null);
export const fxOasis = (s: GameState): number => active(s)?.oasisWeight?.(s) ?? 0;

/** Apply the kind's service multipliers to the live tracks (call after updateDisaster). */
export function fxApplyServiceMods(s: GameState): void {
  const m = after(s)?.serviceMods?.(s);
  if (!m) return;
  for (const [k, f] of Object.entries(m) as Array<[Track, number]>) s.disaster.tracks[k] = Math.max(0, Math.min(1, s.disaster.tracks[k] * f));
}

/** Let the kind edit the encounter weights; returns nothing (mutates `w`). */
export function fxEncounterWeights(s: GameState, w: Array<[EncounterKind, number]>, p: Posture): void {
  const f = active(s)?.encounterWeights;
  if (!f) return;
  f(s, { w, p, scale: (kind, k) => { for (const e of w) if (e[0] === kind) e[1] *= k; } });
}

/** Let the kind adjust the look (after the shared profile). */
export function fxLook(s: GameState, look: CollapseLook): CollapseLook {
  const f = active(s)?.look;
  return f ? { ...look, ...f(s, look) } : look;
}
