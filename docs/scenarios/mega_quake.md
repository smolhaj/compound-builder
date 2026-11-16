# Scenario: mega_quake (the great earthquake)

Status: design only, no code. New kind proposed by `docs/DISASTER_TEETH.md` section 4 item 1 and WP6. Conventions, the shared structure-damage model and the source-confidence tags are in [README.md](README.md).

One line: **no warning worth the name, three to five minutes of shaking, and then a world that is not dark but cut apart.** Power may return in weeks. The roads, bridges, pipelines and water mains are what stay broken, so this is a deliveries-and-lifelines disaster, not a grid-down re-skin.

## 1. Real-world basis and analogs

| Event | Figures | Use in the game |
|---|---|---|
| Cascadia subduction zone, Jan 26, 1700 (last full-margin rupture) | About M9, tsunami recorded in Japan (the "orphan tsunami"); average recurrence on the order of 500 years, 19 or so full or partial ruptures in 10,000 years; commonly cited 10-15% chance of a full rupture in 50 years, higher for the southern segment (commonly cited, Goldfinger/USGS) | `pnw` variant `cascadia` |
| Tohoku, Mar 11, 2011, M9.0 | Shaking about 6 minutes; about 19,700 dead or missing, nearly all by tsunami; a M7.3 foreshock 51 hours before; M7.9, 7.7, 7.6 aftershocks within 40 minutes (verified, JMA/USGS) | The shape of an M9: long shaking, big aftershocks in hour one, foreshock as the only warning |
| FEMA / Oregon Resilience Plan (2013) Cascadia scenario | About 13,000 deaths and 27,000 injured region-wide, about 1 million displaced, tsunami on the coast in 15-30 minutes; valley zone (I-5 corridor) moderate damage; restoration of power in the valley measured in 1-3 months, water and sewer in months to a year or more, coast in years; bridges and Oregon's single fuel hub in Portland on liquefiable fill are the weak points (commonly cited; not re-fetched this session) | `deliveries` and `fuel` curves, bridge outages |
| Anchorage, Mar 27, 1964, M9.2 | 4+ minutes of shaking, 131 dead, Turnagain Heights slid into the inlet (landslide and liquefaction on a clay bluff) | Slope and clay-site hazard |
| Hebgen Lake, Aug 17, 1959, M7.3 (Montana, next to Yellowstone) | 28 dead; the Madison Canyon slide put about 80 million tons across a river and made Earthquake Lake; the lake rose behind it for weeks and the Corps cut a spillway (commonly cited, USGS) | Mountain West: landslide dam, then flooding (chain to `dam_flood`) |
| Borah Peak, Oct 28, 1983, M6.9 (Idaho) | Fault scarp up to 8 ft, 2 children killed in Challis by falling masonry; the stock of old brick fronts failed (commonly cited) | Unreinforced masonry kills first; Idaho and Utah are real quake country |
| Wasatch Front scenario (M7.0-7.3 Salt Lake segment) | Scenario studies give on the order of 2,000 deaths and tens of thousands of damaged buildings; roughly 1-in-7 odds of an M6.75+ in 50 years (commonly cited, Utah Seismic Safety Commission / WGUEP) | `mountain_west` variant `wasatch` |
| Loma Prieta 1989 M6.9 (63 dead) and Northridge 1994 M6.7 (57 dead) | Soft-story and cripple-wall houses slid off foundations; unbolted wood frames were the bulk of the loss; Northridge made a large share of homeowners lose coverage because earthquake is excluded from ordinary policies (verified in broad outline) | Foundation bolting and cripple-wall bracing are the cheap fix; insurance exclusion |
| Christchurch Feb 22, 2011, M6.3 | 185 dead, liquefaction put silt and sand in streets and houses, more than 10,000 aftershocks over the next years; a third of the CBD demolished (commonly cited) | Aftershocks that keep knocking half-built walls; soil matters more than magnitude |
| Kahramanmaras (Turkey and Syria), Feb 6, 2023 | M7.8 then M7.5 nine hours later; about 59,000 dead; thousands of new buildings failed because of poor construction and enforcement | A second large shock hours later; build quality dominates death toll |
| Haiti Jan 12, 2010, M7.0 | 100,000 to over 200,000 dead (estimates vary widely); cholera followed in October and killed about 10,000 over the next years | Disease after water systems fail |
| ShakeOut scenario (San Andreas M7.8) | About 1,800 dead, $213 billion, 1,600 fire ignitions, aqueduct crossings cut for months (commonly cited, USGS 2008) | Water is the long pole |
| New Madrid, Dec 16 1811, Jan 23 and Feb 7 1812 | Three shocks estimated M7.2-8.1, felt over about 1 million square miles, Reelfoot Lake formed, the Mississippi ran backward briefly at places, aftershocks for months (commonly cited) | `ozarks` / west `appalachia` variant |
| 1906 San Francisco | About 3,000 dead and about 80% of the city's destruction from the fires that followed, with the water mains broken (commonly cited) | Fire after quake |
| Haicheng (predicted, Feb 4, 1975) vs Tangshan (not predicted, Jul 28, 1976) | Haicheng evacuated on foreshocks and animal behavior and saved lives; Tangshan killed an official 242,000 (commonly cited); L'Aquila 2009: scientists convicted then cleared after a swarm | Foreshock signs are real but ambiguous: a false alarm is a design tool |
| Insurance | Standard US homeowners policies exclude earthquake and flood; earthquake cover is a separate policy with a deductible of about 10-25% (commonly cited) | `insuranceClaim` returns nothing without an earthquake rider |

