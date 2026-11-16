# Scenario: Satellite, GPS and comms loss (`satellite_loss`)

New scenario (item 7 in `DISASTER_TEETH.md` section 4). Nothing visibly breaks: the lights stay on. Orbital infrastructure goes (a Kessler-type debris cascade, an anti-satellite war, a radiation belt, or a severe space-weather loss), and with it GPS timing and navigation, satellite TV and data, weather forecasts, card networks, truck and ship logistics, aircraft, farm auto-steer and many cell backhauls. The grid follows slowly through timing and communications failures. It is a **quiet, slow collapse of coordination**.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Event | Figures | Lesson |
|---|---|---|
| Galaxy IV failure, May 1998 | One communications satellite lost attitude control; about 80% of US pagers went dark; some gas stations could not take credit cards at the pump (Chevron, Amoco); CBS and NPR feeds were disrupted for days (c). | One bird broke payments and hospitals' pagers. |
| GPS time error, Jan 26, 2016 | A 13-microsecond error after a satellite was decommissioned hit about 15 timing receivers across broadcasters and some other users (c). | Timing is the hidden dependency. |
| GPS dependence | GPS time syncs cell networks, power-grid synchrophasors, financial trading timestamps, and broadcast; a UK government study (Blackett Review, 2018) put a 5-day GPS outage at about GBP 5.1 billion (c). RTI (2019) estimated GPS has generated about $1.4 trillion in US economic benefit since the 1980s (c). | The economy rides on a clock. |
| Viasat KA-SAT hack, Feb 24, 2022 | Tens of thousands of satellite modems bricked in Ukraine and Europe; about 5,800 German wind turbines lost remote monitoring (c). | Even a software attack on a satellite service reaches the ground. |
| Kessler syndrome | Donald Kessler (1978): enough orbital debris makes collisions self-sustaining. The 2007 Chinese ASAT test made over 3,000 trackable fragments; the 2009 Iridium-Cosmos collision made about 2,000; the Nov 2021 Russian ASAT test made about 1,500 (c). LEO has well over 10,000 active satellites now (Starlink alone several thousand) (c). | A cascade could make parts of low orbit unusable for years to decades. |
| Space weather | The May 2024 G5 storm disrupted GPS-guided tractors and raised satellite drag (c). A Carrington event would degrade satellites (see `solar_flare.md`). | Satellites are the first casualty of a bad sun. |
| High-altitude nuclear burst | Starfish Prime (1962) created belts that killed about six to eight satellites over months (c). | A war kills satellites too (see `emp.md`). |
| Loran, paper charts | Legacy backups (eLoran, magnetic compass, sextant, paper maps) exist but are not maintained. | |

## 2. Warning signs and how to notice them

Warning window 3 to 30 days; **ambiguous**. Real events (a Kessler cascade, an ASAT strike) can happen in a day; a war or a sun storm gives earlier hints.

- A debris-collision story: "Station crew shelters in the return capsule"; collision avoidance maneuvers for Starlink.
- GPS jamming and spoofing reports near conflict zones; ships report wrong positions.
- Phone map apps drift; the tractor's auto-steer wanders; a pilot neighbor complains of "GPS integrity warnings".
- Satellite TV and internet blips; weather forecast shows "data unavailable".
- Airline schedule cancellations; "technical issues" at air traffic control.
- Government advises: "keep a paper map and a compass".

Player cues: the in-game phone map and the weather panel show "no fix". A neighbor with a satellite dish says the dish is dead.

## 3. Phase-by-phase timeline

Variant `kessler` (slow, a debris cascade over days).

