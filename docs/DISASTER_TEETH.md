# Disaster teeth audit

Owner request: every end-times event must have teeth, and its effects must be felt. This is an audit only; no gameplay code changed. Source: a read of `src/sim/disaster.ts` and every module that reads `s.disaster.kind` or `s.disaster.tracks` (about 60 files), taken from `origin/main` at `379ad1a`.

## 1. What exists today

One engine, the collapse clock (`src/sim/disaster.ts`): peacetime, warning signs, impact, survival. A disaster is a `DisasterDef` with variants; each variant is a set of **eight service tracks** (`grid`, `fuel`, `stores`, `deliveries`, `medical`, `law`, `phone`, `banks`), each a curve (`at`, `fall`, `floor`, `back`, `ramp`). A hidden **fate** (`full` / `partial` / `never`, `FATE_ODDS`) decides whether services return. Disasters can chain (`chain`, mostly into `lawless`). A Surprise run rolls from `SURPRISE_POOL` (10 grounded kinds); the other 6 are Scenario / Free build unlockables (`pulpy: true`).

| Kind | Variants | Warning (days) | In Surprise pool | Chains into |
|---|---|---|---|---|
| `grid_down` | ice storm, substation attack, cyber, cascade | 10-40 | yes | lawless 35% |
| `nuclear` | distant strikes, nearby base, full exchange | 14-60 | yes | lawless 60% |
| `lawless` | the collapse of order | 7-20 | yes | none |
| `financial` | bank shutdown, hyperinflation | 30-90 | yes | lawless 50% |
| `drought` | megadrought | 90-200 | yes | wildfire 35% |
| `pandemic` | the pandemic | 30-60 | yes | lawless 20% |
| `solar_flare` | Carrington-class | 1-3 | yes | lawless 45% |
| `wildfire` | fire front | 2-6 | yes | none |
| `ash_winter` | Yellowstone eruption | 7-30 | yes | lawless 40% |
| `cyberattack` | coordinated cyberattack | 5-20 | yes | lawless 25% |
| `zombies` | the outbreak | 5-15 | no | none |
| `invasion` | the occupation | 10-40 | no | none |
| `civil_war` | Cascade Compact vs Plains Alliance | 20-60 | no | none |
| `bioweapon` | the release | 7-20 | no | none |
| `asteroid` | the impact | 90-200 | no | none |
| `unknown` | lights in the sky | 3-10 | no | none |

Not disasters but adjacent, and already real: yearly threats (`sim/threats.ts`: plague, famine, hard winter, warlord) and weather threats (`sim/weatherThreats.ts`: blizzard, tornado, derecho, hail, heat wave, flood, lightning fire, ice storm, hurricane remnants, flash flood, windstorm).

### What every disaster gets for free (the shared track layer)

These are real mechanical effects, driven by the eight tracks, and identical in kind across all 16:

- **Prices and shops:** `priceFactor` (panic buying in the warning, scarcity after, from `stores` and `deliveries`), `canOrder` (needs `deliveries` and `banks` above 25%), `moneyWorks` (stores and banks above 50%, else barter prices and the barter market in `sim/barter.ts`, `sim/market.ts`), parts availability (`sim/parts.ts`), land sales (`sim/land.ts`).
- **Power:** grid is up only while `tracks.grid > 0.5` (`utilities.ts`, `hookups.ts`, `daily.ts`); fuel pumps and vehicles read `fuel` (`vehicles.ts`).
- **Raiders:** `law` sets visit cadence (`encounters.cadence`) and the looter and gang weights (`whoComes`); `battle.ts` reads days since the hit.
- **Neighbors:** `neighborLife.hardship` (medical and stores), raids on neighbors from day 14, groups forming when `law < 0.5`, refugees settling.
- **Medical:** `medical` track feeds hardship and care; flu needs outside contacts before the hit.
- **UI:** hit headline, warning hints, day card, CollapseChip, radio service-status lines (`radio.ts`), report card.
- **Oasis contrast:** `homeSafety.collapseProgress` is the average fall of the eight tracks (floor 0.3 after the hit), so contrast scales with track damage and nothing else.
- **Sky and light:** `collapseLook.ts` has a profile for every kind (haze, tint, dim, town glow, blackout nights, convoys, fires, aurora, comet) and `roadTraffic.ts` a traffic profile for every kind.

