# Goals, endings and replay hooks (design proposal)

> **Status: proposal, awaiting owner approval.** Design only; no gameplay code. CLAUDE.md says to ask before inventing mechanics the GDS does not cover, and several pieces below are new (marked **[new]**). Everything else is a derived read of state that already exists. Grounded in GDS §1, §4 (end of a run), §10.11 (long game), `docs/design/product_direction.md` (owner answer 1: "framings, each with its own goals and scoring"), and `docs/audits/DESIGN_AUDIT_2026-11.md` (finding: after day 28 the goal card reads "You're set for now").

## 1. Problem and what exists

The sim is deep; the "what am I working toward" layer is thin after the first hour.

| Layer | Exists today | Gap |
|---|---|---|
| First hour | `sim/firstHour.ts` goal card (roof, water, food, power, drive, fence), `sim/operational.ts` checklist | Ends at "set for now" |
| Per-disaster | `sim/felt/goalChains.ts`: one 3 to 5 step signature chain per kind (first weeks) | Short-term only; no run-length target |
| Run ending | `sim/report.ts`: recovered / new_normal / equilibrium / wipe / bug_out, A to F grade, Valley Courier card, "Keep playing" | One generic win; the grade is not a goal the player chose |
| Long game | `sim/eras.ts`, `sim/lineage.ts`: 16 milestones, dynasty score in 7 parts (`PART_LABEL`), chronicle, Generations view, `settlement.ts` stages and play styles | Score has no target; milestones are surprises, not a visible ladder |
| Cross-run | `cb.unlocked` (localStorage; finishing a run unlocks pulpy disasters), `?seed=` QA seed | No memory of past runs, no reason to start run two |

Design rules for everything below: tone stays "vindication or regret" (newspaper, not trophies); no popups; Cozy is never punished by a goal; God Mode and rich starts stay unscored (`Lineage.unscored`); procedural art only; offline only; the player may always continue (GDS §10.11, endless play).

## 2. Proposal

### 2.1 Goal ladder (mid-game)

