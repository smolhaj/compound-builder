# Scenario: supervolcano (the Yellowstone eruption: the ashfall phase)

Status: design only, no code. This is the **hit phase** of the existing kind `ash_winter` (`DISASTERS.ash_winter`, variant `yellowstone`). The long cold that follows is in [ash_winter.md](ash_winter.md); read both together. Conventions and the shared damage model are in [README.md](README.md).

One line: **a week to a month in which the sky falls in pieces.** Ash decides everything: how deep it is where you are, what roof is under it, whether the engine breathes and whether the water can be drunk.

## 1. Real-world basis and analogs

| Event | Figures | Use |
|---|---|---|
| Yellowstone's three caldera eruptions | Huckleberry Ridge 2.1 million years ago (about 2,450 cubic km), Mesa Falls 1.3 million (about 280), Lava Creek 640,000 (about 1,000) (commonly cited, USGS) | Scale: about 1,000 cubic km is a "supereruption", over 1,000 times Mount St. Helens 1980 |
| Odds | USGS: the annual chance of a caldera-forming eruption is about 1 in 730,000; a much likelier hazard is a hydrothermal explosion, a lava flow, or an M7 quake like Hebgen Lake (commonly cited; Yellowstone Volcano Observatory) | The game takes the premise but notes the real odds |
| Yellowstone's monitoring | Four alert levels (Normal, Advisory, Watch, Warning) with color codes; swarms of about 2,500 quakes in Jan 2010 and 2,357 in 2017; Norris Geyser Basin ground uplift of up to several inches a year in the 2000s; a hydrothermal explosion at Biscuit Basin on Jul 23, 2024 (commonly cited) | Warning ladder |
| USGS ash-fall modeling (Mastin et al., 2014) | Of a Lava-Creek-scale eruption: ash deposits measured in feet in the northern Rockies near the caldera, inches across the northern Plains and Midwest, fractions of an inch to inches on the coasts; wind mostly carries ash east and northeast (commonly cited; not re-fetched) | The depth map |
| Mount St. Helens, May 18, 1980 | 57 dead (mostly from the blast and flows); about 540 million tons of ash; Spokane in darkness at midafternoon; Yakima got roughly half an inch to an inch and cleaned up about 600,000 tons; the plume circled the globe in about 15 days; cars stalled, air filters clogged, Interstate 90 and 82 closed (commonly cited, USGS) | A small preview |
| Pinatubo, Jun 15, 1991 | A VEI 6; about 800 deaths, over 300 from roofs collapsing under wet ash during a typhoon; Clark Air Base abandoned (commonly cited) | Wet ash plus rain is the killer |
| Rabaul 1994, Pinatubo, Montserrat: roof studies | Dry ash weighs about 600-1,000 kg per cubic meter and wet ash up to 1,200-2,000; 4 in of wet ash is about 5 lb per sq ft; roofs fail from about 4-8 in for long, flat or low-pitch spans, over a foot for steep, short ones (commonly cited, USGS roof-loading guidance) | Roof load model |
| Novarupta, Jun 6, 1912 (Alaska) | About 15 cubic km of ash; a foot or more of ash at Kodiak 100 miles away; two days of darkness; buildings collapsed under ash; roofs failed in Kodiak (commonly cited) | Near-field darkness |
| Eyjafjallajokull 2010 | Over 100,000 flights cancelled, about 10 million travelers stranded; Europe's airspace closed for a week (commonly cited) | Grounded air traffic |
| Laki 1783 (Iceland) | Fluorine in the ash and gas poisoned grass; about half of cattle and most sheep died and about a quarter of Iceland's people (the Haze Famine) (commonly cited) | Livestock fluorosis |
| Ashfall hazards | Ash is abrasive glass and rock; wet ash is electrically conductive and flashes over insulators; ash in an engine melts to glass; fluoride and sulfate leach into water and onto pasture (commonly cited, USGS and IVHHN) | The daily list |
| Fiction | *Ashfall* (Mike Mullin, 2011), set in Iowa; *Supervolcano* (BBC 2005) | Tone |

Not re-fetched this session; see the README note.

## 2. Warning signs and how the player notices

Suggested `warn: [7, 30]` days (existing; Hardcore x0.4). The sequence follows the YVO ladder.

