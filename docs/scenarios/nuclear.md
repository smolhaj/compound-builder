# Scenario: Nuclear war, limited and full exchange (`nuclear`)

The reference scenario: the only kind with dedicated sim modules (`nuclear.ts`, `radiation.ts`, `hardening.ts`). This doc maps what exists (distant strikes, nearby base, full exchange), adds a **limited exchange** variant (a regional war, a few dozen warheads, no global winter), and lists what to deepen. The high-altitude EMP case that is a weapon without a war is `emp.md`.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Source | Figures | Lesson |
|---|---|---|
| The **7-10 rule** | For every 7-fold increase in time after the burst, the dose rate falls 10-fold: H+7 h = 1/10 of the H+1 h rate, H+49 h about 1/100, H+2 weeks about 1/1000 (v, Kearny; Science News). It is the law `rate = R1 * t^-1.2` (7^1.2 = 10.3). The sim already uses `t^-1.2`. | Time is the shelter: the first two days decide, and by two weeks outside work is cheap. |
| Protection factors | One-storey wooden house about 2, a large building's basement about 200 (v, Science News); expedient trench with about 3 ft earth about 200 to 1,000 (c, Kearny); a dedicated bunker 1,000+. Halving thicknesses: about 3.6 in of packed earth, about 2.4 in of concrete (c). | Mass of earth overhead is the whole game. |
| Cold War civil defense | 1950s Federal Civil Defense Administration "Duck and Cover"; Kennedy's 1961 shelter program; the National Fallout Shelter Survey marked about 200,000 buildings and space for well over 100 million people by the mid-1960s (c); yellow-and-black fallout shelter signs; standard shelter stocks: about 10,000 calories and 3.5 quarts water per person for 2 weeks (c); CONELRAD (640 and 1240 kHz) then the Emergency Broadcast System; the 1970s to 80s FEMA Crisis Relocation Planning moved city dwellers to host counties; UK "Protect and Survive" (1980). | The "two-week plan" is historical: stay in for about 14 days, short trips after. |
| Kearny, *Nuclear War Survival Skills* (ORNL 1979) | Kearny air pump (KAP), the fallout meter built from foil and a jar (KFM), expedient shelters; ventilation and heat are the shelter's real killers. | Air and heat, not radiation, kill in a crowded shelter. |
| Dose effects | 0 to 50 rem no visible effect; 50 to 100 mild nausea risk; 100 to 200 sickness, recoverable; 200 to 450 severe, LD50/60 about 350 to 450 without care; above 600 fatal (c). | The existing `radiation.ts` uses Sv and these bands. |
| Iodine-131 and KI | I-131 half-life 8 days; potassium iodide blocks thyroid uptake if taken within hours; Chernobyl thyroid cancers among children from contaminated milk (c). Cs-137 half-life about 30 years. | KI is cheap and time-critical; milk is the pathway. |
| Nuclear winter | Xia et al., *Nature Food* 2022: a full US-Russia exchange (about 150 Tg soot) drops global calorie production by about 90% by years 3 to 4 and could kill over 5 billion; a limited India-Pakistan war (5 to 47 Tg) cuts calories 7 to 50% (v, in `research_disasters.md`; c on the Pakistan range). | Full exchange = famine; limited = a hard year. |
| Scale | Hiroshima about 15 kt; a modern strategic warhead 100 to 800 kt; US ICBM fields at Malmstrom (MT), F.E. Warren (WY, CO, NE) and Minot (ND) (c); strategic bomber bases such as Whiteman (MO, near the Ozarks) and Offutt (NE), the Pacific submarine base at Bangor (WA). | Mountain West and Plains are *targets*; the downwind is east. |

Surface bursts on missile silos make the heaviest local fallout. Prevailing westerlies carry plumes **east**: from Montana and Wyoming across the Dakotas, Nebraska, Minnesota, Iowa and the Upper Midwest; from Missouri across the Ozarks and toward Appalachia (c).

## 2. Warning signs and how to notice them

Warning 14 to 60 days (`warn: [14, 60]`). Variants: the crisis is public.

- Talks collapse; ambassadors recalled; embassies evacuate staff families; DEFCON rumors.
- Military traffic: bombers, tankers, convoys on the county road; the base is on lockdown; jets overhead at all hours (hint lines already present).
- Potassium iodide and survival goods sell out; gas lines; gold and bank-run signs.
- Emergency Alert System tests; a bad false alert (Hawaii, Jan 13, 2018: a false ballistic missile alert lasted 38 minutes (v)).
- Neighbors leave: "the Hendersons went to her sister's in Idaho" (neighbors thin out, a text count).
- **Last-minute alert** (hit moment): "BALLISTIC MISSILE THREAT INBOUND" gives minutes (a missile from the Pacific takes about 30 minutes; a submarine-launched weapon 10 to 15 (c)); the player must choose a shelter at once. The existing "dash home" for people in town applies.

