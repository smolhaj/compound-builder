# The domed compound: design exploration

Owner request: "explore a domed compound as something the player can build. It would be extremely expensive but doable. It would protect from nuclear fallout and harsh weather, be climate controlled, etc." This is **a design doc only: no gameplay code, no save change, no new assets**. It reads against `origin/main` at `fd76d2d` (`SAVE_VERSION` 98, the disaster hook seam in `src/sim/disasterFx.ts`, the felt layer, `docs/scenarios/*`).

Conventions: American English and US units; 1 world unit is about 20 ft (`M_PER_UNIT = 6` in `sim/sanitation.ts`), a person is 0.28 units (5.6 ft), the structure sub-grid is 0.5 unit (about 10 ft), a 40-acre parcel is about 1,320 ft square (66 units). Dollars are 2025 and every cost is a **range** with a default for the game. Text and visuals only; procedural art only.

**Research honesty.** Web search worked, but page fetch was blocked for `en.wikipedia.org`, so I had only search-result summaries, not full pages. Each fact below is tagged: **[S]** a source listed in section 14 returned it; **[M]** from memory or my own arithmetic from standard engineering numbers, **not re-checked, verify before it reaches player-facing text**; **[D]** a design choice, not a fact. No ETFE cost per square foot and no Vivos xPoint price could be found, so those are estimates.

---

## 1. The one-page answer

- A "dome" is not one thing. Three real, different things hide behind the word: an **earth-bermed shotcrete shell** (cheap, hard, nearly invisible), a **freestanding concrete core dome** (expensive, very hard, a landmark), and a **glazed or ETFE biosphere** (staggeringly expensive, soft, a beacon). They protect from different things and fail in different ways. The game should offer all three as **tiers of one "Enclosure" system**, not as one super-building.
- **A dome is a weather, climate and air layer; it is not a fallout shelter by itself.** Thin concrete shells give PF 3 to 30 [M]; glass and ETFE give about PF 1. The 7-10 rule and half-value layers mean real fallout protection still needs a **buried or thickly covered core room** (the existing `bunker_*` rooms, PF 1,000). What a dome adds is a **clean zone**: the floor, soil, garden and cistern under it never get fallout dust while the ground outside stays hot for months. That is the dome's real prepper payoff, and it is a good game hook (section 6).
- **The enemy of a big dome is the greenhouse effect, not the cold.** A sealed glass or ETFE dome in the sun is a solar oven; cooling load at noon can be several times the winter heating load [M]. Full "climate control" at 360 ft across costs megawatts of electric power, which is why Biosphere 2 sat on a dedicated power plant [M]. A believable game answer: **three climate modes** (frost-free, temperate, comfortable) with a power price each, and a passive-first design (berm, shade, vents) that the poor and the smart can use.
- **Sealing is easy; closing a loop is nearly impossible.** Biosphere 2 lost oxygen from 20.9% to 14.5% in about 16 months because the concrete absorbed CO2 and soil microbes ate oxygen, and managers had to inject oxygen from outside in 1993 [S]. The lesson for the game: **do not simulate a closed ecology.** Give the dome a **lockdown mode of days to weeks** (fallout, ash, plague) in which CO2 is the clock, and an **open mode** the rest of the time. A 60-ft sealed dome with six people reaches a CO2 problem in about two days with no scrubbing or plants [M, section 7.1].
- **Visibility is the price of the dome.** A glazed dome is seen from miles, glints by day and glows at night; the earth-bermed shell is a grassy hill with two doors. The existing stealth and fortress-reputation systems (`sim/stealth.ts`, `sim/reputation.ts`) already have the shape for this tradeoff; the dome adds a **visibility** term and a **neighbors and raiders talk** term.
- **Costs (2025, defaults):** earth-bermed shell dome about **$0.95M** (range $0.65M to $1.35M, 60 ft across); hardened concrete core dome about **$5.5M** ($3.5M to $9M, 150 ft across); full glazed ETFE biosphere about **$95M** ($60M to $180M, 360 ft across). The third is billionaire money and takes **2 to 4 years even with crews**: buildable only in the multi-year peacetime (Era 1 quiet is 4 to 8 years in `sim/disaster.ts`), not after the hit.
- **Recommendation:** ship T1 and T2 first, behind a pure geometry, cost, climate, air and protection model; ship T3 as a late, rare, rich-start-only project once the first two prove the plumbing. Twelve owner questions, each with a recommendation, are in section 15.

---

## 2. Research summary

### 2.1 Real-world analogs

| Analog | What it is | Facts the game should learn from | Tag |
|---|---|---|---|
| **Geodesic domes (Buckminster Fuller)** | Triangulated spheres; strong for weight, cheap in material | The Climatron (Missouri Botanical Garden, 1960) was the first geodesic greenhouse; the Montreal Biosphere (US pavilion, Expo 67, about 250 ft across, 200 ft tall) lost its **acrylic skin to a welding fire on May 20, 1976** and the steel frame survived; the skin was never replaced. Lesson: a combustible skin is the weak layer, the frame is not. | Fire and dates [S]; Climatron [M] |
| **Monolithic Dome Institute (MDI)** | Inflate a fabric Airform, spray polyurethane foam inside, tie rebar to it, spray shotcrete over it | MDI says a dome costs about the same as a conventional home of the same finish; shell alone is about half the finished price; MDI published **about $130 per square foot finished (2013) with the shell alone at $65**; recent 2025 estimates cluster at **$100 to $250 per square foot**, the shell being 30 to 50% of the total; the Airform must be recoated every 5 to 10 years; cost per square foot tends to fall with size. | [S] |
| **Biosphere 2** (Arizona, 1991 to 1993) | 3.14 acres sealed; 8 crew in the first closure | Cost on the order of **$200 million total 1985 to 2007** (one source; construction alone was about $150 million [M]). Oxygen fell from 20.9% to 14.5% in about 16 months; concrete absorbed CO2 as calcium carbonate (isotope work by Severinghaus and Broecker); soil microbes added to it; oxygen injected from outside in January 1993; the Scientific Advisory Committee resigned in 1993; current staff say the failure was **lack of transparency** about the oxygen injections and scrubbers, not the shortage itself. Concrete was later **coated** to limit the reaction. Also [M]: crew lost weight on about 2,000 kcal and subsisted on bananas, beets and sweet potatoes; cockroach and ant species exploded while pollinators failed; the crew split into two factions; CO2 swung seasonally by thousands of ppm; the "lungs" (variable-volume chambers) handled pressure swings; the facility drew heavy external power for heating and cooling. | Cited facts [S]; the rest [M] |
| **Eden Project** (Cornwall, 2001) | Biomes of hexagonal ETFE pillows on a steel space frame, in a clay pit | Cost cited as **about £74M during construction, later £80M to £141M to complete**; ETFE pillows are **air-inflated and the pressure is raised when snow is forecast**; stainless cables inside the foil on bigger spans. ETFE life is quoted at **40 to 50+ years** in lab and field work. Hail has damaged other ETFE roofs (Zurich Masoala 2002; a re-roof in 2009 after a hail storm). Eden's own 25-year condition was not found. | [S] |
| **ETFE cushions in general** | Two or three foil layers, inflated | Light (about 1% of glass weight [M]), self-cleaning, translucent, **burns and melts out at fairly low heat by design [M]**, can be **cut with a knife [M]**, 3-layer U-value about 0.33 Btu/hr per sq ft per degree F [M]. | Mixed |
| **Survival Condo, Atlas silos, Vivos** | Former Atlas E missile silos in Kansas turned into condos; Vivos xPoint and shelter builds | Floor-through units sold about **$1 to $3 million** (2014 to 2025 press, inconsistent); other silos listed $0.75M to $1.6M as bare shells; one source says Vivos shelters started around **$25,000 a person**. A "$1.5M a room" luxury bunker appears in press. The product is: buried depth, blast doors, filtered positive-pressure air, 5-year food and a community. | [S] (prices weak) |
| **FEMA P-361 / ICC 500 safe rooms** | Tornado and hurricane shelters | Designed to **250 mph** winds and a **15 lb 2x4 at 100 mph** (tornado) or a 9 lb 2x4 at up to 128 mph (hurricane) debris impact; ventilation must work for the occupants for the shelter period; the room must be structurally isolated and anchored. A concrete dome clears this easily; a glass or ETFE dome never does. | [S] |
| **Fallout shielding** | Mass between you and the dust | Each **half-value layer (HVL)** halves gamma dose; **10 HVL = PF 1,024**. About **24 in of concrete is about PF 1,000** [S]; a Civil Defense rule of thumb is **about 3 ft of earth or 19 in of concrete for a factor of 10** in older tables [S, treat the pairing with care]. The 1962 Office of Civil Defense "Family Shelter Designs" aimed for PF 100; later guidance asks PF 1,000; public shelters were marked at **PF 40** [S]. Engineering-table HVLs I will use: **concrete about 2.4 in, earth about 3.6 in** for fallout energies [M]. The **7-10 rule** (every sevenfold increase in time after the blast cuts the dose rate tenfold, so 1 hour, 7 hours, 49 hours, two weeks) is already in `docs/scenarios/nuclear.md`. | [S] and [M] |
| **Collective protection (CBRN)** | Filtered positive-pressure rooms | The U.S. Army M20A1 simplified collective protection equipment holds **0.6 in of water gauge of overpressure with 200 cfm of filtered air for up to 10 people**; an older Chemical Warfare manual set a **2% CO2 ceiling** and **1 cfm per man** for makeshift unventilated shelters at rest with 0.275 cfm the true rest need; civil Swiss shelters run **about 3 cubic meters of air per person per hour** in filtration mode. | [S] |
| **Closed ecological life support (MELiSSA, Concordia, Mars habitats)** | ESA loop of bacteria, algae and plants; the Franco-Italian Antarctic station | Closed-loop water and biological systems have run for **years** in pilot plants and at Concordia (gray-water recycling), but only as **partial loops with resupply**; regolith shielding may be **overestimated because of secondary radiation**, and ice shields better. Mars habitat studies put the habitat pressure, radiation and regolith cover questions in the same family as our dome: you shield with mass, you pay for it in structure. | [S] |
| **Underground and earth-sheltered housing** | Berms, hillside homes, Malcolm Wells style | Stable ground temperature (about 50 F in the Mountain West [M]) cuts heating and cooling by a large share; moisture, waterproofing and radon are the usual faults; light is the main complaint. | [M] |
| **Aquaponics and greenhouse at scale** | Commercial glasshouse and tilapia plus lettuce | Heating is the biggest cost; the existing `sim/greenhouse.ts` already has the two tiers (hobby kit, production house); a dome does not remove that, it bundles it. | [M] |

### 2.2 What the numbers say about thin-shell domes, ETFE and glass

