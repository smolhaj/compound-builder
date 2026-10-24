# Compound Builder — Game Design Spec v0.1

> Build the family compound you'd want when everything falls apart. Then find out if you were right.

**Pillars**
1. **Building is the game.** Layout, materials and design choices are how you play. Survival tests the build; it doesn't replace it.
2. **Every choice is a trade-off you can see.** Stone walls are beautiful and nearly bulletproof, but slow and expensive. A big greenhouse feeds you, and it also glows at night and tells everyone you have food.
3. **Beautiful by default.** A well-designed compound should be something you want to screenshot: a homestead in the hills, smoke from the chimney, rows in the garden.
4. **Surprise, with warning signs.** You don't know which disaster is coming, so a good build hedges.

**Tone:** mixed. Grounded by default (financial collapse, grid-down, drought, end of the rule of law); pulpy scenarios (zombies, invasion) as unlockables.
**Combat:** abstract. Encounters resolve from the compound's design, the people and their choices. There is no twitch combat, so your walls, sightlines and layout *are* your combat skill.
**Decided:**
- **Building:** kits plus customisation. Place designed structures and customise their material, size and add-ons; walls, fences, paths and planting are freeform.
- **Construction:** people build it over time. You see scaffold, then framing, then cladding; speed depends on skills and headcount.
- **Time:** real time with pause, a day/night cycle and seasons.
- **Platform:** browser first, with a desktop wrapper later.
- **Setting:** the contemporary USA, using real-feeling regions that reuse UE's regional terrain and house styles.
- **Regions** (user: "other land types eventually"). Each region brings its own terrain, vegetation, climate, building styles, land prices and disaster odds. The MVP is the Mountain West; the planned regions are:
  - Appalachia (steep hollows and ridges, hardwoods);
  - the desert Southwest;
  - thick virgin forest (Maine / northern Minnesota);
  - the Great Plains (Kansas, Nebraska);
  - the Pacific Northwest;
  - the Upper Midwest;
  - and more.
- **Farming:** medium depth. Crops depend on season and soil. You can run an orchard, a greenhouse, chickens, goats, bees and a fishpond. Food has yields and spoils unless you preserve it (canning, smoking, the root cellar). Individual plants are not micro-managed.
- **Camera:** a diorama builder camera, plus a walk/fly mode, plus a photo mode.
- **Difficulty:** Cozy, Standard and Hardcore presets (Hardcore has permadeath, fewer warning signs and harsher raids), plus God Mode.

**Modes:** Surprise (default), Scenario (choose the disaster), God Mode (choose and trigger events, unlimited money, sandbox; flagged as sandbox).

---

## 1. Structure

| Phase | Length | Feel | Constraint |
|---|---|---|---|
| **Peacetime** | ~4–8 in-game years (30–60 min) | Cozy builder | Money, day job, zoning and HOA, neighbors' opinions |
| **Warning signs** | A few weeks to months | Rising tension | Time; prices spike; news ticker gets darker |
| **Disaster** | Instant to weeks | Shock | Things break: grid, banks, roads, law |
| **Survival** | 1–3 years | Builder under pressure | Water, calories, power, security, morale |
| **Report card** | — | Vindication or regret | "Your cistern saved 4 lives." "No one knew first aid." |

During survival, building continues with scavenged and produced materials instead of money. The game gets more inventive, not less.

## 2. Building (the core)

### 2.1 Land
- Choose the plot by region (Mountain West, Ozarks, Pacific NW forest, New England, Texas Hill Country, Rust Belt edge-of-town…) and parcel. Size, slope, water table, soil, sun, tree cover, road access and distance to town all matter.
- Terrain shapes everything:
  - High ground gives sightlines and drainage.
  - A creek gives water but also flooding and an approach route.
  - Forest gives cover, firewood and fire risk.

### 2.2 Freeform-on-grid building
- A tile grid for structures, with freeform walls, fences, paths, trenches and planting beds that snap to curves.
- **Modular structures:** foundation → walls → roof → interior, each with a material choice.
- **Rooms** inside buildings (kitchen, pantry, bunk room, infirmary, workshop, radio room, safe room) affect function.
- **Underground layer:** root cellar, cistern, bunker, tunnels between buildings. A separate build view, like Two Point's floor toggle.

### 2.3 Materials (the big lever)
Each material has stats: **cost, build time, skill required, durability, protection, insulation, fire resistance, visibility, beauty, repairability, and whether you can make it yourself after the collapse.**

