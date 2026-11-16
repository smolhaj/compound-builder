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
