# Scenario: asteroid (the impact and the impact winter)

Status: design only, no code. Existing kind `asteroid` (pulpy, unlockable): a long warning (90 to 200 days), then all tracks to near zero and a two-year dark. Today the impact does nothing locally (no blast, quake, wave or fire) per `docs/DISASTER_TEETH.md`. This doc adds variants, an **impact corridor** the player can see, local effects by distance, and reuses the winter engine in [ash_winter.md](ash_winter.md). Conventions in [README.md](README.md).

One line: **the only disaster you can see coming for months, and the only one where the map tells you whether to run.** The prep is a race, the hit depends on where you stand, and the winter that follows is the real killer.

## 1. Real-world basis and analogs

| Event | Figures | Use |
|---|---|---|
| Chelyabinsk, Feb 15, 2013 | About 20 m (65 ft) object, about 440-500 kilotons airburst at about 18-30 km altitude; flash brighter than the sun; the shock wave arrived about 90 seconds later; about 1,500 injured, mostly by window glass; about 7,200 buildings damaged; undetected beforehand (commonly cited) | `airburst` small end: a bright flash, a delay, then glass |
| Tunguska, Jun 30, 1908 | About 50-60 m object, 3 to 15 megatons, airburst at 5-10 km; about 2,000 sq km (800 sq mi) of forest flattened, an estimated 80 million trees; nobody nearby died; a northern-hemisphere night sky glow in Europe (commonly cited) | `airburst` large end: the regional blast |
| Meteor Crater, Arizona, about 50,000 years ago | About 50 m iron body, about 10 megatons, crater about 0.75 mi wide (commonly cited) | The `desert` ground-impact scale |
| Chicxulub, 66 million years ago | About 10-15 km body, a crater about 110 mi wide; global fires debated; years of dim sky from sulfate and dust and soot; about 75% of species gone; Brugger et al. and later work suggest several years of strong cooling (commonly cited) | The `extinction` variant (not a survival case; use as a tail) |
| 2008 TC3 | About 4 m; found 19 hours before impact over Sudan; the first predicted impact (commonly cited) | Hours of warning is real for the small ones |
| 2022 EB5 and 2023 CX1 | Found about 2 hours and 7 hours before burning up over the Arctic and the English Channel (commonly cited) | Same |
| 2024 YR4 | Found Dec 2024, about 130-300 ft; the impact odds for Dec 22, 2032 rose to about 3.1% in Feb 2025 (the highest recorded for an object this size), then fell to effectively zero on Feb 2025 follow-up; a small chance of lunar impact remained (commonly cited) | **The real model for the warning arc**: odds creeping up, then resolved |
| Apophis | About 340 m; passes Earth on Apr 13, 2029 inside the geosynchronous belt at about 20,000 mi (commonly cited) | Hype and public-opinion texture |
| DART, Sep 26, 2022 | A 1,200-lb spacecraft hit Dimorphos (about 520 ft) and shortened its orbit from 11 h 55 min to 11 h 23 min (about 32 min) (commonly cited) | **Deflection works if early**: years of lead time; the game can run a late deflection attempt |
| Survey status | About 95% of near-Earth asteroids 1 km or larger are found, none a threat in the next century; roughly 40-50% of the 140 m and larger class are found (commonly cited, NASA); NEO Surveyor planned for launch around 2027 | The warning realism: small ones can come out of nowhere |
| Torino and Palermo scales | Torino 0-10 hazard scale; "1: merits attention" up to "10: certain global catastrophe" (commonly cited) | The radio's vocabulary |
| Impact winter models | Toon, Robock and others: sooty and dusty stratosphere from a 1-2 km impact would drop the temperature by several degrees and cut sunlight for months to years; Cretaceous event much larger (commonly cited) | Winter severity scale |
| Fiction | *Lucifer's Hammer* (a comet), *The Last Policeman*, *Deep Impact*, *Don't Look Up*, *Seveneves* | Tone and social texture |

Not re-fetched this session; see README.

## 2. Warning signs and how the player notices

