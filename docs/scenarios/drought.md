# Scenario: drought (megadrought, dust bowl, aquifer collapse and the heat dome)

Status: design only, no code. Existing kind `drought` (variant `megadrought`; warning 90-200 days; `stores` to 0.6, `deliveries` to 0.7, `law` to 0.6, no grid or fuel fall; refugees 1.6x, looters 1.3x; wells fail, creek stops, hand pump dies first, haying and fish effects; 35% chain into wildfire). The audit notes it is real for water and food but has **weak oasis contrast** (no grid fall). This doc adds three variants and heat illness, plus the aquifer as a numeric well model. `docs/DISASTER_TEETH.md` section 4 item 5 (heat dome) is folded in here per the owner's grouping. Conventions in [README.md](README.md).

One line: **a slow disaster that becomes a fast one on a few days of heat.** The long drought is a bookkeeping game of water, feed and herd size; the heat dome is a three-week sprint that kills the old and the unprepared.

## 1. Real-world basis and analogs

| Event | Figures | Use |
|---|---|---|
| Dust Bowl, 1930-1940 | Peak in 1934 (about 80% of the country in drought); Black Sunday, Apr 14, 1935; about 100 million acres severely eroded; roughly 2.5 million people left the Plains states in the decade; "dust pneumonia"; the Soil Conservation Service (1935) and Prairie States Forestry Project (shelterbelts, about 220 million trees by 1942) (commonly cited) | `dust_bowl` variant, `plains`, `hill_country` |
| Western megadrought, 2000-2021 | The driest 22-year period in the Southwest in at least 1,200 years (Williams et al., 2022), with about 40% of the severity attributed to human warming; Lake Mead fell to about 1,040 ft in 2022 (about 27% full), dead pool at 895 ft; the first federal shortage declared Aug 2021 (Arizona -18%, Nevada -7%) (commonly cited) | `megadrought`, `desert`, `mountain_west` |
| Klamath Basin 2021 (Oregon) | More than 200 domestic wells went dry in one summer; the county trucked non-potable water weekly (verified in the research doc) | Wells failing in a season |
| California 2012-2016 | About 100 million trees died in the Sierra; Tulare County had over 1,000 domestic wells dry at the peak (East Porterville trucked water to residents for years); San Joaquin Valley subsided up to about a foot a year in places (commonly cited) | Well failure and subsidence |
| 2011 Texas drought | The driest year on record; about $7.6 billion in agricultural losses; ranchers sold off a large share of the cattle herd; Bastrop fires (commonly cited) | `hill_country`, `plains` |
| 2012 US drought | About 60% of the contiguous US in drought; corn yields down by about a quarter; about $30 billion in losses; the Mississippi River barge-traffic shutdown risk (commonly cited) | The farm economy shock |
| High Plains (Ogallala) aquifer | A few percent to nearly half of the saturated thickness gone in parts of Kansas and the Texas Panhandle since pumping began in the 1940s; declines of 1 to 3 ft per year are common in the worst areas; a large share of the US irrigated acreage and a share of its corn, wheat and cattle depend on it (commonly cited, USGS, Kansas Geological Survey) | `aquifer` variant: the table falls, not rain |
| Cape Town "Day Zero", 2018 | After a three-year drought the city planned to turn off most taps; use fell from about 1.1 billion liters/day to about 500 million; a limit of 50 liters (about 13 gal) per person per day, then 25 liters planned for Day Zero (about 6.6 gal); the rain returned in 2018 (commonly cited) | Municipal rationing texture |
| Pacific Northwest heat dome, Jun 25-30, 2021 | Lytton, British Columbia hit 121 F (49.6 C), then burned; Portland reached 116 F; hundreds of deaths: British Columbia 619, plus well over 200 in Oregon and Washington combined (estimates vary by source); the high-pressure ridge sat for days; Portland streetcar overhead cables melted; shellfish cooked on beaches (verified in a search this session for the temperatures and the order of magnitude of the toll; other numbers commonly cited) | `heat_dome` variant, `pnw` |
| Chicago heat wave, Jul 1995 | About 739 heat-related deaths in a week, mostly poor, isolated elderly (Klinenberg, *Heat Wave*) (commonly cited) | Who dies: the isolated |
| Europe heat wave, summer 2003 | About 70,000 excess deaths across Europe (commonly cited) | Scale |
| Phoenix, July 2023 | 31 consecutive days at or above 110 F; Maricopa County recorded 645 heat-associated deaths in 2023 (commonly cited) | Hot nights as the killer |
| Cattle heat deaths, Kansas, June 2022 | Thousands of feedlot cattle died in a few days of high heat and humidity with no wind (commonly cited) | Livestock losses |
| Grid under heat | CAISO set a record 52,061 MW on Sep 6, 2022 and issued a Flex Alert; ERCOT summer peaks; hot lines sag and derate (commonly cited) | `grid` rolling brownouts |

