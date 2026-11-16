# Scenario: wildfire (the fire front and the burn that follows)

Status: design only, no code. Existing kind `wildfire` (variant `front`, warning 2 to 6 days, a short grid/phone/stores dip, fate odds 92% full return) is the **best-implemented building-damage disaster in the game**: `effectsDay` rolls `burnChance(fuelNear, emberFactor(kind), emberK)` once per finished structure on day 0, bunkers, root cellars and stone/earth/steel spared, neighbors' houses burn 40x near, insurance pays. This doc keeps that core and adds what `docs/DISASTER_TEETH.md` lists as missing: **smoke illness, evacuation pressure, a multi-day fire, and the aftermath (burn-scar floods, water, salvage, rebuilding)**. Conventions in [README.md](README.md).

One line: **hours of warning, minutes of front, and the outcome was decided by materials, spacing and clearance chosen years before.** The best teacher in the set because every choice is visible.

## 1. Real-world basis and analogs

| Event | Figures | Use |
|---|---|---|
| Camp Fire (Paradise, CA), Nov 8, 2018 | 85 dead, 18,804 structures destroyed, about 153,000 acres; spread of about one football field per second at the start in 50-mph wind; embers spotting a mile or more; evacuees trapped in gridlock on Skyway; the town's population fell from about 26,000 to under 5,000; benzene found in water lines after (commonly cited, Cal Fire/IBHS/NIST) | Core analog: embers, single road, water systems |
| Marshall Fire (Boulder County, CO), Dec 30, 2021 | About 1,084 homes destroyed in suburban Louisville and Superior in about 6 hours; winds to 100 mph; grass fire in winter after a dry fall; 2 deaths; about 35,000 evacuated (commonly cited) | The grass-fire winter analog; `plains` and `mountain_west` front range |
| Lahaina, Aug 8, 2023 | About 100 deaths (the final count was revised from 115) and about 2,200 structures; downed power lines and a wind event from a passing hurricane; evacuation road jams and failed sirens (commonly cited) | Wind-driven fire in grass; sirens; roads |
| Black Saturday, Victoria, Feb 7, 2009 | 173 dead; the Australian "stay and defend or leave early" doctrine was reconsidered; people who left late died in cars (commonly cited) | Leave-early rule |
| Great Fire of 1910 ("the Big Burn"), Idaho and Montana, Aug 20-21 | About 3 million acres in two days, 85 dead (78 firefighters); the origin of US wildland fire suppression policy (commonly cited) | `mountain_west` and the cabin-in-the-woods analog |
| Peshtigo, Oct 8, 1871 (Wisconsin) | Perhaps 1,200 to 2,500 dead; a firestorm; the deadliest US fire (commonly cited) | `upper_midwest` analog |
| Cloquet-Moose Lake, Oct 12, 1918 (Minnesota) | About 450 dead; slash and dry fall (commonly cited) | `north_woods` analog |
| Gatlinburg (Chimney Tops 2), Nov 28, 2016 | 14 dead, about 2,500 structures; a drought fall and 80+ mph wind driving fire into a resort town (commonly cited) | `appalachia` analog |
| Bastrop County Complex, Sep 2011 (Texas) | About 1,660 homes in the Lost Pines; drought (commonly cited) | `hill_country` analog |
| Smokehouse Creek, Feb 2024 (Texas Panhandle) | More than 1 million acres, thousands of cattle killed, 2 dead (commonly cited) | `plains` analog: the winter grass fire and ranch loss |
| Hermits Peak/Calf Canyon, 2022 (New Mexico) | About 340,000 acres; started from escaped prescribed burns; burned hundreds of homes; later flooding on the scar (commonly cited) | `desert` highlands analog |
| Labor Day fires, 2020 (Oregon) | East-wind fires ran west into the Cascades' west slopes; around a million acres, thousands of homes; towns like Detroit and Gates burned (commonly cited) | `pnw` analog: wet side burns in an east wind |
| Embers and homes (IBHS, Calkin) | Embers cause up to 90% of home ignitions; the 0-5 ft zone ("Zone 0") has the clearest benefit; the second dimension is building-to-building spread within about 30 ft; metal roofs, ember-resistant vents (1/8-in mesh) and noncombustible siding reduce loss (commonly cited, research doc) | The rule set |
| Burn scars and debris flow: Montecito, Jan 9, 2018 | After the Thomas Fire, about half an inch of rain in minutes triggered debris flows, 23 deaths, 100+ houses destroyed (commonly cited) | The aftermath flood |
| Post-fire water | Benzene and VOCs from melted plastic pipes in Paradise, Santa Rosa (Tubbs 2017) and Boulder County; lines flushed or replaced over months to years (commonly cited) | The well and the plastic line |
| Smoke | Sept 9, 2020 "orange day" in the Bay Area; Jun 7, 2023 New York AQI over 400; AQI above 300 is "hazardous" (commonly cited) | Smoke and air quality |