So the question for each kind is only what it adds on top of that layer. The matrix below marks that.

## 2. Felt-effects matrix

Legend: **R** = real mechanical effect specific to this kind (beyond the shared layer), **s** = shared track layer only (real, but the same as every other kind), **C** = cosmetic only (banner, hint text, sky, traffic dressing), **-** = nothing.

Columns: **Econ** prices, shops, money; **Supply** food, water, fuel, parts; **Raiders** encounter mix and strength; **NPC** neighbors and strangers; **Sky** weather, light, atmosphere; **Infra** power, water, roads, comms, radio; **Bldg** buildings and terrain damage; **Med** health; **UI** news, radio, cutscene, report; **Oasis** contrast.

| Kind | Econ | Supply | Raiders | NPC | Sky | Infra | Bldg | Med | UI | Oasis |
|---|---|---|---|---|---|---|---|---|---|---|
| grid_down | s | s | s | s | C (dark nights, stalled road) | s (grid, fuel, phone) | - | s | R (report: solar grid-tie line) | s |
| nuclear | R (market crash 50%) | R (fallout in scavenging, wildfood hot 150 d, winter halves the harvest in an exchange) | R (no visits for 14 d) | R (dash home from town, neighbors) | C+R (flash, mushroom cloud, haze; winter cuts growing) | R (EMP fries inverters, pump, generator, vehicles; Faraday rooms save spares) | - (no blast damage to buildings) | R (dose, sickness, shelter, KI, meter) | R (shelter view, report lines, dose HUD) | s |
| lawless | s | s | s (law track alone) | R (groups form, neighbors raid) | C (warm smoke look) | - | - | s | C | s |
| financial | R (market crash 45%, bail-in of 30% over $250,000, savings and safe-deposit fees) | s | s | s | C | s (banks) | - | s | C | s |
| drought | s | R (wells fail, creek stops, hand pump dies first, stored water gets a garden through, haying, fish die) | R (refugees 1.6x, looters 1.3x) | R (refugee settlers 2x) | C (dust sky) | R (water table, renewables derated) | - | s | C | s (weak: no grid fall) |
| pandemic | s | s | R (more arrivals and refugees, fewer traders) | R (neighbor plague mortality 4x, refugees 2x) | C (muted, empty roads) | s | - | R (contagion at the gate 0.25 and at home 0.06, medical bay, quarantine, scavenging sickness) | C | s |
| solar_flare | R (market crash 30%) | s | s | s | C (aurora, then dead grid) | s (grid out 240-730 d is the only effect) | - | - | C | s |
| wildfire | s | s | s | R (neighbor house fires 40x near) | C+R (smoke and ash look; fire fuel map) | s (short) | R (fire front burns buildings by fuel clearance, bunkers and stone spared, insurance) | - | C | s |
| ash_winter | R (market crash 35%) | R (growing season cut to a quarter for a year; wildfood halved, fish 0.6) | s | R (refugee flow 2x) | C+R (ash, dim sun, cold) | s | R (one-time roof collapse on workshop, coop, garden only) | - (no respiratory or filter effect) | C | s |
| cyberattack | R (market crash 20%) | s | s | s | C (cold, flat) | s | - | - | C | s |
| zombies | R (market closes for good) | s | R (horde encounter, savage battle behavior, 60 weight) | s | C (green glow, fires) | s | - | - (no bite or infection) | C | s |
| invasion | s | s | R (occupation patrol encounter, requisition off, parley card) | s | C (convoys, war glow) | s | - | s | C | s |
| civil_war | s | s | R (militia encounter, recruiter parley) | s | C (convoys, fires, smoke) | s | - | s | C | s |
| bioweapon | s | R (scavenging sickness) | R (arrivals up, traders down) | R (neighbor plague 4x, refugees 2x) | C | s | - | R (contagion 0.55 and 0.12, fever severity 75, pneumonia) | C | s |
| asteroid | R (market crash) | R (impact winter: growing season to 10% for 2 years) | s | s | C+R (flash, dust, 2-year dark) | s (all tracks to zero) | - (no blast, quake or wave) | - | C | s |
| unknown | s | s | R (arrivals, looters, gangs, traders cut) | R (half the neighbors gone on the hit) | C (purple glow) | s | - | s | C | s |

