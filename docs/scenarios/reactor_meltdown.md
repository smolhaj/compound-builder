# Scenario: Reactor meltdown, regional fallout (`reactor_meltdown`)

New scenario (item 10 in `DISASTER_TEETH.md`, with the "dirty bomb" cousin). One or two nuclear plants fail in or near the region: a plume with a wind direction, a keep-out zone on the map, iodine and shelter decisions, contaminated milk, wildfood and water for years. The felt contrast: **the world is mostly normal and a county-sized stripe is dead.** The grid, banks and stores work for most people; the player either is in the stripe, beside it, or far away and watching it happen.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Event | Figures | Lesson |
|---|---|---|
| Chernobyl, Apr 26, 1986 | A steam explosion and graphite fire released about 5% of the core inventory over 10 days (c). Pripyat's roughly 49,000 people were evacuated about 36 hours later; about 116,000 left the 30 km zone in 1986 and about 350,000 were resettled in total (c); the exclusion zone covers about 2,600 km2 in Ukraine plus a Belarusian zone (c). 28 emergency workers died of acute radiation syndrome in the first months (c). About 5,000 to 6,000 thyroid cancers in people who were children then, mostly from I-131 in milk (UNSCEAR, c). Cs-137 above 37 kBq/m2 covered about 150,000 km2 in Belarus, Ukraine and Russia (c). The Soviet state took 3 days to admit it; Swedish monitors at the Forsmark plant detected it first (c). | Silence kills: the milk pathway, not the plume, caused the cancers. |
| Fukushima Daiichi, Mar 11, 2011 | A tsunami disabled cooling at 3 units; 3 meltdowns. About 154,000 people evacuated (c); a 20 km mandatory zone, then irregular zones to the northwest where the plume fell; the release of Cs-137 was about 15% of Chernobyl's (c); most of the plume blew out to sea. Long-term: zones were reopened in stages over a decade; some towns remain restricted (c). | The wind decides who is hit. A small area can be dead for years. |
| Three Mile Island, Mar 28, 1979 | A partial meltdown with small releases; the governor advised pregnant women and preschoolers within 5 miles to leave; about 140,000 people left (c). | Panic and rumor outrun the dose. |
| Windscale, Oct 1957 | A reactor fire in Britain released I-131; milk from about 200 square miles (500 km2) was banned for weeks (c). | Milk bans are the usual first control. |
| Kyshtym (Mayak), 1957 | A tank explosion contaminated about 20,000 km2; about 10,000 evacuated (c). | Secrecy hides the zone from those inside it. |
| US emergency planning (NRC) | A 10-mile plume exposure zone and a 50-mile ingestion pathway zone around each plant (v). About 54 plants and 94 reactors operate in the US (c). Plants are in or near several game regions. | The 50-mile ingestion zone is the farm's real risk. |
| Dirty bomb (radiological dispersal) | A conventional explosive with a radioactive source (cesium, cobalt-60, americium); few deaths from radiation but costly cleanup and public fear; the 1987 Goiania accident (Brazil) killed 4 and contaminated about 250 people (c). | Fear and cleanup cost, not dose, are the damage. |
| Nuclear risk context | Most US meltdown risk analyses (NUREG-1150, the 2012 "State-of-the-Art Reactor Consequence Analyses") put the chance of a large release per reactor-year very low (c); a coincident cause (earthquake, flood, war, cyber, flare, loss of grid for weeks) raises it: a **long grid-down with failing spent-fuel pool cooling** is a real tail risk, and the game uses it as a chain. | Chain: long blackouts can cause meltdowns. |

Plants by game region (c): Rust Belt edge (Beaver Valley, Perry; near Davis-Besse); Upper Midwest (Point Beach, Palisades, D.C. Cook, Fermi 2); North Woods (Prairie Island, Monticello); New England (Seabrook, Millstone, Pilgrim and Vermont Yankee closed); Appalachia (Watts Bar, Sequoyah, Browns Ferry, Oconee, Catawba); Ozarks (Arkansas Nuclear One, Callaway); Plains (Cooper, Wolf Creek); Hill Country (South Texas Project, Comanche Peak); Desert (Palo Verde, the largest by output in the US); PNW (Columbia, beside the Hanford site); Mountain West (none commercial; the Idaho National Laboratory has research reactors).