Not re-fetched this session; see README.

## 2. Warning signs and how the player notices

Existing `warn: [2, 6]` days, Hardcore x0.4. Sequence of hints (existing text kept):

1. **Season and weather**: a dry year, a red flag warning, a wind forecast, a dry-lightning night (`lightning_fire` weather already exists). Radio: "RAWS station reads 4% humidity."
2. **A smoke column** on the horizon; ash falling; an orange noon sky.
3. **Utility actions**: the co-op announces a public safety power shutoff (`grid` dip).
4. **Evacuation levels** (Ready, Set, Go): the county posts levels in sequence and a **zone map**; the compound is in a zone.
5. **A scanner line** (radio): "jumped the highway", "spotting a mile ahead".
6. Optional: a neighbor's truck pulling a horse trailer past.

**New decision window:** each level opens a choice. *Ready*: prepare (hose out, clear gutters, move propane, pack the go-kit). *Set*: load the family and the stock (livestock trailer; documents). *Go*: leave now or **stay and defend** (only with the full kit, see section 5).

## 3. Phase-by-phase timeline

Timeline uses the existing `front` variant extended into a **multi-day fire** (1 to 7 days, wind shifts each day).

| Phase | In the world | At the compound |
|---|---|---|
| Hit moment | The front arrives, typically in the evening or night when winds peak; embers rain ahead of the flame; the sky is red and black; power out; cell congested; the county road gridlocks with evacuating traffic | The **fire roll** (existing `burnChance`) per structure, plus ember and radiant rolls; stay-and-defend vs gone: those who stayed fight spot fires with the pump and hose |
| First hour | The front passes in 5 to 40 minutes; flames 50-150 ft in timber; the fire burns structures from ember accumulation for hours; fire crews triage and skip houses that cannot be saved; roads closed | Spot-fire work: wet the roof and wall, put out ember piles, check the woodpile; the bunker as a **last-resort refuge** only if sealed or filtered (CO and smoke killed people in Australian bunkers) |
| Day 1 | A smoldering, gray burned landscape; flare-ups; new fire fronts as the wind shifts; smoke at hazardous levels 100+ miles downwind; evacuation orders remain | Mop-up: hot spots, stumps, roots burn underground for days; patrol with a hose; do **not** drink from the well until checked if the pump line burned |
| Week 1 | Roads reopen by permit; power crews replace burned poles; the burned zone is a ghost landscape; **looters** target the evacuated zone; insurance adjusters; the Red Cross shelter at the fairgrounds | Return and assess; a returning family finds what is left. Neighbors burned out ask for shelter. Smoke persists in the valley |
| Month 1 | Temporary power; water boil or "do not drink" advisories where plastic lines burned; debris removal bidding; hazard-tree crews drop dead trees; rains begin | Cleanup; tear-out; hazard trees threaten the roof and the road; start rebuilding; a **salvage** window opens for fire-killed timber |
| Month 3 | **Burn-scar flooding** in the first heavy rain (runoff increases by 10x to 100x or more on hydrophobic soil); debris flows below steep burned slopes; culverts fail | New `dam_flood` flash-style event at small scale: the road and the creek crossing; the compound's drainage works (existing `drainage.ts`, `retaining.ts`) matter |
| Month 6 | Winter: snow on bare slopes; avalanches or mud; hay prices high because pasture burned | The compound rebuilt or not; insurance paid (months) |
| Year 1 | **Morel flush** the first spring after a fire (commercial pickers, a cash crop); fireweed; elk and deer return to new growth; erosion; permits take 9-18 months | A burn-rebuild; cheap burned neighbors' land |
| Year 2+ | Regrowth; hazard trees fall for years; the next fire has less fuel here (a `fuel` reset to low for 8-15 years); the town rebuilds smaller | The compound is safer and charred land is cheap and fertile |