| Stage | Real basis | What the player sees |
|---|---|---|
| Advisory (days -30 to -15) | Swarm of small quakes, uplift report | News tile: "USGS raises Yellowstone to ADVISORY"; the county newspaper explains the odds. Most players ignore it (this is the intended "it can't be real" phase) |
| Park closed (-14) | The park would close roads and evacuate | Radio: "the park closes its roads"; a long line of tourist trucks passes the county road |
| Watch (-10) | Orange level; stream temperatures change, geysers shift | "Old Faithful off schedule", a sulfur smell on the wind, animals moving down (elk in the hay fields, bison on the road in a Mountain West valley) |
| Warning (-3) | Red; heavy tremor | The **ash forecast map** (a USGS cone) goes on the radio: "5 to 20 inches in the valley by day 3" |
| Steam and an ash column (-1 to 0) | Plume rises 20+ miles | Sky: a pale column on the horizon, a cumulus of the wrong color; flights grounded |

The ash forecast **improves with time**: 7 days out it gives a wide range, 1 day out a narrow one. The player must prep against the range. The forecast's central estimate is the ash depth the sim will draw (rolled once at warning start, with a +/-40% forecast error shrinking each day).

## 3. Phase-by-phase timeline

The eruption phase is about 1 to 3 weeks of ash fall (not a single moment). `D` is days after the hit (`hitAt`). Depths below are *accumulation at the compound*; see section 6 for the regional table.

| Phase | In the world | At the compound |
|---|---|---|
| Hit moment | A boom and a quake felt at 100+ miles; a plume 25-30 miles high. Within 40 miles, pyroclastic flows (not survivable); the near-field cities are evacuated or buried. In the compound's region the first ash arrives in 1 to 12 hours depending on wind and distance | A **day-zero card**: a column in the sky, then the sun dims; the first gray flakes. A choice: stay or evacuate. The game sets the compound's `ashTarget` (inches) |
| First hour | Light ash fall, birds quiet. Phones jammed. Radio: official guidance (seal the house, stay in, N95 or better outside) | Cover the well and cisterns, close dampers, pull vehicles into barns with the engine off, tape windows and vents. Wet the roof? (No: water makes it heavier; see rules) |
| Day 1 | Darkness at midday (Spokane, Kodiak). Lightning in the plume. Highways close. Power lines flash over on wet ash | Ash 1-4 in; lamps and flashlights in the day; the first **roof check** |
| Week 1 | Ash builds at 0.5-3 in/day in the heart of the plume's track, then eases. Airports closed. Hospitals fill with respiratory cases. Evacuation traffic out of the Mountain West on the interstates | Shovel the roofs on a **roof clock** (see section 5); filters, masks, seals; livestock in barns. Grid brownouts and a dust-blown solar yield near zero |
| Month 1 | The eruption slows, ash fall stops (or comes in pulses for 2 to 6 weeks). Ash is lahar-prone on slopes in rain: mudflows and ash-clogged streams. Roads are slick, and bridges and culverts clog | The cleanup: roofs, gutters, well, cistern, vehicles. Ash is *not* removable by water down a drain (it cements and clogs pipes). Winter begins to bite as the sun is dim |
| Month 3 | Sun a pale disk; the temperature falls; power restored in patches; food shipments from the south arrive | The transition to [ash_winter.md](ash_winter.md): cold and the failed season |
| Month 6, year 1, year 2+ | See ash_winter | See ash_winter |

## 4. Effects by track and the rest

The existing curve is a good start: grid `C(0,2,0.1,[60,300],60)`, fuel `C(0,3,0.1,[90,400],60)`, stores `C(1,7,0.1,[120,500],60)`, deliveries `C(0,3,0,[120,500],60)`. Proposed refinement by ash depth class (so the same kind does more with less on the coasts):

