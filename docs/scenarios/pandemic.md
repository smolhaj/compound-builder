# Scenario: Pandemic (`pandemic`)

Design doc, not code. Group: biological. Status today: kind exists in `src/sim/disaster.ts` (one variant, warning 30-60 days, chains into `lawless` 20%), with five kind-specific hooks (contagion at the gate 0.25 and at home 0.06 a day per sick person, neighbor plague mortality x4, refugees x2, arrivals x1.4, traders x0.5, scavenging sickness, market crash 30%). See `docs/DISASTER_TEETH.md` section 2 (rank 13 of 16, "real; missing closures and supply-chain texture") and `docs/research_disasters.md` section 5.

Evidence tags: **(verified)** checked this session against a source; **(commonly cited)** standard in the literature, not re-checked here; **(design)** my number for tuning.

The thesis: **infrastructure stays physically intact; people fail.** The grid, the pipes and the trucks are fine and the shelves go empty anyway, because the person who drives, the person who repairs and the person who answers the phone is in bed or dead or afraid. That is the thing no other scenario in the game does, and the compound's answer is also unique: a sealed, self-fed place is *the* winning move, and the game then asks what sealing it costs.

---

## 1. Real-world basis and analogs

| Analog | Figures | Lesson for the game |
|---|---|---|
| **1918 H1N1 ("Spanish flu")** | About 50 million dead worldwide (estimates 17-100 million); about 675,000 US deaths in a country of 103 million (0.65% of the population); about 28% of Americans infected; overall case fatality about 2%. Life expectancy at birth fell roughly 12 years in 1918. Three waves: a mild spring 1918, a **deadly fall wave (Sept-Dec 1918)**, a smaller winter 1919 wave. Deaths were W-shaped by age: infants, **young adults 20-40**, and the old. (commonly cited; CDC "1918 Pandemic" history page) | The second wave is the killer, the first wave lulls people. Healthy adults die, so the labor force is hit, not just the old. |
| **Philadelphia vs. St. Louis, Sept-Oct 1918** | Philadelphia held a Liberty Loan parade of about 200,000 on Sept 28; about 12,000 died in the next six weeks. St. Louis closed schools and banned gatherings within two days of its first cases, and its peak death rate was about one eighth of Philadelphia's. (commonly cited; Hatchett, Mecher, Lipsitch, PNAS 2007; Markel et al., JAMA 2007) | Early, hard distancing flattens the curve. It is the player's own version of the "days of warning" decision. |
| **Protective sequestration** | Gunnison, Colorado closed the county line in Oct 1918 (roadblocks, quarantined arrivals, a rail passenger ban) and recorded no flu deaths while the surrounding state burned. American Samoa blockaded and had **zero** deaths; Western Samoa did not and lost about 22% of its people. Brevig Mission, Alaska lost 72 of 80 residents in five days. (commonly cited; Markel 2007; the Gunnison account is often repeated and is a good story, treat the exact zero as folklore-grade) | Sealing works if done before the first case and held for the whole wave. The cost is isolation, and one breach undoes it. |
| **COVID-19, 2020-23** | About 1.1 million US deaths (about 0.33% of the population) over three years; pre-vaccine infection fatality about 0.5-1%, with age as the dominant factor (under 18 near 0.002%, 18-49 about 0.05%, 50-64 about 0.5%, 65+ about 5-10%). Incubation median about 5 days, 97.5% show symptoms within 11-12 days (Lauer et al., Ann Intern Med 2020). Original R0 about 2.5-3. Hospital ICUs saturated in waves (NYC April 2020, Midwest fall 2020, Delta summer 2021, Omicron winter 2021-22). Vaccine: genome published Jan 2020, first US emergency use Dec 11, 2020 (11 months). (commonly cited; CDC, Lauer 2020) | Prices and shelves: toilet paper, N95s, hand sanitizer, flour and yeast, bicycles, lumber, appliances, semiconductors. Meatpacking plants closed in April-May 2020 (Smithfield Sioux Falls, Tyson Waterloo) and removed about a quarter of US pork slaughter capacity for weeks (commonly cited). Rural counties were hit **later and harder per capita** in the fall 2020 wave. |
| **Black Death, 1347-51** | Roughly 30-50% of Europe's population. (commonly cited) | The upper bound, for the `high_fatality` variant's flavor text only. Not modeled. |
| **Staffing planning assumption** | US federal pandemic influenza plans assumed up to about 40% worker absence in the worst two weeks of a severe wave (HHS planning guidance; commonly cited). | Drives the `deliveries`, `medical`, `law` and eventually `grid` curves: they fall from absence, not damage. |
| **H5N1 in humans** | About 50% case fatality in the roughly 900 confirmed cases since 2003 (WHO), but almost no sustained human-to-human spread. (commonly cited) | The `high_fatality` variant: a pathogen that kills like H5N1 and spreads *slowly*, or one that finally learns to spread. |

