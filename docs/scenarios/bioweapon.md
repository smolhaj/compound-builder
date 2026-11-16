# Scenario: Engineered bioweapon (`bioweapon`)

Design doc, not code. Status today: kind exists (pulpy, Scenario / Free build only, warning 7-20 days, no chain, one variant "the release"); it shares the pandemic machinery (contagion 0.55 at the gate and 0.12 a day at home, fever severity 75, extra pneumonia chance, neighbor plague x4, refugees x2). Ranked 12 of 16 in `docs/DISASTER_TEETH.md`. Read `docs/scenarios/pandemic.md` first: this doc defines only what is **different**, and reuses its exposure model (section 5.2), protection multipliers, quarantine cabin, drop box, immunity and `fx.outbreak` state.

Evidence tags: **(verified)**, **(commonly cited)**, **(design)**.

The thesis: a pandemic is *nature's accident* and the world cooperates against it. A bioweapon is **an adversary**: it was built to be fast, to seed many cities at once, to defeat the first countermeasures, and someone may still be using it. Where the pandemic asks "can you stay patient", the bioweapon asks "can you trust anything that came from outside" and then "what is left when 10-30% of everyone is gone".

---

## 1. Real-world basis and analogs

| Analog | Figures | Lesson |
|---|---|---|
| **Sverdlovsk anthrax leak, April 1979** | Spores released from a Soviet military facility (a clogged filter, a missing shift report); at least 66 documented deaths (commonly 68-100 in later estimates) among people downwind in a narrow plume, incubation 2-43 days (Meselson et al., Science 1994). The Soviet government blamed contaminated meat for 13 years. (commonly cited) | Accidental release, a **plume with a direction**, a long incubation tail, and an official cover story: the player's news is not the truth. |
| **Biopreparat** | A Soviet program run after the 1972 Biological Weapons Convention; about 50,000 staff at its height; weaponized smallpox, plague, anthrax, tularemia, Marburg; antibiotic-resistant plague strains (Alibek, *Biohazard*, 1999; commonly cited). | A real state program built exactly what this scenario simulates: transmissible, antibiotic-resistant, built to defeat the first line of care. |
| **Smallpox** | Eradicated 1980 (WHO). R0 about 3-6, case fatality about 30%, incubation 7-17 days, infectious from rash onset; about 300 million deaths in the 20th century (commonly cited). US routine vaccination ended 1972; most under-50s have no immunity. | The reference for an engineered transmissible pathogen with high fatality; ring vaccination is the only containment and needs stock. |
| **1984 Rajneeshee salmonella attack** | A cult poisoned salad bars in The Dalles, Oregon; 751 sick, 45 hospitalized, no deaths; the largest bioterror attack in US history until 2001 (CDC; commonly cited). Not detected as an attack for a year. | Food and water vectors; "the outbreak" that may be sabotage. |
| **2001 anthrax letters (Amerithrax)** | 22 infected, 5 dead, mail facilities closed for months, about $1 billion cleanup (commonly cited). | A small act causes a nation-wide panic and a supply-chain shock (mail, cipro runs). |
| **Aum Shinrikyo** | Failed anthrax and botulinum attempts 1990-95; the 1995 sarin attack killed 13 (verified widely). | Making a good weapon is hard; the game's "release" is an **extremely** capable actor (a state program, a lab leak or a sophisticated group). |
| **Gain-of-function and the lab-leak debate** | 1977 re-emerged H1N1 (probably lab); the 2011-12 H5N1 ferret transmissibility studies; the COVID origins controversy. (commonly cited, contested) | Plausible deniability for the game's radio: "it came from a lab", "it was a weapon", "it was natural". Never settle it. |
| **Historical biological warfare** | Caffa 1346 plague corpses catapulted; British smallpox blankets (Fort Pitt 1763, disputed); Unit 731 in Manchuria 1930s-40s killed an estimated 200,000+ in China (commonly cited). | Cultural memory of the practice. |

Calibration. **Population loss is the key dial:** pandemic 0.3-0.7%; high-fatality pandemic up to about 5%; **bioweapon 5-30% by month 6 depending on variant**, and the effect on services is staffing collapse plus *fear of the stranger*.

## 2. Warning signs and how the player notices