Source note: all figures above come from memory of the cited agencies and standard reports. Outbound web access was restricted in this session, so none was re-fetched; each is tagged "commonly cited" or "verified in outline". Re-check before any number goes in a player-facing string.

## 2. Warning signs and how the player notices

Real earthquakes mostly give none; ShakeAlert gives 5 to 60 seconds. The game's collapse clock needs a warning window, so use it as a **swarm and slow-slip window** with honest ambiguity. Suggested `warn: [4, 30]` days (Hardcore x0.4, so 2-12).

| Sign | Real basis | What the player sees or reads |
|---|---|---|
| Foreshock swarm | Tohoku M7.3 two days before; L'Aquila swarm for months; Haicheng foreshocks | Day card: "a quiet rumble under the floor; the dog won't come in". Radio: "USGS reports 40 small quakes near the valley this week" |
| Episodic tremor and slip (Cascadia, roughly every 14 months) | Real, slow-slip events in the locked zone; do **not** predict the big one | News tile: "tremor and slip event under the coast; officials say it is routine". A **red herring** |
| Well water changes | Level change, turbidity and radon changes before some quakes (Kobe 1995 reports) (commonly cited) | Well gauge: level drops 3-5 ft overnight, water clouds. Also fires in a dry-year false alarm |
| Animal behavior | Haicheng reports; unreliable | Chickens roost at noon, cattle bunch at the gate. Flavor, not a mechanic |
| Official noise | The authorities say "cannot be predicted" | Radio: the county tests a siren and tells people to secure water heaters |
| False alarm | Swarms usually end | 1 in 3 warnings is a swarm that fades, which teaches the player nothing is certain and rewards cheap bolting early |

The player who spends the warning on the **cheap retrofit list** (bolt the sill, strap the tank, flexible gas and water connectors, move heavy items low, fill the cisterns, pack the go-bag, agree a meeting place) is the one who wins.

## 3. Phase-by-phase timeline

Variant `cascadia` (pnw epicentral band) unless stated. Distance band A = within 60 mi of the rupture or fault (shaking MMI VIII-IX), B = 60-250 mi (VI-VII), C = farther (V and below: felt, supply shock only).