Calibration: **COVID-like is the Standard default. 1918-like is the hard variant. High-fatality is Hardcore flavor.** None of them is a zombie plague. The `bioweapon` doc is where depopulation lives.

## 2. Warning signs and how the player notices

Warning is 30-60 days at Standard (`DIFFICULTY.warn`: Cozy x1.6, Hardcore x0.4, so Hardcore gets 12-24 days). The existing `hints` array has three stages; this doc sets what each should *do*, not only say.

| Stage | Days before hit (Standard) | News (radio, newspaper clipping on the day card) | What the player can notice and do |
|---|---|---|---|
| Early | T-60 to T-35 | "A cluster of atypical pneumonia overseas." "WHO convenes an emergency committee." Airport screening. | Shop price `priceFactor` on masks, thermometers and OTC fever medicine starts rising before bread does (a per-item warning factor, see section 10). The pharmacist at the town store says the wholesaler is short. Stock up cheaply now; a box of 50 surgical masks is about $15 now, $60-120 at the hit. |
| Middle | T-35 to T-12 | "First US case, a traveler." "Hospitals restrict visitors." Neighbor's nurse daughter says the ER is full. School district "monitoring". | The store hours shrink and a sign appears on the door: "limit 2 per customer." The player's **scavenging sickness** line becomes visible on run risk cards (`riskOf().sickness`), so the safest place to be before the hit is already known. |
| Late | T-12 to T-1 | "Community spread confirmed in the state." Governor declares an emergency. Panic buying. Schools close. The county health officer asks people to stay home. | Shelves empty in order: sanitizer, masks, flour, yeast, toilet paper, canned beans. A gate card appears for the first time: "A neighbor asks whether you will still trade across the fence." The CollapseChip shows a pandemic wave tracker (a small number: county cases). |

Cozy: the county health officer's call comes twice and lists exactly what to buy (a tutorial through the day card). Hardcore: warning text is vaguer, and **no price pre-warning** on masks.

Notice-ability rule: every warning item is *an action the player can take for money or hours before the hit*. If the player ignores all of them the first week after the hit is expensive, not lethal, because Standard gives the first death no earlier than day 18 (the incubation plus one wave ramp).

## 3. Timeline (Standard, COVID-like variant; deltas for others in section 5.4)

