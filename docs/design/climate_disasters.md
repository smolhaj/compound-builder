# Design draft: runaway heat and ice age disasters

Status: **approved 2026-11-19: owner accepted every recommended answer in section 7 ("all as recommended, for now"). Build in the order of section 8.** Nothing here is code yet.

Conventions: every mechanic that the GDS or the current code does not already cover is tagged **PROPOSED** so you can accept or cut it. Numbers marked "from the model" were computed by running the current `domeLoad` arithmetic (`src/sim/dome/climate.ts`) at the default dome sizes; everything else is a design target to be tuned by the bot playtest. U.S. units throughout (degrees F, feet, gallons, pounds per square foot, kWh).

## 0. What the code has today (the hooks these disasters would use)

| Piece | Where | What it gives us |
|---|---|---|
| Collapse clock | `sim/disaster.ts` | A kind is a `DisasterDef` (warn range, variants, 8 service-track curves `C(at, fall, floor, back, ramp)`, hints, hit line, chain). `nextEraDisaster` rolls a quiet period of 4 to 8 years in Era 1, shrinking to 0.5 to 1.5 later. |
| Per-kind hooks | `sim/disasterFx.ts`, `sim/disasters/<kind>.ts`, `kit.ts` | `onWarning`, `onHit`, `daily`, `serviceMods`, `supplyMods` (grow multiplier, cold), `priceMods`, `encounterWeights`, `look` (sky), `radioBulletins`, `cards`. Per-kind state lives in `disaster.fx[kind]` (JSON-safe, no migration). |
| Winter engine | `sim/winter.ts` | `winterAt(days, severity, region)` returns grow factor, cold anomaly, solar, sun dim. Today it tops out near minus 12 F (severity 1.2), enough for an ash winter, not an ice age. |
| Snow and ash roof load | `sim/ashfall.ts` | Roof capacity in pounds per square foot per building kind, `roofRatio`, `roofVerdict`, shoveling hours, braced roofs at 1.35 times. The pattern snow load would reuse. |
| Dome tiers | `dome/tiers.ts`, `protection.ts` | Earthen, geodesic, glass, arcology. Shell snow rating: 90 / 40 / 60 / 250 psf. Wind, hail, fire, EMP, blast also rated. `breaches(tier, {snowPsf})` already exists. |
| Dome climate | `dome/climate.ts` | Shell U values (0.03 / 0.55 / 0.45 / 0.30), solar gain, heat pump COP 3 heating and 3.5 cooling (flat), cooling ladder (vents, shade, evaporative, chiller), bands (frost 34 to 95 F, temperate 50 to 85, comfortable 64 to 78). The greenhouse rise is capped at 60 F, and the earthen dome is 60 percent ground-coupled at 52 F. |
| Dome live state | `dome/live.ts` | `outside(s)` (the one place outdoor temperature is made), indoor temperature, stress, heat fail-safe vents at 105 F, air clock, dust from fallout and ash (`outsideDirt`), `domeKwhDay`, chiller rental. |
| Plant | `dome/plantUnits.ts`, `plant.ts`, `plantStrike.ts`, `plantYard.ts` | Six units (chiller, scrubber house, substation, water plant, battery block, roof vents), whole / damaged (50 percent) / down, state read from open repair jobs, N+1 spares for chiller, scrubber and substation, power modes grid / derated / battery / dark, 3 hours of UPS plus up to 24 hours of battery, repair lead times of 5 to 21 days. Yard (chiller, substation, a tower pad) reached only by airlock from inside. |
| Regions | `sim/regions.ts`, `climate.ts` | July highs from 77 F (North Woods) to 94 F (Hill Country), January lows from minus 6 F to 35 F, snowfall, rain, region disaster odds, altitude and aspect shifts. No humidity field; `dryAir()` derives it from annual rain. |
| Eras | `sim/eras.ts` | After "keep playing", the era settles when services are back or **3 years** have passed, then the next disaster is rolled. |

**GDS flags (deviations to approve).** (1) GDS section 4 lists no climate disasters; these are two new rows ("Grounded" kind). (2) Both run longer (4 to 8 game years) than any existing kind, and the eras code would force a new disaster after 3 years; see Q1. (3) GDS already says a rare large nuclear exchange "adds 1 to 3 years of nuclear winter"; the ice age must share one engine with it, not duplicate it. Everything else is PROPOSED below.

---

## 1. Runaway heat (working kind id `runaway_heat`)

### 1.1 Premise and timeline

A slow collapse of outdoor survivability: the summer high climbs year over year, then the nights stop cooling. It is a **long** disaster; the family is never hit by a single bad day, they lose the outdoors one season at a time.

| Phase | Game time (from hit) | Summer afternoon high vs region normal | What the player sees |
|---|---|---|---|
| Warning signs | 4 to 12 months before | 0 to plus 8 F | Record heat dome headlines, brownouts, "wet-bulb alerts," city cooling-center deaths, dead lawns, price creep, neighbors buying generators and window units |
| 1. Hot summers | Year 0 to 1 | plus 10 F | Grid derates on afternoons, outdoor yields dip, hens stop laying |
| 2. Failing systems | Year 1 to 2 | plus 20 F | Rolling blackouts, wells drop, outdoor corn and beans fail some years, stores thin |
| 3. Outdoor day closed | Year 2 to 4 | plus 30 to 38 F | Summer outdoor work only at dawn and after dark; grid effectively gone in summer; crops outdoors fail; cities empty northward |
| 4. New normal | Year 4 to 8 | plus 34 to 40 F (plateau) | Winters are mild (a 15 to 20 F lift), summers are the killer; recovery is not within a run |

