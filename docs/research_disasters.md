# Compound Builder: Disaster Research for the GDS

Design input for `COMPOUND_BUILDER_GDS.md`. It covers how each of the 16 disasters would really unfold, what prepper communities and lived accounts say goes wrong, and what fiction does well. Every section ends in **implementable rules**, mostly rules that make *build* choices matter.

**Conventions**
- `T-` = days before the disaster, during the warning period. `H+` = hours after onset, `D+` = days, `M+` = months.
- Rules are written as `RULE:` one-liners so they can go into the GDS or a backlog directly.
- **Source confidence.** Each number is tagged as one of:
  - **(verified)**: checked this session against the cited source or a reliable secondary;
  - **(commonly cited)**: widely repeated in the field, but not checked against a primary;
  - **(design estimate)**: my own extrapolation, for tuning.
- Setting assumption: a rural Mountain West homestead (Montana, Wyoming, Idaho, Colorado or Utah high country). Winter matters, wells are deep, neighbors are miles apart, and the nearest metros are Denver, Salt Lake City, Boise and Billings.

---

## Part 0: The shared collapse clock (applies to almost every disaster)

Most disasters are, in practice, *grid-down plus something*. Instead of repeating this in every section, here is the baseline clock. Each disaster section lists only its deltas.

| Time | What fails / what happens | Notes and sources |
|---|---|---|
| H+0–4 | Refrigeration starts warming. Cell towers fall back to battery. Traffic lights go out. Card terminals and ATMs go down. Fuel pumps can't pump. | USDA guidance: a closed fridge holds about 4 h and a full freezer about 48 h (commonly cited). Tower batteries last roughly 2–8 h, and towers with generators about 24–72 h (commonly cited). |
| H+4–72 | Municipal water pressure falls as pump backup fuel runs out, and boil-water notices follow. Hospitals run on generators; they are required to hold fuel for about 96 h (commonly cited). Grocery shelves empty. | ATA's *When Trucks Stop, America Stops*: minor shortages in 1–2 days and significant shortages in about 3 days, faster with panic buying (verified, [ATA PDF](https://www.trucking.org/sites/default/files/2019-12/When%20Trucks%20Stop%20America%20Stops.pdf)). Texas 2021: millions under boil-water notices, more than 300 carbon monoxide calls in Harris County alone (verified, [NBC](https://www.nbcwashington.com/news/business/money-report/were-seeing-the-winter-version-of-hurricane-harvey-harris-county-judge-says-about-texas-winter-storm/2576269/)). |
| D+3–14 | Medication-dependent deaths start: dialysis, insulin, oxygen concentrators. Carbon monoxide and house fires from improvised heating. Sanitation breaks down where water pressure is gone. | Puerto Rico after Maria: most excess deaths came from *interrupted medical care*, not the storm itself. Households averaged 84 days without power (verified, [NEJM via CBS](https://cbsn.ws/2snNIG4)). Texas Uri: the final state toll was 246, mostly hypothermia (commonly cited, Texas DSHS 2022). |
| D+14–60 | Stored fuel runs out. Wildlife near towns is hunted out. Barter economies form. People in the suburbs start moving outward. | Venezuela: 72–74% of people reported losing an average of 8.7 kg in 2016 (verified, [CNN](https://edition.cnn.com/2017/02/21/americas/venezuelan-food-crisis-weight-loss); [Caracas Chronicles](https://www.caracaschronicles.com/2017/03/02/encovi-2016-tragedy-numbers/)). |
| M+2–12 | Disease (dysentery, typhoid, wound infection), dental abscesses, broken glasses. Gangs consolidate, then local strongmen or militias appear, then some form of governance returns. | Selco (Bosnia): survival came from groups, trade and skills, not stockpiles. Medics and skilled people were "capital" (secondary, [ancientwarhistory](https://ancientwarhistory.com/?p=24734)). |
| Year 2+ | A new equilibrium forms: feudal, communal or restored. Seed saving, livestock breeding and skills decide who thrives. | *Earth Abides*, *Dies the Fire* and *The Postman* all show governance re-forming around whoever holds food and security. |

**Infrastructure restoration anchors:**
- Normal storms: days to weeks.
- Puerto Rico after Maria: about 11 months until 99.998% restored (verified, [WTXL](https://www.wtxl.com/news/all-of-puerto-rico-s-power-is-finally-restored-except/article_19610b92-9b35-11e8-babc-d32822d6682f.html)).
- Destroyed large power transformers: 120–150 *weeks* lead time as of 2023–24 (verified, [Wood Mackenzie](https://www.woodmac.com/ja/news/opinion/4-years-into-a-difficult-transformers-market-in-the-us-is-there-a-potential-end-in-sight/)). Distribution transformers: up to 2 years (verified, [NREL 2024](https://www.nrel.gov/docs/fy24osti/87653.pdf)).
- Lloyd's solar-storm study: 20–40 million US residents out of power for 16 days to 1–2 years (verified, [Insurance Journal](https://www.insurancejournal.com/magazines/mag-features/2013/06/17/295222.htm)).

**Baseline consumption numbers for tuning (commonly cited):**
- **Water:**
  - Drinking: 1 gal/person/day (FEMA minimum).
  - Real household use with hygiene and cooking: 3–5 gal.
  - Garden: about 0.6 gal per sq ft per week in an arid summer.
  - Livestock: beef cow 10–20 gal/day; laying hen about 0.5 pint/day; dog 0.5–1 gal.
- **Food:** 2,000–3,000 kcal per adult per day, and 3,500+ for heavy labour in cold weather. Rice and beans: about 300 lb of grain plus 60 lb of legumes per adult per year (the LDS-style "basic year supply", commonly cited).
- **Heat:** 3–8 cords of firewood for a Mountain West winter, depending on house size and insulation (design estimate from regional extension guidance). Cutting and splitting a cord by hand takes roughly 1–2 person-days.
- **Fuel:** untreated gasoline degrades in about 3–6 months, and stabilised fuel lasts about 1–2 years. Diesel lasts longer. Propane does not degrade.

**RULE (shared):** every disaster runs on the same `CollapseClock`. The disaster profile scales each track (power, water, fuel, food supply, medical, law, comms). Each track has a `failAt` distribution and a `restoreAt` distribution. Telegraphed hints come from the same tracks failing early in the warning period.

---

## Part 1: The grounded disasters

### 1. Grid-down (MVP)

The cause is undetermined or local: a cascading regional blackout, a substation attack, or an equipment failure. Treat it as the base case, the disaster every other one builds on.

**1. Timeline**
- **Warning signs (T-30 to T-1):**
  - Rolling brownouts and utility conservation alerts ("conserve power 4–9 pm").
  - Local news about substation vandalism. Real cases: Moore County, NC, 2022, and Metcalf, CA, 2013, where rifle fire disabled transformers (commonly cited).
  - Utility rate shocks.
  - Power flickers that reset clocks.
  - A neighbor says the co-op linemen are "working 18-hour shifts".
- **First 72 h:**
  - Day 1 feels like a snow day.
  - Day 2: freezers thawing, and gas stations shut because the pumps need power.
  - Day 3: town water pressure drops, and the first boil notice arrives by word of mouth. Phones are mostly dead.
- **First month:** generator owners burn through fuel in 1–2 weeks. Neighbors ask to fill water jugs from your well. Insulin and dialysis patients start dying. Rural people do better because they already have wood stoves and wells, but only if those wells don't depend on grid-powered submersible pumps.
- **Months 2–12:** if the outage is multi-regional and transformers were damaged, restoration is measured in months. Barter starts. Hunting pressure strips local deer and elk. Refugees from the city edges reach the county roads around week 3–6.
- **Year 2+:** power comes back unevenly, hospitals and towns first. You are the last on the line, as in Puerto Rico, where rural customers waited the longest.

**2. What breaks, in order:** cold chain → cell and internet → fuel pumps → municipal water and sewage → pharmacy restocking → refrigerated medicines → food supply → law enforcement (fuel and staff) → schools and churches become hubs.

What becomes scarce:
- fuel, batteries, propane;
- insulin and prescription medicines;
- clean water in towns;
- information (rumours replace news).

**3. Human dynamics:**
- **Week 1:** curious neighbors and friendly requests.
- **Week 2–4:** desperate neighbors, and "can I charge my phone off your solar?". That is an OPSEC failure: everyone now knows you have power.
- **Month 2+:** organized theft of fuel and livestock, at night.

What preppers say goes wrong:
- the generator is noisy and advertises you;
- carbon monoxide from generators or grills run indoors;
- the well pump has no backup power, so the "well" is useless;
- untested gear (dead batteries, a generator that won't start after storage without stabiliser);
- the family won't eat the food storage they bought (a flavour-fatigue complaint on r/preppers, commonly cited);
- the plan never got carried out. One blogger after a 5-day sub-zero outage: "intentions count for nothing" (verified, [morethanjustsurviving](https://morethanjustsurviving.com/prepper-lessons/)).

**4. Systems tested:** power redundancy, water independence, heating, food storage depth, cold storage, comms, OPSEC.
- **RULE:** each water source needs a pump path. A submersible well pump runs on grid, solar or generator power. A hand pump or bucket is a separate build. A well with no non-grid pump yields 0 when the grid is down.
- **RULE:** a generator emits a noise radius of about 400 m (and about 1 km at night for unmuffled units, design estimate). A baffle box or a buried exhaust halves it. Any `Encounter` roll while it runs gets a visibility bonus.
- **RULE:** solar panels in view of the road raise `Visibility` (they are glints by day and "the house with power"). Ground-mounted arrays behind berms or roof arrays on the far side of the house don't.
- **RULE:** lit windows at night add `LightSignature`, which you can reduce with blackout curtains (a cheap build), cellar living or exterior shutters. This is why the night windows from University Empire matter for gameplay, not just looks.
- **RULE:** freezer meat becomes `spoiling` at D+2 unless there is power, cold weather (night temperature below -5 °C) or a root cellar. You get a prompt to can, smoke, jerk or share it. Sharing raises `NeighborGoodwill`.
- **RULE (untested gear):** any device the player never ran during a peacetime drill has a 20–35% chance of a first-use fault (a missing part, a bad seal, stale fuel). Each drill clears it.
- **RULE:** the medical dependency trait on a family member (insulin, CPAP, oxygen, dialysis) sets a hard countdown. Insulin keeps about 28 days at room temperature once opened (commonly cited) and needs cold storage for long-term stock.

**5. Fiction beats:**
- *One Second After* (Forstchen): the diabetic daughter's insulin runs out, a slow, telegraphed countdown that is unbearable. The town council organizes, then hangs looters publicly. The nursing home fills with dead in week 2. Refugees on the interstate are turned back at a roadblock.
- *Into the Forest* (Hegland): power fades out, not off. The sisters ration the last gasoline for the one thing that matters.
- *Leave the World Behind*: the uncanny early silence. No phones, a strange noise, deer herds in the yard, and the neighbor (Danny) who prepped and won't share.

**6. Chained aftermath:** end of the rule of law (in severe cases), pandemic (cholera or dysentery in towns), or financial collapse (if it is long enough).

---

### 2. Financial collapse

A banking crisis, sovereign debt failure, hyperinflation or currency devaluation. The power stays on, mostly. *This is the disaster where the stuff still exists and you can't buy it.*

**1. Timeline**
- **Warning signs (T-90 to T-1):**
  - Bank failures in the news, and lines outside a bank.
  - Grocery prices up 3–5% a month.
  - Shrinkflation, then empty shelves for specific items such as baby formula or eggs.
  - Gold spikes. Fuel prices whipsaw.
  - "Temporary" withdrawal limits.
  - A neighbor laid off from the mine or mill. A local business closes.
- **First 72 h:**
  - A bank holiday: ATMs show "temporarily unavailable".
  - Argentina 2001: the *corralito* capped withdrawals at 250 pesos a week and froze accounts for 90 days. Card payments still worked (verified, [Wikipedia: Corralito](https://en.wikipedia.org/wiki/Corralito)).
  - Panic buying.
- **First month:**
  - Price controls lead to shortages.
  - Pot-banging protests (*cacerolazo*) and rioting. Argentina's December 2001 riots killed 39 and toppled the president within weeks (verified, [Wikipedia: Cacerolazo](https://en.wikipedia.org/wiki/Cacerolazo)).
  - Deposits are force-converted. In Argentina, dollars became pesos at 1.4 when the market rate went much higher.
- **Months 2–12:**
  - Hyperinflation or a long grind.
  - Venezuela 2016: people lost 8.7 kg each on average, and medicines ran out.
  - Lebanon 2019–22: the lira lost about 90% of its value, and the state grid fell to 3–4 h a day. Private diesel generators filled the gap at dollar prices (verified, [UNHCR VASyR 2022](https://ialebanon.unhcr.org/vasyr/files/vasyr_chapters/2022/VASyR%202022%20-%20Energy.pdf); [PRI](https://www.pri.org/stories/2021/11/22/lebanon-s-electricity-crisis-means-life-under-candlelight-some-profits-others)).
  - Crime grows: express kidnappings, home invasions, theft of copper and livestock.
- **Year 2+:** a dual economy (dollar, barter, local). Emigration. Infrastructure decays slowly because there is no money for maintenance. Rolling blackouts become routine.

**2. What breaks:** savings → imports (medicine, spare parts, tires, electronics) → the maintenance budget for public services → policing quality (corruption) → rural roads and power lines.

What becomes scarce:
- imported medicines;
- spare parts and tires;
- formula and diapers;
- vehicle parts;
- ammunition;
- seeds (if imported);
- cash in the "hard" currency.

FerFAL's emphasis, from his Argentina writing and TSP interviews ([TSP Ep. 2512](https://www.thesurvivalpodcast.com/fernando-reality-of-collapse)), commonly cited:
- the most useful thing is a skill that earns money in the new economy;
- quality tools last;
- a little cash in hard currency is essential;
- crime, not starvation, is the main threat;
- **isolated rural homesteads were the most vulnerable to long, violent home invasions**, while close-knit small towns did best. This is from an Argentinian essay often reposted alongside FerFAL (secondary, [forum repost](https://theliberalgunclub.com/phpBB3/viewtopic.php?p=404122)).

**3. Human dynamics:**
- Sustained low-level crime rather than one horde.
- Burglary while you're away (at work or in town), so a compound that is never unattended matters.
- Livestock rustling.
- Fuel theft from tanks.
- Corruption: the deputy wants a "fee".
- Government requisition shows up as price controls, mandatory selling to state buyers, and expropriation of "unproductive" land (Venezuela's farm seizures, commonly cited).

Preppers' failure modes:
- holding wealth only in paper or in gold (gold is hard to spend for food; Selco: gold "not very valuable at all");
- showing wealth, such as a new truck or fresh paint, during a downturn;
- over-investing in a bunker instead of an income-producing homestead.

**4. Systems tested:** self-sufficiency of the homestead economy (eggs, garden, crafts), barter, maintenance and repair, security while the place is staffed but not under siege.
- **RULE:** prices index to inflation weekly. Store goods get a `scarcity` multiplier by category (imported medicine ×5, fuel ×3). The player can sell surplus eggs, meat, firewood and repair labour. **A workshop with a mechanic skill generates barter income.**
- **RULE (unattended compound):** if every adult leaves the compound (a supply run, a job), the burglary chance per day = base × `Visibility` × (1 − dogs − alarm − neighbor watch).
- **RULE:** a fresh build or upgrade during a collapse raises `WealthSignal` for 30 days, which draws attention. So does a shiny vehicle.
- **RULE (requisition):** with a law level of `Corrupt` or `Authoritarian`, the "county agricultural officer" visits and demands a quota of production. Options: pay, hide the production (needs a concealed root cellar or storage), or refuse (raises `HeatWithState`).

**5. Fiction beats:**
- *Parable of the Sower* (Butler): a slow collapse with jobs gone and water costing more than gas. The walled neighborhood thinks it is safe until the arsonists come.
- *Leave the World Behind*: Danny's hoarded supplies and his refusal to share.
- Real: the Argentine *trueque* barter clubs, and the Lebanese generator mafias.

**6. Chained aftermath:** end of the rule of law, a grid decaying into rolling blackouts, or civil war (pulpy unlock).

---

### 3. End of the rule of law

Policing and courts stop working: a fiscal collapse, a mass police walk-off, a contested-election crisis, or a regional breakdown. The utilities may still partly work.

**1. Timeline**
- **Warning signs:**
  - 911 response times stretch to hours, then "no officers available".
  - The sheriff on local radio asks residents to "look after each other".
  - Prison or jail releases due to staffing.
  - Highway robberies on the interstate.
  - Gun stores sold out.
  - A neighbor's quad gets stolen and nobody comes.
- **First 72 h:** opportunistic looting in towns. Score-settling. Rural areas are quiet at first, because criminals hit the dense, easy targets.
- **First month:** gangs form around drug crews and ex-cons. Roadblocks appear, some community-run and some predatory. In Selco's Bosnia, the first weeks were chaos, and then factions with weapons controlled food and movement.
- **Months 2–12:**
  - Militia or warlord consolidation.
  - "Taxes" (protection money) demanded from farms.
  - Kidnapping for ransom.
  - Night raids on isolated places.
  - Community watch networks or posses form.
  - A Rhodesia-style farm-defense pattern: every farmhouse linked by an *Agric-Alert* radio net with morning and night roll calls, grenade screens on windows, security fences with simple alarms, dogs, and a designated safe room (verified, [Feral Jundi repost of *A Farmer at War*](https://feraljundi.com/strategy-the-defense-of-farms-and-ranches/); [CSM 1986](https://www.csmonitor.com/1986/1208/owar.html)).
- **Year 2+:** a local strongman, a county-level militia government, or a returning state with reprisals and amnesties.

**2. What breaks:** deterrence → property rights → road travel safety → markets (they move to "safe" zones) → reporting of crimes (nobody records them).

What becomes scarce: safety, trusted people, ammunition, fuel (it gets hijacked), medical care for gunshot wounds.

**3. Human dynamics:**
- **Week 1:** nothing.
- **Week 2–6:** probing visits ("looking for my dog"), thefts from outbuildings.
- **Month 2+:** organized raids by 4–15 people, usually at night or dawn. Some of them first try a pretext parley.

What goes wrong:
- people talk at the feed store about their stores ("loose lips");
- sentry fatigue, because sustained watch rotations exhaust a small family. This is the most common critique of the "lone family fortress" in prepper forums, often summarised as "you can't stand watch 24/7 with four people";
- a single point of failure at the gate;
- no plan for treating casualties;
- shooting the wrong person (a neighbor's kid) and the legal and social fallout.

**4. Systems tested:** layout and perimeter, watch rotation, community, alarms, the safe room or bunker, morale.
- **RULE (watch math):** each adult provides about 8 h of alert watch a day before `Fatigue` builds. Encounter detection probability scales with watch coverage hours ÷ 24 × the sightline score. A 4-adult family can't cover 24 h *and* do chores, which forces trade-offs or alliances.
- **RULE (radio net):** a `CommsRadio` plus at least one allied neighbor with a radio creates a `MutualAid` link. A raid on either gives the other a response roll (1–3 helpers arriving in 10–30 minutes). Daily roll-call check-ins cost 5 minutes and keep the link alive.
- **RULE:** window grilles or shutters lower the `Breach` chance for each structure. Bedrooms placed away from the exterior wall, or behind an earth berm, lower night-raid casualties.
- **RULE (safe room):** a defended core room or bunker turns a "lost" raid into "raiders loot outbuildings and leave" instead of casualties. The bunker should make losing survivable, not make you win.
- **RULE (sightlines):** cleared ground out to 100–300 m around the core gives raiders no cover, so detection comes earlier. Trees close to the house give cover and concealment both ways, which helps hiding but hurts defending. This is a deliberate trade-off against the `Visibility` and `gray man` strategy.

**5. Fiction beats:**
- *The Postman* (Brin): the Holnist survivalists *are* the raiders. Hyper-individualist preppers turned feudal predators.
- *Dies the Fire*: the Portland Protective Association, a warlord using medieval-recreation thugs who "offer protection".
- *The Road*: a house cellar full of captives being kept as food. A moral line in the sand.
- *Parable of the Sower*: the wall doesn't save Robledo, because the threat came over it at night with fire.

**6. Chained aftermath:** civil war (pulpy), pandemic or epidemics, financial collapse.

---

### 4. Drought

A multi-year megadrought, plausible for the Mountain West and Colorado River basin. Slow, grinding, and dramatic only in its cascades: wildfire, crop failure, wells going dry, water law conflicts.

**1. Timeline**
- **Warning signs (T-1 to 2 years, as seasons):**
  - Low snowpack reports ("40% of normal").
  - Reservoir level news (Lake Mead or Powell "dead pool" stories).
  - Burn bans. Hay prices doubling.
  - Ranchers selling herds early at the sale barn.
  - The well driller is booked out 6 months.
  - A neighbor's well "sucks air in August".
- **First 72 h:** not applicable. This is a slow disaster, so model it in seasons, not days.
- **Season 1:**
  - Irrigation curtailment ("call on the river": senior water rights first).
  - Garden losses. Hay shortages.
  - Domestic wells failing. In Oregon's Klamath Basin in 2021, more than 200 domestic wells went dry in one summer and the county trucked non-potable water weekly (verified, [OPB](https://www.opb.org/article/2022/06/06/klamath-county-oregon-drought-residential-wells-water-emergency/); [deschutesriver.org](https://www.deschutesriver.org/in-the-media/some-klamath-basin-families-lose-running-water-as-wells-run-dry)).
- **Season 2–4:** aquifers drop by feet a year (Klamath was projected about 10 ft lower in a year, verified). Livestock destocked. Rural towns lose their water systems. Water theft from tanks and stock ponds. Wildfire seasons get worse.
- **Year 2+:** abandonment of marginal land, Dust Bowl style, and water as the main currency.

**2. What breaks:** surface water → shallow wells → hay and forage → livestock → gardens → deep wells (slowly) → rural community water → the farm economy.

What becomes scarce: water, hay, feed grain, well-drilling services, seeds for drought-tolerant crops.

**3. Human dynamics:**
- Neighbors ask for water. "Can I fill my tank?" quickly becomes a weekly expectation.
- Water rights conflict: the state or ditch company enforces curtailment and can confiscate illegal pumping.
- Theft from stock tanks.

Preppers' lessons:
- a cistern and roof catchment beat a single well;
- graywater reuse;
- mulch and shade cloth;
- don't rely on a single shallow well;
- Western water law is hostile: rainwater catchment was historically restricted in Colorado until a 2016 law allowed two rain barrels (commonly cited).

**4. Systems tested:** water redundancy, storage, catchment, garden efficiency, livestock count, fire defenses.
- **RULE:** each well has a `depth` and a regional `waterTable` that drops each drought season. When the table falls below the pump intake, yield → 0 and deepening costs money and a contractor. Deeper wells cost more upfront.
- **RULE:** roof catchment yield = roof area × precipitation × 0.6 per gallon-per-sq-ft-inch factor (about 0.62 gal per sq ft per inch). Cistern size caps storage. Bigger roofs (barn, workshop) mean more water, so outbuilding placement and roof material matter. A metal roof is cleaner than shingles.
- **RULE:** graywater reuse (a build) returns about 50% of household water to the garden.
- **RULE (water law):** with the `Curtailment` flag set, using surface or irrigation water triggers an inspector event. A cistern hidden behind the barn and drip lines lower detection.
- **RULE:** livestock water demand is shown up front. During a drought, each animal costs water per day, which forces culling decisions (slaughter and preserve, or sell before prices crash).

**5. Fiction beats:**
- *Parable of the Sower*: water that costs more than gasoline, and water peddlers.
- *The Grapes of Wrath*: the Dust Bowl exodus.
- *Mad Max: Fury Road*: Immortan Joe rationing the aquifer as a source of power ("Do not become addicted to water").
- *Interstellar*: dust storms and blight. Good ambient sky beats.

**6. Chained aftermath:** wildfire or megafire (strongly linked), financial collapse (farm economy), end of the rule of law (water wars).

---

### 5. Pandemic

A naturally emerging high-mortality respiratory pathogen. Calibrate it between COVID and 1918, not a zombie plague. The point is that **infrastructure stays physically intact but staffing fails**.

**1. Timeline**
- **Warning signs (T-60 to T-1):**
  - A foreign cluster of "atypical pneumonia".
  - WHO statements. Airport screening.
  - The first domestic case. Hospitals restrict visitors.
  - Masks and thermometers sell out. Runs on toilet paper and rubbing alcohol, as in COVID March 2020.
  - A neighbor's nurse daughter says "it's bad in the ER".
- **First 72 h after declaration:** school closures, stay-at-home orders, panic buying, and the travel lockdown.
- **First month:**
  - Hospital capacity exceeded.
  - Workforce absenteeism. US pandemic plans have long assumed up to about 40% absenteeism at the peak wave (commonly cited, HHS pandemic influenza planning).
  - Supply chains degrade through staffing, not damage. Infrastructure (water, power) runs on skeleton crews.
- **Months 2–12:**
  - Waves, typically 2–3. In 1918 the second wave was the deadliest.
  - Mortality rises without hospitals.
  - Social trust erodes: strangers are threats in a literal, biological sense.
  - Quarantine roadblocks around towns, sometimes self-appointed.
- **Year 2+:** endemic, with immunity and a vaccine. Or, at high mortality, *Station Eleven*-style depopulation with infrastructure intact but nobody to run it.

**2. What breaks:** medical supplies → hospitals → staff-dependent services (trucking, power line repair, water treatment) → schools and community gatherings → trust.

What becomes scarce:
- N95s, gloves, bleach;
- fever reducers;
- oxygen;
- antibiotics (for secondary pneumonia);
- people (labour).

**3. Human dynamics:**
- Refugees fleeing cities and possibly carrying the disease.
- The core dilemma: help the sick stranger at the gate?
- Quarantine enforcement by authorities (and requisition of medical supplies).
- Lessons from preppers and from COVID:
  - masks and isolation work only if everyone complies, and morale drops under long isolation;
  - a single infected trip to town can bring it in;
  - stock depth of OTC meds matters;
  - "the gray man" doesn't apply to germs: isolation and quarantine discipline does.

**4. Systems tested:** quarantine and isolation infrastructure, medical bay, airlock and decontamination, food independence (no supply runs), morale.
- **RULE (quarantine yard):** a quarantine cabin or outbuilding at least 30 m from the main living area lets new arrivals or returning scouts isolate for N days (the pathogen's incubation period, 5–14). Skipping it rolls `InfectionChance` on every contact.
- **RULE:** every supply run rolls exposure. PPE stock lowers it. The "decon entrance" (mudroom with wash station) is a build that lowers household spread.
- **RULE:** infected family members need a caregiver (labour), fluids (water) and fever meds. An isolation room in the medical bay lowers secondary infection by about 70% (design estimate).
- **RULE:** a refugee or stranger at the gate shows visible symptoms or none. Stance options: turn away, give supplies at a distance (the "drop point", a buildable gate feature), quarantine them in the isolation cabin, or admit them. A buildable `DropBox` at the gate lets you trade without contact.
- **RULE (staffing collapse):** at high severity, the grid and water tracks fail from absenteeism around M+1 to M+3 instead of from damage.

**5. Fiction beats:**
- *Station Eleven*: the Georgia Flu kills in 48 h. Jeevan stockpiles groceries for his brother and holes up in a high-rise; the airport becomes a town and a museum of civilization ("Survival is insufficient").
- *The Stand*: Captain Trips. Bodies in the Lincoln Tunnel. Survivors drift together (Boulder versus Las Vegas).
- *Earth Abides*: a natural virus. Ish watches water, power and literacy fade over a generation.
- *Children of Men*: infertility as a slow pandemic, with refugee cages and a broken-down state.
- Real: the 1918 flu in rural communities. Towns in Colorado (Gunnison) barricaded themselves and stayed largely spared (commonly cited, "protective sequestration").

**6. Chained aftermath:** financial collapse, end of the rule of law, grid-down (from staffing).

---

### 6. Nuclear war

Two variants with random severity:

- **6a. Distant strikes + fallout.** Missile fields, bases and cities are hit hundreds of km away and fallout arrives hours later.
- **6b. Nearby strike.** A blast, thermal pulse and EMP within 10–50 km.

**Mountain West specific:** the ICBM fields are Malmstrom AFB (MT), F.E. Warren AFB (WY/CO/NE) and Minot AFB (ND). A counterforce strike on them is the *main* source of heavy fallout plumes in the Mountain West and Plains (commonly cited, FEMA and other risk maps). That makes the setting's nuclear risk distinctive and very relevant.

**1. Timeline**
- **Warning signs (T-30 to T-0):**
  - International crisis headlines. Embassy closures.
  - DEFCON rumours. Military traffic, bombers, tankers.
  - Potassium iodide (KI) sells out.
  - Bank runs.
  - Emergency alert tests.
  - "Missile convoys moving at Malmstrom."
  - The neighbor says to fill the tub.
- **H+0 (nearby):**
  - A flash: don't look at it.
  - Blast, which breaks windows tens of km away.
  - EMP from a high-altitude burst damages electronics.
- **H+0.25–24 (fallout):**
  - Fallout arrives 15 minutes to several hours later, depending on distance and wind. It looks like sand-like grit.
  - Ready.gov: "get inside, stay inside" for at least 24 h. The first hours are the most dangerous. Battery and crank radios work, and phones may not (verified, [archived Ready.gov](https://webharvest.gov/congress115th/20190109034511/https://www.ready.gov/nuclear-blast)).
- **The 7-10 rule:**
  - For every 7-fold increase in time, the dose rate drops 10-fold: H+7 h = 1/10 of the H+1 h rate, H+49 h ≈ 1/100, H+2 weeks ≈ 1/1000 (verified, [Science News](https://www.sciencenews.org/blog/gory-details/nuclear-attack-theres-no-avoiding-brutal-math); Kearny, [*Nuclear War Survival Skills*](https://archive.org/download/MManuals/nuclear_war_survival_skills.pdf)).
  - Kearny's guidance is to stay in shelter mostly for about 2 weeks in heavy fallout, with short trips out as the rates drop (commonly cited from NWSS).
- **Protection factors:** a one-storey wooden house gives about PF 2, and the basement of a large building about PF 200 (verified, Science News). An expedient trench shelter with about 3 ft of earth cover gives roughly PF 200–1000 (commonly cited from Kearny). A dedicated bunker gives PF 1000+.
- **First month:**
  - Survivors emerge.
  - Contaminated food and water, with a priority on covered stores.
  - Burns and trauma in the nearby case.
  - No grid, if there was EMP or strikes on infrastructure.
  - Refugees from target cities.
  - Martial law.
- **Months 2–12:**
  - Radiation-contaminated crops and grazing, through iodine-131 (half-life 8 days) in milk, and caesium-137 longer term.
  - Possible climate effects. "Nuclear autumn" or winter after a large exchange: Xia et al. (2022) modelled more than 5 billion famine deaths after a full US–Russia war, with global calorie production down about 90% by years 3–4. Northern latitudes are hit hardest (verified, [CU Boulder](https://www.colorado.edu/today/2022/08/15/nuclear-war-would-cause-global-famine-and-kill-billions-study-finds); Nature Food 3:586).
- **Year 2+:** in a large exchange, crop failure is the killer, not radiation. Short seasons, frost in summer. In a limited one, slow reconstruction under a federal or military authority.

**2. What breaks:** everything at once, if there is EMP or strikes on infrastructure. Otherwise: trust in food and water → outdoor work (dose limits) → animals (exposed livestock take doses too) → medical care.

What becomes scarce:
- uncontaminated water and food;
- KI (blocks thyroid uptake of iodine-131, needs to be taken early);
- dosimeters (KFM homemade fallout meters per Kearny);
- shelter space;
- antibiotics (radiation suppresses immunity).

**3. Human dynamics:**
- **H+0–48:** neighbors beg to share your shelter. This is the "who do you let in?" moment, the iconic dilemma (*The Twilight Zone* "The Shelter").
- **D+3–14:** refugees on foot, many with radiation sickness.
- **M+1:** military or FEMA requisition and martial law checkpoints.
- **M+3:** raiders who survived.

Preppers' lessons:
- you won't know your dose without a dosimeter;
- ventilation in a crowded shelter is the real killer in summer. Kearny devotes a whole chapter to the hand-made KAP (Kearny Air Pump) because heat and CO2 build up;
- water storage in the shelter;
- a sanitation bucket plan;
- boredom and claustrophobia;
- decontamination at the entrance (brush off and remove outer clothes).

**4. Systems tested:** the bunker (the game's core build), PF, NBC filtration, ventilation, stores, decon, comms, per-person dose.
- **RULE (PF):** a cell's protection factor = product of the mass shielding (earth or concrete thickness: every about 3.6 in of packed earth halves gamma, so a "halving thickness" is 3.6 in earth / 2.4 in concrete, commonly cited from Kearny) × geometry (below grade, distance from the roof). Dose per hour = outdoor rate ÷ PF. Show PF per room as an overlay.
- **RULE (dose):** each person accumulates rem. 0–50: no effect. 50–100: mild nausea risk. 100–200: radiation sickness, recoverable. 200–450: severe, about 50% lethal without care around 350–450 (LD50/60, commonly cited). Above 600: fatal. Chronic dose raises long-term cancer risk, shown on the report card.
- **RULE (time out):** the dose budget per outdoor task drops with time per the 7-10 rule. Tending animals at H+7 costs 10× more dose than at H+49. Animals left outside take full dose, so an earth-sheltered barn or a buried coop is a deliberate build.
- **RULE (ventilation):** shelter occupancy × hours → heat and CO2. Without forced air (a KAP, an electric fan or the NBC blower), occupancy above design causes heat stress after 24–48 h in summer.
- **RULE (decon):** an entry vestibule with a brush-off and clothing drop prevents carried-in contamination (+X dose to the room otherwise).
- **RULE (who gets in):** shelter space = beds + standing room. Admitting neighbors lowers stores per person but raises `Community` and the labour pool later.
- **RULE (contaminated food):** food and water stored outside or uncovered is `contaminated` for M+1 (milk and leafy greens until about 2 months for iodine-131). Root cellar and bunker stores are safe. Well water from deep, covered wells is safe, while open cisterns and ponds are contaminated. **A covered cistern vs an open pond is a build choice.**
- **RULE (EMP, nearby variant):** unshielded electronics in a high-altitude burst footprint get a % failure roll. A Faraday cage protects spares. Pre-1980 vehicles are mostly unaffected (commonly cited; actual testing in the 2004 EMP Commission report showed modern cars mostly stalled briefly rather than being destroyed, a nuance worth reflecting).

**5. Fiction beats:**
- *Threads* (1984): Sheffield. Rationing centers. Food hoarders shot. The survivors' children speak a degraded English 13 years later. Wartime "Protect and Survive" leaflets: the government tells you to take your doors off and build an inner refuge.
- *The Day After*: Lawrence, KS. Cars stall from EMP. The farmer's family in the basement. Squatters on his land, and he is shot for objecting.
- *Alas, Babylon*: Fort Repose, FL. Money becomes worthless overnight. Salt runs out. Looters die from radioactive jewelry looted from a ground-zero city. Ham radio and Morse code as lifelines.
- *Swan Song*: the "Earthmound" bunker (hubris of the bunker-rich). Sister and the glass ring.
- *Jericho*: a Kansas town. Salt as currency. Rivalry with neighboring New Bern (a community versus community conflict).
- *Fallout*: Vault-Tec. Bunkers as social experiments, a tone reference for the pulpy end.

**6. Chained aftermath:** nuclear winter (large exchange), financial collapse (definitely), end of the rule of law, pandemic (cholera and typhus in camps).

---

### 7. Solar flare (Carrington event)

A severe coronal mass ejection (CME) causes geomagnetically induced currents in long transmission lines, which burn out high-voltage transformers. Small electronics mostly *survive*, unlike EMP myths. The grid doesn't. Communications satellites and GPS degrade.

**1. Timeline**
- **Warning signs (T-72 h to T-15 h):**
  - NOAA Space Weather Prediction Center G5 watch.
  - Spectacular auroras far south. In 1859 they were visible in the Caribbean and Cuba (verified, [encyclopedia.pub](https://encyclopedia.pub/entry/30444)).
  - Ham radio blackouts.
  - GPS errors (tractor auto-steer drifting).
  - News: "utilities preparing for possible outages".
  - The CME's arrival is typically 15–72 h after the flare, with about a 15–60 minute final warning from the DSCOVR / ACE satellites at L1 (commonly cited).
  - Neighbor gossip: "Did you see the northern lights? Red ones!"
- **H+0:**
  - Lights flicker, then the grid collapses in minutes. Quebec, 1989: the Hydro-Québec grid collapsed in 90 seconds and 6 million people were out for 9 hours (verified, [siliconcanals](https://siliconcanals.com/sc-c-in-1859-a-solar-storm-now-called-the-carrington-event-pushed-auroras-as-far-south-as-cuba-and-induced-currents-so-strong-in-north-american-telegraph-lines-that-operators-disconnected-their-batter/)).
  - Long wired lines spark. In 1859, telegraph operators got shocks and some sent messages with the batteries disconnected (verified, same).
- **First 72 h / month:** the grid-down baseline, but transformer damage means months, not days. Lloyd's: 16 days to 1–2 years for 20–40 million people.
- **Months 2–12:** patchy restoration. The north and Atlantic corridor are worst hit. The Mountain West is moderate, but long lines are vulnerable.
- **Year 2+:** replacement transformers arrive (120–150+ week lead times).

**2. What breaks:** high-voltage grid → anything grid-dependent (water, fuel, comms) → GPS and satellites (precision agriculture, logistics) → shortwave radio (temporarily). Your own small solar setup survives if disconnected; long DC cable runs could take minor induced current (design estimate: low risk).

What becomes scarce: same as grid-down, for longer.

**3. Human dynamics:** same as grid-down, but there is an obvious cause and a legible government story ("transformers will arrive"). That keeps order for longer, weeks rather than days, before it breaks down. That "waiting for restoration" period is a tension curve the game can play with.

**4. Systems tested:** the same as grid-down, plus protecting electronics and disconnecting.
- **RULE:** if the player sees the warning hints (aurora event, NOAA alert on radio) and runs the `Disconnect` action (open the main breaker, unplug the inverter from the grid tie) before impact, their solar and electronics are safe. If not, grid-tied inverters have a 30% damage chance (design estimate).
- **RULE:** grid-tied solar *without* a battery and islanding switch does nothing during an outage (true in real life: anti-islanding shuts it off). A battery plus hybrid inverter is required. This teaches a real lesson.
- **RULE:** the Faraday cage is mostly irrelevant for a flare (it matters for EMP). Signal this honestly in the UI so the player learns the difference.

**5. Fiction beats:**
- The Carrington telegraph operators running on aurora current, a great radio vignette.
- *Leave the World Behind*: the uncanny early stage when nobody knows what is happening.
- *The 5th Wave*: the EMP-like first wave (pulpy).

**6. Chained aftermath:** end of the rule of law (when restoration lags), financial collapse, pandemic (water systems down).

---

### 8. Wildfire / megafire

A wind-driven fire in the wildland-urban interface. A fast-onset local disaster: hours of warning, and the outcome is decided by **materials and defensible space** chosen during peacetime. Ideal for the build game.

**1. Timeline**
- **Warning signs (T-season to T-hours):**
  - Red flag warnings. Drought and "critical fire weather".
  - Smoke columns on the horizon.
  - Ash falling and an orange sky.
  - Power utility "public safety power shutoffs".
  - Evacuation "Ready, Set, Go" levels.
  - The neighbor's scanner says the fire jumped the highway.
- **H-6 to H-0:**
  - Embers arrive *before* the flame front, and can land 1 mile or more ahead.
  - **Embers cause up to 90% of home ignitions** (verified, [IBHS](https://ibhs.org/ibhs-news-releases/damage-analysis-of-2017-2018-wildfires-shows-importance-of-mitigation/)).
  - Roads clog with evacuees. In the Camp Fire (Paradise, CA, 2018) people died in their cars.
- **H+0 to H+6:**
  - The flame front passes in minutes.
  - Structures burn for hours from embers.
  - The house-to-house spread observed in the Camp Fire (verified, IBHS) means spacing between buildings matters.
- **First month:**
  - Burned landscape. Water systems contaminated by benzene from melted plastic pipes (Paradise and Tubbs, commonly cited).
  - Ash. No power (lines burned).
  - Looting of evacuated areas.
  - Insurance chaos.
- **Months 2–12:** debris flow and flood risk on the burned slopes in the next rain. Loss of grazing and timber.
- **Year 2+:** rebuilding, or the land left fallow.

**2. What breaks:** power (shutoff or burned lines) → water pressure (firefighters draw down municipal water) → road egress → structures → wells (pumps and lines melt) → plastic water lines.

What becomes scarce: everything locally, temporarily. Housing for evacuees. Hay (pasture burned).

**3. Human dynamics:**
- Evacuate or stay and defend. Many deaths happen in late evacuation.
- After the fire: looters in the evacuated zone, and burned-out neighbors seeking shelter.
- Preppers' lessons:
  - clean gutters;
  - a 0–5 ft non-combustible zone ("Zone 0");
  - ember-resistant vents (1/8 in mesh);
  - a metal roof;
  - a pump with its own power and a water supply (pool or cistern) with fire hoses;
  - the evacuation bag and plan;
  - the "last-resort shelter" (a cleared area, or the bunker if its air supply is protected).
- Research is mixed on how much 0–30 m of defensible space matters relative to near-home work, but the 0–5 ft zone has the clearest benefit (verified, [CSIRO / *Wildfire*](https://www.publish.csiro.au/wf/Fulltext/wf21176)).

**4. Systems tested:** materials, spacing, vegetation management, water for firefighting, the bunker as a last-resort refuge (air!).
- **RULE (ember ignition):** each structure has `EmberResistance` from its roof (metal, tile > asphalt > wood shake), its vents (mesh or not), and its 0–5 ft zone (gravel vs bark mulch vs woodpile against the wall). During a fire event, each structure rolls ignition = ember density × (1 − EmberResistance).
- **RULE (spacing):** a burning structure ignites any structure within 10 m (about 30 ft) with a chance based on the target's siding and window type. Clustering buildings (good for defense) hurts in fire. **A real trade-off.**
- **RULE (fuel load):** trees within 30 m (100 ft) of structures add flame-front intensity. Thinned and limbed trees add little. The player maintains this with a recurring `Clearing` chore, so it costs labour.
- **RULE (firefighting water):** a cistern or pond plus a gas or solar pump plus hoses lets the family "stay and defend". Without them, staying is a death roll.
- **RULE (bunker refuge):** a bunker shelters people during the front only if its air intake is filtered or sealed. Otherwise smoke and CO kill (it happened in Australian bushfire bunkers, commonly cited). The NBC filter or a seal-and-wait (about 30 min of air for N people) handles it.
- **RULE (egress):** a single road out is a risk modifier. Two exits (a gate onto the county road and a ranch track) halve evacuation failure.

**5. Fiction beats:**
- Real: the Paradise Camp Fire, with people sheltering in a parking lot and in the Feather River Hospital lot. The "orange sky" San Francisco 2020 day.
- *The Ministry for the Future* (Robinson): a heat wave (not fire, but a similar beat of mass casualties).
- *Into the Forest*: the house in the woods as both refuge and trap.
- *The Road*: burned forests as the world's backdrop.

**6. Chained aftermath:** drought, flood or debris flow (a minor chain), financial collapse (insurance), grid-down (local).

---

### 9. Supervolcano / ash winter

A Yellowstone supereruption or a large VEI-7 eruption. For a Mountain West compound this is *close to ground zero*. Ash depth and the climate effects are the story.

**1. Timeline**
- **Warning signs (T-months to T-days):**
  - Earthquake swarms at Yellowstone.
  - Park closures. Ground uplift reports. New fumaroles.
  - Strange animal behaviour. Bison leaving the park.
  - USGS Yellowstone Volcano Observatory alert level raised to Watch, then Warning.
  - Sulphur smell. Geyser behaviour changing.
  - The neighbor says the Old Faithful schedule is off.
- **H+0 to D+7:**
  - The eruption, lasting days to weeks.
  - Ash fall is the key hazard. The USGS model (Mastin et al. 2014): decimeters to meters in the northern Rockies, centimeters to decimeters in the Midwest, millimeters to centimeters on the coasts. Reported about 1.4 m at Billings and about 10 cm at Denver (verified, [USGS](https://www.usgs.gov/publications/modeling-ash-fall-distribution-a-yellowstone-supereruption); secondary for the city figures).
  - Pyroclastic flows within roughly 60 km.
- **Ash effects:**
  - It is not soft. It is pulverised rock and glass, abrasive and conductive when wet.
  - Wet ash weighs 1,000–2,000 kg/m³, so 100 mm loads a roof with 1–2 kPa.
  - At Rabaul, more than 50% of roofs collapsed at 500–600 mm. Long-span, low-pitched roofs are vulnerable at about 100 mm or less (verified, [USGS roof loading](https://volcanoes.usgs.gov/volcanic_ash/roof_loading.html)).
  - Vehicles stall with clogged air filters. Mount St. Helens 1980 dumped about 600,000 tons on Yakima (verified, [Yakima Herald](https://www.yakimaherald.com/news/local/fire-battalion-chief-remembers-mount-st-helens-eruption-as-black-cloud-over-yakima/article_e15bd83c-9cd2-59d2-aae3-af2adb3dc9a5.html); [USGS](https://volcanoes.usgs.gov/volcanic_ash/mount_st_helens_infrastructure.html)).
  - Crops and pasture fail at about 100–150 mm (secondary).
- **First month:**
  - Darkness at noon during ash fall.
  - Respiratory illness (silicosis-like).
  - Water contamination (ash in cisterns, fluoride leaching, commonly cited).
  - Livestock die from eating ash-covered forage (fluorosis, Iceland Laki 1783, commonly cited).
  - Power lines arc on wet ash.
  - Mass evacuation of the near field.
- **Months 2–12:** a volcanic winter. Sulphate aerosols cool global temperatures by perhaps several °C. "The year without a summer", 1816, after Tambora: frosts in June in New England (commonly cited). Growing seasons fail.
- **Year 2+:** a multi-year agricultural crisis, then recovery. Ash makes fertile soil in the long run.

**2. What breaks:** roofs (long span first: barn, workshop), vehicles and engines (filters), power lines (flashover), water (ash in open water), pasture, gardens, respiratory health, then the growing season, globally.

What becomes scarce: N95 masks (again), air and engine filters, clean water, animal feed, a viable growing season, light (low solar output under the ash plume).

**3. Human dynamics:**
- Near-field evacuation (FEMA camps). In *Ashfall* (Mullin) the camps are worse than staying.
- Refugees heading south and east.
- In the Mountain West the compound may be *in* the evacuation zone. Stay or go is the main dilemma.
- Preppers' lessons:
  - shovel the roof before the load builds (and roof work is dangerous);
  - seal the house;
  - protect the engines;
  - stockpile filters;
  - cover water sources;
  - ash in the solar panels.

**4. Systems tested:** roof strength, sealed buildings, covered water, air filtration, the greenhouse and indoor growing, stored food depth (multi-year).
- **RULE (roof load):** each roof has `pitch` and `span`. The ash load accumulates per day. Wet ash (after rain or snow) doubles density. Collapse threshold ∝ framing strength ÷ span. Shovelling labour clears it. **Steep metal roofs shed ash** (real: wet ash builds up to 15 cm on metal roofs up to 25° pitch, verified, USGS Pinatubo).
- **RULE:** open water sources (pond, uncovered cistern, rain catchment) become `contaminated` during ash fall. Disconnect catchment downspouts ("first-flush diverters" as a build).
- **RULE:** solar output × (1 − ash cover on panels) × (sky opacity from the aerosol). Panel cleaning is a chore.
- **RULE:** vehicles and generators with no extra filter stock fail after N operating hours in the ash.
- **RULE (volcanic winter):** the growing season shortens by 30–60 days for 1–3 years, with random killing frosts. **A greenhouse, cold frames and a root cellar move from nice-to-have to essential.** Stored grain depth is the main buffer.
- **RULE (livestock):** animals grazing on ash need stored hay or they get fluorosis and die.

**5. Fiction beats:**
- *Ashfall* (Mike Mullin): an Iowa teen walks through the ash to find his family. Ash on everything. "Flensers" (cannibal gangs). FEMA camps as prisons.
- *The Day After Tomorrow*: climate catastrophe, for the "darkness, cold" ambience.
- Real: 1816, the "Year Without a Summer" (frosts in July, crop failures in New England and Europe); Mount St. Helens' daytime darkness in Yakima.

**6. Chained aftermath:** volcanic winter famine, end of the rule of law, financial collapse.

---

### 10. Cyberattack on infrastructure

A state-actor attack on power, water, pipelines, banking and communications, possibly coordinated. Distinguishing feature: **uncertainty and partial failure**. Things work, then don't, and nobody knows what is true.

**1. Timeline**
- **Warning signs:**
  - A news story on Volt Typhoon-style pre-positioning in utilities (commonly cited, CISA advisories 2023–24).
  - Ransomware hitting hospitals and city governments. Card payment outages at major chains.
  - Gas station shortages after a pipeline shutdown. Colonial Pipeline, 2021: up to 69% of North Carolina stations ran dry from panic buying (verified, [ABC7](https://abc7news.com/gas-shortage-2021-colonial-pipeline-prices-panic-buying/10625599/)).
  - The neighbor's bank app shows zero balance "temporarily".
- **First 72 h:**
  - Multiple simultaneous failures: grid blackout in several regions, banking and card networks down, water treatment SCADA failures, GPS spoofing, phones partly up.
  - Ukraine 2015: about 225,000 customers out for 1–6 h. Restored by sending operators to substations to switch breakers by hand, while the attackers had bricked converter firmware (verified, [CCDCOE](https://cyberlaw.ccdcoe.org/wiki/Power_grid_cyberattack_in_Ukraine_(2015))).
  - The US grid has fewer manual operators.
- **First month:** partial restoration, then repeat attacks. Information chaos: deepfakes, a false emergency alert, rumours. Martial law over communications. Banking records corrupted, so money becomes uncertain, which blends into financial collapse.
- **Months 2–12:** depends on severity. Either restoration in weeks with lingering instability (rolling blackouts, cash-only economy) or a cascade into the grid-down baseline.
- **Year 2+:** a mostly restored but distrustful, analogue-first society.

**2. What breaks:** payment systems → fuel distribution → grid (regionally) → water treatment → comms and information integrity → logistics (GPS, routing) → trust.

What becomes scarce: cash, fuel, information that can be trusted, generators.

**3. Human dynamics:**
- Initially calm, since people assume it'll be fixed.
- Then a panic rush on fuel and food.
- The key human threat is *misinformation*: a false "FEMA distribution point" draws people into a trap or into a crowd, and rumours of the compound's "stockpile" spread.
- Preppers' lessons:
  - keep cash in small bills;
  - paper maps;
  - offline information (printed manuals);
  - a ham radio to verify news;
  - don't connect smart devices to the home network (the Ring camera, the smart thermostat).

**4. Systems tested:** analogue redundancy, comms verification, cash, "smart home" fragility.
- **RULE (smart device fragility):** every "smart" build component (Wi-Fi cameras, smart locks, inverter app, smart well controller) has a `CyberFailure` chance during a cyberattack. "Dumb" versions are immune but lack the convenience or features (remote viewing). This makes a real design choice early.
- **RULE (rumour engine):** news arrives as `Rumour` with a hidden truth value. A ham or GMRS radio with a trusted contact lets you `Verify` (costs time). Acting on false rumours costs fuel and exposure, and can lead into ambushes.
- **RULE:** cash on hand lets you buy during the first-week window when stores accept cash only. After a week the window closes.

**5. Fiction beats:**
- *Leave the World Behind*: the Tesla pile-up (self-driving cars hijacked), the mysterious sonic weapon, the false emergency alert, the leaflets in Arabic dropped from the sky.
- *Lights Out* (Ted Koppel, nonfiction): grid cyberattack and the absence of a federal plan.
- *Mr. Robot*: the 5/9 hack as a financial-collapse cascade.

**6. Chained aftermath:** financial collapse (strongly linked), grid-down, end of the rule of law.

---

## Part 2: The pulpy unlockables

These need no realism check on the *cause*, but the *consequences* should still run on the shared collapse clock. That keeps them consistent with the grounded game, and it is what the best fiction does.

### 11. Zombies

A reanimation plague. To keep the abstract-combat model, treat zombies as a **density field that moves**, not as individuals.

**1. Timeline**
- **Warning signs:**
  - "Rabies-like" violent outbreaks abroad.
  - Bite injuries at the ER. Reports of "riots" at hospitals. Quarantined towns.
  - The military suddenly in the city. A government denial.
  - The neighbor's brother says the National Guard is "shooting sick people".
- **First 72 h:** the hospital is the epicenter. Panic flight on the highways (traffic jams become death traps). Governments use military force with mixed results.
- **First month:** cities fall. Survivors hide or flee to rural areas. Infrastructure fails from staffing (as in a pandemic), plus there are no repair crews.
- **Months 2–12:** herds (hordes) migrate, slowly but in very large numbers, drawn by noise. Human survivors become the real threat: raiders and cults. Seasonal: in cold climates the dead freeze in winter (*WWZ*'s "go north" logic). That makes **the Mountain West winter a gameplay boon**.
- **Year 2+:** the dead decay or don't, depending on the canon chosen. Fortified communities establish themselves.

**2. What breaks:** cities and hospitals first, then the pandemic-staffing pattern.

What becomes scarce: ammunition (noise is a problem anyway), medical, safe people.

**3. Human dynamics:** survivors at the gate. "Were you bitten?" is the new quarantine question. Human gangs and settlements: The Walking Dead's Governor, Negan and Alexandria.

**4. Systems tested:** walls (finally walls matter straightforwardly), noise discipline, quarantine, fortification layout.
- **RULE (noise attracts):** each noise event (gunshot, generator, dog barking, hammering) adds to the local horde-attraction field. Gunfire attracts more than it kills. **Melee and silent defenses (spike pits, moats, fences) become efficient.**
- **RULE (horde pressure):** a horde pushes on the wall as `pressure = density × time`. Wall integrity by material: chain-link < wood palisade < cinderblock < earth berm + ditch. A ditch or moat in front cuts pressure by about 50% (they fall in).
- **RULE (winter freeze):** at temperatures below -10 °C the dead are inactive. Winter is a working season for repairs and scavenging.
- **RULE:** a bitten person goes through a `Turn` timer (hours to days). The isolation cabin doubles as a holding cell.

**5. Fiction beats:**
- *World War Z*: the Battle of Yonkers (modern military doctrine fails against the dead). The Redeker Plan (cold triage of who to save). Phalanx, a fake vaccine. Refugees freezing in Canada.
- *The Walking Dead*: the prison (walls work until people breach them). The CDC. Alexandria's walls. Herds diverted by noise.
- *The Last of Us*: Bill's town, with fences, traps, a generator, wine. The most memorable "a lone prepper compound done right" beat in fiction, and a love story. Kansas City's insurgency against FEDRA.
- *Z Nation*: comedy and absurd tone, for the "unlockable" flavour.
- The Max Brooks *Zombie Survival Guide*: remove the stairs to your second floor.

**6. Chained aftermath:** end of the rule of law, pandemic (the real disease), winter famine.

---

### 12. Invasion

A foreign military occupies or invades part of the US. The Red Dawn scenario. Treat it as a mix of civil war and requisition.

**1. Timeline**
- **Warning signs:**
  - Escalating international crisis. A cyberattack on the grid as an opening strike.
  - Unusual air traffic. Satellite outages.
  - Military mobilisation and call-ups of reserves and National Guard.
  - Rumours of paratroops.
  - The neighbor's son in the Guard gets called up.
- **First 72 h:** air and missile strikes on bases and infrastructure (the Mountain West has Malmstrom, Hill AFB, F.E. Warren). The grid goes down. An airborne or seaborne landing elsewhere. Communications jammed.
- **First month:** front lines. Occupied zones with curfews, checkpoints and ID cards. Collaboration versus resistance. Your homestead is either behind the lines, a supply source, or on a road the army uses.
- **Months 2–12:**
  - Requisition of food, fuel and vehicles by the occupiers or by US forces.
  - Partisans want your support.
  - Reprisals against villages near ambushes (a historical WWII pattern).
- **Year 2+:** liberation or negotiated partition.

**2. What breaks:** grid and communications first, then mobility (checkpoints), then property (requisition).

What becomes scarce: fuel (requisitioned), vehicles, freedom of movement, information.

**3. Human dynamics:** soldiers at the gate (the occupier's foraging patrol, or a US unit requisitioning). Partisans asking for shelter (moral risk: reprisals). Collaborators informing on you.

**4. Systems tested:** concealment, hidden stores, bunker as hiding place, escape tunnel.
- **RULE (requisition patrol):** the patrol takes X% of visible stores. **Hidden caches** (buried, behind false walls, in the bunker if it is concealed) are untouched unless an informant or search roll finds them. Concealment quality is a build stat.
- **RULE (partisan support):** sheltering partisans gives future help (intel, protection) but raises `ReprisalRisk` per week.
- **RULE (escape tunnel):** if the compound is about to be overrun, the tunnel lets the family exit with N kg of supplies. This makes the planned escape tunnel matter.
- **RULE (signature):** the visible military value of the compound (a fuel tank, a radio mast, a vehicle fleet) attracts requisition.

**5. Fiction beats:**
- *Red Dawn* (1984): teens become partisans. The "Avenge me!" scene of fathers in a re-education camp.
- *Tomorrow, When the War Began* (Marsden): teens hiding in a valley called "Hell" while their town is occupied.
- *The Man in the High Castle*: life under occupation.
- *Jericho*: soldiers, a contractor army (Ravenwood) and the townspeople.

**6. Chained aftermath:** civil war, financial collapse, end of the rule of law.

---

### 13. Civil war

Domestic political fracture into armed factions. A mix of end of the rule of law, requisition and checkpoints, with sharper identity politics. Handle with care: keep the factions fictional and non-partisan to avoid real-world partisan coding.

**1. Timeline**
- **Warning signs:**
  - Contested elections. States refusing federal orders.
  - Militia rallies. Political violence in the news.
  - Ammo and gun sales spike.
  - Neighbors start flying faction flags, and the neighbor asks "whose side are you on?".
- **First 72 h:** a precipitating event (an assassination, a refused election, a standoff). The federal response. Cities lock down.
- **First month:** front lines along state and county lines and highways. Checkpoints. Purges of "the other side" in towns.
- **Months 2–12:** Selco-style local war. Neighbors become enemies. A sniper on the ridge. Faction militias recruit or conscript. Food requisition.
- **Year 2+:** armistice or a fractured nation.

**2. What breaks:** trust → roads (checkpoints and ambushes) → supply chains → the grid (sabotage) → courts and policing (factionalised).

What becomes scarce: neutrality, trusted information, fuel, ammunition, medical.

**3. Human dynamics:**
- A faction recruiter comes asking for "contributions", then for your sons.
- Refugees from the other faction.
- Neighbors denounce one another.
- Selco: in the Bosnian war, people you had known for years changed sides or turned predatory, and having a group was the difference between life and death (secondary, [ancientwarhistory](https://ancientwarhistory.com/?p=24734)).

**4. Systems tested:** neutrality and diplomacy, community ties, concealment, defense.
- **RULE (faction standing):** each faction has `Standing` with you. Helping one lowers the others. Neutrality is possible but needs a high `Community` score or high concealment.
- **RULE (conscription):** a faction may demand adults of fighting age. Options: comply (lose labour), hide them (bunker, concealment roll), negotiate (trade supplies), resist.
- **RULE (sniper):** a sniper on the ridge is a persistent threat that makes outdoor tasks dangerous within his sightline. Earth berms, walls and covered paths between buildings negate it. **Covered walkways become a defensive build.**

**5. Fiction beats:**
- *Civil War* (2024 film): checkpoints with men who ask "what kind of American are you?". A quiet town pretending nothing is happening.
- *American War* (El Akkad): refugee camps, radicalisation, plague.
- Real: Selco's Bosnia. Sarajevo's siege-sniper alleys (covered by cloth or shipping containers).

**6. Chained aftermath:** end of the rule of law, financial collapse, pandemic (epidemic from refugee camps).

---

### 14. Engineered bioweapon

A designed pathogen, more lethal and faster than natural, possibly targeted. The pandemic template with stronger knobs, plus the **NBC filtration** relevance.

**1. Timeline**
- **Warning signs:**
  - A terror threat. A lab leak story.
  - A cluster of deaths at an airport or stadium.
  - Government evasions. CDC teams in hazmat.
  - The neighbor's son works at the hospital and says they're burning bodies.
  - (The *Dark Winter* exercise in 2001 modelled a smallpox attack spreading to 25 states in two weeks, commonly cited.)
- **First 72 h:** high-lethality outbreaks in several cities at once. Martial law and quarantine. Airports closed.
- **First month:** spread with high mortality (designer pathogen: 30–90%). Medical system collapse. Cities die.
- **Months 2–12:** *The Stand*: a depopulated world with intact infrastructure and few people. Survivors immune or isolated.
- **Year 2+:** a new world. Few survivors, plenty of stuff to salvage, and dangerous people.

**2. What breaks:** medical → everything else, from staffing (pandemic logic), faster.

What becomes scarce: people, and medical knowledge.

What becomes *abundant*: salvage (cars, tools, canned food in abandoned stores), as in *Earth Abides* and *The Stand*. Interesting reversal: the salvage economy.

**3. Human dynamics:**
- Early: refugees and the infected.
- Later: survivor bands gathering, cults, warlords.
- Quarantine dilemmas, as in the pandemic.

**4. Systems tested:** NBC filtration, isolation, quarantine, medical bay. Later, scavenging and expanding.
- **RULE:** if the agent is aerosol-capable, an NBC-filtered bunker with positive pressure is the only full protection during the initial wave. Ordinary houses leak air (about 0.5 air changes per hour).
- **RULE (salvage phase):** after M+3 in high-mortality runs, scavenging abandoned houses yields good loot but rolls for disease, structural hazards and other scavengers.

**5. Fiction beats:**
- *The Stand* (King): Captain Trips escapes from a military lab. The guard's flight with his family. Trashcan Man.
- *12 Monkeys*: the virus released at an airport.
- *Oryx and Crake* (Atwood): the engineered plague and the curated "next people".

**6. Chained aftermath:** end of the rule of law, a depopulated salvage economy, grid-down (staffing).

---

### 15. Asteroid impact

A regional impact or an ocean strike. Ejecta, fires, tsunamis, then an impact winter. In *Lucifer's Hammer* it is actually a comet. Warning time depends on detection: years for a large one, days to weeks for a small one.

**1. Timeline**
- **Warning signs:**
  - The discovery announced by NASA ("1 in 200 probability, refining"). Probability creeping up in the news.
  - Panic buying. "Hammer parties."
  - A military evacuation of the coasts.
  - The neighbor building a root cellar, or one who doesn't believe it.
- **H+0:** the impact. If within about 1,000 km: an air blast, a thermal pulse, earthquakes. Ejecta re-entering triggers fires globally. Ocean impacts cause tsunamis on the coasts.
- **First month:** firestorms, darkened skies, acid rain. Cold. Possibly an "impact winter" of months to years. Massive refugee flows from coasts and burned areas.
- **Months 2–12:** famine (ash-winter logic). Societal breakdown. Survivor communities.
- **Year 2+:** recovery, depending on severity.

**2. What breaks:** depends on size. For the game, model as `ashWinter` + `wildfire` + `grid-down` with tunable severity.

**3. Human dynamics:** the warning phase is unique. Society knows it's coming. Some people quit their jobs, some loot early, some form communities. After the impact, refugees and raiders, as in *Lucifer's Hammer*.

**4. Systems tested:** everything, with long warning time to *build*. This is the only disaster where the player knows it's coming, and the prep phase is a race against a clock.
- **RULE (pre-impact race):** the warning lasts N days with an accuracy that improves over time. Supply prices rise sharply as the date nears. Contractors and materials get scarce. Building early is cheaper.
- **RULE (impact winter):** reuse the volcanic winter rules with stronger values.

**5. Fiction beats:**
- *Lucifer's Hammer* (Niven & Pournelle): the Senator's ranch "Stronghold" as an organized community. The New Brotherhood cannibal army. Saving the nuclear power plant as a symbol of civilization. A rain that never stops (the ocean impacts).
- *Seveneves* (Stephenson): the moon breaking up and the "hard rain".
- *Don't Look Up*: denial, politics and the crowd's reactions.
- *The Last Policeman* (Winters): a pre-impact detective story, about a society that knows the end is coming.

**6. Chained aftermath:** impact winter (famine), end of the rule of law, pandemic.

---

### 16. Alien / unknown event

Something without explanation: aliens, a "Change" in physics (*Dies the Fire*), an uncanny event (*Leave the World Behind*), or a noise-hunting predator (*A Quiet Place*). A sandbox for mixing unusual rules.

**1. Timeline**
- **Warning signs:**
  - Strange lights in the sky, unusual animal behaviour, unexplained radio signals.
  - Government secrecy, a "UFO hearing". Satellite failures.
  - The neighbor swears he saw something in the pasture.
- **H+0:** pick a mode:
  - (a) *Dies the Fire*: the Change. Electricity, explosives and combustion engines stop working, so medieval tech only.
  - (b) *A Quiet Place*: noise-hunting creatures.
  - (c) Alien invasion: the *War of the Worlds* or *Independence Day* style, with ships, attacks on cities and EMP.
  - (d) *Leave the World Behind*: an unexplained combination of events.
- **First month onward:** follow the shared clock with the special rule.

**2–3.** Depends on the mode. In *Dies the Fire*, the cities collapse in weeks and a survival advantage goes to skills (archery, smithing, farming) and community. In *A Quiet Place*, noise discipline *is* the game.

**4. Systems tested:** anything, depending on the twist. Good unlock content because it can flip assumptions.
- **RULE (*The Change* mode):** all electric, electronic and gunpowder-based systems are disabled. Bows, hand tools, draft animals and wood heat become key. Rewards a low-tech compound.
- **RULE (noise-hunter mode):** noise attracts lethal creatures. Any noise event above a threshold in the compound has a chance of triggering an attack. Sand paths (*A Quiet Place*), soundproofed rooms and the bunker as a quiet place are key.

**5. Fiction beats:**
- *Dies the Fire* (Stirling): planes fall, engines die, Portland's warlord. The Bearkillers and the Mackenzie clan as the two models of rebuilding.
- *A Quiet Place*: sand paths, a soundproofed basement, the red lights as an alarm system.
- *The War of the Worlds* (Wells): the Martians die of germs.
- *The 5th Wave* (Yancey): waves of attacks. EMP, then tsunamis, then plague, then infiltration ("trust no one").
- *Falling Skies*: resistance bands.
- *Signs*: boarding up the farmhouse.

**6. Chained aftermath:** end of the rule of law, famine, pandemic.

---

## Part 3: Cross-cutting

### 3.1 The top 25 prepper lessons as game rules

1. **"Two is one and one is none."** Every critical system (water, heat, power, light, comms) needs a backup.
   `RULE:` each critical system with only one source gets a red `SPOF` marker in the build overlay. Report card: "single points of failure at the time of the disaster".
2. **Visibility invites raids.** Light, noise, smoke, smell and wealth signals draw attention.
   `RULE:` `Visibility` = sum of light + noise + smoke + smell + wealth + traffic, each per structure and activity, discounted by terrain and trees. It feeds the encounter generator. A visibility overlay (already planned) shows it.
3. **The gray man.** Look poor, look like everyone else, don't stand out.
   `RULE:` a compound that looks "ordinary" (no visible walls, panels or fortifications) gets fewer targeted raids but less deterrence. A "fortress look" deters opportunists but attracts organized groups. The trade-off is deliberate.
4. **Sanitation kills more than bullets.** In camps and sieges, dysentery, cholera and typhoid killed more people than violence did (commonly cited across humanitarian and military history).
   `RULE:` `Sanitation` per person (latrine, septic, handwashing, water treatment) affects disease risk per week. The septic system without water, or an overflowing latrine near the well, is a big disease multiplier. Show "distance from latrine to well" as a build constraint (at least 30 m, commonly cited guidance is 50–100 ft).
5. **Community beats a lone wolf.** Selco, FerFAL, Rhodesia, *Lucifer's Hammer* and *Jericho* all agree. Lone families don't last against organized threats.
   `RULE:` `Community` = allies and neighbors with a working relationship. Each gives mutual aid, labour, trade, intel. Raids on a compound within a community network get help rolls.
6. **OPSEC: loose lips.** Telling people about your stores makes you a target.
   `RULE:` every peacetime trip to town where you talk about prep (an event choice) adds `Known` to the town's rumour pool. After the disaster, a `Known` compound gets targeted earlier. Hidden stores reduce losses.
7. **Water first.** Rule of threes: about 3 minutes without air, 3 days without water, 3 weeks without food (commonly cited).
   `RULE:` the water track fails first, and the game's tutorial points to it.
8. **Untested gear fails.** Practice, drills and rotation.
   `RULE:` untested gear has a first-use fault chance (see grid-down). A "drill" action per system tests it.
9. **Store what you eat, eat what you store.** Rotate stock.
   `RULE:` stored food has a shelf life and a `familiarity` rating. Unfamiliar or monotonous food lowers morale ("menu fatigue"). A garden and varied stores fix it.
10. **Medical self-reliance.** Antibiotics, wound care, dental and chronic medication.
    `RULE:` the medical bay plus a medical skill lowers mortality from wounds and disease. Without both, a simple infection can kill.
11. **Teeth and eyes.** Dental abscesses and broken glasses are underrated disasters.
    `RULE:` each person has dental and vision traits. A toothache event reduces work output until treated. Spare glasses are an inventory item. *(Selco, FerFAL and Venezuela accounts all mention dentistry, commonly cited.)*
12. **Skills over stuff.** A mechanic, nurse or welder is worth more than gold.
    `RULE:` skills generate barter income and repair capability. Gold is a poor trade good (Selco).
13. **Fatigue and the watch problem.** A small family can't stand guard 24/7.
    `RULE:` watch math (see end of the rule of law). Dogs and alarms extend coverage. Allies extend it further.
14. **Dogs are the best alarm** but can be poisoned or shot.
    `RULE:` a dog adds detection radius at night. Each raid has a chance the dog is killed first. Two dogs in two places is redundancy.
15. **Light discipline.** A lit window is visible for miles.
    `RULE:` lit windows add `LightSignature`. Blackout curtains are a cheap build. (The night windows from University Empire become a gameplay overlay.)
16. **Smoke and smell discipline.** Wood smoke and cooking smells carry.
    `RULE:` the stove chimney emits smoke visible by day. Cooking in the bunker with filtered exhaust, or at night, lowers it. A rocket stove or low-smoke dry wood lowers the plume.
17. **Noise discipline.** Generators, chainsaws, gunshots.
    `RULE:` noise events add `Visibility` and (in zombie mode) horde attraction.
18. **Morale and boredom.** Long isolation is psychologically corrosive. Selco mentions books and games; COVID taught it too.
    `RULE:` `Morale` falls with isolation, monotony and fear. It rises with books, music, games, celebrations, faith, visitors and gardens. Low morale lowers work output and raises conflict.
19. **Have a get-out plan.** Bugging out beats dying in place when the place is lost.
    `RULE:` the escape tunnel and a cache at a remote location (planned build) give a second chance.
20. **Hide your stores in more than one place.** Caches.
    `RULE:` a raid takes a share of each store it finds. Dispersed caches lose less.
21. **Cash, then barter, then skills.** The first-week window when cash still buys.
    `RULE:` cash is valuable for D+0 to D+7, then its value falls.
22. **Power down to the essentials.** People run out of fuel by running everything.
    `RULE:` fuel consumption is shown per device. Load management increases runtime.
23. **Cold kills.** Hypothermia caused most of the Texas 2021 deaths. In the Mountain West, heat is the second track to fail after water.
    `RULE:` each living space has a heat loss rate (insulation, size). Wood heat needs cords. Running out of wood in January is lethal.
24. **Carbon monoxide.** Grills and generators run indoors.
    `RULE:` an unvented indoor heater or generator rolls CO poisoning. A CO detector (cheap build) warns.
25. **Your neighbors are your first and best defense, or your first threat.**
    `RULE:` each neighbor has a disposition that responds to your actions: helping, sharing, OPSEC and trades.

### 3.2 Recurring failure modes for the report card

The report card at the end of a run could call these out by name. Each one is common in both prepper accounts and fiction.

| Failure mode | Where it shows up | Report card line |
|---|---|---|
| Single point of failure | Grid-down, cyberattack, drought | "Your only water source was a grid-powered pump." |
| OPSEC failure | Financial collapse, end of the rule of law | "Your neighbors knew you had six months of food." |
| Untested gear | Grid-down | "Your generator didn't start on day 1: stale fuel." |
| Light and noise discipline | End of the rule of law, zombies | "Raiders found you by your lit windows." |
| Sanitation | Pandemic, long sieges | "Dysentery from a latrine too close to the well." |
| Medical | Every disaster | "A broken tooth turned septic." |
| Morale | Long isolation | "Cabin fever: two family members fought and one left." |
| Lone wolf | End of the rule of law, civil war | "No allies came when you were raided." |
| Hoarding without sharing | Grid-down, pandemic | "The neighbors you turned away came back with a gang." |
| Fortress mentality | Every disaster | "Your walls deterred opportunists but drew the militia." |
| Over-reliance on stores | Long disasters | "Your stores ran out in month 9 and the garden wasn't ready." |
| Tech fragility | Cyberattack, flare | "Your smart well controller bricked." |
| Cold | Mountain West winters | "You ran out of firewood in February." |
| Late evacuation | Wildfire, volcano | "You left too late and were caught on the road." |

### 3.3 Mountain West specifics

- **Low density cuts both ways.** Fewer refugees and raiders, but longer distances to help, and mutual aid takes longer to arrive.
- **ICBM fields** (Malmstrom MT, F.E. Warren WY, Minot ND) make the region a counterforce target, so fallout is the main nuclear threat.
- **Winter.** Cold is the main killer, heat is critical, and firewood is the key chore. Winter also suspends many threats: raiders, hordes and travel.
- **Water law.** Western water rights (prior appropriation), with restrictions on catchment and well drilling.
- **Yellowstone** is close, so a supervolcano is near-field.
- **Wildfire country.** Wildfire risk is high, so materials and defensible space matter.
- **Culture.** The LDS food storage tradition, ranching and hunting, and an armed population make neighbors better prepared and armed. Community potential is high.
- **Game hunting gets depleted quickly** when everyone hunts. Depression-era deer populations were nearly wiped out in many states (commonly cited).

---

## Sources

**Official and data:** ATA *When Trucks Stop, America Stops*; NEJM / Harvard on Hurricane Maria deaths; Texas DSHS (Uri); Lloyd's 2013; Wood Mackenzie and NREL on transformers; Ready.gov nuclear; Kearny *Nuclear War Survival Skills*; Science News on the 7-10 rule; USGS Yellowstone ash and roof loading; Xia et al. 2022 *Nature Food*; IBHS Camp Fire; CSIRO *Wildfire*; CCDCOE (Ukraine 2015); OPB / Klamath wells; UNHCR VASyR (Lebanon); Wikipedia *Corralito* and *Cacerolazo*; CNN and Caracas Chronicles (Venezuela ENCOVI).

**Prepper and lived accounts:** Selco (SHTF School; secondary coverage); FerFAL (*The Survival Podcast* interviews); the Argentinian urban-survival essay; Rhodesian farm defense (*A Farmer at War*, Feral Jundi, CSM 1986); r/preppers and blogs (power outage lessons).

**Fiction:** *One Second After*, *Lucifer's Hammer*, *Alas, Babylon*, *The Road*, *Station Eleven*, *Earth Abides*, *A Canticle for Leibowitz*, *Threads*, *The Day After*, *Swan Song*, *World War Z*, *The Stand*, *Parable of the Sower*, *Ashfall*, *Dies the Fire*, *The Walking Dead*, *Fallout*, *Jericho*, *The Last of Us*, *Z Nation*, *Children of Men*, *Into the Forest*, *The Postman*, *Leave the World Behind*, plus *Red Dawn*, *Civil War* (2024), *American War*, *A Quiet Place*, *The 5th Wave*, *Seveneves*, *The Last Policeman*.

