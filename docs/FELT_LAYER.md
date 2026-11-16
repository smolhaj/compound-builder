# The felt layer: wiring every disaster's effects into live gameplay

Owner request: "make sure you figure how to wire those effects so they're felt during gameplay." `docs/DISASTER_TEETH.md` says what each disaster does to the numbers and `docs/scenarios/*.md` says what each one should be. This doc says how all of it reaches the player's eyes and hands. **Docs only: no code, no save change.** It designs against the hook seam in PR #332 (branch `claude/disaster-wp0`: `src/sim/disasterFx.ts`, `src/sim/disasters/<kind>.ts`, `src/sim/structureDamage.ts`, save v98 with the `disaster.fx` bag). Nothing here is built.

## 1. Owner decisions (fixed inputs)

| # | Channel | Decision |
|---|---|---|
| 1 | Hit moment and day card | The disaster announces itself with a short hit-moment cinematic, then a plain "what changed" day card listing the lost services and the first three things to do. |
| 2 | Persistent world state | The map keeps showing it: sky tint, ash, smoke, flood water, cracked ground, dead lights in town, damaged and abandoned buildings, empty roads, refugees and checkpoints. |
| 3 | Daily feed and radio | A daily "what's different" feed, plus a radio with per-disaster rumors, official notices and ham chatter, some true and some false, tied to real sim state. |
| 4 | Decision cards | A few meaningful cards per phase (1 to 3 per phase), gate-card style, with odds and costs. |
| 5 | Signature goal chain | A short goal chain per disaster that swaps the goal card (flare: disconnect and box spares; quake: check structures and shore up; flood: move stores uphill). |
| - | Persistent status strip | **Not chosen.** We add none. The existing `CollapseChip` and `Ticker` stay as they are; the daily feed lives inside the Compound Board (section 5.3). |

Standing rules that apply to everything below: US spelling and units, text and visuals only (no audio), procedural art only, the perf budgets are never raised, every strength reads `DIFFICULTY[...]`, Cozy stays gentle and Hardcore bites, `check` and `perf-budget` stay green.

## 2. Principles

1. **Derive, do not script.** Every felt thing is a pure function of the sim state (`s.disaster`, tracks, structures, neighbors, stock, the clock, `s.disaster.fx[kind]`). A mark, a line or a card never fires from a bare timer; it appears because something is true, so what the player sees is what the sim is doing. Radio can lie (section 5.3), but the lie is checkable.
2. **One registry, one file per kind.** A new module `src/sim/felt/kinds/<kind>.ts` exports a `FeltSpec` (section 4.2). Shared code reads the registry and never names a kind, exactly like `disasterFx.ts`. The felt layer does not edit `src/sim/disasters/<kind>.ts`; teeth work packages and felt work packages never touch the same file.
3. **No save bump.** Felt state (which cards were answered, goal-chain progress, the daily snapshot, mark memory) lives in `s.disaster.fx.felt`, the optional JSON-safe bag WP0 adds in v98. If a package believes it needs a typed field it must record why in `docs/DECISIONS.md` first.
4. **Degrade, never depend.** A felt spec reads a teeth module's state with optional chaining (`s.disaster.fx?.mega_quake?.aftershocks ?? 0`) and falls back to the shared tracks. That is what lets felt packages and teeth packages land in any order.
5. **Cheap by construction.** Marks are recomputed once per game day, rendered through instanced or batched layers that already exist or one new batch, and drawn only near the camera. Zero new lights, zero new post passes, zero shadow casters.
6. **Testable without a GPU.** Everything that decides what the player sees is pure TypeScript with Vitest. Rendering only plays what the pure layer says (the pattern `sim/roadTraffic.ts` and `game/RoadTraffic.ts` already use).

## 3. What exists today, per channel

| Channel | Existing code (on `origin/main`) | What it already does | Gap the felt layer fills |
|---|---|---|---|
| Hit moment | `gameStore.ts` tick sets `dayCard = hitAt` and pauses; `collapseLook.ts` has a day-one pulse (`flash`, dark noon) and a profile per kind; `MushroomCloud.ts`; `GameCanvas.tsx` line ~607 nuclear flash; `cutsceneStore.ts`, `CutsceneOverlay.tsx`, `CutscenePlayer.ts` (raid-only: letterbox, caption, skip); `worldStore.cameraRequest` / `frameCamera` | A frozen instant at the hit, a headline card, a sky pulse for some kinds. Cutscene machinery exists but is bound to raids (`gate.pending`, `siege.ts`). | No staged moment: the card just appears over a frozen frame. No shake, no camera turn, no kind-specific beats. |
| Day card | `sim/dayCard.ts` (`dayCard(s)`, `LOOK_LINE` for 9 of 16 kinds, track loss from `tracksAt(d, hitAt+3)`, household "stand" lines); `ui/DayCard.tsx` newspaper card, button "Face it"; `sim/overlayQueue.ts` (title > ending > raid cutscene > gate decision > day card > recap > milestone) | Headline, "within three days X, Y, Z are gone", food days, power. | Lost services are one run-on line; no "what stays up for you"; no first steps; 7 kinds fall back to "Nothing will be the same for a while." |
| World state | `collapseLook.ts` (haze, tint, `ashCover`, `townGlow`, `townLights`, `traffic`, `convoy`, `fireGlow`, `smoke`, `flashes`, `aurora`, `comet`); `engine/world/fx/FireFx.ts` (up to `MAX_FIRES` 8, two draw calls) and `SmokePlume.ts`; `game/atmosphere/fireSources.ts`; `weather/dustStorm.ts`; `game/RoadTraffic.ts` + `sim/roadTraffic.ts` (stalled cars, `walkerPack`, convoys, one `BatchedMesh` plus one additive mesh); `game/atmosphere/{weathering,aging,nightLife,seasonCover,Overgrowth}.ts` (per-vertex `aWear`, window light per building, snow cover); `sim/raidDamage.ts` (breach, gate, burn scars); `terrainFx.ts`, `roadFx.ts`; `game/region/neighbors.ts` + `engine/world/houses/farmstead.ts` (neighbor farmsteads, rebuilt whole when one burns, `HomesteadWorld.ts` ~742); `StreamRenderer.ts` water | Sky, light and skyline are fully driven by the collapse. Fire, smoke, stalled cars, walking parties exist. | Ground and buildings do not change except fire and raids: no flood water, no cracks, no tarps or red tags, neighbor farmsteads are static whatever happens to the neighbors (`Neighbor.status`), no checkpoints or refugee camps, no damage states (WP6 adds `structureDamage.ts`, but nothing draws them). |
| Feed and radio | `sim/radio.ts` (`radioDay`: reception by set, true or false by `reception().truth`, raider warning, fate hints, 6 generic rumors, `d.news`), `sim/rumors.ts` (`Heard`, scouting confirms or kills a rumor), `sim/newsPool.ts` (peacetime news), `ui/Ticker.tsx`, `CollapseChip` + `collapseChip.ts`, `fogRadioLine`, `roadPassers.passerRumor`; WP0 `radioBulletins` hook merged by `fxRadio` | The truth model, scouting, the ticker. | Radio never speaks to the disaster itself; no daily "what changed" digest; rumors are 6 generic lines. |
| Decision cards | `ui/GateCard.tsx` (stances with odds, `inTen`, costs), `gate.pending` / `gate.card` / `gate.aftermath`, `sim/clockResume.ts` (`decisionOpen`, `resumeSpeed`), `sim/overlayQueue.ts`, `weekender.ts` and `neighborLife.ts` raising `gate.card` | A mature card pattern for encounters. | Disasters raise no choices of their own beyond who comes to the gate. |
| Goal card | `sim/firstHour.ts` (`firstHour()`, `FirstHourGoal` with `title`, `line`, `act`, `why`, `reward`, `pace`, `money`; closed `GoalId` union), `ui/feel/GoalsCard.tsx` mounted by `ui/hud/BuildMenu.tsx`, `sim/guidance.ts` (`SuggestionAct`, `suggestions()`, `sparePartsCard`), `feelStore` goal memory, `watchItems()` | One-hour onboarding goals with a primary button that runs a real action. | After "You're set for now" nothing points at the disaster. |
| QA | `scripts/collapseShots.mjs` (per kind: warning, day card, impact, +3 days, aerial and eye, noon and night, software GL), `scripts/vite.shots.config.ts`, `window.__cb.qa`, `sim/sceneAudit.ts` (static scene integrity), `scripts/perfBudget.mjs` + `perfBudget.json` + `game/perfCensus.ts`, `scripts/perfProbe.mjs` | A screenshot sweep of the sky, a scene audit, a census budget. | No harness for the cards, feed, radio, goals or world marks; the census never sees a disaster. |