Warning 7-20 days at Standard (Cozy 11-32, Hardcore 3-8). Short, because a weapon is fast, and because the first indicator is **simultaneous** outbreaks.

| Stage | Days before hit | News | Player can notice / do |
|---|---|---|---|
| Early (T-20 to T-12) | "An unexplained illness in three cities at once." "Officials will not say where it started." Satellite imagery rumors; a diplomatic crisis. | Radio says "three cities at once". The player who has read the warning stage of the pandemic doc does not make the same mistake: **simultaneity is the tell** ("not spread by travel, seeded"). Buy now: respirators, filters, bleach, antibiotics, oxygen, food. |
| Middle (T-12 to T-5) | "Hospitals in the city overwhelmed in days." "CDC tells everyone to stay home." Airports shut. Shortwave stations are the first to carry details. | Ham or shortwave hears more (and rumors: "it is airborne", "it is waterborne", "the antibiotic is useless"). Price spike on antibiotics and respirators is **sharper than pandemic**: x6 at the hit. |
| Late (T-5 to T-1) | "Bodies in the streets in the city footage." "Roadblocks on the highway into the county." National Guard on the interstate. | The sheriff sets a checkpoint on the county road. Neighbors start sealing. The player has 1-5 days to decide whether to **close the gate for good**. |

Notice-ability rule: with a shortwave or ham set the warning is *a day or two earlier and more accurate*; without one the player gets only county-level rumor (the existing `radio.ts` truth/rumor split). This is a real reward for the radio hobby.

## 3. Timeline (Standard; variant `engineered_flu`, see section 5)

| Phase | The world | The compound |
|---|---|---|
| **Hit moment** | An emergency broadcast: "A biological agent has been released in multiple cities. Shelter in place. Do not approach anyone showing symptoms." Within the hour the highway is clogged, then empty. | Headline "It's here. Anyone from outside could be carrying it." (existing hit text). **Gate becomes a decision**: close it, vet it, or keep trading. |
| **First hour** | Cell networks jam. Strangers on the road from the city, some already ill. | Phone down for hours; the radio is the only news. First **arrival** is probably a relative. |
| **Day 1** | City hospitals failing; the county road is a line of cars; CDC and National Guard messages contradict. Infection began 3-7 days earlier, so the *dead start to appear on day 3-6*. | Compound is exposed only by contact; if sealed it is currently safe. |
| **Week 1** | Rural clinic closes: staff sick. The Guard sets roadblocks. Rumors: "it's in the water", "cipro works". Wave of **refugees** (x2 existing) from the city and the first looters from the dying town. | Arrivals are the dominant vector (see 5.3). First neighbors die (x4 existing plague mortality). The trucks stop: `deliveries` to 0 by day 5. |
| **Month 1** | The peak: 5-15% of the population dead, a further 20-40% ill. Municipal services are on skeleton crews. Power flickers (staffing). Roads have **abandoned cars and the unburied**. Rural areas hit 7-21 days later than cities (density gradient). | Sealed compounds hold if they had food; unsealed ones lose people. Neighbors who fled to the "safe" compound next door bring it. |
| **Month 3** | Burnout. In `full` fate the curve is falling and quarantine zones are drawn on radio maps; in `partial` it stays endemic with flare-ups; in `never` it keeps coming in waves of declining size. Survivors cluster; militias form on the highways (the lawless seed). | Many gate decisions behind; **grief and resource questions**: take in the orphans (existing `orphans.ts`), the one doctor who survived. |
| **Month 6** | The world is thin: 10-30% fewer people, services partly back (`partial`) or not (`never`). Immune survivors form the new labor pool. | The compound is now unusually safe from raids (fewer raiders) and unusually alone. Trading with the 3 neighbors left. |
| **Year 1** | A new order: some towns closed and empty, some fortified and prospering. **Salvage** of whole empty towns becomes the dominant economy: shelves intact in the Walmart that nobody came back to. | Expansion opportunities: abandoned farms (land is free in `sim/land.ts`), orphans, skilled joiners. |
| **Year 2+** | Population recovering slowly; no seasonal return if immunity holds; if the agent was contagion-limited (single-pass) the world is simply quiet. | Rebuild or stagnate. Chain to `lawless` (50% chance at `never`) or `crop_blight` from lost farm labor. |

## 4. Effects by system

### 4.1 Service tracks (replace the existing single variant; weights 3 / 2 / 1)