| Phase | In the world | At the compound |
|---|---|---|
| Hit moment | 3-5 minutes of shaking (band A), 20-60 s (band C). Rolling, then violent. Dust, then silence, then car alarms and dogs. A time-of-day roll decides where each family member is | Everyone rolls: **dropped, covered and held** (little harm), or **running outside** (falling masonry, glass: injury odds). Away members (kids at school, adult in town) get a location roll. Structures roll damage (section 5). A cracked county road and a "who is where" panel |
| First hour | M6-7 aftershocks (the Omori tail, section 10). Gas smell, small fires in town, tsunami siren only on a coastal parcel. Cell towers on battery. 911 jammed | Rescue: neighbors trapped, family members to find. Shut off gas and water, check the well pump, stove, chimney. Fire watch. Go or stay decision for the evening |
| Day 1 | Roads cut at bridges, slides and cracked pavement; overpasses down in band A. Hospitals triage outdoors. Grid out region-wide; some substations rebuilt first | The family sleeps outside or in the sound structure (aftershocks). Cold and rain on the PNW parcels. Damage survey; tarp and shore up. Neighbors in old brick houses are the casualties |
| Week 1 | Helicopters and Guard in band A. Water mains broken: boil and bottled water. Fuel: pumps empty (the Portland fuel hub on soft fill in the Cascadia story). First convoys of aid reach the valley road, then the compound's county road if it is not cut | The surge begins: contractors, lumber and generators scarce and priced up. Aftershocks keep knocking half-built walls and loosened chimneys. First **kindness**: the first two weeks are mostly neighbors, not raiders (section 4) |
| Month 1 | Grid back in patches (bands B, C: weeks; band A: 1 to 3 months). Cell back in towns. Deliveries thin. Tent camps. Rebuilding permits relaxed, inspectors triage houses (green, yellow, red tags) | Repair queue. A red-tagged house is a no-go. Crews booked weeks out. Cisterns and wells: silt, sand, a new pump line |
| Month 3 | Banks and stores near normal in band C. Band A: ports and bridges still limited. Landslides in the first heavy rains on shaken slopes. Pandemic risk from water | Landslide and mud events on cut slopes. Winter if the quake was in autumn: heating becomes the limiter |
| Month 6 | The "second disaster" is economic: insurance denials, hardware prices, labor | The family either is rebuilt or is permanent camp-living |
| Year 1 | Bridges rebuilt, big aftershock anniversaries. Recovery fate **full** is common | Compound hardened for the next one, or not |
| Year 2+ | Population loss in band A. Cheap damaged land for sale (`land.ts`), neighbors leaving | Opportunity: buy neighbors' lots at distress prices; the quake as a land-grab chance |

## 4. Effects by track, prices, neighbors, raiders, health

Suggested curves, `C(at, fall, floor, back [min,max], ramp)`. Format as in `src/sim/disaster.ts`.

| Variant (weight) | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|
| `cascadia` (2 in `pnw`, 0.4 elsewhere in west) | C(0,0,0.05,[21,90],45) | C(0,1,0.05,[30,180],60) | C(0,3,0.1,[30,150],60) | C(0,0,0,[60,365],120) | C(0,1,0.2,[30,200],90) | C(1,10,0.3,[20,90],45) | C(0,0,0.05,[10,60],30) | C(0,1,0.1,[14,60],30) |
| `wasatch` (`mountain_west` 1.5) | C(0,0,0.1,[10,45],30) | C(0,1,0.1,[14,60],30) | C(0,2,0.2,[14,60],30) | C(0,0,0.05,[30,120],60) | C(0,1,0.3,[14,90],45) | C(1,8,0.4,[14,60],30) | C(0,0,0.1,[7,30],20) | C(0,1,0.2,[7,45],20) |
| `new_madrid` (`ozarks` 1.2, `appalachia` 0.4, `plains` 0.2) | C(0,0,0.1,[30,120],45) | C(0,2,0.05,[45,180],60) (pipelines cut, river traffic stopped) | C(0,3,0.15,[30,120],45) | C(0,0,0,[60,240],90) | C(0,1,0.2,[30,150],60) | C(1,10,0.35,[20,90],45) | C(0,0,0.05,[10,45],20) | C(0,1,0.1,[14,60],30) |
| `rift` (`desert` 0.7; Rio Grande rift, Sonora 1887 analog) and `east` (`new_england`, `rust_belt`, `appalachia` 0.2: M6-7 Charleston 1886 analog) | shorter: back [5,30] | back [7,40] | floor 0.4 | back [14,60] | floor 0.5 | floor 0.5 | back [3,14] | back [3,20] |