## 2. Warning signs and how to notice them

Warning 0 to 14 days; a meltdown caused by an upstream event (earthquake, war, long grid-down) has a longer lead.

- Upstream cause: "the plant has lost offsite power; diesel for the emergency generators will last 7 days" (a headline during a long `grid_down`).
- A **site area emergency** declared (the NRC's four classes: unusual event, alert, site area emergency, general emergency) on the radio.
- Sirens at the plant's zone (a test or a real one); school buses on the road (evacuation staging).
- An NRC and state statement: "no release of radioactivity" (the first, often wrong line).
- Neighbors near the plant leave; traffic on the highway; KI distributed to the 10-mile zone (this may be the player's first KI).
- A dosimeter or a **radio alarm**: the player's own meter ticks up (existing `radiation.ts` meter).
- Wind: the radio reports the plume direction ("winds from the southwest at 8 mph"); the player can see whether they are downwind.

## 3. Phase-by-phase timeline

Reference: a **regional** release at a plant 20 to 60 miles away, wind toward the compound.

| Phase | World | Compound |
|---|---|---|
| **Hit** | Loss of cooling; core damage in hours; a vent or a breach; the first radio statement "no release". | Warning bulletin on the radio; the player decides: stay, shelter, or leave. |
| **First hour** | Evacuation of the 10-mile zone; the highway jams; the plume forms (hours to travel 30 miles at 10 mph wind: about 3 hours). | Take KI now if in the plume path; close vents; bring stock animals in; shelter. |
| **Day 1** | The plume passes (6 to 24 hours); fallout dose rate at the compound 0.02 to 0.3 Sv/h at H+1, decaying slower than weapons fallout because the release continues and long-lived isotopes dominate (d). Milk and garden contamination begin. | Shelter 1 to 2 days (a house basement PF 10 is enough at these levels). The existing bunker is overkill but works. |
| **Week 1** | The keep-out zone is mapped; roadblocks; milk and produce bans in the 50-mile zone; I-131 in milk (half-life 8 days: gone in about 2 months). Refugees from the zone settle nearby. The grid in the rest of the region is mostly fine, minus the plant's output (brownouts possible if the region's supply is thin). | Dose accrues outside; chores budgeted; livestock fed stored feed, **no pasture, no fresh milk**; the garden washed. |
| **Month 1** | A restricted strip (a "plume stripe") remains; Cs-137 and Sr-90 in soil. Rest of the world functions: stores open (with contamination checks). Insurance and government relocation offers. | The compound is in or out. If in: wildfood and fish are `hot` for years (existing `wildfood hot` flag with a longer window), soil decontamination (topsoil scraping, deep plowing, potassium and lime) is a project. |
| **Month 3** | Grid and stores normal outside the zone; the stripe has checkpoints and a permit system; protesters and lawyers. | The player may be eligible for buyout or must stay; neighbors leave; land values crash in the stripe (land sales hook). |
| **Month 6** | Public fear and a regional recession; farmers outside the stripe lose markets for "region of origin" food. Cleanup begins. | A new economy: contract decontamination jobs, relocation, selling land. |
| **Year 1** | Cs-137 half-life 30 years; Sr-90 29 years; zones reopen in stages by dose. Cancer statistics begin to matter. | The player's long-term dose is on the report card. |
| **Year 2+** | The stripe is partly open, partly permanent. | A farm in the stripe grows only certain crops; a farm outside it sells the clean label. |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks: this is a **local** event, so tracks apply to a zone factor `zone` (0 inside the keep-out zone, 0.4 in the contaminated margin, 1.0 outside): `grid` modest (the plant's output), `fuel` and `stores` ripple (panic buying 1 to 2 weeks), `deliveries` stop into the zone (checkpoints), `medical` strained by evacuees, `law` fine (extra checkpoints), `phone` and `banks` normal. Prices: local food prices drop (no buyers for contaminated milk) and clean food prices rise (x1.2); KI and dosimeters spike x5 to x10 in the first week; land in the stripe crashes 50 to 90%; land outside rises as refugees arrive. Shops: open, checking; contamination certificates required for produce. Barter: KI, meters, water filters, clean feed, decontamination labor. Neighbors: evacuees and **settlers** arrive from the zone (existing refugee settlers hook); angry and scared; some stay; rumors. Raiders: low overall; **looters in evacuated homes** (the player may salvage) and scavengers; no collapse of law. Health: acute dose only if caught outside; thyroid uptake without KI; later cancer risk; mental stress; Cs-137 ingestion via wild game and mushrooms (boar, venison) is the long pathway (Fukushima and Germany's wild boar data, c). Food and water: milk, leafy greens, pasture-fed meat in the first 2 months; mushrooms, game, fish for years; deep covered wells safe; open cisterns and ponds contaminated.

## 5. What fails, what protects, the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| People outdoors in the plume | Dose | Shelter in a basement for 24 to 48 h; vent closed; KI within hours |
| Milk, produce, pasture | Contaminated | Stored feed, covered storage, garden washed, deep wells, cover crops, plowing |
| Livestock | Uptake via pasture | Barn feeding for 60 days; stored hay from before |
| Wildfood | `hot` for years | Do not eat boar, mushrooms, fish; farm food instead |
| Land value | Crashes in the stripe | Distance; insurance (rare); relocation |
| Electronics and vehicles | Unharmed | (no EMP) |

**Wealth principle.** Money buys information and distance: a dosimeter and a radio in advance (to see the plume), KI on the shelf, a stored-feed barn, a covered cistern, a deep well, and a second property or the capacity to leave and come back; and afterwards, decontamination work (topsoil removal, deep plowing) and legal weight. The poor compound has no meter and learns the plume by the neighbors' sickness; it relies on its basement, its cellar and the hand-washed garden; it cannot afford to leave land worth nothing, and so it stays and eats a bit of Cs-137 for decades. The wealthy escape; the poor are the settlers and the cleanup crews.

## 6. Regional variation

| Region | Effect |
|---|---|
| Rust Belt edge | Beaver Valley and Perry are in the region; high density: a large evacuation; refugees flood the farm roads; severe if wind is east to Pittsburgh. |
| Upper Midwest, North Woods | Lakes and cold: plumes drift over water; dairy and cheese economy hit by milk bans; Palisades, Point Beach, Prairie Island are close. |
| New England | Seabrook, Millstone: many people; deep forests hold Cs-137 for decades; dairy and maple. |
| Appalachia | Many plants; hollows trap plumes and wildfood hot for years (hunting culture); wind variable. |
| Ozarks | Callaway and Arkansas Nuclear One; karst springs carry contamination quickly; hunting culture. |
| Plains | Cooper and Wolf Creek; wind carries far over flat open land; wheat and cattle hit by the 50-mile zone. |
| Hill Country | South Texas Project is far; Comanche Peak is near Dallas to the north; low density; hot and dry. |
| Desert | Palo Verde: huge plant, low density, dry climate; desert soil holds Cs-137 on the surface; water is from deep wells. |
| PNW | Columbia Generating Station and Hanford (legacy tanks): the Columbia River and its salmon and irrigation are the pathway; rain washes out plumes fast. |
| Mountain West | No commercial plant in the region (odds x0.3), but wind from Hanford or the INL can reach; or via a far-away variant with a delayed light dose. |

Use odds (d): Rust Belt 1.3, Upper Midwest 1.2, North Woods 0.9, New England 1.2, Appalachia 1.4, Ozarks 0.9, Plains 0.8, Hill Country 0.8, Desert 0.6, PNW 0.7, Mountain West 0.3.

## 7. What the player sees and hears

Radio: T-1: "The plant declares an alert after a loss of offsite power." Hit: "A general emergency has been declared at the plant; residents within 10 miles should evacuate; others stay tuned." H+3: "Winds are carrying the release to the northeast toward counties X and Y." Day 1: "Milk from the following dairies must be discarded; keep pets and livestock indoors." Week 1: "KI available at the fire hall." Week 3: "The state has mapped a restricted zone; roadblocks in effect." Month 3: "Farm products from the restricted counties will not be sold." Day cards and a **map overlay** (the keep-out stripe and the dose contours). Meter ticks (a text rate: "0.18 R/h"). Comms degrade only if the plume is part of a bigger event; in a standalone meltdown the phones and TV work and carry both truth and panic.

## 8. Player decisions and strategies

Stay or leave (and when); where to shelter; take KI (a timing decision: too late is useless); bring livestock in and feed stored hay; decontaminate; sell the milk or dump it; accept a buyout; take settlers; hire out for decontamination; use contaminated land for non-food crops (hay for fuel, flax, willow for biomass); eat clean; save a clean seed bank; decide how to measure (buy a dosimeter).

## 9. What makes it fun and not just punishing

It is the **map** scenario: the plume drawn on a map, the dose contours, the argument "are we in or out?". The player meets decisions with real information (a meter, a radio), not despair. The world around the stripe stays functional, so the player can trade, relocate, and build a new compound, or earn money cleaning. The moral choices (settlers, milk, clean label) are rich. It also provides a milder nuclear scenario for players not ready for full war.

## 10. Suggested parameters and the hook seam

Use the existing `radiation.ts`, `nuclear.falloutDay`, `doseBetween`, `wildfood` hot flag, `refugees` and `settlers` hooks with a variant dose curve. Do **not** reuse the weapons `R1 t^-1.2` as is: reactor releases are slower to arrive, longer, with a large long-lived share.

| Variant | weight | R1 at H+1 (Sv/h) | Arrive (h) | Decay exponent | Hot windows (wildfood / milk / garden, days) | Zone |
|---|---|---|---|---|---|---|
| meltdown_regional (new) | 3 | 0.15 (inside plume), 0 outside | 4 to 12 by distance | -0.7 until day 10, then -1.0 | 365 / 60 / 120 | a stripe 10 to 30 miles by 40 to 60 miles |
| meltdown_pair (new; two plants, e.g. after `grid_down`) | 1 | 0.25 | 3 to 10 | -0.7 | 730 / 90 / 180 | a wider stripe |
| dirty_bomb (new) | 2 | 0.02 (small, a few blocks), city-only | 0 | -0.5 | 90 / 14 / 30 | the nearest town, closed |
| spent_pool_fire (new; from long grid-down) | 1 | 0.4 | 12 to 48 | -0.5 | 1,825 / 120 / 365 | large |

Tracks use a `zone` multiplier (above). Global curves are mild: `stores C(2,5,.7,[14,60])`, `deliveries C(2,8,.7,[14,60])`, `medical C(1,5,.75,[30,120])`, everything else 0.9+ outside the zone. Fate odds (d): `[0.55, 0.35, 0.10]` outside, `[0.1, 0.4, 0.5]` inside the keep-out.

Hook seam:
- `onWarning`: site emergency lines; KI distribution; wind direction roll; an alert siren.
- `onHit`: roll wind and plume geometry from region plant list; compute `zone` per parcel from distance and angle; set `fx.plume`; mark map overlays; issue evacuation orders.
- `daily`: dose accrual via the variant curve; milk and produce bans; ingestion pathway risk for the garden, livestock, wildfood; settlers and refugees from the zone; contamination decay (Cs-137 effectively persistent; the sim uses the hot windows).
- `encounterWeights`: `refugees` x2 first 14 days; `looter` for abandoned houses x1.2; `inspector` encounter (state monitors) +.
- `priceMods`: KI, meters x5 to x10; local food down; clean food up; land in the stripe down.
- `medical`: dose bands, thyroid risk (KI), cancer risk, stress.
- `radioBulletins`: list above.
- `buildingDamage`: none; a **decontamination** job (the compound's soil or roof) is a build project.
- `oasisWeights`: only the contaminated tracks; most of the world contrasts as normal.

## 11. Chaining possibilities

- **Upstream**: `grid_down` (long, fate `never`: spent pools boil dry) 5 to 10% after 90 to 365 days (the dominant realistic route); `solar_flare` or `emp` (transformer loss); `nuclear` (a plant is hit); `cyberattack` (a control system); a quake (see the proposals).
- **Downstream**: `financial` (a regional recession and the insurance crisis) 20% after 60 to 180 days; refugees feeding `lawless` locally; `drought` (contaminated water use).
- **Combine** with weather: rain increases deposition (the existing wet roughness hook), snow melts later release Cs.