Reading the matrix: the **Bldg** column is nearly empty (two kinds touch buildings, and nuclear does not), **Med** is real for only the three plague-or-radiation kinds, and **Oasis** has no kind-specific cell anywhere. Where a cell says **s** the player does feel something, but it is the same thing every other disaster would make them feel.

### Kind-specific hook count (rough, from grep of `disaster.kind` / `kind ===`)

nuclear 12+, drought 7, wildfire 5, pandemic 5, bioweapon 5, ash_winter 4, asteroid 2, zombies 2, unknown 2, financial 2 (the crash table plus the bail-in), civil_war 1, invasion 1, grid_down 1 (report line; the stall scale for the ice-storm variant is in `roadTraffic`), solar_flare 0 (a crash percentage and a road stall profile), cyberattack 0 (the same), lawless 0.

## 3. Toothless ranking (most toothless first)

1. **cyberattack.** Zero unique mechanics. It is grid-down with banks hit and a floor of 30%, recovering in 10-90 days. The research doc's "tech fragility" lesson (smart well controller bricked, cards dead, payroll gone) is not modeled. A compound with its own power and cash barely notices.
2. **solar_flare.** Zero unique mechanics beyond a 30% market crash and an aurora. The EMP machinery exists (`nuclear.strike()` fries installed electronics, spares and vehicles; `empVehicles`; `utilities.fried`; Faraday rooms in `nuclear.faradayShare`) but is called only for `kind === 'nuclear'` (`engine.ts:293`). A flare does not fry anything; and an off-grid solar compound is untouched by "the grid is gone". The report card's EMP line only appears for nuclear.
3. **lawless.** Only the `law` track, which feeds raid cadence and the looter and gang weights. Strong in effect on raids, but nothing else changes: no new encounter kinds, no price or neighbor behavior of its own.
4. **grid_down.** The intended baseline (MVP). Real for anyone grid-tied, nearly nothing for an off-grid compound. The ice-storm variant is a look and a road stall, not a weather event (the real ice storm is a separate weather threat that does not fire with it).
5. **civil_war.** One militia encounter kind. No front line, no territory, no checkpoints on the county road, no conscription or requisition of sons and stock, no neighbors taking sides, no convoys that do anything. The convoys and glow are paint.
6. **invasion.** One patrol encounter. No occupation: no curfew, ID checks, confiscation, informants, or requisition quotas. (`game/battle/InvasionFx.ts` is the home-invasion truck ram, unrelated to the foreign invasion.)
7. **financial.** Real bail-in and crash. But "hyperinflation" is not distinct: `priceFactor` reads only `stores` and `deliveries`, so cash never loses value on its own schedule, and the player's dollars buy the same until the shelf is empty.
8. **zombies.** A horde encounter and a closed market. No infection or bite, no night wandering, no noise or light lure, no walkers on the road to the gate beyond the generic lead, no turned neighbors. The unique part is a weight in `whoComes`.
9. **unknown.** Half the neighbors vanish once and encounter weights shift. Everything else is a purple sky.
10. **asteroid.** A real multi-year impact winter and a long, well-dressed warning, but the impact itself does nothing locally: no blast or quake or wind damage, no tsunami or fires beyond sky.
11. **ash_winter.** Real climate, wildfood and one roof event. Missing: ash on solar panels and vehicle air filters, respiratory illness, water contamination, collapsing roofs over time (it is a single day-4 roll).
12. **bioweapon.** Real, shares pandemic machinery. Scenario only.
13. **pandemic.** Real. Missing closures and supply-chain texture, otherwise good.
14. **wildfire.** Real, with the best building damage in the game. Missing smoke illness and evacuation pressure.
15. **drought.** Real across water, food, haying and refugees. Weak oasis contrast (no grid fall, so `collapseProgress` stays low).
16. **nuclear.** The reference: dedicated sim modules, the only kind that damages the home's electronics.

Cross-cutting weaknesses (these affect many kinds):