| Depth at the compound | Class | Track floor multiplier (applied to the `yellowstone` curves' floors) |
|---|---|---|
| > 12 in | `near` | x1.0 (the table above); grid and phone down for months; roads closed for 4-8 weeks |
| 4-12 in | `heavy` | grid floor 0.2, deliveries floor 0.15, stores 0.2, phone floor 0.4; roads closed 2-4 weeks |
| 1-4 in | `moderate` | grid floor 0.5 (ash flashover brownouts), deliveries 0.4, stores 0.4; roads closed 1-2 weeks |
| < 1 in | `light` | grid 0.8, deliveries 0.6, stores 0.6; the main effect is the later winter and the national supply shock |

- **Prices and shops:** `priceMods`: N95 and P100 masks, air filters, goggles, tarps, shovels, chainsaws x3 in the warning, then sold out; fuel x1.6; flour, rice and canned x1.4 at the hit; the stock market already hits (existing 35% crash).
- **Neighbors:** half of the nearest neighbors leave in the warning or the first week (a "gone to Boise" event chain, with `status: 'gone'`); those who stay ask for masks, cistern water and roof help. `refugees` flow 2x (existing) as the northern Rockies empty south and east.
- **Raiders and the encounter mix:** `encounterWeights`: refugees and stranded travelers high in week 1; looters x1.2 in the dark weeks; **fewer visits on the worst ash days** (a gray, choking road is hard to travel: a `visibility` factor), so the first week is quieter than normal and the second is not. Gangs rise with `law` (existing 0.2 floor).
- **Health:** respiratory: coughing and eye irritation immediately, **silicosis** only after long exposure (years). Add an **ash exposure** meter: outdoors without a respirator +1 per hour on `ashLung` (like `radiation` dose), indoors sealed 0.1; thresholds produce bronchitis, an asthma flare in kids and the old, and bacterial pneumonia in the month. N95 cuts exposure about 90% if fitted and filtered (the real caveat: beards leak). Eye abrasion. Roof-shoveling falls and heart attacks (a real killer after snow and ash).
- **Food and water:** open water (ponds, uncovered cisterns, catchment) is contaminated: turbidity and fluoride; **cover and filter**. A drilled well with a sealed cap is fine; a hand well with an open mouth fills with ash. Stored food is unaffected. Gardens and pasture: ash over 4 in kills the crop in the field (the season is lost); under 1 in the damage is small. Pasture ash and fluorine poison livestock, so **hay in the barn** is life (Laki). Ash on solar panels: **output multiplier = 1 - coverage, 90% lost until cleared** (a daily chore with a squeegee and water). Vehicles and generators: air filter clog; an engine **runs about 2 to 10 hours in heavy ash** unless filtered; pre-filters and a stock of air filters are the mechanical counter. Chainsaws and mowers choke too.
- **Light and cold:** sunlight at 20-60% in the heavy zone during ash fall; indoors needs lamps; the cold arrives during the first month as the sky stays dark.

## 5. Structure damage and what protects

The existing code does **one** roof roll on day 4 for the workshop, coop and garden. Replace with a **roof load clock**, run daily during and after the ash fall.

**Load model.** `load (lb/sq ft) = ashDepthInches x density`, with density 5 lb/sq ft per inch when wet (about 62 lb per cubic ft; wet ash 100-130 lb per cubic ft would be 8-10 per inch, use 5 as a mid, tune) and 2.5 per inch dry. Rain or snow on ash makes it wet; the sim flags `wet` on days with rain, snow, or a hose-down. Add snow load in winter (Mountain West ground snow loads 30-80 lb/sq ft by design code), which is *not* waived.

**Capacity.** A roof's design load by building type (lb/sq ft, live + snow, mid estimate):

| Roof | Design capacity (approx.) | Notes |
|---|---|---|
| Cabin / log house gable, steep (8:12+), metal | 40-60 | Sheds ash; wet ash can still stick up to about 25 degrees of pitch |
| Farmhouse gable 6:12 shingles | 40-50 | The main house |
| Timber-frame / lodge with heavy timbers | 50-70 | Stronger by design |
| Shipping container (flat steel) | 60 (flat, spans are short) | Flat roof holds ash: shovel it |
| Pole barn, long-span, low pitch | 20-30 | The usual first failure |
| Workshop, chicken coop, greenhouse, polytunnel | 10-25 (greenhouse film / polycarbonate 5-15) | Fail first; polytunnels collapse at 2-4 in wet |
| Shade or lean-to, pergola | 8-15 | Fails at once |
| Bunker (buried) | very high | The problem is the hatch and vents clogging |

**Rule.** Each day, `wetLoad >= 0.7 x capacity` marks the roof "straining" (a creak line); `>= capacity` rolls collapse at 25% per day, `>= 1.5 x capacity` immediately. Collapse is state 2 (`knockBack` to roof) or 3 for long span; people inside take a hurt roll (a collapsing barn with animals). **Steep metal roofs shed.** Gutters and valleys hold ash and fail first. A **shoveling task** removes 1 inch from a whole roof in 3 person-hours per 1,000 sq ft (a person-hours cost in `labor`); work on a roof costs a **fall** roll (4% per roof-hour wet, 1% dry, injury); a hired crew can do it (and are in short supply in the weeks; $60/hr/head, x2 in week 1).

**Pyroclastic and lahar:** within about 40 miles of the vent nothing survives (not a play case: parcels this close are not offered in Surprise, or the run starts evacuated). **Lahars** (ash mudflows) in rain down a drainage can wipe the creek bottom (use the `dam_flood` stage logic at 20% scale on creek parcels).

**Other damage.** Ash into the HVAC and stove flue: a stove with a spark arrestor and a closed damper survives; a fresh-air intake without a filter fills the house with dust (a "grit" comfort penalty). Metal roofs and tanks corrode slowly (acid rain, sulfate) over years. Solar inverters and electronics: abrasive dust and flashover in the first rain; cover them.

**Repair:** the main cost is **time and crews**; roof rebuilds need lumber and roofing (the same supply-shock multipliers; roofing x1.8 for a month). A family with a $30,000 start who built the **steep metal roof** and a few filters loses nothing; the family with a flat low-roof workshop loses the workshop. Insurance: volcanic ash is a covered peril under many homeowners policies as "collapse from weight of debris" (design assumption: pays state 2-3 if the roof was shoveled to code within 7 days; denies if not), the existing `insuranceClaim` with a 0.4 share stays.

## 6. Regional variation

Ash accumulation at the compound for a Lava Creek-scale eruption, wind roll `westerly` (75%), `southerly` (15%), `northerly` (10%). Figures are design estimates scaled from the Mastin et al. 2014 map (inches at the median wind; the roll is lognormal, sigma 0.5).

| Region | Median ash | Hits | Notes |
|---|---|---|---|
| `mountain_west` | 18-60 in (varies; evacuate within 100 mi) | all | Near field; roads shut for a month; a Bozeman, Idaho Falls, Jackson, Billings analog; the compound may be uninhabitable at 5 ft |
| `plains` | 5-20 in | all | Dakotas, Nebraska: crops buried, grain bins collapse, long pulses; trains stop |
| `north_woods`, `upper_midwest` | 1-6 in | downwind | Winter roofs strained; a few weeks dark |
| `ozarks`, `hill_country` | 0.25-3 in | downwind | Light; the national food shock is the real hit |
| `rust_belt`, `appalachia`, `new_england` | 0.1-1 in | light | Mostly the cold later |
| `desert` | 1-8 in | southerly roll | Dry ash, strong winds, adobe roof loads |
| `pnw` | 0.1-1 in (ash seldom west) plus a bad sunlight cut | light | A coastal sun-dim and the rain make the later cold; Mount Rainier is a separate lahar risk |

Region `odds` (the existing `ash_winter` 1.5 for mountain_west): add `plains` 1.2, `upper_midwest` 0.8, others 0.5.

## 7. What the player sees and hears

- **Sky:** a vertical gray column on the horizon; **a tan-gray sky**, the sun a pale disk, then none; at day 2, midday darkness; lightning in the plume (a flicker on the horizon); sunsets in deep red and violet weeks later (the 1883 Krakatoa pattern). Moon dim and orange.
- **Terrain:** a gray covering that deepens in 3D (the ground color lerps, trees get gray tops, roofs go white-gray), footprints and tire tracks in it, gray snow-like drifts against walls, **ash on the solar panels**, a dust devil of ash on windy days, wet ash as paste in the rain. Distant ridgeline fades into the haze.
- **Crowds:** pale traffic with headlights at noon, masks on every face, a slow convoy south.
- **UI:** an **ash depth gauge** on the HUD (inches and the forecast), a roof-load indicator per building (green, yellow, red), a respirator count.
- **Radio:** "USGS: ash fall of 8 to 14 inches expected in the Madison Valley through Friday." "Highway 191 closed." "Do not wash ash down drains." "Livestock: keep animals off ash-covered pasture." "Southbound interstate traffic at 5 mph." Rumors: a second eruption (some true).
- **Day card:** "It was too dark to see the barn at noon. Eleven inches of ash on the roof."

## 8. Player decisions and strategies

- **Before:** steep metal roofs (or reinforced ones) on every important building; a **second roof layer or rafter bracing**; seal the house (weatherstripping, window film); a stock of P100 and N95 respirators (two per person, plus filters); air filters (5 per vehicle and generator); cover tanks and the well; a **gravity-fed sealed cistern**; a greenhouse with a steep roof; stored hay; stored food for 2-3 years (the winter follows); a way off (a vehicle with sealed engine bay).
- **During the warning:** stay or leave: leaving south and east wins for the near-field, but roads jam and fuel runs out; the rich leave early by plane (grounded later); staying wins at the edge of the plume with a prepared compound.
- **During the fall:** roof shoveling schedule (cost labor, risk falls), generator and engine discipline, water covering, masks.
- **Rich vs poor:** the rich are early to everything (filters, crews, a second home outside the plume) but their glass-and-low-slope designs are fragile; the poor have simple steep-pitched cabins and no stockpile of filters; a poor family can win by shoveling religiously, wearing a cloth and filter, and sleeping in the cellar-bunker with a sealed hatch.

## 9. What makes it fun

- **Time for a plan**: a month of ladder-like warning, and a forecast the player reads and prepares against (like a hurricane, but with a map).
- **A building scenario** that rewards the roof choices the player already makes (pitch, metal, span) and punishes the cheap flat one with a visible collapse.
- **A daily chore loop** (shovel, wipe panels, swap filters, check masks) that is vivid and on the HUD without being a drag, then eases into the winter chapter.
- **A grand, rare sky**: eerie light and sunsets, the day the sun disappears.
- Choice, not just hardship: give the family a **bunker** that works as a clean-air room, a decision about sharing masks, and a trade in filters as currency.

## 10. Parameters and hook mapping

### Numbers

- `warn: [7, 30]` (existing). Forecast error: +/-40% at day -7, +/-10% at day -1. Hardcore x0.4 warning.
- Ash: `ashTarget` inches as in section 6; the fall rate per day follows `target x exp(-d/9) x 0.11` for 3 to 6 weeks (the front-loaded curve). Wet days: 40% in `pnw`, 20% in `plains`, 10% in `desert`.
- Roof design loads and shoveling rates as in section 5; fall roll 4%/1% per roof-hour; shoveling 1 in per 3 person-hours per 1,000 sq ft.
- Respirator effect: 90% of exposure blocked if worn and filtered; filters last 40 hours of heavy ash.
- Engine life in heavy ash: 2-10 hours per filter set; a clean air pre-filter doubles; a closed bay quadruples.
- Solar yield multiplier `1 - coverage` where coverage = min(1, depth / 0.2 in); cleaning resets it.
- Pasture ash lethal after 2 days of grazing at 4+ in (fluorosis): animals need stored feed; death rate 5%/day.

### Hook seam (`src/sim/disasters/ash_winter.ts`, the `yellowstone` branch)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Masks and filters x3, then out; fuel x1.6; roofing x1.8 |
| Supply | `daily` | Open water contamination, gardens and pasture lost, hay value, stored food unaffected |
| Raiders | `encounterWeights` | Visibility factor, refugees x2, looters rise week 2 |
| NPC | `onHit`, `daily` | Neighbors leave or ask for help; the "gone to Boise" chain |
| Sky | `look` | Gray column, dimming, midday dark, violet sunsets |
| Infra | `daily` | Grid flashover, solar derate, vehicle and generator filter life, road closures by depth |
| Bldg | `buildingDamage` | Roof load clock replacing the single day-4 roll; shoveling task; lahar on creek parcels |
| Med | `medical` | `ashLung` exposure meter, bronchitis, kids and elders, roof-fall injuries |
| UI | `onWarning`, `radioBulletins` | The YVO ladder, ash forecast cone, depth gauge, roof indicators |
| Oasis | `oasisWeights` | Weight `deliveries`, `grid` and `phone`; a clean sealed compound reads as a bright pocket in a gray world |

Ten of ten columns.

## 11. Chaining

- **Always into [ash_winter.md](ash_winter.md)** (the same kind, same run): the winter is the second phase, not a chain.
- `lawless` p 0.40 after [30, 90] (existing).
- `wildfire` (a dry year's start: ash-lightning ignitions in forests; also later, dead forests); `dam_flood` (ash lahars and plugged streams: p 0.2 in mountain regions, [20, 120] days); `pandemic` tail in refugee camps p 0.1; `financial` (the market crash is already in).
- `mega_quake`: the Hebgen-type M7 before an eruption is the **warning**; the same swarm can end in a quake only (a false alarm variant at p 0.25: no eruption, but a quake and a hydrothermal explosion: the game's "it was just the quake" outcome).
