# Scenario: Oil and refinery shock (`oil_shock`)

New scenario (item 8 in `DISASTER_TEETH.md`). The strait closes, a pipeline is cut, or the Gulf refineries go down. **Slow death by fuel**: pumps run out, trucks stop, deliveries thin, food prices climb with the freight, tractors and generators idle, neighbors siphon each other's tanks. The power stays on at first. It is the fuel track, played long.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Event | Figures | Lesson |
|---|---|---|
| 1973 to 74 Arab oil embargo | OPEC cut output and embargoed the US from Oct 1973 to Mar 1974; crude rose from about $3 to about $12 a barrel (c); US gasoline shortages, lines at the pump, odd-even rationing by license plate, a 55 mph national speed limit, and Sunday closings in many states (c). | Even a 5 to 9% supply cut caused shortages because of panic buying. |
| 1979 Iranian revolution | Loss of about 4 to 5% of world supply; prices roughly doubled; lines again; the 1980 recession (c). | Small physical cuts make large price shocks. |
| Strait of Hormuz | About 20% of world petroleum liquids pass through it; about a fifth of global LNG (c). A closure would remove more than any past shock. | The extreme tail. |
| Colonial Pipeline, May 2021 | 6 days offline; up to about 69% of North Carolina stations dry from panic buying (v, in `research_disasters.md`); the pipeline carries about 45% of East Coast fuel (c). | The hoarding, not the shortage, empties the pumps. |
| Hurricane Harvey, Aug 2017 and Winter Storm Uri 2021 | The Gulf Coast holds roughly half of US refining capacity (c); Harvey took about a quarter of US refining offline at its worst (c); Uri knocked out multiple Texas refineries (c). | A coastal storm or freeze is a refinery shock. |
| Russia 2022 | A sudden loss of Russian diesel exports hit European diesel prices; US diesel hit $5.8 a gallon in June 2022 (c). | Diesel (trucks, tractors) is the first pinch. |
| Venezuela and Lebanon (see `financial.md`) | Oil-rich Venezuela had fuel shortages in 2019 to 2020 with multi-day lines; Lebanon's generator mafias sold diesel at dollar prices. | Fuel is a currency. |
| Trucking | ATA: minor shortages in 1 to 2 days without trucks and significant shortages in about 3 days (v, in `research_disasters.md`). A food truck delivery depends on diesel. | Fuel is food. |
| Stored fuel | Gasoline keeps about 3 to 6 months untreated, 12+ months with a stabilizer; diesel 6 to 12 months, longer treated (c). Propane stores indefinitely. | The player's stored fuel has a life. |

## 2. Warning signs and how to notice them

Warning 14 to 90 days (`warn: [14, 90]`), longer for a diplomatic cause, short for a refinery event.

- A tanker attack or a strait incident in the news; insurance rates for tankers spike.
- Crude and pump prices up 20 to 60% in weeks; the price at the farm co-op's fuel tank jumps on a Monday.
- Gas lines at the nearest town; a station "out of regular".
- Government talks about reserves (the Strategic Petroleum Reserve release), rationing plans, and speed limits.
- The farm store runs out of fuel stabilizer and jerry cans.
- Neighbors fill drums; a neighbor with a farm tank puts a lock on it.

## 3. Phase-by-phase timeline

