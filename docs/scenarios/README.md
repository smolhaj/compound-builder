# Scenario maps

One doc per end-times scenario: real-world basis, warning signs, a phase timeline from hit moment to year 2+, effects per service track, factions, regional variation, text-only radio and day cards, decisions and rich vs poor, why it is fun, suggested numbers and the hook seam, and chaining. These are design docs only: no code or save change. They build on `docs/DISASTER_TEETH.md` (the audit, the work packages and the `KindFx` hook seam in `src/sim/disasterFx.ts`).

## Conventions used in every doc

- **Tracks:** `grid`, `fuel`, `stores`, `deliveries`, `medical`, `law`, `phone`, `banks`. Curves are written `C(at, fall, floor, back, ramp)` exactly as in `src/sim/disaster.ts` (days after the hit; `back` is `[min,max]` days or `null`).
- **Encounter kinds** are the existing `EncounterKind` values (`looters`, `gang`, `refugees`, `requisition`, `patrol`, `militia`, `trader`, `kin`, `stranded`, `ransom`...). New kinds go through `ExtraEncounterKind` in `disasterFx.ts` (WP0 rule), never by editing the union.
- **Raider tempers** are `desperate` (spares children, flees when losses mount), `hard` (kills fighters, takes goods, may take captives for ransom), `savage` (leaves nobody, takes children). Untrained civilians speak in short, broken, fragmentary lines; organized crews speak in clipped, flat lines.
- **Humanity** is `gate.humanity` (0 to 100, starts at 70; take in strangers +6, turn away -8).
- **Hook seam:** each scenario lists which `KindFx` hooks it uses (`onWarning`, `onHit`, `daily`, `encounterWeights`, `priceMods`, `buildingDamage`, `medical`, `radioBulletins`, `oasisWeights`, `look`) and its file `src/sim/disasters/<kind>.ts`. Shared occupation logic lives in `src/sim/occupation.ts` (WP3).
- **Regions:** the 11 in `src/sim/regions.ts`: mountain_west, appalachia, desert, north_woods, plains, pnw, upper_midwest, new_england, ozarks, hill_country, rust_belt.
- Text only, no audio. American English and US units. Figures are public record or widely cited estimates; each doc names its sources and flags numbers to recheck before they appear on screen.

## Shared model for physical shocks (natural group)

Used by [mega_quake](mega_quake.md), [dam_flood](dam_flood.md), [supervolcano](supervolcano.md), [ash_winter](ash_winter.md), [asteroid](asteroid.md), [wildfire](wildfire.md) and [drought](drought.md). It is the design for `src/sim/structureDamage.ts` (WP6) and `src/sim/winter.ts`; nothing here is built.