| Material | Strength | Weakness | Post-collapse source |
|---|---|---|---|
| Timber frame | Cheap, fast, warm, pretty | Burns, weak protection | Your forest + sawmill |
| Log | Beautiful, insulating | Slow, needs skill | Your forest |
| Rammed earth / adobe | Thick, fire-proof, cheap | Slow, weather-sensitive | Your land |
| Stone | Near-indestructible, gorgeous | Very slow, expensive | Quarry / field stone |
| Concrete / CMU | Strong, fast with a crew | Ugly, needs cement | Scavenge only |
| Earthbag / berm | Excellent protection, hidden | Looks rough, damp | Your land |
| Steel / shipping container | Fast, secure | Hot or cold, conspicuous | Scavenge |
| Glass / polycarbonate | Light, greenhouses | Fragile, visible at night | Scavenge only |

**Materials age and weather visibly:** patina, moss, rust, sun-bleached wood. A 10-year-old compound should look lived-in.

### 2.4 Layout matters (systems that read the design)
- **Defense** is computed from design, not stats bolted on:
  - perimeter continuity;
  - choke points and gates;
  - sightlines from towers or windows (raycast coverage map);
  - dead ground;
  - fall-back positions;
  - distance from the road;
  - lighting.
  - A **Defense overlay** shows covered and blind zones.
- **Visibility (OPSEC):** how noticeable the compound is from the road, from the air and at night (light, smoke, noise, generator hum). Low visibility avoids trouble; high capability attracts it. Overlay included.
- **Flow:** walking distance between beds, kitchen, water, latrine, garden and posts, which affects daily labour and morale.
- **Fire:** spacing, firebreaks, roofing material, water access.
- **Comfort and beauty:** gardens, views, porches, a fire pit, a kids' play area and good light all raise morale. A beautiful compound has happier people. This is the aesthetic payoff, and it's mechanical too.

### 2.5 Systems you build
Water (well, cistern, rain catchment, creek pump, filtration), food (garden beds, orchard, greenhouse, chickens, goats, fishpond, smokehouse, root cellar), power (solar, micro-hydro, wind, wood gasifier, generator plus fuel), heat (wood stove, passive solar, thermal mass), waste (composting, septic), comms (ham radio, antenna mast), medical (infirmary), security (walls, gates, towers, lights, dogs, alarms), workshop (repairs, crafting, the sawmill).

## 3. People
- A family of 4–6 to start (procedurally generated, named). Others can join after the disaster: neighbors, refugees, skilled strangers.
- **Skills** (medic, builder, mechanic, gardener, hunter, negotiator, teacher, radio) gate what can be built and run. They're learned in peacetime through courses, which cost time and money.
- Needs, morale, relationships, and kids who grow up.
- **Jobs** are assigned by schedule (watch rotations, garden, chores), Rimworld-lite.

## 4. Disasters (surprise by default)
Each disaster is a ruleset: what breaks, what is scarce, and what threat cadence follows. See the brainstorm table. Disasters can **chain**, e.g. financial collapse → end of the rule of law.

**Disaster table** (decided with the user; details are settled per disaster as each one is built). Each run has **one primary disaster plus a chained aftermath** (a likely follow-on, e.g. nuclear war → grid-down + end of the rule of law).

| Disaster | Kind | What breaks / what it tests |
|---|---|---|
| Grid-down (MVP, built first) | Grounded | Power, pumps, refrigeration, comms → water, food, heat, security |
| Financial collapse | Grounded | Banks, cash, supply chains; chains into end of the rule of law |
| End of the rule of law | Grounded / chained | No police or courts: raids, looters, gate encounters |
| Drought | Grounded | Wells, the creek, crops → cistern, catchment, well depth |
| Pandemic | Grounded | People, trade, arrivals → quarantine, infirmary, med stock |
| Nuclear war | Grounded | Blast (nearby strike) or distant strikes; EMP, fallout plume (~2 weeks sheltering), per-person dose, failed crops, refugees. Severity rolled in Surprise, chosen in Scenario |
| Solar flare (Carrington event) | Grounded | Continent-wide EMP, transformers out for months to years → Faraday storage |
| Wildfire / megafire | Grounded | A fire front with days of warning → defensible space, fire overlay, shelter |
| Supervolcano / ash winter | Grounded | Ash fall, 1–2 years with no summer → greenhouses, stored food |
| Cyberattack on infrastructure | Grounded | Patchwork outages (grid, banks, water treatment, fuel) with rolling partial recovery |
| Zombies | Pulpy (unlockable) | Constant attackers; walls and sightlines |
| Invasion | Pulpy (unlockable) | Occupation, patrols, requisitioning; hiding beats fighting |
| Civil war | Pulpy (unlockable) | Moving front lines, faction territory, conscription, choosing sides or staying neutral |
| Engineered bioweapon | Pulpy (unlockable) | High-fatality pandemic; quarantine and NBC air filtering |
| Asteroid impact | Pulpy (unlockable) | Telegraphed months ahead; impact winter plus tsunami or blast zone |
| Alien / unknown event | Pulpy (end-game unlockable) | Lights in the sky, the grid stops, people vanish |