- **Everything is the same eight tracks.** A new kind with the right curves feels like a re-skin of grid-down.
- **No kind-specific radio.** `radio.ts` reports track status, fate hints and generic raiding rumors; it never speaks to the disaster itself (no "the Compact holds the pass", "mask mandate", "dollar at 4,000 to the pound of flour").
- **Oasis contrast is kind-agnostic** (`collapseProgress` = mean track fall). Drought, pandemic, and civil war read as only mildly collapsed.
- **Buildings and terrain are almost never damaged by a disaster itself.** Only wildfire (and one ash roof roll) do.
- **Surprise pool excludes the 6 pulpy kinds**, so only 10 of 16 can appear in a normal run, and no kind can be rolled twice with different intensity.
- **No physical-shock disasters** (quake, flood, dam, blast, heat) exist as end-times events; flood, tornado and ice storm exist only as weather threats.

## 4. Proposed additional scenarios (10)

Each: felt effects, then the cheapest believable implementation (reusing the tracks, `effects.ts` hooks, `weatherThreats`, `radiation`, `encounters` weights).

1. **Mega-earthquake (Cascadia or Wasatch Front M9).** The day it hits: rolling shaking, half the county's chimneys and unreinforced masonry down, the county road cracked and bridges out, the well pump line snapped, aftershocks for weeks that re-knock partly built walls. Cities fall off the grid for months (roads cut, not just power), landslides close passes, dams are a hazard. Neighbors in old brick houses die or are trapped; the player's own wood frame with a poured foundation comes through, a stone wall may not. Cheapest: new kind with slow-recovering `deliveries`, `fuel`, `medical`, `law` curves; an `effectsDay` roll per finished structure keyed on foundation and material (reuse `knockBack`, `burnStructure` pattern, `insuranceClaim`); road-cut flag through `roadFx`; reuse the existing `terrainFx` landslide candidates for slope slides; aftershock dates as `done` keys.
2. **Crop blight and pest plague (wheat rust, locusts, a seed-stock failure).** Nobody's shelves go empty at once: the harvest fails county by county, grain triples, bread lines form, farmers stop trading seed, neighbors guard their fields at night. The player's garden and orchard lose a share to blight unless varieties were mixed and seed was saved. Cheapest: new kind that is mostly `climate()` (`grow` factor by crop family) plus a `stores` and `deliveries` curve that falls slowly over months; hook the orchard and farm modules to a `blight` factor; reuse the `famine` threat's `grow *= 1 - 0.35 * famine` line; add a seed-saving milestone.
3. **High-altitude EMP (a weapon, no war).** One bright flash at dawn, every modern car in the valley dead on the road, every inverter and pump controller dead, no radio on the air except what was in a Faraday box, but no fallout, no winter, no radiation. The distinct feel: the world is intact and silent, and only 1970s trucks and unplugged spares run. Cheapest: call the existing `strike()` EMP block (split out of `nuclear.strike`) on a new kind with all curves permanent or very long; no radiation hooks. Doubles as the fix for solar_flare (see WP1).
4. **Dam failure and great flood (the river valley goes under).** A reservoir upstream fails in the night with a few hours of warning from the sheriff's sirens. The creek bottom and lower buildings flood, the moat overtops, wells are contaminated for weeks, cattle drown, the county road below the compound is washed out for a season. Cheapest: reuse `weatherThreats` flood with a much larger stage and `terrainFx.floodCandidates`; add a contaminated-well flag in `utilities`/`water`; roads through `roadFx`; a short `grid` and `law` curve.
5. **Heat dome and aquifer collapse (long deadly heat).** Weeks above 110 F by day and 90 F at night, wildfire risk everywhere, crops scorch, livestock die without shade and water, old people and kids go down with heat illness, grid fails under air-conditioner load, wells draw down. Cheapest: kind with `grid` rolling brownouts; a `heat` factor in `cold.ts`'s sibling (heat stress) with water draw multiplier in `thirst.ts`; reuse the existing `heat_wave` weather threat at higher severity, chain to wildfire and drought.
6. **Zoonotic livestock plague (avian flu plus foot-and-mouth) and a slow human pandemic.** The herd and flock must be culled, the county quarantines animals, milk and eggs vanish from shelves, meat is the thing everyone steals. Cheapest: a `livestock` hook (in `herd.ts`, `swine.ts`) with a cull-or-lose-them choice via the existing gate-card pattern; `stores` curve slow and deep; contagion reuse for a mild human tail.
7. **Satellite loss (Kessler cascade or GPS and comms blackout).** Nothing visibly breaks: the lights stay on. But cards, ATMs, truck logistics, aircraft, weather forecasts, cell service and time-synced everything go; the power grid wobbles. Deliveries and phone fail first, over weeks the grid and banks follow. Cheapest: a kind with `phone`, `banks`, `deliveries` and `fuel` curves hit first and a grid curve slow; weather threat watches lose their forecast lead (a multiplier in `weatherThreats` warning days); radio becomes the only news.
8. **Oil and refinery shock (the strait closes; the pipeline is cut).** Slow death by fuel: pumps empty, trucks stop, deliveries thin, food prices triple from the freight, tractors and generators idle, neighbors siphon each other's tanks. Cheapest: `fuel` curve to near zero, `deliveries` and `stores` slow; nothing to build besides a siphoning theft event and a fuel-theft raid opener; `fleet` and `generator` already read fuel.
9. **Mass exodus and martial law (the cities empty onto the county road).** Columns of refugees on the road for weeks; the state declares martial law, sets checkpoints, orders evacuations to camps and requisitions food, vehicles and spare rooms; the government posture (`gate.government` help vs hindrance) decides whether it helps or confiscates. Cheapest: reuse `refugees`, `requisition`, `patrol` encounter kinds with a high weighting and a queue of requisition orders; `countyCrossings` checkpoint hook; a "comply or hide" choice using `gate.government`.
10. **Reactor meltdown plus dirty bomb (regional radiation without war).** One or two plants fail within the region: a plume with a wind direction, a keep-out zone on the map, iodine and shelter decisions, contaminated wildfood and water for years, but cities and the grid are otherwise fine. The felt contrast is that the world is mostly normal and a county-sized stripe is dead. Cheapest: reuse `radiation.ts`, `nuclear.falloutDay`, `doseBetween`, `wildfood` hot flag with a variant dose curve and a wind-direction roll; short or partial tracks only for the zone.