Existing `release` curve (`medical` C(0,5,0), `stores` C(1,5,0.05), `deliveries` C(1,5,0), `law` C(7,20,0.05), `grid` C(20,60,0.2), `fuel` C(5,20,0.05), `banks` C(5,15,0), `phone` C(30,90,0.2), all `back: null`) is **the engineered_flu** default (permanent). Add variants that make the scenario replayable:

| Variant | Weight | Pathogen | Effect |
|---|---|---|---|
| `engineered_flu` | 3 | High transmissibility (R0 5), 1-3 day incubation, CFR 12%, pneumonia with secondary bacterial infection; seeded in 6-12 cities at once | existing curves; deaths 8-15% of the county by month 3 |
| `hemorrhagic` | 2 | Contact and fluids (Ebola-like or Marburg-like): R0 2, incubation 4-10 days, CFR 50%, **needs contact with fluids, so masks and distance work almost perfectly** (a skill game) | `medical` C(0,10,0), `deliveries` C(3,20,0.1) (slower, more caution), `law` C(10,40,0.15); deaths 3-8% of the county |
| `smallpox_like` | 1 | R0 4, CFR 30%, incubation 7-17 days, **vaccine and old survivors immune**: those born before 1972 have partial immunity (a real-world twist) | all tracks fall slower (`fall` x1.5) but never recover (`back: null`); pre-1972 characters in the family have a 50% resistance flag |

Also (rare, 10% of runs) an **`ongoing`** modifier: *the agent is still being used*: a new city hit every 2-3 weeks for 90 days (the world keeps getting worse in waves), and some fraction of arrivals are *carriers deliberately sent*.

### 4.2 Money, prices, shops

- Banks closed within days (`banks` C(5,15,0)). Market crash 40% exists (`CRASH.bioweapon`). **Cash stops working** by day 14 in practice (`moneyWorks` requires stores and banks above 50%). Barter takes over quickly; the barter market in `sim/barter.ts` needs a **medicine premium** (antibiotics x6, respirators x10, fever medicine x4).
- Stores close for good within a week: the clerk is dead or gone. Scavenging (`scavenge.ts` places: pharmacy, school, interstate) carries `riskOf.sickness` up to 0.9 and the abandoned town's **bodies** are a real hazard (a fresh pharmacy with unburied dead: contact roll on entry, lower for a fast in-and-out).
- **Black market** (`blackMarket.ts`): the first thing sold is *someone's* stolen respirator.

### 4.3 Neighbors

