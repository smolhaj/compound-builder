# GDS audit (every section) against origin/main

> **Status update (origin/main, save v95).** The audit below is a snapshot from save v78 and its rows are kept as written. Since then: tilt-shift Diorama look built (High only, off by default; DECISIONS 2026-11-11); Save / Load menu with JSON export and import (#183); flow as extra labor hours, no overlay (`sim/flow.ts`); shade overlay and radiation readout in Blueprint (#263); photo capture (#266); governance as house rules by vote at the hamlet stage (`sim/rules.ts`, #269); neighbors and strangers can join (#87, earlier); radiation sickness and real thirst (#260). Still open: room assignment inside a house, district zoning, the run-level medical-dependency draw, absorbing neighbors. Conflicts between this spec and the code are listed in the PR that last refreshed the docs, not decided here.


Checked `COMPOUND_BUILDER_GDS.md` against the code at origin/main (save v78). Earlier audits (`BACKLOG-AUDIT.md`, `DEPTH_AUDIT.md`) covered §10.4 to §10.6, which are mostly done, so those rows are summarised. Status: **done**, **partial**, **missing**. "Built here" marks what this PR adds. Where the GDS is silent the item is listed under Open questions, not built.

## Pillars, modes, difficulty (front matter)
| Requirement | Status | Where |
|---|---|---|
| Building is the game; trade-offs visible (stone slow and dear, greenhouse glows) | done | `game/buildkit/*`, `sim/opsec.ts` (lights, smoke), `sim/materials.ts` |
| Beautiful by default | done | `engine/world/*`, `game/atmosphere`, `game/lived` |
| Surprise with warning signs (ticker, prices, tells) | done | `sim/disaster.ts`, `sim/newsPool.ts`, `ui/Ticker.tsx` |
| Abstract combat from the design | done | `sim/battle.ts`, `sim/encounters.ts` |
| Kits plus customisation, freeform walls/fences/paths | done | `game/buildkit`, `sim/perimeter.ts`, `sim/paths.ts` |
| People build over time (scaffold, frame, clad) | done | `sim/construction.ts`, `sim/crews.ts` |
| Real time with pause, day/night, seasons | done | `sim/state.ts` (calendar and clock), `sim/engine.ts`, `sim/clockResume.ts`, `ui/Hud.tsx` speeds |
| Seven-plus regions with own terrain, climate, prices, odds | done | `sim/regions.ts`, `engine/world/terrain` |
| Farming at medium depth, spoilage, preserving | done | `sim/crops.ts`, `sim/kitchen.ts`, `sim/shelf.ts` |
| Camera: diorama builder | partial | `game/DioramaCamera.ts`; no tilt-shift depth-of-field look (`engine/world/post` has only grading and god rays) |
| Camera: walk / fly / tour | done | `engine/world/camera/TourController.ts`, HUD camera buttons |
| Camera: photo mode (time of day and season) | done | time and date sliders in `ui/Hud.tsx`; **Take photo** with a caption keeps a 384 x 216 JPEG in the album and the chronicle (`sim/photos.ts`, `ui/PhotoAlbum.tsx`, save v90) |
| Cozy / Standard / Hardcore presets | done | `sim/difficulty.ts`, `ui/SetupScreen.tsx` |
| Hardcore permadeath, no reloads | partial | permadeath in `sim/difficulty.ts`; single autosave slot (`sim/save/saveSystem.ts`), no export/import UI to reload from |
| Surprise mode (random length, hidden disaster) | done | `sim/disaster.ts newDisaster` |
| Scenario mode (pick disaster, short/medium/long) | done | `ui/SetupScreen.tsx` |
| Free build sandbox (nothing happens until triggered) | done | `ui/Hud.tsx FreeBuild`, `store/gameStore.ts` |
| God Mode (unlimited money, trigger events, flagged sandbox) | **missing -> built here** | `sim/godMode.ts` |

## §1 Structure and report card
| Requirement | Status | Where |
|---|---|---|
| Peacetime, warning, disaster, survival phases | done | `sim/disaster.ts` |
| Building continues on scavenged and produced materials | done | `sim/scavenge.ts`, `sim/forestry.ts`, `sim/barter.ts` |
| Report card: grade, survivors, concrete lines | done | `sim/report.ts`, `ui/ReportCard.tsx` |
| Report card names the play style (§5.6) | **missing -> built here** | `sim/settlement.ts`, `sim/report.ts` |
| Sandbox runs flagged on the card | **missing -> built here** | `sim/report.ts` |

## §2 Building
| Requirement | Status | Where |
|---|---|---|
| Land: listings, slope, water table, soil, sun, trees, road, distance | done | `sim/site.ts`, `sim/lotListing.ts`, `sim/lots.ts` |
| Tile grid plus freeform walls, trenches, planting beds | done | `game/PlacementTool.ts`, `game/PerimeterTool.ts` |
| Foundation, walls, roof, interior stages with material choice | done | `sim/blueprints.ts`, `sim/housingStyles.ts` |
| Rooms inside buildings (kitchen, pantry, infirmary, radio room, safe room) | partial | sick bay and guards' quarters roles (`sim/quarters.ts`), safe room (`sim/houseHardening.ts`), bunker modules; no general room-assignment inside a house |
| Underground layer, separate view | done | `sim/bunkerLife.ts`, Underground button (U) |
| Material stats (cost, time, durability, protection, insulation, fire, beauty...) | done | `sim/housingStyles.ts`, `sim/materials.ts` |
| Materials age and weather visibly | done | `game/atmosphere/aging.ts` |
| Defense computed from design (perimeter, chokes, sightlines, dead ground, fall-back) | done | `sim/defenseReport.ts`, `sim/towers.ts`, `sim/battle.ts` |
| Defense overlay (covered and blind zones) | done | Sightlines: Viewshed, `game/sightlines` |
| Visibility / OPSEC (road, air, night) and overlay | done | `sim/opsec.ts`, Sightlines: Road / Ridge / Night |
| Flow: walking distance between beds, kitchen, water, latrine, posts affects labor and morale | **missing** | no sim effect, no overlay. Needs a design answer (Q3) |
| Flow overlay | **missing** | see above |
| Fire: spacing, firebreaks, roofing, water access | partial | `sim/effects.ts` fire front reads fuel round each building and `emberFactor`; nothing shows it before the fire |
| Fire overlay | **missing -> built here** | `sim/fireRisk.ts`, Terrain: Fire |
| Sun and shade overlay | done | Terrain: Sun shows slope/aspect; **Shade** draws noon on Dec 21 (hills, buildings, evergreens, bare broadleaves) and lists the solar arrays and beds with how much of each is shaded (`sim/shade.ts`) |
| Comfort and beauty raise morale (gardens, views, porches, fire pit, play area) | **missing -> built here** | `sim/comfort.ts`, `sim/mind.ts` |
| Water, food, power, heat, waste, comms, medical, security, workshop systems | done | `sim/water.ts`, `sim/farm.ts`, `sim/utilities.ts`, `sim/heating.ts`, `sim/sanitation.ts`, `sim/radio.ts`, `sim/medical.ts`, `sim/towers.ts` |

## §3 People
| Requirement | Status | Where |
|---|---|---|
| Family of 4 to 6, generated and named | done | `sim/family.ts` |
| Joiners after the disaster | done | `sim/newcomers.ts`, `sim/kin.ts` |
| Skills, courses, learning by doing | done | `sim/skills.ts`, `sim/courses.ts` |
| Needs, morale, relationships, kids grow up | done | `sim/needs.ts`, `sim/mind.ts`, `sim/lineage.ts` |
| Jobs by schedule (watch, garden, chores) | done | `sim/schedule.ts`, `sim/daily.ts` |

## §4 Disasters
| Requirement | Status | Where |
|---|---|---|
| All 16 disasters with rulesets, chains | done | `sim/disaster.ts`, `sim/effects.ts` |
| Collapse clock with tracks | done | `sim/disaster.ts` |
| Warning varies; visibility threat matrix | done | `sim/disaster.ts`, `sim/encounters.ts` |
| Named neighbor households, radio net, mutual aid | done | `sim/neighborLife.ts`, `sim/pact.ts` |
| Medical dependency (insulin, oxygen, heart meds) as a story driver | partial | per-person chance of insulin, blood pressure, thyroid, asthma (`sim/body.ts`); no oxygen, no run-level "one family member depends on it" draw (Q5) |
| Nuclear war: four tells, strike, dash, 2-week shelter, dose, PF, fallout 7-10 | done | `sim/nuclear.ts`, `sim/bunkerLife.ts` |
| Radiation overlay (dose by room and shielding) | done | Blueprint view in a nuclear run once the warning is out: every shelter shows PF and its 14-day dose, colored; summary line in the readout (`sim/radiation.ts`) |
| Government help-or-hinder roll | done | `sim/disaster.ts` |
| Grid-down causes, water/power rules, order curve | done | `sim/blackout.ts`, `sim/utilities.ts`, `sim/disaster.ts` |
| Grid power in peacetime | done | `sim/utilities.ts` |
| Encounters: dossier, stance, vignette | done | `sim/encounters.ts`, `ui/GateCard.tsx`, `ui/BattleOverlay.tsx` |
| Humanity track graded on the card | done | `sim/report.ts` |
| Food 2,000 to 2,500 kcal, monotony | done | `sim/needs.ts` |
| Injuries and death by difficulty | done | `sim/body.ts`, `sim/difficulty.ts` |
| End of run: recovery, equilibrium, wipe | done | `sim/report.ts` |
| Buying land: parcels, disposition, prices, benefits | done | `sim/land.ts` |
| Bunker hardening, 3 tiers, per room, retrofit | done | `sim/hardening.ts` |
| Zombie herds as pressure field | done | `sim/threats.ts` |

## §5 Scale
| Requirement | Status | Where |
|---|---|---|
| Arrivals of all five kinds | done | `sim/newcomers.ts`, `sim/encounters.ts` |
| Intake dossier with hidden traits, 5 options | done | `ui/GateCard.tsx`, `sim/trial.ts`, `sim/gateVetting.ts` |
| Growth unlocks projects, housing, latrines, hall, school, clinic, market | partial | housing and quarters done (`sim/quarters.ts`); no meeting hall, school building or market building kits |
| Settlement stages homestead, compound, hamlet, walled village, small town | **missing -> built here** | `sim/settlement.ts` (derived label), HUD chip |
| Districts (residential, fields, workshops, defense ring) and roads | partial | roads and rings exist (`sim/rings.ts`, `sim/roadPlan.ts`); no district zoning |
| Visibility and threat rise with size | partial | people count feeds `sim/opsec.ts` and raid size; not tied to stage |
| Governance: patriarch / council / vote, factions, rules, people who leave | missing | Q1 |
| Neighbor reputation, alliance, militia, absorb | partial | pact, alliance, shared watch done; absorbing neighbors missing |
| Play styles Hermit / Clan / Ark / Haven | **missing -> built here** | `sim/settlement.ts` (derived, shown on card) |

## §6 Presentation
| Requirement | Status | Where |
|---|---|---|
| UE-quality Three.js toolkit (sky, shadows, bloom, SSAO, grading, god rays) | done | `engine/world/*` |
| Weather, seasons, snow, water, trees with wind | done | `engine/world/weather`, `season`, `water`, `trees` |
| Instanced people, night windows, living world | done | `engine/world/people`, `game/atmosphere/nightLife.ts` |
| Overlays toggles: defense, visibility, fire, sun, flow | partial | defense, visibility, sun (slope) done; fire built here; flow missing |
| UI stays out of the way | done | HUD declutter PRs #159, #165 |

## §7 MVP and §8 Tech
| Requirement | Status | Where |
|---|---|---|
| MVP slice (parcel, family, grid-down, gate, report) | done (far exceeded) | whole of `src/sim` |
| Procedural art only, no assets | done | `engine/world/materials/normalMapGen.ts` |
| Port of UE modules (table in §8.1) | done | `src/engine/world`, `docs/PORTING.md` |
| Build kit: modular pieces, procedural PBR, weathering | done | `game/buildkit`, `game/atmosphere/aging.ts` |
| Construction stages scaffold, frame, clad | done | `game/HomesteadWorld.ts` |
| Damage states (scorch, breach, rubble) | partial | breach and burn (`sim/doorBreach.ts`, `sim/construction.ts burnStructure`); scorch/rubble visuals limited |
| Quality tiers High / Medium / Low, frame cap, perf budget | done | `ui/Hud.tsx`, `engine/perf`, `scripts/perfBudget.mjs` |
| Playwright screenshot QA harness | done | `scripts/shots.mjs`, `src/game/qaRender.ts` |
| Tilt-shift diorama look | missing | no DOF pass; adding one costs frame time on a tight budget (Q2) |

## §9 Open questions (answered in DECISIONS.md)
Parcel per run (seeded, listings), family backstory (occupations, reroll), permadeath, kids age up, endless play, betrayal by joiners: all done (`sim/lineage.ts`, `sim/trial.ts`, `sim/family.ts`).

## §10 v1 additions
| Section | Status | Where |
|---|---|---|
| 10.1 Listings with water, timber, soil, road, neighbors | done | `sim/lotListing.ts`, `sim/site.ts` |
| 10.2 Buy / store / reuse water, rainwater, greywater, RO, contamination | done | `sim/water.ts`, `sim/shelves.ts` |
| 10.3 Wild food, licenses, seasons, traps, smoking, contamination | done | `sim/wildfood.ts` |
| 10.4 to 10.6 | done | `BACKLOG-AUDIT.md`, `DEPTH_AUDIT.md` |
| 10.7 Lifestyles, hired crews, caretaker, break-ins, bug-out | done | `sim/weekender.ts`, `sim/bugout.ts`, `sim/breakins.ts` |
| 10.8 Armory, kit, watching, hardening | done | `sim/armory.ts`, `sim/gear.ts`, `sim/houseHardening.ts` |
| 10.9 Budget by lifestyle, 2025 prices, improvements, hookups, family variety | done | `sim/startFunds.ts`, `sim/improvements.ts`, `sim/hookups.ts` |
| 10.10 Metals, safe/cache/deposit box, barter, the Shop | done | `sim/finance.ts`, `sim/barter.ts`, `ui/ShopWindow.tsx` |
| 10.11 Long game: eras, generations, chronicle, dynasty score, milestones | done | `sim/eras.ts`, `sim/lineage.ts`, `ui/ReportCard.tsx` |

## Counts
Rows: 93. Done 74, partial 11, missing 8 (of which 5 built here: God Mode, fire overlay, comfort and beauty, settlement stage, play styles; sandbox flag on the card counted with God Mode). Still missing or partial after this PR: flow, shade, radiation overlay, governance, tilt-shift, photo capture, room assignment, districts, medical dependency draw.

## Open questions (with a recommendation)
1. **Governance (§5.4)** has no numbers. Which scope? (a) rules votes only: rationing, guard duty, cabin priority, with unhappy factions leaving (recommended, smallest); (b) a full council with factions; (c) skip until the settlement is a hamlet.
2. **Tilt-shift diorama look.** (a) High quality only, off by default, a toggle in the view bar (recommended); (b) always on for the diorama camera; (c) skip.
3. **Flow.** What should a long walk cost? (a) extra labor hours on the duty (recommended: bed to kitchen to water legs add up to a few percent); (b) morale only; (c) overlay only, no effect.
4. **Shade overlay.** (a) tree and building shadow at noon on the winter solstice, drawn as another Terrain mode (recommended); (b) leave Sun as slope only.
5. **Medical dependency.** (a) at setup, roll one family member (about 1 in 3 runs) on insulin, oxygen or heart medication with a stockpile and fridge-power story (recommended); (b) keep today's per-person chances only.
6. **Radiation overlay.** (a) a room-by-room PF readout in the Blueprint view (recommended); (b) a ground-projected dose map; (c) skip.
7. **Comfort and beauty weights.** This PR adds up to +4 strain relief for a lived-in place (see `sim/comfort.ts`). Is a smaller cap (+3) wanted, or should decor become buildable (fire pit, play area, porch) so the player earns it? Recommendation: keep derived for now.
