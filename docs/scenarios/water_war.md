# Scenario: water_war (resource war over water)

Kind id: `water_war` (new; brainstorm rank 2). A river compact breaks, a reservoir hits dead pool, and counties, states and companies fight for the flow. Not just drought (which is a weather event with refugees): the water becomes property, a political and armed contest. Conventions in `README.md`.

## 1. Real-world basis and analogs

| Analog | Facts | Lesson |
|---|---|---|
| Colorado River, 2000 to now | The 1922 Compact assumed about 16.4 million acre-feet a year; the real average flow has been about 12 to 13. Lake Mead fell to about 1,040 ft in July 2022, the lowest since filling (dead pool is 895 ft). Seven states plus Mexico and tribes depend on it. | Allocations exceed supply; cuts are by seniority ("first in time"); a legal war turns physical when the cut hits farms. |
| Owens Valley, 1905 to 1927 | Los Angeles bought water rights secretly; the aqueduct opened Nov 1913; ranchers dynamited the aqueduct and seized the Alabama Gates in 1924 and 1927; the valley dried. | Rural people sabotage the city's intake; the city wins on money and law. |
| Cochabamba "Water War," Bolivia 2000 | After a private concession doubled bills, protests and a state of emergency; a teenager and several others died; the contract was cancelled in April 2000. | Privatization of water is explosive. |
| Cape Town "Day Zero," 2018 | Dams around 20%; a limit of 50 liters a person a day; the city planned 200 collection points for 25 liters a day; rain and cuts delayed the date to 2019. | A real countdown clock changes behavior. |
| Flint, Michigan, 2014 to 2019 | Water switch April 2014; lead; about 100,000 residents exposed; a federal emergency Jan 2016. | Safe water is not just quantity. |
| Chennai 2019, Mexico City, Kabul, the Ogallala | Reservoirs empty, trucked water markets, tanker mafias in Indian cities (water mafias). | A tanker economy and extortion. |
| Sources | Bureau of Reclamation (Lake Mead elevation records), City of Cape Town 2018 reports, Flint public record; to verify before display. |

## 2. Warning signs (60 to 180 days)

Reservoir level on the radio (Lake Mead falling; Day Zero countdown); the county water board limits lawn watering, then irrigation days; a neighbor's well goes dry; the irrigation district announces cuts by seniority; a lawsuit between counties; "water theft" arrests; tanker trucks on the county road with armed escorts; the farm co-op's meeting turns angry; the first fence cut at the ditch. Notice: the water table gauge in the compound UI (existing `water table` in drought), well depth, neighbors' disposition card ("lost his well").

## 3. Phase timeline

| Phase | World | Compound |
|---|---|---|
| Hit moment | "Dead pool." A compact breaks: the downstream state or the city takes the upstream diversions; the governor announces water emergency; irrigation cut 60%; municipal ration. | Day card; county water board notice. |
| First hour | Hoses off; lines at the water station. | |
| Day 1 | Municipal limit 15 gallons a person a day; tanker prices x5; neighbors haul. | |
| Week 1 | Ditch and canal guards; the first diversion theft (someone dams the ditch); irrigation wars. | A neighbor asks to tap your well or your creek. |
| Month 1 | Farms fallow; orchards die; cattle sold; wells draw down; arrivals from the dry town; water mafias at trucking. | The compound's water is the asset; creek, spring, cistern, or well. |
| Month 3 | Armed ditch riders; a canal sabotage (like Owens Valley); the state "reallocates" by force; troops guard the dam. | Requisition of water rights: an officer orders half your flow for the town. |
| Month 6 | Heat dome; fires; reservoir at dead pool; a deal or a fight. | |
| Year 1 | A new compact (with winners) or permanent rationing; towns depopulate. | Water rights now trade as the main asset. |
| Year 2+ | Settled or fractured: desalination, rain years, exodus. | |

## 4. Effects