- **Damage states** per finished structure: 0 sound; 1 minor (a hardware kit and 1 to 3 person-days; no stage lost); 2 major (`knockBack` to the roof, frame or interior stage; 30 to 60% of the blueprint's materials); 3 destroyed (`burnStructure`-style loss, clear the wreck, rebuild from the footing). A roll is `hazard(intensity) x resistance(style, site, stage)`; every kind supplies its own hazard table and shares the resistance idea (lower is better).
- **Resistance inputs** the sim already has or can derive: housing style (`housingStyles.ts`: cabin, log, lodge, stone, timber frame, container, adobe), blueprint kind, build stage (half-built walls are the weak point), hardening tier, retaining walls, terrain slope and creek-bottom flags (`terrainFx.ts`). `Structure` has no quality or foundation field today; derive a **build-quality tier** (1 to 3) from style, hardening and any fitted upgrades, and keep any new field in the `disaster.fx` bag (v98) rather than a new save bump.
- **Repair:** by hand costs person-days; the existing crews (`crews.ts`: four people at $60 an hour each) have a **lead time of 3 x (1 + 8 x affected share) days** after a regional event and cost x1.3 for 60 days; paying x1.5 jumps the queue. Crews stop when roads and banks fail. Wealth buys speed (crews, generators, materials ahead of the demand surge); poverty buys time and risk. **Insurance** exists through `insuranceClaim` but ordinary policies exclude earthquake and flood: those need a rider or a flood policy (a peacetime decision with an annual cost). Fire and ash-load collapse are covered.
- **Winter engine** (`ash_winter.md`): one pure `WinterState` (sun dimming, cold anomaly, growing-season factor, solar derate, food stress) that `ash_winter`, `asteroid` and the nuclear exchange all call with their own severity.
- **Source note for this group:** web access was restricted while these docs were written, so figures come from memory of the cited agencies and standard reports and are tagged "commonly cited" (not re-checked), except where a doc says a figure was verified. Re-check every number before it reaches player-facing text.

## Index

<!-- group: social collapse (claude/scenarios-social) -->
- [lawless](lawless.md): end of the rule of law; three variants (walkout, blackout of order, drift); tolls, posse, watch pact; Argentina 2001, LA 1992, Katrina, Venezuela, Somalia.
- [civil_war](civil_war.md): Cascade Compact vs Plains Alliance; a weekly front-line holder, checkpoints, requisition and draft, snipers, deserters; Bosnia, Syria, Lebanon, Spain.
- [invasion](invasion.md): occupation in three tiers (checkpoints and requisitions; curfew and ID; informants and forced labor); France, the Netherlands, Iraq, Ukraine.
- [unknown](unknown.md): four hidden-truth variants (the Vanishing, the Quiet, the Change, the Static) so replays differ.
- [mass_exodus](mass_exodus.md): the cities empty onto the county road under martial law; hospitality vs blockade; France 1940, Rita, the 1936 bum blockade.
- [global_famine](global_famine.md): multi-region harvest failure; rations, levies, seed hiding (new, ranked 1 of the extras).
- [water_war](water_war.md): a river compact breaks; ditch riders, tanker mafias, rights (new, ranked 2).
- [cult_takeover](cult_takeover.md): the Covenant captures the council and tithes the valley; a nonviolent antagonist (new, ranked 3).
- [extra_scenarios](extra_scenarios.md): the ranked list of six brainstormed scenarios and sketches of the three not fully mapped (automation failure, coastal surge, deep freeze).
<!-- end group: social collapse -->

<!-- group: tech and economy (claude/scenarios-tech) -->
- [grid_down](grid_down.md): long blackout; ice storm, substation, cyber, cascade, plus a new transformer-shortage variant (180 to 730 days); Texas 2021, Puerto Rico 2017, Northeast 2003, Moore County.
- [solar_flare](solar_flare.md): Carrington-class storm; the grid dies, unprotected electronics partly fry (owner decision), Faraday rooms save them, vehicles survive; a 1 to 3 day sprint to disconnect; Quebec 1989, 2024 storm; regional `gic` factor.
- [emp](emp.md): a high-altitude nuclear EMP as its own kind; E1/E2/E3, vehicles and inverters fry, no fallout or winter, old trucks and Faraday spares win; Starfish Prime, Test 184.
- [cyberattack](cyberattack.md): partial, flickering failure; smart devices brick, payments die, a rumor engine with `Verify` by radio, a one-week cash window; Ukraine 2015, Colonial 2021, NotPetya.
- [financial](financial.md): bank holiday, hyperinflation, default, bail-in; a `cashPower` curve with a floor so cash is very dear but not worthless and gold, silver, food and tools matter; Weimar, Zimbabwe, Venezuela, Argentina 2001, Cyprus.
- [nuclear](nuclear.md): distant strikes, nearby base, full exchange, plus a new limited exchange; the 7-10 rule, protection factors, Cold War civil defense, regional plume factors.
- [satellite_loss](satellite_loss.md): new; GPS, satellite and timing loss, the lights stay on while logistics, cards and forecasts fail slowly; weather surprise; Galaxy IV, Kessler.
- [oil_shock](oil_shock.md): new; Hormuz, pipeline, Gulf refineries; fuel is food and currency, the grid stays up; 1973, 1979, Colonial.
- [reactor_meltdown](reactor_meltdown.md): new; regional plume stripe on the map, KI, milk bans, decontamination, settlers; the world otherwise works; Chernobyl, Fukushima, plants by region.
<!-- end group: tech and economy -->

<!-- group: natural and physical (claude/scenarios-natural) -->
- [mega_quake](mega_quake.md): new kind; Cascadia, Wasatch, New Madrid, rift and eastern variants; 3 to 5 minutes of shaking, aftershock schedule (Omori), roads and bridges cut, earthquake insurance excluded; a kind first two weeks then a hard third; bolt the sill. Tohoku, Hebgen Lake, Northridge, Christchurch, Kahramanmaras.
- [dam_flood](dam_flood.md): new kind; dam breach, levee flood, watershed cascade; a local catastrophe inside a working world (help comes); siting above the creek, mold clock, flooded wells, hosting neighbors. Johnstown, Teton, Taum Sauk, Helene, Guadalupe 2025.
- [supervolcano](supervolcano.md): the ashfall phase of `ash_winter`; the Yellowstone alert ladder and ash forecast cone, a daily roof-load clock replacing the one-roll collapse, respirators, filters, solar and vehicles in ash. Mount St. Helens, Pinatubo, Novarupta, Laki.
- [ash_winter](ash_winter.md): the volcanic winter, years 0 to 5; growing-season factor by region, seed and storage as the game, price index on food stress, plus the shared winter engine. Tambora 1816, Laki, 536 AD, Pinatubo.
- [asteroid](asteroid.md): four variants (airburst, ocean, land, comet); a public odds arc and a narrowing impact corridor so the player decides stay or move; blast bands, a prep-race price curve, a rare deflection ending, then the winter engine. Chelyabinsk, Tunguska, 2024 YR4, DART.
- [wildfire](wildfire.md): keeps the fire-front core, adds Ready/Set/Go, layered ember, radiant and building-to-building rolls, stay-and-defend vs leave, smoke exposure, post-fire flood and salvage and morels. Camp, Marshall, Lahaina, Black Saturday, 1910.
- [drought](drought.md): megadrought, dust bowl, aquifer collapse and the heat dome; a numeric well-table model, herd triage by water use, a heat meter, welfare checks, water thieves. Dust Bowl, Ogallala, 2021 heat dome, Chicago 1995, Cape Town.
<!-- end group: natural and physical -->