Fate odds suggested `[0.55, 0.35, 0.10]` (full, partial, never). A quake is a regional disaster: the nation survives and helps, which is what separates it from `grid_down`.

**Prices and shops.** `priceMods`: building materials (lumber, roofing, hardware, pump, cable, drilling) x1.4 week 1, x2.0 weeks 2-8, decaying to x1.2 by month 6 (demand surge, commonly 20-50% after big US disasters). Water, tarps, generators x2.5 week 1. Food x1.3. Barter: chainsaws, hand pumps, plywood, tarps, antibiotics and rope become top barter goods. Shops: hardware and farm-supply open first; grocery stores re-open on the stores curve; a "cash only, no cards" week.

**Neighbors.** The `neighborLife.hardship` input rises from the structure damage of their own houses, not just stores. Old farmhouses, brick, chimneys and mobile homes off their piers are the casualties (a neighbor-damage roll per home style). Rescue events: pulling a neighbor from a collapsed porch earns a bond; a neighbor with a broken leg and no doctor. Injured neighbors sleep in the player's sound outbuilding if asked.

**Raiders and the encounter mix.** Real disaster sociology (Quarantelli, Dynes, and Solnit's "A Paradise Built in Hell") finds an early surge of mutual aid and little looting. Katrina is the counterexample, where the breakdown came from delay and rumor. So: **weeks 0-2: `encounterWeights` strangers, neighbors-in-need, lost travelers and rescuers high, looters x0.4 and gangs x0.3**. From week 3, as `deliveries` stay below 0.3, looters x1.4 in band A, and gangs rise with `law` falling. Refugees x2 from the cities in band A. The tone shifts in week 3. A Hardcore multiplier (`raid` 1.3) applies after.

**Health.** `medical`: crush and laceration injuries at the hit (a hurt roll for the family); broken water mains plus cracked septic tanks give diarrheal illness from week 2 (Haiti cholera as the extreme; use a light roll unless a boil order is ignored). Dust and mold. Mental load: aftershock anxiety, a "sleep outside" comfort penalty for 2 to 6 weeks while aftershocks M5+ continue. Chimney and stove: **a cracked flue is a house-fire and CO risk**; inspect before lighting the stove (a daily check task).

**Food and water.** Wells: a shaken drilled well can cloud, silt up, change yield (Christchurch and Hebgen both saw level change), or have its casing or pump line sheared (damage state 2 on `well_drilled`). Hand wells survive best. Cisterns crack (concrete) or hold (poly tank on a gravel pad). Spring flow can increase or stop after a quake. Stores shelved with canned goods: shaken shelving spills and breaks glass jars in the pantry (a 10-30% loss of jarred stock unless shelves are lipped).

## 5. Structure damage and what protects

Use the shared model in the README. Input `intensity` is MMI class by distance band, plus site factors.

**Seismic resistance multiplier on the damage roll** (lower is better), by what the player built:

| Structure | Multiplier | Why (real) |
|---|---|---|
| Wood frame on a poured footing, sill bolted, plywood shear walls (build-quality tier 3) | 0.35 | The standard good result in Northridge and Loma Prieta retrofits |
| Timber-frame house | 0.5 | Flexible, heavy joints, ductile |
| Log house | 0.5 | Flexible, but heavy chimneys fall |
| Wood frame on piers or a crawlspace, unbolted (tier 1) | 1.3 | Slides off the foundation; the main Loma Prieta and Northridge failure |
| Cripple-wall (short stud wall) crawlspace, unbraced | 1.6 | The classic soft story |
| Shipping-container house welded on a slab | 0.6; on loose piers 1.1 | Rigid steel, but can tip off its supports |
| Stone house, adobe, rammed earth, unreinforced masonry | 2.2 | Haiti, Christchurch brick, Borah Peak masonry; adobe fails by wall collapse |
| Lodge's stone basement walkout | 1.2 | Retaining-wall failure on slopes |
| Steel-roofed pole barn | 0.7 | Light, but poles heave in saturated soil |
| Bunker (concrete, buried) | 0.2 structure, 1.0 for the door and vent | Buried boxes ride the motion; the risk is a jammed door, shattered pipe and flooding (damage to a hardened door tier is the faq) |
| Chimney (masonry) | 2.0 on its own roll | Fell in nearly every big quake, injuring people outside |
| Water heater / propane tank unstrapped | 2.5 | Fire and flood starts; tank straps are a $30 fix |

**Hazard before the multiplier** (chance to reach damage state >= 1): MMI VI 0.03, VII 0.10, VIII 0.30, IX 0.55. States: 0 sound, 1 minor, 2 major, 3 destroyed. The roll splits roughly 55% / 35% / 10% across states 1-3 at the base hazard, shifting toward 3 as the base rises.

**Site factors:** soft alluvial or a creek bottom with a high water table x2 (liquefaction: Christchurch, Anchorage); slope over 25% x1.5 plus a slide roll (the existing `terrainFx` slope candidates; Turnagain, Madison Canyon); a rock bench or ridge crown x0.8 (but topographic amplification on ridges x1.2 for tall light structures; keep out of the game unless cheap); a retaining wall (`retaining.ts`) fails at x1.4 if its drainage is poor.

**Half-built structures** are the soft spot: a frame up and not yet braced is state-2 at x1.8 (`knockBack` to the frame stage). This creates a real choice: **finish bracing before roofing**. Aftershocks re-roll the same.

**Aftershock re-rolls:** each strong aftershock day re-rolls at 0.35 of the mainshock hazard against structures already at state >= 1 (cracked and loosened) and against all unfinished stages (section 10).

**Repair, money and crews.** State 1: one hardware kit ($900) and 1-3 person-days by hand, or 1 crew-day. State 2: `knockBack` to the roof or frame stage; materials 30-60% of the blueprint, weeks by hand, 1-3 weeks with a crew. State 3: clear the wreck (2-5 person-days, or a rented skid steer) and rebuild from the footing. **Surge:** hired crews (the existing 4-person crew at $60/head/hr) have a lead time of 3 days x (1 + 8 x affected share of the county) and cost x1.3 for the first 60 days; paying a premium (x1.5) jumps the queue. **Wealth:** a rich family gets crews on the second day, buys a generator and shoring the same week, and rebuilds in a month; a $30,000 family does state-1 repairs by hand over a month, delays state-2, and lives in tents or an outbuilding for a season. Insurance: **earthquake is excluded from `insuranceClaim` unless the player bought a rider** (suggest $1,800/yr in the high-hazard regions, 15% deductible; the rider's price is a decision, and is dear in `pnw`). That is a real regret mechanic.

## 6. Regional variation

| Region | Hazard | Variant and notes |
|---|---|---|
| `pnw` | Highest | `cascadia`; the hit is felt as a long shake, tsunami only if a tidal shore parcel exists (otherwise cut); wet soil and landslides in the rains; highway and bridge failures |
| `mountain_west` | High | `wasatch` or Hebgen-like; landslide dams, snow loading on a damaged roof in winter, rock fall on the access road; Yellowstone area quakes can pair with `ash_winter` |
| `desert` | Moderate (rift) | Few buildings are masonry-safe; adobe is common and weak; dry slopes shed rock |
| `ozarks` | High (New Madrid) | Old brick, soft river-bottom soils; deliveries cut by closed Mississippi bridges and pipeline breaks; karst sinkholes open or cave (an extra roll) |
| `appalachia` | Low to moderate | East Tennessee seismic zone, Charleston 1886 analog; hollow slopes slide; light damage |
| `rust_belt`, `new_england` | Low | Old unreinforced brick and stone are the problem (Cape Ann 1755 M6; Mineral, Virginia 2011 M5.8 felt widely); mostly cracked chimneys |
| `plains`, `hill_country`, `upper_midwest`, `north_woods` | Very low (induced seismicity, Pawnee Oklahoma 2016 M5.8) | Shaking light; the effect is the **supply shock** from an epicentral band elsewhere (fuel, rail, pipelines) |

Region `odds` suggestions for `src/sim/regions.ts`: `pnw` 3.0, `mountain_west` 1.6, `ozarks` 1.4, `desert` 0.8, `appalachia` 0.5, `new_england` 0.3, `rust_belt` 0.3, others 0.15.

## 7. What the player sees and hears

- **Sky and light** (`collapseLook`): a dust haze over the valley for hours, then clear; no ash tint. Dust plumes from slides on the ridge. At night, towns dark in band A, glow in band C, and small fires (gas) on the horizon. Contrails stop for weeks (grounded flights).
- **Terrain:** cracked road texture with a step, a slumped shoulder, sand boils in creek bottoms, a slide scar on the slope, tilted fence posts, fallen trees. Hedge and wall segments lean or drop.
- **Crowds:** people standing in the road, a line at the one working pump, tents in a school field in the town.
- **Camera:** a short shake at the hit (a `CutsceneOverlay` text card), no audio.
- **Text:** day card: "The shaking lasted four minutes. The Hendersons' chimney is in their yard." Radio (`radioBulletins`): "County emergency net: Highway 20 bridge closed; the fuel terminal in Portland is offline; boil water order for the valley; aftershock M6.1 expected tonight." After month 1: "Inspectors have tagged 212 houses red." A rumor line for each of the scary things (a dam). The `CollapseChip` reads "Roads cut: 41 days".

## 8. Player decisions and strategies

- **Before:** bolt the sill ($300-$800 of hardware and a weekend), strap tanks, flexible connectors, lipped shelves, a gravel-pad poly tank, a second exit, a stocked go-bag and a family meeting spot. Build low, light and braced; avoid the creek bottom and steep slopes. Buy or skip the quake rider. Pre-position cash (banks fail briefly).
- **At the hit:** drop and cover, then find family; the player's choices set the injuries.
- **Day 1-3:** shut valves, check flues, move to the sound structure, shore up damaged walls, boil water. Help neighbors or hold back supplies.
- **Stay or bug out:** staying is right for most (the quake is regional and aid arrives); leaving only wins for a coastal parcel (tsunami) or a red-tagged house with a winter coming. The real strategic choice is **how much to share in the kind weeks versus keep for the hard weeks**.
- **Rich vs poor:** the rich buy the rider, bolt everything, hire crews, buy generators and rebuild fast; their risk is complacency about the road. The poor build fewer, simpler, lower buildings and are tied to hand repairs and rationed time; their advantages are less to lose, tent skills and neighbors' goodwill. A poor family that braced early beats a rich family that did not.

## 9. What makes it fun

- A **kind first act** after the usual grim collapse: the player rescues and is rescued, and the tone then changes in week three, which is dramatic rather than bleak.
- **A puzzle with a clear counter**: cheap, concrete retrofits that pay off visibly (bolted sill = a house that held, the neighbor's didn't).
- The **"who is where" gamble**: the hit moment is a roll and the family reunion is a small story.
- **Aftershocks as a recurring beat**, with a prediction line ("a M5.8 expected tonight") so the player can choose to sleep outside.
- **Distress land sales** and neighbors who need a hand: a rebuild-and-expand arc for a winning run.
- Failure stays readable: the player learns exactly which bolt, tank or slope cost them.

## 10. Parameters and hook mapping

### Numbers

- `warn: [4, 30]` days; false-alarm swarm 1 run in 3 (a `warnFalse` flag in `fx`).
- Shaking duration by band: A 180-300 s, B 60-120 s, C 10-40 s (flavor and injury roll).
- **Omori aftershock schedule:** P(strong aftershock on day t) = clamp(0.9 / (1 + t/4), 0.02, 0.9) x bandScale (A 1.0, B 0.5, C 0.15). Strong = re-roll at 0.35 hazard and a warning line. Largest aftershock is about 1.2 magnitude units below the mainshock (Bath's law). Persist the tail 365 days.
- Family hurt at hit: base 12% per person outside, 4% inside a braced house, +10% in a state-3 structure; location roll for the away members.
- Contractor lead time: `3 x (1 + 8 x affectedShare)` days; premium x1.3 for 60 days, queue-jump x1.5.
- Landslide roll on slopes over 25%: 20% at the hit, plus 8% per heavy-rain day for 90 days.
- Boil and illness: 15% of people ill in week 2 if the player has no treated or boiled water.
- Insurance: rider $1,800/yr, 15% deductible, pays state-2 and 3 only.
- Stove-flue inspection: a 6% fire chance per lit day if the chimney is state >= 1 and unchecked.

### Hook seam (`src/sim/disasters/mega_quake.ts`)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Materials x1.4 then x2.0, water and tarps x2.5, decay to x1.2; insurance exclusion |
| Supply | `onHit`, `daily` | Jarred stock loss, well silt or sheared casing, propane tank spill; rare fuel at the one open pump |
| Raiders | `encounterWeights` | Kind first two weeks (looters x0.4), then looters x1.4 in band A |
| NPC | `onHit`, `daily` | Neighbor damage by house style, rescue events, trapped neighbors, distress land sales |
| Sky | `look` | Dust haze, cracked road, no contrails, dark towns, fires |
| Infra | `onHit` + `roadFx` | County road cut, bridge out (`RoadBridgeState.down`), landslide candidates (`terrainFx`) |
| Bldg | `buildingDamage` | `structureDamage.ts` roll by style, soil, slope, stage; aftershock re-rolls via `done` keys `aftershock_d{n}` |
| Med | `medical` | Hit injuries, water illness, flue CO, aftershock sleep penalty |
| UI | `onWarning`, `radioBulletins` | Swarm hints, red-tag counts, boil orders, aftershock forecasts |
| Oasis | `oasisWeights` | Weight `deliveries` and `fuel` (the cut-apart world), so the contrast is not read from grid alone |

Ten of ten columns; passes the teeth test (at least four).

## 11. Chaining

- `dam_flood` (a shaken dam: Lower San Fernando 1971 nearly failed, 80,000 evacuated; Fujinuma dam failed in Tohoku; Hebgen's slide-dam lake), p 0.12 in mountain and pnw, after [1, 60] days.
- `wildfire` (gas fires; dry season), p 0.15 after [0, 3] days; `lawless` p 0.15 after [30, 100] if fate is never; `grid_down` is already the track layer.
- Water-borne disease: a minor `pandemic`-style tail, p 0.08 after [14, 40] days.
- `financial` via uninsured losses, p 0.05, after [60, 200] days.
- A second large shock (Kahramanmaras: 9 hours later): 15% chance within the first 24 hours of a strong second event (a free re-roll of the hit at half strength).
- Cross-link: a Yellowstone `ash_winter` run in `mountain_west` can sit beside a Hebgen-style quake as its warning swarm.