An impact is the one scenario with a **public, numeric, escalating warning**. Suggested `warn: [90, 200]` (existing; Hardcore x0.4 gives 36-80 days).

| Stage | Days to impact | Real basis | What the player sees |
|---|---|---|---|
| Discovery | -200 to -150 | A survey finds a new object; a Torino 1 | News: "Astronomers track a 1,400-foot object, odds 1 in 400." A slow news cycle, a joke |
| Odds creep up (the YR4 arc) | -150 to -100 | More observations tighten the orbit and the probability rises as the error ellipse shrinks | Radio: "1 in 50", "1 in 8". The compound sees **panic buying** wave 1; the price curve (existing `priceFactor`) |
| Confirmed | -100 to -60 | Once odds hit 100%, the **risk corridor** collapses to a swath and the **impact zone** is announced | The **corridor map** appears on the HUD and radio (see below). Officials: "impact in the North Atlantic" or "in the Great Plains" |
| Mitigation attempts | -80 to -25 | A kinetic impactor or a nuclear standoff; late attempts partly work (DART lesson) | A radio arc: "the interceptor launched", "contact in 31 days", then a result: **fate roll** in section 10 (miss, shift, fragment) |
| Public preparations | -60 to -10 | Evacuation orders for coasts, grounded flights, curfews, martial law in some places; "hammer parties" (Lucifer's Hammer) | Convoys on the county road, lines at the feed store, gas shortages, closed schools, preachers and parties; the neighbors' behaviors diverge (denial, quit job, build a cellar, leave) |
| Visible | -3 to 0 | A **comet** is visible for weeks; a rocky asteroid is **not visible to the naked eye** until hours before (2008 TC3 was a faint dot hours out) | `comet` variant: a smudge in the evening sky from -60 days; others: nothing, then a fireball. The game must not show a naked-eye smudge for the rock variants |

**The corridor.** From day -100, the HUD radio line gives a **risk corridor and a 3-band zone map**: Near (within 300 mi of ground zero: not survivable in place), Regional (300 to 1,500 mi: blast, quake, fire, tsunami on coasts), Far (over 1,500 mi: sky, supply, winter). The corridor **narrows each week**. The player sees where they are relative to it, so the **first decision is whether to move the family**; the sim already has `bugout.ts` and `bugoutRoute.ts`.

## 3. Phase-by-phase timeline

Variants (section 10): `airburst` (60-300 ft body, no crater, a regional blast), `ocean` (about 1,500-3,000 ft, an Atlantic or Pacific impact, tsunami, atmospheric dust), `land` (about 0.7-1.5 mi, a continental impact, fires and a winter), `comet` (a fragmenting long-period comet: several hits over days, a bright visible warning). The first row varies by distance band.

| Phase | In the world | At the compound |
|---|---|---|
| Hit moment | A **flash** brighter than the sun (visible 1,000+ mi); a thermal pulse that ignites anything flammable in the near zone; the shock wave travels about 1 mile per 4.7 seconds (sound speed), so it arrives in minutes: 250 mi in about 20 minutes, 1,000 mi in about 80. Ground shaking in a land impact arrives faster than the air blast | Far band: a silent second sunrise on the horizon, a bright cloud; a "get inside" order in the next minutes; **turn away and shelter** (the existing flash shelter logic for nuclear). The shock wave is a window-and-door roll |
| First hour | Blast wave, then a roaring wind (hurricane-force near, gale in regional), earthquakes (land: M7+ regional), a tsunami on the coast in 1 to 4 hours. Ejecta re-enters (land variant): the sky glows red, the air heats | Regional band: blast, wildfire, quake and wind rolls. Cellars and bunkers are safe from flash and blast; wooden buildings burn. Far: a pressure thump, then calm |
| Day 1 | Fires from re-entering ejecta (regional and far for the big land impact: the sky is a dull orange and thermal radiation can ignite dry fuel at distance; this is debated, but the game uses it as a "firestorm day"); phone and grid cut across the continent; the coasts devastated | Fire watch; the existing `wildfire` fuel map applies at x0.5 for far, x1 regional; smoke and ash fall (soot) |
| Week 1 | Dust and soot in the sky; black rain; temperatures fall; refugees from coasts and burned areas head inland; the government talks of "relief centers" | Neighbors flee in or out. Refugee camps. The raid cadence is up. The stored food and fuel matter |
| Month 1 | Light 30-60% of normal; a deep **cold** begins; grain and fuel supply chains stop; hunger riots in cities | Plant what you can; greenhouses; the winter engine starts |
| Month 3 | A hard "winter" with a dull sun; the airspace stays dark | Cold, then hunger; heating and food are the pillars |
| Month 6 | Food prices 3-5x; starvation begins in cities | The compound's stored food is the game |
| Year 1 | Crops fail across the north; a few warm patches in the south; trade collapses | Survival by stockpile and hunting |
| Year 2+ | The dust clears over 2 to 5 years (land and comet worst; airburst none; ocean mild); slow recovery | The new order: the compound as a village, if the family lives |

## 4. Effects by track, prices, neighbors, raiders, health

Track curves per variant (`C(at, fall, floor, back, ramp)`). The existing single `impact` variant sets every track to zero with no return; the proposal gives the **distance band** multiplier so that a Far-band run is not the same as a Near one.

| Variant (weight) | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|
| `airburst` (3), regional | C(0,0,0.2,[10,60],30) | C(0,1,0.3,[14,60],30) | C(0,2,0.3,[14,60],30) | C(0,0,0.2,[21,90],45) | C(0,1,0.4,[14,60],30) | C(1,10,0.4,[14,60],30) | C(0,0,0.2,[7,30],14) | C(0,1,0.3,[7,40],20) |
| `ocean` (2), far inland | C(0,0,0.1,[30,150],60) | C(0,1,0.1,[45,200],60) | C(0,3,0.15,[60,240],90) | C(0,0,0.05,[90,300],90) | C(0,2,0.25,[60,240],90) | C(2,20,0.2,[90,300],90) | C(0,0,0.1,[14,60],30) | C(0,1,0.1,[30,120],60) |
| `land` (2), far | C(0,0,0,null) | C(0,2,0,null) | C(0,3,0,null) | C(0,1,0,null) | C(0,3,0.05,null) | C(2,20,0.05,null) | C(0,0,0,null) | C(0,0,0,null) (existing) |
| `comet` (1) | as `ocean` but multiple dips over 7 days | | | | | | | |

Fate odds `[0.15, 0.40, 0.45]` for `airburst` and `ocean`, `[0.03, 0.17, 0.80]` for `land` (the world mostly does not come back inside the run).

- **Prices and shops:** warning: **an early panic curve** (existing `priceFactor`): food x1.3, fuel x1.5, ammo x2, generators x2, concrete, rebar, lumber, tarps, seed x1.5-2.5 by day -30; contractors booked out ("the build race"); the shop restricts to cash and card until a bank holiday; the Hardcore price factor stays 1.0 (DIFFICULTY.price). **Early building is cheaper**: the same wall at day -150 costs x1; at day -20, x2 plus a waiting list. After the hit: the usual `stores`-driven scarcity and `moneyWorks` false at once on land and ocean. A crash of 50% at the confirmation date.
- **Neighbors:** at the warning, neighbors diverge into **deniers, preppers, leavers and partiers**; some quit their jobs, some pay cash for your spare lumber; a few join your compound as fresh hands (the `joiners` mechanic) and bring skills and mouths. `neighborLife` increases hoarding and fear. After the hit: those in the regional band die or arrive as refugees.
- **Raiders and the encounter mix:** warning period: **early looters (the "I'll get mine" crowd)** appear from day -30, x1.3 cadence, but the law is intact and the sheriff is around; after the hit `law` collapses fast (existing `C(2,20,0.05)`), and `lawless` chains are not needed as the same curves apply. Refugee flows from the coasts: x2.5 in the first 2 months at the Midwest and Mountain West.
- **Health:** blast injuries and burns in regional; **eye damage** from the flash (do not look: a "turn away" choice at the hit; a real Chelyabinsk lesson was that people who went to the window to look were cut by glass); wind and flying debris; acute stress; later cold and hunger as in the winter doc; sooty-air respiratory for the first month; no radiation (unless a nuclear deflection failed: a **nuclear standoff burst** adds a small fallout chain, a flavor twist).
- **Food and water:** the winter engine; water is clean unless soot and ash contaminate open sources in the first weeks (use the supervolcano cover rule at 0.3 scale). Fires burn crops and pasture in the regional band.

## 5. Structure damage and what protects

Blast damage by **overpressure** at the compound (psi). For the game the Regional band maps to a hazard (probability a structure takes damage state >= 1); for `airburst` of about 3 megatons (Tunguska scale), 1-psi shatters windows to about 25-35 mi, 3 psi damages houses to about 10-12 mi, 10 psi destroys most to about 5-6 mi (scaling roughly as the cube root of yield; design estimate):

| Band (distance for 3 Mt airburst) | Overpressure | Effect on a house | Hazard (state >= 1) / mostly state |
|---|---|---|---|
| < 6 mi | > 10 psi | Total destruction of wood frames; severe for masonry | 1.0 / 3 (not offered in Surprise; the corridor puts the player outside) |
| 6-12 mi | 3-10 psi | Roofs blown off, walls collapse, glass everywhere | 0.7 / 2-3 |
| 12-25 mi | 1-3 psi | Windows broken, doors blown in, roof and chimney damage, light projectiles | 0.4 / 1-2 |
| 25-60 mi | 0.3-1 psi | Windows broken (Chelyabinsk-like), ceiling and plaster damage | 0.2 / 1 (glass) |
| > 60 mi | < 0.3 psi | Rattles and a few cracks | 0.03 / 1 |

A 1-km land impact has ground shaking (M7 to 9 equivalent), a ejecta blanket, and thermal pulse far wider; the ocean impact adds a tsunami with run-up of 100+ ft near the shore and dropping inland (a shore parcel only).

**What protects:** being **far** (the corridor); **earth cover** (bunker, root cellar, earth-sheltered or berm: x0.2); **small windows facing away from the blast** (windows facing ground zero break, others less: use the bearing; in the cut, a **blast direction line** on the Overlay); **shuttering** (metal storm shutters: -60% glass hazard); **low, wide, stone or concrete** buildings (x0.5), tall light buildings (x1.5); **roof ties** and framing (hurricane-tie tier x0.6, same as quake bolts); a **metal roof** (flies off in wind but does not burn: embers x0.3). For the flash: do not be outside with line of sight (flash burns on exposed skin up to a radius), a "cover" action. For thermal ignitions in the regional band, the **wildfire fuel map** (`d.fuel`) and the ember resistance model apply (stone/earth/steel shed); the 0-5 ft clean zone matters. Wind: `windstorm` rolls at 60-90 mph for a few minutes.

**Repair:** broken glass is the bulk (a window sheet is cheap but labor and supply-constrained); roof sheathing; a crew in a regional band is unavailable (they flee); a **rich** family with a stock of plywood, window film and a generator rebuilds in weeks; a **poor** family patches with tarps and plastic. Insurance excludes acts of war and often "space objects"; treat as `none` for the event (a clear loss), apart from fire.

## 6. Regional variation

Impact location is rolled at the confirmation date. The compound's band follows its distance from ground zero (`region` gives approximate position; map centers: PNW (47N, 122W), Mountain West (45N, 112W), Desert (34N, 108W), Plains (40N, 99W), Ozarks (37N, 92W), Hill Country (30N, 98W), Upper Midwest (44N, 87W), North Woods (47N, 91W), Rust Belt (40.5N, 80W), Appalachia (36N, 83W), New England (44N, 72W)).

| Impact zone (roll) | Bands | Notes |
|---|---|---|
| N. Atlantic (ocean) | Coastal east is wiped; New England, Rust Belt regional by wave and wind (up to 100 mi inland for a large tsunami is small; wind and rain from the cloud); Appalachia, Ozarks far; the west far | Tsunami only on coastal lots; the inland player needs not move |
| Pacific (ocean) | PNW coast hit by tsunami (a few hundred feet near the shore, tens of miles inland up river valleys); the west regional | PNW is the tsunami region; the player is told to move east or up |
| Great Plains (land) | Plains near; Ozarks, Mountain West, Upper Midwest regional (500 to 1,000 mi); the rest far | A land impact changes the breadbasket and the winter more |
| Gulf of Mexico (ocean) | Hill Country, Ozarks regional (the Chicxulub site is the Yucatan); Appalachia far | Texas coast hit |
| Airburst, random | A 30-mile circle; the chance a given compound is within 60 mi is under 1% in a continent-scale roll; use the corridor **rolled to include the compound's region** (so it plays) at 25% | The `bug out` choice matters |
| Comet fragments | Several hits along a track | A line of destruction; the player's side of it |

Region odds: all 0.6 except `mountain_west` 0.8 (large land); none special. The winter severity is from the winter doc's table (same regional frost-free days).

## 7. What the player sees and hears

- **Before:** the **corridor map** and the odds on the news; the sky is ordinary for rocks, **a growing comet** for the comet variant (a pale smudge in the evening sky that gets longer; the **hammer** feeling). Cars with luggage, a church parking lot full, a sign "The End Is Near". A military convoy.
- **Hit:** a **white-out flash** (a screen flash, text only; no audio), a silent beat, then a **long rumble card**; a mushroom-like **dust cloud** on the horizon; the **sky turns red**, then brown, then dark.
- **Sky and light (`collapseLook`):** day one orange-brown; days 2-10 a sooty gray-black with **black rain**; the sun a dim red disc for months; stars disappear; later cold, flat light. Existing `asteroid` profile (flash, dust, 2-year dark) stays.
- **Terrain:** flattened trees in the regional band, all pointing away from ground zero; fire scars; debris; a tsunami line and mud on a coastal lot; dust lying like ash (reuse the ash ground tint at 40%).
- **Radio and day cards:** "NASA: 100% probability. Impact zone: eastern Montana to western Nebraska, 14 August." "Governors urge evacuation of a 600-mile arc." "The interceptor failed to separate. Impact in 19 days." Day card: "A second sunrise in the east. Then the windows rattled for a minute. Nobody went to the window."
- **UI:** a countdown chip ("Impact in 41 days"), the corridor and band, the price panic indicators; no audio.

## 8. Player decisions and strategies

- **The big choice (stay in place, or move):** depending on the band, the player can move the whole family to a farther region (the `bugout` route; a vehicle, fuel, a destination, and the family's possessions). **Stay** wins in the Far band and in the Regional band with an underground shelter; **leave** wins in the Near and Regional bands without one. The corridor narrows, so the earlier you decide, the more uncertain; the later, the more jammed the roads (the real "late evacuation death" mechanic from Camp Fire).
- **The build race:** within 90 to 200 days the family can finish an **underground bunker, a root cellar, shutters, a second well, stored food for 2 to 3 years, a greenhouse, a wall**. Prices rise, so **early money is worth more**; a wealthy family buys everything on day one; a poor family buys the essentials and builds by hand. The player sees the cost curve.
- **Social choices:** take in neighbors who ask (fresh hands, extra mouths), hold a "last party", defend against early looters, share your bunker plan (or not).
- **Attempted deflection:** the news arc can fail or succeed; success reduces severity (a **fate**: `deflected` ends the scenario with a "the world cheers" card and a payoff of stocked goods and a fresh start; this is a fun, reportable outcome and rare, 5% under Cozy, 2% Standard, 0 Hardcore).
- **Rich vs poor:** the rich can fly or drive out of the corridor early and buy a second parcel in a Far region; the poor stay and build a root cellar with scrap and sweat. The poor family that **built the cellar and stored potatoes** beats the rich family that arrived at a jammed highway on day -3.

## 9. What makes it fun

- It is the **only prep-race scenario**: the clock is a number and every day is a spending decision.
- The **corridor map** is a distinctive, readable piece of information and a moral dilemma (leave or stay, take the neighbors or not).
- **Variant richness**: airburst (a sudden flash and a window-breaking boom), ocean (a tsunami), land (a long winter), comet (a sky show), and a **deflection fate** that can wipe the whole thing as a joyful ending.
- **Social texture**: the denial and the parties in the warning are fun to watch and play with, a sharper contrast to the quiet early game.
- A **long hopeful tail** (the winter engine) rather than an instant loss.

## 10. Parameters and hook mapping

### Numbers

- `warn: [90, 200]` (existing); corridor narrows by `x0.6` per 30 days; confirmation at `-100` (day card + price jump).
- Impact variant rolled at confirm: `airburst` 3, `ocean` 2, `land` 2, `comet` 1 (Standard); Cozy removes `land`.
- Deflection attempt: launched at day -70 to -30; success chance 12% (Standard), 25% (Cozy), 5% (Hardcore); partial (shift of impact point: **re-roll the zone** away from the compound's region with 40% when the roll lands) 25%; fail otherwise. A success ends the scenario with a milestone, a partial shifts the corridor.
- Overpressure table above; wind 60-90 mph for 5 min in the regional band; `windstorm` damage via `weatherThreats` hail-like rolls on roofs; glass hazard 0.4 within 25 mi.
- Panic prices: food x1.3 at confirm, x1.6 at -20, x2 at -3; materials x1.5/x2.2/x3; a shop **rations** at -10 (one per customer).
- Winter: `severity` 0.0 (airburst), 0.4 (ocean), 1.0 (land), 0.7 (comet), winter engine parameters from ash_winter.
- Refugee multipliers x2.5 in the first 60 days, then x1.3.
- Flash: standing outdoors facing the flash at the hit: an eye injury roll (30%) and a skin burn roll in the Regional band.

### Hook seam (`src/sim/disasters/asteroid.ts`, new `src/sim/impactZone.ts` pure)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Panic curves by date, a rationing rule, early-build discounts, market crash at confirm |
| Supply | `daily`, `onHit` | Winter engine; fires on crops; soot on open water |
| Raiders | `encounterWeights` | Early looters, refugee surge, `law` collapse |
| NPC | `daily`, `onWarning` | Denial, leaving, partying, joiners ask in; refugee flow |
| Sky | `look` | Corridor and comet, flash, red then black, black rain, dim sun |
| Infra | `onHit` | Per-band track floors; shock wave delay; wind |
| Bldg | `buildingDamage` | Overpressure bands (glass, roofs), wind, ignition via fuel map, tsunami on shore lots |
| Med | `medical` | Flash eye and burn injuries, blast, sooty-air respiratory |
| UI | `onWarning`, `radioBulletins` | Corridor map, odds, interceptor arc, countdown chip |
| Oasis | `oasisWeights` | Weight `stores`, `deliveries`, `grid`: a stocked, dug-in compound in a dark world |

Ten of ten columns.

## 11. Chaining

- **Into [ash_winter.md](ash_winter.md)** via the winter engine (always for `ocean`, `land` and `comet`).
- `wildfire` on the hit (regional band; p 1.0 at fuel-map x0.5 to x1), `dam_flood` (tsunami surge up a river valley on a PNW or Gulf lot, or quake-shaken dams, p 0.12), `mega_quake` in the regional band (a land impact's seismic wave: use the quake doc's structure model at MMI VII).
- `lawless` after the hit (existing curves; no extra chain), `pandemic` p 0.15 after [60, 200] days in refugee camps, `financial` first (the crash at confirmation).
- A **false alarm** (YR4-like) at 8% of runs in Cozy: the odds creep up, then drop to zero, leaving the player with a stocked compound and a land-price story: a gentle tutorial for preparedness (no loss, a milestone "The Scare").
