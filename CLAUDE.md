# Compound Builder — Project Guide

> **`COMPOUND_BUILDER_GDS.md` is the source of truth for game design.** Read it before building any system. Ask before inventing mechanics it does not cover.

## Stack (same as University Empire; do not substitute)
Vite, TypeScript (strict), React, Zustand (with subscribeWithSelector), a custom ECS simulation, Three.js, IndexedDB saves with JSON export, and Vitest.

## The graphics bar
Compound Builder must look at least as good as **University Empire** (`smolhaj/UniversityEmpire`, `src/three/`). Do not rebuild rendering from scratch. Port UE's stack following GDS §8.1:
1. Extract the game-agnostic world rendering into `src/engine/world/`. This covers the light rig and sky, post-processing (SSAO, bloom, color grading, god rays), weather, seasons, instanced trees with wind, regional terrain and site grading, water, regional houses, barns and fences, procedural normal maps and materials, geometry merging and LOD, instanced people, night windows, the walk/fly camera, and the Playwright screenshot QA harness.
2. Strip the campus, era and university hooks behind thin adapters (terrain grid, region, season, weather, time of day).
3. Then build the Compound Builder layers on top: the modular build kit and its materials, weathering, construction stages, damage states, and the defense, visibility, sun, fire and flow overlays.

## Rules
1. **Procedural art only.** No external assets, HDRIs or downloaded models.
2. **Performance:** instanced and merged geometry, LOD tiers, and High/Medium/Low quality settings. Target 60 fps at homestead scale and 30+ fps at town scale.
3. **Scale:** match University Empire's SCALE v2 (1 world unit ≈ 6 m; a person ≈ 0.28 tall). Check with a street-level screenshot that includes a person.
4. **Keep systems modular and testable.** Put pure logic in plain TS modules with Vitest tests.
5. **Save versioning:** bump the save version and add a migration whenever state fields change.
6. **Eye-test visuals:** take screenshots at eye level and from above, with no camera inside geometry and no modals covering the view.

## Standing rules (workflow)
- **US spelling** in code, UI text and docs. **Procedural art only** and **real scale** (1 unit ≈ 6 m; check a street-level shot with a person).
- **PR workflow:** one feature branch per change, open a **draft PR**, squash-merge when `check` and `perf-budget` are green. **Merge main into the branch first**: CI does not run on conflicting PRs. Never force-push; **never raise the perf budgets** (fix the cost instead).
- **`docs/DECISIONS.md`**: add a dated row for every design decision. On a merge conflict in that file keep both sides.
- Save version is `SAVE_VERSION` in `src/sim/state.ts` (now **92**). Bump it and migrate when state fields change; the per-version history is in the DECISIONS rows ("Save vNN").

## What is built (since the first renderer port; details in `docs/DECISIONS.md`, gaps in `docs/DEPTH_AUDIT.md`, branch status in `docs/BRANCHES.md`)
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
