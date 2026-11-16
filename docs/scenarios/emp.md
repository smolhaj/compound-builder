# Scenario: High-altitude nuclear EMP (`emp`)

A single nuclear weapon detonated 30 to 400 km above the middle of the continent. There is no blast, no fallout, no winter. There is a flash, a silent sky, and the end of modern electronics. This is its **own kind** (owner decision), separate from `nuclear` (war) and `solar_flare` (partial fry). It reuses the existing `nuclear.strike()` EMP block.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Source | Figures | Lesson |
|---|---|---|
| Starfish Prime, July 9, 1962 | 1.4 megaton at about 400 km over Johnston Island; about 900 miles (1,450 km) away in Hawaii, hundreds of streetlights (about 300 on Oahu) went out, burglar alarms rang, a microwave link failed (c, sources vary). Several satellites in low orbit failed from the artificial radiation belt (6 to 8, c; the number is disputed). | A small pulse at long range does only modest harm to 1962 electronics. Modern chips are far more fragile. |
| Soviet Test 184, Oct 22, 1962 | 300 kt at about 290 km over Kazakhstan: about 570 km of overhead telephone line burned, power-line fuses and a diesel generator in the region failed, and a power plant fire occurred (c). | Long conductors collect the pulse. |
| EMP Commission, 2008 | Three phases: **E1** (nanosecond, up to about 50 kV/m, destroys chips and small controllers over a line-of-sight area), **E2** (lightning-like, microsecond to ms), **E3** (seconds to minutes, like a geomagnetic storm; GIC into large transformers). Vehicle tests: most test cars ran or restarted; a minority stalled or needed repair (c, widely cited and disputed in both directions). A continent-wide E3 could damage hundreds of large transformers (c). | Two threats in one: the chip killer (E1) and the grid killer (E3). |
| Range | One burst at 400 km covers a line-of-sight circle with a radius of about 2,200 km (c): most of the lower 48 from a point over Kansas. | A single weapon reaches almost every region. |
| Real-world uncertainty | No full-scale test since 1962; modern devices differ. The game uses design estimates and says so. | |
| Starfish and the Fishbowl series | A man-made radiation belt that degraded satellites for months. | Satellites suffer afterwards (chain to `satellite_loss`). |

## 2. Warning signs and how to notice them

Warning window 7 to 60 days, but EMP has an **ambiguous warning**: it is a tension, not a clock. 

- Satellite launch rumors, "unexplained" ballistic launches by a rogue state, diplomatic crisis, a ship parked in the Gulf of Mexico (c).
- Government drills on the emergency alert system; a US warning of "nuclear terrorism using a ship-launched missile".
- The dollar and gold swing; people buy shortwave radios and Faraday bags (price rise on radios in the last week).
- Preppers on the radio: "buy a trash can and some aluminum foil".
- **Nothing the last day.** The flash is the first signal. The player's last chance to act is the day before, and they cannot know it is the day.

## 3. Phase-by-phase timeline