| Phase | World | Compound |
|---|---|---|
| **Hit** | Within hours to a day: GPS constellation and many LEO satellites lost or degraded. Cell towers lose timing (holdover clocks drift for days). Air traffic is grounded. | Phone map and weather forecast "no signal". Satellite internet, TV: dead. Day card: "The sky is clear and the phones are lost." |
| **First hour** | Card terminals begin failing where they use satellite links; some gas stations stop; ATMs flicker. | Local power fine. The farmer's auto-steer drifts; tractor goes by eye. |
| **Day 1** | Airports closed; trucks and ships navigate by older aids, slowly; dispatchers lose tracking. Some cell service fails at sites that lost sync. | No weather alerts: severe weather arrives without a forecast lead. |
| **Week 1** | Trucking schedules unravel (JIT inventory); fuel deliveries erratic; stores restocked unevenly; stock markets halted (timestamp issues). Grid operators lose precise timing for synchrophasors; some regions go to manual dispatch; rolling blackouts start. | Deliveries start thinning; `canOrder` limited; radio (AM/FM) works; shortwave works. |
| **Month 1** | Banks run on legacy rails with delays; card networks degrade; cash is preferred; some cells operate with local atomic clocks; navigation by eLoran-like or road signs; ships queue. | The compound runs, but outside supply shrinks; fuel thins. |
| **Month 3** | Partial: terrestrial replacements (ground-based timing, fiber, eLoran trials) restore the core; GPS may be reconstituted only in months to years (a Kessler cascade can last years). Forecast gaps lead to surprise storms. | Weather threat warning lead times shrink (the audit proposal: a multiplier in `weatherThreats`). |
| **Month 6** | A two-tier economy: ground-based, slower, cash-heavy. Global shipping disrupted. | Local trade strengthens. |
| **Year 1** | Fate `full` (replacement): some satellites relaunched. `never` (debris belts persist): a long pre-space-age economy. | |
| **Year 2+** | A world with paper maps, regional radio and rail, rebuilt on terrestrial systems. | |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks (hit first to last): `phone` (days 0 to 3, `C(0,3,.4,...)`) and `banks` (days 1 to 10, the rails degrade), `deliveries` (day 1 to 14: JIT logistics), `fuel` (day 3 to 30: tanker routing and refinery coordination), `stores` (day 5 to 40), then `grid` slowly (day 7 to 60: timing and dispatch, rolling blackouts, not a full loss), `medical` slowest (records, helicopter and flight), `law` barely. Prices: logistic scarcity, food x1.4 by week 3, fuel x2; electronics x3; paper maps and compasses spike (in barter). Shops: open but short; card readers fail; cash and barter. Neighbors: puzzled, then worried; farmers lose the planting precision of big operations; community groups form. Raiders: low at first (the world is still lit) rising as deliveries thin: weights track `law`, a slow drift. Health: pharmacy restocking slows; helicopter and ambulance dispatch degrade; forecast-blind storm injuries. Food and water: farms continue; supply routes thin; local food and well water matter.

## 5. What fails, what protects, the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| Phone maps, GPS, satellite internet, satellite TV | Lost | Paper maps, a compass, a local guide, a ground-based radio |
| Auto-steer, drones, precision farming | Lost or degraded | Manual steering; marker rows |
| Weather forecasts | Degraded (no satellite imagery) | Barometer, local lore, a weather radio (NOAA ground stations stay up), an almanac |
| Cell service | Degrades (timing) | HF, VHF/UHF ham and GMRS radio |
| Card and ATM networks | Degraded | Cash |
| The grid | Wobbles; some outages | Off-grid plant, batteries |
| Aircraft | Grounded | Roads, rail |

**Wealth principle.** The wealthy are not hurt at home: they run a plant. Money buys **independent timing and information**: a GPS-disciplined clock is lost, but a rubidium clock, a ham base station with an antenna tower, a barometer and weather station, paper charts and a library of manuals keep operations going; spare parts and a well-stocked pantry ride out thin deliveries. A rich compound can keep ordering for a few weeks; the poor one is on the ground, buys by cash, and relies on hand skills. Money buys speed (be stocked before shelves thin).

## 6. Regional variation