## 4. Effects by track and the rest

Existing curves are short. Proposed adjustments:

| Variant (weight) | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|
| `front` (existing, 3) | C(0,0,0,[10,40],10) | C(0,1,0.3,[10,30],10) | C(0,2,0.4,[10,30],10) | C(0,1,0.2,[10,30],10) | C(0,1,0.6,[7,30],14) (smoke cases, burn injuries) | C(0,3,0.7,[10,30],14) (stretched, evac duty) | C(0,1,0.3,[5,20],5) | unchanged (add C(0,1,0.7,[5,14],7)) |
| `firestorm` (new, 1: Camp, Lahaina scale; a town and its roads gone) | C(0,0,0,[30,120],30) | C(0,1,0.1,[20,60],20) | C(0,1,0.1,[20,60],20) | C(0,0,0,[30,90],30) | C(0,1,0.3,[20,60],20) | C(0,3,0.4,[20,60],20) | C(0,0,0.1,[14,45],14) | C(0,1,0.4,[10,30],10) |
| `dry_lightning_season` (new, 1: weeks of fires, smoke only) | 0.6 (shutoffs) | | | | | | | |

Fate odds `[0.92, 0.07, 0.01]` stay.

- **Prices and shops:** `priceMods`: N95/P100 masks, air purifiers, hoses, pumps, sprinklers and fire barrels x2 in the warning; gas x1.3 (evac); hotel rooms, storage and trailers, nothing for rent; after the hit, lumber and roofing x1.3 for 8 weeks (the Paradise rebuild: crews and permits); hay x2 in a burned grazing county; insurance premiums x1.5 for the next year, with non-renewal at high-risk parcels (Standard: an option; a "fair plan" at a high price).
- **Neighbors:** the existing 40x near-fire house-burn rolls stay. Add: neighbors **evacuate** (they leave the map for the first 1-7 days: `status: 'away'`), some do not return; those burned out ask to stay (hosting), those whose horses and cattle are loose ask for pasture and a gate. Some are killed on the road (Camp, Lahaina): a **late evacuation** roll for neighbors with a single road: 1 to 3% each.
- **Raiders and the encounter mix:** `encounterWeights`: an evacuated zone attracts **looters** (x1.8 cadence in the burn zone for 2 weeks while `law` holds at 0.7; roadblocks and checkpoints in the first week reduce this); `looters` on the player's compound only if the family left it empty; refugees (burned-out) and **contractors, adjusters and scammers** after; no gangs (fate 92% full).
- **Health:** **smoke** is the new teeth: an `aqi` factor from the fire distance and the wind; AQI above 150 gives respiratory complaints; above 300 hazardous (kids, elderly, asthma, heart): a daily `smoke` exposure meter like ash and radiation; N95 reduces about 95% when fitted; HEPA air cleaners and a sealed room (a DIY box fan filter) help. Burns, smoke inhalation at the front, CO in a closed bunker, exhaustion and heat in the defend task. Mental load after losing a home.
- **Food and water:** smoke-tainted produce (wash it), the well: **the pump, the pressure tank and the plastic line burn** (existing `well_drilled` pump house burns; the bore survives); **do not drink until flushed and tested** (benzene if PEX/PVC melted) a 2-4 week boil-water analog; cistern lids melt; roof catchment contaminated with ash for the first rains (discard the first flush); livestock burned or sickened by smoke; grazing lost (hay need up for 1 to 2 years: feed bought at x2); the garden under ash; the root cellar survives.

## 5. Structure damage and what protects

