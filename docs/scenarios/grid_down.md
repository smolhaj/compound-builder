# Scenario: Grid-down (`grid_down`)

Long-duration regional blackout. This is the baseline disaster: every other scenario in this folder is "grid-down plus something". Variants in `disaster.ts` today: ice storm, substation attack, cyber, cascade. This doc adds a fifth, **transformer shortage** (the physical-damage blackout that outlasts the weather), and sets the numbers for all five.

Confidence tags: **(v)** verified against a primary or reliable secondary this session or in `research_disasters.md`, **(c)** commonly cited, **(d)** design estimate for tuning.

## 1. Real-world basis and analogs

| Event | Figures | Lesson for the game |
|---|---|---|
| Northeast blackout, Aug 14, 2003 | About 50 million people in 8 states and Ontario; 256 plants tripped, about 61,800 MW lost. A sagging FirstEnergy line met a tree and an alarm software bug hid it. Most US power back in 1 to 2 days, parts of Ontario about 4 days. About 11 direct deaths officially; later studies found about 90 excess deaths in New York City (c). Cost about $6 billion (c). | A short blackout is a snow day. Order holds. The danger is the cascade, not the dark. |
| Texas, Winter Storm Uri, Feb 2021 | About 4.5 million homes and businesses off at the peak; roughly 70% of ERCOT customers lost power at some point, for an average of about 42 hours; about 40% of generation offline; 246 deaths on the state's final count (v); boil-water notices reached roughly 14 million people (c). Most of the dead froze in unheated houses or were hurt by generator exhaust. | Power plus water plus gas fail together in cold. Carbon monoxide kills more than hunger. |
| Puerto Rico, Hurricane Maria, Sept 2017 | The entire island's grid down. About 11 months until restoration was essentially complete; households averaged 84 days without power (v, in `research_disasters.md`); excess deaths estimated at 2,975 by George Washington University, over 4,600 in a Harvard survey (c). Most deaths came from interrupted medical care. Rural customers waited longest. | The outage is the killer, not the storm. The last mile is the longest. |
| Moore County, NC, Dec 2022 | Gunfire at two substations, about 45,000 customers dark, up to 4 to 5 days, curfew imposed (c). | A few rifles make a blackout. Warning is the news, not the dark. |
| Metcalf, CA, Apr 2013 | A sniper team shot 17 transformers in about 19 minutes (c); the utility rerouted and kept the lights on; repairs took weeks. | A redundant grid hides damage; an unredundant rural feeder does not. |
| Quebec ice storm, Jan 1998 | 1.4 million customers off, some for 5 weeks, 35 deaths (c). Pylons collapsed. | Ice is a restoration-time problem: poles must be rebuilt, not reset. |
| Ukraine, winter 2022 to 2023 | Missile and drone strikes damaged roughly 40% of the grid by late 2022 (c); rolling outages of 4 to 12 hours a day became normal for months. | Partial, rotating power is a lifestyle, not a day. Hospitals and water get priority. |
| New York, July 1977 | 25-hour blackout, about 1,600 stores looted, about 3,700 arrests (c). | A night blackout in a poor, hot city goes bad fast. Rural looting is slower and quieter. |
| Large power transformer lead times | 120 to 150 weeks (Wood Mackenzie 2023 to 2024), distribution transformers up to 2 years (NREL 2024) (v, in `research_disasters.md`). Hardly any spares exist; replacement is custom-built. | If the damage is to transformers, the answer is "years", not "days". This is the whole premise of the transformer-shortage variant. |

Rule of thumb that drives the pacing: **a blackout that is mostly line damage ends in days to weeks; one that is mostly transformer and substation damage ends in months to years, and nobody can promise the date.**

## 2. Warning signs and how to notice them

Warning window 10 to 40 days (`warn: [10, 40]`), shorter for the ice storm. Signs appear as headlines (existing `hints`), and the player can notice them in play:

- **Conservation alerts.** "Conserve power 4 to 9 p.m." on the radio and the TV crawl. If the player has a smart meter or monitoring panel in the house, the evening voltage dips and the lights flicker (a text line in the day card: "The lights dimmed twice at supper").
- **Co-op linemen on 18-hour shifts.** A neighbor mentions it at the gate; shows up as a Neighbor chat line from day 12 on.
- **Substation rumors.** The FBI bulletin line; a sheriff's cruiser parked at the substation on the county road (a prop that appears on the road during the last 10 days when the variant is `substation`).
- **Generator and propane runs.** The farm store prices jump (`priceFactor` panic term already reads the warning). A player watching the Store sees generators and fuel stabilizer sell out three days before the hit.
- **Weather.** For the ice storm, a Weather Service watch 3 days out: this is the only variant where the warning is meteorological and exact.
- **Silent signs.** The line crew truck that never comes after a small outage. Unplanned outages that get longer each time (a 2-hour, then 9-hour, then 30-hour outage in the last two weeks).

