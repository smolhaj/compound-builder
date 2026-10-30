# Game-loop backlog audit (area F: tasks #25 #26 #27 #34)

Checked against GDS §10.4 to §10.6, `docs/DECISIONS.md` and `src/sim`. Status: **done**, **partial**, **missing**. "Built here" marks what this PR adds.

## Peacetime (§10.4, task #25)
| Item | Status | Where |
|---|---|---|
| Food, meds, gas expire; rotate stock; stabilizer | done | `sim/shelf.ts`, `sim/pantry.ts`, `sim/storage.ts` |
| Chimney creosote, frozen pipes, seasoning wood | done | `sim/upkeep.ts` |
| Pumps, inverters, batteries wear; spares | done | `sim/utilities.ts` (pump failure, `SPARE_FOR`), `sim/tools.ts` (tool wear) |
| Vehicle wear, service, fuel | done | `sim/vehicles.ts`, `sim/garage.ts` |
| Spare parts getting scarcer over the years | done (follow-up PR) | `sim/parts.ts`; scavenged places already run dry |
| Livestock: goats, pigs, rabbits, cow, bees, sheep, feed, shelter, illness | done | `sim/livestock.ts`, `sim/herd.ts`, `sim/bees.ts` |
| Vehicles: pickup, trailer, tractor, ATV, 1970s truck, motorhome | done | `sim/vehicles.ts`, `sim/fleet.test.ts` |
| Skills by doing; paid courses (first aid, ham, canning, welding, engines, wiring…) | done | `sim/skills.ts`, `sim/courses.ts` |
| Hunter-safety course | partial | the hunting licence is in `sim/wildfood.ts` `buyLicense`; no course entry |
| Permits, inspections, property tax | done | `sim/paperwork.ts` |
| Deliveries/dig/structures raise raid risk | done | `sim/opsec.ts` |
| Cost (time, fuel) of picking up orders in town | partial | listed as "not modelled yet" in DECISIONS |

## Survival (§10.5, task #26)
| Item | Status | Where |
|---|---|---|
| Firewood need by season | done | `sim/heating.ts`, `sim/forestry.ts` |
| Freezing without heat | **partial -> built here** | only frostbite on a watch before; now `sim/cold.ts`, rolled in `medicalDay` |
| Outhouse-to-well distance and dysentery | **missing -> built here** | `sim/sanitation.ts`, `medicalDay`, a "well too close" line in `sim/guidance.ts` |
| Soap, hygiene supplies | partial | `sim/body.ts` (a bought good that runs out; cannot be made) |
| Barter values, market day, prices by scarcity | done | `sim/barter.ts`, `sim/market.ts`, `sim/tradeGoods.ts` |
| Mutual aid: pact, shared work day, shared watch | done | `sim/neighborLife.ts`, `sim/pact.ts` |
| Shared harvest | partial | work days yes; no harvest split |
| Scavenging trips with risk and depletion | done | `sim/scavenge.ts` |
| Seed saving | done | `sim/crops.ts` |
| Smokehouse, curing, canning | done | `sim/kitchen.ts` |
| Soap making | done (follow-up PR) | `sim/soap.ts` |
| Forge | done (follow-up PR) | `forge` building, `farm.hasForge` |
| Candle making | skipped (user) | nothing needs light beyond power |

## People and world (§10.6, task #27)
| Item | Status | Where |
|---|---|---|
| Medical depth: chronic meds, infection, surgery, childbirth, dental | done | `sim/medical.ts`, `sim/body.ts` |
| Radio and rumors (true tips, false rumors) | done | `sim/radio.ts` |
| Rumors that scouting can confirm | done (follow-up PR) | `sim/rumors.ts` |
| Weather: blizzard, tornado, hail, heat wave, flood, lightning fire | done | `sim/weatherThreats.ts` |
| Drought on top of a disaster | done | `sim/effects.ts` |
| Grief, stress, breakdowns, schooling | done | `sim/mind.ts`, `sim/grief.ts`, `sim/courses.ts` |
| Kids grow up, aging, pregnancy | done | `sim/lineage.ts`, `sim/medical.ts` |

## The long game (task #34)
| Item | Status | Where |
|---|---|---|
| Eras: a varied next disaster, escalating | done | `sim/eras.ts`, `disaster.nextEraDisaster` (DECISIONS 2026-10-24 "The long game") |
| Aging, partners, births, adoption, old age | done | `sim/lineage.ts` |
| Chronicle, milestones, dynasty score | done | `sim/lineage.ts`, right panel Years |
| Endless sandbox (user answer): no scripted ending | done | "Keep playing" never ends the run; only a wipe does |
| Heirs inherit everything (user answer) | **partial -> built here** | stores, compound and tools were already one household stockpile; skills did not pass on. `lineage.inheritSkills` |
| Later eras keep testing a long-lived place | **missing -> built here** | `sim/eraPressure.ts` multiplies raid pressure by era and difficulty |
| Day by day, no era skipping (user answer) | done | eras roll on the live clock; the speed controls are the only skip |