Existing model (`effects.ts`): `burnChance(near, emberFactor(kind), emberK)` where `near` is the fuel clearance measured by the world, `emberFactor` the building class, `emberK` the housing style (stone, earth, steel shed embers), `well_*` pump houses mostly spared, bunkers and root cellars exempt. Keep. Proposed additions (all via `buildingDamage` and the `fx` bag):

1. **Layered rolls instead of one:** ember (roof, vents, siding, Zone 0), radiant/flame contact (fuel within 30-100 ft), and **building-to-building** (a burning structure ignites any structure within about 30 ft at a chance by the target's siding and window type; clustering helps defense but hurts here: a real trade-off from the research doc).
2. **Damage states:** 0 sound; 1 scorched (siding, deck, windows; repair $500-2,500 and 3-10 person-days); 2 roof or one side burned (`knockBack` to roof or walls); 3 burned to the foundation (`burnStructure`); stone and masonry keep their walls at state 2 (existing).
3. **Zone 0 (0-5 ft):** gravel or bare soil gives x0.4; bark mulch or woodpile against a wall x2.0; a wood deck attached x1.6 (the deck fire). **Gutters** full of needles x1.5.
4. **Vents:** 1/8-inch mesh vents (`ember vent` upgrade) x0.6. **Roofs:** metal or tile Class A x0.25; asphalt shingle x0.7; wood shake x2.5. **Siding:** fiber cement, stucco, stone x0.4; wood and vinyl x1.0 and x1.3. **Windows:** tempered, double pane x0.7 (radiant heat breaks single pane).
5. **Defensible space (30 to 100 ft):** thinned and limbed trees (`Clearing` chore) x0.5; ladder fuels and brush x1.0; dense timber to the wall x2.0 (existing `near` value). **Water:** a cistern or pond plus a pump (gas or solar with a battery) and hoses and sprinklers lets the family **stay and defend** (reduces the roll by 50% for the defended buildings, at a **death risk** to people outside during the front: 2% per person-hour at the front, 10% at a firestorm, zero for a family that left); a **fire barrel** and rake kit keep spot fires small after.
6. **Egress:** two exits (gate onto the county road plus a ranch track) halve the late-evacuation roll; a single one-lane road with a bridge at risk of blockage (existing `roadFx` bridge) doubles it.
7. **Bunker:** sealed or filtered air intake required (existing bunker systems and the hatch sealing); otherwise CO and smoke risk 5% per person-hour of the front. A **clear hardstand** (a cleared ring, a pond, a gravel pit, a plowed field) is a safe zone for people and animals.
8. **Fuel breaks and prescribed fire**: a before-the-season **burn** (a labor task) cuts fuel in a patch for 3-5 years; mismanaged burns can escape (Hermits Peak): 2% per burn on a windy day, with a loss event.

**Repair and wealth.** Money buys: Class A roof, vent upgrade, siding, pump, sprinklers, cleared acreage, a crew for the clearing, a second home to flee to, insurance (premium dear) and **after the fire**, crews and permits ahead of the queue (Paradise: 9-18 month permit waits; the sim's permit waits `DIFFICULTY.permits` apply). The poor clear by hand over years (a chainsaw and a chipper rental), keep the woodpile 30 ft away, mesh the vents themselves ($40), and flee early. Insurance: standard homeowner policies cover fire; after a major fire the **non-renewal** rolls start; a burned house pays out the structure (months), with a **replacement cost shortfall** (demand surge) of 10-30%.

## 6. Regional variation

Existing `RegionDef.odds` for `wildfire`: `mountain_west` 2.0, `appalachia` 0.6, others 1. Proposed:

| Region | Odds | Season and fuel | Notes |
|---|---|---|---|
| `mountain_west` | 2.0 | Jul-Oct; ponderosa/fir, beetle-kill, cheatgrass | Crown fires; the 1910 and East Troublesome (2020) analog; **long evac** on one road |
| `pnw` | 1.4 (east-wind autumn) | Sep-Oct on the west slope; Douglas fir | Wet-side fire in an east wind (2020); heavy smoke; mudslides after |
| `desert` | 1.3 | May-Jul pre-monsoon; piñon-juniper, grass | Fast grass fire, flash floods after |
| `plains` | 1.2 | Feb-Apr and Aug; grass | Wind-driven, fast (Smokehouse Creek); cattle losses; low structure count but huge acreage |
| `hill_country` | 1.2 | Aug-Oct, drought; cedar | Bastrop analog; cedar "gasoline trees" |
| `ozarks` | 1.0 | Mar-Apr, Nov; oak leaf litter | Moderate; a spring fire season |
| `appalachia` | 0.8 (fall; was 0.6) | Oct-Nov leaf litter and drought | Gatlinburg analog |
| `upper_midwest`, `north_woods` | 0.8, 0.9 | Spring and fall; jack pine, slash | Peshtigo, Cloquet analogs; blowdown fuel in Boundary Waters (1999) |
| `new_england` | 0.4 | Spring (Maine 1947) | Rare; the 1947 fires burned about 200,000 acres across Maine |
| `rust_belt` | 0.3 | Spring | Small; mine fires burn underground (Centralia) |

The `chain` from `drought` (35%) stays.

## 7. What the player sees and hears

- **Sky and light:** the existing `wildfire` look (orange sky, ash fall, a red sun at noon). Add: an **AQI haze that varies by wind**, a red-brown sun disk, a **glowing ridgeline** at night with discrete flame fronts moving, a **pyrocumulus** column, embers streaming past in the wind (particles), burned black ground with white ash, standing black trees (fire-killed, "snags"), a smoke-hung dawn, green shoots after rain and fireweed in year 1.
- **Terrain:** a burn scar mask on the terrain texture (existing `fuel` map). A bare, **hydrophobic** slope; gullying after rain.
- **Crowds:** a line of evacuating trucks and horse trailers on the county road; a bulldozer line; helicopters (text); roadblocks; fire engines. Neighbors with garden hoses.
- **UI:** an **evacuation level chip** (Ready/Set/Go), an AQI chip, a wind arrow, a fire perimeter on the map overlay (terrain overlay fire layer already exists), a "who is where" list for the evacuation.
- **Radio:** "Evacuation order for zones 4 and 7." "Highway 93 closed from mile marker 40 to the pass." "Air quality: hazardous. Stay indoors." "Power to the east side is out for a public safety shutoff." "The fire is 20% contained." Later: "Boil-water advisory for the Mill Creek system; benzene found in service lines."
- **Day card:** "The wind turned at four. The Mortons' barn is a chimney. Your gate stayed shut."

## 8. Player decisions and strategies

- **Before (the real game):** the 0-5 ft zone, the metal roof, mesh vents, the gutters, the clearing chore, a cistern with a pump and hoses, the second exit, the livestock evacuation plan, a go-bag, documents, a **pasture or pond as a hardstand**, spacing between buildings, a woodpile far away, an air-purifier room, a stock of N95s.
- **At the warning levels:** pack, move livestock and vehicles first (a trailer takes time), **leave early** (Black Saturday and Camp both teach this), or stay and defend only with a real kit and a clear head; the player sees a death-risk estimate before choosing.
- **Stay vs bug-out:** leave if the roads are one-way and the fire is within 12 hours; the family may come back to nothing; the compound can be given up and rebuilt (insurance and a second parcel are the safety net).
- **After:** the order of work: wells and water, hazard trees, mud prep, temporary shelter, salvage timber, rebuild.
- **Rich vs poor:** the rich harden early and win the fire, then they have an expensive fire-rated house and a premium; the poor have a cleared yard and a 30 ft gap and sometimes win. A rich house with a wooden deck against a fir hedge loses to a poor house with gravel. Time: the rich rebuild in 4-8 months, the poor in a year.

## 9. What makes it fun

- **Every choice is visible**: a house that stood among burned neighbors is a vivid reward for the clearing chores.
- **The tension of the levels**: Ready/Set/Go is a countdown you can read and a loading puzzle (what to save).
- **The sunrise after**: the "the cleared ground saved it" card already exists; extend it with named losses and saves.
- **A hopeful aftermath**: salvage logs for the log-house blueprint (free logs from fire-killed pine, usable for about a year before blue-stain and bark beetles), the **morel** flush and cheap burned land to buy and rebuild, plus the neighbors' gratitude.
- **Variety by region**: grass fires fast and wide, timber crowning, cedar in the Hill Country, east-wind fires on the wet side.

## 10. Parameters and hook mapping

### Numbers

- `warn: [2, 6]` (existing). Level durations: Ready 40% of the warning, Set 40%, Go 20% (at least 4 hours).
- Fire length: `front` day 0 only (existing); `firestorm` 1 day plus 2 mop-up days; `season` 5 to 30 days of smoke with 1 to 3 front days.
- `burnChance` inputs unchanged; add ember vent x0.6, roof class factors above, Zone 0 factors, building-to-building 0.35 per burning neighbor within 30 ft (x0.6 stone sides).
- Stay-and-defend: requires pump (gas or solar with battery), 200 ft of hose per building, 500 gal cistern per building (a pond works), two adults; halves the roll; a person at the front has a hurt chance of 6% per hour and a death chance 0.5% (2% in firestorm).
- Late-evacuation death roll: 1.5% per person if they leave after Go + 1 hour on a single road, 0.2% if they leave at Set.
- Smoke: `aqi` = 40 + 300 x exp(-distance_mi/25) x windFactor; hospitalization chance per vulnerable person per day above 250: 3%; N95 factor 0.05.
- Post-fire flood: 25% per heavy-rain day for 90 days on slopes over 20% below the burn; debris flow on creek parcels; reuse the `dam_flood` stage logic at 15% scale.
- Salvage logs: +2 saw logs per burned conifer within the family's work radius, decays 50%/yr; morels: a 60 to 120 lb flush in spring year 1 on 20+ burned acres, $15 to $25 a lb at the barter market (design estimate).
- Water: do-not-drink flag 14 days if plastic line burned or 3 days if only a pump house; test kit $50.
- Insurance: premium x1.5 for 3 years after a claim; non-renewal 20% on `mountain_west`/`pnw` parcels with a prior burn.

### Hook seam (`src/sim/disasters/wildfire.ts`)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Masks, pumps x2; lumber x1.3 after; hay x2; insurance premium effects |
| Supply | `daily` | Well contamination flag, smoke-tainted garden, hay need, salvage logs, morels |
| Raiders | `encounterWeights` | Looters in the evacuated zone, scammers and adjusters, refugees |
| NPC | `onHit`, `daily` | Neighbors evacuate and return, die on a one-lane road, ask to shelter or pasture |
| Sky | `look` | AQI haze, glowing ridge, embers, burn scar, snags, fireweed |
| Infra | `onHit`, `roadFx` | Evacuation gridlock, closed roads, bridge risk, power poles, plastic water lines |
| Bldg | `buildingDamage` | Layered ember, radiant, building-to-building; defend and Zone 0 factors; post-fire flood re-roll |
| Med | `medical` | Smoke exposure meter, burns, CO, heat and exhaustion |
| UI | `onWarning`, `radioBulletins` | Ready/Set/Go chip, AQI, perimeter, advisories |
| Oasis | `oasisWeights` | A green, standing compound beside a black valley; weight `grid` plus a "burned neighbors" count |

Ten of ten columns (currently 4 to 5).

## 11. Chaining

- **From `drought`** (existing 35% after [60, 200] days); from `heat dome` and `ash_winter` (dead forest; dry lightning), `mega_quake` (gas fires, p 0.15), `asteroid` (the regional band, p 1.0 at half fuel), `grid_down` (a downed line start in dry wind, p 0.05), and `solar_flare` (none).
- **Into:** `dam_flood` (burn-scar debris flow, p 0.25 after [30, 240] days; the Montecito and Hermits Peak pattern), `drought` feedback (hay and water loss), `financial` via uninsured losses (p 0.04), `lawless` only on a `never` fate (1%).
- A second fire in the same season (p 0.1): the first reduces local fuel, so the compound is safer.
