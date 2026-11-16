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