Also worth noting (smaller, not full scenarios): water-system poisoning, toxic rail spill (local plume), insect-borne epidemic, and a "second wave" mode where any kind re-hits after a lull.

## 5. Implementation plan

### Principles

- **Add a per-kind hook seam first (WP0), then every other package edits only its own new files.** Today kind-specific code is scattered across 60 files; `encounters.ts`, `effects.ts`, `collapseLook.ts`, `roadTraffic.ts`, `finance.ts`, `radio.ts` and `engine.ts` are the conflict hot spots. WP0 turns each into a small dispatch that reads a registry, so later packages add a file rather than a patch to a shared one.
- **One save bump for all of it.** `SAVE_VERSION` is 97 on `origin/main`. WP0 reserves a single bump to v98 with an optional `disaster.fx?: Record<string, unknown>` bag (lazy, JSON-safe) that kinds use for their own state (`done` keys already exist). Later packages must not bump again unless they add a real field and coordinate in `DECISIONS.md`.
- **Respect the standing rules:** US spelling and units, no audio, procedural art only, perf budgets unchanged, `check` must pass.
- **Every new teeth must call the existing resistance of difficulty** (`DIFFICULTY[...]`), so Cozy stays gentle and Hardcore bites.
- **A teeth test** (WP9) fails if a kind has no hook in at least four of the ten columns, so a kind cannot regress to a re-skin.

### Work packages

Files listed are the only ones each package may touch (plus its own new tests). Packages marked parallel can run at the same time after WP0 lands.