Not re-fetched this session apart from the heat dome search; see README.

## 2. Warning signs and how the player notices

Existing `warn: [90, 200]` for the long drought; `heat_dome` gets `warn: [3, 10]`.

**Long drought** (existing hints, extended):

| When | Signs the player reads |
|---|---|
| T -200 to -140 | Snowpack at 40% of normal, a **dry spring**, a burn ban, hay prices up 50% |
| T -140 to -80 | The well driller is booked six months; ranchers sell herds early; the creek is lower than anyone remembers; the **well gauge** (new HUD read: static water level in feet below the pump intake) falls a foot a month |
| T -80 to 0 | A neighbor's well sucks air in August; reservoir at dead pool; the county trucks water to a subdivision; irrigation "calls" curtail the ditch |

**Heat dome:** NWS "Excessive Heat Watch" (3 to 5 days), forecast highs 15 to 25 F above normal, a ridge on the weather map ("a heat dome is forecast"); the coolest night of the week stays above 75 F; county cooling centers announced; a power company asks to cut the thermostats.

Notice tools: the **well gauge** and a **rain-gauge** (total vs normal), a **stock tank level**, and the radio. A neighbor with a failing well is a sign you can see on the road (a water tank truck).

## 3. Phase-by-phase timeline

Variants: `megadrought` (the long west and mountain dry), `dust_bowl` (plains soil blowing), `aquifer` (the irrigated plains and a county's wells; the table falls), `heat_dome` (3 to 5 weeks of killer heat, often chained after a drought). The long variants run in **seasons**.

| Phase | `megadrought`, `aquifer` | `heat_dome` |
|---|---|---|
| Hit moment | The day the **creek stops** or the first well fails (existing hit line) | The ridge arrives: day 1 of 4 to 7 above 105-115 F by day, 80-90 F at night |
| First hour | Not applicable; the hit is a season. The family checks the pump | Outdoor work stops after 10 a.m. The first heat-sick neighbor |
| Day 1 | A weekly water haul begins at the county tank | Peak heat 4 to 7 p.m.; AC overloads; grid brownouts begin |
| Week 1 | Garden triage; stock tanks drop; hay is sold out; the **first cattle sale** | **Deaths**: the elderly, infants, the isolated, outdoor workers; livestock deaths; fires start on dry fuel; fish kills; the county opens a cooling center |
| Month 1 | Surface water gone; shallow wells fail; ditches dry; the **herd cull** decision; the grid fine, prices up | The dome breaks (week 3 to 5); lingering damage; wildfire and smoke follow (chain) |
| Month 3 | Wells deepen or fail; refugees from farms; the store shelves thin slowly; fires | Recovery; a hay and water shortage if it was a drought year |
| Month 6 | A second season without moisture; cistern and haul are the economy; selling land and cattle | |
| Year 1 | The "normal" is lower; towns lose their systems; abandonment starts; farm bankruptcies | |
| Year 2+ | The water table falls to where wells need deepening; many farms abandoned; a possible return of rain, or a permanent new climate; **water as the main currency** | Heat domes recur most summers |

## 4. Effects by track, prices, neighbors, raiders, health

| Variant (weight) | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|
| `megadrought` (existing, 3) | add C(90,60,0.85,[400,800],90) (hydro and thermal cooling water, brownouts) | add C(60,60,0.9,[400,800],90) | existing C(30,90,0.6,[400,800],120) | existing C(60,90,0.7,null) | add C(60,90,0.8,[500,900],90) | existing C(120,120,0.6,[500,900],90) | none | add C(90,90,0.8,[400,800],90) (farm credit) |
| `dust_bowl` (`plains` 2, `hill_country` 1) | C(120,60,0.8,[500,1000],120) | C(100,60,0.85,[500,1000],120) | C(60,180,0.4,[600,1200],180) | C(90,180,0.5,[600,1200],180) | C(90,180,0.7,[600,1200],180) | C(180,180,0.5,[700,1300],180) | none | C(60,180,0.5,[600,1200],180) (bank failures) |
| `aquifer` (`plains`, `desert`, `hill_country`, any irrigated county) | none | none | C(60,180,0.7,null) | C(60,180,0.8,null) | none | C(180,180,0.8,null) | none | C(120,180,0.7,null) |
| `heat_dome` (`pnw` 2, `plains` 1, `upper_midwest` 1, `desert` 0.5 (it is already hot), all else 1) | C(1,3,0.5,[10,40],10) (rolling brownouts) | C(1,2,0.8,[10,30],7) | C(2,4,0.8,[10,30],7) | C(2,4,0.8,[10,30],7) | C(1,3,0.4,[14,40],14) (ER overload) | C(2,6,0.7,[14,40],14) | C(2,3,0.8,[10,30],7) | none |

Fate odds: `megadrought` existing `[0.35, 0.45, 0.20]`; `dust_bowl` `[0.20, 0.45, 0.35]`; `aquifer` `[0.05, 0.35, 0.60]` (an aquifer does not refill: most counties adapt by shrinking); `heat_dome` `[0.90, 0.09, 0.01]`.

- **Prices and shops:** `priceMods`: hay x2 to x4 (existing), feed grain x1.8, water in bulk (a 2,500-gal tanker haul $350-$700 and rising), well drilling and pumps (booked out; `drilling` price $11,000 base x1.5 to x2.5 by queue), cattle **crash** as everyone sells (a calf at 50% of price) then **rise**; seed for drought-tolerant crops (sorghum, millet, cowpeas, tepary beans) up; evaporative coolers, fans and ice sell out in a heat dome (x3); gasoline normal; hay and water are barter currency.
- **Neighbors:** neighbors' wells fail and they **ask for water** ("can I fill my tank?" becomes a weekly expectation: `neighborLife` ask events); water theft from tanks and ponds (an encounter kind `water thief` by night; a lock and a camera reduce); disputes over water rights (prior appropriation: the senior user wins, a **curtailment** notice and inspector event for the irrigation ditch: the research doc's `Curtailment` flag), land sales as farmers quit, then some farms abandoned, some neighbors leave in year 2. Heat dome: old neighbors alone: **welfare check events** (the Chicago 1995 lesson): the player may check on them and save lives (a bond reward).
- **Raiders and the encounter mix:** existing refugees 1.6x and looters 1.3x kept; add **water haulers and thieves**, **tanker scams**, **farm foreclosures** (a bank agent), **cattle thieves** (rustling; more in Plains: a herd raid kind reuses the existing livestock theft), wildfire refugees in the dry year. Heat dome: encounters drop during the heat (a visibility-like `heat` factor reduces visits 40% from 11 a.m. to 7 p.m.) and then rise as a few opportunists strike the sick.
- **Health:** the **heat dome** is the big addition: a `heat` meter alongside `cold.ts` (a sibling `heat.ts`): heat index above 105 F and night temperature above 80 F accumulate; vulnerable persons (age under 5 or over 65, medications, obese) take 2x; symptoms: cramps, heat exhaustion, **heat stroke** (a death risk without cooling within hours); hydration need x2 (2 to 4 gal per person per day in the work heat); cooling methods: shade, cellar or bunker (a root cellar or a buried bunker at 55 F is a lifesaver), wet cloths, a swamp cooler, a fan with a power source (solar), a pond or creek to wade, cool baths from the cistern; sleeping outside; hot cars as killers (kids and pets). The long drought: dust and wildfire smoke, dehydration, dysentery in poor water, waterborne illness from low-flow ponds (blue-green algae toxins in low ponds kill dogs and livestock; a **pond toxin** flag).
- **Food and water:** the **well model**: each well has `depth` and a level; regional `tableDrop` per season reduces the level; when the level falls below the **pump intake**, yield zero (existing "wells fail"); **hand pumps** are shallow (cannot lift over ~25 ft: they die first, existing), submersible pumps in deeper bores last longer; deepening costs a **contractor and $11,000 to $25,000** and a queue; **cisterns and roof catchment** (catchment: about 0.6 gal per sq ft per inch of rain, existing rule) matter more with each rain; graywater reuse returns half the household use to the garden; a **mulch and drip** garden uses 30-50% less; crops: corn and squash and tomatoes fail unaided; a drought gardener grows sorghum, tepary beans, cowpeas, okra, amaranth, potatoes under mulch, with **shade cloth**. Livestock: each animal costs water per day (cow 10-20 gal, horse 10-12, sheep and goat 2-3, pig 3-5, hens 0.5 pint): water use is shown at purchase and in the `herd` UI; **destocking decisions** (sell early at a poor price, or hold and haul water at a loss, or slaughter and preserve); hay falls to nothing; haying fails (existing); fish die as ponds shrink; wildfood is less. Dust: gardens lose topsoil to wind in `dust_bowl` (a topsoil meter): cover crops, windbreaks, no-till, mulch and shelterbelts (a build: the existing hedge and tree rows) protect it.

