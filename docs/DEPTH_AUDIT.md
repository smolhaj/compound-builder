# Depth audit: tasks #25, #26, #27 (GDS §10.4 to §10.6)

Checked against `src/sim` at origin/main (save v73; still accurate at v95 except that radiation sickness and thirst are now built, #260). Supersedes the older `docs/BACKLOG-AUDIT.md` rows for these items. Status: done / partial / missing. "Built here" = this PR.

## #25 Peacetime (§10.4)
| Item | Status | Where |
|---|---|---|
| Food, meds, fuel expire; rotation; fuel stabilizer | done | `sim/shelf.ts`, `sim/pantry.ts`, `sim/storage.ts`, stabilizer in `sim/materials.ts` / `sim/shelves.ts` |
| Pump, battery, generator wear and service | done | pump failures + `faultFactor` and battery capacity fade in `sim/utilities.ts`; `sim/renewables.ts`; `sim/parts.ts` |
| Livestock: goats, pigs, rabbits, cow, sheep, bees; feed, fencing, shelter | done | `sim/livestock.ts`, `sim/herd.ts`, `sim/bees.ts` |
| Vehicles: pickup, trailer, tractor | done | `sim/vehicles.ts`, `sim/garage.ts`, `sim/fleet.test.ts` |
| Paid courses: first aid/EMT, ham, canning, welding | done | `sim/courses.ts` |
| Paid course: hunter safety | **missing -> built here** | `sim/courses.ts` (`hunter`), book set `course_hunter`, save v74 |
| Slow learning by doing | done | `sim/skills.ts` |
| Permits, inspections, property tax | done | `sim/paperwork.ts` |
| Neighbors notice deliveries / bunker dig (OPSEC) | done | `sim/opsec.ts` |

## #26 Survival (§10.5)
| Item | Status | Where |
|---|---|---|
| Firewood need by season; freezing without heat | done | `sim/heating.ts`, `sim/cold.ts`, `sim/forestry.ts` |
| Outhouse-to-well distance, dysentery | done | `sim/sanitation.ts`, `sim/medical.ts` |
| Barter values, market day | done | `sim/barter.ts`, `sim/market.ts`, `sim/tradeGoods.ts` |
| Mutual-aid pact, shared watch, shared harvest | done | `sim/pact.ts`, `sim/neighborLife.ts`, `sim/sharedHarvest.ts` |
| Scavenging with risk, time away, depleting finds | done | `sim/scavenge.ts` |
| Seed saving | done | `sim/crops.ts` |
| Forge, soap, candles, smokehouse | done (candles: user chose to skip) | `farm.hasForge`, `sim/soap.ts`, `sim/kitchen.ts` |
| Spare parts scarcer over the years | done | `sim/parts.ts` |

## #27 People and world (§10.6)
| Item | Status | Where |
|---|---|---|
| Chronic meds, infection, surgery, childbirth, dental | done | `sim/medical.ts`, `sim/body.ts` |
| Radio and rumors, scouting to confirm | done | `sim/radio.ts`, `sim/rumors.ts` |
| Blizzard, flood, hail, tornado, drought on top of a disaster | done | `sim/weatherThreats.ts`, `sim/terrainFx.ts`, `sim/effects.ts` |
| Kids grow up, aging, pregnancy | done | `sim/lineage.ts` (long-game owner), `sim/medical.ts` |
| Grief, depression, breakdown | done | `sim/mind.ts`, `sim/grief.ts` |
| Schooling the kids | done | `school` duty and teacher hours in `sim/daily.ts`, `sim/courses.ts` |

## Open (not built)
- Cost (time, fuel) of fetching a delivery from town: DECISIONS lists it as not modelled; GDS silent. Needs a user decision.
- Whether hunter safety should be required for tags: GDS silent, so it is a plain course for now.