**Disaster rules** (decided with the user after the research in `docs/research_disasters.md`):
- **Warning** varies by disaster: months for an asteroid, a season for drought, days for wildfire or a solar flare (aurora), minutes to days for nuclear war.
- **Visibility** is a threat-type matrix: a fortress look (walls, guns, lights) deters opportunists and looters but attracts organized gangs, militia and requisitioners; staying unseen (the "gray man") avoids both but deters no one who finds you.
- **Neighbors** are named NPC households on the surrounding farms, each with a disposition, skills, a radio net, trades and mutual aid. You can build an alliance or make enemies.
- **Medical dependency**: some runs draw a family member on insulin, oxygen or heart medication (random). It becomes a story driver: the stockpile, fridge power, finding a medic.
- **Nuclear war** severity is rolled; a rare large exchange adds 1–3 years of nuclear winter (cold, short seasons, famine).
- **Government**: a help-or-hindrance roll per run and region. Either FEMA aid and restored order, or martial law, checkpoints and requisition of fuel and food. Hidden stores matter.
- **Civil war** uses invented, non-partisan factions, never real-world parties.
- **Modes and peacetime length** (user):
  - Surprise rolls a random length and a hidden disaster.
  - Scenario has you pick the disaster and the length (short / medium / long) at setup.
  - **Free build** is a sandbox where nothing happens until the player triggers a disaster by hand.