## 5. Structure damage and what protects

Drought and heat harm structures indirectly. Provide small, concrete hooks:

- **Wells and water works** are the structures at risk: `well_hand` and `well_drilled` and **springs** and **ponds** and **cisterns** get a `level` and a `status`. Pump damage by **dry running** (a pump run with no water burns out: a 30% chance when the player forgets to cut it, a **low-water cutoff** switch protects); **pond liners** crack as the pond drops; a **dry creek** removes the micro-hydro and the moat (a moat without water is a ditch; the defense bonus falls: a real tradeoff for compounds that depend on water as a barrier: `waterWorks.ts`).
- **Heat dome:** asphalt shingle and roof membranes soften (cosmetic), **solar panels derate** by about 0.4% per degree F above 77 F panel temperature (inverters throttle above 120 F: a 15-25% derate in a dome), battery banks lose life when hot (a cycle-life cost) and must be kept in a cool room; a **bunker** stays cool; **polytunnels and greenhouses** overheat and kill the crop unless vented and shaded (a real, concrete loss: an event "the tunnel hit 140 F"); livestock shade structures matter. Thin-walled **container houses** are ovens; **adobe, rammed earth, stone and earth-sheltered houses** stay cool (thermal mass: existing `heating.ts` demand has a sibling cooling load: a modest add).
- **Wildfire fuel:** a drought raises fire odds and fuel dryness: a **fireRisk multiplier** (existing `fireRisk.ts`) rises with `droughtDepth` and the building roll `burnChance` is scaled for the chained fire.
- **Soil:** shrink-swell clay foundations crack in extended drought (a cosmetic state-1 foundation roll on clay parcels, x2 in `hill_country`/`plains`); **tree roots and dead trees** (beetle-kill) fall on roofs in wind (a state-1 roll).
- **Aquifer subsidence:** a rare cracked well casing or fissure in `aquifer` (a state-2 event on `well_drilled`).
- **Repair and wealth:** the rich **deepen the well early** (a bore to 400 ft costs $20,000+ and buys a decade), install cisterns, drip, water tenders and shade cloth, buy an AC and solar and batteries; the poor haul water and hand-dig. The **water-right** and **well permit** (the existing permits and county waits) matter: Western law restricts catchment in some states (Colorado allowed two rain barrels only from 2016). The rich buy senior rights with land.

