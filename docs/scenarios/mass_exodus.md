# Scenario: mass_exodus (the cities empty onto the county road; martial law)

Kind id: `mass_exodus` (new; proposal 9 in `docs/DISASTER_TEETH.md`). Cities empty onto the road, the state declares martial law, and the compound sits on a route. Conventions in `README.md`.

## 1. Real-world basis and analogs

| Analog | Facts and figures | Lesson |
|---|---|---|
| France, May to June 1940 | About 8 million people on the roads (two million-plus Belgians, Dutch and Luxembourgers first, then up to 6 million French, including about 2 million Parisians); roads jammed, strafed, and unusable to the army. [The Exodus (1940)](https://en.wikipedia.org/wiki/The_Exodus_(1940)) | Villages along the route were swamped, shops sold out in hours, gasoline gone, people slept in barns. |
| Hurricane Rita, Sept 2005 | About 2.5 to 3.7 million evacuated Houston and the Gulf; 100-mile jams of 20 hours or more; a bus fire killed 23 nursing-home evacuees; dozens died of heat and fuel exhaustion. | Evacuation itself kills; the fuel runs out on the road. |
| California "bum blockade," Feb to Mar 1936 | LAPD sent 125 officers to the Arizona and Oregon borders to turn back "indigents"; the Dust Bowl migration brought roughly 300,000 to California in the 1930s (about 2.5 million left the Plains states). | Local government turns migrants away; the courts later ruled it unconstitutional (Edwards v. California, 1941). |
| Partition of India 1947 | About 14 million displaced; up to 1 to 2 million died; trains of dead. | Columns are vulnerable; neighbors turn on each other. |
| Ukraine 2022 | About 8 million refugees abroad and about 6 million internally displaced by end of 2022; volunteers fed thousands at roadsides. | Volunteers are a force; martial law brought male travel bans. |
| Hawaii martial law, Dec 7, 1941 to Oct 24, 1944 | Martial law lasting nearly 3 years: curfew, blackout, military courts. Wuhan lockdown, Jan 23 to Apr 8, 2020 (76 days, about 11 million). | Martial law can last longer than the crisis; the checkpoint economy and passes. |
| Katrina, 2005 | About 1.2 million evacuated; Gretna police turned evacuees back from the Crescent City Connection; the Guard confiscated guns in some neighborhoods. | The border between help and hindrance is a checkpoint. |

## 2. Warning signs (5 to 30 days)

A trigger crisis elsewhere (a city threatened by chemical spill, bioweapon, nuclear event, or a flood or fire; or a rumor): evacuation advisories, "shelter in place" then "evacuate" within a day; gas lines; the governor's emergency declaration; traffic counts rising on the county road a week before; a state trooper roadblock at the exit ramp; neighbors cutting fences to take shortcuts; National Guard trucks parked at the school. The player sees them as road traffic rising (`roadTraffic` already has a profile), radio traffic reports, and the day card "Day -3. Cars, bumper to bumper, headed away from the city."

## 3. Phase timeline

| Phase | World | Compound |
|---|---|---|
| Hit moment | Governor orders full evacuation of the metro; the president or governor declares martial law: curfew, checkpoints, a state of emergency. | The county road fills. |
| First hour | Cars stalled by dry tanks; people on foot. | Strangers at the gate asking for water: a `refugees` encounter every few hours. |
| Day 1 | Fuel gone on route; 1 in 10 cars out of gas by noon. A state checkpoint at the county line. | Water stand decision (hand out water, set a price, or close the gate). |
| Week 1 | Peak flow (days 2 to 9). Reception camps set up at the fairgrounds, the school, a church; martial law orders: requisition of food, vehicles and rooms for evacuees "by order of the Governor". | A requisition officer visits: billeting of 6 to 20 people; food levy. |
| Month 1 | Flow thins; camps full; disease risk; curfew continues; ID cards for movement. Some towns refuse (the blockade). | Stayers: refugees who settle; some become workers, some thieves. |
| Month 3 | Camps decline or become towns; martial law under pressure; local militias vs Guard conflicts. | The compound's allegiance matters. |
| Month 6 | Return or resettlement; the state ends martial law in the fate `full`, extends in `partial`. | Many refugees stay; an expanded settlement. |
| Year 1 | A new normal: a new county of 3x the people. | A village or a town. |
| Year 2+ | Return of the old order, or a permanent regime. | |

## 4. Effects

Tracks (variant `evacuation`): law C(3,10,0.5,[60,200]) because the Guard keeps a rule but not a local one; grid C(5,20,0.6,[30,120]) (overload, crews pulled); fuel C(0,2,0.05,[20,90]) (the first to fall: it burns on the road); stores C(2,8,0.15,[30,120]) (clean out); deliveries C(0,3,0.3,[30,120]); medical C(2,10,0.3,[30,120]) (overwhelmed); phone C(0,3,0.4,[20,90]) (congestion); banks C(10,20,0.7,[40,160]).
Prices: fuel x6 by day 3 (siphoning, the rationing); water bottles x4; hotel/room rent per night; sellers of rides; passes (a stamped paper) trade for $200 to $2,000. Barter: gas for ammo.
Neighbors: some leave on the road; some stay armed; some profit. Raids on neighbors fall because Guard patrols; but arrivals up.
Health: heat, dehydration, injuries from pile-ups, infectious spread in camps (dysentery, flu), pregnant women giving birth.
Encounter mix: `refugees` 5x during days 2 to 14 (families with kids: untrained civilians speaking in short, broken lines: "Please, just water. The baby's hot."), `stranded` 3x (broken-down travelers), `requisition` 3x (Guard and state officers, `hard` temper but formal; one in 6 is a rogue unit that confiscates for itself), `patrol` (Guard checks IDs, enforces curfew), `looters` 1.2x (opportunists from the column), `gang` 1.0x but a gang "poses" as refugees (a scouting trick: refugees who return as raiders if you mistreat them or if you show stores), `trader` 1.5x (selling gas and rides), `kin` (relatives arrive: 3 to 8 people, may bring skills and burdens).
Hostile crews in this scenario are the cruelest at the road: they kill all but take captives or women, vehicles; some merciful groups (church vans) spare children and may leave a kid with you.

## 5. Factions, checkpoints, requisitions, choices

Factions: the State (Guard and the Governor's office), County Sheriff (may clash), the Evacuees (a council forms), the Locals (the Town Committee), and Rogue Convoys.
Checkpoints: state checkpoint at the county line; a local blockade by neighbors (the player may join, or oppose); a "bum blockade" decision: turn away (humanity -8 each group per existing rule, but protects stores), take in (+6, mouths), or charge a toll (food or labor).
Requisition orders: the state billets evacuees on any home with spare rooms (`gate.government` 'hindrance' decides if forced; 'help' offers a ration and escort in return, a compensation voucher, supplies). Comply, hide (the compound's hidden rooms), pay off (an officer's price), or refuse (arrest risk and a fine, or the Guard leaves). Martial-law rules: curfew (20:00 to 05:00), travel pass required, firearms registration or restriction (in a hindrance state: gun confiscation roll p 0.2 per patrol on visible weapons; hidden weapons safe).
Humanity: helping at the roadside +4 each visit (cap +20 per month); letting a family sleep in the barn +6; shooting a thief who stole bread -12; reporting a hidden refugee to the Guard -10; a "Samaritan sign" at the gate unlocks volunteers.

## 6. Regional variation

Where the people come from and where they go: the route is determined by the region's nearest metros.
| Region | Notes |
|---|---|
| mountain_west | Salt Lake and Boise flows; few roads (chokepoints on the interstate and a pass); winter cold kills; high wilderness; distant. |
| appalachia | Evacuees from Charlotte, Knoxville and Washington; narrow roads, tunnels; high local suspicion. |
| desert | Phoenix and Albuquerque; heat deaths; water is the currency; Guard heavy. |
| north_woods | Minneapolis and Duluth; cold; far; light flow. |
| plains | Open ground: the I-80 and I-35 corridors; vast columns; tent cities; harvest labor demand. |
| pnw | Seattle and Portland flows (earthquake fear); ferries; the rain. |
| upper_midwest | Chicago and Milwaukee flows into Wisconsin and Michigan; heaviest flow in the game. |
| new_england | Boston and New York; ice storms; towns refuse out-of-staters. |
| ozarks | St. Louis, Kansas City, Memphis, Dallas flows; hill roads; heavy hospitality and heavy shotguns. |
| hill_country | Austin, San Antonio, Houston flows (as in Rita); heat; ranchers with fence rules. |
| rust_belt | Pittsburgh, Cleveland; dense; a corridor of towns; the biggest requisition pressure. |

## 7. Radio and day cards

Radio: governor's order readings; Guard checkpoints list; "reception center at the fairgrounds open"; traffic reports "No gas from exit 14 to 60"; a missing-child message net; a rumor that the camps are fine or deadly; a voice from the camp: "We need doctors." Day cards: "Day 2. A line of cars you cannot see the end of." "Day 9. A woman at the gate with a rolling suitcase, asking for the nearest church." Title: "The cities are emptying."

## 8. Decisions; rich vs poor

Join the road (flee with kit), stay and host, stay and shut, go back to the city with a safe-conduct to rescue kin (a risky mission), set up a toll stand (cash, fuel, labor), partner with the Guard.
Rich: a filled tank or two, a convoy with guards and a trailer, a pass bought before day 1, a bribe at the checkpoint ($500 to $2,000), a second house in a quiet county, a generator, bulk supplies to feed 20, a bus to shuttle. Poor: walk with a cart, rely on camps, trade labor for passage, shelter in the barns of kind strangers, carry little.

## 9. What makes it fun

The compound as a waystation: a flow of stories (a family with a boy who can fix a pump; a nurse; a thief). A hospitality economy: provide water, a meal, a bed, a ride and build goodwill or a stronger settlement. The tension between charity and survival. Martial law gives a clear antagonist that is not a monster. The scenario ends with a larger compound (a village) if the player chooses to host.

## 10. Numbers and hook seam

Variants: `evacuation` (default, above), `fleeing_front` (invasion or war drives the flow; chain), `quarantine_flight` (pandemic/bioweapon; checkpoints sort sick from healthy: contagion hooks). Warn 5 to 30 days, hit day: flow peak day 2 to 9 with arrivals per day `A(t) = base * region * exp(-(t-5)^2/18)` where base ~ 12 encounters per day on a route road, 4 off-route; roadFx: a road cut or jam. Requisition: billet 6 to 20 people after day 5, food levy 15% every 14 days under martial law. Curfew 20:00 to 05:00. `fuel` tracks: floor 0.05. Arrivals contagion hook: reuse pandemic gate 0.25 only in `quarantine_flight`. Cozy: no forced billeting; Hardcore: gun confiscation roll and forced billeting.
Hook seam: `src/sim/disasters/mass_exodus.ts`; `onHit` sets `fx.martialLaw` true with `until`, `encounterWeights` as above with `ExtraEncounterKind` `rogue_unit`, `daily` runs arrival wave and billeting orders, `priceMods`, `radioBulletins`, `oasisWeights` (fuel x2, deliveries x1.5, law x1.5), `look` (stalled traffic, night-line lights). Consumers: `countyCrossings` (checkpoints), `gate.government`, `refugees` and `requisition` encounters, and `roadFx` for jam. Requires `occupation.ts` shared helpers (curfew, passes, requisition).

## 11. Chaining

Into: `pandemic`, `bioweapon`, `nuclear` (shelter vs flee), `wildfire`, `invasion`, `civil_war`, `grid_down`, `mega_quake` (proposal), `dam_flood`. Out of: `lawless` (when martial law ends badly, 30%), `global_famine` (the county's food gone, 25%), `pandemic` (camps, 20%). A variant of the chain: after Month 3, a "second wave" (the city's return) when the crisis ends and people go home through your land.
