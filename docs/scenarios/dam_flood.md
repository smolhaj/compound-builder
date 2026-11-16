# Scenario: dam_flood (dam failure and the great flood)

Status: design only, no code. New kind proposed by `docs/DISASTER_TEETH.md` section 4 item 4 and WP6. Conventions, the shared structure-damage model and the confidence tags are in [README.md](README.md).

One line: **a local catastrophe inside a working country.** The valley goes under in minutes or over days, the compound is either on the right bench or it is not, and the outside world is fine and will come, slowly. This inverts the usual oasis contrast: here the player is the disaster zone and the world beyond the ridge is the oasis.

## 1. Real-world basis and analogs

| Event | Figures | Use |
|---|---|---|
| Johnstown (South Fork Dam), May 31, 1889, Pennsylvania | 2,209 dead; wave about 36-40 ft; reached the town about an hour after the breach; wreckage jammed at the stone bridge and caught fire; typhoid followed; earlier leaks and "cry wolf" scares had dulled warnings (commonly cited) | `rust_belt` analog; debris jam and fire |
| Mill River dam, May 16, 1874, Massachusetts | 139 dead; a rider (Collins Graves) warned the mill villages ahead of the wave (commonly cited) | `new_england`; the messenger on the road |
| St. Francis Dam, Mar 12, 1928, California | Failed at 11:57 p.m., 400+ dead (about 431); muddy leaks seen the day before; the designer inspected and passed it (commonly cited) | Seepage and muddy water are the warning signs |
| Teton Dam, Jun 5, 1976, Idaho | Leak first seen Jun 3, muddy flow that morning, failure about 11:57 a.m.; 11 dead, about 13,000 cattle lost, thousands homeless; first fill of a new earth dam (commonly cited) | `mountain_west` analog |
| Banqiao and Shimantan, Aug 1975, China | 62 dams failed under Typhoon Nina; about 26,000 drowned directly and a far larger number (estimates 85,000 to 230,000) died of famine and disease after (commonly cited) | Cascade of dams; deaths from aftermath |
| Buffalo Creek, Feb 26, 1972, West Virginia | A coal-slurry impoundment failed; 125 dead, 4,000 homeless in 16 hollow communities (commonly cited) | `appalachia` analog; mud, not water |
| Great Mississippi Flood, 1927 | About 27,000 square miles under water, about 700,000 displaced, officially 246 dead (probably far more); Black sharecroppers held in camps under armed guard; Cairo-style levee dynamiting to spare cities (commonly cited) | Slow rise variant; the camps as a social hazard |
| Taum Sauk reservoir, Dec 14, 2005, Missouri | A pumped-storage reservoir failed, 1.3 billion gallons in minutes, scoured Johnson's Shut-Ins State Park, severely injured a family in a park residence, no deaths (commonly cited) | `ozarks` analog; a dam on a ridge |
| Spencer Dam, Nebraska, Mar 2019 | Failed in the bomb-cyclone flood with ice; killed one man (the operator) (commonly cited) | `plains` analog |
| Oroville spillway, Feb 2017 | About 188,000 evacuated; no deaths; the emergency spillway began to erode (commonly cited) | The near miss: evacuation without a hit |
| Edenville and Sanford, Michigan, May 2020 | Two dams failed after heavy rain; about 10,000 evacuated; Midland flooded (commonly cited) | `upper_midwest` analog |
| Derna, Libya, Sep 2023 | Two dams failed in Storm Daniel; several thousand dead and thousands missing (estimates about 5,900 to over 11,000) (commonly cited) | Uncontrolled, neglected dams in a storm |
| Hurricane Helene, Sep 2024, western North Carolina and east Tennessee | Over 200 dead region-wide, rainfall of about 20-30 inches on the ridges, creeks and rivers at record stage, roads and I-40 cut for weeks to months, Asheville's water out for weeks, Spruce Pine's quartz mines shut (commonly cited) | `appalachia` analog; no dam needed |
| Guadalupe River, Jul 4, 2025, Texas Hill Country | River rose about 26 ft in under an hour at night, 130+ dead, a girls' camp swept; a gauge failed (commonly cited) | `hill_country` analog; the one-hour flood |
| National Inventory of Dams | About 92,000 dams, over 15,000 rated high-hazard potential; the ASCE report card grades dams C- or D+ and notes a large share are over 50 years old (commonly cited) | Why this is plausible |
| Flood insurance | Homeowners policies exclude flood; the National Flood Insurance Program covers up to $250,000 on the structure, with a 30-day wait (commonly cited) | `insuranceClaim` gate |