## 6. Regional variation

| Region | Variant weights | Notes |
|---|---|---|
| `mountain_west` | `megadrought` 2, `heat_dome` 0.5, `aquifer` 0.2 | Snowpack-fed creeks; fractured-rock wells drop fast; the existing odds 1.5 for drought |
| `desert` | `megadrought` 2, `aquifer` 1.5, `heat_dome` 0.4 (already hot; the heat is a nights and monsoon-failure story) | Cisterns and rain; low odds of a new "normal"; Lake Mead and Powell texture |
| `plains` | `dust_bowl` 2, `aquifer` 2, `heat_dome` 1 | Ogallala; black blizzards; shelterbelts; cattle and wheat; Kansas feedlot heat |
| `hill_country` | `megadrought` 1.5, `aquifer` 1.0 (Edwards and Trinity aquifers), `heat_dome` 1.2 | 2011 Texas; cedar and fire; wells on limestone; the springs of Edwards Plateau stop |
| `pnw` | `heat_dome` 2, `megadrought` 0.4 (late summer dry, low odds) | The 2021 analog; AC rare; wet-side forests are unprepared; salmon die in warm rivers |
| `upper_midwest`, `north_woods` | `heat_dome` 1, `megadrought` 0.5 | Lake-effect cooling; 2012 drought; tourism |
| `ozarks`, `appalachia` | `megadrought` 0.5, `heat_dome` 1 | Humid heat dome (high wet-bulb); springs and creeks drop; karst wells |
| `rust_belt`, `new_england` | `heat_dome` 0.8, `megadrought` 0.3 | Old brick, no AC; 1936 and 1999-2002 droughts (New England, a documented dry spell) |

