# Scenario: Solar flare / Carrington-class storm (`solar_flare`)

A coronal mass ejection (CME) hits Earth's magnetic field. Long conductors (high-voltage lines, rail, pipelines, telegraph wire) carry geomagnetically induced currents (GIC) into large transformers, which saturate and overheat. **Owner decision for the game:** unprotected electronics are *partly* fried (not all, not none), and a **Faraday room saves them**. This is not an EMP: a flare is slower, regional by latitude and ground geology, and mostly kills the grid and long-wired gear. See `emp.md` for the weapon.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Event | Figures | Lesson |
|---|---|---|
| Carrington Event, Sept 1 to 2, 1859 | Auroras seen in Cuba and the Caribbean; telegraph operators got shocks, papers caught fire, some sent messages with batteries disconnected (v, in `research_disasters.md`). The CME took about 17.6 hours to arrive (c). | A strong storm shows itself in the sky first. Long wire is the antenna. |
| Quebec, March 13, 1989 | Hydro-Quebec's grid collapsed in about 90 seconds; 6 million people off for about 9 hours (v). A large transformer at the Salem, NJ nuclear plant was damaged (c). | A G4/G5 storm can drop a grid faster than anyone can respond. Most return in hours; a few transformers are lost. |
| Halloween storms, Oct 2003 | Malmo, Sweden: about 50,000 customers off for 20 to 50 minutes; in South Africa about 15 transformers were damaged beyond repair weeks later (c). | Damage is delayed: transformers that cook slowly fail days or weeks after. |
| July 23, 2012 near-miss | A Carrington-class CME crossed Earth's orbit and missed by about 9 days (Baker et al. 2013, c). | It can happen with almost no notice; the sun does not read our calendar. |
| May 10 to 12, 2024 (Gannon storm) | The first G5 since 2003; auroras to Florida and Mexico; GPS-guided tractors lost precision during planting; no grid collapse (c). | Precision agriculture is the first thing farmers notice. The grid mostly held because utilities had warned and prepared. |
| Likelihood | A Carrington-class event is put at roughly 12% per decade (Riley 2012, c). | Rare, not fantasy. |
| Lloyd's of London, 2013 | A repeat Carrington would leave 20 to 40 million Americans without power for 16 days to 1 to 2 years, mostly in the northeast corridor; economic loss $0.6 to $2.6 trillion (v). | The range is huge. Design for wide variance. |
| Transformers | Large power transformers: 120 to 150 weeks to replace (v). | The tail is long. |

Geography: GIC is worst at high geomagnetic latitudes over resistive ground (Canadian Shield, New England, Upper Midwest, Pacific Northwest, parts of Appalachia and the northern Plains) and weaker over southern conductive coastal sediments (c). Long, high-voltage, single-path lines are the weak points.

## 2. Warning signs and how to notice them

Warning 1 to 3 days (`warn: [1, 3]`); the only scenario in this group with a physically real, exact clock.