Not re-fetched this session (web access was limited); see the README note.

## 2. Warning signs and how the player notices

Real dam failures often have signs. The game gives a **long, wet build-up and a short, certain last day**. Suggested `warn: [3, 30]`; the last sign is a siren and a call from the county sheriff.

| Sign | Real basis | What the player sees |
|---|---|---|
| Weeks of rain or a record snowpack | Banqiao, Helene, Michigan 2020, Oroville | Radio: "reservoir at 98% of the spillway crest", river gauge in feet |
| Reservoir above normal and release warnings | Oroville's spill releases | News: "county asks residents below the dam to know their evacuation route" |
| Seepage, muddy leaks, sinkholes, boils on the downstream face | Teton and St. Francis: muddy water a day before | A new **muddy seep** appears on the dam in the upstream view; a neighbor reports it. Optional "go look" action |
| An inspection report | NID condition ratings | Day card: "State inspectors rate the dam 'poor'. Repairs are budgeted for next year." |
| Sirens and the Emergency Action Plan | Required for high-hazard dams; inundation maps list arrival times | The sheriff's call: "if the siren sounds, you have about 40 minutes" |
| The messenger | Mill River 1874; the Teton residents' phone calls | A rider or a neighbor's truck on the county road |
| Past false alarms | Johnstown's earlier scares | Two false alerts before the real one, in the Cozy-to-Standard setting. Reduces evacuation compliance (a real effect) |