| Region | Effect |
|---|---|
| Great Plains, Mountain West | Heavy precision ag and long freight; ranches rely on satellite internet and GPS tractors; severe weather forecast loss is deadly (tornado, blizzard). |
| Desert, Hill Country | Heat and flash flood warnings lost; ERCOT synchronization issues (islanded grid). |
| PNW | Ports and ferries; wildfire detection by satellite lost; smoke surprises. |
| Rust Belt, New England | Dense rail and trucking; shortages arrive sooner; more neighbors. |
| North Woods | Isolation and cold; no forecasts; winter storms arrive unannounced. |
| Appalachia, Ozarks | Already poor cell coverage; little changes; terrain makes ham essential. |
| Upper Midwest | Lake-effect storms without warning. |

## 7. What the player sees and hears

Radio and day cards: T-14 "Space Command reports a debris event in low orbit." Hit: "GPS service is unavailable; the FAA grounds all flights." Day 1: "Banks warn that card payments may be delayed." Day 3: "Severe weather cannot be forecast; stay alert." Week 2: "Truckers report depots with no dispatch." Month 1: "Navy restores limited timing from ground stations." Month 6: "The first replacement GPS satellites will not launch for 18 months." Comms degrade: satellite TV and internet at the hit; cell network wobbles as timing drifts; AM/FM and shortwave unaffected; ham nets become the navigation and weather service (a ham in Kansas calls a front by pressure drops).

## 8. Player decisions and strategies

Prepare paper maps and a compass; install a weather station and barometer; stock for thin deliveries; keep cash; switch to manual farming; use ham radio to learn local weather and conditions; decide whether to hunker or to go to town; use the lead time (3 to 30 days) to buy spare parts; make a neighborhood plan for storms without a forecast.

## 9. What makes it fun and not just punishing

It is the "quiet" scenario: the player's home is fine, yet the world slowly stops. It rewards learning (reading the barometer, doing dead reckoning), offers the **weather-surprise** thrill (storm events with no warning), and makes the ham radio the star. It is gentle on raids, so good for building and for players who prefer logistics puzzles. The pain is delayed and avoidable.

## 10. Suggested parameters and the hook seam

| Variant | weight | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|---|
| kessler (new) | 2 | C(7,40,.6,[365,1500],120) | C(3,25,.4,[200,1000],90) | C(5,35,.35,[200,1000],90) | C(1,14,.25,[200,1000],90) | C(14,60,.6,[300,1200]) | C(60,120,.8,[400,1200]) | C(0,3,.4,[180,900],90) | C(1,10,.35,[180,900],90) |
| gps_only (timing loss, new) | 1 | C(5,20,.7,[30,180]) | C(3,15,.5,[30,200]) | C(5,20,.6,[40,220]) | C(1,10,.4,[40,220]) | none | none | C(0,2,.6,[20,150]) | C(1,5,.5,[20,150]) |
| asat_war (new; links to `nuclear`) | 1 | as `kessler` plus war tracks | | | | | | | |

Fate odds (d): `[0.25, 0.40, 0.35]` (a Kessler belt may not clear).

Hook seam:
- `onWarning`: in-game map "no fix" flicker; auto-steer drift effect on farm yields (small); forecast quality reduced.
- `onHit`: `fx.noForecast = true`; weather threat warning lead time x0.25 (min 0 days, existing `weatherThreats` hook); remove phone map overlays; set `fx.timingDrift`.
- `daily`: timing drift grows; random grid wobble events; mis-timed delivery events; ham-based forecast action (a skill) restores some lead time.
- `encounterWeights`: unchanged early; `trader` x1.3 (travelers lost, asking for directions): small flavor encounters ("a trucker, lost").
- `priceMods`: electronics x3, maps and compasses x4; staples slowly.
- `radioBulletins`: list above.
- `oasisWeights`: phone, deliveries, banks double.
- `look`: no change; at night satellites vanish from the sky; the stars are the same.

## 11. Chaining possibilities

- `solar_flare` (cause or companion), 20%.
- `grid_down` as the late tail (timing and dispatch failures) 30% after 30 to 90 days.
- `financial` (card networks and trading), 25%.
- `lawless` 20% after 90 days.
- `oil_shock` (tanker routing), `cyberattack` (an ASAT attack with a cyber component).
- A **weather surprise**: a forecast-blind tornado or blizzard hits during the scenario: the existing weather threats fire without warning days.