| Phase | World | Compound |
|---|---|---|
| **Hit** | A white flash high in the sky, no sound. The sun-bright sky for a second; cars stop; planes (about a dozen in the air over the region) lose control; elevators stop. | Installed electronics fry: inverters, charge controllers, pump controllers, generator electronics, modern radios, phones, fridge control boards. The existing `strike` block fries installed things and spares not in a Faraday room. Vehicles with `emp` flag die (`empVehicles`). |
| **First hour** | Silence. Hum of cars gone. People on foot. No radio but battery AM from a vintage set; most stations dead because transmitters fried. | The player finds the dead list in the report. Old vehicles and hand tools stand out. |
| **Day 1** | Traffic jam of dead cars blocks roads. Hospitals on backup generators that do not start. Phones dead. Banks dead. | Water on gravity or a hand pump: fine. Anything electric: dead. The compound is in 1925. |
| **Week 1** | Stores sold out by day 3 (no trucks). Municipal water fails (SCADA fried). Fires with no fire dispatch. People walk home from town; the dash. | Neighbors with nothing arrive. Few vehicles on the road: the old truck is a king. |
| **Month 1** | Starvation threshold in the cities (a city holds 3 days of food (c)). First refugees walk out. Martial law attempts with no comms. | The compound is the oasis; the wall decides. Look for work in barter: repairs, rewinding motors. |
| **Month 3** | Order restoring around leaders with working radios (ham, old gear). Rural communities trade food for tools. | Hand tools, mechanics, seeds. A Faraday-room cache of inverters is gold: install and run. |
| **Month 6** | No imports of chips; no factory restart. Old inventories of parts run out. | A player with spare electronics runs a plant; others do not. |
| **Year 1** | Population declining in cities; the grid is dead (the E3 part). Fate `never` is the typical outcome (nearly 0.45, like nuclear). | Re-industrialization at village scale. |
| **Year 2+** | Slow recovery of electricity if transformers are repaired; a 1900s economy. | Trade, skill, and spares. |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks: all eight fall to near zero within hours: grid 0, fuel 0 (pumps and refineries dead), stores 0.05 by day 3, deliveries 0, medical 0.1 (no devices, no records), law 0.2 by week 2 (no radios, no cruisers), phone 0 at the hit, banks 0 at the hit. Recovery: **very long** (`null` for at least `exchange`-like fate). Prices: the market closes (`moneyWorks` false at once); barter dominates; salt, ammunition, tools, candles, fuel, mechanical clocks. Shops: closed or barter only. Neighbors: the dash home; strangers; no police; mutual aid in week 1; fights over water in week 3. Raiders: law track collapses; **no visits for the first 7 to 14 days** (people are on foot and shocked); then looters on foot, later on horses and bicycles; gangs after 30 days. Health: no pharmacy, no devices, hospitals dark; deaths from insulin and oxygen within 2 weeks; burn injuries minimal; **no radiation**. Food and water: no fallout restriction, no winter; garden and storage work normally; a city's food ends in a week.

## 5. What fails, what protects, the wealth principle

| Thing | Fate |
|---|---|
| Solar inverter, charge controller, generator control board | Fry unless in Faraday storage (existing `FRIED` list) |
| Modern vehicle (post-1990, ECU) | Fry or stall (`VEHICLES[v.kind].emp`); the Commission found a minority permanently damaged, but the game uses the dramatic case on Standard and the real mixed case on Cozy (d): fried chance 85% Hardcore, 60% Standard, 30% Cozy |
| Pre-1980 truck, diesel tractor with mechanical injection | Runs |
| Radios | Fry unless boxed; a crank AM/FM and a ham HF set in a Faraday container is the player's only voice |
| Wires, long runs | Collect the pulse; unplug and disconnect before (if warned) |
| Hand tools, hand pump, wood stove, manual well, gravity cistern | Safe |
| Spares in a Faraday room | Survive at the room's `empSurvive` share (existing `hardening.faraday`): metal-lined room with grounded copper mesh, tiers 1 to 3 |

**Wealth principle.** A metal-lined room, a stack of spare inverters, controllers and a radio inside it, a 1970s diesel truck and tractor, a hand pump, a mechanical workshop: money bought in advance gets you to "the lights come back on in 6 hours" (reinstall a spare inverter) while neighbors wait for a world that is not coming. A poor compound is the 1900s with an axe and a hand pump: it survives, but each job is by hand, for months. After the hit, money does nothing; chips cannot be bought.

## 6. Regional variation

An EMP's range reaches all regions, but **E3 (GIC) is worse at high latitude**; E1 is worst under the burst. Burst point is rolled (d): central US (Kansas), covering most regions at full strength; Desert and PNW are at the fringe (E1 weaker, 60% of fry chance), and North Woods and New England are far enough for reduced E1 but fully hit by E3 (grid). Rural regions with older vehicles (Ozarks, Appalachia, Mountain West, Plains) have more pre-1980 trucks (a `vintageVehicleShare` odds boost), and fewer people who depend on devices. Rust Belt and New England are dense and dependent (more neighbors arriving). Desert: no water without pumps (the wells are deep): a hand pump on a shallow well is a priority; heat kills in week 1.