- **Warning signs** run on a news-ticker strip that darkens as tension rises. They also show in rising prices and in world tells.
- **Money in peacetime:** starting savings plus a salary while an adult keeps a day job. The job costs that adult's daytime build hours and takes them off the compound; quitting means more building and less money.
- **Money after the disaster:** cash collapses to barter. In grid-down it works for a few weeks, then fades.
- **Engine:** one **collapse clock** with tracks (power, water, fuel, food, medical, law, comms). Each disaster sets the track speeds and adds its own effects (fallout, ash, a fire front, herds), so disasters chain naturally.
- **Zombies and hordes:** herds drift across the map as a pressure field that pushes on walls, drawn by noise and light. Individual infected and small groups arrive as encounter events, like raids.
- **Radiation:** each person carries a dose. Rooms have a protection factor (PF) and fallout follows the 7-10 decay. Open water, garden crops and grazing livestock take up fallout, so covered cisterns, stored food and washing produce all matter.
- **Gate choices** move a humanity / morale track that the family feels and the report card grades ("You turned away 14 people"), alongside the practical cost.
- **Nuclear war:**
  - **Warning signs, all four:**
    - news-ticker escalation (crisis headlines, DEFCON changes, embassy evacuations, a market crash);
    - local tells (military convoys on the county road, jets overhead, the missile-field towns emptying, gas lines);
    - the neighbors' gossip (they start talking, buying, leaving or digging);
    - a final "BALLISTIC MISSILE THREAT" emergency alert minutes before the strike.
  - **The strike:** the sky flashes on the horizon, with a mushroom cloud in the distance if the strike is nearby. Then the EMP drops every unshielded light, the sky turns sickly, and fallout arrives hours later as gray dust.
  - **The dash:** each person runs to the bunker from wherever they are when the alert sounds. People in the far field or in town may not make it, so a bunker near the house matters.
  - **Shelter life, about 2 weeks, managed by the player:**
    - ration food and water;
    - run the air (by hand crank if there's no power);
    - deal with sanitation and morale;
    - listen to the radio for news;
    - short dashes outside cost dose;
    - neighbors knock on the hatch, and the player decides whether to let them in.
- **Grid-down:**
  - **Cause:** a random cause per run (ice-storm cascade, a substation attack, a cyberattack or an aging-grid failure), each with its own hints and restoration curve, from days to months.
  - **Water depends on what you built:** the electric well pump dies unless it runs on solar plus battery or has a hand pump; the pressure tank gives about a day; a gravity cistern keeps flowing; creek water needs filtering.
  - **Power:** solar output follows weather and season and charges the batteries, and the player sets priority loads (well pump, freezer, radio, lights). The generator burns real fuel and can be heard about 1 km away.
  - **Social order follows the research curve:**
    - days 1–3: calm and neighborly;
    - week 2: shelves empty and tempers fray;
    - weeks 3–4: the first thefts;
    - month 2 on: organized looting unless power is restored.

    Rural areas lag cities by weeks.
- **Grid power (peacetime):** the homestead starts on the county grid, with cheap power billed per kWh that runs the well pump and the fridge. Solar is grid-tied unless the player buys a hybrid inverter and batteries. When the grid dies, only what you built keeps running.
- **Encounters:** a group shows up with a dossier (size, armed or not, intent). The player picks a stance (hide, parley, warn off, defend or trade). The sim resolves it from detection, deterrence, defense and people, and a short illustrated card shows what happened and what was damaged.
- **Food:** each person needs about 2,000–2,500 kcal a day, from stores, the garden, the coop and hunting. Preserved food lasts and fresh food spoils. Monotony hurts morale. The pantry and root cellar are built up in peacetime.
- **Neighbors:** 4–6 named households.
- **Injuries and death:** wounds, illness and radiation sickness need a medic, meds and the medical bay. People can die on Standard. Cozy prevents death; Hardcore is permadeath with no reloads.
- **Report card:** a newspaper-style page with a grade, the survivors, and concrete lines from the run ("Your cistern saved 4 lives", "No one knew first aid", "The tunnel was never needed").
- **End of a run**: the region recovers, the compound reaches a self-sustaining equilibrium, or the family is lost; then the report card. Endless continue is optional.

**Buying land** (decided with the user):
- **Parcels:** the land round the compound is split into named neighbor parcels (the timber quarter, the creek bottom, the hay field, a neighbor's place), each with an owner and a price.
- **Willingness to sell** depends on the owner's disposition. Owners who like you sell sooner and for less; owners you've annoyed hold out. Old farmers sell when they retire, and estates come up when someone dies.
- **Prices** follow the land's character, at Mountain West per-acre rates:
  - dry grazing is cheap;
  - timber is in between;
  - irrigated hay ground is dear;
  - creek frontage and water rights carry a premium.

  Prices spike during the warning-signs phase.
- **What more land gives you:**
  - stand-off distance (earlier warning, less visibility from the road);
  - resources (timber, water rights, grazing, hay, hunting);
  - zoning room (more buildings allowed, fewer complaints);
  - escape-tunnel routes on your own land.

**Bunker hardening** (user): fallout shielding (protection factor ~1000), Faraday cage / EMP shield, NBC air filtration (blast valve, HEPA + carbon, hand crank, overpressure) and blast hardening, each an upgrade that costs more. Radiation is a per-person dose (Sv) set by where each person is and that spot's shielding, with a radiation overlay.
- Hardening is applied **per room**, with a "Harden whole bunker" shortcut. Each upgrade is a build job with its own stage, and existing rooms can be retrofitted.
- Each upgrade has **3 tiers**, with price and build time climbing steeply. Fallout shielding: Basic (PF 40, extra earth) → Shelter (PF 1,000, dense concrete) → Military (PF 10,000+, lead and steel).
- **Visible inside:**
  - Faraday cage: mesh at the seams, copper bonding strap, gasketed door seals, filtered power entry box.
  - Fallout shielding: deeper door reveals, a baffled zig-zag entry.
  - NBC filtration: filter cabinet, hand crank, pressure gauge, blast valves on the vents.
  - Blast hardening: hinged blast doors on every opening, shock-mounted bunks and shelves.
- **EMP:** a Faraday-shielded room protects everything stored inside it (radios, solar spares, vehicle electronics, medical devices). Anything unshielded fries.
- **Warning signs** are telegraphed through the news ticker, prices, neighbors' gossip, radio chatter and sky color. Attentive players hedge.
- **Abstract encounters:**
  - A group approaches, and the game evaluates detection (sightlines, dogs, alarms), deterrence (how the place looks), defense (walls and positions versus their strength) and people (skills, morale, numbers).
  - The player chooses a stance: hide, parley, warn off, defend, or trade.
  - The result is damage to specific structures, injuries and resources, plus reputation.
  - The outcome is shown as a short illustrated vignette.

## 5. Scale: from homestead to town (the player decides)
The compound is whatever size you let it become. **Who you take in is the main growth decision.**

### 5.1 Arrivals
People come to the gate before and after the disaster:
- **Relatives:** your brother's family, an aging parent, a cousin from the city.
- **Neighbors:** people you know from peacetime, with history and reputation either way.
- **Other families:** strangers with kids, fleeing something.
- **Lone survivors:** a nurse, an ex-soldier, a teenager, a con artist.
- **Groups:** a church group, a work crew, a band of travelers.

### 5.2 The intake decision (a core screen)
Each arrival shows a **dossier**, and what you can see depends on your negotiator skill and how long you've known them:
- **Skills** they bring (medic, mechanic, carpenter, mason, gardener, hunter, teacher, radio, soldier) and at what level.
- **Resources** they bring: tools, seeds, livestock, a truck, fuel, medicine, weapons, building materials, knowledge such as books or blueprints.
- **Costs:** mouths to feed, water, beds, medical needs, kids or elders to care for.
- **Unknowns:** traits that aren't revealed yet (honest, lazy, brave, a thief, sick, being followed). These can be learned by questioning them, a trial period, or references from people you trust.

Options: **take them in**, **trial period** (a camp outside the wall), **trade and send on**, **turn away**, or **point them to a neighbor**. Every choice affects reputation, morale (your people have opinions) and future arrivals.

### 5.3 Growth changes the build
- More people unlock bigger projects: a mason crew can build the stone wall, a mechanic can run the gasifier, a teacher lets kids learn skills.
- They also need housing (bunkhouse → cabins → a street of houses), a bigger kitchen, latrines, water capacity, a meeting hall and eventually a school, clinic and market.
- The layout scales from **homestead → compound → hamlet → walled village → small town**, with **districts** (residential, fields, workshops, defense ring) and roads.
- Each stage also raises visibility and threat attention: a town is a target, but also a power.

### 5.4 Governance (light, from the hamlet stage)
Once you have outsiders, decisions aren't only yours:
- Choose how the place is run: family patriarch/matriarch, council, vote.
- Factions form along lines like relatives vs. newcomers, or soldiers vs. farmers.
- Rules come up for decision: rationing, guard duty, who gets the good cabin. Unhappy groups can leave, and take things with them.

### 5.5 Neighbors and reputation
Neighbors remember peacetime: who you helped, who you snubbed, whether you shared. After the collapse you can form a mutual-aid network with nearby homesteads, trade, run a militia, absorb them, or stay hidden.

### 5.6 Play styles this enables
- **Hermit:** one family, hidden, low visibility, self-sufficient.
- **Clan:** relatives only, tight trust, limited skills.
- **Ark:** pick the most useful specialists and turn away the rest. Efficient, morally heavy.
- **Haven:** take everyone in and grow into a town. Strong, visible, chaotic.

## 6. Presentation
- Three.js procedural art, with the same approach and toolkit as University Empire: terrain, regions, seasons, weather, day/night, procedural buildings and vegetation.
- A tilt-shift diorama camera for building, plus a walk mode to inspect your place at eye level.
- **Photo mode** with time of day and season, because the build is the star.
- The UI stays out of the way. Overlays (defense, visibility, flow, fire, sun) are toggles.

## 7. MVP (prototype slice)
- One region (Mountain West), one parcel, a family of 4.
- Peacetime: 5 years compressed. Build with 4 materials (timber, log, stone, earthbag) and about 25 structures. Defense and visibility overlays.
- One disaster: **grid-down**. It tests water, food, power, heat and security with the least new tech.
- 3–5 arrivals at the gate with dossiers (take in / trial / trade / turn away); up to about 15 people, homestead → compound scale.
- One survival year, then the report card.
- Modes: Surprise is a stub (always grid-down for the MVP); God Mode exists from day one, since it is cheap and great for testing.

## 8. Tech
Separate repo. Same stack as University Empire: Vite, TypeScript, React, Zustand, a custom ECS, Three.js and Vitest. Procedural art only, with no external assets.

### 8.1 Graphics port from University Empire (the quality bar)
**Target: Compound Builder looks at least as good as University Empire does today.** The plan is to lift UE's rendering stack into a game-agnostic package first, then build on it.

**Step 1: extract `@engine/world`**, a folder of decoupled modules. In UE these mostly read only `terrainGrid`, region, season, weather and time of day, so they move over with thin adapters.

| UE module(s) | What it gives Compound Builder | Coupling to UE state |
|---|---|---|
| `world/CampusScene.ts`, `world/skyState.ts`, `postprocessing/ProceduralSky.ts`, `GodRayShader.ts`, `ColorGradingShader.ts` | Physically-based light rig, golden hour, gradient-dome sky IBL, camera-following shadows, adaptive bloom, SSAO, color grading, god rays, stars and moon | Medium: strip campus / era hooks and keep season and time of day |
| `builders/WeatherRenderer.ts`, `weatherState.ts` | Rain, snow, lying snow on surfaces, puddles and ripples, wet roughness, storms | Low |
| `season/seasonState.ts`, `seasonShader.ts` | Seasonal foliage, snow cover, plowed paths | Low |
| `builders/treeGeometry.ts`, `CampusTreeRenderer.ts`, `instancedLod.ts` | Instanced trees with wind sway, conifer boughs, leaf cards, LODs, regional species | Low |
| `HeightmapTerrainRenderer.ts`, `RegionalTerrainRenderer.ts`, `terrainElevation.ts`, `utils/terrainGen.ts`, `campusTopography.ts`, `siteGrade.ts` | Regional terrain (hills, benches, bluffs), graded building pads, retaining walls, farmland and survey grid | Medium: becomes the homestead parcel |
| `WaterEdgeRenderer.ts`, `waterFlow.ts`, `waterShading.ts` | Creeks, ponds and rippled water, which matter for wells, creeks and flood risk | Low |
| `houseStyles.ts`, `houseExtras.ts`, `regionalFarmsteads.ts` | Regional houses, porches, barns, silos, fences, farmsteads | Low: the seed of the build kit |
| `normalMapGen.ts`, `streetTextures.ts` | Procedural canvas normal maps and textures per material (brick, stone, wood, shingle) | Low: becomes the material system |
| `mergeCompat.ts`, `buildingDetailLod.ts`, building mesh bake | Static geometry merging (about 1000 draw calls down to about 18), detail LOD | Low |
| `crowd/figureKit.ts`, `crowdSim.ts`, `AgentRenderer` | Instanced people with seasonal clothing, walking and sitting | Medium: becomes family members doing chores |
| `life/livingClock.ts`, `windowSpillPlan.ts`, night lighting | Lit windows at night, lamps, a living world | Low |
| `CampusTourController.ts`, `cameraOcclusion.ts` | Walk, fly and cinematic camera with collision, which becomes walk mode and photo mode | Low |
| The QA screenshot harness (Playwright shots, eye-level clamps, occlusion checks) | Visual regression and screenshots from day one | — |

**Step 2: the build kit.** New code, made in UE's style:
- **Modular wall, roof and foundation pieces**, with materials (timber, log, stone, rammed earth, earthbag, CMU, container) as procedural PBR materials built on `normalMapGen`.
- **Weathering:** moss, rust, bleaching and stains driven by age, the same approach as UE's historic patina.
- **Construction stages:** scaffold → frame → clad.
- **Damage states:** scorch, breach, rubble.

**Step 3: overlays.** Defense (sightline coverage), visibility, sun and shade, fire risk and flow, as ground-projected shader layers.

**Performance budget** (same rules as UE): instanced and merged geometry, LOD tiers, and High / Medium / Low quality settings, aiming for 60 fps at homestead scale and 30+ fps at town scale.

## 9. Open questions
1. Is the parcel chosen from a map, or generated per run?
2. Does the family have a backstory and goals (a homesteading dream vs. an anxious prepper), giving different starting bonuses?
3. Permadeath for family members? (Default: yes in Surprise mode; optional in others.)
4. Do kids age into skilled adults over a long survival, so a generational arc exists?
5. Should there be an end state beyond "survive N years"? Candidates: the town becomes a functioning settlement, order is restored, or an endless mode.
6. Can people you take in betray you or leave with supplies? (Default: yes, telegraphed through morale and traits.)