**WP0: Per-kind hook seam (serial, do first; small).**
- New `src/sim/disasterFx.ts`: `KindFx` interface with optional hooks: `onWarning`, `onHit`, `daily`, `encounterWeights`, `priceMods`, `buildingDamage`, `medical`, `radioBulletins`, `oasisWeights`, `look`. A `FX: Partial<Record<DisasterKind, KindFx>>` registry that imports one stub module per kind from `src/sim/disasters/<kind>.ts` (all 16, plus empty stubs for the 10 proposals).
- Call sites (the only edits to shared files): `engine.ts` (impact and daily dispatch, replacing the `kind === 'nuclear'` special case by `FX.nuclear.onHit`), `encounters.ts` `whoComes` (apply `encounterWeights`), `effects.ts` (`effectsDay` calls `daily`), `economy.ts` `prices` (apply `priceMods`), `radio.ts` (merge `radioBulletins`), `homeSafety.ts` `collapseProgress` (apply `oasisWeights`). Existing `nuclear` behavior moved behind its hook byte-for-byte; existing tests must pass unchanged.
- `state.ts`: the one save bump (v98) and migration pass-through.

**WP1: Solar flare and EMP (parallel after WP0).** Files: `src/sim/disasters/solarFlare.ts`, `src/sim/disasters/emp.ts`, `src/sim/nuclear.ts` (extract `strike`'s EMP block into an exported `empStrike` and call it back), `src/sim/vehicles.ts` (only if a partial-fry chance is needed). A flare fries a share of long-line electronics (grid-tied inverters, the pump controller on the grid, unprotected radios) by exposure, not everything; the full EMP (kind 3 above) fries all. Off-grid compounds feel it as dead spares and a quiet radio dial, not a dead grid. Adds the Faraday and "spares in a box" payoff in the report.

**WP2: Cyberattack teeth (parallel).** Files: `src/sim/disasters/cyberattack.ts`, `src/sim/disasters/grid_down.ts`. Smart devices and the well controller brick unless a manual override or spare exists; cards and ATMs dead means cash and barter only (reads `moneyWorks`); payroll jobs end; grid-down's variants set their own side effects (the ice storm fires a real ice-storm weather threat at hit; the substation attack adds guarded-substation raiders, i.e. copper thieves).

**WP3: Order and occupation (lawless, civil war, invasion) (parallel).** Files: `src/sim/disasters/lawless.ts`, `civil_war.ts`, `invasion.ts`, `src/sim/occupation.ts` (new, pure), tests. Territory flag per season (Compact or Alliance holds the town), checkpoints on the county road that inspect, tax or turn you back (`countyCrossings` consumer only), conscription demand from the militia, curfew and ID checks and a confiscation quota during an occupation, informant risk, neighbors taking sides (disposition shifts). Lawless gets neighborhood-watch hardening and looting of the abandoned homes the player can salvage or not.

**WP4: Zombies and bioweapon (parallel).** Files: `src/sim/disasters/zombies.ts`, `bioweapon.ts`, `src/sim/walkers.ts` (new, pure). Infection from bites and from the dead (turned neighbors, turned family), night wandering that lures to light and noise (reads `stealth`), horde size that grows with the town's population, a daily "walker count at the wall" feeding the wall-damage and ammo sinks; bioweapon adds gate quarantine cards and contaminated-contact scavenging.

**WP5: Money (financial) (parallel).** Files: `src/sim/disasters/financial.ts`, `src/sim/finance.ts` (only the `priceFactor`-adjacent additions via `priceMods`, and bank-run and hyperinflation state). Hyperinflation devalues cash and savings on a per-week curve (a cash multiplier on spending and wages, holdings in gold, silver, food, ammo hold value), bank-run and withdrawal limits, debt jubilee or repossession.

**WP6: Physical shocks (parallel).** Files: `src/sim/disasters/asteroid.ts`, `ash_winter.ts`, `mega_quake.ts` (new kind), `dam_flood.ts` (new kind), `src/sim/structureDamage.ts` (new, pure; the shared "roll a finished structure's damage by material, foundation and slope" helper). Asteroid impact day: blast and thermal pulse by distance, tsunami n/a, wind and fire; ash gets ash loading on all low roofs every week (not one roll), solar derate, air-filter and engine clog, respiratory illness; the quake and the dam flood use the same helper plus `roadFx` cuts.

**WP7: Plague family and slow disasters (parallel).** Files: `src/sim/disasters/pandemic.ts`, `blight.ts` (new kind), `livestock_plague.ts` (new kind), `src/sim/blight.ts`. Pandemic adds closures (school, store hours cut by wave), supply-chain texture and masks as a stock item; the blight and livestock plague hook the garden, orchard, herd and swine.

**WP8: Radio, news and the hit moment (parallel).** Files: `src/sim/radioScripts.ts` (new, pure data and a selector), `src/sim/radio.ts`, `src/sim/dayCard.ts`, `src/sim/newsPool.ts`, `src/ui/CollapseChip.tsx`, `src/ui/CutsceneOverlay.tsx` (text only). Kind-specific bulletins by phase (warning, first week, first season, a year on) that name the world's state and the fate truthfully, a day-card and chip line for every kind (today `LOOK_LINE` covers 9 of 16), an impact title card. No audio.

**WP9: Look, light and the oasis contrast; the teeth test (parallel).** Files: `src/sim/collapseLook.ts`, `src/sim/roadTraffic.ts` (profiles only), `src/game/atmosphere/homeSafety.ts` and its test, `src/sim/disasterTeeth.test.ts` (new). Adds per-kind oasis weights (drought and pandemic and civil war read as collapsed in the contrast even with the grid up), profiles for the new kinds (quake dust, flood mud line, heat shimmer, blight yellowing, flare aurora and static, no EMP glow), and the test that counts hooks per column per kind and fails under four.

**WP10: Disaster picker, pool, chains and balance (serial last).** Files: `src/sim/disaster.ts` (`DisasterKind`, `DISASTERS` entries for the new kinds, `SURPRISE_POOL`, `FATE_ODDS`, chains), `src/ui/SetupScreen.tsx`, `src/sim/regions.ts` (regional odds, e.g. quake in the Pacific Northwest, flood in river valleys), `scripts/` balance run. Only after WP1 to WP8 land, so it is the one package that edits `disaster.ts`. Balance via the existing `BALANCE` harness; 200-run sweep across all kinds on Standard and Hardcore with no kind more than 2x the survival gap of grid-down.

### Order and independence

```
WP0 (hook seam, v98 bump)
  -> WP1, WP2, WP3, WP4, WP5, WP6, WP7, WP8, WP9   (parallel; disjoint files by construction)
  -> WP10 (pool, picker, balance; serial)
```

Possible overlap to watch: WP1 and WP6 both touch `nuclear.ts` neighbors (WP1 extracts `empStrike`; WP6 does not edit that file). WP5 and WP2 both depend on `moneyWorks` (read only). WP8 and WP9 both read `DISASTERS` hints (read only). WP3 and WP4 both add `EncounterKind`s: they must append to `encounters.ts`'s union only through WP0's `encounterWeights` hook, so the type extension lives in `disasterFx.ts` (`ExtraEncounterKind`), not in the union.

### Suggested priority (impact per effort)

1. WP0 (unblocks everything).
2. WP1 (solar flare and EMP: the machinery is built and unused; highest value for least code).
3. WP2 (cyberattack: ranked most toothless; small).
4. WP3 (occupation: three kinds reach a real mechanic with one new module).
5. WP6 (physical shocks: fills the empty Bldg column; the new quake and flood).
6. WP8 and WP9 (felt without new simulation: radio, day cards, oasis contrast; cheap and visible).
7. WP4, WP5, WP7 (zombies and bioweapon; hyperinflation; plague family).
8. WP10 last.

### Questions for the owner

1. Should the six pulpy kinds join the Surprise pool (with regional odds), or stay unlockables?
2. Should a solar flare really fry electronics (WP1), or only the grid (today)? Full EMP as a separate kind?
3. Should disasters be able to damage the player's buildings on the hit (quake, flood, impact), and how harsh on Standard (rare loss, or routine repairs)?
4. Which proposed scenarios to build first (quake, blight, EMP, flood, heat dome, livestock plague, satellite loss, oil shock, exodus and martial law, reactor meltdown)?
5. How far should "occupation" go: checkpoints and requisitions only, or curfew, informants and conscription too?
6. Should hyperinflation make cash nearly worthless (barter and goods only), or just dear?
7. Should a second disaster be able to chain onto any first one (not only `lawless`), e.g. quake into dam flood?