## 4. Architecture

### 4.1 Data flow

```
sim step (engine.ts, once a game day after the hit)               render / UI
-----------------------------------------------------            ---------------------------------------
disasterFx dispatchers (WP0) .......... teeth (prices, tracks...)
felt/daily.ts  (new, called by effectsDay via one dispatcher)
   |-- feltMarks(s)    -> WorldMark[]       --(hash changed)-->  game/felt/FeltWorld.ts  (batches, decals, flood)
   |-- feltFeed(s)     -> FeedLine[]        ------------------>  Compound Board "What's different" card + Ticker
   |-- feltRadio(s)    -> d.news + Heard    ------------------>  Ticker, Neighbors/Radio panel, scouting (rumors.ts)
   |-- feltCards(s)    -> fx.felt.pending   ------------------>  ui/felt/FeltCard.tsx (via overlayQueue)
   |-- feltGoals(s)    -> GoalChain state   ------------------>  BuildMenu: SignatureGoalCard replaces GoalsCard
hit tick (gameStore sets dayCard)  ---------------------------->  ui/felt/HitMoment.tsx then DayCard (what changed, first three)
```

Everything left of the arrows is pure and seeded (`mulberry32(seed * K + day * 7 + salt)`, the same stream rule `fxCtxFor` uses). Everything right of them only reads.

### 4.2 The contract each kind supplies

One file per kind, `src/sim/felt/kinds/<kind>.ts`, exporting `felt: FeltSpec`. Every member is optional until the kind's content package lands; the checklist test (section 8) turns "optional" into "required" per kind as content arrives.

```ts
export type FeltPhase = 'warning' | 'hit' | 'month' | 'season' | 'year';   // warning: warnAt..hitAt; hit: day 0-7; month: 8-35; season: 36-120; year: 121+

export interface FeltSpec {
  /** 1. The hit moment (2 to 4 beats, 6 s at most) and the title line shown over the last beat. */
  hit: { title: string; beats: HitBeat[] };
  /** 1. The day card: what stays up for the player, the first three things to do. Lost services are derived from the tracks by the shared code. */
  card: { stays?(s: GameState): string[]; first(s: GameState): FirstStep[] };            // first(): at most 3
  /** 2. World state: marks as a pure function of the state and the day since the hit. Deterministic; capped by tier. */
  marks(s: GameState, day: number): WorldMark[];
  /** 3. Radio and rumors (at least 5 distinct lines; see RadioLine). */
  radio: RadioLine[];
  /** 3. Extra feed lines beyond the generic diff of tracks, prices, neighbors and marks. */
  feed?(s: GameState, prev: FeltSnap | null): FeedLine[];
  /** 4. Decision cards by phase. */
  cards: DecisionCard[];
  /** 5. The signature goal chain (3 to 5 steps); `second` is an optional follow-on chain that starts at the month phase. */
  goals: GoalChain;
  second?: GoalChain;
}
```

Supporting types (all JSON-safe, no functions in saved state; functions live in the spec, state lives in `fx.felt`):

```ts
export interface HitBeat {
  at: number;                 // seconds from the start (real time, sim paused)
  caption?: string;           // one line, plain, present tense ("The shaking has lasted a minute.")
  shake?: number;             // 0..1 camera shake amplitude (0 when reduced motion is on)
  flash?: number;             // 0..1 white or tinted wash; the existing collapseLook day-one pulse is the floor
  tint?: [number, number, number];
  bearing?: 'fire' | 'war' | 'town' | 'road' | number;   // turn the camera toward a skyline direction (collapseLook.az) by at most 25 degrees
}
export interface FirstStep { label: string; why: string; act?: SuggestionAct | { dash: string } }   // act = a real handler, same union guidance.ts already uses; dash = a dashboard tab id

export type MarkKind =
  'ash' | 'ash_drift' | 'smoke' | 'pyre' | 'ruin' | 'flood' | 'mud_line' | 'dry_bed' | 'crack' | 'road_cut' | 'slump' | 'red_tag' | 'tarp' | 'boarded'
  | 'dark_house' | 'open_door' | 'dead_field' | 'burn_scar' | 'checkpoint' | 'barricade' | 'camp' | 'column' | 'queue' | 'banner' | 'sign' | 'zone' | 'stalled';
export type Anchor =
  | { at: 'compound' } | { at: 'structure'; id: string } | { at: 'neighbor'; i: number } | { at: 'town' }
  | { at: 'road'; s: number }        // metres along the county road window, as roadTraffic does
  | { at: 'creek' } | { at: 'lowland'; level: number } | { at: 'field'; i: number } | { at: 'sky'; bearing: number };
export interface WorldMark { id: string; kind: MarkKind; anchor: Anchor; sev: number /* 0..1 */; since: number /* game day */; seed: number }

export type RadioChannel = 'official' | 'ham' | 'trade' | 'rumor' | 'local';
export interface RadioLine {
  id: string; channel: RadioChannel; phases: FeltPhase[];
  truth: 'true' | 'false' | 'stale';          // stale: was true up to `staleDays` ago
  when(s: GameState): boolean;                // eligible: tied to real state (a service is really out, a neighbor really left)
  claim?(s: GameState): boolean;              // the fact the line asserts, checkable; scouting resolves it
  text(s: GameState, r: () => number): string;   // interpolates real numbers (days, counts, prices)
  tone: 0 | 1 | 2 | 3;
}

export interface Cost { money?: number; stock?: Partial<Record<MaterialId, number>>; hours?: number; people?: number; humanity?: number; standing?: number }
export interface DecisionCard {
  id: string; phase: FeltPhase; once?: boolean; cooldownDays?: number;
  when(s: GameState): boolean;                // eligibility from state, never from a timer alone
  title(s: GameState): string; text(s: GameState): string;
  options: Array<{
    id: string; label: string;
    hint(s: GameState): string;               // the plain consequence line
    cost(s: GameState): Cost;                 // shown as chips, charged on choosing
    odds?(s: GameState): { p: number; good: string; bad: string };   // shown as "about 7 in 10"; p scales with DIFFICULTY
    off?(s: GameState): string | null;        // why it cannot be chosen now
    apply(s: GameState, r: () => number): string[];   // the effect; returns log lines
  }>;
  timeoutDays?: number; fallback: string;     // option id taken (and logged) if the card is left; default is the safest option
}

export interface GoalChain {
  id: string; title: string; startsAt: 'warning' | 'hit';
  steps: Array<{ id: string; short: string; title: string; line(s: GameState): string; why(s: GameState): string; done(s: GameState): boolean;
                 act?(s: GameState): FirstHourGoal['act'] | null; reward: { title: string; line: string }; pace?(s: GameState): string | null }>;
}
```

Registry: `src/sim/felt/registry.ts` exports `FELT: Record<FeltKind, FeltSpec>` where `FeltKind = DisasterKind | PlannedKind` (the 8 planned kinds not yet in the `DisasterKind` union: `livestock_plague`, `satellite_loss`, `oil_shock`, `reactor_meltdown`, `global_famine`, `water_war`, `cult_takeover`, `mass_exodus`; WP10 adds them to the union later and the alias collapses). PR #332 already registers 21 kinds (the 16 plus `emp`, `mega_quake`, `crop_blight`, `dam_flood`, `supervolcano`).

Felt state in the save: `s.disaster.fx.felt?: { snap?: FeltSnap; cards: { done: Record<string, string>; pending?: { id: string; since: number }; perPhase: Partial<Record<FeltPhase, number>>; last: number }; goals: { done: string[]; chain: string }; marks?: { sig: string } }`.

### 4.3 Shared-file edits (only FL0 and the named owner touch these)