| Question | Concrete shell (Monolithic style) | Glass | ETFE cushions |
|---|---|---|---|
| Strength per weight | Excellent in compression; a hemisphere is nearly ideal | Heavy; needs a steel gridshell | Very light; strong in tension |
| Wind (tornado class) | Survives with the right ring beam and anchoring; MDI claims tornado and hurricane performance [S, vendor claim] | Fails to flying debris | Fails to debris and to a cut |
| Hail | No issue | Tempered fine at small stones, laminated for large; glass is the usual hail casualty | Large hail punctures or tears cushions; Zurich 2002 and a 2009 re-roof [S] |
| Snow | 100+ psf design is routine | 30 to 60 psf design [M] | 20 to 40 psf, raised by pumping the cushions [S, M] |
| Fire | Does not burn; foam behind is protected by the concrete | Cracks under heat, falls | Melts out by design; acrylic burned off the Montreal dome [S] |
| Insulation | Foam R-25 or better; U about 0.04 [M] | Double glass U about 0.5 [M] | 3-layer U about 0.33 [M] |
| Light | None unless you cut openings | Full | Full, adjustable frit |
| Security | A 100% wall; no handholds | Breakable | Cuttable |
| Cost per square foot of **floor** (2025) | **$100 to $250** finished home work [S]; heavier thick or hardened shell $200 to $450 [M] | $300 to $800 structure and skin [M] | $250 to $700 structure and skin [M]; big-project all-in (Eden, Biosphere 2) is **$900 to $2,400 per square foot of footprint** in today's dollars [S, M arithmetic] |

### 2.3 Fiction and prepper culture: why we want the dome, why it fails

| Work or thing | The dream | How it fails on screen | Lesson for the design |
|---|---|---|---|
| **Biosphere 2** (real, then the 1996 comedy Bio-Dome) | Earth in a bottle | Air, food, factions, secrecy | Make the **air and the people** the failure, not just walls |
| **Fallout vaults** (Fallout) | A buried town that keeps civilization | The vault was an experiment on its own people; one broken part (the water chip) dooms it | A **single critical part** (filter, chip, pump) with a visible repair quest |
| **Silo** (Hugh Howey) | A sealed, ordered, safe community | Rules, secrets and lies hold it together; going outside is forbidden | Social control and **rumor inside** are as real as the shell |
| **Under the Dome** (King) | The town is under glass, the sun shines in | Air, water, fuel, and a petty tyrant | **Who controls the airlock** controls the people |
| **Logan's Run** | A pleasant domed city | The dome hides a cost (age 30) | A comfortable closed place invites a hidden bargain |
| **Snowpiercer** | A train that is the world | Class war; one engine | **Power is the throne**; everyone depends on one line |
| **Hunger Games Capitol, Elysium** | A lit, clean, climate-perfect place for some | The outside is dirt and hunger; resentment | The **oasis contrast** is the point, and it makes you a target |
| **Dune** (stillsuits, sietch) | Water discipline is religion | Water leaks are life | Treat every drop (condensate, roof wash) as a ledger |
| **Resident Evil (the Hive)** | A hidden underground lab | The AI locks the doors | **Airlock and lock logic must not be able to kill the player** |
| **Seveneves** (Stephenson) | Domes and arks for the last people | Radiation, spread population, factions | Isolation **plus** diversity (genes, skills) |
| **Mars colony fiction (Stargate, The Martian)** | A pressure hull on a dead world | One breach is everything | Make **breach and repair** a loop with tools, not a game over |
| **Cyberpunk arcologies, Tomorrowland** | A city under one roof | The roof is owned; the people under it are tenants | Dome as **estate** |

Pattern across all of them: the dream is **a controlled climate, light and warmth inside, a clean boundary, and ordered life**. It fails by **single point of failure** (power, filter, door), **leaks** (air, water, secret), **resource ledger drift** (O2, food, spare parts) and **social strain** (confinement, factions, secrets, a gatekeeper). Prepper culture adds a fifth: **visibility and envy** (a bunker you boast about is a bunker with a target on it). Those five are the game's failure families (section 9).

---

## 3. What a dome is in this game

**Design position [D]:** an **Enclosure** is a new layer over the existing build kit, not a replacement for houses, bunkers or walls.

1. **Shell** (the dome): weather, snow, hail, ash, fire, temperature buffer, visibility, and a wall against walkers.
2. **Zones inside** (the clean zone): garden beds, the well head, cistern, workshop, the house, livestock coop; dust, wind and frost kept out.
3. **Core room**: the existing hardened `bunker_*` rooms, PF 1,000, blast door, NBC filter. The dome **does not** change a bunker's PF; it adds a **second line** (a clean airlocked approach, no dust tracked in) and **comfort** in the long term.
4. **Airlock**: the one opening people and vehicles use. People and carts move only through real openings (existing movement rule); the dome registers **airlock openings**, never a wall gap.

Why layered, not one number: it keeps the **monotone defense rule** (every defensive element only helps; property test exists) and lets `hardening.ts` and `nuclear.ts` read the bunker as they do today.

### 3.1 Three realistic dome types for this game

| | **T1: Berm Shell** | **T2: Core Dome** | **T3: Biosphere** |
|---|---|---|---|
| Real model | Monolithic-style shotcrete dome buried in earth; earth-sheltered housing | Freestanding Monolithic or thin-shell reinforced concrete dome over the whole core; glazed oculus and band | Steel gridshell with ETFE cushions or laminated glass, with stem wall (Eden, Climatron, Biosphere 2) |
| Default size | **60 ft** across (3 units); range 40 to 72 ft | **150 ft** (7.5 units); range 100 to 200 ft | **360 ft** (18 units); range 250 to 500 ft |
| Footprint | 2,830 sq ft | 17,700 sq ft (0.41 acre) | 101,800 sq ft (2.3 acres) |
| Covers | The house, a mud room, an airlock, a small light well and a garden room | House, garden beds, well and cistern, workshop, chickens or rabbits | A hamlet: homes, an orchard, aquaponics, workshops, a pond |
| Sees weather | Almost none | Almost none | Strong sun, hail and wind loads on the skin |
| Visibility | Low (looks like a hill) | High (a gray landmark; daylight shows) | Very high (glint by day, glow at night) |

Sizes in feet, not units, in all UI text; one unit is 20 ft, so the three defaults are 3, 7.5 and 18 units across.

---

## 4. The three build tiers

### 4.1 Cost, time, labor (2025 dollars)

Defaults assume the **default size**. Costs scale roughly with **surface area** for shell and skin (area of a hemisphere is `2 pi r^2`) and with **volume** for conditioned air; sections 5 and 8 give the formulas.

| | **T1: Berm Shell (60 ft)** | **T2: Core Dome (150 ft)** | **T3: Biosphere (360 ft)** |
|---|---|---|---|
| Total cost, range | $0.65M to $1.35M | $3.5M to $9M | $60M to $180M |
| Default | **$0.95M** | **$5.5M** | **$95M** |
| Per square foot of footprint | $230 to $480 | $200 to $510 | $590 to $1,770 |
| Shell and structure | $0.30M to $0.55M | $1.8M to $3.8M | $25M to $80M |
| Skin and glazing | (in shell) | $0.3M to $0.6M (oculus and ribbon) | $15M to $40M |
| Foundation, earth, drainage | $0.09M to $0.18M | $0.6M to $1.2M | $4M to $10M |
| Systems: HVAC, air, filtration, power | $0.10M to $0.25M | $0.9M to $2.1M | $8M to $30M |
| Interior fit-out and airlocks | $0.15M to $0.35M | $0.5M to $1.2M | $6M to $20M |
| Person-hours (labor) | 7,000 to 11,000 | 40,000 to 70,000 | 400,000 to 900,000 |
| Crews at once (a crew is 4 people at $60 an hour in `sim/crews.ts`) | 1 to 3 | 2 to 6, plus shotcrete and crane subs | **a contractor firm**, 60 to 150 workers |
| **Rich build** (crews and subs) | 6 to 10 weeks shell, 3 to 4 months fit-out: **about 5 to 6 months** | 10 to 16 months | **24 to 48 months** |
| **Poor build** (family by hand) | 30 to 40 ft owner-built version at **$60k to $180k**, 14 to 24 months | not possible by hand; only a 40 ft mini-core, 3 to 6 years | **not buildable** |
| Permit (pre-hit) | 4 to 8 weeks | 3 to 6 months | 9 to 18 months, structural peer review, occupancy review |

Where the numbers come from: MDI shell prices ($65 and $130 per square foot in 2013, $100 to $250 now [S]) scaled up for 3 ft of earth cover, waterproofing, two airlocks and NBC air for T1; hemisphere area times 8 in average shotcrete (870 cubic yards at 150 ft) at $900 to $1,500 per placed yard with rebar [M] for T2; Biosphere 2 about $200M for 3.14 acres in about 1991 and Eden about £141M for roughly 5 acres of biomes in 2001, which are about **$2,400 and $1,700 per square foot of footprint in 2025 dollars** [S plus my inflation arithmetic], discounted because we omit labs, tourist infrastructure and a research facility, for T3.

**The "poor" ladder.** There must be a cheap way into the idea so it is not only for the rich:

| Rung | What | Cost | Hours | Notes |
|---|---|---|---|---|
| 0 | Existing polytunnel or high tunnel (`sim/tunnels.ts`) | already built | | Not a dome; the baseline |
| 1 | **Earthbag or ferrocement dome**, 16 to 24 ft across (Cal-Earth style [M]) | $8k to $25k | 600 to 1,800 | A storm, summer and winter shelter and a stealth hut; PF 10 to 40 with berm; no filter |
| 2 | Owner-built **30 to 40 ft shotcrete dome** (MDI small kit) | $60k to $180k | 2,500 to 5,000 | Hides in a hill; the cheap T1 |
| T1 | The 60 ft Berm Shell | $0.65M to $1.35M | 7,000 to 11,000 | |

### 4.2 Construction stages (reuse the blueprint stage model)

All enclosures use the existing `Blueprint` / `StageDef` (`id`, `name`, `hours`, `materials`) with these stage ids, so crews, `knockBack`, damage and the build view all keep working.

| Stage | T1 | T2 | T3 | What the player sees |
|---|---|---|---|---|
| `site` | Stake out, dig the bowl | Stake out, level, soils report | Geotech, survey, haul road | Stakes, a dug pit |
| `foundation` | Ring footing, slab, waterproofing | Ring beam and slab (a big pour) | Stem wall, piles, ring beam | A concrete ring |
| `form` | Inflate the Airform | Inflate the Airform sections or set forms | Erect the steel gridshell on cranes | A balloon (T1, T2) or a half-built steel ribcage (T3) |
| `rebar_foam` | Foam inside, tie rebar | Same | Install cables, struts, heating loops | The Airform dimples with rebar |
| `shell` | Shotcrete (1 to 3 days) | Shotcrete in lifts, cure 28 days | Fit ETFE cushions or glass; inflate | A gray shell appears in a few days; T3 glows as panels go on |
| `cover` | Waterproof, berm 3 ft, seed | Optional earth skirt | Stem wall facing, drainage | The hill grows around it |
| `systems` | Heat pump, ERV, filters, blower | Same plus HEPA bank | Chillers, air handlers, vents, PV array | Roof vents, equipment pad |
| `finish` | Interior, two airlocks, lights | Interior zones, airlocks, beds, glazing ring | Interior landscape, ponds, paths | Lit interior; ready |