A player who prepares in the warning window (fills fuel, tops batteries, cuts firewood, canning, moves the freezer meat to the root cellar plan) gains a real edge. A player who ignores the signs still has a usable first week because the baseline stores last.

## 3. Phase-by-phase timeline

Baseline shown for the **cascade** variant (long outage, fate `partial`). Notes mark where the others diverge.

| Phase | In the world | At the compound |
|---|---|---|
| **Hit** | Lights out across the region. Traffic lights dark, road snarls. Phones work on tower batteries. | Grid-tied power gone. Off-grid players see nothing change (one text line: "The line to the road went dead. Yours did not."). Grid-tied solar without a battery and islanding switch makes no power (anti-islanding). |
| **First hour** | Everyone checks the breaker, then the neighbors. Radio and car radios tune to the one AM news station. | Fridge and freezer clocks start (`spoiling` timer: closed freezer about 48 h, fridge about 4 h (c)). Well pump dead if it runs on grid power. First test: do you have a manual path to water? |
| **Day 1** | Feels like a snow day. Gas stations still sell until the pumps' backup runs out, lines form. Banks and card terminals flicker. | Cook on wood or camp stove. Move freezer food: smoke, can, eat, share. Sharing raises neighbor goodwill. |
| **Week 1** | Day 2 to 3: cold chain gone, pumps dry, municipal water pressure falls; boil notice by word of mouth. Day 3 to 4: shelves empty (`ATA`: minor shortage in 1 to 2 days, significant in about 3 (v)). Phone mostly dead by day 3 to 4 as tower generators run out of fuel. Hospitals on generators with about 96 h of fuel (c). | The first neighbors come to fill jugs from your well. Friendly. A generator owner burns most of the tank by day 7. Insulin and dialysis neighbors begin to die. |
| **Month 1** | Rural areas do better than towns. Refugees from the city edges reach the county roads in week 3 to 6. Police stretched, fuel and staff short. Schools and churches become hubs. | Generator fuel is the first real wall. Charging phones for others is an OPSEC problem: everyone now knows you have power. Night theft of fuel and chickens begins. |
| **Month 3** | If power is back (fate `full`), it returns town by town, hospitals first; you are last on the line. If not, a barter economy has formed and a neighborhood watch or militia has appeared. | Stored fuel is gone for most neighbors. Your compound's surplus (eggs, firewood, repair work, electricity) is the currency. Winter makes everything harder. |
| **Month 6** | `partial` fate: the grid returns in pieces, a few hours a day, uneven. Water and sewage plants run on schedules. | Solar and batteries have paid for themselves in raid pressure: a lit window is both advantage and target. |
| **Year 1** | Transformer-shortage variant: still dark in much of the region; restoration follows the manufacturing queue and the political order of customers (hospitals, water, military, cities, then rural). Puerto Rico took 11 months. | Everything runs by hand or by your own plant. Spares become the true wealth: every inverter, controller, pump head, bearing. |
| **Year 2+** | Power back for some; others give up the grid. Rural co-ops finish last. A two-tier country: lit towns, dark farms. | The compound trades power and tools. Decide whether to reconnect or stay islanded (the grid brings back the card terminal and the delivery truck, and also the bill). |

Variant divergences: **ice storm** is a weather hit (poles down, roads iced shut, the real ice-storm weather threat fires with it; back in 7 to 30 days). **Substation attack** adds copper thieves and guard patrols at substations and a 30 to 120 day repair. **Cyber** variants are covered in `cyberattack.md`. **Cascade** is the old grid failing under load, 60 to 365 days. **Transformer shortage** (new): a physical-damage blackout (a coordinated attack or a geomagnetic or weather event that cooks transformers), restoration 180 to 730 days, fate odds worse than `cascade`.

## 4. Effects on the eight service tracks, prices, shops, barter, neighbors, raiders, health, food and water

