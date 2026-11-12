# Compound Builder — Project Guide

> **`COMPOUND_BUILDER_GDS.md` is the source of truth for game design.** Read it before building any system. Ask before inventing mechanics it does not cover.

## Stack (same as University Empire; do not substitute)
Vite, TypeScript (strict), React, Zustand, Three.js, IndexedDB saves with JSON export, and Vitest. The simulation is not an ECS: it is a pure, seeded `step(state)` over one plain `GameState` in quarter-hour sub-steps (`src/sim/engine.ts`), and the world renders from that state. (GDS section 8 still says "custom ECS"; see the PR's owner-decision list.)

## The graphics bar
Compound Builder must look at least as good as **University Empire** (`smolhaj/UniversityEmpire`, `src/three/`). Do not rebuild rendering from scratch. Port UE's stack following GDS §8.1:
1. Extract the game-agnostic world rendering into `src/engine/world/`. This covers the light rig and sky, post-processing (SSAO, bloom, color grading, god rays), weather, seasons, instanced trees with wind, regional terrain and site grading, water, regional houses, barns and fences, procedural normal maps and materials, geometry merging and LOD, instanced people, night windows, the walk/fly camera, and the Playwright screenshot QA harness.
2. Strip the campus, era and university hooks behind thin adapters (terrain grid, region, season, weather, time of day).
3. Then build the Compound Builder layers on top: the modular build kit and its materials, weathering, construction stages, damage states, and the defense, visibility, sun, fire and flow overlays.

## Rules
1. **Procedural art only.** No external assets, HDRIs or downloaded models.
2. **Performance:** instanced and merged geometry, LOD tiers, and High/Medium/Low quality settings. Target 60 fps at homestead scale and 30+ fps at town scale.
3. **Scale:** match University Empire's SCALE v2 (1 world unit ≈ 20 ft; a person ≈ 0.28 tall, about 5.6 ft). Check with a street-level screenshot that includes a person.
4. **Keep systems modular and testable.** Put pure logic in plain TS modules with Vitest tests.
5. **Save versioning:** bump the save version and add a migration whenever state fields change.
6. **Eye-test visuals:** take screenshots at eye level and from above, with no camera inside geometry and no modals covering the view.

## Standing rules (workflow)
- **US spelling and U.S. units** in code, UI text and docs. The sim keeps SI internally; convert only at the formatting layer (`sim/units.ts`). `sim/unitsLint.test.ts` fails when a metric unit reaches player-facing text. **Procedural art only** and **real scale** (1 unit ≈ 20 ft; check a street-level shot with a person).
- **PR workflow:** one feature branch per change, open a **draft PR**, squash-merge when `check` and `perf-budget` are green. **Merge main into the branch first**: CI does not run on conflicting PRs. `npm run lint`, `npm test` and `npm run build` must pass locally (they are the `check` job). Never force-push; **never raise the perf budgets** (fix the cost instead).
- **`docs/DECISIONS.md`**: add a dated row for every design decision. On a merge conflict in that file keep both sides.
- Save version is `SAVE_VERSION` in `src/sim/state.ts` (now **95**; the migration table in `sim/save/migrations.ts` has a pass-through step for versions that only add optional fields). Bump it and migrate when state fields change; the per-version history is in the DECISIONS rows ("Save vNN").

## Repo map
- `src/engine/world/`: game-agnostic world rendering ported from UE (sky, light rig, post, weather, season, terrain, trees, water, houses, figure kit, tour camera) plus `engine/perf/` (start tier and step-down: `qualityAuto.ts`). Details: `docs/PORTING.md`.
- `src/sim/`: pure, seeded, tested game rules (about 280 modules; `engine.ts` steps the clock, `state.ts` defines `GameState` and `SAVE_VERSION`, `save/` has IndexedDB, JSON export and import, and migrations). No THREE, no DOM.
- `src/game/`: Three.js layers on the engine: `HomesteadWorld.ts` (the world), `GameCanvas.tsx` (frame loop and input), `buildkit/` (procedural buildings, interiors, bunkers), `perimeter/`, `paths/`, `people/`, `props/`, `battle/`, `atmosphere/`, `lived/`, `blueprint/`, `sightlines/`, `terrain/`, `parcel/`, `region/`, `wildlife/`, `livestock/`, `fx/`.
- `src/ui/` and `src/store/`: React HUD and Zustand stores (`gameStore` = sim state, `worldStore` = view settings, `battleStore` and `cutsceneStore` = raid playback, `feelStore` = title and onboarding).
- `scripts/`: Playwright QA and tooling, plus slow Vitest harnesses (see Testing).

## Quality tiers and performance
- Tiers (`worldStore.quality`, remembered as `cb.quality`): Low (no shadows or post), Medium (soft shadows), High (adds ambient occlusion and a sharper pixel ratio). The game starts on Medium (Low on software GL or weak devices); `AUTO_HIGH` is off, so nothing starts on High by itself. `FrameBudget` steps down after sustained slow frames and never steps up. Frame cap 60 by default (`cb.fpscap`). The optional Diorama look (tilt-shift, `engine/world/post/tiltShift.ts`) is High only and off by default.
- Budget: `scripts/perfBudget.json` holds draw calls (430), triangles, shadow triangles and casters, and heap per tier on the mountain showcase; `npm run perf:budget` enforces it in CI from the scene-graph census in `game/perfCensus.ts`. Lowering numbers is welcome; raising one needs a reason in `docs/DECISIONS.md` (it has not been raised since it was set).
- Building far-LOD (`buildkit/buildingLod.ts`), a light budget by tier (`game/lightPool.ts`), staged boot with a loading screen (`game/bootStages.ts`).

## Views and overlays
Cameras: Diorama (orbit, `game/DioramaCamera.ts`), Walk, Fly, Tour (`engine/world/camera/TourController.ts`). Building views: Walls, Cutaway, X-ray (**V**); Underground (**U**). Overlays: Blueprint (names, roles, rings, gates, towers, tunnels, fog sight and radiation PF readouts), Sightlines (road, ridge, night, viewshed from a point), Terrain (high ground, lanes, water, fire, shade at noon Dec 21, sun), Weak spots (wall bypass points), property line. Photo capture keeps captioned pictures in an album and the chronicle (`sim/photos.ts`, `ui/PhotoAlbum.tsx`). There is no separate flow overlay; walking distance costs labor hours instead (DECISIONS 2026-11-04).

## Raids, battle and the cutscene
- `sim/battle.ts` simulates a fight into a `Battle` timeline (`sim/battleTypes.ts`); `sim/siege.ts` plans scenes, lengths and the clock; `sim/waves.ts` is the escalating siege-wave clock; `sim/raid*.ts`, `breach*.ts`, `houseAssault.ts`, `aftermath*.ts` hold openers, orders, outcomes, voices, the house fight and burial, cleanup and questioning.
- Playback: `game/battle/BattleRenderer.ts` draws the timeline; `CutscenePlayer.ts` walks scenes and commits the clock once; `director.ts` is the pure camera operator (shot kinds establish, wide, wall, house, raiders, close, gate, vigil; checks every shot against building, wall and tree boxes from `cameraObstacles.ts`); `interiorShot.ts` and `breachShot.ts` frame the house fight and the breach; `sim/cutNav.ts` and `cutLive.ts` route every walker through real openings. `ui/CutsceneOverlay.tsx` and `ui/BattleOverlay.tsx` show captions, clock and Watch prompt.

## Testing and tools
- CI `check`: `npm ci`, `npm run lint`, `npm test` (Vitest, 30 s default timeout, about 370 test files), `npm run build`. CI `perf-budget`: build, then `npm run perf:budget` with Playwright 1.63 and Chromium.
- Slow harnesses are skipped unless an env var is set: `PLAYTEST=1 npx vitest run scripts/playtest.test.ts` (writes `playtest-report.md` and, in long mode, `playtest-long.md`), `BALANCE=200 BALANCE_OUT=... npx vitest run scripts/balance.test.ts` then `node scripts/balanceReport.mjs`, `PERF=1` for `simBench.test.ts`, `FK=1` for `fk_harness.test.ts`, raid win rates in `raidBalance.test.ts`.
- Playwright scripts (`node scripts/<name>.mjs`; most start their own Vite server and need `npm install --no-save playwright@1.63.0`): `shots.mjs <set>` (canvas-only, sets in `shotSets.mjs`, `terrainSets.mjs`, `perimSets.mjs`), `*Shots.mjs` per feature (HUD included), `playQa*.mjs` hands-on and start-matrix sweeps, `perfProbe.mjs`, `perfBudget.mjs`, `loadProbe.mjs`, `raidMovie.mjs` and `invasionMovie.mjs` (deterministic cutscene frames, optional mp4), `cutLeakCheck.mjs` and `cutRealismLive.mjs` (cutscene leak and movement audits). QA hooks live on `window.__cb` (camera pose, `qa.renderNow()`); `?lowrender` draws on request only.

## What is built (details in `docs/DECISIONS.md`, gaps in `docs/GDS_AUDIT.md` and `docs/DEPTH_AUDIT.md`)
- **HUD declutter** (`src/ui/hud/common.tsx`: `Group` folds advanced sections, `Hint` shows a short line with "more", `Clamp` holds text to two lines). Build tab opens with the *Get operational* checklist (`sim/operational.ts`: shelter, water, power, food, defense) and at most three next steps; New Game wizard, decision cards (`GateCard`), supplies, family and report follow the same pattern. Esc closes the Shop.
- **Utilities run themselves**: no drawn pipes or cables; auto-wiring within `AUTO_REACH` (`sim/utilities.ts`). Power sources include micro-hydro and the wind turbine; microclimate (frost pockets, wind) in `sim/microclimate.ts`.
- **Long game**: orphans taken in by a neighbor (`sim/orphans.ts`), yearly threats (`sim/threats.ts`), dynasty score parts, self-fed milestones, built chronicle, era headlines, and a *Generations* view in the HUD (`sim/lineage.ts`, `sim/eras.ts`, `sim/eraPressure.ts`).
- **Quarters** (`sim/quarters.ts`): households with auto-assigned homes plus a Move override; crowding, illness and raid effects.
- **Joiners** (`sim/joinerHome.ts`): they bring cash, tools, a vehicle, food, a dog; they choose where to stay (spare bed, RV or trailer via `game/buildkit/rigBuildings.ts`, a modular home, or a place the player builds).
- **Defense**: moat, covered bridge and vehicle yard (`sim/waterWorks.ts`, `sim/vehicleYard.ts`); door breach, ring-by-ring fallback; tunnel collapse as a raid outcome and per-ring gate vetting (`sim/gateVetting.ts`); every defensive element is monotone (property test).
- **Movers on routes** (`game/paths/groundMovers.ts`): wildlife, livestock, trucks and guard dogs use the same route network as people, with a climb limit per kind; corridors (`sim/corridors.ts`) carry people and vehicles through tunnels.
- **Terrain and region**: regional forests and parcel terrain (`game/parcel/parcelTerrain.ts`, `engine/world/trees/ForestRenderer.ts`), retaining walls and terraces, drainage, valley fog; area E buildings (docks and boats, cabin village, helipad, polytunnels, aquaponics, terraced orchards), forge, shared harvest, soap, hunter safety course.
- **Performance**: staged boot with loading screen, starts on Medium, 60 fps cap, perf budget per tier enforced in CI. Vitest default test timeout is 30 s (`vite.config.ts`).
- **Shop quick-buy** (`sim/shopQuickBuy.ts`): every shelf good has a kind (single / per-person / consumable / stack); "Add everything I'm missing", fill-to-recommended and complete kits never buy a single twice. Shop card icons: `ui/ShopWindow.tsx` + `ui/shopIcons.tsx` (a test fails on any gray placeholder).
- **Security staff and guards who stay** (`sim/guards.ts`, save v81): up to three contract guards on 8-hour shifts, wage tiers, quitting in a collapse; a lone guard with nobody to go to may be taken in (`guard_stay`).
- **Wall tops and weak spots; gate and house kit** (`docs/sa_home_security.md`): wall-top add-ons, per-run weak spots, gate motor / intercom / trellis / sally gates and the hardened gate house (`sim/gateSecurity.ts`).
- **Armed response and road watch** (`sim/armedResponse.ts`): paid patrol with response minutes, neighborhood watch, optional `GameState.security`.
- **Insider threat and vetting** (`sim/insider.ts`): unvetted guards and joiners can be bought (plants, low loyalty and a below-rate wage drive it); a paid background check clears a man for good.
- **Stealth** (`sim/stealth.ts`): one posture, chimney and night noise, a readout of the give-aways, a lit response for AI-sensor floodlights. **Fortress reputation** (`sim/reputation.ts`): a derived hardness score that makes opportunists keep away.
- **Compound board** (`sim/compoundBoard.ts`, `ui/CompoundBoard.tsx`): one read-only page of power, water, food, defense, morale, threats and waiting-on-you. **Household bonds** (`sim/bonds.ts`): friends, rivals and mentors from shared hours and dangers.
- **Raid depth** (`sim/breachMeans.ts`, `crewMercy.ts`, `raidOrders.ts`, `raidOutcomes.ts`, `raidFire.ts`, `raidFacts.ts`, `lingering.ts`, save v87): trucks and charges with counters (bollards, reinforced gate, anti-vehicle ditch, the driver and the carrier), the break point is the drawn wall segment or gate (`Battle.raid`, `BreachWhere`), `breached` (yard) vs `overrun` (houses), mercy by crew temper, hostages, arson, itemized loot, parleys, orders (hold, fall back by stages, counterattack). Types for the scene are in `sim/battleTypes.ts` (`RaidFacts`, new events). `scripts/raidBalance.test.ts` prints win rates; `sim/raidLive.test.ts` checks the live path.
- **Raid openers, air and yard, stories, live orders** (`sim/raidOpeners.ts`, `raidConditions.ts`, `raiderStory.ts`, save v88): scouts / white-flag demand / worker ambush / diversion; storms, smoke, flares, livestock; a raider who comes back; orders given on the playhead. Test kit: `sim/raidTestKit.ts`; live tests `sim/raidLive.test.ts`, `sim/raidLive2.test.ts`.
- **Raid depth part 3** (`sim/parleyChoices.ts`, `scoutPlans.ts`, `interrogation.ts`, `defenderTraits.ts`, save v89): white-flag choices (pay / pass / talk / bluff / shoot / refuse), plans for spotted scouts, questioning prisoners (kind or harsh), and defenders' panic, heroics and last words from `BattleUnit.traits`.
- **Encounter road lead** (`sim/roadLead.ts`): non-raid encounters are seen walking or driving up the county road before the card. **Cozy starvation** (save v79): Cozy warns, then kills slowly instead of holding health forever.
- **Raid cutscene realism and aftermath** (`sim/cutNav.ts`, `cutLive.ts`, `aftermathScenes.ts`, `momentVoices.ts`, `game/battle/SceneProps.ts`, `AftermathProps.ts`, `InvasionFx.ts`): movement only through openings, room-to-room tactics, the door gives when the stack arrives, white-flag scenes, wounds that last, burial, cleanup and questioning scenes, spoken voices. Leak tests dispose everything a scene makes (`game/battle/propsLeak.test.ts`).
- **Road and county** (`sim/roadTraffic.ts`, `roadPassers.ts`, `roadWarn.ts`, `roadPost.ts`, `countyCrossings.ts`): ambient traffic, sight-based warning, passers-by, trade at the line, roadblocks and a road post duty (save v91 to v94).
- **Survival realism** (`sim/radiation.ts`, `thirst.ts`, `cold.ts`, save v90): radiation sickness and meter, hand pump and real thirst, hypothermia. **Farm and kitchen** (`sim/farm.ts`, `kitchen.ts`, `herd.ts`, `swine.ts`, `haying.ts`, save v61 to v90).
- **House rules and Cozy later years** (`sim/rules.ts`, `sim/estate.ts`, save v95): votes at the hamlet stage; Cozy property tax, insurance and comfort tier.
- **Tunnels** (`sim/tunnels.ts`, `game/buildkit/tunnelBuildings.ts`): portals set into the hill, access-road bore, tunnel-bridges with wildlife crossings.