| Phase | World | Compound |
|---|---|---|
| **Hit** | The shock: a closure or a refinery outage removes 10 to 25% of supply (variants vary). Pump prices jump 30 to 80% in days. | A price card. The player's own tanks and stockpiles are the buffer. |
| **First hour** | Panic buying starts; the pumps at the station show "no fuel". | A jump in the daily fuel price. |
| **Day 1** | Lines at every station; limits per vehicle; odd-even rationing in some states. | Fill vehicles and cans while you can (a window of 1 to 3 days). |
| **Week 1** | Trucking schedules thin; diesel up 100%. Farmers cut field passes. Some stations shut for good. | `deliveries` fall; shelves thin in week 2; the farm store is out of fuel. |
| **Month 1** | Food prices rise 20 to 40% from freight; bread, milk, produce first. Commuting collapses; school buses cut; the economy contracts. | Siphoning: fuel theft from tanks at night; locks and cameras matter. |
| **Month 3** | Rationing (a federal fuel card system), black markets; some homes without heating oil in winter. Public transit and rail get priority. | The compound's winter heating (wood) is the edge. |
| **Month 6** | A new equilibrium: fewer miles; local trade; electricity from coal and nuclear still on; natural gas fine; diesel scarce. | Biodiesel, alcohol, charcoal gasification, horse and ox, electric tractors (if solar) become options. |
| **Year 1** | `full` fate: supply returns, prices stay high; `partial`: permanent shortage, ration cards; `never`: a post-oil economy. | A transition: a farm that runs on its own fuel (wood gas, biodiesel from oilseed, methane digester) is a winner. |
| **Year 2+** | The country adjusts: smaller vehicles, more rail. Rural areas have the hardest time. | |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks: `fuel` falls fast (day 0 to 7) to a floor of 0.1 to 0.3; `deliveries` follows (day 3 to 20) and `stores` (day 7 to 40); **`grid` stays up** (stay above 0.8 for at least 6 months; coal and nuclear and gas generate; diesel backup fails) but rolling shortages of diesel for backup generators hit rural sites; `phone` mostly up; `banks` up; `medical` thins (ambulance and supply deliveries); `law` thins in rural counties (cruisers rationed fuel). Prices: fuel x2 to x4 (cash); diesel x3 to x5; food x1.3 to x2 by month 3; fertilizer and propane x2 to x3 (natural gas feedstock). Shops: open; shelves thin; limits per customer. Barter: fuel is a currency: a gallon of gas buys a day's labor; stabilizer, wood-gas parts, hand tools, bicycles, draft animals, seed. Neighbors: friendly but fuel-hungry; siphoning; carpooling groups; an "odd-even" line; farm co-ops share. Raiders: **fuel thieves** and syphoners; later armed fuel raids on tanks; weight on `fuel_thief`. Health: little direct harm early; heating-oil poverty in winter (cold deaths), CO from improvised heaters; ambulance delays. Food and water: farms cut field work; food travels less; local food is cheap relative to imports; water from wells with grid pumps is fine (the grid is on).

## 5. What fails, what protects, the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| Gas and diesel vehicles, tractors, chainsaws | Idle without fuel | Stored fuel with stabilizer; drums and a tank; efficient vehicles; bicycles, horse, ox; electric tractor with solar |
| Backup generators | Idle | Propane, biogas, solar and battery |
| Heating oil | Scarce | Wood stove, firewood, propane stored in a buried tank |
| Delivery chain | Thin | Pantry, garden, local sources |
| Fuel in tanks | Stolen | Locks, a buried tank, cameras, dogs |
| Fuel quality | Degrades over months | Stabilizer, rotation |

**Wealth principle.** Money before the shock buys **fuel and fuel independence**: a 500 to 1,000 gallon tank (diesel), a buried propane tank, stabilizer, a wood-fired heat plant, an electric tractor and solar, a biodiesel or wood-gas setup, bicycles and a cart horse. The rich compound has months of fuel and sells or trades it at 5x; the poor compound works by hand and with animals, walks to town, and survives on wood and a garden. Money after the shock buys little: stations are empty and prices are x4.

## 6. Regional variation

| Region | Effect |
|---|---|
| Rust Belt, New England | Heating oil dependence; far from Gulf refineries; highest pain in winter; commuters; odds `financial x1.4` pairs. |
| Plains, Mountain West | Long distances, diesel-hungry ranching and farming; harvest and planting disrupted; propane for heat. |
| Hill Country | Refineries on the Gulf are near but vulnerable (storms and freeze); Texas energy dominance cushions supply; price spikes still bite. |
| Desert | Car-dependent with long distances; power is fine; water pumped by electricity is okay; fuel for travel is the pain. |
| PNW | Fuel arrives by pipeline from the Puget Sound refineries and by barge; a pipeline cut is severe; hydro gives power. |
| North Woods, Upper Midwest | Cold winters; propane and heating oil; wood plentiful; snowmobiles and tractors idle. |
| Appalachia, Ozarks | Less car travel is not an option (rural); coal and wood; a rural poverty squeeze. |

## 7. What the player sees and hears