| Track | Behavior (cascade) | Notes |
|---|---|---|
| grid | 0 at the hit, back in 60 to 365 days | Hospitals first. `grid > 0.5` is "up" in the engine. |
| fuel | 0.05 by day 1, trickle after | Pumps need power. Existing fuel stocks in tanks are the only supply for months. |
| stores | falls over 3 days to 0.05 | Cold chain, then shelves. |
| deliveries | 0 by day 1 | No trucks without diesel and dispatch; no ordering (`canOrder` needs deliveries > 25%). |
| medical | falls over 10 days to 0.15 | Dialysis, insulin, oxygen: a hard countdown. Insulin about 28 days at room temperature once open (c). |
| law | falls from day 14 to 0.25 | Deputies short of fuel and sleep; calls go unanswered. |
| phone | falls to 0 by day 3 to 4 | Towers: batteries 2 to 8 h, with generators 24 to 72 h (c). |
| banks | card terminals dead hour 1; cash only a few days | `moneyWorks` stays true only while stores and banks are above 50%. |

Prices: stores panic buying in the warning (+30% to +60% on staples by the last week, `d`), then scarcity: fuel x3 to x6, batteries and propane x4, canned food x2 to x3 by week 2, medicine x5. Shops close by day 3 to 5 or accept cash and barter only. Barter currency in the first month: fuel, ammo, salt, medicine, batteries, hand tools. Neighbors: friendly week 1; asking for charging week 2 to 4; organized theft month 2+. Raiders: `law` track sets cadence; in this scenario they are mostly looters and fuel thieves, with gangs only if the chain to `lawless` (35%) fires. Health: carbon monoxide from indoor generators and grills, cold, infected wounds, dysentery where the creek is used without boiling. Food and water: freezer spoilage, municipal water gone, well needs a pump path (hand pump, solar pump, generator).

## 5. What fails, what protects, and the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| Grid-tied solar with no battery | Dead (anti-islanding) | Hybrid inverter plus battery, or a transfer switch |
| Submersible well pump on grid | Dead | Hand pump, solar pump, or a gravity-fed cistern |
| Freezer and fridge | 48 h and 4 h | Chest freezer kept shut, cold winter, root cellar, canning, smoker |
| Generator | Burns fuel, noisy, advertises you | Stabilized fuel stored in drums, a baffle box, a quiet inverter generator |
| Cell phone | Dead by day 3 to 4 | Ham, GMRS, a crank AM/FM and shortwave radio |
| Cards, ATMs | Dead | Small bills in a safe; barter goods |
| Cars | Run until the tank empties | A diesel with stored fuel; a bicycle; a horse |
| Spare parts | Only a stockpile helps | Spare inverter, charge controller, pump head, belts, seals |

**Wealth principle.** Money buys speed and protection in advance. The rich compound (off-grid solar, battery bank, deep well with a solar pump, fuel drums, spare inverters stored in a Faraday room, a second water source) goes through the hit with a text line and a rising neighbor-contact problem. The poor compound has a wood stove, a hand pump and a root cellar: it survives, but each task takes hours by hand, and its labor, not its cash, is the limit. A character who has money and uses it only after the hit pays x3 to x6 prices for a fraction of the stock; the same dollars before the hit buy full capacity.

## 6. Regional variation (11 regions)

| Region | Effect |
|---|---|
| Mountain West | Long feeders, cold winters: high heating load; wood is the answer; co-op restoration slow. Odds as is. |
| Appalachia | Ice storm and derecho country; rural co-ops last; odds x1.4 (existing). Hollows lose cell signal first. |
| Desert Southwest | Summer outages are heat emergencies (water, shade); grid fails under cooling load; solar is abundant; wells deep and pump-dependent. |
| North Woods | Deep cold makes a winter outage lethal; woodlots plentiful; propane delivery cut. |
| Great Plains | Windstorm and ice take down long single-circuit lines; large distances to help; grain elevators idle. |
| Pacific Northwest | Hydro-heavy and wet; ice and windstorm hits; mild winters help; damp rots stored food. |
| Upper Midwest | Ice storms, long winters; high wood supply; grid strained by cold snaps. |
| New England | Ice storms (2008 and 1998 analogs), old overhead lines through trees, high population density near the edge; heating oil delivery stops. |
| Ozarks | Ice storm belt; electric co-ops; hand-pumped wells and springs help. |
| Texas Hill Country | ERCOT is islanded from the national grid (Uri); a blackout there cannot be bailed out by neighbors; the odds for this region should be x1.5 after WP10. |
| Rust Belt edge | Dense, old, transformer-dependent; close to cities; refugees arrive early; scrap and copper theft. |

## 7. What the player sees and hears (text only)