- **T-72 to T-24 h:** NOAA Space Weather Prediction Center "G4 watch" then "G5 watch" on the weather radio and AM news. A sunspot group the size of a dozen Earths on the news. Utilities warn "preparing for possible outages".
- **T-18 h:** the radio signal on shortwave and AM starts to fade, ham bands go "dead" at noon (a radio blackout from the flare's X-rays). A text line on the dial: "Shortwave is nothing but static."
- **T-12 to T-2 h:** tractor auto-steer drifts; a neighbor with a GPS tractor complains. Compass needles wander. Phones show wrong time or location.
- **T-1 h to 0:** red and green auroras overhead, deep into the south. Telegraph-like crackling on any long wire (power lines hum, the electric fence ticks).
- **Final 15 to 60 minutes:** the DSCOVR/ACE satellites at L1 give a last alert. Only a player with a weather radio or ham gets it.
- **Player action:** open the main breaker, unplug the grid-tie inverter and the long-run electronics, move spares into the Faraday room, park the generator and fill tanks. A `Disconnect` action (research doc rule) before the impact removes the grid-tie fry exposure.

## 3. Phase-by-phase timeline

| Phase | World | Compound |
|---|---|---|
| **Hit** | Sky red and green; lights flicker, then the regional grid collapses in minutes; some substations arc and burn. | Grid dead. Grid-tied inverter, long-run electronics and the pump controller roll for damage (section 5). Day card: "The sky burned red. The power did not come back." |
| **First hour** | Telephone and cable lines hum; some fire alarms; GPS and radio noisy. Many cars still run. | A player who disconnected sees only silence. One who did not rolls dice on each piece. |
| **Day 1** | Grid-down baseline begins. Shortwave and satellite links are noisy but recover in hours to days. Satellites in low orbit see extra drag. | Cold chain, well pump on grid, as in `grid_down.md`. |
| **Week 1** | The government story is legible: "a solar storm; transformers will be replaced". Order holds longer than in other collapses (research doc). Crews inspect transformers: some fail late. | Waiting for restoration is the tension curve. Delayed failure: a second regional dip on day 3 to 6 as damaged transformers trip. |
| **Month 1** | Restoration follows damage: south and coasts first, the north and the long-line interior last. Lloyd's figures: 16 days to 1 to 2 years. | Neighbors' generators run out. The compound's lit window draws attention. |
| **Month 3** | Fate `full`: power back in towns; `partial`: rotating power; `never`: manufacturing queue plus a stressed supply chain. | Spares are the wealth: inverters, controllers, radios. |
| **Month 6** | Transformer imports, factory output prioritized. GPS and logistics stable. | Barter economy and watch groups. |
| **Year 1** | Patchy. Cities lit by priority; rural areas dark. | Re-optimization: keep islanded, or reconnect. |
| **Year 2+** | Replacement transformers arrive; a two-tier country. | Re-equipment with new spares from the market. |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks: grid falls to 0 instantly (floor 0 to 0.1) and returns over 60 to 730 days by region; fuel follows (pumps are grid powered); deliveries and stores fall like grid-down but slightly slower (trucks run on diesel on hand); phone 0 by day 2 to 3; banks 0 for 2 to 3 days, then partial cash-only; medical drops over 7 to 10 days; law holds longer: **start of drift at day 28**, not 14, because there is a clear cause and a promise (`C(28, 30, 0.35, ...)`).

Prices: market crash 30% (existing) hits the player's holdings, but with stores still on the shelf day 1 prices rise slowly, then x3 to x5 within a month. Shops: card terminals dead; cash and barter only; the hardware store sells out generators on day 1 (if not already). Barter: batteries, solar controllers, radios and fuses (replacement parts for fried devices) are the hot items. Neighbors: cooperative longer; a "county plan" (volunteer fire hall as a hub) forms around day 5. Raiders: low in the first 4 weeks, then as grid-down. Health: as grid-down; plus the **fried medical devices** (oxygen concentrators, insulin pumps) for neighbors. Food: as grid-down, plus **GPS-guided agriculture** disruption (a planting season partly lost for big farms; small farms unaffected).

## 5. What fails, what protects, the wealth principle

Owner decision: **partial fry**. Parameters (d), per piece of unprotected electronics at the hit:

| Equipment class | Fry chance |
|---|---|
| Grid-tied inverter, connected | 45% |
| Pump controller on the grid, connected | 40% |
| Long-run plugged devices (router, TV, radio on the antenna) | 30% |
| Unplugged, unprotected standalone gear (spare inverter in a box on a shelf) | 10% |
| Gear in a Faraday room (existing `hardening.faraday` tier) | `0.02`, `0.01`, `0` by tier (fraction fried, reuse `faradayShare` inverted) |
| Gear disconnected before the hit (the `Disconnect` action) | roughly one third of the connected chance |
| Vehicles | Not fried (unlike EMP). A flare does not fry cars; `v.emp` stays unused. |
| Transformer on your own line (if you own a pole transformer) | 15% damaged |
| Off-grid solar, battery, short DC runs | 3 to 8% |

Faraday rooms **save** spares and radios; unlike EMP, a Faraday room is not needed for vehicles because they are not hit. **The UI says so honestly:** "A flare cooks long wires, not engines. A metal room helps your radio, not your truck."

**Wealth principle.** Money in advance buys a metal-lined room, spare inverters and controllers inside it, a Disconnect plan (a transfer switch) and a disciplined drill; the wealthy compound loses nothing but the grid and keeps running on its own plant. The poor compound loses the grid, and each fried piece (inverter, controller, radio) is a repair that needs parts it cannot buy: it falls back on hand tools, wood, hand pump and candles. In both cases the hardest asset is **time**: the rich reconnect in an afternoon; the poor wait for the market.

## 6. Regional variation

Latitude and ground matter. Scale grid fall and recovery by a `gic` factor (d): New England 1.3, Upper Midwest 1.3, North Woods 1.4, Mountain West 1.1, Pacific Northwest 1.1, Great Plains 1.1 (long single lines), Rust Belt 1.2 (dense, old, close to the northeast corridor), Appalachia 1.0, Ozarks 0.8, Hill Country 0.7 (ERCOT islanded, south), Desert 0.6. A bad `gic` also lengthens recovery (`back` times multiplied by `gic`). Aurora appears farther south only if the storm is a G5; in the desert and Hill Country it is faint ("a pink smear to the north").

## 7. What the player sees and hears

Radio and day cards, all text:
- T-72: "NOAA issues a G4 geomagnetic storm watch." T-24: "Flare of a record class observed; CME headed for Earth."
- T-6: "Aurora forecast to reach Texas." T-1: "Satellite operators put craft into safe mode."
- Hit: "Power companies report cascading trips across the Northeast and Great Lakes."
- Day 2: "Shortwave bands recovering; GPS accuracy degraded."
- Week 2: "Utility: damaged transformers to be shipped; no dates."
- Month 6: "A factory in Pennsylvania delivers its first replacement unit."

Comms degradation: shortwave and ham bands go dark first (flare blackout), recover in 1 to 3 days; AM broadcast stays longer than cell; satellites drag but survive. A ham operator with a Faraday-stored radio is the only voice in the first week.

## 8. Player decisions and strategies

Disconnect or ignore; build the Faraday room before the warning (the only real answer with 1 to 3 days); stock fuel and water; decide whether to move spares into the room; keep long-run cables disconnected; learn that off-grid solar is largely safe; choose how to meet neighbors during the "waiting for crews" period.

## 9. What makes it fun and not just punishing

The 1 to 3 day clock is a **sprint**: a checklist of ten actions, a real race ("disconnect the inverter before the sky goes red"). Aurora is a beautiful moment (a day card, a screen tint). The government story keeps order, so the early months are about community-building, not defense. The partial fry makes the Faraday room a satisfying "I told you so" without making an unprepared player helpless.

## 10. Suggested parameters and the hook seam

| Variant | weight | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|---|
| g4 (new, weaker) | 3 | C(0,0,.1,[10,60]) | C(0,2,.3,[12,62]) | C(3,5,.3,[14,65]) | C(2,4,.3,[14,65]) | C(6,8,.5,[14,65]) | C(35,30,.6,[20,70]) | C(0,2,.2,[3,30]) | C(1,3,.2,[5,40]) |
| carrington (existing, tune) | 3 | C(0,0,0,[60,730],90) | C(0,1,.05,[70,740]) | C(2,6,.1,[80,750]) | C(1,2,.1,[80,750]) | C(5,12,.15,[80,750]) | C(28,30,.3,[90,760]) | C(0,2,0,[30,700]) | C(1,4,.1,[30,700]) |
| near_miss (aurora only, new) | 1 | none | none | none | none | none | none | C(0,1,.7,[1,3],1) | none |

Fate odds existing `[0.30, 0.42, 0.28]`; keep, but add the regional `gic` factor to `back`.

Hook seam:
- `onWarning`: schedule hint days at T-3, T-1, T-6 h (finer than the usual stage); aurora look tint; GPS error text; enable the `Disconnect` action.
- `onHit`: roll `fryChance` per class in the table; call an exported `empStrike`-style helper (WP1) with `scale = 'flare'` (partial) and `vehicles: false`; report lines "The inverter took the surge. The spare in the Faraday room did not."
- `daily` (day 3 to 6): delayed transformer failures, a second dip.
- `encounterWeights`: unchanged for 28 days.
- `priceMods`: gradual; batteries, solar controllers x3.
- `radioBulletins`: list above; shortwave blackout flag.
- `oasisWeights`: grid and phone double; aurora look.
- `buildingDamage`: none (maybe a 2% fire on a long-run transformer pole).

## 11. Chaining possibilities

- `lawless` 45% after 30 to 90 days (existing) if restoration lags.
- `financial` (the crash plus cash-only economy) after 30 to 120 days.
- `satellite_loss` is a sibling: a flare can degrade satellites and GPS (see `satellite_loss.md`) at the same time (weak chain 10%).
- `pandemic` (waterborne) in cities.
- Combine with `emp.md`: the same Faraday room serves both; explain the difference in the report card.