Player actions in the warning: build or harden the shelter (PF), stock water (the sim's `hardening` upgrades fallout, faraday, nbc and blast), buy KI and a dosimeter, plan who gets in, move livestock into an earth-sheltered barn.

## 3. Phase-by-phase timeline

| Phase | World | Compound |
|---|---|---|
| **Hit** | Strikes on missile fields, bases and a few cities; a flash on the horizon; EMP fries electronics (existing `strike`). Blast damages only if near (the `nearby` variant). | The dash: family members in town race home; the player picks a shelter; the existing flash and mushroom cloud sky. Electronics: inverters, pump controller, generator electronics, vehicles roll (`empVehicles`); Faraday room saves spares. |
| **First hour** | Fallout starts to arrive 1 to 6 h later (`ARRIVE_H` distant 6, nearby 1, exchange 3). | Get in and stay in. Close vents. Take KI now (before the I-131 arrives). |
| **Day 1** | Dose rate at H+1 is 2 to 4 Sv/h in the open (existing `R1`); H+7 about 1/10, H+24 about 1/40. Outside: lethal; inside a PF 40 shelter: a rem or two. Phone and radio dead; EAS repeats on battery radio. | Shelter-in-place; the sim blocks outdoor work for 3 days. Ventilation heat: a crowded shelter in summer at 24 to 48 h. |
| **Week 1** | H+48 about 1/100. Neighbors beg to come in: the iconic dilemma. Radio reports plume maps. Refugees on foot; the first radiation sickness. | The dash for water in the shelter window; chores at reduced budget; livestock exposed outdoors take full dose. |
| **Month 1** | Day 14: about 1/1,000 of H+1; outdoor work is cheap (the existing `SHELTER_DAYS = 14`). Contaminated food and water for about 60 days (`CONTAMINATED_DAYS`). I-131 in milk through week 6. Martial law attempts; refugees. | The first trip out; decontamination at the vestibule; covered stores are clean; open ponds are not. |
| **Month 3** | A thinned neighborhood; raiders who survived. Supply chains broken (the EMP and the strikes). | Winter risk: an exchange variant halves the next harvest (existing). |
| **Month 6** | Cs-137 and Sr-90 in soil and wildfood stay "hot": the existing `wildfood hot 150 d`. A full exchange: sky dim, summer frost begins. | Garden choices: covered stores, deep-rooted crops, imported seed. |
| **Year 1** | Limited: partial recovery under a federal or military authority. Exchange: growing season short, famine. | |
| **Year 2+** | Limited: slow reconstruction. Exchange: the nuclear winter, global calories down by about 50 to 90% in years 2 to 4 (c) (the existing winter). | Hunters, fishers, greenhouses, root cellars, and stored seed. |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks (existing): at the hit all eight fall quickly and **do not recover** for `nearby` and `exchange` (`back: null`); `distant` recovers in 180 to 730 days with fate odds `[0.12, 0.43, 0.45]`. Prices: market crash 50% (existing) before the shelves empty; fuel and food scarcity are immediate; cash is dead as the banks are dead. Shops: closed; barter only: salt, KI, dosimeters, water filters, ammo, antibiotics. Neighbors: the dash; shelter-sharing request; refugees with radiation sickness at D+3 to 14; martial-law checkpoints at M+1 (see WP3). Raiders: **no visits for 14 days** (existing), then returnees; survivors turned raiders at M+3. Health: dose per person per day (existing), sickness, KI, cancer risk on the report card; antibiotics depleted; immune suppression. Food and water: uncovered stores contaminated about 60 days; deep covered wells safe; ponds and open cisterns contaminated; leafy greens and milk worst for I-131; the garden is dosed.

## 5. What fails, what protects, the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| Outdoor exposure | Lethal in the first 48 hours | Shelter with PF 40 to 1,000 (`protectionOf`), earth cover 3 ft, vestibule decon |
| Inverters, controllers, radios, vehicles | Fry (EMP) | Faraday room (`faradayShare`), old vehicles (`emp` flag) |
| Livestock outside | Dosed | Earth-sheltered barn, feed stored inside |
| Uncovered water and food | Contaminated | Covered cistern, deep well, root cellar, canned goods |
| Thyroid | I-131 uptake | KI within hours |
| Air and heat in the shelter | Killer in summer | NBC filter and blower (`nbc` hardening), a Kearny pump, forced ventilation |
| Dose knowledge | Unknown without a meter | Dosimeter or KFM |

**Wealth principle.** Money buys protection factor in advance: a buried bunker (PF 1,000 against 2 for a wood house), an NBC blower, a Faraday room, a sealed cistern, 14+ days of food and water inside. The rich compound sits through the first fortnight without a rem and walks out into a thinned world with its plant intact. The poor compound digs a trench with 3 ft of earth (PF 200 to 1,000, Kearny) with a shovel and a team: it works but takes days of labor and offers no comfort; a house basement (PF 10) means a few weeks of sickness. Nothing the rich buy after the flash matters.

## 6. Regional variation

| Region | Effect |
|---|---|
| Mountain West (existing odds x1.3) | At the missile fields (Malmstrom, Warren): worst *near* variant; blast and thermal range; but upwind of most fallout; wind blows east. |
| Great Plains | Between the fields and downwind; heavy fallout from Warren and Minot; flat open ground, low shelters; PF matters. |
| Upper Midwest, North Woods | Downwind of Minot and Montana; long winters; contaminated lakes; mid fallout. |
| Rust Belt edge | Far downwind but near cities (Pittsburgh, Cleveland) and refugees; hit by city targets. |
| Ozarks | Downwind from Whiteman AFB; the Ozark karst makes groundwater vulnerable. |
| Pacific Northwest | Submarine base at Bangor and Seattle; fallout stays west of the Cascades (rain-out); wildfire after. |
| Appalachia, New England | Far downwind, light dose; refugees from the east coast; Appalachian hollows block wind. |
| Desert Southwest | Few targets; strong sun; fallout light; water problem. |
| Hill Country | Texas has Air Force bases and Fort Hood; ERCOT; downwind of nothing major; a variable. |

Existing hooks: use a `plumeDir` roll by region (d) with a magnitude `R1 x regionFactor`: Plains 1.2, Upper Midwest 1.0, North Woods 0.8, Rust Belt 0.8, Ozarks 0.8, Mountain West 1.5 (near) or 0.4 (upwind), PNW 0.5, Appalachia 0.4, New England 0.3, Desert 0.3, Hill Country 0.4.

## 7. What the player sees and hears

Hit: "EMERGENCY ALERT: BALLISTIC MISSILE THREAT INBOUND. SEEK IMMEDIATE SHELTER. THIS IS NOT A DRILL." A white-then-orange horizon (the existing flash and cloud). Dose HUD and shelter view (existing). Radio (battery or Faraday-stored): "Stay in your shelter for at least 24 hours" (Ready.gov), "Plume forecast: heavy fallout expected in the next 6 hours in the counties east of the base." Day 3: "Radiation levels in the county seat are 0.4 R/h." Week 2: "Federal authorities say outdoor work is safe for 2 hours a day in the following counties." Month 3: "The Army has set up ration stations in four towns." Comms: phone dead; EAS on battery radios the first days; ham nets with plume reports; most stations dark.

## 8. Player decisions and strategies

Which shelter (bunker, root cellar, basement, trench), how to stock it; whether to pre-build with money or sweat; who gets in (stores vs goodwill vs labor later); when to go out; KI timing; livestock plan; decontamination; what to grow; whether to stay or leave; how to share information.

## 9. What makes it fun and not just punishing

The shelter is the game's core build: the PF overlay makes every shovel of dirt a visible choice. The countdown is *clean*: a 14-day clock the player can plan, with a satisfying emergence on day 15. The moral dilemma ("who do you let in?") produces stories. A limited exchange gives a milder, winnable arc (rebuild with neighbors); a full exchange is the hard mode. Report cards show dose and cancer risk honestly. Punishment is front-loaded and avoidable.

## 10. Suggested parameters and the hook seam

Existing variants (do not change): `distant` (weight 5), `nearby` (2), `exchange` (1). Add:

| Variant | weight | R1 (Sv/h at H+1) | Arrive (h) | grid / fuel / stores | back | winter |
|---|---|---|---|---|---|---|
| limited (new; a regional war, a few dozen warheads) | 3 | 1.0 | 8 | grid C(0,0,.1,[120,540],60), fuel C(0,0,.1,[140,560]), stores C(0,3,.1,[150,560]) | partial | none (a cool, hazy summer, grow x0.85) |
| accident_strike (new; one warhead, terrorist) | 1 | 0.8 near, 0 far | 1 | local only | [60,365] | none |

Fate odds existing `[0.12, 0.43, 0.45]`; limited `[0.30, 0.45, 0.25]` (d).

Hook seam: existing `FX.nuclear.onHit` moves the existing `strike` behind the hook byte-for-byte. Add:
- `onWarning`: KI and meter prices, neighbors leaving, shelter checklist.
- `daily`: dose accrual by `doseBetween`, `wildfood` hot window, contamination expiry, I-131 milk window, per-person sickness stage.
- `encounterWeights`: no visits first 14 days; refugees with sickness at D+3 to 14.
- `medical`: dose bands and cancer risk; antibiotic scarcity.
- `radioBulletins`: plume forecast, hot lines, ration stations.
- `oasisWeights`: unchanged (all tracks).
- `look`: existing flash and sickly haze.

## 11. Chaining possibilities

- `lawless` 60% after 10 to 30 days (existing).
- `financial` (the market crash is built in).
- `pandemic` (cholera and typhus in camps).
- `emp.md`'s EMP is the opening move of `exchange` (same machinery).
- `satellite_loss` (the war kills satellites): 50% in `exchange`.
- `civil_war` and `invasion` (pulpy) can follow.
- `reactor_meltdown`: a strike on or near a plant adds a long plume (see `reactor_meltdown.md`).