Damage states (shared model in `docs/scenarios/README.md`) apply per stage: a half-built Airform is the quake and wind weak point; a hail-struck T3 loses panels one at a time.

---

## 5. Protection by tier

### 5.1 Protection table

PF is the existing protection-factor scale; blast is design overpressure. Numbers marked [M] are my engineering estimates for the game and are not tested.

| Hazard | T1 Berm Shell | T2 Core Dome | T3 Biosphere (ETFE or glass) |
|---|---|---|---|
| Wind and tornado | Full (ICC 500 class, 250 mph) | Full (anchor the ring beam) | **None** beyond about 90 mph; ETFE panels fail first |
| Hail | Full | Full (oculus is laminated) | **Partial**: stones over about 1.5 in puncture cushions; glass loses panels |
| Snow load | 150+ psf | 100+ psf | 20 to 60 psf; pump cushions; clear by heat |
| Fire and embers | Full (earth covered) | Full; embers burn off the vents | **Weak**: ETFE melts at embers (screens), glass cracks |
| Ash load | Full | Full (a dome sheds the steep part; the crown holds) | **Weak**: ash on the crown breaks panels at about 40 to 60 psf wet [M] |
| Fallout, shell alone | PF 100 to 1,000 with 2 to 4 ft of earth | PF 10 (8 in) to 32 (12 in) [M] | PF 1.5 (glazing) |
| Fallout, with the core bunker | 1,000 | 1,000 | 1,000 |
| Clean ground and garden | Yes if the vestibule seals | **Yes** (the main reason) | **Yes** if the air is filtered |
| EMP | Rebar mesh and earth give some attenuation [M] | Same, better with a welded rebar cage; **the HVAC electronics are still the weak link** | Almost none; a steel gridshell is a cage with huge holes |
| Blast (if ever added) | 15 to 50 psi | 15 to 50 psi | under 1 psi; ETFE and glass shatter |
| Bio, chem and dust air | Gas-tight, positive pressure | Particulate for the whole dome, gas-tight only in a core zone | Particulate only; overpressure impractical (volume) |
| Temperature | Tracks ground at 50 to 60 F [M] | Stable with foam and a little heat | **Swings**; needs active control |
| Visibility | Low | High | Very high; a night beacon |
| Hard to cut or climb | Yes | Yes | No (ETFE can be cut, glass broken) |

### 5.2 Climate control: load arithmetic for the game

All of this is [M] arithmetic with standard values; it is pure and cheap to put in `sim/dome/climate.ts`.

- **Heat loss** in Btu per hour is `U x A x dT`, with `A` the surface area of the hemisphere (`2 pi r^2`) and `dT` the gap between inside and outside air in degrees F. Typical `U` values (Btu per hour per sq ft per degree F): foam-insulated shotcrete 0.04, earth-covered 0.03, double glass 0.5, three-layer ETFE 0.33.
- **T1, 60 ft:** A = 5,650 sq ft; at a 40 F gap about **9,000 Btu an hour (2.6 kW thermal)**, a heat pump draws about 1 kW (COP near 3): trivial. Ground coupling makes it less.
- **T2, 150 ft:** A = 35,300 sq ft; shell about 56,000 Btu an hour plus the oculus and band (2,500 sq ft at U 0.33) 33,000 Btu: **about 26 kW thermal, 9 kW electric, about 200 kWh a day** at a 40 F gap. A 60 kW solar array and a battery do it.
- **T3, 360 ft:** A = 203,600 sq ft; U 0.33 at a 30 F gap is about **2 million Btu an hour (590 kW thermal)**, about 200 kW electric: **4,700 kWh a day, 1.2 MW of PV in a mountain winter** plus storage. **Solar gain is worse:** the footprint of 101,800 sq ft in full sun at about 250 Btu an hour per sq ft and a solar heat gain coefficient of 0.4 is **about 10 million Btu an hour (850 tons of cooling)**. Without shading, vents and evaporative cooling it is lethal to crops and people in July. The Biosphere 2 reality [M] matches: huge chillers and a dedicated plant.
- **Fresh air** for people is small by comparison: 6 people at 20 cfm each (the Army shelter rate [S, arithmetic]) is 120 cfm; at a 40 F gap that is about 5,000 Btu an hour. An energy-recovery ventilator removes most of it.
- **Condensation:** a cold shell and humid air drips; mold clock in T3 (section 9). **Frost under the dome:** keeping T2 above 32 F in a Mountain West January costs about 20 kW thermal; this is the "frost-free" mode.

**Game modes [D]:** `frost` (never below 34 F inside), `temperate` (45 to 85 F), `comfortable` (65 to 78 F). Per-mode kW and kWh from the formulas; the player picks one per dome; Cozy shows a plain "this dome needs about 180 kWh a day" line.

### 5.3 Fallout detail the sim needs

- **Where the dose comes from:** ground shine (from the whole surrounding ground), roof deposit, and skyshine. A dome roof is a **poor fallout trap** because particles slide off slopes steeper than about 30 degrees [M], and a **sprinkler wash-down** from the cistern removes most of the rest [M]. That wash-down water, and the first flush, are contaminated: a first-flush diverter is a repair.
- **PF by cover:** ground dose is cut by the walls and the berm; the number is tiered in a table by cover thickness (`2 ft`, `3 ft`, `4 ft` of earth) as the existing `hardening` tiers do.
- **What the dome keeps clean:** the floor, the soil, the roof-harvest water if diverted, and **the garden**. In the nuclear scenario `wildfood` is "hot" for 150 days [DISASTER_TEETH]; an under-dome garden is clean food for the same period.

---

## 6. Per-disaster protection matrix

Rating: **F** full, **P** partial, **N** none, **W** worse (the dome increases the problem). T1, T2, T3 left to right; notes say why. All 29 end-times docs in `docs/scenarios/` are covered.

| Scenario | T1 | T2 | T3 | Why |
|---|---|---|---|---|
| `nuclear` (fallout) | F | F with core | P | PF from earth and the core room; clean garden and floor under the dome; T3 glazing is PF 1.5 |
| `emp` | P | P | N | A rebar cage and earth attenuate some; the HVAC, pumps and inverters inside still fry unless boxed (the existing `faradayShare`) |
| `solar_flare` | P | P | N | As EMP, plus a long grid-down: the dome's climate then runs on its own solar array or goes passive |
| `reactor_meltdown` | F | F | P | Same fallout machinery as nuclear, plume stripe; filters clog with iodine (carbon) |
| `pandemic` | P | P | P | Positive pressure and a quarantine airlock stop outside germs; **everyone inside shares one volume**, so one case is everyone's |
| `bioweapon` | F at the gate | F at the gate | P | Gas-tight positive pressure with an airlock quarantine suite; T3 cannot hold pressure |
| `zombies` | F | F | P | A concrete shell is a wall; ETFE and glass are breached; noise and light signature rise |
| `lawless`, `civil_war`, `invasion`, `cult_takeover` | **W** | **W** | **W** | A visible, valuable prize; occupiers take the landmark; but T1 hides |
| `mass_exodus` | P | P | W | Hospitality pressure: a dome is where the column goes |
| `grid_down`, `cyberattack`, `satellite_loss`, `oil_shock` | P | P | P | A dome with its own power runs; one with a smart controller can brick (cyberattack); T3 cannot afford its own fuel |
| `financial` | N | N | W | Property tax, asset seizure, no help to the economy; a visible asset in a bank holiday |
| `mega_quake` | F | P | P | Earth-cradled shell fares best; T2 gets cracks and jammed airlocks; T3 loses panels and the gridshell racks |
| `dam_flood` | P | P | P | Site matters (a berm is a basin); a 6 ft stem wall helps; interior floods in a bowl |
| `supervolcano`, `ash_winter` | F | F | W | Ash loads break glass and ETFE; filters clog; a concrete dome sheds ash and the filtered garden keeps growing under artificial light |
| `asteroid` | P | P | N | Winter and fallout like ash_winter; no blast protection beyond the concrete |
| `wildfire` | F | F | W | Concrete does not burn; ETFE melts and acrylic burned at Montreal [S]; the dome with a filtered air supply keeps smoke out |
| `drought` | P | F | P | A dome is a big rain catchment (150 ft is about 110,000 gal a year at 10 in of rain [M]); cooling is the cost; T3 is a solar oven |
| `water_war` | P | P | P | A catchment and a cistern are targets; the dome claim is visible |
| `crop_blight`, `global_famine`, `livestock_plague` | P | P | P | A sealed and filtered dome stops airborne blight and a livestock plague at the gate; seed diversity still decides |
| `unknown` | P | P | P | Unknown; the shell helps with what the scenario does |

Short read: **T1 and T2 are strong against physical and airborne hazards and weak against crowds and politics; T3 is weak against nearly everything physical except climate.** The T3 prize is the **oasis**: a garden you can walk in all year.

### 6.1 The oasis contrast [D]

- Warm, lit interiors, green leaves in January, a table under the glass at dusk. This is the **big felt win** of the dome and the reason a rich player will pay.
- Hook: add a **dome term** to the existing `homeSafetyInput` (`game/atmosphere/homeSafety.ts`) that raises the calm of rituals, and a daily felt line ("The garden under the dome is 74 F; the county road is minus 3."). `rituals.ts` already gives the evenings; the dome gives them a place. Cozy: a bonus that never turns off; Hardcore: the bonus fades with the dome's health.
- The contrast also **hurts**: the outside neighbors see the lit dome at night; the player's reputation shifts (section 8.5).

---

## 7. Systems and data model

All pure TS modules with Vitest tests, no THREE, no DOM, per repo rules. Folder `src/sim/dome/`.

### 7.1 Modules

| Module | Responsibility | Core signature (sketch) |
|---|---|---|
| `geometry.ts` | Area, volume, footprint, height, catchment, ring-beam length from diameter, shape, tier | `domeGeometry(d: DomeSpec): { footprintSf; surfaceSf; volumeCf; heightFt; catchGalPerInch }` |
| `cost.ts` | Costs and hours by tier and size (the table in 4.1 as formulas); region and crew multipliers; permit fee | `domeCost(spec, ctx): { usd; hours; materials; weeks }` |
| `blueprints.ts` | The 8-stage blueprints per tier | registered into the existing blueprint registry |
| `climate.ts` | Heat loss, solar gain, kWh by mode, frost and heat risk | `domeLoad(spec, outsideF, sun, mode): { kwThermal; kwElectric; indoorF }` |
| `air.ts` | Lockdown clock: CO2, O2, humidity; filter clog; pressure; airlock cycles; scrubber and plant offsets | `sealedAir(state, occupants, hours): { co2ppm; o2pct; hoursLeft }` |
| `protection.ts` | PF, wind, hail, snow, ash, fire, quake resistances by tier and cover | `domeShield(d, hazard): number` |
| `exposure.ts` | Visibility, glow, glint, talk, raider and opportunist factors | `domeVisibility(d, hour, shades): { dayMi; nightMi; glint }` |
| `events.ts` | Failure and event rolls (section 9) | `domeDay(s, rng): string[]` |
| `selectors.ts` | Compound board and HUD readouts | `domeBoard(s)` |