"The hit" is the moment of national declaration and lockdown (the game's `hitAt`), not the first case, which was a week or two earlier. County prevalence `prev` is the share of the county currently infectious (design); waves per section 5.1.

| Phase | The world | The compound |
|---|---|---|
| **Hit moment** | An emergency alert on the radio and phone: "The President has declared a national emergency. Stay home." The county health officer's statement. Stores announce reduced hours. Highways nearly empty by evening. | Headline card "The pandemic is here." Decision gate: **"Seal the gate or stay open?"** (the sequestration choice; section 8). Day card suggests: mask stock, isolation room, who goes to town last. |
| **First hour** | Panic buying peaks; the feed store has a line out the door; the pharmacy has no thermometers. | Anyone in town gets a roll of exposure at the store (a small 0.02-0.05 per visit while `prev` is low). The player can send the last supply run now, at the cheapest it will ever be. |
| **Day 1** | Schools closed. Church and the Grange hall closed. The state parks and the county road are quieter. `deliveries` starts to fall (track curve `at: 3`). | Neighbors call; two ask to borrow a thermometer and oximeter. First rumor line on the radio: "Four cases at the nursing home in the county seat." |
| **Week 1** | First local cases. A volunteer fire department member dies at day 9-12 (neighborLife event). The hospital in the county seat goes to "diversion". Store limits: 1 bag of flour. | Arrivals: relatives from the city (arrival encounters x1.4) ask to come. This is the vector. Quarantine cabin (section 5.3) or turn away. `prev` reaches 1-3%: gate contact risk becomes real. |
| **Month 1** | Wave 1 peak (day 30-45). 15-25% of the county infected over the wave; absenteeism 15-25% (bus drivers, nurses, deputies, line crews). Trucks late, shelves patchy (`stores` falls toward 0.4, `deliveries` toward 0.5). Funeral homes backed up, then a refrigerated truck at the county seat. | The first compound illness probably comes through a supply run or an arrival. Sick-room, caregiver hours, fever medicine and fluids drain stock. A family member can be the *first immune person*, which is a resource (section 5.5). |
| **Month 3** | Wave 1 over. A **false calm**: schools reopen in rumor, people drive again, traders return (trader weight back toward 1), the radio says "turning the corner". Prices still high. | Window to restock and trade, and to let the compound relax. The relaxing is the trap for wave 2. |
| **Month 6** | Wave 2 (day 150-240; autumn if the hit was in spring). For COVID-like: a bigger, faster variant, 25-35% of the remaining susceptible. For 1918-like: the deadly one. Staffing hits the grid: line crews short, a multi-day regional outage possible (`grid` dips to 0.6-0.8). | Same rules as wave 1 but the world is thinner (fewer neighbors, fewer refugees, more desperate ones). Prior immunity makes the first-wave survivors the compound's ambassadors. |
| **Year 1** | Wave 3 (day 330+) smaller. Fate roll: `full` (vaccine or herd immunity, services return from day 200-420), `partial` (the world is thinner: 35-80% service ceilings), `never` (fewer than half the workers remain; deliveries never return). | The compound has learned its routines; the question becomes whether to open the gate, rejoin the neighbors, take in survivors. |
| **Year 2+** | Endemic; a seasonal winter flu-like return (fires the existing `plague` yearly threat at higher base odds). Population down 0.3% (COVID-like) to 0.7% (1918) to several percent (high fatality). The school, church and store reopen in `full`; in `partial` a few do. | Long game: orphans (existing `orphans.ts`), widowers, a skills gap (the doctor and the mechanic died). Chains to economy and law (section 11). |

## 4. Effects by system

### 4.1 Service tracks (proposed variant curves, using the `C(at, fall, floor, back, ramp)` form of `disaster.ts`)

Existing single variant `wave` stays as the **COVID-like** default. Two new variants (weights 3 / 2 / 1):

| Track | covid_like (existing, w3) | flu_1918 (w2) | high_fatality (w1) |
|---|---|---|---|
| medical | C(0, 14, 0.1, [200,420], 60) | C(0, 10, 0.05, [240,500], 90) | C(0, 7, 0.0, [300,600], 120) |
| stores | C(3, 14, 0.4, [60,200], 30) | C(3, 14, 0.35, [90,260], 45) | C(5, 20, 0.2, [150,400], 60) |
| deliveries | C(5, 20, 0.5, [60,200], 30) | C(5, 20, 0.4, [90,260], 45) | C(7, 25, 0.25, [150,400], 60) |
| law | C(30, 60, 0.6, [120,300], 30) | C(25, 50, 0.45, [150,330], 45) | C(20, 45, 0.25, [180,420], 60) |
| banks | C(10, 30, 0.7, [60,200], 30) | C(10, 30, 0.6, [90,260], 45) | C(10, 30, 0.4, [150,400], 60) |
| fuel | C(10, 30, 0.6, [60,200], 30) | C(10, 30, 0.5, [90,260], 45) | C(12, 40, 0.3, [150,400], 60) |
| grid (new) | none | C(120, 90, 0.8, [240,420], 90) | C(90, 120, 0.5, [300,600], 120) |
| phone (new) | none | none | C(150, 120, 0.7, [400,700], 90) |

The grid and phone rows are the *staffing collapse* (research doc: "grid and water tracks fail from absenteeism around M+1 to M+3"): they start late and fall slowly, unlike every other scenario where they fall at the hit.

### 4.2 Money, prices, shops

- **Mask, glove, sanitizer, thermometer, oximeter, fever-medicine, antibiotic** items take a warning-stage `priceMods` multiplier (x1 to x4 at the hit, x2 sustained). Food `priceFactor` is the existing stores/deliveries read.
- **Store hours.** Store open days per week fall with the wave: 7 at `prev` < 1%, 5 at 3%, 3 at 8%, 1 at 15%+ (design). A closed day is a closed shop, no order, no sale. Online orders (`canOrder`) hold until `deliveries` < 0.25; then a shipment takes 14-30 days instead of 3-7.
- **Hospital and pharmacy.** `hospitalOpen` flips off in the peak (diversion) and returns after. Pharmacy runs: antibiotics for secondary pneumonia and fever medicine are the scarce goods; a fever-medicine bottle that cost $9 sells for $25 barter-equivalent in the first week.
- **Market crash 30%** exists (`CRASH.pandemic`). Keep. Add a **stimulus-like cash event at day 20-45 on Cozy/Standard** (a county relief check, $1,200 per adult in US 2020, so it is a real-world analog) that fades on `partial`/`never` fates. A small money buffer that makes the early game forgiving.
- **Barter.** The first goods to trade are masks, thermometers, medicine, canned food. The world is not violent; trade at the fence is the natural high point (section 8, drop box).

### 4.3 Neighbors

Existing: plague mortality x4, refugees x2. Add:
- Each neighbor household rolls `attack` per wave (section 5.1) and, if sick, a `death` roll by age and the medical track. Typical COVID-like county of about 10,000: 25% infected in wave 1, about 0.4% of the population dead by month 6 (so a 20-household neighborhood loses about 1 person).
- Dispositions shift: neighbors who lost someone are quiet and bitter; those who fared well are generous. Trust is a function of whether the compound has been breached by a known sick carrier.
- Neighbors **ask for help** by cards ("Mrs. Alvarez has a fever and no one to bring water. Leave a jug at the end of her drive?"), the neighbor-aid pattern with exposure rolled. High reward (bond, `neighbor_help` encounter), real risk.
- Mutual-aid groups form when `law` stays above 0.5 (the existing "groups forming when law < 0.5" is the *other* direction): in a pandemic the group is the church and the fire department, in `lawless` chain it is the militia.

### 4.4 Raiders and the encounter mix

- Pandemic is the **lowest-violence** of the five scenarios. Weights: `arrival` x1.4 and `refugees` x1.5 (existing), `trader` x0.5 in wave peaks then back to x1.0 in the calm, `looters` x0.6 for the first 60 days (everyone is at home), then a slow climb as `law` falls. Raid cadence lengthens ( `cadence` x1.5) for the first month.
- **New encounter flavors on top of existing kinds** (text only, reusing `arrival` and `refugees`): "a man with a cough asks for water"; "a mother with a feverish child, visibly ill"; "the county's contact tracer, with a clipboard and a mask"; "a nurse who walked out of the hospital" (a **joiner** with the `medic` skill: a very high value, a vetting question); "a sheriff's deputy collecting the sick".
- Hostile crews arrive only on the `lawless` chain; the siege-wave clock (`waves.ts`) stays idle for the first 120 days.

### 4.5 Health, food, water

- Daily need for food and water is normal; the pandemic itself causes fever, loss of appetite and care labor. A sick adult costs about 4 person-hours a day of caregiver time (design) and 1.5x water.
- Mental load: isolation raises stress (`mind.ts` already has `amt` 12 for pandemic). A sealed compound that never sees a neighbor for six months gets a slow loneliness meter (design: +0.15 stress a day over a baseline, relieved by a radio call or a fence-line chat).

## 5. Disease and exposure mechanics

### 5.1 Community model (the world side)

Keep it small and deterministic. `disaster.fx.outbreak = { variant, wave, start, peak, end, prevPeak, attack, ifr, imm }` (stored in the single `fx` bag from WP0).

- Waves are a smoothed bump: `prev(t) = prevPeak * exp(-((t - peak) / width)^2)`.
- COVID-like (Standard): wave 1 peak day 38, width 18, `prevPeak` 3.5%; wave 2 peak day 190, width 22, `prevPeak` 5%; wave 3 peak day 360, width 25, `prevPeak` 2.5%.
- 1918-like: wave 1 peak day 30, `prevPeak` 1.5% (mild); wave 2 peak day 120 (the "autumn"), `prevPeak` 7%, width 14 (sharp); wave 3 peak day 260, `prevPeak` 3%.
- High-fatality: one long wave, peak day 90, width 50, `prevPeak` 1.5%, and slow because it spreads poorly. Deaths come from fatality, not volume.
- Attack rate per wave = about 35-50% of `prevPeak x width x 2.5` (design), producing about 25% of the county infected for a COVID wave.
- Hardcore: x1.3 `prevPeak`. Cozy: x0.6 and no wave 3. Fate decides what is left: `full` ends all waves by day 420; `never` leaves a smoldering year-2 return.

### 5.2 Person-level exposure (the compound side)

States per person: `susceptible`, `exposed` (incubating, not yet infectious), `infectious_presymp` (the last 1-2 days of incubation, the reason quarantine is hard), `ill` (fever, severity), `recovered` (immune), `dead`. The existing `fever` hurt record is the ill state; incubation is new.

- **Incubation.** COVID-like median 5 days (range 2-12). 1918-like 1-3 days (fast: the whole house is down in a week). High-fatality 4-10 days. A person is infectious from 1 day before symptoms to day 7 after.
- **Exposure rolls** (per contact event, `p = base x protection x dose`):
  - **Gate contact** (existing `contagion.contact` 0.25): reinterpret as the *per-hour close-contact* base multiplied by `prev` of the contact's origin. Strangers arriving from a city: `prev_city` about 3x county. A neighbor: `prev` county. A returning supply run: `prev` town.
  - **At home** (existing `spread` 0.06 a day per sick person): kept, with the modifiers below.
  - **Contact types**: shouting at 10 feet across a fence 0.05; handing goods across a fence 0.12; sharing a truck cab 0.8; sharing a house with a sick person 0.3 a day; outdoor conversation 0.02 per hour (outdoors is about 10x safer: commonly cited; Bulfone 2021).
- **Protection multipliers** on the roll (design from COVID mask studies, real fit is bad so the numbers are middling): N95 worn by the exposed 0.25 (0.15 with fit-test knowledge, a skill); surgical mask 0.55; cloth mask 0.75; masks on **both** sides multiply; distance 6 feet 0.5, 10+ feet 0.3; ventilated or outdoors 0.1-0.2; hand washing and surface disinfection 0.95 (it matters little, which is a tooltip the game should tell the player truthfully, and a source of "hygiene theater" over-spending).
- **Quarantine / isolation room.** The existing **medical bay** (`richSinks.medicalBay`) multiplies at-home spread by 0.25, and `epidemic.quarantine` by 0.4 (stacked: 0.1). Add a **quarantine cabin** (a buildable: the rig/trailer, RV or cabin on a joiner home) that holds an arriving person for 14 days (covers about 98% of COVID-like incubations; 7 days covers 1918-like) with a cost: food, water, a caregiver hour or two. A cabin 100 feet or more from the house prevents the at-home roll entirely if caregivers wear N95 and gloves (their own roll is 0.2).
- **Visitors and arrivals are the main vector.** Every `arrival`, `refugees`, and returning scavenger gets `infect_chance = prev_origin x contact_type x protection`. A stranger *looks* healthy 40% of the time even when infectious (presymptomatic): the player sees "no cough" and is wrong sometimes. That is the lesson of the whole scenario.
- **Fomites** are negligible (design), airborne dominates. The game says so in the hint: "Cleaning surfaces helps less than keeping apart."
- **Severity** on the `fever` record: `sev` (existing 45 COVID-like, 75 bioweapon) is then run through `medical.course()`: with a medic skill, oxygen concentrator and pulse oximeter, antibiotics for secondary pneumonia, fluids and fever control the `death` roll drops by up to 70%; without them it doubles.
- **Mortality per ill person** (age band, COVID-like): under 18: 0.01%, 18-39: 0.05%, 40-54: 0.3%, 55-64: 1.2%, 65-74: 4%, 75+: 12%; x2.5 if `medical` track below 0.3 and no home oxygen; x0.5 with a medic and oxygen. 1918-like: W shape (child 1%, 20-35 2.5%, 36-50 1%, 65+ 2.5%), x2 without care. High-fatality: 15-35% any age.
- **Long COVID analog** (the `lasting` condition in `medical.lastingWork`): 5-10% of the ill carry fatigue for 3-9 months (work output x0.7): a cost that makes even a "survived" illness count.

### 5.3 What protects the compound (build and stock list)

1. **The gate-as-window.** A buildable **drop box / trade window** at the outer gate (a hatch, a lazy-susan, a PVC chute): trade without contact (exposure x0.15 instead of x1). Cheap (about $250 of lumber and hardware; poor families build it from pallets with Carpentry).
2. **A decon vestibule** (a mudroom with a wash basin, a hook for outer clothes): the research doc's "decon entrance" lowers household spread by about 0.6 against returning runners.
3. **A medical bay with an isolation room** (existing sink for rich families).
4. **A quarantine cabin** (new, section 5.2).
5. **Stock list:** N95 respirators (about $2 each pre-panic; $6-12 in the peak); surgical masks; nitrile gloves; a thermometer; a **pulse oximeter** ($25-40; the most valuable single item for judging when an ill person needs to go to a hospital); an **oxygen concentrator** ($500-900; needs power, so solar and battery matter); fever control (acetaminophen, ibuprofen); electrolytes (existing `ors`); antibiotics (existing `courses`, for secondary pneumonia); fluids and a vegetable-and-broth pantry.
6. **Self-sufficiency** stock: the compound that does not need to go to town is the compound that is not exposed. This is where the garden, well, wood, livestock and solar the player has already built turn into the "vaccine."
7. **Cohorts.** A rule for large compounds: two households in two buildings, one *sealed* group and one *runner* group, so a runner who gets sick does not take the whole place down. `quarters.ts` already assigns homes.

### 5.4 Variants in one line each

- **covid_like (w3):** long incubation, big presymptomatic window, age-graded, waves driven by variants; vaccine and antivirals in `full` fate (from day 300-400: a gate card "a county vaccination clinic is open in the fairgrounds": go or not).
- **flu_1918 (w2):** short incubation, kills 20-35-year-olds (the **adults who run the compound**), pneumonia, a mild wave 1 that deceives, a deadly wave 2, no vaccine, immunity mostly lifelong. Hardest on well-staffed, young compounds.
- **high_fatality (w1, Hardcore flavor):** CFR 15-35%, slow spread, so *contact avoidance works almost perfectly* and the game is about discipline and boredom, with a rare world-ending turn if it learns to spread (a mutation event day 120-300 that moves `prevPeak` x3).

### 5.5 Immunity

Survivors are `recovered` (COVID-like: immune 90% for about 9 months then partial; 1918-like lifelong 95%; high-fatality lifelong 98%). **Immune adults are the compound's supply runners and caregivers.** A recovered family member can nurse the sick, run to town and shake hands at the gate. This creates the best decision beat: the first person to catch it becomes valuable, and some players will *deliberately expose* a young healthy person in a controlled setting (variolation, as in 1721 Boston; a gate card "expose the healthy son to the known mild case in the cabin?"). Expect 90% of that to go well on COVID-like, badly on 1918-like. It is a real historical move.

## 6. Regional variation

Eleven regions (`src/sim/regions.ts`). The pandemic's odds already vary (`odds.pandemic`: Appalachia 1, Desert 0.8, North Woods 1, Rust Belt 1.1, rest default 1). Proposed per-region adjustments:

| Region | Effect (design) |
|---|---|
| Mountain West | Low density, wave arrives late (+15 days) and `prevPeak` x0.7; the nearest hospital is 60+ miles and closes first; Gunnison-style sequestration is the folk memory; ranch trucks, but ski-town tourists bring it in (arrival x1.2 in winter). |
| Appalachia | High baseline vulnerability (age, chronic disease): mortality x1.3; sparse hospitals; strong kin networks (neighbors help more, so neighbor-aid cards x1.3). |
| Desert Southwest | Reservations and border towns hit hard; hot-season outdoor activity lowers spread (x0.85 in summer); water is already scarce so caregiver water matters. |
| North Woods | Cold winters concentrate people indoors (x1.15 spread in winter); small towns; long drive to hospitals; wood heat is the cost of a sick house. |
| Great Plains | Meatpacking towns (Sioux Falls, Greeley analogs): the `stores` track falls harder (processing plants close, **pork and beef shelf stock drop**); farms are spread out and safe-ish. |
| Pacific Northwest | Dense west-side towns, early first case (wave 1 earlier by 10 days); wet winters keep people inside; cloth-mask culture. |
| Upper Midwest | Mid density; dairy and cheese-plant labor shortages (existing herd and milk trade slows). |
| New England | Old population, dense small towns; nursing-home outbreaks first (neighbor deaths early); strong town-meeting mutual aid. |
| Ozarks | Poor rural health care, long distances; low density helps spread but mortality x1.2. |
| Hill Country | Fast-growing exurbs near Austin: refugees from the city x1.3; hot summers. |
| Rust Belt edge | High density near cities and the existing 1.1 odds: wave arrives earlier and larger (`prevPeak` x1.3), but a hospital is closer and `medical` returns faster. |

## 7. What the player sees and hears (text only)

All through `radio.ts` bulletin hooks, the day card, the CollapseChip and the report card.

- **Radio by phase** (selected by wave and `prev`; the shortwave set hears distant stations, the emergency crank radio hears local):
  - Warning: "WHO says the cluster overseas is now in nine countries." "The county health officer asks all residents to avoid nonessential travel."
  - First week: "Hospital in the county seat on diversion; call before you come." "The governor orders stay-at-home for 14 days."
  - Month 1: "The state reports 412 deaths this week. The morgue in the county seat has asked for refrigerated trucks." "Supermarkets limit milk, eggs and flour."
  - Month 3: "Officials cautiously say the first wave has passed; they urge continued masks." (the calm)
  - Month 6: "Cases are climbing again. Hospital capacity: 3% of ICU beds free."
  - Year 1 `full`: "The first vaccine shipments reach the state fairgrounds." `partial`: "Limited vaccine supply: health workers and over-70s first." `never`: no bulletins for weeks, then a ham operator says the county seat is quiet.
  - **Truth-and-rumor split** existing in `radio.ts`: rumors are wrong 30% of the time ("it's a bioweapon", "it spreads through the water", "vitamin D prevents it").
- **Day cards** (existing `dayCard.ts`): "Expect empty roads and a quiet county. Keep your own sick away from the rest." Add per-day: wave number, county case trend (up/flat/down), a short line about the nearest town ("The IGA is open Tuesday and Friday only.").
- **Report card** fields: days sealed, exposures avoided, ill / recovered / died by age, masks used, runs made, strangers turned away and let in, and a "what would have mattered most" line (e.g. "A pulse oximeter on day 22 would have caught Ruth's drop.").
- **Visuals** (existing `collapseLook`): muted tint, empty roads (traffic profile near 0.1), a boarded storefront, a "CLOSED" sign at the feed store, a plain white van at the neighbor's drive with a stretcher.

## 8. Player decisions and strategies; rich vs. poor

### The decisions

1. **Seal or stay open?** (day 0 gate card; a standing rule thereafter.) Sealed means no arrivals, no town trips, drop-box trade only. Open means trade, help, and risk.
2. **Who goes to town?** Pick the *runner* (an immune person, or the least valuable if forced). A run costs exposure and returns food, medicine, news.
3. **Stance at the gate** for each arrival: turn away, give a jug at 10 feet, put in the quarantine cabin for 14 days, admit. A nurse or a doctor is a joiner worth a quarantine cost; a feverish stranger is a rescue or a mistake.
4. **Treat or leave** a sick family member: oxygen, caregiver hours, antibiotics, or moving them to a hospital that may be on diversion.
5. **Neighbors:** send water to the sick widow (risk and bond) or keep the line.
6. **Open for wave 2 or hold?** The calm after wave 1 is a bait; whoever has the discipline to stay sealed through wave 2 is the story.
7. **Variolation or wait** (section 5.5).
8. **When to open** after `full` fate: go to the vaccine clinic, rejoin neighbors.

### Rich vs. poor

Money buys **speed and capacity**; poverty buys the same result slower and by hand.

| | Rich family ($80-250k on the new game's `money`) | Poor family (a few thousand) |
|---|---|---|
| Before the hit | Buys 500 N95s, 2 oximeters, an oxygen concentrator, a month of bulk supplies at pre-panic prices; builds the medical bay and a quarantine cabin; hires a guard to vet the gate (`guards.ts`, `gateVetting.ts`). | Reads the warning, buys a few boxes of masks and fever medicine, sews cloth masks (Sewing skill), builds the drop box from pallets, converts a shed to a sick room. |
| In the waves | Never needs to go to town (delivery orders until `deliveries` < 0.25). Pays for a nurse joiner. | Has to send a runner more often (exposure) but can often skip it by living on the garden, goats, and canned stock if built before. |
| Exposure outcome | Lowest exposure, highest capacity to treat; but a single guard or visitor still brings it in. | Higher exposure; the **poor path is slower but the immune runner makes it equal** by wave 2. |
| Failure mode | Over-reliance on stock: a rich family that never built the garden runs out by month 8 and has to go outside. | A single death takes a quarter of the household's labor. |

Both can win. The wealthy compound's weakness is that its safety is a purchased state and it never learned the skills; the poor compound's weakness is margin.

## 9. What makes it fun, not just punishing

- **A scenario where the best answer is patience**, and everyone reading the game's other scenarios has been trained to defend with guns. The tension is *quiet*: someone coughs at the gate and you have to decide in 10 seconds.
- **Meaningful ethical beats** (the sick neighbor, the nurse at the gate, the immune son) with no right answer, and with consequences felt through the existing bond and chronicle systems.
- **The wave tracker** gives a legible rhythm: prepare, the wave, the false calm, the wave again. Short time scale (6 weeks) goals: stockpile, seal, ride it out.
- **Joy beats:** the first neighbor to share a pot across the fence; the long-distance "radio family call"; a child's birthday party across a 10-foot gap; the first day the roads fill again.
- **Cozy never loses a family member for good** (existing rule); the ill still suffer, recover, and become the immune runner.
- **No pure punishment:** every harsh effect has a counter the player can buy, build or learn (section 5.3), and the report card tells them which one would have saved them.
- **Replayability:** three variants, three fates, regional modifiers, and a hidden wave schedule make runs differ.

## 10. Suggested numeric parameters and the hook seam

All numbers are design starting points; tune with the `BALANCE` harness (sweep of 200 runs on Standard and Hardcore).

| Parameter | Cozy | Standard | Hardcore |
|---|---|---|---|
| Warning days | 48-96 | 30-60 | 12-24 |
| `prevPeak` multiplier | 0.6 | 1.0 | 1.3 |
| Waves | 2 | 3 | 3 + mutation |
| Contact base (gate) | 0.15 | 0.25 | 0.35 |
| Home spread / day / sick | 0.04 | 0.06 | 0.09 |
| Severity base (`fever.sev`) | 35 | 45 | 55 |
| Mortality multiplier (care-less) | x1.5 | x2.5 | x3.5 |
| Mask price at hit | x3 | x4 | x4 |
| Family death for good | never | by roll | by roll (permadeath) |
| Stimulus event | yes | yes (small) | no |

Mapping to `KindFx` hooks in `docs/DISASTER_TEETH.md` section 5 (WP0 seam; file `src/sim/disasters/pandemic.ts`, plus WP7 `src/sim/blight.ts` untouched):

| Hook | Pandemic implementation |
|---|---|
| `onWarning` | Start per-item mask / thermometer / medicine price ramp; create `fx.outbreak` with the waves rolled from the seed. |
| `onHit` | Fix the variant and fate; day-0 gate card "seal or stay open"; headline; close school and church flags. |
| `daily` | Advance `prev(t)`; step each person through incubation to ill to recovered or dead; roll gate, arrival and run exposures; staffing tracks via `fx.absence`; neighbor outcomes; store hours. |
| `encounterWeights` | arrival x1.4, refugees x1.5, trader by wave (x0.5 peak, x1.0 calm), looters x0.6 for 60 days, cadence x1.5 month 1; new encounter flavor tags. |
| `priceMods` | Mask / PPE / medicine / thermometer / oximeter multipliers; flour, yeast, toilet paper spikes; food by existing stores/deliveries. |
| `buildingDamage` | none (the disaster is not physical). |
| `medical` | Replace the single contagion constant with the exposure model; incubation; recovered state; mortality tables; `lasting` fatigue. |
| `radioBulletins` | Wave-aware bulletins in section 7. |
| `oasisWeights` | Weight `medical`, `law`, `deliveries` and the neighbor death count more heavily so the oasis contrast reads as collapse even with the grid up (`homeSafety.collapseProgress`). |
| `look` | Muted tint, empty road profile, CLOSED signs, white van. |

New state in `disaster.fx`: `outbreak`, `absence` (a 0-1 staffing share), `immune: personId[]`, `exposure log`. No other save field.

## 11. Chaining

Existing: `lawless` 20% after 30-90 days. Proposed:

- **`lawless`** (20% to 35% on `partial`/`never` fate, with law track below 0.4): the collapse of staffing becomes the collapse of order.
- **`financial`** (15%, day 60-180): the economy stalls under months of closure, bank holiday, hyperinflation.
- **`grid_down`** (the `grid` curve above makes this partly built in; on 1918-like and high-fatality add a 25% chance of a multi-day regional outage at wave 2).
- **`crop_blight` / `livestock_plague`** (rare 5%, "the pandemic left fields unplanted and the harvest labor sick"): a reduced harvest from missing farm labor (note: not a pathogen blight; use `climate().grow x0.8` at wave 2 on `partial`/`never`).
- **`zombies`**: does not chain (different biology), but the genre trope "the sick come back" can be a *joke* hint on the high-fatality variant (never fire).
- A later **second wave mode** (DISASTER_TEETH "second wave"): any kind re-hits after a lull, here a new variant.

## 12. Sources

- CDC, "1918 Pandemic (H1N1 virus)", history pages (deaths, attack rate, W-shaped mortality).
- Hatchett RJ, Mecher CE, Lipsitch M. "Public health interventions and epidemic intensity during the 1918 influenza pandemic." PNAS 2007.
- Markel H et al. "Nonpharmaceutical interventions implemented by US cities during the 1918-1919 influenza pandemic." JAMA 2007 (Gunnison and protective sequestration are described in the broader literature).
- Lauer SA et al. "The incubation period of coronavirus disease 2019." Annals of Internal Medicine 2020.
- CDC COVID Data Tracker, deaths and IFR planning scenarios.
- Meltzer MI et al., HHS pandemic influenza workforce absence planning (about 40% peak).
- WHO, cumulative H5N1 human cases (about 50% fatality).
- `docs/research_disasters.md` section 5 and `src/sim/{disaster,effects,medical,encounters,neighborLife,scavenge,mind}.ts` for the existing hooks.