| File | Edit | Owner |
|---|---|---|
| `src/sim/overlayQueue.ts` (+ test), `src/ui/feel/useOverlayPlan.ts` | Two new slots. Order becomes: title > ending > raid cutscene > gate decision > **hit moment** > day card > **felt decision card** > recap > milestone. A felt card waits behind any gate decision and the day card; it is never lost. | FL0 |
| `src/sim/clockResume.ts` | `decisionOpen` also returns true while a felt card is pending, so the clock stops and resumes at the remembered speed like a gate card. | FL0 |
| `src/App.tsx` | Mount `HitMoment` and `FeltCard` next to `DayCard` and `GateCard`, behind `!clean && !raid`. | FL0 |
| `src/sim/effects.ts` (`effectsDay`) | One call `feltDaily(s, ctx)` after `fxDaily` (the WP0 dispatcher style). | FL0 |
| `src/game/GameCanvas.tsx` | Construct `FeltWorld`, call `feltWorld.update(game, quality)` about once a second and `feltWorld.frame(dt)` per frame (uniforms only); `Math.max` the hit-moment flash into `ws.setWeather`; the cinematic's camera nudge goes through `worldStore.cameraRequest`. | FL2 only (FL1 exposes a store, FL2 reads it) |
| `src/sim/radio.ts` | One call inside `radioDay` after the WP8 selector (`feltRadioLine(s, ctx, want)`), see sync point S1 in section 10. | FL3 |
| `src/ui/hud/BuildMenu.tsx`, `src/ui/feel/GoalsCard.tsx`, `src/sim/firstHour.ts` | `FirstHourGoal.id` widened from `GoalId` to `string` plus an optional `short`; BuildMenu shows `feltChain(game) ?? firstHour(...)`. | FL5 |
| `src/ui/CompoundBoard.tsx` | One mounted card, "What's different". | FL3 |

## 5. The five channels

### 5.1 Channel 1: the hit moment and the day card

**Reuse.** The pause at the hit (`dayCard = hitAt`, `resumeTo`), `collapseLook`'s day-one pulse (the clock stands at the hit, so the look is already at its peak), `worldStore.cameraRequest` for the camera turn, the cutscene overlay's letterbox and caption styling, `DayCard.tsx`, `dayCard()` for the headline, sub and track loss.

**Behavior.**
1. The tick that crosses `hitAt` already sets `dayCard`. The overlay queue shows `HitMoment` first. It runs on **real time with the sim paused**: a CSS letterbox (two bars, no canvas pass), one caption line at a time, an optional camera nudge toward `bearing` (at most 25 degrees, eased over 1.5 s), an optional shake (a small additive offset in the camera update, 0 when `prefers-reduced-motion` is set), a CSS flash layer plus the max of `hit flash` in `ws.setWeather`, and the kind's title line on the last beat.
2. Length: 2 to 4 beats and at most 6 s. Any key or click skips to the card; a Settings toggle "Skip hit cinematic" is remembered (`cb.skiphit`). The cinematic plays once per hit (`dayCardSeen` already prevents repeats on load).
3. Then `DayCard` opens with the existing newspaper header and headline, and two new sections: **What changed** and **Do first**.
   - *What changed* is derived, not authored: services whose track is under 50% on day 3 (`tracksAt(d, hitAt + 3)`), each in one plain clause with its earliest hope (`d.back`, which the card already computes for the global line), then "What still works for you" from `s.utilities.lit` (own power), water, `moneyWorks`, `canOrder`, radio set. Kind-specific lines come from `card.stays`.
   - *Do first* is `card.first(s)`: at most three steps, each a button using the same `SuggestionAct` union `guidance.ts` runs (or a dashboard jump). Pressing one closes the card and runs it.
4. `LOOK_LINE` becomes required for every kind (a one-sentence expectation); the checklist fails a kind that falls back to "Nothing will be the same".

**Contract.** `FeltSpec.hit`, `FeltSpec.card`. **Components.** `src/sim/felt/hitMoment.ts` (pure: beat selection, reduce-motion filter, timeline sampler `at(t)`), `src/sim/felt/hitCard.ts` (pure: what-changed and first-three assembly), `src/ui/felt/HitMoment.tsx`, `src/ui/DayCard.tsx` (extended), `src/game/felt/cameraKick.ts` (pure shake curve). **Perf.** CSS only; no new post-processing; shake is a per-frame camera offset (a few multiplies).

**Tests.** `hitMoment.test.ts` (beats sorted, total at most 6 s, reduced motion zeroes `shake` and caps `flash` at 0.3), `hitCard.test.ts` (every track under 50% at day 3 is named; at most 3 first steps; every `act` resolves to a handler).

### 5.2 Channel 2: persistent world state

**Reuse map** (what draws each requested change; "new" only where nothing exists):

| Change | Drawn by | New? |
|---|---|---|
| Sky tint, haze, dim sun, aurora, comet, flashes | `collapseLook` profiles and each kind's `look` hook (WP9 owns them). The felt layer does **not** re-implement them; the checklist only asserts the look differs from peacetime at day 7. | No |
| Ash falling and lying | `look.ash`, `look.ashCover` (ground). Roofs and ledges: reuse `seasonCover.ts`'s snow-cover path with a gray tint driven by `ashCover`. | Tint only |
| Smoke columns, pyres, smoldering ruins | `FireFx` sources (cap `MAX_FIRES` 8, shared with raid fires; raid fires win), via `feltFireSources(marks)` appended in `fireSources.ts`; skyline smoke is `look.smoke`. | Source list only |
| Flood water, mud line, dry creek bed | `FloodPlane`: one low-resolution plane using the existing water material from `StreamRenderer`, clipped by terrain height in the shader (no mesh rebuild; `uLevel` animates). Dry bed: lower the existing stream's level uniform and tint the bank mud (the shore-mud path from the "Water shores" change). | One plane |
| Cracked ground, road cut and slump | A single 512 px procedural crack atlas drawn as instanced decals (`CrackDecals`, one `InstancedMesh`); road step and cracks as a texture variant selected by a uniform in `roadTextures.ts` (zero extra draw calls). | One instanced mesh |
| Dead lights in town | `look.townGlow` / `look.townLights` (exists) plus **neighbor windows**: `farmstead.ts` gains a per-farm `lit` flag driven by `grid` and `Neighbor.status`; a dead neighbor reads dark at night. | Flag |
| Damaged and abandoned buildings | Own buildings: `structureDamage` state (WP6: none, cosmetic, major, destroyed) drives `aWear` extra wear, tarp and boarded-window props, a red tag sign, smolder for destroyed; neighbor farmsteads: variants `ok | dark | boarded | burned | empty` chosen from `Neighbor.status` and kind marks, applied through the existing "rebuild farms" path (rare: only when the status vector changes). | Props and variants |
| Empty roads | `roadTraffic` profiles (WP9) and `stalled` cars (exist). The felt layer asserts the traffic level drops. | No |
| Refugees, checkpoints, camps, queues | `RoadTraffic` walker parties and convoys (exist; caps by tier). Static roadside set (barrier, sandbags, tent, flag pole, sign board, queue posts) in one `BatchedMesh` (`RoadsideProps`). | One batch |

**Behavior.** `feltMarks(s, day)` returns a deterministic, capped list (Low 40, Medium 120, High 240) of `WorldMark`s. Once a day, and whenever a structure or neighbor changes, the world computes a signature (hash of mark ids and severities); only when it changes does `FeltWorld` place and rebuild (`markPlacement.ts` resolves each `Anchor` to coordinates using the terrain query, county road plan, `planNeighbors` and `s.structures`, never inside a building footprint, on the drive or in water except `flood`/`mud_line`). Marks persist as long as their cause does: cracks stay until repaired, a flood recedes on the sim's schedule, a checkpoint stays while its encounter weight is on, a column thins with the road profile. Fade in over one game hour so nothing pops.

**Visibility rule.** At least one mark per kind must be inside the default camera's 60-unit radius of the home (the compound itself), and one must read at night.

**Components.** `src/sim/felt/marks.ts` (pure core: caps, severity curves, anchors, signature), `src/game/felt/{FeltWorld,markPlacement,FloodPlane,CrackDecals,RoadsideProps,farmVariants}.ts`, `engine/world/houses/farmstead.ts` (variant and `lit` parameters), `game/atmosphere/fireSources.ts` (append), `sim/sceneAudit.ts` (`feltSceneProblems`).

**Perf.** See section 6. Hidden (`visible = false`, zero cost) when there are no marks of that layer.

**Tests.** Pure: determinism, caps by tier, signature stability, monotone persistence, anchors valid. Placement: run the scene-audit corpus (`corpus(seeds, regions)`, `makeScene`) with the kind's marks laid at day 7 and day 30 and assert `feltSceneProblems` is empty: no decal on water, no prop inside a footprint or the drive, no checkpoint off the road corridor, no flood plane above a non-low site (the plane clips by terrain, so the test checks the level against `terrainFx.floodCandidates`).