**Worked checks (my arithmetic, [M]).** For `sealedAir`: a 60 ft dome has about 56,500 cu ft. Six people at about 0.015 cfm of CO2 each emit about 5.4 cu ft an hour, so CO2 rises about **96 ppm an hour** from 420 ppm; **5,000 ppm (the workplace limit) in about 48 hours**, 1% in about 4 days, 2% (the old shelter ceiling [S]) in about 8 days. O2 at 0.03 cfm per person falls from 20.9% to 17% in about 8 days and to 14% in about 15 days. At 150 ft (883,000 cu ft) all times are about 16 times longer. So **CO2 is the clock in a small dome; the big dome is comfortable for weeks**, which is the real reason people build them big. Plants (about 1 sq ft of leaf per 0.0007 cfm of CO2 fixed [M]; the game uses a flat offset per bed) and a soda lime or amine scrubber buy time.

### 7.2 State and the save question

```ts
// src/sim/dome/types.ts (sketch; names are proposals)
type DomeTier = 'berm' | 'core' | 'bio';
interface DomeSpec { tier: DomeTier; diameterFt: number; shellIn: number; skin: 'shotcrete' | 'etfe' | 'glass' | 'poly'; coverFt: number }
interface Airlock { id: string; x: number; z: number; rot: number; kind: 'person' | 'vehicle'; cycleMin: number; state: 'ok' | 'jam' | 'sealed' }
interface DomeState {
  id: string; structureId: string; spec: DomeSpec;
  mode: 'frost' | 'temperate' | 'comfortable';
  lockdownSince: number | null;           // game day, null = open
  health: { shell: number; seals: number; filters: number; skin: number; hvac: number; airlocks: number }; // 0..1
  atmos: { co2ppm: number; o2pct: number; humidity: number; indoorF: number };   // daily
  panels?: { total: number; lost: number };   // T3 only: instanced count of damaged cushions
  airlocks: Airlock[];
  shades: boolean;  // night shutters / blackout (visibility)
}
// GameState gets: domes?: DomeState[]  (absent = none)
```

**Save:** the new field is **optional and additive**, a new `Structure.kind` is fine, so migrations are a **pass-through step** (the table in `sim/save/migrations.ts` already has them). Recommendation: **bump `SAVE_VERSION` to 99** with a pass-through, and add the usual DECISIONS "Save v99" row when the first code lands. If the owner prefers no bump, store the same data in a bag (`s.disaster.fx` is typed `Record<string, unknown>`), but a dome is not a disaster, so a typed field is cleaner. **This PR changes no code and does not bump.**

New goods in `Stock`: `airform`, `shotcrete_yd`, `steel_gridshell`, `etfe_cushion`, `glazing_unit`, `heat_pump`, `erv`, `hepa_bank`. Each needs a **shop shelf entry and icon** because the shop tests fail on a missing icon (`ui/shopIcons.tsx`).

### 7.3 Utilities and power