Day cards: "The price board at the station reads $7.19. Yesterday it was $4.85." Radio: T-20 "Tanker attacked in the strait; crude up 18%." T-5 "Pump prices up 30% in a week." Hit "Strait closed; the Strategic Petroleum Reserve to release 1 million barrels a day." Day 3 "Several states impose odd-even rationing." Week 2 "Truckers' convoy blocks a highway to protest the diesel price." Month 2 "Federal fuel cards to be issued by Zip code." Month 5 "Heating oil: the Northeast faces a shortage." Comms: unaffected; a mix of true and rumor ("the station in Grant has fuel on Thursday") that drives pointless trips.

## 8. Player decisions and strategies

How much to store and how (tank size, stabilizer, rotation, security); how to spend fuel (field work first, trips second); whether to share with neighbors; whether to drive to town; whether to convert to wood heat and electric or animals; whether to sell a fuel surplus; whether to use fuel as barter or hold; security for the tank.

## 9. What makes it fun and not just punishing

A **resource-management** scenario: each gallon is a decision. Efficiency puzzles: trip planning, tractors vs oxen, solar-electric conversion, wood gas. The player sees a visible gauge and a fuel budget; the world is mostly intact, so there is time to adapt. Neighbors' tanks create social drama (siphoning, sharing, trade). The scenario is non-lethal compared to others and good for building a self-sufficient compound.

## 10. Suggested parameters and the hook seam

| Variant | weight | fuel | deliveries | stores | grid | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|---|
| hormuz (new; closure) | 2 | C(0,7,.15,[180,720],90) | C(3,20,.3,[200,740],90) | C(7,40,.4,[220,760],90) | none (>= .85) | C(30,60,.6,[240,780]) | C(60,90,.7,[260,800]) | none | C(30,60,.7,[240,780]) |
| pipeline_cut (new; 2 to 8 weeks) | 3 | C(0,3,.25,[14,60],20) | C(2,10,.5,[20,70],20) | C(5,15,.6,[25,75]) | none | none | none | none | none |
| gulf_refineries (new; hurricane or freeze) | 2 | C(0,5,.3,[21,90],30) | C(3,12,.5,[30,100]) | C(7,20,.6,[35,110]) | none | none | none | none | none |
| embargo_long (new; 1973 on steroids) | 1 | C(0,10,.2,[300,900],120) | C(5,40,.35,[320,920]) | C(10,60,.45,[340,940]) | slow brownouts | C(60,90,.6,...) | C(90,120,.7,...) | none | C(60,90,.7,...) |

Fate odds (d): `hormuz [0.35, 0.45, 0.20]`; `pipeline_cut [0.85, 0.12, 0.03]`; `gulf_refineries [0.8, 0.17, 0.03]`.

Hook seam:
- `onWarning`: `priceMods.fuel` ramps up 5 to 10% a week; fuel can and stabilizer sell out; gas-line props at the station.
- `onHit`: fuel price card; per-vehicle limit; window of 1 to 3 days for fill-ups.
- `daily`: stored fuel degradation (gasoline 90 to 180 days untreated); siphon theft roll (night) scaled by `Visibility`, tank visibility and locks; farm work fuel cost; rationing status.
- `encounterWeights`: `fuel_thief` x3; `fuel_trader` positive; `looter` mild.
- `priceMods`: fuel x2 to x4, diesel x3 to x5, food +20 to +40% over 3 months (freight), propane, fertilizer.
- `medical`: ambulance delay (small).
- `radioBulletins`: list above.
- `oasisWeights`: fuel and deliveries double; grid zero (grid stays up, the contrast is mobility).
- `look`: empty roads (existing `roadTraffic` profile), long lines at the pump.

## 11. Chaining possibilities

- `financial` 40% after 60 to 180 days (the 1973 to 79 stagflation and the cost shock): see `financial.md`.
- `lawless` 20% after 90 days.
- `civil_war` (pulpy) if rationing breaks down: 10%.
- `cyberattack` (pipeline attack), `solar_flare` and `satellite_loss` as upstream causes.
- `drought` and famine pairs: fuel shortages in a drought year compound (hay hauling).
- `grid_down`: diesel backup runs out at substations and cell towers: late tail 15%.