Tracks (variant `dead_pool`): grid C(30,60,0.6,[200,600]) (hydropower down at the dam: Hoover produces less at low head), stores C(20,60,0.5,[200,600]), deliveries C(10,40,0.5,[200,600]), banks 1, medical C(20,60,0.5,[250,600]) (waterborne illness, heat), law C(20,80,0.4,[300,700]), fuel C(30,60,0.6,[250,600]), phone 1. A new `water` service track is proposed, but the existing eight are enough: municipal water is a hit on `grid` and `medical`. The compound-specific hook: `utilities`/`water` reads `fx.waterCut` (0 to 1) for municipal hookups, for creek flow (upstream diversion) and well level draw-down (existing drought table).
Prices: water by the gallon (bottled $5, tanker $0.5 a gallon, x10 later), filters, tanks, barrels, pumps, hand pumps x4; irrigation days sold; food x2 from yield losses; land with water vs without: a 10:1 value gap (reuses `land.ts`).
Raiders and neighbors: `gang` hijack tankers (a "tanker mafia"): 5 to 10, `hard`, they sell protection; `looters` steal barrels; `requisition` (water board enforcement: take half your diversion; a ditch rider checks your headgate); `refugees` 2x from dry towns; `militia` 1.5x (irrigators' armed committees); `trader` (water haulers at high prices) 1.5x; `kin`; `neighbor_help` 0.5x. Neighbors' hardship from wells; a neighbor tries to cut your fence to reach the creek; disputes, poaching of diversion rights, a trial (the existing `trial` stance).
Health: dehydration, heat, contaminated water (cholera risk with filters absent), shortened sanitation (outhouse, no washing): dysentery; the pandemic-like `contagion` in camps near tanks. Food: garden yields scale with `water` (existing); livestock die first.

## 5. Factions, checkpoints, requisitions

Factions: the Water Authority (state, backed by Guard), the Irrigation District (farmers, armed ditch riders), the City (buys rights; pays well), the Tanker Mafia, the Tribe (senior rights, a quiet power), the Downstream (violent claimants).
Checkpoints: at the dam road, the headgate, the ditch (a gate that checks permits). Stances: pay a fee in water or cash, bluff your rights (a paper of water rights, a hidden "senior right" from the land deed), shoot.
Requisitions: a legally-backed demand for a % of the creek or well output (Authority takes 30% of your flow by seniority; you can hide a cistern or a deep well).
Choices: share (humanity +), sell water (profit, humanity -4 per sale at extortion price), join the District militia, sabotage the Authority's diversion (Owens Valley: reputation up with farmers, wanted by the state), dig deeper (cost; draws down), switch to dry farming, move.
Humanity: giving water to a thirsty stranger +3 (no cap on water for kids), letting a neighbor's livestock die at your fence -10 if you could spare, selling a child's drinking water at 10x -15, killing a diversion thief -12.

## 6. Regional variation

| Region | Notes |
|---|---|
| mountain_west | Snowpack is the bank; upstream states hold the water; ditch culture (prior appropriation) is strong; the Snake and Colorado headwaters; a good position if you own senior rights. |
| appalachia | Water rich; springs; low conflict; a refuge for arrivals; coal-slurry and acid mine contamination issues. |
| desert | The epicenter: Colorado, Rio Grande; municipal collapse; Phoenix and Albuquerque; the worst. |
| north_woods | Water rich (Great Lakes compact); a target for diversion rumors; lakes and bogs; few conflict. |
| plains | Ogallala depletion: wells draw down; irrigation circles dying; Kansas v Nebraska compact (Republican River) disputes. |
| pnw | West side wet; east side irrigated (Columbia basin); Yakima water rights; a dam-removal fight. |
| upper_midwest | Lakes; groundwater; Lake Michigan diversions (Waukesha). Safe. |
| new_england | Wet; a destination; watershed towns protect reservoirs. |
| ozarks | Springs and caves; karst contamination; fine. |
| hill_country | The Edwards Aquifer and Highland Lakes; Austin and San Antonio draw; cities buy ranches' rights; a ranch with a spring is a prize. |
| rust_belt | Great Lakes and Ohio River: fine on quantity; infrastructure is lead pipes and old; Flint-like contamination. |

## 7. Radio and day cards

Radio: the Lake Mead level read each morning ("elevation 1,038 feet"); a Day Zero countdown ("Tuesday: 38 days"); the Compact commission hearing breaks off; "ditch rider shot at Headgate 4"; a tanker convoy schedule; boil notices; a preacher on water as a gift. Day cards: "Day 22. The creek is a trickle. Two men stand at the fence line, looking at your pond." "Day 70. A gunshot at the headgate. The ditch rider says it was a warning."

## 8. Decisions; rich vs poor

Rich: buy senior water rights early (a $50,000 a share on a stream or a deeper well drilled at $15 to $40 a foot), cisterns and rain capture, filtration, a desalination of brackish water, a pipeline to a spring, a private tanker, and legal fees (a lawyer buys 90 days). Money buys speed in the first months; once the state takes over water, cash is weak. Poor: haul by hand, share with neighbors, dig a hand-dug well, graywater reuse, dry farming, plant drought crops, move.

## 9. What makes it fun

Water engineering as gameplay: ditches, tanks, wells, gravity feed, filters, and the visible, physical map of flow (a flow overlay is already in the GDS). Water as the thing worth fighting for gives a puzzle: where does the creek come from and who is upstream? Negotiated deals (a water-sharing treaty with three neighbors) and sabotage.

## 10. Numbers and hook seam

Variants: `dead_pool` (above, weight 3), `aquifer_collapse` (wells fail by region: no grid fall, `fx.waterCut` 0.5 permanent, weight 2), `contamination` (a Flint/spill event: quantity fine but unsafe; filters required, weight 1). Warn 60 to 180 days; `waterCut` municipal 0 to 0.6 over 30 days, creek flow multiplier 1 - 0.5 * upstreamPressure, well draw-down 3 ft a month beyond the existing drought rate; requisition 30% of diversion every 30 days; tanker price 5 cents then 50 cents then 1 dollar a gallon; dehydration kicks at under 0.5 gallon per person a day.
Hook seam: `src/sim/disasters/water_war.ts`; `onHit` sets cuts, `daily` runs ditch events, tanker mafia and headgate disputes, `encounterWeights` with `ExtraEncounterKind` `ditch_rider` and `tanker`, `priceMods`, `radioBulletins` (elevation), `oasisWeights` (a bonus for compounds with water: weight `medical` x1.5, `stores` x1.5), `buildingDamage` none, `look` (dust, low reservoirs). Reuses `drought` water table, `thirst.ts`, `land.ts`.

## 11. Chaining

Into: `drought` (the climate cause), `heat dome`, `wildfire` (35%), `civil_war` (a compact war: states), `invasion` (cross border). Out of: `mass_exodus` (towns dry: 40%), `lawless` (30%), `global_famine` (20%), `pandemic` (waterborne, 20%).