`sim/utilities.ts` auto-wires within `AUTO_REACH`. A dome becomes **one load node** (`domeLoad` kW) and optionally **one source** (a roof of PV on T2's crown is not realistic; PV goes beside it). The dome reports `power.short` when the load is not met; `air.ts` reads that. **Fail-safe rule [D]:** every dome has **passive vents that open when power or the controller fails** (a dome cannot suffocate its people), at the price of ending lockdown. A lockdown with no power is the dramatic bad case, and the hand-crank blower and the filter set are the fallback (the existing `nbc` hardening).

### 7.4 Interaction with the existing systems

| Existing | How the dome plugs in |
|---|---|
| `hardening.ts` | The dome shell takes the same `HardenId` upgrades (fallout, nbc, blast, faraday) as a dome-wide tier table; core bunker rooms unchanged |
| `nuclear.ts` | Shelter selection (line 50) adds "the dome" as a candidate with its PF; clean-zone flag feeds `wildfood` and garden contamination |
| `radiation.ts` | Dose when the player steps out into the airlock vs the lock vestibule decon |
| `greenhouse.ts` | The dome is a **greenhouse tier**: `GH_TIER`-style entry with `extend`, `peak`, `kcal` and kWh; do not duplicate its code |
| `structureDamage.ts` | `buildProfile` and `ResistCtx` gain `domeShield` by hazard; `SEISMIC_K` gets `dome_berm 0.3, dome_core 0.6, dome_bio 1.4` |
| `battle.ts`, `perimeter.ts` | The shell is a **wall segment**; airlocks are **gates** with the gate-vetting hooks; T3 skin is a weak wall (blocks.people 0.3) |
| `reputation.ts`, `stealth.ts` | New `look` and `glow` terms (section 8.5) |
| `crews.ts` | A **contractor** for T3 (section 8.2) and a crew queue for T2 |
| `paperwork.ts` | `PERMIT_FEE` entries and review days |
| `homeSafety` | Dome term (section 6.1) |
| `climate.ts`, `microclimate.ts` | Outside temperature and sun for `domeLoad` |

---

## 8. Player flow, economy and exposure

### 8.1 UI flow: how the player stakes and builds a dome

1. **Build menu, new "Enclosure" group** (shown with the other Get operational items once the family has the four basics; the Blueprint overlay also lists it). Three cards (Berm Shell, Core Dome, Biosphere) show **size in feet, cost range, build time (rich and by hand), what it protects and what it does not, and the power it will need.** Each card has a plain "Not for you yet: needs $X" line when unaffordable.
2. **Stake it.** The existing placement tool (`PlacementTool.ts`) shows a **circle footprint with the diameter handle**; sizes snap to 10 ft; the ghost shows the **berm skirt** (T1), the **ring road clearance** and the **airlock face**. A red ring appears if the footprint crosses a creek, a drop over 5 ft (`terrainFx`), a pad rule (`padRules.ts`) or another structure. A **cost, hours and weeks** strip updates as the diameter changes.
3. **Siting advice** (a Hint, with "more"): high ground drains; a south-facing slope for a T1 bank; flood plain, not a bowl; distance from the property line; the viewshed warning ("seen from the county road: 2.1 mi").
4. **Choose options**: cover (2, 3, 4 ft earth, T1), shell thickness (6, 8, 12 in, T2), skin (ETFE or laminated glass, T3), one or two airlocks, a vehicle lock, climate mode, optional glazing ring. The cost updates.
5. **Permit**: if the county wants a permit, a **gate card** says "The county asks for an engineer's stamp and a 120-day review; or build without one and risk a stop-work order." (existing permit gate pattern).
6. **Crews and the contractor**: pay crews (T1, T2) or hire a **contractor** (T3); a rich family pays for speed; a poor family does it by hand in the existing person-hour way. The Build tab shows the standard stage list.
7. **Progress** shows the stage names above; **the Airform inflation** and **the shotcrete day** are short, visible, **photo-worthy** moments (the album and the chronicle already take them).
8. **After finishing:** the Compound Board gets a Dome section (section 8.4) and a first goal ("Test the airlock" with a "Lock down for an hour" rehearsal that shows CO2 and the pressure gauge).

### 8.2 Money buys speed (owner principle)

Rule restated from `DECISIONS 2026-11-13`: money solves everything; things can be built quickly with money and manpower; a poor family takes much longer by hand.

| | Poor | Mid | Rich |
|---|---|---|---|
| T1 | 40 ft hand-built, 14 to 24 months | 2 crews, 3 to 4 months | 3 crews plus the shotcrete sub, 5 to 6 months |
| T2 | not feasible by hand | 4 to 6 crews for 12 to 18 months | 6 crews plus subs, **10 to 16 months** |
| T3 | not feasible | not feasible | contractor, **24 to 48 months**, pay by the month |

Speed laws: **shell weeks are bounded by cure (28 days for the shotcrete [M]) and by the crane and pump truck count**; paying more buys a second crew, not a faster cure. The contractor charges a **monthly draw**; if cash falls below the draw the job stalls (it does not fail). After the hit crews stop when roads and banks fail (existing rule), so **T2 and T3 are peacetime builds**: a half-built Airform at the hit is the worst place to be, and a **warning-sign card** ("Pause the dome, or finish the shell first?") is an easy, tense decision.

### 8.3 Climate, comfort and the garden under glass

- **Gardens:** a dome adds a greenhouse tier (the `GH_TIER` pattern): longer season, high peak, and with `temperate` mode **year-round greens**. Number proposals [D]: T1 a light-well garden room (about 600 kcal a day like the hobby greenhouse), T2 a production garden (about 4,200 kcal a day for a 150 ft dome with beds on a third of the floor, like the heated greenhouse tier), T3 an orchard, aquaponics and a pond (tens of thousands of kcal; this is the Eden fantasy).
- **Energy:** the kWh from section 5.2 is drawn from `utilities`.
- **Morale and the oasis:** warmth and green leaves raise daily mood; section 6.1.
- **Water:** roof wash and condensate collection per section 6; a dome that catches rain also needs the gutter ring and a first-flush diverter.

### 8.4 Compound Board and overlays

- **Compound Board** (read-only page, `ui/CompoundBoard.tsx`): a Dome card with indoor F, CO2, oxygen, pressure, filters, airlocks, kWh a day, shell and skin health, and lockdown clock with the hours left. A **LOCK DOWN** and **OPEN** toggle (one click, with a confirm for T3).
- **Blueprint overlay:** the dome ring, the airlock, the buffer clearance, and the **PF readout** under the dome.
- **Sightlines overlay:** the dome is a source in the viewshed and the night overlay (the existing **road, ridge, night and viewshed** modes).
- **Weak spots overlay** (`WeakSpotOverlay.ts`): airlock, vents, cuttable ETFE, jammed door.

### 8.5 Visibility, OPSEC and the county

A dome is "extremely visible." The model is a proposal with ranges to tune in the balance harness.

| Factor | T1 | T2 | T3 |
|---|---|---|---|
| Day visibility (mi, flat land) | 0.3 to 0.8 (a hill) | 3 to 6 | 8 to 15 |
| Night glow (mi) with lights and no shades | 0.5 | 2 to 4 | **10 to 20** |
| Glint by day (mi) | 0 | 1 to 2 | 6 to 12 |
| Fortress `look` points | +10 | +25 | +10 (reads as a prize, not a fortress) |
| Neighbor talk (pre-hit) | "the strange dirt house" | "the dome out on the Miller place" | the news (a feature in the county paper) |
| Raider and looter interest | small | medium | **high**; they come to see it |

- **Mitigations:** sod and berm (T1), matte dark paint, **night shades** (shutters or roll curtains; a morale cost), turning off the lights, a tree line, a **second perimeter wall** outside the dome (the existing wall tiers) so the dome is never the first line.
- **Formula [D]:** `attract = visibility x (1 - hardness)`; the raider encounter weights (`whoComes`) rise by `1 + 0.8 x attract` (looters), `1 + 0.5 x attract` (gangs); `reputation.hardness` already dampens opportunists, so a visible dome with a real wall draws more crews that **turn back** (existing "crews turning back before a shot" stat). Net: the visible dome is a bigger fight, an invisible one is a quiet life.
- **County and permits:** `paperwork.ts` has `COUNTY[region].strict` and `PERMIT_FEE`; a dome adds **engineered drawings**, **occupancy and height** reviews (T3: public assembly rules even for a private dome [M]); zoning is a **resistance** check if the parcel is in a restricted agricultural zone. Post-hit permits do not exist; stop-work orders do not come.
- **Taxes and insurance:** assessed value jumps (`yearlyTax` uses assessed built value); insurers do not cover a dome as a normal home; the estate rules (`estate.ts`) must see the dome as a big asset.

---

## 9. Failure modes and events

All events are **derived from state, not scheduled** (the felt-layer rule): each is a pure roll from the dome's `health`, load and the weather. Strength reads `DIFFICULTY[...]` (Cozy gentle, Hardcore bites). `sim/dome/events.ts`, text lines, and gate cards for the meaningful choices.

| Event | Family | Trigger | Effect | Counter |
|---|---|---|---|---|
| **Airlock jam** | Single point | `airlocks` health low; quake; ice | Nobody in or out; vehicles stuck; a hostile at the gate sees a shut door | Manual override, tools, a second airlock |
| **Airlock cross-contamination** | Process | A person skips the vestibule; decon not run | Fallout or germs enter the clean zone | A drill habit; a decon shower; discipline (a rule) |
| **Filter clog or saturate** | Ledger | Ash, dust, a long lockdown; carbon fills in a toxic plume | Pressure falls; air quality falls | Spare filter sets; pre-filter screens; a blower |
| **Pressure loss** | Leak | Seals aged; a crack; a door left open | The clean zone stops being clean | Patch kits, a seal crew, caulk, a second blower |
| **Power loss in lockdown** | Single point | Battery empty; a fried controller | Blower stops, vents fail-open, lockdown ends | Hand-crank blower, a generator, a Faraday spare |
| **CO2 buildup** | Ledger | A long lockdown, few plants, a crowded dome | Headaches, bad sleep, then collapse at 3% and above | Open a vent, scrubbers, plants, fewer people |
| **Oxygen drift (T3 and big domes)** | Ledger | Soil microbes and concrete carbonation (Biosphere 2) | Slow headaches; a managed "inject outside air" card | Coat the concrete; seal and vent; test with a meter |
| **Condensation and mold** | Weather | A cold shell, humid air, no ventilation | Mold on beds and walls, a lung hazard; crop loss | Vent, dehumidify, scrub, a monthly clean |
| **Hail strike** | Weather | A storm over T3 or the T2 oculus | Panels lost: 0 to 30% of cushions; a rain of glass | Hail shutters, cushion pressure up, repair crews |
| **Snow or ash load** | Weather | Snow, ash or wet ash on the crown | Panel breakage; a T2 oculus crack; leaks | Pump cushions, heat the crown, sweep, clear by hand with ropes |
| **Heat dome** | Weather | Heat wave; a clear day | Indoor 105 F; crop scorch; livestock stress | Shade cloth, vents, evaporative pad, **berm** |
| **Cold snap** | Weather | Below the design gap | Frozen pipes, frost on beds, power spike | More PV, backup heat, wood stove (with a flue) |
| **Quake crack** | Disaster | `mega_quake` | Shell cracks (T1, T2); panel loss and gridshell rack (T3) | Epoxy injection crews, bolt the ring beam |
| **Fire** | Disaster | `wildfire` embers; an indoor stove or battery fire | ETFE melts out (T3); a vent burns | Ember screens; filtered air in; a hose reel |
| **Pests** | Biology | Warm, moist, closed (Biosphere 2: ants and cockroaches) | Crop loss; rats | Traps, cats, predator insects |
| **Disease in a closed volume** | Social | One sick person | Everyone exposed; medicine drains | The quarantine suite; masks; an airlock rule |
| **Dome fever** | Social | Weeks of lockdown; crowded; no outdoor time | Irritability, a faction, a quit, a theft of the air budget (secrecy) | Daylight, privacy, rituals, honesty, a turn outdoors |
| **Gatekeeper dispute** | Social | Who holds the airlock key | A faction, a vote (`rules.ts`) | Rotas, shared keys, a vote |
| **Raid on the airlock** | Defense | Raiders at the lock | The weak point: a pried door, a cut skin | Vestibule, interior door, an outer wall, guards |
| **Skin cut (ETFE)** | Defense | A knife and a ladder | A slit; the dome loses pressure | A guarded inner and outer wall; a cage over the skin |
| **Fraud and contractor trouble** | Economic | T3 only: a draw dispute, a cost overrun, a delay | +10 to 30% cost; stalls | Reserve cash; a good contractor |

Each event has a **price in days and dollars**, a visible **sign** (gauges, the Compound Board, a hint line), and a **fix**. The Biosphere 2 lesson is **transparency**: the player always sees the gauges, never a hidden reservoir.

---

## 10. Balance: rich vs poor

- **Poor families** reach rung 1 or 2 of the ladder (section 4.1) and still gain: shelter, a hidden hill, a cold-weather hold. They never feel locked out of the idea.
- **Mid families** (the $1.4M independent start) reach **T1**: it is about the same as their whole starting cash, so T1 is a **big, all-in choice** (a dome or a farm). Save the dome decision for a week after the basics.
- **Rich starts** (a new **Founder** start of $5M to $25M, owner question 2) reach T2.
- **T3** is a **late-game or windfall** project: only with $60M+ and 24 to 48 months. In a typical Era 1 run the peacetime is 4 to 8 years, so a Founder with $100M can finish before the hit; **no one finishes T3 after the hit** (roads, banks and crews stop).
- **Wealth buys safety** (the existing 2026-11-16 principle): T1 and T2 cut deaths in fallout and ash, T3 buys comfort and food but **adds risk** (visibility, a raid prize, a long maintenance bill).
- **Upkeep:** T1 $4k to $10k a year, T2 $60k to $150k, T3 $1.5M to $4M a year [M]; **panel and seal life** is 40 to 50 years for ETFE and 5 to 10 years for the Airform coat [S]. Maintenance is a **cash and labor clock** after the hit: a T3 owner with no spare cushions and no crew ends with a slowly failing greenhouse (the Biosphere 2 arc).
- **Targets for the balance harness** (the `scripts/balance.test.ts` pattern): Standard prepper with a T2 dome loses fewer people to fallout than one with a plain bunker by a modest margin (about 15 to 25% fewer) and loses more stores to raids by a small margin; T3 raises raids on the compound by 30 to 60% at default visibility; none of it moves Cozy odds.

---

## 11. Rendering, performance and interiors

### 11.1 Budgets (never raised)

`scripts/perfBudget.json` holds the existing caps (430 draw calls on the mountain showcase; per tier triangles, shadow casters and heap). **No existing number is raised.** Add **new census scenes** (`dome_t1`, `dome_t2`, `dome_t3`) with limits set at measured plus a small margin, the way the `felt_*` scenes were added; the mountain scene has no dome so its caps are untouched.

Targets per dome in view [D, to measure]:

| | Near LOD | Far LOD | Draw calls | Shadow casters |
|---|---|---|---|---|
| T1 | 2,500 tris | 400 | 3 (shell, berm, doors and trim) | 1 (shell) |
| T2 | 6,000 tris | 600 | 4 (shell, oculus ring, doors, equipment) | 1 (shell proxy) |
| T3 | 12,000 tris | 700 | 6 (struts, panels, stem wall, interior, equipment, glow) | 0 (see below) |

### 11.2 Geometry plan (procedural, instanced, merged)

- **T1 and T2 shell:** one **lathe-profile `BufferGeometry`** (a hemisphere, 24 by 16 segments, with a ring beam and a base skirt) merged into **one mesh**, with the procedural **concrete or sod normal map** from the existing material kit (`buildkit/materials.ts`); the Airform pillow seams for the "inflated" stage are a vertex displacement on the same mesh. The berm is **terrain**: use the existing sitePad and grading (`buildkit/sitePad.ts`, `game/terrain/`) and the earth-berm perimeter mesh, not a new heightfield.
- **T2 oculus and band:** one `InstancedMesh` of 48 to 96 panel quads, with **per-instance color** for dirt, damage and night glow.
- **T3 gridshell:** a **geodesic frequency 4** hemisphere has about 240 edges and 160 faces [M, `20 v^2` faces times a half]; **one `InstancedMesh` for struts** (240), **one for cushions** (160, a translucent material, `depthWrite` off, no shadow), per-instance scale or color to show **loss and damage** without rebuilding geometry. Frequency 6 (about 540 edges) is a High-tier option.
- **LOD:** reuse `buildkit/buildingLod.ts` (`INTERIOR_HIDE_DIST`: High 18, Medium 14, Low 10 world units). A dome's inside **must stay visible** for the see-through glazed tiers, so the interior is a **separate merged layer** hidden at far, and the **far LOD is one merged hemisphere** with a procedural gradient (no interior). Per-tier distance thresholds follow the same hysteresis band.
- **Night glow:** **emissive** instance color on the cushions (a warm 3000 K ramp over the evening), **no new lights** (`game/lightPool.ts` budget by tier stays; the dome contributes at most one pooled interior fill light on High only, and none on Low). A single **glow sprite** (existing lamp-halo pattern) in the far LOD.
- **Shadows:** glazed skins cast no shadow (`castShadow = false`); a **single opaque proxy** may cast on Medium and High. This keeps `shadowCasters` flat. T3 could instead be cast by a **blob shadow decal**.
- **Post:** transparent panels draw in the transparent pass and are **excluded from SSAO** (as other see-through kit layers should be; verify in `engine/world/post/`).
- **Weather and decals:** snow and ash cover as a **shader blend on the same materials** (`atmosphere/seasonCover.ts`, `ashCover`) rather than new meshes; dirt streaks and moss from `atmosphere/weathering.ts`.
- **Quality tiers:** Low draws T3 as a **flat-colored shell with no cushions and no interior**; Medium draws instanced cushions; High adds the interior and the glow ramp. This respects the three-tier setting and FrameBudget step-down.

### 11.3 Interior, camera and walking

- **People move only through real openings.** The dome's openings are the **airlock doors**; register them as openings in the navigation graph (`sim/cutNav.ts`, `game/paths/`, the same pattern as `bunkerHatchPlan.ts` for hatches), with the **cycle**: outer door closes, 20 to 60 seconds of game time, inner door opens. In a lockdown, the vehicle lock cycle is longer. The Walk and Tour cameras must never put the camera inside the shell: the camera obstacle boxes (`game/cameraObstacles.ts`) get the shell ring as an **annulus** (clear inside, blocked at the wall).
- **Interior views:** the **V** key cycles Walls, Cutaway, X-ray; T1 and T2 use Cutaway and the **U** (Underground) view for the berm; T3 is naturally see-through.
- **Interior content:** reuse the farm and greenhouse props (`buildkit/farmBuildings.ts`, `foodBuildings.ts`) and the instanced bed and crop meshes; the dome adds **path rings** and a **central cistern or pond**. Do not build one-off interiors; the zone model is a **small set of slots** (garden, well, cistern, shop, coop, house) that the placement tool fills.
- **Open question for the owner:** whether the player can **place any building under the dome** (free) or only fill slots (section 15, question 8).

---

## 12. Work packages, ownership and order

Each package owns files; no two touch the same file; "touch" lists small seam edits that exactly one package makes.

| WP | Scope | Owns (new) | Touches (one owner) | Depends on |
|---|---|---|---|---|
| **D0** | Types, geometry, cost, tests; the cost table and area formulas | `src/sim/dome/{types,geometry,cost}.ts` + tests | none | none |
| **D1** | Blueprints, goods, shop shelf and icons, permits | `src/sim/dome/blueprints.ts`, shop entries | `src/sim/blueprints.ts` (registry line), `src/sim/paperwork.ts` (`PERMIT_FEE`), `ui/shopIcons.tsx` | D0 |
| **D2** | Climate and air models: heat, solar gain, kWh, CO2, O2, pressure, filter clog | `src/sim/dome/{climate,air}.ts` + tests | `src/sim/utilities.ts` (a load node) | D0 |
| **D3** | Protection and disaster hooks: `domeShield`, PF, resistances; dome as a shelter candidate and clean zone | `src/sim/dome/{protection,shield}.ts` | `src/sim/structureDamage.ts`, `src/sim/nuclear.ts` (shelter list), `src/sim/hardening.ts` (dome tiers), `src/sim/greenhouse.ts` (tier row) | D0, D2 |
| **D4** | Failure events and day tick | `src/sim/dome/events.ts`, text | `src/sim/engine.ts` (one call) | D2, D3 |
| **D5** | UI: Enclosure cards, planner, Compound Board card, goal, overlays, option panel | `src/ui/dome/*` | `ui/hud/BuildMenu.tsx`, `ui/CompoundBoard.tsx`, `game/blueprint/*` | D0, D1 |
| **D6** | Rendering: shell, berm, oculus, gridshell, LOD, glow, decals, census scenes | `src/game/buildkit/domeBuildings.ts`, `domeShell.ts`, `domeLod.ts`, `scripts/perfBudget.json` new scenes | `game/perfCensus.ts` (add the scene) | D0 |
| **D7** | Airlock openings, interior slots, walking, camera, cutscene routing | `src/game/buildkit/domeInterior.ts`, `sim/dome/airlocks.ts` | `sim/cutNav.ts`, `game/cameraObstacles.ts` | D1, D6 |
| **D8** | Exposure: visibility, glow, glint, talk, raider weights, wall mapping for battle | `src/sim/dome/exposure.ts` | `reputation.ts`, `stealth.ts`, `encounters` weights, `battle.ts`/`perimeter.ts` (shell as a wall) | D0, D3 |
| **D9** | Economy: contractor for T3, crew queues, Founder start (if approved), tax and estate | `src/sim/dome/contractor.ts` | `crews.ts`, `startFunds.ts`, `paperwork.ts`, `estate.ts` | D0, D1 |
| **D10** | QA scripts, balance harness, screenshot sets, DECISIONS rows, GDS update | `scripts/domeShots.mjs`, `scripts/domeBalance.test.ts` | `docs/*` | all |

**Order:** D0, then D1 and D2 and D6 in parallel, then D3, D5, D7, D8, D9, D4, finally D10. The simulation lands before the art so the model can be tested without a GPU. **Save bump** lands with D1 (the first typed field). **First shippable slice:** D0, D1, D2, D3 (shell and clean zone), D5 (cards), D6 (T1 only), D7 (one airlock): a Berm Shell you can build and sit out fallout in.

---

## 13. QA checklist

Pure and unit tests:
- [ ] `geometry`: area, volume, footprint, catchment match the worked numbers in sections 5.2 and 7.1 (60 ft, 150 ft, 360 ft).
- [ ] `cost`: defaults and ranges equal the table in 4.1; cost is **monotone in diameter**; weeks fall as crews rise but never below the cure floor.
- [ ] `climate`: kW per mode; monotone in gap; T3 > T2 > T1 at equal gap; frost mode never below 34 F; heat dome case documented.
- [ ] `air`: the 60 ft sealed case hits 5,000 ppm near 48 hours and the 150 ft case 16 times later; scrubbers and plants only help (monotone).
- [ ] `protection`: PF monotone in cover and shell thickness; a dome never lowers a bunker's PF; T3 skin PF about 1.5.
- [ ] Property test: **every dome element is monotone** (a dome never makes the family worse off against weather, ash, fire or fallout) except the explicit visibility and prize terms.
- [ ] Save: v98 to v99 pass-through loads; a save with no `domes` field loads; export and import round-trip.
- [ ] `sim/unitsLint.test.ts` passes (no metric in player text).
- [ ] Every event has a sign, a price and a fix; the gauges are always visible.

Visual and perf (Playwright set `scripts/domeShots.mjs`):
- [ ] Street-level shot with a person **beside the airlock** (scale: person 0.28 units, door about 0.37, 60 ft dome about 3 units wide).
- [ ] Aerial and eye-level shots of T1, T2, T3 at noon and night, in snow and in ash, Low, Medium and High, software GL.
- [ ] **No camera inside geometry** (Walk and Tour through the airlock; the shell ring blocks); **no modal covering the view**.
- [ ] People cross only through airlock openings (the cutscene leak audit `cutLeakCheck.mjs`).
- [ ] `npm run perf:budget`: the new `dome_*` scenes pass and **no existing limit changed**; the mountain scene is unchanged.
- [ ] `game/battle/propsLeak.test.ts` style: building and demolishing a dome disposes all geometry, materials and instances.
- [ ] Lint, tests and build pass; CI `check` and `perf-budget` green.
- [ ] Balance: raid win rates (`raidBalance.test.ts`) and the strategy bots show no regression at Cozy; Hardcore bites as designed.

---

## 14. Sources

Research via web search (search-result summaries only; Wikipedia pages could not be fetched in this session). Weak-quality pages are marked.

- Biosphere 2 oxygen, concrete and crew: [Kenyon College, "What Went Wrong?"](https://biology.kenyon.edu/slonc/bio3/2000projects/carroll_d_walker_e/whatwentwrong.html); [The Scientist, "Lessons from Biosphere 2"](https://www.the-scientist.com/lessons-from-biosphere-2-64464); [Earth Magazine, September 26, 1991](https://www.earthmagazine.org/article/benchmarks-september-26-1991-crew-sealed-inside-biosphere-2/); [Designboom](https://www.designboom.com/architecture/biosphere-2-humans-earth/); [Edinburgh archival page](https://archive.bio.ed.ac.uk/jdeacon/biosphere/biosph.htm). Lower quality: ecoticias and everhem rewrites.
- Monolithic Dome costs: [monolithic.org, "What it costs, part 1"](https://www.monolithic.org/blogs/design/what-it-costs-part-1); [monolithic.org FAQ](https://www.monolithic.org/faq/how-much-does-a-monolithic-dome-cost); [How much does a Monolithic Dome home cost?](https://www.monolithic.org/stories/how-much-does-a-monolithic-dome-home-cost); [Angi, 2025 data](https://www.angi.com/articles/monolithic-dome-house-cost.htm); [Shelter Dome](https://shelter-dome.com/blogs/geodesic-dome-vs-monolithic-dome/). Lower quality: risingsunartscentre.org pages.
- Safe rooms and storm shelters: [FEMA P-361](https://newtools.cira.state.tx.us/upload/page/12213/docs/SR/FEMA%20Publication%20P-361.pdf); [FLASH, install a safe room](https://flash.org/mitigation/install-a-safe-room/); [UL, ICC 500](https://www.ul.com/thecodeauthority/knowledge/icc-500-certified-protective-storm-shelters-and-safe-rooms). Vendor: insulgard.com.
- Fallout and shielding: [Health Physics Society, ask the experts q14414](https://hps.org/publicinformation/ate/q14414/) and [q14423](https://hps.org/publicinformation/ate/q14423/); [NIST NBS Monograph 76](https://nvlpubs.nist.gov/nistpubs/Legacy/MONO/nbsmonograph76.pdf); [Navy engineering training, protective shielding](https://engineeringtraining.tpub.com/14057/Radiological-Exposure-Control-223.html). Informal: survivalblog and modernsurvivalblog (numbers only to cross-check).
- Collective protection and air: [Army ECBC M20A1 SCPE brochure](https://webarchive.library.unt.edu/web/20121019162931/https:/www.ecbc.army.mil/ip/brochures/ecbc_m20a1_scpe.pdf); [FM 3-4 chapter 6 (GlobalSecurity)](https://www.globalsecurity.org/wmd/library/policy/army/fm/3-4/Ch6.htm); [HDT collective protection](https://www.hdtglobal.com/wp-content/uploads/2022/03/HDT_ColPro_Systems_12.pdf). Vendor: swissshelters article.
- Eden Project and ETFE: [Institution of Civil Engineers, Eden Project](https://www.ice.org.uk/what-is-civil-engineering/infrastructure-projects/eden-project); [Place North West, Eden funding](https://www.placenorthwest.co.uk/eden-project-asks-for-70m-from-govt/); [Ingenia, "How an Eden was created in Cornwall"](https://ingenia.org.uk/articles/how-an-eden-was-created-in-cornwall/); [IIBEC, 2009 and 2007 ETFE papers](https://iibec.org/publication-post/2009-01-wilson/); [Glass on Web, glass in biomes](https://www.glassonweb.com/article/performance-glass-cladding-material-long-span-biome-structures); [Architen Landrell](https://architen.com/?p=5241). ETFE cost pages found were low quality and not used.
- Montreal Biosphere: [Wikipedia](https://en.wikipedia.org/wiki/Montreal_Biosphere); [Canadian Encyclopedia](https://thecanadianencyclopedia.ca/en/article/montreal-biosphere); [Espace pour la vie history](https://espacepourlavie.ca/en/history-biosphere?lang=en).
- Survival Condo and bunkers: [KCUR 2017](https://www.kcur.org/arts-life/2017-03-15/in-an-age-of-anxiety-apocalypse-proof-bunkers-in-kansas-sell-for-3-million); [Popular Science](https://www.popsci.com/technology/converted-cold-war-missile-silo-for-sale-kansas/); [Time Out](https://www.timeout.com/usa/news/a-former-missile-silo-in-kansas-is-turning-into-a-luxurious-survival-condo-for-the-super-rich-070720); [CLUI](https://clui.org/ludb/site/survival-condo-silo-1). Prices are press figures and inconsistent.
- Closed life support: [MELiSSA Foundation FAQ](https://www.melissafoundation.org/page/faq); [npj Microgravity, 2023](https://www.nature.com/articles/s41526-023-00317-9.pdf); [Frontiers editorial, bioregenerative life support](https://www.frontiersin.org/journals/astronomy-and-space-sciences/articles/10.3389/fspas.2022.977364/pdf).

**Tagged [M] (verify before any number is shown):** Climatron 1960; Biosphere 2 construction cost, food and crew details, power use; ETFE U-value, knife cutting, melt behavior; HVL values for earth and concrete (2.4 and 3.6 in); shotcrete cost per placed yard; PV, HVAC and chiller sizes; heat gain figures; ash load per inch; CO2 and O2 metabolic rates; ground temperature; Cal-Earth rung costs; all T1 to T3 line items in 4.1 other than the cited anchors; upkeep rates. All of section 9's numbers are design proposals.

---

## 15. Questions for the owner

Each has a recommendation. Answers drive which work packages start.

1. **Scope: which tiers ship first?**
   - A. T1 only, prove the system.
   - B. **T1 and T2 first, T3 later (recommended).**
   - C. All three at once.
   - D. Only T3 as the dramatic late-game project.

2. **Who can afford a dome (wealth gate)?** A $1.4M independent start cannot buy T2 ($3.5M to $9M) and certainly not T3.
   - A. **Add a "Founder" start tier of $5M to $25M and a "Magnate" tier above $60M that unlocks T3 (recommended).**
   - B. Let T2 and T3 be reached by income during peacetime (a rich job, a startup exit, an inheritance event).
   - C. No wealth gate: the player picks any size and the cost is only a number (sandbox).

3. **Is the dome a replacement for the bunker or a layer on it?**
   - A. **Layer: the dome adds weather, climate, clean ground and a second air line; fallout PF still comes from the bunker room and earth cover (recommended).**
   - B. Replacement: a thick enough dome is its own bunker (simpler, less realistic).
   - C. Independent track with its own PF and failures, unmodeled together.

4. **Atmosphere realism: how deep?**
   - A. **Lockdown mode of days to weeks with a CO2 clock; no full closed ecology (recommended).**
   - B. Add oxygen drift and a managed "inject outside air" card (the Biosphere 2 arc) for T3 only.
   - C. A full closed-loop simulation with plants, O2 and CO2 trade (heavy and fiddly).

5. **Visibility and raiders: how hard does a dome pull a crowd?**
   - A. **Visibility rises with tier; sod, night shades and walls reduce it; raider weights go up by `1 + 0.8 x attract` (recommended).**
   - B. Neutral: visibility only matters for the Sightlines overlay and rumors, no raid change.
   - C. Extreme: T2 and T3 are raid magnets with bespoke siege waves.

6. **T3 construction: how is a 60 to 150 worker project shown?**
   - A. **A contractor abstraction (monthly draw, progress by stage) with at most 24 instanced workers and cranes on screen (recommended).**
   - B. Real crews only, up to the existing `maxCrews` (T3 takes decades; effectively unbuildable).
   - C. Instant on a purchase (no stages).

7. **Failure severity by difficulty.**
   - A. **Cozy has gentle events and long timers; Standard and Hardcore have the full table and no free repairs (recommended).**
   - B. Same events at every level, scaled in cost only.
   - C. No random failures; only the player's own neglect causes them.

8. **What is under the dome: fixed zones or free placement?**
   - A. **A small set of zone slots (house, garden, well, cistern, shop, coop) the planner fills; the rest is open ground (recommended, cheaper to build and render).**
   - B. Free placement of any existing structure under the dome (more freedom; heavier on the sim and on interior collisions, and you must ensure buildings fit).
   - C. Dome interior is a single prefab "village", no player placement.

9. **Region fit: does the region change what a dome costs and does?**
   - A. **Yes: Mountain West favors T1 and T2 (snow, cold, sun); Plains (hail, tornado) favor T1 and T2 and punish T3; Desert favors berm and punishes glass (heat); PNW (rain, cloud) punishes T3 with mold; each region sets `U`, snow and hail numbers (recommended).**
   - B. Uniform costs and performance everywhere.
   - C. Limit T3 to two or three regions.

10. **Permits and the county before the hit.**
   - A. **Real permits and engineer stamp for T2 and T3, with a "build without a permit" risk (a stop-work order) and a visible rumor in the county news (recommended).**
   - B. No permits for any dome.
   - C. Permits only for T3.

11. **Where does the dome sit in progression and discovery?**
   - A. **An "Enclosure" group in the Build menu that shows T1 always and T2 and T3 only after a hint source (an engineer consult, a magazine, or a wealth threshold), so the first hour stays simple (recommended).**
   - B. Always visible at all times.
   - C. Hidden until a story hook (an event or a neighbor who builds one).

12. **Tone: grounded or pulpy?**
   - A. **Grounded prepper realism now; keep a hidden pulpy "arcology" (Vault, Capitol) as a later optional unlock on the same system (recommended).**
   - B. Add the pulpy arcology tier now (a fourth tier of $400M+).
   - C. Strictly grounded forever.

## Owner decisions (2026-11-17)
1. **Tiers:** all three tiers ship together (T1 berm shell, T2 core dome, T3 glazed biosphere), plus the cheap small earthen dome rung.
2. **Layer, not replacement:** the dome sits on top of the underground bunker, which keeps the fallout protection factor.
3. **Atmosphere:** lockdown mode with a CO2 clock for every dome; advanced air filtering is a paid upgrade; a full closed ecology is a very expensive late option that makes the dome habitable permanently.
4. **Visibility and defense:** a dome is a very visible target but can be well defended. The top tier is a sci-fi "Arcology" unlock: complex polycarbonate-type composite walls that are effectively impervious to firearms, missiles and other outside threats (lean into science fiction there). T1 and T2 stay grounded (real materials).
5. **Money:** Founder ($5M to $25M) and Magnate ($60M+) start tiers gate T2 and T3; poor and middle families get the small dome and the berm shell.
6. **Layout (free placement):** no zone slots. The dome simply goes over part of the property, inside the property boundary, and the player still builds whatever they like inside the compound. The dome has its own atmosphere, weather and climate inside. Needs a footprint tool (center and radius or ellipse, clipped to the property line) and a rule that existing buildings, walls and the creek are handled (inside, straddling, or blocked). Cost scales with footprint area, so covering a whole 40-acre parcel is a T3-scale or beyond project; the tier sets the maximum span.
7. **Dug deep:** the dome wall has a deep buried skirt (footing) all the way round, so tunneler crews cannot dig under it. Reuse the existing tunneler counters (deep footings and buried skirt, ground sensors); a dome skirt is the strongest version, priced by depth. Tunnels and the escape route cross it only through an airlock or sally port.
8. **Permits and discovery:** an Enclosure group in the Build menu. T1 is always shown; T2 and T3 unlock by wealth tier or a hint. T2 and T3 need real permits; building without one risks a county fine and a rumor.
9. **Still open (recommended default in brackets):** contractor abstraction for T3 workforce (at most 24 instanced workers on screen); failure event difficulty scaling (gentle on Cozy, full on Standard and Hardcore); per-region cost and performance; tone for any later pulpy arcology tier is already covered by decision 4.

## Status: first slice shipped (D0 to D3 plus the shell render; 2026-11-17)

Where the dispatch and this document differ, the dispatch (the owner's newer reading) wins: **the tiers are now by material**, not by shotcrete shell. See the DECISIONS row "Domed compound, first slice".

| Tier | Kit id | Shell | Footprint | Default bill (goods + site labor + permit) | Gate |
|---|---|---|---|---|---|
| Earthen (the cheap rung) | `dome_earthen` | 20 ft earthbag, plaster, sod crown, one door | 20 ft | about $19k of goods, $61k if a crew builds it | none |
| T1 Geodesic | `dome_geodesic` | 60 ft aluminum geodesic frame, twin-wall polycarbonate, 5 ft berm, 2 airlocks | 70 ft | about $1.2M | none; permit $2,800, 30 days |
| T2 Glass & steel | `dome_glass` | 150 ft steel gridshell, laminated glass, 3 airlocks | 150 ft | about $9.4M | $5M cash (Founder); permit $24,000, 120 days |
| T3 Arcology | `dome_arcology` | 360 ft space frame, clear armored polycarbonate-composite panels (impervious to firearms and missiles), 6 airlocks, armored skirt band, crown spire | 360 ft | about $99M | $60M cash (Magnate); permit $180,000, 420 days |

**Done (all tested, `src/sim/dome/`, `src/game/buildkit/domeBuildings.ts`):**
- `tiers`, `geometry`, `cost`: one table, spherical-cap geometry, the bill by stage from the geometry (kits in 1,000 sq ft units, concrete for the buried skirt, crew wages for site hours).
- `protection`: wind, hail, snow, ash, fire, fallout PF, EMP, blast, weapon stop shares; breach test against outside loads and shell health; the dome never lowers a bunker's PF; clean-zone rule.
- `climate`: U x area x gap, greenhouse rise, frost / temperate / comfortable modes, kWh a day.
- `air`: the lockdown CO2 clock (exact solution with leakage, scrubber, advanced filter, plant beds, power), the paid filtering and closed-ecology prices.
- `exposure`: visibility miles, attraction = visibility x (1 - hardness), looter and gang weight multipliers.
- `siting`: rectangle vs circle (inside, across, clear), the off-parcel test, wealth gates, permit fee and review days, the buried skirt vs a normal dig.
- Wired: a new kit level `cover` (no pad, no clash with what is under it; a building or wall cut by the shell is refused), blueprints, seven goods on a Domes shelf, permit and review, the Build catalog and classic menu Enclosure group with hover bills, wealth gate in `buildOff`, structureDamage ratings, procedural shell render (stem wall and berm draped on the hill, partial build by stage, colliders with gaps at the airlocks), circle plan mark.

**Left, in this order (each a package of 12 above):**
1. Lockdown mode as game state (`DomeState`, the live CO2 and O2 clock on the Compound Board, the LOCK DOWN toggle, fail-safe vents), paid advanced filtering and the closed ecology as purchases, climate mode choice and the power load node in `utilities.ts` (D2 state, D4 events).
2. Tunnels and the escape route crossing by an airlock (`tunnelers.ts` reads `skirtStops`, `cutNav.ts` and `bunkerHatchPlan` get the airlock openings), people routed through the airlocks (D7).
3. Raids against the dome: the shell as a wall segment and the airlocks as gates in `battle.ts` / `perimeter.ts` using `STOPS`, the shell in `lineOfFire.ts` and `cameraObstacles.ts` as an annulus (D8).
4. Fallout and weather: the clean zone and the dome as a shelter candidate in `nuclear.ts` / `hardening.ts`, the dome's own weather and temperature inside the shell (snow, rain and frost kept out visibly; the dome currently only renders its shell, the weather outside is the world's), the greenhouse tier row (D3 remainder).
5. Visibility into `stealth.ts` / `reputation.ts` and the encounter weights (`attract`, `looterWeight`, `gangWeight`) (D8).
6. Placement: the diameter handle (sizes are fixed per tier now), the circle ghost, free center placement with a clipped-to-the-lot warning (D5).
7. Perf census scenes `dome_t1` to `dome_t3` in `scripts/perfBudget.json`, LOD far mesh and the Low tier shell (D6).
8. Contractor monthly draw for the arcology, failure events, per-region cost (D9, D4).

## Status: lockdown slice shipped (live air, filtering, closed ecology, climate and the clean zone; 2026-11-18; save v99)

Where it lives: `src/sim/dome/live.ts` (+ `live.test.ts`, 30 tests), `src/ui/hud/DomePanel.tsx` (the Dome page of the Utilities drawer, Layout A and Classic), `src/game/fx/DomeAir.ts` (haze and plants). Hooks: `engine.ts` (`stepDome` per sub-step, `domeDay` per day), `utilities.ts` (load node and priority), `nuclear.ts` (clean zone, shelter), `heating.ts` (`domeHeatK`), `disasterFx.ts` (`fxCards` / `fxChoose` carry the `dome:` cards), `compoundBoard.ts` and `whatToDo.ts` (the single air alert).

- **Done:** lockdown toggle, live CO2 and O2 clock, fail-safe vents, filtering ladder as purchases with bills and install days, closed ecology (permit, upkeep, food, blight, tend), power node with life-support priority, climate mode and inside/outside temperature, wood saved by a powered dome, fallout clean zone and dust, four failure cards, board and What-to-do alert, haze and plants, 30 tests (monotone filtering, vents, purchases, power, fallout, cards, save).
- **Next (unchanged order):** tunnels and airlock crossing (parallel agent), raids against the shell, visibility into stealth and encounter weights, placement handle, perf scenes for the new meshes if they grow, per-region cost, contractor draw. Open owner questions are in the PR.
## Status: tunnels, airlock crossing, raids and visibility (2026-11-18)

Items 2, 3 and 5 of the list above are in, except where noted. See the DECISIONS row "Dome raids, tunnel crossing and visibility".
- `sim/dome/standing.ts` (the domes on the place, airlocks, panel health), `crossing.ts` (tunnel crossing rule, skirt against a dig), `siege.ts` (shell odds, airlock doors, sally port, panel jobs, `withDomeShell`), `watched.ts` (visibility, look, attraction). Tests: `sim/dome/siege.test.ts`, `game/buildkit/domeAirlockNav.test.ts`.
- Rendering: tunnel portal collar and spoil strip at each crossed airlock (`game/props/DomePortals.ts`), panel holes (`RaidDamageRenderer` kind `panel`, live while a cutscene plays). Scripts: `scripts/domeRaidMovie.mjs`.
- Known limits: the airlock vestibule is still a solid block with a door painted on it (slice 1), so people are routed through the gap in the shell collider at the airlock rather than through a hollow chamber; the line-of-fire map in the game scene (not the sim) does not yet draw the shell, so cutscene tracers can cross a T3 shell; `shellOpen` is not yet read by any lockdown code; the earthen dome is not a raid shell unless the home is under it.

## Status: atmosphere slice (every dome its own air, comfort band, water loop, farm and felt wiring; 2026-11-18; save v100)

Owner decisions of 2026-11-18, all built: (1) every finished dome runs its own air, filtering, ecology, climate, water loop and power node; (2) the interior is comfortable for people, stock and plants, never cooks, and re-uses and collects water; (3) the nuclear and fallout felt chain has a dome branch; (4) the closed-ecology power model was researched and retuned (below); (5) the Geodesic airlock doors are harder (ram odds 0.6 to 0.45, tiers still monotone).

- **Per-dome state.** `GameState.domes[structureId]` holds each dome's switches and gauges; `GameState.dome` still mirrors the biggest tier (older readers and the board). A v99 save's single `dome` is adopted by the main dome on first step. Every control and card takes an optional dome id (`@id` suffix on a non-main dome's card ids). People are split among domes by the homes under each shell (a family with no home under a shell counts with the main dome). Power: one load node per dome (`domeKwhDay(s, st)`, `domeLoadPriority(s, kind, id)`).
- **Comfort band** (`dome/climate.ts`). Modes: Frost 34 to 95 F, Temperate 50 to 85 F, Comfortable 64 to 78 F (default Temperate; the old frost mode allowed 120 F). Above the band the plant sheds heat down a ladder, cheapest first: open vents and fans (only while the dome is open), roof screens, evaporative pads (water, weak in humid country), chillers (COP 3.5). Heating is a heat pump (COP 3). With no power the vents and screens still work by hand, but heating, pads and chillers are off, and a sealed shell that reaches 105 F opens its own fail-safe vents. Hot-day cost fell from about 855 kWh a day (chilling everything, small dome, 95 F, full sun, Comfortable) to about 360 kWh at the rate full-sun hours run, and Temperate about 320.
- **Water** (`dome/waterLoop.ts`, `utilities.ts` balanceDay). The shell is a roof: rain and snowmelt on the footprint go to the cisterns when the dome is on a water line with one (80 to 85 percent catch glazed, a third less with no first-flush diverter and sand filter). Loops are purchases: Graywater loop (reuses about 35 percent of household water; pumps and UV) and Full recycle loop (about 80 percent). Beds under glass give back 18 liters (4.8 gallons) a day each as condensate on the cold coils while powered. The evaporative pads drink water on hot days. All of it enters the existing daily water balance.
- **Farm.** A powered dome that holds frost-free (34 F or more) stretches the garden's season by 30 days at each end (60 at 50 F or more), makes greenhouses and aquaponics bays under it count as heated (the bay's heater cost falls 60 percent and its water sees the dome's air), and adds up to 12 percent yield at full comfort (4 percent from the bare shell). Animals housed under a dome fall sick up to 40 percent less in comfort and up to 30 percent more when the dome cooks or freezes them (`dome/agro.ts`, read by `crops`, `needs`, `greenhouse`, `aquaponics`, `herd`).
- **Felt layer** (`felt/domeFelt.ts`). Nine radio lines in every kind (air alert, shelter notice, ham chatter about the glass house, trade talk about the only tomatoes in the county, the fence-line gossip about the glass house on the hill and a scout walking the fence, a false rumor about dome seats for sale), each tied to the claims `dome_stands` or `dome_sealed`. Fallout: the generic "How long to stay sealed" card steps aside when a dome stands, replaced by the dome branch (seal, buy the advanced air bank, seal and dash out for water); a second card, "A hot day under a sealed dome" (chillers, open the vents, ride it out). Dome-life cards on the Next-steps list: hot day, water-loop failure, livestock stress (plus the existing filter, blight, power, plant cards).
- **UI.** Dome page: a list of domes (each with its own air, temperature, people and power), the selected dome's air, filtering, comfort band, and the rain and water loop panel. Screenshots: `docs/ux/dome4/`. Script: `scripts/domeAtmoShots.mjs`.
- **Known limits.** The 3D scene draws no weather inside or outside a dome (only the shell, the CO2 haze and the closed-ecology plants of the main dome, `DomeAir.ts`); a second dome has no haze or plants yet. The per-dome people split follows homes, so a dome with no home under it has nobody breathing in it. The placement agent's diameter handle will need `DomeRef.cells` to read the structure's own size (`domesOf` is the one place that builds it).

### Closed-ecology power: research and the number chosen (owner decision 4)

Question: is about 75 kWh a day right for a small Tier 1 (60 ft geodesic, 2,800 sq ft of floor, 5,700 sq ft of shell) dome? Figures found (converted to US units; sources below):

| Facility | What it draws | Per sq ft of floor per day |
|---|---|---|
| Biosphere 2 (3.14 acres, 137,000 sq ft under glass, mostly cooling; hot-water boilers are gas, 20 million Btu an hour) | average load 570 kW, about 5 to 6 million kWh a year (the site's own energy page), about 13,700 kWh a day | about 0.10 kWh |
| BIOS-3 (Krasnoyarsk, 11,000 cu ft, up to 3 people, no sun: xenon lamps) | about 400 kW, a widely repeated figure with a weak source, so 130 kW per person | far above any sunlit dome: lamps are the cost |
| Indoor plant factory with LED lights, no sun (a cold-climate vertical farm study) | 48 to 72 kWh per sq ft a year, lighting 46 to 75 percent, 4.5 to 8 kWh per pound of lettuce | 0.13 to 0.20 kWh |
| Dutch glasshouse (sun plus heat; sector average) | 28 to 31 kWh per sq ft a year, mostly gas heat; lettuce houses only 5 kWh per sq ft a year, tomato with grow lights 71 | about 0.08 kWh (heat) |
| NASA and ESA closed-loop life support per crew member | not found in the searches (no usable number), so the dome does not lean on it | n/a |

Reading: a sunlit glass dome pays for heat and for moving air and water, not for light. 2,800 sq ft at the Dutch 0.08 kWh a day is about 230 kWh of heat; a heat pump at COP 3 turns that into about 75 kWh of electricity, which is exactly what the model said to hold a 34 F floor on a 20 F night. So 75 kWh was right for the heating bill and too cheap for the dome: it left out the circulation fans, irrigation and sump pumps, controls and UV that a living dome runs all day. **Chosen:** keep the climate model, add a standing house load of **12 kWh per 1,000 sq ft of floor a day** (34 kWh for the small dome; Biosphere 2's whole-site figure of 0.10 kWh per sq ft is about three times that, because it has a research plant, cooling a 3-acre volume and a crew), so the small dome draws about **108 kWh a day on a 20 F night** (75 heating + 34 house load), plus 0.1 to 1 kW for a water loop, and the air plant while sealed. The hot-day ladder (above) replaces the old 855 kWh figure. Supplemental grow lights are not modeled (the dome runs on sun; BIOS-3 is the warning about what lamps cost).

Sources: Biosphere 2 energy and water page (biosphere2.org/research/user-facility-information/energy-and-water); University of Manitoba vertical-farm thesis (mspace.lib.umanitoba.ca); Dutch greenhouse energy benchmarks, Wageningen (edepot.wur.nl) and EECA covered-cropping benchmarking; BIOS-3 (Wikipedia, IBP Krasnoyarsk), with the 400 kW figure marked weakly sourced.