Day cards: "The lights are out and so is the road crew." Radio (AM, battery): service-status lines from the existing `radio.ts`, plus bulletins by phase: day 1 "Utility says crews are assessing damage"; day 3 "Utility: restoration estimates are being revised"; week 2 "Governor orders hospitals to receive generator fuel first"; month 2 "National Guard escorts a fuel convoy to the county seat"; month 6 (partial) "Power returns to the county seat on a rotating schedule: 4 hours a day". Comms degrade in this order: TV and internet (hour 1), cell (day 3 to 4), AM news station on generator (week 2), then ham and CB become the only live voices; a ham net (if the player has a radio and a license skill) reports from towns that nobody else can reach, with true or false rumors.

## 8. Player decisions and strategies

- Where to put the first dollars: panels and batteries (comfort, visibility) or fuel and a hand pump (cheap, robust, dark).
- Generator policy: run it two hours a day for the freezer, or never (noise and light signature).
- Share or hold: charging stations raise goodwill and risk.
- Rural vs town trips: every trip burns fuel; stay home or leave early.
- Food: eat the freezer first, can, smoke, dry; plan for the long month.
- Restoration choice at the end: reconnect, or stay islanded.

## 9. What makes it fun and not just punishing

The first week should feel like a camping trip with a deadline: a visible countdown on the freezer, the neighbor with the oxygen tank, the cool moment of a first lit window. Each phase should offer a choice with a reward: sharing buys goodwill that returns as labor and tips in month 3. The restoration fate is hidden but hinted ("crews reached the county seat"), which gives hope without promising. The reward for the well-built compound is power as a tradeable service. Avoid pure drain: every month should have one new thing to build or to trade.

## 10. Suggested numeric parameters and the hook seam

Use `C(at, fall, floor, [backMin, backMax], ramp)` like `disaster.ts`.

| Variant | weight | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|---|
| ice_storm (existing) | 3 | C(0,0,0,[7,30]) | C(0,0,.1,[8,32]) | C(1,3,.1,[10,35]) | C(0,1,0,[10,35]) | C(4,4,.3,[10,35]) | C(14,16,.4,[12,34]) | (existing) | (existing) |
| substation (existing) | 2 | C(0,0,0,[30,120]) | | | | | | | |
| cyber (existing) | 2 | C(0,0,.1,[14,90],30) | | | | | | | |
| cascade (existing) | 1 | C(0,0,0,[60,365],45) | | | | | | | |
| **transformer_shortage (new)** | 1 | C(0,0,0,[180,730],120) | C(0,0,.05,[200,740],90) | C(1,4,.05,[210,750],90) | C(0,1,0,[210,750],90) | C(4,10,.1,[210,750]) | C(10,20,.2,[240,760]) | C(0,3,0,[200,740],60) | C(2,6,.1,[200,740],60) |

Fate odds (existing `[0.68, 0.24, 0.08]`); for the transformer variant use `[0.35, 0.45, 0.20]` (d).

Hook seam (`DISASTER_TEETH.md` WP0 `KindFx`):
- `onWarning`: sets `fx.brownoutDays`, dims window lights in the last 10 days (a `look` flicker).
- `onHit`: ice storm fires the real ice-storm weather threat at max severity; substation spawns `copperThieves` encounter weight; sets `fx.gridTie = 'islanded'` for anti-islanding. Generator `unstabilizedFuel` first-use fault roll (20 to 35% (d), cleared by a drill).
- `daily`: freezer spoilage ticks, tower-battery countdown on `phone`, carbon-monoxide risk when an indoor generator or grill is active, night fuel-theft roll scaled by `Visibility` and `LightSignature`.
- `encounterWeights`: `fuel_thief` x2.5 after day 14; `looter` x1.3 when `law < 0.5`.
- `priceMods`: fuel, battery, propane, candle multipliers by week; food scarcity lags by 7 days.
- `medical`: dependency trait countdown (insulin 28 days at room temperature).
- `radioBulletins`: the list above.
- `oasisWeights`: grid and phone weigh double (the lit window is the contrast).

## 11. Chaining possibilities

- `grid_down` -> `lawless` 35% after 21 to 45 days (existing).
- -> `pandemic` (water treatment down, cholera and dysentery in towns) 10% after 30 to 90 days (new).
- -> `financial` if fate is `never` or `partial`: cash economy dies (see `financial.md`).
- Grid-down is also the visible tail of `solar_flare`, `emp`, `cyberattack`, `satellite_loss` and `oil_shock`; those docs reuse these tracks with different curves and different side effects.