A visible five-rung ladder shown as a second card after "Get operational" (the audit's "Prepared" card, extended). Each rung is a short list of 4 to 6 checks, each derived from a function the sim already has, each linking its drawer. Rungs are cumulative, never gate anything.

| Rung | Checks (all existing selectors) |
|---|---|
| 1 Operational | the existing five lines (`operational.ts`) |
| 2 Prepared | 90 days of water and food (`needs.daysOfFood`, `utilities`); hardened gate (`gateSecurity`); second power source; a trained medic (`skills`); a neighbor pact (`pact`); a bunker or safe room |
| 3 Established | first winter done; a harvest that fed everyone (`selfFed` streak 90 days); settlement stage Compound; defense score at least `DEFENSE_OK` + a margin; no one sick or hurt untreated |
| 4 Enduring | `self_fed_year`; an era closed (`lineage.eras`); a child born here; stage Hamlet |
| 5 Legacy | three generations; `self_fed_decade`; stage Walled village or Small town; 25 years |

Rungs 4 and 5 reuse the existing `MILESTONES` list; the new checks in rungs 2 and 3 become new milestone ids (same `lineage.milestones: string[]`, same `award()` points). Rung state is **derived each day**; "reached" is just the milestone being present, so no new state.

### 2.2 Per-scenario named goals

Each of the 16 disasters gets two named goals, scored from `RunStats` the sim already tallies from the hit (`hungryDays`, `dryDays`, `darkDays`, `wounds`, `maxDose`, `peak`, `selfFed`, took-in and turned-away counts). One **Hold** goal (the track the disaster attacks) and one **Heart** goal (the family and the humanity track). Shown on the Years panel and graded on the report card as "Goal kept / Goal missed" lines. A first-draft table (numbers are placeholders; calibration in section 4):

| Disaster | Hold | Heart |
|---|---|---|
| Grid-down | Lights on: at most 30 dark nights in year one | Nobody lost to cold or an unpowered pump |
| Drought | Dry days at most 10 through the dry year | Neighbors on the well got water (pact) |
| Nuclear war | Shelter held: nobody over the sickness dose | Everyone who started alive is alive at day 60 |
| Pandemic | No second case in the house after the quarantine | No one turned away who was healthy |
| Wildfire | Every home standing at season end | Everyone out with the go-bags |
| Ash winter, ice age, runaway heat | Self-fed by year three (`grownYear` against `needYear`) | A birth or a child taken in |
| Financial collapse, lawless | Held the line: no breach in a year | Took in at least as many as turned away (or reverse; see Q3) |
| Zombies, invasion | The wall holds a full year | No one taken or lost |

The remaining kinds follow the same template (worst track plus humanity). The table lives in one file (`sim/scenarioGoals.ts`, **[new]**), and the manual and the Years panel both read it.

### 2.3 Endings that fit the tone

Keep the five `EndKind`s (they are the world's verdict). Add a **Charter**: an ambition the player picks at New Game (this is the owner's "framing picker", product_direction answer 1). Reaching it shows a front-page "Charter kept" page and offers Keep playing; missing it is never a loss screen.

| Charter | Fulfilled when | Built from |
|---|---|---|
| **Hold out** (default) | Survive N years (5, 10 or 25; Cozy 1.5 times, Hardcore 1 times) with at least half the founders or their kin alive | `lineage` years, `wipe.aliveOnPlace` |
| **Feed ourselves** | One full year self-fed (`selfSufficient`), then ten | existing equilibrium end, `selfFedDays` |
| **Found a settlement** | Stage Hamlet (12 or more people, 4 homes, a ring) with a pact neighbor, then Walled village | `settlement.stageNow`, `pact` |
| **Hand it on** **[new]** | A person born here, now 25 or older, holds the household while the founders are 60 or more or gone, and the place still passes "Operational" | `Person.bornHere`, `lineage`; needs a "steward" notion (Q4) |
| **Lose gracefully** | Not a goal to pick: the graded epilogue for wipe and bug-out (below) | `wipeSummary`, `orphans.ts`, `bugout.ts` |

**Losing gracefully.** A wipe or a bug-out gets a short epilogue in the Courier voice, graded on what the place left behind: orphans placed with a neighbor (`orphans.ts`), the cache or the town house reached (`stats.bugOut.arrivedFoodDays`), neighbors who took the land, what the family stood for (humanity track). Charter result for these is "Not kept", but the dynasty score still counts.

**The Last Page (legacy screen).** One end-of-run page replacing the stacked cards: charter result, goals kept or missed, the grade, dynasty score by part (`PART_LABEL`) with a rank title, the family tree (`generations()`), eras with grades, milestones with years, three photos from the album, and three lines of "What would have changed it" taken from the worst of the run's stats (first dry day, first hungry day, the breach). It can be exported as text or as a JSON run summary; no image upload, no network.

**Rank titles** **[new]** (cosmetic): dynasty score bands named for the place, Homestead, Holding, Stead, Seat, Hall (thresholds set from the 40-year long-game runs in `docs/playtest-round3.md`).

### 2.4 Replay hooks

- **Hardships** **[new]**: optional modifiers at setup, each moving only existing inputs, each adding a visible score multiplier to the dynasty score: *Lean start* (funds from `startFunds` at 60 percent), *Off the grid from day one* (`grid: false`), *Closed gate* (`kinOpen: false`, no trial camp), *Single parent* (`variedFamily` pick), *Hard winters* (a regional cold scale on the winter engine), *Unarmed* (no firearms in the shop). Never stackable past 3; God Mode and rich starts disable them.
- **Seed of the day, offline** **[new]**: a pure function `dailySetup(utcDate)` hashes the date into a seed, a region, a disaster kind and one hardship. Everyone who opens the game that day gets the same challenge with no server; the player may type a past date. A shareable **seed code** (`CB-` plus base32 of seed, region, kind, hardships, charter) lets people compare by pasting. The date is a parameter, not `Date.now()` inside the sim.
- **Unlocks that stay cheap and cosmetic or sideways**: pulpy disasters (exists), further Charters and hardships after the first Charter kept, named lots (extra seeded lot archetypes already in `sim/lots.ts`), family crests and Courier mastheads drawn procedurally. **No** power unlocks (no starting stock, no skill points), so no run can be won by grinding.
- **Hall of runs** **[new]**: a small profile (not part of any save) listing past runs: family, charter, years, grade, score, seed code. Stored in IndexedDB next to saves, exported with the JSON export.

## 3. Hooks into existing modules, state and save version

| Piece | Module | New state | Save bump |
|---|---|---|---|
| Ladder rungs | new `sim/ladder.ts` (pure selector like `firstHour.ts`); new milestone ids in `lineage.ts MILESTONES`; HUD card beside `GoalsCard` | none (milestones are strings) | none |
| Scenario goals | new `sim/scenarioGoals.ts`; lines added in `report.ts` | none (derived from `disaster.kind` and `stats`) | none |
| Last Page | `ui/ReportCard.tsx`, `wipe.ts`, `lineage.generations()`, `photos.ts` | none | none |
| Charter and endings | `GameState.charter?: { id; years; hardships: string[] }`, `charterDone?: { day; id }`, set in `newGame` from `RunSetup`, checked in `report.tallyDay` | two optional fields | **v108**, pass-through step in `sim/save/migrations.ts` (optional fields, old saves read as "Hold out, open") |
| Hardships | `startFunds`, `family.variedFamily`, `difficulty`, `RunSetup.grid / kinOpen` | in `charter.hardships` | with v108 |
| Daily seed and codes | `ui/SetupScreen.tsx`, `store/worldStore.ts` seed; new `sim/dailySeed.ts` | none | none |
| Hall of runs | `sim/save/` IndexedDB store `profile`; ReportCard writes one record | profile store, versioned on its own | none (profile has its own version) |

Rule from CLAUDE.md applies: `SAVE_VERSION` is 107 on main now; the first PR to add `charter` bumps to 108 and adds a `Save v108` DECISIONS row. Ending kind stays `EndKind` (used in `report.ts`, `wipe.ts`, `eras.ts`); the Charter result is a separate field so nothing that switches on `EndKind` changes.

## 4. Test plan

- **Pure and deterministic:** `ladder.test.ts` (rungs are monotone over a played run; same state gives same rungs; no `Date.now`), `scenarioGoals.test.ts` (every `DisasterKind` has a Hold and a Heart goal; unitsLint passes on the text), `dailySeed.test.ts` (same date gives same setup; codes round-trip).
- **Calibration with the existing bots** (`scripts/playtest.test.ts`: idle, homestead, prepper, fortress; `scripts/soak.test.ts` invariants): idle must fail every Hold goal, fortress must keep most; target a 20 to 70 percent keep rate for the homestead bot on Standard. Numbers are tuned, never loosened by raising perf budgets.
- **Save:** v107 to v108 migration test, plus the existing save round trip in the soak harness; an old save loads as "Hold out".
- **Never a dead end:** soak invariant that a kept or not-kept Charter never sets `ending.continued = false` (except wipe).
- **Fairness:** hardship multiplier monotone (a harder setup never scores lower for the same outcome); unscored runs (rich, God) produce no Charter score.
- **Legacy page:** snapshot test of the Last Page text from a seeded 40-year run (`longGame2.test.ts` fixture); screenshot QA through `scripts/shots.mjs` at 1280 and 390 wide.

## 5. Manual entry (docs/MANUAL.md)

A "Goals and endings" chapter: the ladder, the Charters and what keeps each, the per-disaster goals, hardships, the daily seed and the Last Page. **The tables are generated** from `ladder.ts`, `scenarioGoals.ts` and the hardships list so the manual cannot drift from the code. `docs/MANUAL.md` does not exist on main yet; this chapter is a spec for the generator's input, not hand-written prose.

## 6. Options, ranked by benefit over cost

| # | Option | Cost | Save | Benefit |
|---|---|---|---|---|
| 1 | **Ladder + scenario goals + Last Page.** Everything derived; no new mechanics. | S to M (about a week) | none | Fixes the audit's "set for now" gap; gives every run a named target and a proper close. Low balance risk |
| 2 | **Charter + hardships** on top of 1: Hold out, Feed ourselves, Found a settlement; hardships with multipliers. | M | v108 | The owner's framing picker; real replay variety from existing inputs |
| 3 | **Dynasty Hall:** daily seed, seed codes, hall of runs, unlocks, Hand it on, rank titles. | L, depends on 2 | profile store (+ steward field if Q4 is yes) | Long-term reason to return; "Hand it on" is the most thematic ending but the only one needing a new mechanic |

## 7. Recommendation

Build **1 now** (all derived, so it needs no mechanic sign-off and can ship under the existing save). Then **2 with three Charters** (leave "Hand it on" out). From option 3 take only the **daily seed and seed codes** (a pure function plus a Setup field; cheap, the best replay hook per hour). Hold the Hall of runs, unlocks and "Hand it on" until the owner answers Q4 to Q6.

## 8. Open questions for the owner

1. **Framings vs Charters:** are the three framings in product_direction (survival to dynasty, fortress sandbox, scenario campaigns) the same thing as these Charters, or a level above them (a framing contains a Charter)?
2. **Charter length:** are 5, 10 and 25 years the right horizons, and should "Keep playing" after a kept Charter keep scoring?
3. **Heart goals:** should taking people in count as the good outcome, or should a hard run be allowed to count turning people away as keeping the family safe? (The GDS grades both, "You turned away 14 people".)
4. **Hand it on:** approve a "steward" notion (the household head role passes to an heir; the player "plays on as the next generation", GDS §10.11)? Today there is no head-of-household field.
5. **Hardships:** is a score multiplier acceptable, or should hardships only be flags on the Last Page (no scoring)? Is "Unarmed" in scope for this tone?
6. **Cross-run memory:** is a local Hall of runs (IndexedDB, exportable) acceptable, and are cosmetic-only unlocks enough, or do you want sideways unlocks (new lots, regions)?
7. **Daily seed:** is a date-hashed offline challenge wanted, or would shared seed codes alone do?
8. **Rank titles:** do you want named dynasty ranks, and are the dynasty score parts weighted as you intend (years 1 point a person-year, milestones up to 250)?
9. **Cozy:** should Cozy show goals as a gentle "suggestion" ladder only, with no "missed" lines?