### 5.3 Channel 3: the daily feed and the radio

**Reuse.** `d.news` and `Ticker` (the surface), `radioDay` and `reception()` (who hears what, how often, how true), `Heard` and scouting in `rumors.ts` (a rumor checked and then confirmed, killed or unclear), `passerRumor`, WP8's per-phase bulletin selector in `radioScripts.ts` (soft dependency; section 10), WP0's `radioBulletins`.

**The daily feed ("What's different").**
- `feltFeed(s)` runs at the day start. It compares a small snapshot (`FeltSnap`: service tracks quantized to tenths, price index, count of neighbors home, mark signature, days of food, water, fuel) saved in `fx.felt.snap` with today and emits up to six lines, worst first: "Phones: gone since Tuesday." "Bread is $9 a loaf, up from $3." "The Ostrom place went dark last night." "Smoke on the north ridge." "Cracks in the county road have opened another 200 feet." Improvements are listed too ("Deliveries: one truck came through").
- Where it shows: a **What's different** card at the top of the Compound Board (the board is already where `CollapseChip` clicks go), and its top line is pushed to the Ticker at tone 0 or 1. No new strip, no persistent widget. A small dot on the existing chip appears while the feed has an unread worsening line (a `title` text change only; the chip file belongs to WP8, so the dot is a CSS class FL3 adds to the board button, not the chip).
- The feed uses only what the player could plausibly know: services they notice, prices at the shop (if open), neighbors they can see. Things only the radio can say (a collapsed bridge ten miles away) never enter the feed.

**The radio.** Each kind supplies at least five distinct `RadioLine`s. The selector (`feltRadioLine`) runs inside `radioDay` after the existing `reception()` roll: `hear` and `truth` stay exactly as tuned. It keeps the existing `want = r() < truth` coin, then picks among **eligible** lines of that class:
- `truth: 'true'` lines are eligible only when `when(s)` and `claim(s)` hold ("the Highway 20 bridge is closed" appears only when `RoadBridgeState` says so).
- `truth: 'false'` lines are eligible when `when(s)` holds and `claim(s)` is false, so every false line is actually false in this world and scoutable ("FEMA trucks Tuesday" with no relief fate).
- `truth: 'stale'` lines were true up to `staleDays` ago (the official "power back in two days" after it was not).
- Channel by set: ham hears official, ham, trade; shortwave hears official, rumor, a thin slice of ham; no radio hears local and rumor only (the existing fence-line model). Reception chance and truth chance are not changed.
- Scouting: a chosen line becomes a `Heard` carrying its `claimId`; `scoutDay` resolves it by evaluating `claim(s)` on the day the scout returns (a small extension to `rumors.ts`), so "confirmed" and "false" are earned, not rolled.
- Text interpolates real numbers (days since the hit, counts, a price, the stage of a flood); a line that never changes across the run does not count toward the five.

**Contract.** `FeltSpec.radio`, `FeltSpec.feed`. **Components.** `src/sim/felt/{feed,feltRadio,claims}.ts`, `src/ui/felt/FeedCard.tsx`, `src/ui/CompoundBoard.tsx` (one mount), `src/sim/rumors.ts` (claim resolution), `src/sim/radio.ts` (one call).

**Perf.** One snapshot compare and at most one line a day: microseconds.

**Tests.** `feltRadio.test.ts`: for every kind, build fixture states across phases and assert (a) every selectable true line has `claim` true, every false line has `claim` false or is unverifiable, (b) at least 5 distinct templates, at least one `true` and one `false`, at least 2 channels, (c) no line is eligible on a state where the kind is not active, (d) a ham set hears strictly more channels than no radio, (e) the same seed and day gives the same line, (f) scouting a false line yields "false" and a true one "confirmed". `feltFeed.test.ts`: diffs, ordering, cap of six, no repeats on consecutive days unless worsened.

### 5.4 Channel 4: decision cards

**Reuse.** The gate card's look and wording pattern (`GateCard.tsx` box, option rows with a hint line, `inTen` odds wording, cost chips), `gate.card` style closing, `decisionOpen` and `resumeSpeed`, `overlayQueue`, `weekender.ts`'s guard (`!gate.pending && !gate.card && !gate.aftermath && !ending` before raising anything).