Region `odds` for `drought`: unchanged (`mountain_west` 1.5) plus `desert` 1.6, `plains` 1.6, `hill_country` 1.4, `pnw` 0.6 (the heat dome only), others 1.0.

## 7. What the player sees and hears

- **Sky and light:** a pale, hard-blue sky and a yellowish dust haze for the long drought (the existing dust sky); high thin cloud that never rains; red dawns; **dust devils** and **black blizzards** (dust storms) in `dust_bowl`; heat-shimmer on the road in the dome; a white-hot sun disk; hazy dusk; thunderless dry lightning.
- **Terrain:** the creek bed cracked and white, the pond shrinking in rings (a **waterline decal**), brown pasture, dead trees (a gray canopy), dust on every surface, **wind erosion drifts** against fences (Dust Bowl photos), cracked mud, the moat a ditch; ground cracks on clay; a heat shimmer shader on the horizon.
- **Crowds:** water trucks on the road, long lines at a county tank, cattle trucks to the sale barn, empty fields, neighbors with a hose and bucket; in the dome, people asleep in yards, cooling-center queues.
- **UI:** the **well gauge** and **cistern level** chips; a **drought depth** meter on the day card; for the dome: heat index and the night low, a "cooling" status per person; a livestock water demand line.
- **Radio:** "The county has declared a water emergency." "Irrigation curtailment: priority dates after 1912 are shut off." "Hay is $400 a ton." "The National Weather Service has issued an Excessive Heat Warning through Friday." "Cooling centers open at the library." "Lake Mead at 1,040 feet." Day cards: "The creek stopped today." "Three cows in the east pasture are down. The tank is at nine inches."

## 8. Player decisions and strategies

- **Before:** redundant water (a drilled well plus a **cistern fed by roof catchment**, a hand pump to a good depth, a spring, a pond), a **deeper well** bored early, graywater, drip and mulch, drought-tolerant crops, a smaller herd, hay stored two years ahead, shelterbelts, shade cloth, **cool places** (cellar, bunker, earth-sheltered room), solar with a fan, an evaporative cooler, and a plan for the old and kids.
- **During:** the **herd decision** (sell early at a poor price, or hold and haul), the water budget (drinking 1 gal, cooking and hygiene 3 to 5, the garden, the animals), what to share with neighbors (a weekly fill), whether to **deepen the well** (a cash gamble, a queue), whether to join a water co-op (`rules.ts` house rules), and in a heat dome, the day schedule (work in the morning, rest in the cellar by day, sleep outside at night), welfare checks, wet the livestock.
- **Stay or bug out:** for the long drought the right call is usually stay with water; the family can leave if the aquifer falls below any feasible well. A heat dome is a stay-and-hunker unless the house is a tin box with no power.
- **Rich vs poor:** the rich buy water security (a deep bore, a large cistern, tanker deliveries, a swamp cooler, solar) and can **outlast and buy neighbors' land**; the poor haul water by hand, sell the herd early, and rely on neighbors; in a heat dome the poor, old and isolated die, a family with a **cellar** and a **cistern** survives regardless of money; the **Chicago lesson** is that isolation, not income, kills.

## 9. What makes it fun

- **A slow, legible pressure** that suits a builder: every cistern, tank, drip line, deeper bore and shade structure visibly changes the water graph.
- **Real triage choices** (the herd), with a number on every animal's water use, and neighbor politics (the weekly water ask; the water right dispute).
- **A short, intense heat dome** that contrasts with the long drought and gives the family a mini-game of cooling and welfare checks, a different rhythm from raiders.
- **A reversal**: raiders are rare; the antagonist is the sun, and the **water thief** at the tank is a quiet night encounter.
- **Variety by region**: black blizzards on the plains, a failing aquifer in Kansas, the PNW's unprepared heat dome, a dry spring in the Hill Country.

## 10. Parameters and hook mapping

### Numbers