The curve is a smoothstep over 4 game years, one number per region (the "heat anomaly"). It plugs into the existing collapse clock as ordinary track curves (below) and a PROPOSED `daily` hook that writes the anomaly, so the clock, warning ticker, report card and era chronicle all work unchanged.

**Variants (PROPOSED, weights 2 / 1):** `dry_furnace` (desert, plains, mountain west; low humidity, tower-friendly, water-hungry) and `humid_furnace` (ozarks, appalachia, hill country, rust belt; wet-bulb is the killer, evaporative cooling useless).

**Service tracks (PROPOSED `C(at, fall, floor, back)` in days after the hit):** grid `C(120, 600, 0.15, null)`; fuel `C(180, 500, 0.2, null)`; stores `C(150, 500, 0.15, null)`; deliveries `C(150, 500, 0.2, null)`; medical `C(200, 500, 0.3, null)`; law `C(300, 400, 0.3, null)`; phone `C(300, 500, 0.4, null)`; banks `C(200, 400, 0.2, null)`. Fate odds PROPOSED `[0.02, 0.18, 0.80]` (no recovery within a run is the norm). Chains: `mass_exodus` 0.4 (north-bound) after 30 to 120 days, `water_war` 0.35, `global_famine` 0.3, `wildfire` 0.4 early, `lawless` 0.3. Surprise base weight PROPOSED 0.15 (same rarity class as `reactor_meltdown`), with region odds: desert 2.0, hill_country 1.8, plains 1.5, ozarks 1.5, north_woods 0.4, pnw 0.5.

### 1.2 What changes in the world

Peak summer high (afternoon) by region, in degrees F. Year 0 is the current region value (`julyHighF`). The anomaly is amplified inland.

| Region | Year 0 | Year 2 | Year 4+ | Winter low (Jan) yr 4 | Humidity note |
|---|---|---|---|---|---|
| Mountain West | 86 | 104 | 120 | 12 to 30 | dry |
| Great Plains | 92 | 114 | 130 | 16 to 36 | dry to moderate |
| Desert Southwest | 92 | 110 | 126 | 20 to 40 | very dry |
| Hill Country | 94 | 112 | 128 | 35 to 52 | moderate |
| Ozarks | 90 | 108 | 122 | 24 to 44 | humid |
| Appalachia | 85 | 102 | 116 | 25 to 42 | humid |
| Pacific Northwest | 80 | 94 | 106 | 34 to 46 | marine |
| New England | 80 | 96 | 108 | 6 to 24 | humid |
| North Woods | 77 | 92 | 104 | minus 6 to 12 | humid |

Nights are the real tell: the overnight low rises about as much as the day (the existing `nightOf(...).hot` flag already gives plus 12 F; PROPOSED a continuous anomaly instead). A lot that is 1,000 feet higher is about 3.6 F cooler (existing `altitudeClimate`), so altitude is a real mitigation.

**Human limits.** Wet-bulb is what the body cannot shed. The theoretical limit is 95 F wet-bulb; lab work on young healthy adults finds trouble nearer 87 to 91 F. Using the Stull formula: 110 F at 40 percent humidity is 88 F wet-bulb; 105 F at 70 percent is 96 F; 120 F at 20 percent is only 84 F; 130 F at 30 percent is 98 F. So the dry furnace is hot but survivable in shade with water; the humid furnace kills people at lower temperatures. PROPOSED rule: outdoor work hours per day are gated by wet-bulb (full under 80 F, none above 90 F, no sleeping outdoors above 85 F). It reuses the existing schedule and `thirst.ts` heat-wave water use (a heat wave already uses more water and hurts the elderly).