**Behavior.**
- `feltCards(s)` runs daily. It selects at most one pending card: eligible by `when(s)`, within the phase budget (1 to 3 cards per phase; a kind with a warning shorter than 3 days gets one warning card), spaced at least 2 game days after the last card, never while a gate decision, raid, cutscene or ending is up. It sets `fx.felt.cards.pending`. The overlay queue shows it when the day card and any gate decision are done.
- The card has 2 to 4 options. Each option shows its **cost** chips (money, stock, hours, people, humanity, standing) and, where chance matters, **odds** in the gate card's words ("about 7 in 10: it holds / about 3 in 10: the wall comes down"). Odds read the real state (build quality, hours available, who is home) and scale with `DIFFICULTY`. No option may dominate: the test requires each pair of options to differ on at least two of cost, risk and relationship.
- Answering charges the cost, runs `apply` (with the day's seeded stream), appends log lines, and records `done[id] = optionId` so a card never repeats unless `cooldownDays`. If left unanswered, `timeoutDays` runs `fallback` (the safest option) and logs "You did not decide, so ...". Cozy lengthens timeouts; Hardcore shortens them.
- The sim clock stops while a card is open (the same contract as gate cards).

**Components.** `src/sim/felt/cards.ts` (pure selection, budgeting, apply, timeout), `src/ui/felt/FeltCard.tsx` and `src/ui/felt/odds.ts` (a copy of the `inTen` wording, so `GateCard.tsx` stays untouched), `src/store/feltStore.ts` (`answer(cardId, optionId)`, `structuredClone` of the game like every other action).

**Tests.** `feltCards.test.ts`: per kind 1 to 3 eligible cards in each phase that applies; each has at least 2 options, a `fallback` that exists, costs that are affordable under a typical fixture (and `off` set when not), odds in 0 to 1 and sums describing exclusive outcomes, deterministic `apply` for a seed, state survives `structuredClone` and the save round trip, spacing and no-stack rules, and that Cozy and Hardcore change the odds.

### 5.5 Channel 5: the signature goal chain

**Reuse.** `FirstHourGoal` (title, line, act with a real handler, why, reward, pace, money), `GoalsCard.tsx` (current goal plus strip plus "Why this matters"), `BuildMenu.tsx` mount, `SuggestionAct` handlers, `firstHour`'s memory (done stays done), `watchItems` for the "You're set for now" line.

**Behavior.** Each kind has one chain of 3 to 5 steps (optionally a second at the month phase). The chain **replaces** the goal card from the first warning day (or the hit when there is no warning) through completion; a "Show first-hour goals" link folds back. A step is `done(s)` from real state (a Faraday box with the spares in it, a retaining wall stage finished, stores above the flood line), never from a click. Each step's primary button runs a real action through the same `run` handler, shows "why this matters" tied to the live clock (the flood crest hour, the aftershock forecast, hours of battery left) and a reward line when done that names what it bought ("Spares are safe: the inverter and two chargers will survive."). On completion the card becomes "You're set for now" with `watchItems` and reverts.

Owner examples, as chains:
- **Solar flare** (warning 1 to 3 days): disconnect the long lines and the inverter's grid tie, box the spares in the Faraday room, verify the box (radio test), top off water and fuel.
- **Mega quake**: check structures (walk each building and rate it), shut the gas and water valves, shore up the walls rated yellow, store boiled water.
- **Dam flood**: move stores uphill, open the stock gates and move the herd, throw the main and raise the pump, mark a dry route; after the crest, mud out and test the well.

**Components.** `src/sim/felt/goals.ts` (pure: current chain, `done` memo, completion), `src/ui/hud/BuildMenu.tsx` (the swap), `src/ui/feel/GoalsCard.tsx` (uses `g.short ?? SHORT[g.id]`), `src/sim/firstHour.ts` (type widening only).

**Tests.** `feltGoals.test.ts`: each chain has 3 to 5 steps; `done` is false at the fixture start and true after the fixture is moved to the finished state; every `act` returns a handler the guidance runner knows or null with a stated `off`; the chain is monotone (a later step never un-does an earlier one); the card swaps in at the right phase and folds back on completion; progress survives save and load.

## 6. Performance limits

Target: a 14-inch 2021 MacBook Pro (M1 Pro) holds 60 fps at homestead scale on Medium with the worst kind at day 30. The only enforced numbers are the CI budgets; the rest are design limits the packages must meet and show.

| Item | Limit | How enforced |
|---|---|---|
| New draw calls from the felt layer | Low at most 3, Medium at most 5, High at most 6 (flood plane 1, roadside batch 1, crack decals 1, plus up to 3 shared with existing layers: fire and smoke already counted in `FireFx`) | New `perfBudget.json` scene `felt` (the mountain showcase with `&feltkind=mega_quake&feltday=30` and a second entry for `dam_flood`), measured once and then fixed. The existing `mountain` entry is unchanged, so nothing is raised. |
| Triangles added | At most 6k Low, 12k Medium, 15k High with every mark kind on | same census |
| Shadow casters, new lights, new post passes | 0, 0, 0 (props cast no shadows; window glow reuses `lightPool`; no new pass) | census plus review rule |
| JS per frame | At most 0.2 ms: uniforms only; marks recomputed once per game day and on structure or neighbor change; placement cached by signature | `perfProbe.mjs` frame-time sample in the QA run |
| Marks | Low 40, Medium 120, High 240; drawn within 140 units of the camera (Low 70) | tested cap |
| Textures | One 512 px atlas (256 px on Low), generated once on a canvas | review |
| Reuse | Instanced and batched layers only (`BatchedMesh` like `RoadTraffic`, `InstancedMesh`), `FireFx` for all fire and smoke, `RoadTraffic` for all walkers and convoys | review rule |
| Hit moment and cards | CSS and React only; the clock is paused while they show | review |
| Sim cost | At most 0.05 ms a day for marks, feed, radio, cards and goals together | a Vitest timing guard with a generous 5 ms ceiling over 365 simulated days |
| Quality tiers | Low: no decals, no farm variants beyond dark windows, flood plane flat color; Medium: all marks at half density; High: everything | per-tier caps above |
| Budgets | **Never raised.** If a kind does not fit, cut marks or density, not the budget. | CI `perf-budget` |

## 7. Tests and the QA harness

**Vitest (pure parts), all under `src/sim/felt/` unless noted:** `feltContract.test.ts` (every kind in `DISASTERS` and every planned kind has a spec; shapes valid), `feltChecklist.test.ts` (section 8, per kind, with a `FELT_ENFORCE` set that grows as content lands), `feltMarks.test.ts`, `feltRadio.test.ts`, `feltFeed.test.ts`, `feltCards.test.ts`, `feltGoals.test.ts`, `hitMoment.test.ts`, `hitCard.test.ts`, `cameraKick.test.ts` (in `src/game/felt/`), `markPlacement.test.ts` and the scene-audit extension (`feltSceneProblems`) over the corpus, `overlayQueue.test.ts` (new slots and order), `clockResume` (felt card holds the clock), a save round trip with `fx.felt` populated, and a timing guard. The teeth test (`disasterTeeth.test.ts`, WP0 and WP9) stays the owner of "4 or more columns"; the checklist imports `columnsOf` and fails if it is under 4 once WP10 turns `ENFORCE_MIN` to 4.

**QA harness: `scripts/feltShots.mjs`** (modeled on `collapseShots.mjs`: its own Vite server with `scripts/vite.shots.config.ts`, software GL, `?seed=7&lowrender`, `window.__cb.qa.renderFull`). New hooks on `window.__cb.felt` (FL6): `start(kind, variant?)`, `jump(days)`, `hitMoment.seek(sec)`, `openCard(id)`, `chain.step(n)`, `marks()`. For each kind it saves to `shots/felt/<kind>/`:

1. **Hit moment**: frames at 0.0, 1.5 and 3.0 s plus the title beat (the overlay is seeded by `seek`, so frames are deterministic).
2. **Day card**: the card with the HUD visible.
3. **World state**: week 1 and month 1, aerial and eye level, noon and night, **HUD hidden** (`worldStore.hudHidden`) so no modal covers the view, plus a peacetime baseline of the same seed.
4. **Radio feed**: the Board's "What's different" card and the Ticker at days 3, 10 and 30, with a ham set owned.
5. **Decision card**: one shot per defined card, open.
6. **Goal card**: the first step and a mid-chain step.

`--audit` mode turns the shots into assertions: no `pageerror` or console error; the eye-level week-1 shot differs from the peacetime baseline by at least 4% mean absolute pixel difference (so "no visible change" fails automatically); no camera inside geometry (existing eye-level rule); the world shots are taken with no card or modal up; every card, the day card and the goal card fit the viewport at 1440 x 810 and 1024 x 700 (no clipped buttons); the census delta (draw calls, triangles) stays inside section 6. A contact sheet per kind is the PR evidence. The run is slow (software GL), so CI runs a three-kind smoke (`--quick --kinds mega_quake,solar_flare,dam_flood`) and the full 29 run on demand, like `collapseShots`.

## 8. The felt checklist (acceptance for every disaster)

A kind is "felt" only when all of these hold. `feltChecklist.test.ts` automates 1 to 12; 13 to 15 are `--audit` or review.

1. **Teeth:** `columnsOf(kind).length >= 4` (the WP0 test; both enforced at `ENFORCE_MIN = 4`).
2. **Hit moment:** 2 to 4 beats, at most 6 s, a unique title line, skippable; reduced motion removes shake and strong flash.
3. **Day card:** every track under 50% on day 3 is named in plain words; "What still works" present; 1 to 3 "Do first" steps, each with a working action; a kind-specific `LOOK_LINE`.
4. **World change:** at least one mark kind visible at day 7 and a different or additional one at day 30; at least one persists until its cause ends (cracks until repaired, a camp until the road clears); one is within 60 units of the home; one reads at night; the week-1 eye-level shot differs from peacetime by at least 4%.
5. **Feed:** at least one feed line on each of the first 7 days (a day with no change says "Nothing new"); no duplicate on consecutive days.
6. **Radio:** at least 5 distinct line templates, including at least 1 true and 1 false and at least 2 channels; at least 2 lines whose text changes with state; every false line is scoutable to "false", every true line to "confirmed".
7. **Decision cards:** every phase that applies has 1 to 3 cards (4 phases for most kinds; a flare has one warning card); each has at least 2 options, visible costs, odds where chance matters, a safe `fallback`, and no dominated option.
8. **Signature goal:** a chain of 3 to 5 steps replaces the goal card at the warning or hit; steps complete from state; each reward line names a concrete benefit.
9. **Difficulty:** card odds, timeouts and cost multipliers read `DIFFICULTY[...]`; Cozy and Hardcore differ in a test.
10. **Determinism and saves:** same seed and day gives the same marks, lines and cards; `fx.felt` round-trips a save; old saves with no `fx.felt` load.
11. **Text rules:** American English, US units (miles, feet, inches, degrees F, pounds, dollars), no audio, no placeholder strings, real numbers interpolated from the sim.
12. **No status strip:** no new persistent HUD element; the feed is a board card and the existing ticker.
13. **Perf:** census delta at day 30 within section 6; no new shadow casters, lights or passes.
14. **Visual QA:** the harness run is clean (no console errors, nothing clipped, nothing covering the view in world shots).
15. **Chaining:** when the kind chains into another (`DISASTERS[kind].chain`), the second kind's marks and radio take over cleanly and the first kind's persistent marks that are still true remain.

## 9. Per kind

Beats are text and visuals only. "Cards" lists the 2 to 3 flagship decisions (each phase gets its own 1 to 3; these are the ones that must exist). "Goal" is the signature chain, steps in order. Radio themes name the true, official and false lines to write (at least 5 per kind). Kinds marked (new) have a scenario doc under `docs/scenarios/` or a proposal in DISASTER_TEETH section 4 (no scenario doc yet for `crop_blight` and `livestock_plague`; they follow section 4 items 2 and 6).

### 9.1 Natural and physical

| Kind | Hit-moment beat | Key visible world change | Decision cards | Signature goal chain | Radio themes |
|---|---|---|---|---|---|
| `mega_quake` (new) | Low rumble caption, shake ramps up over 4 s and settles, dust plume lifts on the ridge; title "The ground let go." | County road cracked with a step, slumped shoulders, bridge out, tarped and leaning neighbor houses, red tags on walls, slide scars and dust on the ridge, tilted fence posts; aftershocks add a shake and fresh cracks | Sleep in the cracked house or the yard; dig for a trapped neighbor now or wait for the crew; share clean water in the kind weeks or keep it for the hard ones | Check structures (rate each building red, yellow, green) -> shut gas and water valves and check flues -> shore up the yellow walls -> store boiled water | Boil orders; bridge and highway closures; aftershock forecast ("M6.1 expected tonight"); red-tag counts (true); "the dam is cracked" (false); fuel terminal offline; relief arriving Tuesday (false) |
| `dam_flood` (new) | Night sirens caption, a roar, the flood plane rises over 5 s in the creek bottom; title "The river came up the valley." | Flood water in the lowlands and the creek bottom, mud line on walls, silt on the road, washed-out road section, drowned stock, fences down; recedes on the sim's schedule leaving mud | Move the herd uphill now (half a day, gates open) or leave them; rescue the neighbor on the roof (rope or boat, risk); treat the well (shock chlorination, bleach) or haul water | Move stores uphill -> open the stock gates and move the herd -> throw the main and raise the pump -> mark a dry route; after the crest: mud out and test the well | Siren and stage forecasts; crest time (true); road closures; "the dam upstream is completely gone" (false); boil water order; Red Cross boats; the dry route question |
| `supervolcano` | Noon darkens: sky tint slides over 5 s, then the first gray flakes; title "Noon went dark." | Ash falling and lying (gray ground, gray roofs), drifts at doors, roof-load sag on weak sheds, stalled cars (air filters), dim sun | Shovel the barn roof now (hours, fall risk) or brace a post; run the engine (filters) or park it; take in the neighbor's kids when respirators are short | Gather respirators and filters -> clear roofs before 4 inches -> cover air intakes and the well cap -> stock filters and tarps | Alert level ladder; ash forecast cone; roof-load advisories; highway closures; "the ash is harmless" (false); flights grounded |
| `ash_winter` | Slow beat: a frost in July, caption "The summer that didn't come."; title card on the last beat | Gray sky, frost in the growing season, dead and white gardens, snow in odd months, fallow neighbor fields, bare trees | Plant the cold-hardy seed or hold it back; slaughter surplus stock now or feed through; trade food for fuel | Move food to cold crops (high tunnel or greenhouse) -> store a year of staples -> insulate the house -> save seed | Growing-season forecast; price index; shipping resumption rumors (false); a farm co-op's seed lot (true); heating oil prices |
| `asteroid` | Comet in the sky through the warning; at the hit a white-out, then a 9-minute caption delay "the sound came later"; title "It landed." | Comet growing in the sky; after impact a dust layer dims the sun, fires on the horizon, ejecta haze; two years of dark | Warning: stay or leave the narrowing corridor (public odds); spend savings in the prep race; hit: open the bunker to neighbors | Decide stay or move -> dig in (cellar or bunker) -> stock two years -> add grow lights to the greenhouse | Odds updates and corridor maps (true); deflection mission news (false hope); ocean variant wave warnings; price curve |
| `wildfire` | Orange horizon at night, evacuation "GO" caption, embers streaming; title "The front came over the bench." | Smoke columns, falling ash, burned black ground, scorched trees, smoldering neighbor ruins, orange sky; later post-fire flood risk | Ready, Set, Go: stay and defend or leave (odds); shelter neighbors at the pond; after: salvage burned timber now or wait for rain | Clear defensible space -> wet down roofs and set sprinklers -> load the go-bag and truck; after: check hot spots | Evacuation levels; wind-shift forecast (true); "the front turned" (false); power shutoff notices; road closures |
| `drought` | Creek stops, caption "The creek stopped."; wells drop | Creek shrinks to cracked mud, dust sky, brown ground, thin cattle, cracked-ground decals, tank trucks on the road | Cull the herd now or haul water; share the well with the neighbors; plant the drought crop or let the garden go | Measure the well -> write a water budget -> cull or haul decision -> shade and mulch | Well tables; water restrictions; rain forecasts that fail (stale); water thieves; a dam release rumor (false) |

### 9.2 Technology and economy

| Kind | Hit-moment beat | Key visible world change | Decision cards | Signature goal chain | Radio themes |
|---|---|---|---|---|---|
| `grid_down` | Town lights drop in a north-to-south ripple, hum caption; title "The lights went out." | Town glow gone, neighbor windows dark but a few oil lamps, ice glaze and sagging lines (ice-storm variant), stalled signals | Run the generator tonight or save the fuel; plug in the neighbor's freezer; island the house now | Disconnect from the grid (breaker and tie) -> test the generator and count fuel -> fill water -> triage the freezer | Utility restoration ETAs (official, optimistic, stale); ham map of the cascade; copper thieves at the substation; crews on the way (false) |
| `solar_flare` | Aurora fills the sky, static caption, sparks on the lines; title "The sky is on fire." | Aurora, then dark grid and town; a burned transformer on the road pole; dead neighbor windows | Warning: box the spares and disconnect or ride it out; hit: test the inverter now or wait a week; month: lend your generator | Disconnect the long lines and grid tie -> box the spares in the Faraday room -> verify with a radio test -> wait out the storm | Space-weather watch (true); shortwave blackout (true); "grid back in 2 weeks" (false); transformer shipping; ham bands recovering |
| `emp` (new) | A white wash for 0.4 s at dawn, then silence; title "Nothing started." | Dead cars stalled on the road, no town lights, no hum, idle neighbors, a clean sky | Start the 1978 truck now or save the starter; open the boxed radio to listen; barter a working vehicle | Inventory what survived -> pull the spares from the box -> start the old truck -> carry water by hand | Almost nothing on the air; ham only; "it was a weapon" speculation; "NATO responded" (false); who has a working radio |
| `cyberattack` | Screens go blank and a card terminal says "declined"; title "Everything went offline." | Dark ATMs and "cash only" signs, queues at pumps in town, tow trucks, neighbors' lights on but shops shut | Pay your hired hands in cash or lose them; bypass the smart well controller (hours) or buy the part (price); join the neighbors' paper-ledger market | Walk the property and list smart devices -> set manual overrides -> start a cash and barter ledger -> paper maps and a radio | Ransomware claims; "banks reopen Monday" (false); grid operator notices (true); card systems down; payroll |
| `satellite_loss` (new) | Caption "the phone says 1:16, the clock says 1:03"; planes grounded; title "The sky went quiet." | No contrails, stuck trucks on shoulders, cash-only pumps, thinning shelves, unforecast storms | Pay cash or wait for the card at the feed store; trade with a stranded driver; hold fuel or share it | Paper maps and a compass -> set time by the sun and a clock standard -> cash on hand -> radio net | GPS dead; timing and aviation notices; missing weather forecasts; ham time signals; "satellite repaired" (false) |
| `oil_shock` (new) | Price board digits flip; caption; title "The pumps ran dry." | Queues at pumps, parked trucks, abandoned cars on the verge, horse carts, idle tractors | Someone is siphoning your tank at night: guard, lock or trap; trade fuel for food; park the truck for the season | Take a tank inventory -> lock and hide fuel -> consolidate trips -> switch to animals and hand tools | Price index; refinery news; convoy rumors; rationing (true); "pipeline reopened" (false) |
| `financial` | Bank door sign, caption "ACCOUNTS FROZEN"; title "The banks didn't open." | Closed storefronts, a line outside the bank, no deliveries, For Sale signs, abandoned homes | Warning: withdraw cash now or buy goods; bail-in: move assets over $250,000 into goods or land; pay workers in kind | Convert part of savings into goods -> start a barter ledger -> hide the gold and silver -> settle debts | Exchange rates ("4,000 to a pound of flour"); withdrawal limits; bank run rumors; bail-in notices (true); "banks open Monday" (false) |

### 9.3 Order and people

| Kind | Hit-moment beat | Key visible world change | Decision cards | Signature goal chain | Radio themes |
|---|---|---|---|---|---|
| `lawless` | Sheriff's door closes, scanner chatter caption; title "Nobody is coming." | Boarded storefronts, burnt cars on the shoulder, neighbors' barricades, empty road, watch fires | Form a watch with the neighbors or stand alone; salvage the looted house next door; a man offers "protection" for a fee | Set the watch rota -> hide valuables -> make a pact with neighbors -> light discipline | Scanner traffic; deputies not answering; a group raiding farms (true when so); "the Guard arrives Friday" (false) |
| `civil_war` | Columns at the bridge, flags raised; title "The line is the river." | Two flag colors at checkpoints, barricaded bridges, convoys, glow and artillery flashes | The militia asks for your son, or a levy, or hide him; sell to one side; open the road for a column | Choose a posture (neutral or a side) -> hide stock -> get a paper pass -> make an exit plan | Front-line reports (some true); recruiter claims; propaganda; checkpoint tax rumors |
| `invasion` | Sirens, jets low, caption; title "They are here." | Checkpoints on the county road, convoys, curfew posters, patrols | Comply with a requisition or hide stock; an informant offer; curfew breach for a medical run | Hide stock -> curfew routine -> get papers -> decide on contact with resistance | Proclamations; curfew times; ID rules (true); resistance whispers (some false); "they are leaving" (false) |
| `mass_exodus` (new) | First refugee column on the road, caption; title "The cities emptied." | Refugee columns on the road, tents on shoulders, abandoned cars, checkpoint and martial-law notices | Let a family camp in the barn; requisition order: comply or hide; sell water at the gate | Stock for guests -> mark boundaries and a camp spot -> ration plan -> a checkpoint pass | Evacuation orders; shelter locations; martial-law notices (true); "the city is open" (false) |
| `cult_takeover` (new) | A proclamation on every screen; title "The Covenant speaks." | Banners in town and on neighbor houses, painted marks on doors, tithe collections, checkpoints | Conform and hang the sign; pay the tithe; shelter a defector | Choose a public face -> keep the household together -> hide dissent safely -> a safe signal with neighbors | Covenant broadcasts; defector accounts (true); "the Covenant lifted the order" (false) |
| `water_war` (new) | A canal gate closes and an armed guard stands at it, caption; title "They shut the gate." | Fenced creek, armed men at the diversion, dry ditches, tank trucks | Pay for a water share; dig a deeper well; join the downstream coalition | Prove your water right -> deepen the well -> build a cistern -> guard the intake | Allocation orders; lawsuits; guard rumors; "a court opened the gates" (false) |
| `zombies` | A shape on the road, caption "he's not stopping"; title "They don't stay down." | Walkers on the road (existing walker parties), barricades, fires in town, broken fences | A bitten neighbor asks to come in; run the generator tonight (noise); clear the road or hold | Dark and quiet (light discipline) -> reinforce the gate -> set a kill zone -> a bite protocol | "Do not approach"; hot zones; "a cure" (false); sightings; shelter orders |
| `unknown` | Lights hang in the sky and nothing moves; title "The lights came." | Purple glow, silent roads, empty neighbor houses (doors open, a table set), no animals | Walk to the neighbor's open house; signal the lights; stay in with the windows covered | Count heads (everyone in sight) -> inventory the neighbors' places -> cover the lights -> choose a rule once the variant shows | Contradictory reports; official denial; ham: "it hunts by sound" or "they took them" (variant-dependent); "it is over" (false) |

### 9.4 Radiation, plague and hunger

| Kind | Hit-moment beat | Key visible world change | Decision cards | Signature goal chain | Radio themes |
|---|---|---|---|---|---|
| `nuclear` | Alert text, white flash, a cloud rising on the northern skyline, silence; title "THIS IS NOT A DRILL." | Mushroom cloud, sickly haze, gray fallout dust, a hot zone mark where the dose is high | Dash home from town or shelter where you are; use potassium iodide now; go out for water on day 3 | Get inside -> seal and log the dose -> ration for 14 days -> go out only after the dose drops | Shelter orders; plume maps; ham strike reports; "all clear" (false); dose advice |
| `reactor_meltdown` (new) | Siren and a plume caption with a wind arrow; title "The plume is heading your way." | A plume haze stripe with a bearing, a keep-out zone with checkpoints and tape, evacuation columns | Shelter or evacuate (depends on the wind); potassium iodide for the kids; hold neighbors back at the line | Check the wind -> seal and shelter -> log the dose -> a decon station | Wind and plume forecasts (true); zone map; iodine; "it's contained" (false) |
| `pandemic` | A stay-home order caption; title "The county locked down." | Empty roads, school bus gone, quarantine flags on neighbor houses, few vehicles | Quarantine joiners for 14 days; a pharmacy run (risk); a neighbor begs for medicine | Set up a sickroom -> stock masks and gloves -> a gate contact protocol -> track symptoms | Case counts; hospital capacity; "a cure" (false); school and store closures |
| `bioweapon` | A hazmat convoy and tape, caption; title "Don't touch anything." | Tape, hazmat tents, empty roads, sealed neighbor houses | Scavenge from a contaminated place; accept a sick stranger; decontamination routine (cost) | Sealed gate protocol -> decon station -> rotate the watch -> a medicine ledger | Agent rumors; the truth about incubation; quarantine boundaries; "treated by Tuesday" (false) |
| `livestock_plague` (new) | A vet's truck and quarantine tape, caption; title "The herd is condemned." | Culling pyres (fire and smoke), quarantine signs on farm lanes, empty pastures | Cull now or hide the animals; a neighbor wants to move animals through; eat the meat before it spoils | Footbaths and biosecurity -> count the herd -> separate the healthy -> a burn site | Ag department orders; spread maps; "a vaccine is on the way" (false); milk and egg shortages |
| `crop_blight` (new) | Harvest day: the fields are yellow, caption; title "The harvest failed." | Yellow and brown fields on neighbors, burn piles, an empty grain elevator, guarded fields | Burn the rows; trade seed with neighbors (disease risk); plant a second variety | Isolate seed lots -> burn the infected rows -> diversify varieties -> save seed | County-by-county failures; grain prices; seed rumors (some false); "resistant seed arriving" |
| `global_famine` (new) | A price board and empty shelves, caption; title "The shelves emptied." | Empty shelves, fallow fields, queues, refugee columns | Share seed or guard it; ration deeper now; trade tools for food | A ration plan -> store and seed reserve -> guard the fields -> compost | Export bans; grain prices; aid rumors (false); closure notices |

## 10. Work packages

Naming: **FL** = felt layer, so numbers never collide with the **WP** numbers in `docs/DISASTER_TEETH.md`. The felt layer owns only new files under `src/sim/felt/`, `src/ui/felt/`, `src/game/felt/` (note: `src/ui/feel/` is the older, unrelated onboarding-polish folder; the near-identical name is deliberate to the owner's wording, so mind the spelling), plus the small named shared-file edits in section 4.3. No FL package edits `src/sim/disasters/<kind>.ts`, `disasterFx.ts`, `structureDamage.ts` (WP0 / WP1 to WP7), `collapseLook.ts`, `roadTraffic.ts`, `homeSafety.ts`, `disasterTeeth.test.ts` (WP9), `dayCard.ts`, `radioScripts.ts`, `newsPool.ts`, `CollapseChip.tsx`, `CutsceneOverlay.tsx` (WP8), or `disaster.ts`, `SetupScreen.tsx`, `regions.ts` (WP10). The two points where an FL package touches a WP-owned file's neighborhood are sync points:
- **S1 (radio):** `radio.ts` is WP8's file. FL3 adds one call inside `radioDay`. Land FL3 after WP8, or, if they run together, WP8 adds the three-line call itself (`feltRadioLine?.(s, ctx, want)` guarded by an import of the registry). Either way FL3 owns the selector and WP8 owns the call position.
- **S2 (day card):** WP8 owns `dayCard.ts` (headline, `LOOK_LINE`, track loss). FL1 reads it and extends the **UI** (`DayCard.tsx`, which is on no WP list) and a separate `hitCard.ts`; the shared `LOOK_LINE` for new kinds is WP8's to fill, and the checklist enforces it.

| Package | Scope | Files owned | Depends on | Parallel with |
|---|---|---|---|---|
| **FL0: Contract, registry and slots** (serial, small) | `FeltSpec` and supporting types; registry with a stub spec for all 29 kinds; `fx.felt` helpers; the daily dispatcher; overlay-queue slots; `decisionOpen`; mounts; contract test; checklist scaffold with `FELT_ENFORCE = []` | `src/sim/felt/{types,registry,state,daily,index}.ts`, `src/sim/felt/kinds/*.ts` (29 stubs), `src/store/feltStore.ts`, `src/sim/overlayQueue.ts` (+test), `src/ui/feel/useOverlayPlan.ts`, `src/sim/clockResume.ts`, `src/sim/effects.ts` (one call), `src/App.tsx` (mounts), `feltContract.test.ts` | WP0 (needs `fx` bag and `disasterFx`) | none |
| **FL1: Hit moment and day card** | Cinematic, camera nudge and shake, what-changed and do-first card, skip setting | `src/sim/felt/{hitMoment,hitCard}.ts`, `src/ui/felt/HitMoment.tsx`, `src/ui/DayCard.tsx`, `src/game/felt/cameraKick.ts`, their tests | FL0; soft on WP8 (reads `dayCard.ts`) | FL2 to FL6 |
| **FL2: World state** | Marks core, `FeltWorld` and its layers, farm variants and lit flag, fire-source append, scene-audit extension, perf census scene | `src/sim/felt/marks.ts`, `src/game/felt/{FeltWorld,markPlacement,FloodPlane,CrackDecals,RoadsideProps,farmVariants}.ts`, `src/engine/world/houses/farmstead.ts`, `src/game/atmosphere/fireSources.ts`, `src/game/GameCanvas.tsx` (mount), `src/sim/sceneAudit.ts` (new exported check only), `scripts/perfBudget.json` and `scripts/perfBudget.mjs` (new scenes only) | FL0; soft on WP6 (`structureDamage` states), WP9 (look) | FL1, FL3 to FL6 |
| **FL3: Feed and radio** | Daily feed, the checkable-claim radio selector, scouting resolution, Board card | `src/sim/felt/{feed,feltRadio,claims}.ts`, `src/ui/felt/FeedCard.tsx`, `src/ui/CompoundBoard.tsx` (mount), `src/sim/rumors.ts` (claim resolution), `src/sim/radio.ts` (one call, S1) | FL0; WP8 (S1) | FL1, FL2, FL4 to FL6 |
| **FL4: Decision cards** | Selection, budget, apply, timeout, the card UI | `src/sim/felt/cards.ts`, `src/ui/felt/{FeltCard,odds}.tsx`, `src/store/feltStore.ts` (actions only; created by FL0) | FL0 | FL1 to FL3, FL5, FL6 |
| **FL5: Signature goals** | Chain engine, the card swap, type widening | `src/sim/felt/goals.ts`, `src/ui/hud/BuildMenu.tsx`, `src/ui/feel/GoalsCard.tsx`, `src/sim/firstHour.ts` (type only) | FL0 | FL1 to FL4, FL6 |
| **FL6: QA harness and enforcement** | `feltShots.mjs`, `window.__cb.felt` hooks, the checklist test body, pixel-diff audit, census scenes wiring, a CI smoke | `scripts/feltShots.mjs`, `src/game/felt/qaHooks.ts`, `src/sim/felt/feltChecklist.test.ts`, `package.json` script entries | FL0; useful once FL1 to FL5 exist | FL1 to FL5 (develops against stubs) |
| **FL7: Content, grid and tech** | `grid_down`, `solar_flare`, `emp`, `cyberattack`, `satellite_loss`, `oil_shock`, `financial` | `src/sim/felt/kinds/{grid_down,solar_flare,emp,cyberattack,satellite_loss,oil_shock,financial}.ts` | FL0 to FL5; soft on WP1, WP2, WP5 | FL8 to FL11 |
| **FL8: Content, order and people** | `lawless`, `civil_war`, `invasion`, `mass_exodus`, `cult_takeover`, `water_war`, `zombies`, `unknown` | `src/sim/felt/kinds/{lawless,civil_war,invasion,mass_exodus,cult_takeover,water_war,zombies,unknown}.ts` | FL0 to FL5; soft on WP3, WP4 | FL7, FL9 to FL11 |
| **FL9: Content, natural and physical** | `mega_quake`, `dam_flood`, `supervolcano`, `ash_winter`, `asteroid`, `wildfire`, `drought` | `src/sim/felt/kinds/{mega_quake,dam_flood,supervolcano,ash_winter,asteroid,wildfire,drought}.ts` | FL0 to FL5; soft on WP6 | FL7, FL8, FL10, FL11 |
| **FL10: Content, plague and hunger** | `pandemic`, `bioweapon`, `livestock_plague`, `crop_blight`, `global_famine` | `src/sim/felt/kinds/{pandemic,bioweapon,livestock_plague,crop_blight,global_famine}.ts` | FL0 to FL5; soft on WP4, WP7 | FL7 to FL9, FL11 |
| **FL11: Content, radiation** | `nuclear`, `reactor_meltdown` | `src/sim/felt/kinds/{nuclear,reactor_meltdown}.ts` | FL0 to FL5 | FL7 to FL10 |
| **FL12: Tune and turn on enforcement** (serial, last) | Card odds and cost balance against `DIFFICULTY` with the existing balance harness; full 29-kind harness run; fill `FELT_ENFORCE` with every kind; confirm the census numbers; DECISIONS row | numbers inside `src/sim/felt/kinds/*.ts` (after FL7 to FL11 merge), `feltChecklist.test.ts` | FL7 to FL11, WP10 | none |

```
WP0 (seam, v98 bag)
  -> FL0 (contract, registry, slots)
       -> FL1 hit moment      -> \
       -> FL2 world state      -> |
       -> FL3 feed and radio   -> |  parallel; disjoint files; S1 with WP8, S2 with WP8
       -> FL4 decision cards   -> |
       -> FL5 signature goals  -> |
       -> FL6 QA harness       -> /
            -> FL7 .. FL11 content (parallel, one file per kind)  ; each also lands any time after its soft WP
                 -> FL12 tune and enforce  (after WP10 so every kind is in the picker and the pool)
```

Suggested order by player-visible value per effort: FL0, FL2 and FL1 (the world and the hit are what the owner said they would feel), FL9 (the three owner examples live there and in FL7: flare, quake, flood), FL5 and FL4, FL3, then the remaining content, FL6 alongside, FL12 last.

Cross-reference to the teeth packages (felt content may land before or after the matching WP; it degrades to track-derived values until the WP's state exists):

| Felt package | Teeth packages whose state it reads |
|---|---|
| FL7 | WP1 (flare, EMP), WP2 (cyberattack, grid-down), WP5 (financial) |
| FL8 | WP3 (lawless, civil war, invasion), WP4 (zombies) |
| FL9 | WP6 (quake, flood, asteroid, ash), WP9 (look) |
| FL10 | WP4 (bioweapon), WP7 (pandemic, blight, livestock) |
| FL3 | WP8 (radio, news, day card) |
| FL12 | WP10 (picker, pool, chains, balance) |
| kinds with no teeth WP in DISASTER_TEETH (`supervolcano` beyond WP6's helper, `drought`, `wildfire`, `nuclear`, `unknown`, `satellite_loss`, `oil_shock`, `reactor_meltdown`, `global_famine`, `water_war`, `cult_takeover`, `mass_exodus`) | their scenario docs' hook sections; the felt content reads `fx[kind]` if present and the tracks otherwise |

## 11. Risks and open questions for the owner

1. **Camera shake and reduced motion.** The shake is a small additive offset; we honor `prefers-reduced-motion` and add a Settings toggle. Is a hit cinematic that cannot be fully disabled acceptable? (Proposed: skip toggle yes.)
2. **Do felt cards pause the clock?** Proposed: yes, same as gate cards, with a safe fallback on timeout. A real-time-pressure variant (a countdown for the flood warning) is possible but adds a second clock to explain.
3. **Truth in the feed.** The feed is always true (what the player could see); only the radio lies. Confirm.
4. **The felt layer and teeth tests both count.** WP10 sets `ENFORCE_MIN = 4`; FL12 adds the felt checklist. Two gates is more work per kind but is the owner's anti-re-skin goal.
5. **Perf scenes.** Adding `felt` entries to `perfBudget.json` is a new scene, not a raise, but CI runtime grows by one page load per entry. Two entries (quake, flood) are proposed.
6. **`structureDamage` states are drawn by FL2 using WP6's `damageState`.** If WP6 slips, FL2 draws only neighbor variants, cracks, flood and checkpoints, and the own-building tarps wait.
7. **Content volume.** 29 kinds x (5 radio lines + 3 to 9 cards + a 3 to 5 step chain + beats) is a lot of copy; the content packages are sized by group so a writer-heavy pass can run in parallel.
8. **Figures** in on-screen lines (a stage in feet, a price, a magnitude) must come from the sim or the scenario docs' cited numbers; the scenario docs flag several to re-check before they reach the player.