- Water demand: drinking 1 gal/person/day (FEMA), 3-5 gal with hygiene and cooking, garden 0.6 gal per sq ft per week (arid summer), cow 10-20, horse 10-12, goat/sheep 2-3, pig 3-5, hen 0.5 pt, dog 0.5-1 (existing tables). Heat dome: person 2-4 gal/day when working in 105 F, animals x1.5-2.
- Well model: `margin = pumpIntakeDepth - staticLevel`. `tableDrop` per season by variant and region: `megadrought` 1.5-4 ft/yr, `dust_bowl` 2-5, `aquifer` 3-8 (Ogallala hotspots 1-3 ft/yr real, up to 5 in a pumping boom), `heat_dome` 0. Fractured bedrock wells (mountain_west): x1.5 sensitivity; alluvial/valley wells x0.7; deep sandstone (hill_country, ozarks) x0.4. When margin < 0: yield 0. Seasonal recovery +0.5 ft in a wet spring.
- Drilling queue: base 14 days, x(1 + share of neighbors in need) days, price $11,000 x (1 + 1.5 x share); deepening 100 ft more $7,000-$10,000.
- Pond: evaporation 4-5 ft a year in the Southwest; pond level falls by evaporation + use; below 2 ft, algae toxin risk.
- Heat illness: `heat` accumulates per day when heat index above 105 F or night low above 80 F; thresholds mild 3, severe 6, stroke 9; vulnerable x2; cooling actions subtract 2 per cellar-hour. Mortality for an untreated stroke 25%, treated 5% (design estimate). Over the ~5 days of a dome in Standard, a neglected 70-year-old has a 15% death chance; a healthy adult with water and a cellar 0.5%.
- Livestock: heat deaths at a THI over 84 (feedlot cattle) and no shade: 2%/day; with shade and water 0.1%; hens at 100 F+: 5%/day without shade.
- Solar: -0.4% per F above 77 panel temperature; -20% in a dome. Fans/AC: a 5,000 BTU unit 450 W, a 12,000 BTU unit 1,000 W; a dome adds ~+40% to the electric load.
- Grid: brownouts during heat dome as rolling 2-hour cuts at 4-9 p.m., `grid` floor 0.5.
- Curtailment: a ditch call in `megadrought` by year 2 (60% of Western parcels with a surface right): illegal pumping fines $500-$5,000 per day; a hidden cistern reduces detection.
- Water-thief encounter: 1 per 10 nights per unlocked tank in year 2; a lock plus a dog reduce by 70%.
- Dust: topsoil loss 0.5 in/yr on bare tilled ground in `dust_bowl`; cover crops/no-till/shelterbelt cut it by 70%; yield -10% per inch lost.
- Fate odds as above; Hardcore recovery x1.6 (`DIFFICULTY.recovery`).

### Hook seam (`src/sim/disasters/drought.ts`, new `src/sim/heat.ts`, `src/sim/aquifer.ts` pure)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Hay, feed, water, drilling, cooling goods; cattle crash; foreclosure |
| Supply | `daily` | Well table model, cisterns, pond, garden and livestock water, topsoil, dry-running pumps |
| Raiders | `encounterWeights` | Water thieves, rustlers, refugees 1.6x, heat visibility factor |
| NPC | `daily` | Weekly water asks, water-right disputes, welfare checks, farm abandonment |
| Sky | `look` | Dust haze, black blizzard, heat shimmer, shrinking pond, dead trees |
| Infra | `daily` | Brownouts, derated solar, low-water cutoff, moat dry |
| Bldg | `buildingDamage` | Pumps, liners, greenhouse overheating, clay foundation cracks, beetle-kill trees on roofs |
| Med | `medical` | `heat` meter, dehydration, pond toxins, dust pneumonia |
| UI | `onWarning`, `radioBulletins` | Well gauge, curtailment, heat warnings, cooling centers |
| Oasis | `oasisWeights` | A green, watered compound among brown fields: weight `stores` and a new `water` signal (the share of neighbors with failed wells), so the contrast is not only grid |

Ten of ten columns (today about 4).

## 11. Chaining

- **Into `wildfire`** (existing 35% after [60, 200]; raise to 50% in `mountain_west`, `hill_country`, `pnw`), `dam_flood` (a drought-ending flood on baked ground, flash flood; p 0.08), `financial` (farm-credit and land-price collapse, p 0.15 after [120, 400]), `lawless` (water wars, only on `never` fate, existing curve), `pandemic` tail (poor sanitation, p 0.08).
- **A heat dome chain from a drought** (p 0.2 per summer in year 2 of a drought) and **into wildfire** (p 0.3 after [3, 30] days) and **grid_down** brownouts (existing track).
- **From** `ash_winter` (a failed monsoon after ash, flavor), `solar_flare`/`cyberattack` (no AC, no pumps: a grid failure in a dome is the worst case: p 0.05 stacking events).