**Growing season.** Frost-free days stretch (winters mild), but heat kills the crop. PROPOSED outdoor grow factor = max(0, 1 minus 0.025 per degree F that the season's peak is above 88 F): 98 F gives 0.75, 108 F gives 0.50, 120 F gives 0.20, 128 F gives 0. Greenhouses are worse than fields: the existing `comfortAt` already drops to zero comfort at 108 F indoors, so a glasshouse without a plant cooks. Winter crops become the outdoor growing season (a flip: plant in October).

**Water.** Open ponds and uncovered cisterns evaporate faster (PROPOSED 0.4 to 0.8 inches a day at 110 to 130 F, versus about 0.25 today); wells drop (the existing drought `wellYield` rule, with a PROPOSED 1.5 times stronger drawdown); the creek goes intermittent by year 2 in dry regions. Covered cisterns, deep wells and shade matter.

**Wildlife and livestock.** Hens stop laying above 90 F and die above 110 F; goats and sheep need shade and 2 to 3 times the water; cattle die in humid 105 F weather. Wildlife thins, deer move north, game scavenging drops (existing `wildfood`). The existing `DOME_STOCK`/`comfortAt` curve applies inside domes.

**Wildfire.** Fuel dryness raises wildfire odds; a 40 percent chain to `wildfire` early, and `outsideDirt` already treats smoke as dust the dome must keep out.

**Grid.** Real numbers: transmission lines lose roughly 0.5 percent of capacity per degree F above design and transformers derate; air-conditioning demand peaks exactly when supply sags. PROPOSED: the `grid` track gets a **seasonal factor** (afternoons in summer at 0.1 to 0.4 from year 1, whole summers dark from year 3), written through `serviceMods`.

### 1.3 A normal homestead with no dome

Year 0 to 1: manageable (shade, night work, more water). Year 2: the garden is a morning-only crop, the well is marginal, the freezer is a liability on the grid's bad afternoons, the house hits 95 to 105 F indoors; elderly and children take heat illness (PROPOSED 3 to 6 percent illness chance a day above 95 F indoor without cooling). Year 3 to 4: outdoor farming is over in the middle of the day; only underground living (bunker, tunnels, root cellar, a berm house) holds under 80 F; stored food and a deep well decide survival. Existing bunkers are naturally ground-coupled (52 F ground). PROPOSED shallow ground warming of 2 F a year; below 20 feet the ground barely moves, which is why a deep bunker is the cheap answer to heat.

### 1.4 Effects by dome tier (from the model)

At the default sizes (earthen 20 ft, geodesic 60 ft shell, glass 150 ft, arcology 360 ft). "Passive" is the indoor air the shell floats at with the plant off, sun at noon, outside 125 F (the model caps the greenhouse rise at 60 F).

| Tier | Passive indoor at 125 F | Heat to shed (kW thermal) at 115 / 125 / 140 F outside | Electric kW at COP 2.4 (125 F) | kWh in a peak day (about) | Notes |
|---|---|---|---|---|---|
| Earthen | 81 F | 0 | 0 | about 0 | Earth coupling carries it; too small to live in, a refuge room only |
| Geodesic | 169 F | 74 / 82 / 94 | 34 | 600 | Fail-safe vents (105 F) open the lockdown; it needs the plant |
| Glass | 185 F | 382 / 429 / 499 | 179 | 3,500 to 4,500 | Roof screens already cut sun to 45 percent; solar-friendly (the peak matches the sun) |
| Arcology | 185 F | 1,580 / 1,759 / 2,027 | 733 | 14,000 | Town-sized load; cannot be run on batteries |

Existing aux load (fans, pumps, lights) is 12 kWh per 1,000 sq ft a day (about 34 kWh for the geodesic, 212 for glass); heat load dwarfs it.

**The new limits (all PROPOSED; the current model has unlimited chiller capacity).**

- **COP falls with the outside air.** 3.5 at 95 F, minus 0.035 per degree F above that: 2.45 at 125 F, 1.9 at 140 F. Real air-cooled chillers lose roughly 1 to 1.5 percent capacity per degree F above 95 F.
- **Air-cooled capacity derate and trip.** Standard unit: 100 percent at 95 F, minus 1.2 percentage points per degree F, trips at 125 F (typical rating). High-ambient package (price times 1.4): minus 0.8 points per degree F, trips at 140 F. Above its trip point a chiller is `down` until the air cools.
- **Cooling tower or evaporative condenser (PROPOSED, uses the existing tower pad in the yard).** Not limited by dry-bulb; limited by wet-bulb: full to 82 F wet-bulb, minus 3 points per degree F, none at 95 F. Dry furnace: great (84 F wet-bulb at 120 F and 20 percent). Humid furnace: dead (96 to 99 F wet-bulb). **Price: water.** About 0.65 gallons per kWh of heat moved: the glass dome needs about 4,000 gallons a day at peak; the arcology 15,000 to 26,000. A 150 ft glass roof catches about 11,000 gallons per inch of rain, so in a drought the tower runs the cistern dry in days. Which is the intended tension with the water plant.
- **Evaporative pads.** The existing rung works only in dry air and now also needs wet-bulb under 80 F; in the humid furnace it is useless.
- **Vents.** The free rung only works when outside is cooler than hold temperature minus 3 F (existing rule), so after year 1 it works only at night, then not at all.
- **Substation and solar.** Substation capacity is sized by the plant; PROPOSED transformers derate 0.4 percent per degree F above 104 F ambient and take thermal wear. Solar panels lose about 0.4 percent per degree F of cell temperature above 77 F (a roof at 125 F air runs near 160 F cells: about minus 30 percent). A glass dome needs about 250 kW of panels (about 25,000 sq ft, 0.6 acre) to cover a 175 kW afternoon; night needs batteries.
- **Battery block.** Today: 3 hours of UPS plus up to 24 hours of bank, climate at 40 percent. PROPOSED: battery life halves for every 15 F above 77 F (standard rule of thumb), so a hot battery shed (unless inside the cooled dome) loses capacity over weeks.

### 1.5 How plant units degrade, and what the player can do

PROPOSED mechanism: widen `PlantCause` (`raid | fire | storm`) with `heat` and `load`. Wear rolls become new open `plant` repair jobs in `GameState.raidDamage`, so everything downstream (state read from open jobs, repair, rush, N+1, panels, "damaged is half") works with zero new state. A new pure module `plantClimate.ts` returns a daily wear probability from stress.

| Unit | Heat stress driver | PROPOSED daily wear chance (per unit, no spare) | Step effect when lost |
|---|---|---|---|
| Chiller | Outside above 95 F, load factor | 0.02 percent at rating; times 3 per 10 F above; about 0.5 percent a day at 125 F; a damaged unit left running above its trip goes `down` | Existing: half or no cooling; indoor floats toward the passive numbers above |
| Substation | Ambient above 104 F, load above 90 percent | 0.01 percent rising to about 0.2 percent | Derated, then battery, then dark |
| Battery block | Temperature (capacity fade), not a fault | Capacity fade, not damage | Fewer ride-through hours |
| Scrubber house | Hot media clogs and fouls faster | Existing media decay times 1.5 | Shorter air clock |
| Water plant | Pump wear, evaporation load | Low | Existing: no recycling |
| Roof vents | Little; they are mostly idle | Very low | Existing: no free cooling |

An N+1 spare cuts each unit's load factor to about half (PROPOSED wear times 0.4) and carries the dome while the other is down (existing). Repair lead times today are fixed (chiller 14 days, substation 21); PROPOSED they stretch by 1 over the `deliveries` track (capped at 4 times), so a heat-wrecked world makes the spare parts the scarce thing. The player's levers: buy the spare; buy the **high-ambient package** (a refit of the chiller unit, cost times 1.4); fit a tower (PROPOSED, if water is available); size solar to the afternoon; move the battery inside; run the plant at a lower comfort band (the `frost` band's top is 95 F, which cuts load); shade the yard unit (PROPOSED yard canopy is cosmetic only); keep spare filter sets and parts in the hardened yard stock; rent chillers while deliveries last (existing `chillUntil`). Geothermal: **no ground-source cooling exists today**; PROPOSED (PR 9) a ground loop that dumps heat to 52 F ground at COP about 4 and no outdoor derate, sized at about 3 times the cost of an air-cooled unit and limited by the loop field area. Marked PROPOSED because it needs a header marker on the yard pad (small new art).

---

## 2. Ice age (working kind id `ice_age`)

### 2.1 Premise and timeline

A long dark cold: the sun is dimmed (aerosols, a shutdown of the ocean conveyor, or both), the growing season collapses, snow does not melt, and the grid and fuel supply fail under load.

| Phase | Game time | Annual mean vs normal | Growing season | Sun | What the player sees |
|---|---|---|---|---|---|
| Warning | 3 to 10 months before | minus 3 to 8 F | normal | 0.95 | A cold, wet "year without a summer," early snow, strange sunsets, grain exports halt, price creep |
| 1. Cold years | Year 0 to 1 | minus 10 F | minus 30 days | 0.85 | Summer frosts, a poor harvest |
| 2. Deep cold | Year 1 to 3 | minus 20 to 30 F | 45 to 90 days | 0.70 | Rivers freeze, outdoor crops fail in the north, heating is the only thing that matters |
| 3. The long dark | Year 3 to 6 | minus 30 to 40 F | 0 to 45 days | 0.55 | Perennial snow, whole-season frost; recovery would take decades |

The curve is a smoothstep over 3 game years. **Variants (PROPOSED):** `dimmed_sun` (global, weight 2) and `ocean_shutdown` (regional: northeast, Great Lakes and north woods get the deep cold, the south only half; weight 1; plausible because a conveyor shutdown chills the northern Atlantic region most).

**Tracks (PROPOSED):** grid `C(30, 200, 0.2, null)`; fuel `C(30, 300, 0.2, null)`; stores `C(60, 300, 0.2, null)`; deliveries `C(30, 300, 0.2, null)`; medical `C(60, 300, 0.4, null)`; law `C(200, 300, 0.4, null)`; phone `C(100, 400, 0.4, null)`; banks `C(100, 300, 0.2, null)`. Fate `[0.05, 0.25, 0.70]`. Chains: `global_famine` 0.45, `mass_exodus` 0.35 (south-bound), `lawless` 0.3. Surprise base weight PROPOSED 0.12; odds: north_woods 2.0, new_england 1.6, upper_midwest 1.6, mountain_west 1.3, hill_country 0.4, desert 0.5. **Not allowed back to back with `ash_winter`, `supervolcano`, `asteroid` or `runaway_heat`** (PROPOSED filter in the era roll).

### 2.2 What changes in the world

| Region | Year 0 July high | Year 3 July high | Year 3 January low | Frost-free days yr 3 | Ground snow load (psf, plateau) |
|---|---|---|---|---|---|
| North Woods | 77 | 48 | minus 45 | 0 to 20 | 180 |
| New England | 80 | 56 | minus 35 | 10 to 30 | 140 |
| Upper Midwest | 80 | 54 | minus 35 | 10 to 30 | 120 |
| Mountain West | 86 | 62 | minus 22 | 30 to 50 | 90 |
| Great Plains | 92 | 66 | minus 24 | 40 to 60 | 40 (dry, wind-scoured) |
| Pacific Northwest | 80 | 60 | 10 | 60 to 90 | 80 |
| Hill Country | 94 | 78 | 8 | 90 to 130 | 15 |
| Desert Southwest | 92 | 72 | 0 | 80 to 110 | 10 |

These need a stronger cold curve than `winterAt` (which is capped near minus 12 F). PROPOSED: generalize `winterAt` with a `coldScale` argument (so nuclear winter and asteroid winter can reuse it) rather than a new engine, and keep the existing grow, solar and food-stress shape.

**Water.** Surface water freezes; wells below the frost line are fine (frost depth reaches 8 to 10 feet in sustained minus 40 F ground; all four dome skirts are 4 to 60 feet, so the 4 foot earthen skirt needs an insulated apron, PROPOSED). Snow must be melted for catchment: about 0.35 kWh per gallon (1,200 Btu), trivial for a family of five (about 9 kWh a day) but real for a livestock barn.

**Livestock and wildlife.** Unheated barns at minus 40 F kill stock; the existing `cold.ts` rules apply; wildlife thins and winter game dries up; wolves and feral dogs push on the fence (PROPOSED weight bump through `encounterWeights`).

**Snow load.** Roof loads: fresh powder is about 0.5 psf per inch, settled snow about 1 to 1.5, wet snow up to 2.5. PROPOSED `snowLoad.ts` mirrors `ashfall.ts`: ground load by region and year; roof load about 0.7 of ground load for an unheated roof (code factors for a cold roof); existing `ROOF_CAP` (cabins 45 to 60, barns 25, greenhouses 10, tunnels 5) and `roofVerdict` decide strain, risk, collapse. A plateau of 90 psf (Mountain West) collapses an unshoveled timber cabin (63 psf load against 50 to 60); shoveling is 3 person-hours per inch per 1,000 sq ft (existing `shovelHours`), and a braced roof carries 1.35 times. Barns, greenhouses and high tunnels are the first to fall.

**Fuel and equipment (PROPOSED teeth, no new art).** Diesel gels near 10 to 15 F unless winterized or stored warm; lead-acid batteries deliver about half their capacity near 0 F and lithium cannot charge below freezing without a heater; wind turbines ice; micro-hydro freezes; solar output falls to about 0.55 of normal (sun dim) before snow cover, and panels must be wiped (reuse the ash `panels` pattern).

### 2.3 A normal homestead with no dome

Year 1: a wood stove and a woodlot are enough. Year 2: the garden is a cold frame at best; the stored food and the number of cords decide (a cabin burns about 6 to 12 cords a winter in the north; PROPOSED 2 times that at minus 30 F mean). Year 3 to 6: outdoor farming is over in the north; the family survives on stored grain, ice fishing and a heated, insulated, earth-sheltered room (existing berm and bunker ground at 52 F), or moves south (see section 5). Roofs fail unless shoveled; fuel gels; the neighbors arrive wanting wood.

### 2.4 Effects by dome tier (from the model)

Heating loads at default sizes, in frost mode (floor 34 F), with the PROPOSED COP curve: 3.0 down to 17 F, falling linearly to 1.0 (resistance backup) at minus 30 F, then 1.0. This is the main new limit: a standard air-source heat pump locks out at about minus 15 to minus 25 F.

| Tier | Load at minus 20 F (kW thermal, frost mode) | kWh per day at minus 40 F (COP 1) | Snow vs shell (psf) | Verdict |
|---|---|---|---|---|
| Earthen | about 0 (ground at 52 F) | about 0 | 90 | Holds; tiny; a refuge room |
| Geodesic (60 ft, berm) | 41 | about 1,400 | 40 shell vs 0.7 x 0.8 x ground | Sheds snow only while heated; a cold geodesic collapses at about 70 psf ground |
| Glass (150 ft) | 252 | about 8,300 | 60 | Self-clears snow while heated (the shell sheds about 0.5 inch per hour); a dark plant plus 100 psf = loss of the dome |
| Arcology | 967 | about 32,000 | 250 | Holds the snow; cannot be heated without a small power plant |

Heated-shell shedding: heat flux through a glass dome at 70 F inside, minus 30 F outside is about 45 Btu per hour per sq ft, which melts about 0.3 pounds of snow per hour per sq ft (latent 144 Btu per pound), so a powered dome clears itself; PROPOSED roof snow on a dome is 0.7 x ground x shape factor (geodesic 0.8, glass 0.7, arcology 0.6, earthen 1.0) x (1 minus 0.85 x climate share), and the existing `breaches(tier, {snowPsf}, health)` decides failure.

The pattern is the **reverse** of heat. The cold punishes a big warm volume: the glass and arcology tiers need a power source on the scale of a small plant; the geodesic and earthen with ground coupling do best per person. Options for the player: drop to frost mode (default in an ice age); an inner "winter room" (existing `domeHeatK` already credits homes under a powered dome with half a wood stove's work); **thermal curtains** (PROPOSED, a purchase that cuts shell loss about 40 percent at night; no new art if drawn with the existing roof screens); **ground-loop heat pump** (PROPOSED, COP about 3 at any air temperature, the same yard-pad marker as the heat option); wood or biomass boiler (cheap on the existing wood economy: a 57 kW geodesic load is about a third of a cord a day, 50 cords a winter); generators and fuel (a glass dome at 8,300 kWh a day burns about 640 gallons of diesel a day, so fuel alone cannot carry it); solar is poor (0.55 sun, snow cover, 6 to 8 hour days).

**Grow lights.** At 55 percent sun, a dome crop needs supplemental light: about 3.7 W per sq ft of bed over 17 hours (about 63 kWh a day per 1,000 sq ft for full artificial light; about half that at 55 percent sun), at a 34 to 45 F frost-mode band (kale, spinach, carrots, leeks). A snow-covered or frosted shell loses another 30 to 60 percent of light; heated shells stay clear. PROPOSED: the existing `DOME_YIELD` held/shell values scale by sun transmission.

**Plant units in the cold.**

| Unit | Cold stress driver | PROPOSED effect |
|---|---|---|
| Chiller (as heat pump) | Outside below 17 F | Capacity and COP fall to resistance level by minus 30 F; defrost cycles; frost on the coil |
| Substation | Cold is easy on transformers; ice loading on lines and the yard's gantry | Low wear; ice-storm outages (existing `ice_storm` weather) |
| Battery block | Capacity about 50 percent at 0 F | Ride-through hours times 0.5 below 0 F unless the shed is inside |
| Scrubber and water plant | Condensate and pipes freeze if an airlock is cold | Cold vestibule: PROPOSED airlock cycle takes 2 times longer below minus 20 F without heat |
| Roof vents | Ice seizes hatches | PROPOSED 30 percent daily chance a vent is stuck below minus 10 F with the plant dark |
| Yard | Snow drifts block the passage; heavy ice on the tower pad | Needs shoveling (existing hours model), a tie-in to `plantStrike` reachability |

---

## 3. Dome compared across both disasters and the other atmospheric hazards

| Hazard | Earthen | Geodesic | Glass | Arcology | Note |
|---|---|---|---|---|---|
| Runaway heat | refuge only | needs plant (34 kW) | needs plant (180 kW) plus solar | town-sized (730 kW) | The plant is the dome |
| Ice age | holds (earth) | hold if heated, wood | needs 100+ kW; fuel-bound | needs a power plant | Big warm volume is the cost |
| Fallout | strong | good | good | partial | existing |
| Ash and smoke | strong | partial | partial | strongest rating (200 psf) | existing |
| Fire | strong | partial | partial | strong | existing |
| Raiders | hides | visible | visible and valuable | impervious shell, prize | existing |

One climate model serves all the atmospheric disasters. Fallout and ash already add `outsideDirt`; heat adds the plant's temperature stress; cold adds the heating load and snow. A sealed dome is the same lockdown in each case; only the **binding resource** changes (air, power, fuel, water).

---

## 4. Systems and files that would change

All pure logic in plain modules with tests; UI and rendering read them.

| Layer | File | Change |
|---|---|---|
| Pure (new) | `sim/climateCurve.ts` | Heat and cold anomaly curves (smoothstep), regional tables, wet-bulb (Stull) from temperature and `dryAir`, outdoor work-hour gate, outdoor grow factor, ground snow load by region and year |
| Pure (new) | `sim/dome/plantClimate.ts` | COP(T), chiller and heat pump derate and trip, tower wet-bulb limit, tower water per kWh, battery temperature factor, daily wear probabilities, snow shedding |
| Pure (new) | `sim/snowLoad.ts` | Roof load on buildings (reusing `ROOF_CAP`, `roofVerdict`, `shovelHours` from `ashfall.ts`), dome roof load |
| Pure (edit) | `sim/winter.ts` | Add `coldScale`; keep defaults so ash winter is unchanged (test) |
| Sim kinds (new) | `sim/disasters/runaway_heat.ts`, `ice_age.ts` | `KindFx`: onWarning, onHit, daily, serviceMods, supplyMods, priceMods, encounterWeights, radioBulletins, look, cards |
| Sim wiring (edit) | `sim/disaster.ts` | Two `DisasterKind` members, `DISASTERS` entries (variants, tracks, hints, hit, chain), `SURPRISE_POOL`, `SURPRISE_BASE`, `FATE_ODDS` / `VARIANT_FATE`, era-roll exclusion |
| Sim wiring (edit) | `sim/disasterFx.ts`, `disasterBlurbs.ts`, `disasterTeeth.test.ts` | Register fx, blurbs, every teeth column covered |
| Sim (edit) | `sim/regions.ts` | Region odds for both kinds |
| Sim (edit) | `sim/eras.ts` | Slow disasters hold the era open until the curve completes (Q1) |
| Dome (edit) | `dome/live.ts` | `outside()` adds the anomaly (the single place outdoor temperature is made); `outsideDirt` gains none (heat and cold are not dust); COP and capacity derate in `stepOne`; snow load and shedding; fail-safe vent also at hard freeze with plant dark; new cards (heat plant limit, snow on the shell) |
| Dome (edit) | `dome/climate.ts` | COP curve parameter (default flat, so every existing test passes), tower and evaporative wet-bulb limit |
| Dome (edit) | `dome/plantUnits.ts`, `plantStrike.ts` | `PlantCause` adds `heat` and `load`; repair lead time scaling; nothing else (state still read from open jobs) |
| Dome (edit) | `dome/protection.ts` | None to the table; the tests add a monotonic snow-breach property |
| UI (edit) | dome page, Next-steps board, weather chip, setup screen | Readouts and scenario cards (section 6) |
| Render (edit) | `sim/collapseLook.ts`, `engine/world/weather/*`, dome shell material | Sky profiles, snow cover through the ash path, frost on the shell (section 6) |

**Save impact.** Kind state lives in `disaster.fx[kind]` (JSON-safe, no migration). New kinds in the `DisasterKind` union and widened `PlantCause` strings need none. **A save bump (v104, pass-through migration like v103) is needed only if** the PROPOSED purchases persist dome fields: `heatRejection` (`air | high_ambient | tower`), `groundLoop`, `thermalCurtain` as optional `DomeState`/spec fields. Recommendation: land PRs 1 to 8 with **no bump**, and bump once when PR 9 adds purchases.

**Test plan** (Vitest, pure modules, in the existing pattern):

- Monotonic: more damage never improves climate, scrub, water or power (extend `plantUnits.test.ts` across the new causes); a higher outside temperature never improves chiller capacity; COP never rises with outside temperature above 95 F or below 17 F; snow load never falls as ground load rises; roof verdict never improves with more snow.
- Tier ordering: the passive indoor temperature, kWh per day and shell snow rating keep the tier ranking where the model has it (`tierRank` property tests).
- Regression: with no heat or ice disaster active, every existing dome, plant and ash test is unchanged (flat COP default, `coldScale` default).
- Curves: heat and cold anomalies are monotone in time over the ramp, zero before the hit, finite and clamped; region tables produce July highs and January lows inside sane bounds.
- Wet-bulb: Stull outputs for known pairs (110 F and 40 percent: 88 F, 105 F and 70 percent: 96 F) within a degree.
- Kind plumbing: `disasterTeeth.test.ts` (every column covered), `SURPRISE_POOL` and fate tables include both kinds, era roll never repeats a winter kind back to back, determinism by seed.
- Balance (section 5): extend the bot playtest to report survival by build, and compare to the PROPOSED targets.

---

## 5. Balance: keeping the big dome from being the answer

The heat disaster favors a well-powered glass dome; the cold disaster does not. Overall rule (PROPOSED): **a dome buys time and comfort, not safety; the plant, the power and the neighbors decide the outcome.**

**How it is kept fair.**

- **Cost and gates.** The existing gates are $5M cash for glass and $60M for arcology; upkeep $60k to $150k a year for glass, $1.5M to $4M for the arcology. The new loads add real money: a glass dome's heat season is 3,500 to 4,500 kWh a day (about $500 a day at $0.12, or about 280 gallons of diesel), a cold season about 8,000 kWh a day at minus 40 F in frost mode. Solar for heat is 0.6 acre plus batteries; for cold it barely works.
- **Failure modes.** Each plant unit has the daily wear above; the chiller trips above its rated outdoor air, the substation derates, the battery fades with temperature, vents stick in ice. A single missed repair in the worst week is a dome death. The N+1 spares are the only insurance and cost real money (existing `spareUsd`: about $12 per sq ft for a chiller, $3.50 for a transformer).
- **Supply chain.** Repair lead time grows as the `deliveries` track falls (PROPOSED), so the second chiller bought in peacetime is worth ten later.
- **Raiders and refugees.** The existing visibility model and siege order (substation first) apply; plant strikes go for the yard, but the yard is only reachable from inside (just merged), so the player decides how much of the compound to hold. A lit, cool, green dome in a dying county attracts `mass_exodus` crowds and heat or cold refugees at the gate (humanity track, "turned away 14 people"), plus organized crews who want the dome itself. `encounterWeights` lifts raiders (PROPOSED times 1.3 to 1.6 for a visible powered dome in either disaster). Dome fever and shared air (pandemic risk, existing) stay.
- **Difficulty.** Cozy: curves stretched 1.5 times, amplitude times 0.7, repairs cheaper, nobody dies for good (existing rule). Hardcore: faster curve, amplitude times 1.2, a first-winter freeze (existing `winter` knob), permadeath. All through `sev` and `DIFFICULTY`, not a new system.

**What an outdoor-only player can still do.**

| Move | Heat | Cold |
|---|---|---|
| Bunker (existing) | Ground at 52 F: the cheapest cooling; food, water and air decide | Ground at 52 F; heat from the bunker plant; food and fuel decide |
| Tunnels and root cellar | Work and sleep underground in the day | Same; frost-proof storage |
| Greenhouse | Hot: only with night venting, shade and a cooler; a dry-region swamp cooler works | A cold frame or buried "Walipini" style pit greenhouse (PROPOSED reuse of existing greenhouse kinds with a ground-coupled factor) |
| Land choice (Scenario mode, region odds) | Pick a high, north, wet lot (3.6 F cooler per 1,000 feet) | Pick a south slope, low, southern region (south half of the odds) |
| Bug-out (existing `bugout.ts`) | A northern or high-altitude refuge | A southern refuge; roads clog with `mass_exodus` |
| Neighbors and barter | Water and shade trades | Cordwood trades |

There is no mid-run relocation system in the game; I propose **not** building one (Q7).

**What makes a dome run difficult, not trivial.** Power is the whole game, and its source differs by season; the plant has real failure rates and long repairs; the family inside is a closed group (dome fever, morale), the crowd at the gate wants in, the neighbors resent the lights, and every tier above geodesic is a target. A **dome without a plant strategy** (no spare, no solar, no water plan) should fail in the first bad summer or the first blizzard.

**PROPOSED survival targets** (probability the whole family is alive and the home held at year 5 after the hit, Standard difficulty, a competent bot, averaged over regions; targets to tune against, not measurements):

| Build | Runaway heat | Ice age | Why |
|---|---|---|---|
| No dome, no prep | 10 percent | 15 percent | Outdoor day closes; grid dies; wood and a woodlot carry the cold longer than shade carries the heat |
| Bunker only (existing) | 40 percent | 35 percent | Ground-coupled; limited by food, water, air and neighbors |
| Earthen dome | 45 percent | 45 percent | Best insulation per dollar; small |
| Geodesic (T1) | 50 percent | 45 percent | Affordable plant; solar and wood can carry it |
| Glass (T2) | 60 percent | 40 percent | Strong in heat (solar matches the load, water catchment); the heating bill ends many cold runs |
| Arcology (T3) | 55 percent | 30 percent | Impervious but a town-sized load and a prize; collapses without a power plant |

The ordering (not the exact numbers) is what I would hold the harness to: in heat the big dome leads modestly; in cold it does not; no build exceeds 65 percent, and arcology is below glass in both.

---

## 6. Rendering and UI needs

All procedural, no external assets. **No performance budget is raised**: nothing here adds a draw call or a post pass; everything rides existing uniforms and meshes. If a measured change would need a budget, it is cut.

**Sky and atmosphere** (`collapseLook.ts`, `WeatherRenderer`): heat: a white-yellow washed sky, low haze band, sun large and pale, the horizon glowing; cold: a dim grey-blue sky, low sun disc, long twilights, ice fog, aurora tint at night (the code already has aurora for solar flare). Both are profiles in the existing `look` table plus color and haze uniforms.

**Heat shimmer** (PROPOSED): a small distortion term inside the existing atmosphere haze material near the ground at midday, strength from the anomaly. No new pass. If it is not cheap, drop it and keep haze only.

**Snow and ice buildup:** ash already tints roofs and the ground through an ash cover value (`collapseLook` `ash`, `ashColor`); snow reuses that path with a white color and a depth curve. Frost on glass: the dome shell material gets a frost uniform (a tint plus roughness) from the dome's frost value, so a cold shell looks milky and a heated one stays clear, with no new meshes. Icicles and drifts: skipped (PROPOSED cut) for cost.

**Dome page** (existing Dome tab): outside temperature and wet-bulb, plant capacity versus load (a bar), rejection limit (the trip point), battery hours (temperature-adjusted), snow on the shell versus rating (psf), tower or loop water use, next repair arrival. A **Climate limit** card (the existing `FxCard` pattern): "Chiller at 71 percent: outside is 124 F. Rated to trip at 125." One-click actions are the real purchases (spare, high-ambient refit, tower, curtains).

**Warning-sign art** (text and sky, no new art): the existing news ticker and radio bulletins (`radioBulletins`), market and price tells, neighbors (window units, wood piles, leaving), world tells in `collapseLook` (empty roads north or south), and a chip in the existing collapse chip (`collapseChip.ts`).

**Perf notes:** the shell frost and snow uniforms are single value writes; the sky profile is a data row. The mass of work is simulation, not rendering.

---

## 7. Open questions (with recommended answers)

1. **Era length.** These last 4 to 8 game years; `erasDay` forces the next era 3 years after the hit. *Recommend:* slow kinds keep the era open until the anomaly curve is done plus one year, then settle ("the new normal"); the dynasty score uses this era's length. No GDS change beyond a note.
2. **One kind or a family?** *Recommend:* two kinds, two or three variants each (as in section 1 and 2); the shared curve module is reusable for nuclear and asteroid winter later.
3. **Cooling towers and ground loops in the first release?** *Recommend:* no. Ship air-cooled standard and high-ambient first (no new art); towers and ground loops (and thermal curtains) are PR 9 with a single save bump.
4. **Can the player work outdoors at all in year 3 of the heat?** *Recommend:* only dawn and night windows, gated by wet-bulb (full under 80 F, none above 90 F), on the existing schedule, with heat illness as the failure state.
5. **Is the "survival odds" table the right shape?** *Recommend:* yes as targets; arcology below glass in both, glass leads in heat only, nothing above 65 percent.
6. **Difficulty coupling.** *Recommend:* Cozy stretches the curves 1.5 times and shrinks amplitude to 0.7; Hardcore speeds and deepens; everything through `sev` and `DIFFICULTY`, no new setting.
7. **Moving to another region mid-run?** *Recommend:* do not build it. Offer it through Scenario mode (pick the region and lot knowing the odds) and the existing bug-out, plus an "elevation and aspect" hint on the lot card (already in `altitudeClimate`).
8. **Surprise-pool weight.** *Recommend:* 0.15 for heat and 0.12 for ice, a rarity like `reactor_meltdown`, with the region odds above, and never back to back with another winter kind (and never in Era 1's first run unless chosen in Scenario, so a new player meets them deliberately). Your call.

---

## 8. Proposed build breakdown (small, ordered PRs)

| PR | Content | Size | Depends on | Parallel with |
|---|---|---|---|---|
| 1 | `climateCurve.ts` (curves, regional tables, wet-bulb, work gate, grow factor) plus tests; `winter.ts` `coldScale` | S (about 350 lines) | this draft | none |
| 2 | `runaway_heat` kind: `DisasterDef`, `KindFx`, blurbs, pool and fate, scenario card, look profile, no dome changes | M | 1 | 3 |
| 3 | `ice_age` kind (same shape) | M | 1 | 2 |
| 4 | `plantClimate.ts` and dome plant integration: COP, derate and trip, battery temperature, `heat` and `load` causes, repair lead scaling | M to L | 1 | 5 (different files, same `live.ts` seams: sequence the merge) |
| 5 | `snowLoad.ts`, building roof loads, dome snow breach and shedding, shoveling, cold equipment teeth (diesel gel, batteries) | M | 1, 3 | 4, 7 |
| 6 | UI: dome readouts, limit cards, setup and scenario text, collapse chip | M | 4, 5 | 7 |
| 7 | Rendering: sky profiles, snow through the ash path, frost on the shell, shimmer (optional) | M | 1 | 4, 5, 6 |
| 8 | Balance and QA: bot playtest, survival table vs targets, tuning, perf census confirms no budget change | S to M | 2 to 7 | none |
| 9 (optional) | PROPOSED purchases: cooling tower, ground-loop heat pump, thermal curtains; save v104 | M | 4, 6 | none |

Order: 1, then {2, 3} and {4, 5} and 7 in parallel, then 6, then 8, then 9. The only real conflict is 4 versus 5 inside `dome/live.ts`; keep 4 in `plantClimate.ts` and 5 in `snowLoad.ts` and touch `live.ts` in two small, separate hunks.