## 7. What the player sees and hears

No audio. Day cards: "A light that was not the sun. Then nothing." Radio: **there is none**, unless the player has a Faraday-stored set. If so, the dial shows: "A single AM station on an old vacuum-tube transmitter, three counties away: 'This is a CONELRAD-style emergency broadcast. Stay in place.'" On ham: "All stations: the entire lower 48 is down; this is Salt Lake. Anyone with a rig, report." After the hit, the news is word of mouth and the road. Comms degrade: everything modern at once; vacuum-tube and boxed gear remain; ham HF survives only for those who boxed it.

## 8. Player decisions and strategies

Build the Faraday room and fill it (inverters, controllers, radios, a laptop with manuals, LED lights, a spare pump controller, batteries kept charged). Buy or keep an old truck and tractor; keep the old tools; plan for mechanical alternatives for every electrical service (hand pump, wood stove, manual tools, kerosene lamps). Plan neighbors (the dash). Decide whether to run the plant or hide it.

## 9. What makes it fun and not just punishing

The world is intact: no fallout, no famine from winter, no dead zone: it is a **craft** scenario. The fun is in the Faraday room payoff, restoring a house to electricity in an hour while the neighbors are in the dark, dusting off a 1973 truck, becoming the village blacksmith, or running a ham net. The player's skills (mechanics, electrical) matter hugely. Avoid punishment by letting fallback tools work and by keeping raids low the first 2 weeks.

## 10. Suggested parameters and the hook seam

| Variant | weight | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|---|
| local_burst (new; 400 km up, one region) | 2 | C(0,0,.1,[60,365],60) | C(0,0,.1,[90,400]) | C(1,4,.15,[90,400]) | C(0,2,.1,[90,400]) | C(1,6,.15,[120,400]) | C(7,20,.3,[150,450]) | C(0,0,0,[120,400]) | C(0,0,0,[120,400]) |
| continental (new) | 3 | C(0,0,0,null) | C(0,0,0,null) | C(1,3,.02,null) | C(0,1,0,null) | C(0,4,.05,null) | C(3,20,.1,null) | C(0,0,0,null) | C(0,0,0,null) |

Fate odds (d): continental `[0.05, 0.35, 0.60]`, local `[0.25, 0.45, 0.30]`.

Hook seam:
- `onWarning`: price spike on radios, Faraday mesh, Mylar; a new `Disconnect all` action; flag the player's `empReady` tier.
- `onHit`: call the extracted `empStrike(s, {scale: 'full'})` (WP1) with no fallout; sets `fx.dash = true`; vehicles roll by `vintage` flag; sets `moneyWorks` false at once.
- `daily`: neighbors arrival rate; a counter for "days since the grid"; old-parts repair jobs (a barter job board for mechanics).
- `encounterWeights`: raiders 0 for 7 days; refugees on foot x2 from day 5; traders only with horse or bicycle after day 30.
- `priceMods`: barter-only; scarcity as grid-down but jumping at once.
- `radioBulletins`: tube-set broadcasts; a ham net; silence.
- `oasisWeights`: grid, phone, banks double.
- `look`: white flash, no haze, no fire glow; at night a truly dark sky (stars).

## 11. Chaining possibilities

- `lawless` 55% after 10 to 30 days.
- `satellite_loss` (radiation belt kills LEO satellites over weeks): 40% as a quiet follow-on.
- `financial` automatically (banks 0).
- Starvation and `pandemic` in cities (cholera) after 30 to 90 days.
- Pairs with `nuclear` when the EMP is the opening move of a war (see `nuclear.md`): the same hit with fallout added.