Neighbor mortality is x4 (existing); with the hemorrhagic variant, **caregivers die at x2** (family dies together). 10-30% of neighbor households are lost by month 3 (design). Some **flee** (status `gone`): their house is now salvage. **Dispositions** turn fearful: refusal at the fence is normal; hospitality is a risk. Neighbor-aid cards (the widow's water) cost a real exposure roll (contact 0.55 x protection).

### 4.4 Raiders and the encounter mix

- Weights: `arrival` x1.4, `refugees` x1.5, `trader` x0.5 (existing). Add: **looters from the dying town** appear from day 4 and stay low-strength (they are sick: crew `wound` x0.7 and `morale` low; a *sick crew* at the gate is an exposure and a mercy question); **militia / roadblock** encounters from day 10 (they are armed and enforce quarantine, requisition medical supplies: reuse `requisition`, `patrol`, `countyCrossings`).
- **Quarantine enforcement** and "the Guard" can *help* (`gate.government` help) or *hinder* (requisition of the compound's antibiotics and respirators).
- **Weaponized arrivals** (rare in `ongoing`): a crew that tries to enter in order to infect, or a "sick man at the gate" who is the vector. This is the bioweapon's own antagonist. Text: "A man staggers up the drive, soaked in sweat, and falls at your fence with a note in his hand."
- Raiders thin out: the population fell. Cadence x1.5 for the first 60 days, then slowly returns; siege waves (`waves.ts`) climb 40% slower for the first year.

### 4.5 Health, food and water

- Fever severity 75 (existing). Pneumonia chance +5 points for small children (existing line `0.028 + 0.05`).
- The **medical track goes to zero**: no doctor, no hospital, no ambulance. The compound's medic skill and kit decide survival.
- **Food:** the harvest and the pantry are fine; deliveries do not come back; every compound is a one-year-stock exercise. **Water:** municipal supplies fail on day 10-30 as treatment plant staff die (`grid` C(20,60,0.2)), so wells, tanks and creek filters matter (existing `thirst.ts`).
- **Contamination of the dead.** Unburied bodies on the county road and in the town cause dysentery and rats; burying the dead is a labor task and a morale cost (existing aftermath burial scenes can be reused).

## 5. Disease and exposure mechanics

The pandemic model (section 5.2 there) applies with these overrides, plus the **seeding** and **adversary** twists.

### 5.1 Differences from the pandemic model

| Parameter | Pandemic (Standard) | Bioweapon |
|---|---|---|
| Gate contact base | 0.25 | 0.55 (existing) |
| Home spread / day / sick | 0.06 | 0.12 (existing) |
| Fever `sev` | 45 | 75 (existing) |
| Incubation | 5 days | 1-3 (flu), 4-10 (hemorrhagic), 7-17 (smallpox-like) |
| Presymptomatic infectious window | 1-2 days | 2-3 days for `engineered_flu` (designed to spread before detection) |
| Waves | 3, smoothed | One huge wave + (ongoing) re-seedings; no mild first wave |
| Mortality per ill | 0.01-12% by age | 12% (flu), 50% (hem.), 30% (smallpox-like), x2 without care, x0.6 with a medic and O2 |
| Immunity | recovered immune | partial: the **engineered** pathogen may *evade* immunity: 30% of survivors can catch a later mutated strain (month 4+ event) |
| Vaccine | `full` fate day 300+ | `full` fate day 450+; `smallpox_like` has stock from the old US reserve (100M doses) via a government cache event |

### 5.2 The plume (accidental release variant)

A rare **local release** variant (`plume`, 5%): a facility within 30-80 miles releases an agent downwind. The player sees a **wind direction** and a yellow wedge on the map overlay (reuse the radiation PF-readout style); the compound is inside or outside the plume. Sheltering-in-place with sealed doors and a filtered airlock works; leaving the plume by driving **perpendicular to the wind** is the best response. Reuses `nuclear.falloutDay` / `doseBetween` as a template (design, not an agent-based sim), with incubation delaying the effect for days. A good, short, tactical scenario.

### 5.3 What protects the compound

Everything in the pandemic doc (drop box, decon vestibule, quarantine cabin, medical bay, N95 and gloves, oximeter and concentrator, fluids, antibiotics) **plus**:

- **Gate vetting** (`gateVetting.ts`): a vetted-arrival policy. Add a **thermometer check at 25 feet** and a **medic's visual screening**: a medic skill 5+ catches 60% of symptomatic arrivals; presymptomatic carriers still pass, so a **quarantine cabin with 7 to 14 days** is the only real filter.
- **Respirators with filters** (P100 half-masks, $25-40 each, filters $10) and **tyvek and goggles** for the caregiver: the real protection against a high-dose engineered aerosol. N95 multiplier 0.25 holds only against low dose; a hemorrhagic patient in a closed room is a **high dose** and N95 is 0.5.
- **Pressure and filtered air**: a sealed bunker with HEPA / filtered intake (reuse the bunker air system and the fallout filter from `radiation.ts`) gives an **air-gap room** that works for the airborne variants. The bunker sheltering is therefore *useful* here, not just for raiders.
- **Water and food hygiene** for the waterborne rumor: boiling and filters (existing).
- **Disposal protocol** for the dead: burn pyre, no burial near the well (a well-poisoning hazard; existing `water.ts` contamination hook).

### 5.4 Visitors and arrivals are the vector, and the weapon

Every arrival, runner and returning scavenger rolls exposure with `prev_origin` high: a city arrival has `prev` about 20% in the first month. **Joiners** carry stock and skills that the compound needs more than ever: a surviving nurse is worth a 14-day cabin quarantine; the game should make the choice painful and the cabin full.

## 6. Regional variation

(Bioweapon odds are not in `regions.ts`; scenario-only. Proposed modifiers.)

| Region | Effect |
|---|---|
| Mountain West | Density and distance protect: wave arrives +21 days; roadblocks on the passes; the *best* odds for a sealed compound. Ski towns and tourist cabins make *arrivals* x1.3 in winter. |
| Appalachia | Hollows isolate; poor health infrastructure; strong kin: neighbor-aid x1.3, mortality x1.2. |
| Desert Southwest | Border towns and Phoenix / Albuquerque corridors hit early; heat reduces survival of aerosols (x0.85 spread in summer); water is the real hazard. |
| North Woods | Isolation excellent, but winter indoors raises home spread; few roads means few arrivals (x0.6). |
| Great Plains | Sparse; interstates carry arrivals; grain elevators and processors close; farm trucks keep going (`deliveries` for farm goods only). |
| Pacific Northwest | Early seeding (Seattle, Portland); dense; wet climate preserves some agents (x1.1 on aerosol in damp months); salvage potential high after. |
| Upper Midwest | Metros (Chicago, Detroit, Milwaukee) send refugees x1.5; lakes and farms feed. |
| New England | Densest region; arrivals x1.4; old stone houses with cellars make the best quarantine rooms. |
| Ozarks | Low density, **hills hide**, moderate refugees from Kansas City, St. Louis. |
| Hill Country | Austin / San Antonio / Dallas exodus: refugees x1.5; hot summers. |
| Rust Belt edge | Closest to the big seeded cities: wave arrives earliest, refugees x1.6; **abandoned industrial salvage** is large afterward. |

## 7. What the player sees and hears (text only)

- **Radio.** Pre-hit: simultaneity ("three cities at once"), denial ("a natural outbreak", "no evidence of a weapon"), and then confirmation. Post-hit: Emergency Alert System, CDC instructions, then **bulletins that get shorter and then stop**. Ham operators narrate: "Denver has stopped answering." A **numbers-station-like** automated message in `ongoing` runs ("Shelter in place. Await instructions.") that never changes.
- **Day cards.** Short, with exact counts: "Day 9. Neighbors lost: 2. The county road has 14 cars parked where they died." Headlines like "The Guard has withdrawn from the county seat."
- **Report card**: the death toll in the county vs. the compound, days sealed, strangers admitted and what they brought, burial count, "the decision that mattered most".
- **Visuals** (`collapseLook`): sickly green-gray light, **empty cars on the road with the doors open**, smoke from pyres at the county seat, a red-lit sky at night from a distant burning town, *a plain quiet*. No gore on screen: text and aftermath scenes only.
- **Dialogue:** fear in neighbor voices at the fence; a child at the window.

## 8. Player decisions and strategies; rich vs. poor

### Decisions

1. **Close the gate for good** on day -3, or take in relatives (and which ones).
2. **Who is quarantined, for how long**, and who nurses (the nurse is exposed).
3. **Bunker or house**: does the family live below and filter the air, at the cost of garden labor?
4. **Burn or bury** the dead; **salvage or stay** in month 3.
5. **Take in the doctor**: the story's best joiner and the best vector.
6. **Trust the radio** or not; who is the "official", the truth?
7. **Government posture** (`gate.government`): welcome the Guard's help (quarantine, food) or hide your stock.
8. **Immunity gamble** (variolation) as in pandemic doc; for smallpox-like the player might have a **pre-1972 elder** whose immunity is the compound's secret weapon.
9. **After the peak**: expand to abandoned farms, or hold.

### Rich vs. poor

| | Rich | Poor |
|---|---|---|
| Before | P100 respirators for each family member, spare filters, tyvek, an oxygen concentrator, antibiotics stock (courses), a filtered bunker, a guard and a full vetting gate, a year of freeze-dried food, a drop box. | N95s and cloth, a drop box from pallets, a sealed shed for the sick, a root cellar and a garden that is already feeding them. |
| During | Can close the gate and never open it; the guard is the vulnerability (an unvetted guard is both an exposure and an insider). | Cannot afford a guard; closes the gate with a chain and a dog; hunger is the clock, not the pathogen. |
| After | Has the *stuff* but may lack the skills and neighbors; becomes the target of the first big raiders (money still buys a fortress reputation). | Has skills and knows the neighbors; salvage is the way up. |

Money buys speed and capacity (filters, bunker, guards), poor buys time and local trust.

## 9. What makes it fun, not just punishing

- **A scenario of dread, not combat.** The thrill is *uncertainty*: is the nurse at the gate infected?
- **A knowledge game**: reading the radio, building a screening protocol, reading the exposure tooltip honestly.
- **Quiet salvage** in year 1, entering a silent town (stores intact, a dog loose, a house with a note), is a beautiful, melancholy beat and a joyful payoff after the dread.
- **Distinct variants** play differently: the hemorrhagic one rewards technique, the engineered flu rewards isolation, the smallpox-like rewards the old and the vaccine cache.
- **The adversary beat** (`ongoing`): the sick man with the note is a story the player tells.
- **Hope track:** a rumor of a vaccine cache or a settlement, and in `full` fate the world *does* come back: the first bus in months is a payoff.
- Cozy: nobody dies for good; the sick **suffer and recover** and the world is gentler (warning x1.6, `prev` x0.6, CFR x0.5).

## 10. Suggested numeric parameters and the hook seam

| Parameter | Cozy | Standard | Hardcore |
|---|---|---|---|
| Warning days | 11-32 | 7-20 | 3-8 |
| County death by month 3 (engineered_flu) | 3% | 9% | 15% |
| Gate contact | 0.35 | 0.55 | 0.7 |
| Home spread | 0.08 | 0.12 | 0.16 |
| `fever.sev` | 55 | 75 | 85 |
| Carrier arrivals in `ongoing` | 0 | 8% of arrivals | 15% |
| Antibiotic / respirator price at hit | x4 | x6 | x6 |
| Neighbor household loss by month 6 | 10% | 20% | 30% |
| Evasion (reinfection) event | no | 20% | 35% |

KindFx mapping (`src/sim/disasters/bioweapon.ts`, sharing helpers with `pandemic.ts` through a new pure `src/sim/outbreak.ts`):

| Hook | Bioweapon |
|---|---|
| `onWarning` | Roll variant and `ongoing`; simultaneity hint; start respirator and antibiotic price ramp. |
| `onHit` | Gate decision card; seed `fx.outbreak` with a single big wave; plume variant sets wind and wedge. |
| `daily` | Step person states (shared with pandemic); body count on the county road; water contamination from unburied dead; `ongoing` re-seed events; reinfection event month 4. |
| `encounterWeights` | existing arrival x1.4, refugees x1.5, trader x0.5; add sick-crew looters, quarantine militia, deliberate carrier, new `requisition` of medicine. |
| `priceMods` | Medicine and respirator premium (x6, x10 barter). |
| `buildingDamage` | None (optionally: a quarantined building must be burned if it holds the dead: a player choice). |
| `medical` | Exposure model shared with pandemic; per-variant mortality; hemorrhagic caregiver rule. |
| `radioBulletins` | Phase list in section 7, with a false-reassurance slot and the numbers-station loop. |
| `oasisWeights` | Weight `medical`, `law` and neighbor death count. |
| `look` | Gray-green tint, open-door cars, pyre smoke. |

## 11. Chaining

- **`lawless`** (existing doc suggests 0; propose 50% at `never` and 30% at `partial`, 20-60 days after): when the Guard withdraws.
- **`crop_blight`** (rare 8%): lost harvest labor; a 20-30% yield shortfall in year 1 for compounds that lean on trade.
- **`grid_down`** (the `grid` curve already staffing-fails; add a 30% chance of an 7-30 day outage at month 2).
- **`financial`** (the bank closure is already in the tracks; add hyperinflation or a debt jubilee at 15% probability).
- **`zombies`**: not chained; a `false rumor` might call the sick "the walking dead" for flavor. Never actually fire.
- **`nuclear` or `civil_war`** (rare, ongoing variant): the scenario can be the **trigger** of a war with the blamed party (10%).

## 12. Sources

- Meselson M et al., "The Sverdlovsk anthrax outbreak of 1979," *Science* 266, 1994.
- Alibek K, *Biohazard* (1999); Leitenberg and Zilinskas, *The Soviet Biological Weapons Program* (2012).
- WHO, smallpox eradication certification (1980); Henderson DA, *Smallpox: The Death of a Disease* (2009).
- Torok TJ et al., "A large community outbreak of salmonellosis caused by intentional contamination of restaurant salad bars," JAMA 1997.
- FBI, Amerithrax Investigative Summary (2010).
- Pandemic doc in this folder, and `src/sim/{disaster,effects,medical,encounters,neighborLife,scavenge,gateVetting,bunkerLife,radiation}.ts`.