Notice mechanism: a dedicated **river gauge** read-out (the compound's creek or river level in feet) on the day card, radio gauge reports, and a `terrainFx` flood-line overlay showing the player's own inundation estimate, which gets sharper as the warning proceeds. An *upstream scout* action (a family member drives up to look at the dam) costs hours and may spot the seep one day early.

## 3. Phase-by-phase timeline

Variant `dam_breach` (a reservoir above the compound fails; the compound is in the valley below). Wave arrival time is set by distance: `arrival = distanceMi / 12 mph` (a breach wave moves about 10-30 mph and slows with distance).

| Phase | In the world | At the compound |
|---|---|---|
| Warning, last day | Siren, reverse-911, deputies go door to door. Highway patrol closes the road below the dam | The player decides: pack and go to the high bench, or defend. Livestock: cattle out or not. A **race** to move vehicles, documents, the stock and the family |
| Hit moment | A wall of water, then a brown, debris-laden surge. In a narrow canyon the front is 20-40 ft; in a wide valley 5-12 ft | Everything in the inundation footprint rolls damage (section 5). Low buildings and the moat overtop. People still below get a **swept** roll (depth x velocity) |
| First hour | The water peaks within 30-90 minutes of arrival near the dam and later downstream, then holds, then drops over hours. Gas, power and phone lines in the valley cut | Reach the roof or high ground. Helicopter rescue only if the player has a radio and a roof (rescues from roofs were the norm at Helene). Cold and wet: hypothermia (`cold.ts`) |
| Day 1 | Water recedes from the bench; mud, 1-4 ft in low rooms; debris jams; a fire at a jam is possible (Johnstown); roads under 2-10 ft of silt or gone | The family counts losses. Wet structures must be **mucked out within 48 hours** to avoid mold (CDC: mold grows in 24-48 hours) |
| Week 1 | FEMA, Guard and county crews arrive within days, with water, MREs and tarps; helicopter drops where roads are out. The valley road is washed out for a season in the worst reaches | Tear-out of drywall, insulation, flooring in flooded buildings; shock-chlorinate and test the well (EPA/CDC guidance: do not drink from a flooded well until tested). Septic is saturated, so it backs up |
| Month 1 | Power back in 1-3 weeks in the valley. Phone and cell 1-3 weeks. Bridges: temporary (Bailey bridge, ford) in 3-8 weeks | Mold remediation or demolition. The compound can be **a shelter** for flooded neighbors, or turn them away |
| Month 3 | Debris cleared; the river channel moved; new gravel bars and cut banks. Disease risk peaks (tetanus, gastro, Vibrio near brackish) | Fields silted, soil tests, **new fertile deposit** on bottoms in year 2 (a long-run boon, as in Nile and Mississippi valleys) |
| Month 6 | The permanent road is rebuilt in the better cases; the poorer counties wait | The rebuild or relocate decision |
| Year 1 | Many families in the valley sell. Insurance denials for non-NFIP households | Distress land sales |
| Year 2+ | A larger levee, or a lower, safer valley with fewer people | The compound is a bench-top survivor with new neighbors |

Variant `levee_flood` (great river, slow rise): the warning is the same but the rise takes 2 to 10 days with a crest forecast; the water stays 2 to 6 weeks (1927: months in places). Variant `watershed_cascade` (Banqiao and Derna style: several dams in sequence in a storm) multiplies depth by 1.4 and extends the road outage to 120 days.

## 4. Effects by track and the rest

The tracks that matter here are **local**: the outside world holds.

| Variant (weight) | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|
| `dam_breach` (3) | C(0,0,0.1,[7,30],14) | C(0,1,0.3,[7,30],14) | C(0,2,0.3,[7,30],14) | C(0,0,0,[21,120],45) | C(0,1,0.4,[7,30],21) | C(1,6,0.6,[7,21],14) | C(0,0,0.1,[5,21],10) | C(0,1,0.5,[5,21],10) |
| `levee_flood` (2) | C(2,3,0.2,[14,45],21) | C(2,3,0.4,[14,45],21) | C(3,5,0.4,[14,45],21) | C(2,3,0.1,[30,90],30) | C(3,4,0.5,[14,45],21) | C(3,6,0.6,[14,30],14) | C(2,3,0.3,[10,30],14) | C(2,3,0.5,[10,30],14) |
| `watershed_cascade` (1) | C(0,0,0,[14,60],30) | C(0,1,0.2,[14,60],30) | C(0,2,0.2,[14,60],30) | C(0,0,0,[45,180],60) | C(0,1,0.3,[14,60],30) | C(1,8,0.5,[14,40],21) | C(0,0,0.05,[7,30],14) | C(0,1,0.4,[7,30],14) |

Fate odds `[0.80, 0.17, 0.03]`: the valley comes back. The big teeth are not the tracks; they are the **loss of what is below the water line and the loss of the road**.

- **Prices and shops:** `priceMods`: pumps, dehumidifiers, generators, bleach, drywall and tarps x2.0 week 1; local food x1.2; building materials x1.3 for 8 weeks (demand surge). A Corps-of-Engineers pallet drop (free water, MREs) is a recurring beneficial event, and a **price-gouging** event the player can report or exploit.
- **Neighbors:** those in the bottoms lose houses, vehicles and stock; their `hardship` rises sharply; the high-bench player is asked to host. Hosting gives bonds, extra labor for the mud-out, and a larger daily draw on food and water. Some neighbors drowned or are missing (event chain: a search). Cattle drowned, then dead cattle in the water supply (carcass disposal task).
- **Raiders and the encounter mix:** low. `law` holds at about 0.6, the Guard patrols. `encounterWeights`: stranded people, volunteers with boats (a "Cajun Navy" visitor), insurance adjusters (Standard: wait 10-30 days), looters x0.6 targeting empty evacuated homes (a real, small effect), contractors-for-hire and **scammers** (a price-and-quality gamble in repair help; roofing and mold scams are common after floods), FEMA inspectors, relatives. No gang growth unless chained.
- **Medical and health:** hypothermia in the cold-water hit; **wound infections** in cut feet and hands during muck-out (tetanus; the family's shot status matters); gastro from contaminated water; mold respiratory effects after 1-2 weeks; mental load from loss. Floodwater is sewage, fuel and pesticide. A 10% chance per person per week of a `fever` infection without clean water and gloves/boots.
- **Food and water:** a flooded **well** is unusable until shock-chlorinated (a household bleach recipe, 24 hours) and lab-tested; hand wells with a sealed cap fare better than open ones; a drilled well with a raised, watertight cap is protected. Springs on the bench stay clean. **Floodwater-touched garden produce must be discarded** (FDA guidance), and topsoil may be lead- or fuel-contaminated. Stored food in a root cellar below the flood line is spoiled; **stores below the line are lost** (a share of the pantry by shelf height). Livestock: drowned, or stranded and in need of feed; hay stored low is ruined and hay stored high becomes the most valuable thing in the county. Fish and ducks come with flood (a small bonus).

## 5. Structure damage and what protects

Hazard input: **depth above the structure's floor `d` (ft) and velocity class** (`still`, `moving`, `torrent`). Compute `d = waterStage(x, z) - floorElevation`, using the parcel terrain height (`terrainFx.floodCandidates` already lists low structures). Depth and velocity both matter; a rule of thumb (design estimate based on FEMA and Australian flood-hazard guidance): *depth x velocity* above about 7 ft^2/s collapses light frame houses; above about 3 ft^2/s it sweeps vehicles and people.

| Condition | Result |
|---|---|
| d < 0 (dry floor) | State 0; yard and moat flooded, fence lines and wall footings scoured |
| 0 < d <= 1 ft | State 1: wet floors, mud, mold. Repair: tear-out of the bottom 2 ft, 1-3 person-days, $200-500 of drywall and insulation per room |
| 1 < d <= 4 ft | State 2 (as `knockBack` to the interior or "walls" stage): drywall, wiring, floors, appliances, furniture and the pantry's low shelves lost. Repair 30-50% of the build cost and 2-5 weeks by hand; **mold** if not dried in 48 hours (state 2 becomes 3 after 10 days wet) |
| d > 4 ft, or moving water | State 2 or 3: walls and foundations damaged; unanchored houses float off their footings (the Johnstown pattern), then state 3 |
| torrent (canyon reach near the dam) | State 3 for anything in the line; only buildings on high ground survive |

**What protects:** location first (elevation above the creek: the single largest factor), a **raised foundation** (a pad 2-4 ft above grade, a post-and-beam pier foundation with breakaway skirting) is effectively x0.3 on state; masonry or concrete **flow-through** ground floors (flood vents); anchoring to the footing; **flood-proof utilities up high** (pump controller, electrical panel, water heater 3 ft above flood level); **well cap** sealed and raised; **a cellar is a disadvantage** (roots cellar and bunker fill: bunkers and cellars take the worst: a basement fills, a buried bunker's hatch leaks, and a flooded bunker is a hazard), unless it has a sump and a check valve; **drainage and berms** (existing `drainage.ts`) help only for small floods. The moat overtops at a stage above its design freeboard. Do not let any structure below the Flood Line be the *only* food store.

Repair and wealth: pumping out, mucking out and gutting is **time-critical in the first 48 hours** and labor-heavy; a rich family rents dumpsters, dehumidifiers and generators and hires crews (lead time 4-10 days in the valley, x1.3 cost) and finishes in a month; a poor family does it by hand over 3-6 weeks, risking mold and illness, but loses less of its own money. Insurance pays only with an NFIP or private flood policy (a decision with an annual cost, $700-$2,000), 30-day waiting period.

Terrain after: the **channel can move** and a bench becomes an island; sediment and debris deposition on the road; a **landslide** in saturated slopes on the following days (chain to the quake doc's slide roll).

## 6. Regional variation

| Region | Likely variant and analog | Notes |
|---|---|---|
| `appalachia` | `watershed_cascade` (Helene) and `dam_breach` (Buffalo Creek) | Hollow creeks rise 10-25 ft in hours; roads and bridges are the first victims; deliveries out for weeks; communities cut off; no cell |
| `rust_belt` | `dam_breach` (Johnstown) | Old dams and valley mills; debris jams; high-hazard dams near towns |
| `mountain_west` | `dam_breach` (Teton) or snowmelt `levee_flood`, plus landslide-dam release (Hebgen) | Early-summer floods; cold water; remote roads out |
| `pnw` | `levee_flood` (atmospheric river, Nov 2021 floods) | Flood in winter, landslides on the slopes, long road outages |
| `ozarks` | `dam_breach` (Taum Sauk), White River chain of lakes | Karst makes wells vulnerable to surface water |
| `hill_country` | flash version: `dam_breach` with 1-hour onset (Guadalupe 2025) | Night flood, camps, low-water crossings. Warning is hours |
| `plains` | `levee_flood` (Missouri River 2011, Nebraska 2019) | Ice jams, slow weeks-long stand, whole county roads under water |
| `upper_midwest`, `north_woods` | `dam_breach` (Edenville, Duluth 2012) | Ice and spring melt |
| `new_england` | `watershed_cascade` (Vermont Irene 2011, July 2023) | Covered-bridge and mill town analogs |
| `desert` | A flash form only, monsoon (existing `flash_flood`), rare dam failure | Low odds |

Odds suggestions: `appalachia` 2.0, `rust_belt` 1.6, `ozarks` 1.5, `hill_country` 1.5, `new_england` 1.3, `mountain_west` 1.2, `pnw` 1.2, `plains` 1.0, `upper_midwest` 1.0, `north_woods` 0.8, `desert` 0.3. Parcel-level rule: if the generated parcel has no creek or river (`creekOdds`), the kind should be skipped or changed to `levee_flood` with a low stage.

## 7. What the player sees and hears

- **Sky:** heavy cloud and rain through the warning; pale, washed light after; a brown river. No haze.
- **Terrain (`collapseLook` and the terrain renderer):** a water plane at the stage height that rises over minutes; a **mud line** on walls after (a decal at the crest height); silted yard, uprooted trees, a debris windrow on fences; a gravel bar; a washed-out road with the culvert hanging; the moat brown and full.
- **Crowds:** boats on the road (volunteers), people on roofs, a helicopter.
- **UI:** a river gauge chip showing feet above flood stage and the arrival timer ("wave in 38 min"). A crest forecast (levee variant). Text only.
- **Radio:** warnings: "the siren at the Lower Reservoir has sounded", "Highway 31 closed at the creek", "Red Cross shelter at the high school: 140 people", "boil-water advisory", "the road may be out three months". Rumor lines (a second dam is cracking) with some false.
- **Day card:** "The water reached the porch step and stopped. The garden is under four feet of mud."

## 8. Player decisions and strategies

- **Before:** site selection (build above the flood line; every building footprint's elevation relative to the creek is shown), raise the well cap, put the pump controller up, **flood insurance** or not, a boat or raft, store food and hay high, a second route out, keep livestock near the high pasture, a go-bag on the bench, a written plan with a muster point, a radio.
- **During the warning:** whether to believe a siren after two false ones (the Johnstown problem); whether to sacrifice a low building's contents to save the high one's; whether to move cattle.
- **At the hit:** leave early or defend: sandbag and berm only for small floods. Stay on the roof if cut off. The default winning move is **the high ground**.
- **After:** triage between mud-out speed, hosting neighbors, helping neighbors with their muck-out (bonds), and the repair order (well first, the stove and sleeping room second).
- **Rich vs poor:** the rich own the high ground, buy flood insurance, hire crews, and still lose low assets; the poor are in the bottoms (cheap land is in the floodplain, the most real thing in the scenario), uninsured, hand-repairing. The poor family that **chose the cheap bench lot above the creek** is just as safe as the rich one and cheaper to run. The design makes land price and elevation an actual trade-off in the build phase: bottom land is flat, close to water and cheaper.

## 9. What makes it fun

- **A clear skill**: the player can read the terrain and wins by siting decisions made in peacetime, and the flood visualizes it.
- **A real race and a good scene**: the last day is a packing-and-decision puzzle; the cutscene of the surge is spectacular and not a raid.
- **A reversal of the genre**: help comes, and the player gets to be a host, with moral choices about neighbors (the 1927 camps are a real moral shadow).
- **A silver lining**: rich silt for next year's garden, fish, stranded driftwood and logs for free, a new bench for a new building.
- **Bounded**: unlike a decade-long collapse, the player gets to rebuild and see the repair work through.

## 10. Parameters and hook mapping

### Numbers

- `warn: [3, 30]` days. Last-day siren lead time (the Emergency Action Plan): arrival minutes = `distanceMi / 12 * 60` (Hill Country override: 30-90 minutes). Hardcore halves.
- Stage heights (at the creek bed relative to normal): `dam_breach` 14-40 ft at the first reach, decaying `x exp(-miles / 9)`; `levee_flood` 6-20 ft above flood stage, held 14-45 days; `watershed_cascade` +40%.
- Compliance: each false alarm lowers the player's siren reaction by one hour of scramble (a "trust" counter in `fx`).
- Family swept chance: 0 on the bench, 8% in a state-2 structure when not evacuated, 30% in a state-3 structure; a person on the roof 4%.
- Muck-out clock: 48 hours before mold; mold repair doubles the state-2 cost.
- Well: flooded = unusable until shock-chlorinated (1 day) and tested (2-5 days when the roads are up, otherwise a kit); contaminated flag clears at day 7 if done, day 30 if not (people sicken meanwhile).
- Road outage by reach: 10-120 days (`roadFx` washout with `RoadBridgeState.down` and a rebuild due date; temporary ford 3-8 weeks).
- Insurance: NFIP-like flood rider $900/yr, 30-day wait, pays structure up to $250,000 less 10% deductible; contents extra.
- Aid: first supply drop day 2-5, a FEMA payment of $5,000-$30,000 in week 3-8 for eligible households (Standard).

### Hook seam (`src/sim/disasters/dam_flood.ts`)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Pumps and drywall x2, local food x1.2, gouging events |
| Supply | `onHit`, `daily` | Pantry below the line spoiled, well contamination flag, garden discard, hay and livestock loss |
| Raiders | `encounterWeights` | Rescuers, scammers, adjusters, looters x0.6, no gangs |
| NPC | `onHit`, `daily` | Neighbors drowned or displaced, hosting requests, carcass task |
| Sky | `look` | Rain, brown water plane, mud line decal, debris |
| Infra | `onHit` + `roadFx` | Road and bridge out by reach, utility lines, septic backup |
| Bldg | `buildingDamage` | Depth x velocity roll via `structureDamage.ts`, mold clock, cellars and bunkers flood |
| Med | `medical` | Hypothermia, wound infection, gastro, mold |
| UI | `onWarning`, `radioBulletins` | Gauge chip, sirens, shelter and road bulletins |
| Oasis | `oasisWeights` | **Inverted**: contrast = the outside world is fine; add a "help is coming" line instead of collapse; weight `deliveries` only |

Ten of ten columns.

## 11. Chaining

- From `mega_quake` (shaken dam, landslide-dam failure): p 0.12.
- From `drought`/`wildfire` (burn scar debris flows in the next rain; Montecito Jan 2018: 23 dead after a half inch of rain in minutes): wildfire -> `dam_flood` flash variant, p 0.2, after [60, 300] days.
- Into: `financial` (uninsured losses, p 0.08), `pandemic`-style water disease tail (p 0.1), `lawless` only if fate is `never` (rare) and a **second flood** in the same watershed within 2 years (levee scoured, p 0.1).
- Compounds: heavy rain `weatherThreats` flood and `hurricane_remnants` should be disabled during the warning (the kind supplies the weather) to avoid double events.
