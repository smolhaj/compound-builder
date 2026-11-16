# Scenario: ash_winter (the volcanic winter, years 0 to 5)

Status: design only, no code. The existing kind `ash_winter` already has the climate half (growing season cut to a quarter for a year, wildfood halved, fish 0.6, refugees 2x, market crash 35%). This doc specifies the long phase after [supervolcano.md](supervolcano.md) and a **shared winter engine** that the asteroid and nuclear kinds can reuse. Conventions in [README.md](README.md).

One line: **the lights come back and the summer does not.** After the ash is shoveled, the sun is weak, frost comes in July, and the world's grain stores run out about the time the second bad harvest fails.

## 1. Real-world basis and analogs

| Event | Figures | Use |
|---|---|---|
| Tambora, Apr 1815 (VEI 7) and the Year Without a Summer, 1816 | Northern Hemisphere summer cooled by about 0.4-0.7 C on average, 2-3 C or more regionally; killing frosts in New England in June, July and August 1816; snow in June in Albany and Vermont; grain failures across Europe, with wheat prices roughly doubling; typhus and riots in Europe; about 71,000 deaths attributed (about 10,000 direct); migration out of New England to the Ohio country; Frankenstein written in a cold Swiss summer (commonly cited) | The baseline and the best-known analog |
| Laki, 1783 to 1784 (Iceland) | A fissure eruption releasing about 120 million tons of sulfur dioxide; a dry fog over Europe; Iceland lost about 20-25% of its people and most livestock; a hot summer and a brutal winter in Europe; about 23,000 excess deaths in England (commonly cited) | Sulfate fog and fluorine; a harsh first winter |
| Unknown eruption 536 AD and the Late Antique Little Ice Age | Tree rings show the coldest decade of the last 2,000 years; Procopius wrote that the sun "gave forth its light without brightness"; crop failures, then the plague of Justinian in 541 (commonly cited; Sigl et al. 2015, McCormick) | Multi-year dimness and the pandemic tail |
| Samalas, 1257 (Lombok) | One of the largest eruptions of the last 7,000 years; a global sulfate signal in ice cores, an early-year cool anomaly, famine records in Europe 1258 (commonly cited) | The recurring pattern |
| Pinatubo, 1991 | About 20 million tons of SO2 into the stratosphere; the Earth cooled about 0.5 C for 1 to 2 years (commonly cited, NASA) | The measured size of a big VEI 6 |
| Toba, about 74,000 years ago | A supereruption (about 2,800 cubic km); the claim of a "volcanic winter and human bottleneck" is **disputed** by recent archaeology in India and Africa (commonly cited) | Honest uncertainty: a super-eruption is a multi-year cold of several degrees, not a guaranteed extinction |
| Supereruption climate models | For a Yellowstone- or Toba-scale event, models give a global cooling of several degrees C (roughly 3-8 F up to well beyond) peaking in months 6-24, returning over 5-10 years; the range is wide because of aerosol microphysics (commonly cited, Timmreck et al.) | Design range |
| Nuclear winter (Xia et al., *Nature Food*, 2022) | Soot from a US-Russia war could cut global calories by about 90% by year 3 to 4; a smaller India-Pakistan war about 50% (commonly cited; the existing research doc cites it) | The shared engine |
| Global grain reserves | World cereal stocks about 3 to 4 months of consumption in typical years (commonly cited, FAO) | The famine clock |
| Export bans in a shortage | India's 2022-23 rice and wheat export limits; the 2008 rice export bans that doubled prices (commonly cited) | Trade stops first |
| Dust Bowl, 1930s | Drought, not volcanic, but the same lesson: a 5 to 10 year crisis recovered by stored seed, shelterbelts, relief, migration (commonly cited) | Pacing of the long years |

Not re-fetched this session; see README.

## 2. Warning signs and how the player notices

The winter has **no separate warning**; it begins as the eruption ends. The cues come as the ash clears:

- **Day 20-40:** the sun is a pale, haloed disk; shadows are soft; **the sky is a milky white** even in clear weather; red and violet sunsets for weeks (Krakatoa 1883, Tambora).
- **Early frosts:** a hard frost in a month that should not have one. Radio: "NOAA: July temperature anomalies of minus 11 F across the northern tier."
- **Thermometer reads:** a **degree-day ledger** on the day card (Fahrenheit anomaly vs the normal for the day).
- **Seed catalogs go quiet**: orders refused; the county extension agent holds a meeting on "what grows in 60 days".
- **Official reports:** the USDA crop report: "winter wheat 28% of normal"; the radio says to "plant fast-maturing varieties".

## 3. Phase-by-phase timeline

Timing is counted from the **end of the main ash fall** (about day 30 after the hit); the game's `hitAt` is the eruption day. For `asteroid` and `nuclear` the same engine starts at the end of the first dust and fire phase.

| Phase | In the world | At the compound |
|---|---|---|
| Month 1 (end of ash) | Cleanup under a dim sun. Power patchy, trucks run again with filters. Farms cannot plant: fields under ash | Plant what can be planted; the first **frost audit**: which crops are in the ground |
| Month 3 | Frost-free days in the north cut in half; the summer never warms. In the Mountain West and Plains: a growing season of 40 to 70 days; snow in June is possible | Greenhouse, cold frames and row cover decide the garden. Hay is short |
| Month 6 | The first harvest is a failure: yields 10-50% of normal depending on crop and region. Export bans. Prices rise 2x to 5x; grain from the south and imports shrink. Banks and credit freeze for farm loans | Eat from the storage. The first **winter** is early and long (Hardcore: -10 F colder than normal) |
| Year 1 | Frost in every month. Heating fuel burns 30-60% faster. Livestock culled in bulk (no feed). Starvation in poorer regions and countries; government ration cards and food lines in cities. Wildlife is hunted out by year 1.5 | Stored food and hay decide who lives. Hunting and fishing yield less. Fire wood: 5-10 cords |
| Year 2 | The second summer is cool but not frost-free; yields 30-60% of normal. Seed stocks run low; many farmers can't afford inputs. Slow trade recovery | A second winter. Seed saving is vital. Barter becomes the economy |
| Year 3 | Aerosols thin; the temperature anomaly is about -3 to -5 F; frost-free days 100 to 120 | Production climbs; surplus begins in the best-prepared compounds |
| Year 4-5 | Normal climate returns; ash-enriched soils (volcanic ash is a good fertilizer: Hawaii, Italy, the Pacific NW) give a boom harvest on the unburied land | The long-run payoff: fertile ground, empty neighboring farms, opportunity to buy land and expand |

## 4. Effects by track, prices, neighbors, raiders, health

The existing `yellowstone` curves keep recovery times of 60 to 500 days; the winter extends the **stores/deliveries/fuel** shock rather than the grid. Proposal: let `stores` and `deliveries` track the **food clock** (`foodStress`, a 0..1 value from section 10) instead of a fixed curve, so the world's grocery shelves reflect crop failure. Suggested floors by year:

| Year | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|
| 0 (months 2-12) | 0.5 | 0.3 | 0.15 | 0.2 | 0.4 | 0.35 | 0.6 | 0.4 |
| 1 | 0.65 | 0.45 | 0.10 | 0.2 | 0.5 | 0.3 | 0.7 | 0.4 |
| 2 | 0.8 | 0.6 | 0.25 | 0.4 | 0.6 | 0.4 | 0.8 | 0.6 |
| 3+ | back to 0.9-1.0 on a ramp | | 0.5 -> 0.9 | 0.6 -> 0.9 | | | | |

- **Prices and shops:** `priceMods`: flour, rice, beans, seed, hay, canned goods x2 at month 3, x3-5 at months 6-18, x1.5 at year 3 (the 1816 wheat doubling and the 2008 rice export shock as lower bounds). Fuel x1.8. Seed potatoes and quick-maturing seed (radish, spinach, kale, potato, oats, barley, rye) are the hot items; **tomatoes, corn and peppers fail**. `canOrder` needs deliveries and banks above 25%; the shop "restocks" on the stores track with **an agricultural inventory cap** (a seed rationing rule: one packet of each per customer).
- **Barter:** calories are money (grain, lard, flour, honey, sugar, canned meat), then fuel, then seed. Silver and ammunition hold value; paper money (already hit by the crash) less so.
- **Neighbors:** farmers fail first; the most prepared become **rivals or allies**; trades for seed potatoes; a neighbor offers land for food (distress sale). `neighborLife.hardship` follows `foodStress`; some neighbors starve or leave in year 2. Refugees from the northern Rockies and plains flood south (existing 2x) and the player's region gets 1.3x of them in year 1 at the Midwest and Appalachia.
- **Raiders and the encounter mix:** the base is the existing `law` track. Hunger raises raid cadence by `cadence x (1 - 0.5 foodStress)` and **shifts crew type to food raiders**: they target the pantry, the garden, the cellar and the herd rather than guns (existing `RaidFacts` loot prefers food, fuel, meds, water); more **hungry travelers and desperate neighbors** (a begging chain with parley), and a **cannibal-gang rumor** (a narrative line in the Ashfall tradition, not a mechanic). Winter itself suppresses raids on the coldest weeks (`DIFFICULTY.winter`).
- **Health:** hunger (body weight, starvation clock in `body.ts`), vitamin D and sunlight deficiency (rickets in kids; mood), cold injuries (`cold.ts` runs year-round now), scurvy in winter without stored citrus/rose hips/sauerkraut, pneumonia, a slow `pandemic` tail in cramped refugee towns.
- **Food and water:** the climate rule: **growing days = normal x f(year)** with f = 0.3 (year 0), 0.4 (year 1), 0.65 (year 2), 0.85 (year 3), 1.0 after. Crop-specific hardness: cold-tolerant (potatoes, cabbage, kale, oats, barley, peas, rye, turnips, beets) at x1.0; corn, beans, squash, tomatoes, peppers, melons at x0.2 to 0.5; orchard fruit fails on spring frost in most years 0-2 (the orchard is a long bet); **greenhouse** (the existing kits and polytunnels) holds a multiple: glass or twin-wall produces at about 60% of normal under dim light with a heater (fuel!), 25% unheated. Livestock: pasture is short, so **hay need x1.5 and a longer winter**; animals culled for meat. Wild game: hunted out by month 6 near towns; fish 0.6. Water is fine after the ash year, but frozen sources in a long winter need thaw fuel.

## 5. Structure damage and what protects

This phase is less about collapse and more about **wear and cold**:

- **Frost heave and freeze-thaw:** a colder, wetter year puts a +25% repair-clock penalty on exposed wood, a tax on flat roofs and foundation footings above frost depth (a real winter engineering issue; footings below the 4 ft frost line in the Mountain West are fine, shallow ones heave).
- **Heating load:** the stove's demand (existing `heating.ts`) x1.3 year 0-1 in the Mountain West, so **insulation and thermal mass** are payoffs: log, stone, adobe and earth-sheltered houses use less fuel; the lodge's stone basement; passive solar loses much of its input (the sun is weak): do not count on it.
- **Snow loads:** a heavier snow winter; **roofs that survived the ash must also hold snow** (the supervolcano roof load applies). A strained roof gets a daily check.
- **Greenhouses and polytunnels:** the film and kits get hail and snow damage; a **heated** greenhouse is a fuel sink. A bunker works as a grow room: LEDs need power (solar derated by the dim sky: -40% in year 0-1).
- **Solar:** output multiplied by `0.6` in year 0-1, `0.8` in year 2, `0.95` in year 3 (stratospheric sulfate and dust cut insolation; the Pinatubo drop was about 5-10% in direct beam, a supereruption much more). Micro-hydro (frozen in winter) and wind are better.
- **Repair and wealth:** the rich can buy heating fuel and seed in the first six months at 3x and **hold** land and stock; they pay for a heated greenhouse and extra stove capacity; the poor insulate by hand, gather deadfall, build earth berms, and rely on seed-saving. A frost-tolerant, stored, low-input compound outlasts a high-tech one whose fuel runs out.

## 6. Regional variation

Temperature anomaly in year 0-1 (design estimate; sources scale Tambora up by the aerosol load of a supereruption). Frost-free days left in year 1, from the existing `RegionDef.frost`:

| Region | Normal frost-free days | Year 1 (f = 0.4) | Year 2 | Notes |
|---|---|---|---|---|
| `mountain_west` | about 123 | 40-55 | 80 | Short season gets shorter; greenhouse is the only reliable fruit |
| `north_woods` | about 110 | 30-45 | 70 | Boreal: a one-month season; fishing and ice are good; wood is plentiful |
| `upper_midwest` | about 140 | 55-70 | 95 | Dairy and grain belt in trouble; cold-hardy crops work |
| `plains` | about 165 | 65-80 | 110 | Winter wheat and rye; ash plus cold; the breadbasket fails first, then the nation |
| `new_england` | about 130 | 50-65 | 85 | 1816 analog; stone walls and cellars; grass and potatoes |
| `rust_belt` | about 165 | 65-85 | 115 | Dense, hungry; cities empty |
| `appalachia` | about 180 | 75-95 | 125 | The most benign: long season and wood |
| `pnw` | about 215 | 90-120 | 150 | Maritime moderation; light ash; the best of the cold regions; greenhouse winters work |
| `ozarks`, `hill_country` | 210-240 | 90-130 | 150-180 | The refuge for the north; refugee pressure 1.5x; hunt and fish |
| `desert` | 200-250 | 90-130 | 150-180 | Cold nights and lost summer heat; irrigation dry (the existing drought); warm winters help |

Odds: ash_winter itself remains 1.5 in `mountain_west`; the winter phase's severity scales with the ash class in the supervolcano doc and a **global factor** (`yellowstone` 1.0; `vei7` 0.35; `asteroid` 0.5-1.5).

## 7. What the player sees and hears

- **Sky and light:** milky white overcast, a **pale solar disk you can look at**, **orange and violet twilight** and, in the best weeks, the strange green flash; colder color grading (cooler color temperature and flatter shadows) in `collapseLook` with a `dim` of 0.55 in year 0-1, 0.75 in year 2, back to 1.0 after. Short midday shadows. Faint **haloes** (Bishop's ring: a corona of ash around the sun, a documented 1883 effect).
- **Terrain:** frost in the garden in July; a **season color shift** (a brown-gray summer; leaves drop early, then trees leaf late); snow on the ridge in August; ice on ponds in June; deadfall trees (frost-killed) in year 2; ash-fertile green on cleared ground in year 4.
- **Crowds:** thin roads; lines at the feed store; people with sacks of seed; rationing queues with ID.
- **Radio and day cards:** "USDA: spring wheat planting canceled across North Dakota." "The state asks households to turn thermostats to 55." "Seed potatoes are limited to ten pounds per household." "The dollar is at 4,000 to the pound of flour" (hyperinflation chain). Day card: "Frost on the tomatoes in July. The potatoes are fine." Rumor lines: a cache of seed at the grain co-op.
- **Tone:** the emotional beat is the day in year 4 the first warm month arrives.

## 8. Player decisions and strategies

- **Food strategy:** deep storage (the winter is multi-year: store 2-3 years of calories, not 3 months), cold-hardy staples, a **seed bank** (open-pollinated varieties; seed saving), a greenhouse or two, a root cellar, a smokehouse, a milk goat or a few chickens and rabbits (fast-breeding protein), fishing, trapping, foraging; every acre of cold-tolerant crop planted fast.
- **Fuel strategy:** wood: 5 to 10 cords a winter, a wood lot with a cut plan; insulation first; stove efficiency; a **rocket mass heater** or masonry stove; keep one room warm.
- **Social strategy:** share seed and labor with neighbors (a co-op, `rules.ts` house rules at hamlet stage) or hold the line; the sell-your-land-for-food desperation of neighbors makes the strongest compounds large.
- **Stay or bug-out:** go to a more benign region (`pnw`, `ozarks`) only if you have the fuel and a destination; the bug-out wins if the region's frost-free days were already short; the player needs a **destination** (a relative, a purchased lot). A pre-positioned second parcel in a milder region (the land market exists) is the late-game rich-family play.
- **Rich vs poor:** the rich buy the food early (the price rises 2x to 5x), buy farmland in the south, and run heated greenhouses, so the fuel is their limit; the poor have frost-tolerant crops, firewood and barter skills, and survive on **seed and labor**. A rich family without storage and skills starves in year 2 behind a locked gate; a poor family with a root cellar and 2,000 lb of potatoes holds.

## 9. What makes it fun

- A **long arc with hope**: three bad years, then a boom, with visible milestones (first July frost, first full harvest) and a drive to out-grow the neighbors.
- **Meaningful farming**: crop choice, frost dates, greenhouse use and seed saving become the core skill game; the existing garden, orchard, herd and kitchen modules all matter.
- **Variety**: unlike a pure combat collapse, the hunger raid is a moral puzzle (share the pantry or not).
- **Relatable stakes**: real stories (1816, Laki) give day-card text with the weight of history.
- **A satisfying end**: the ash-rich fields and the empty neighbor farms the player can buy.

## 10. Parameters and hook mapping

### The shared winter engine (`src/sim/winter.ts`, new, pure)

A `WinterState` (`sunDim`, `coldF`, `growFactor`, `solar`, `foodStress`) is a function of days since the winter began and a `severity`:

- `growFactor(t) = 1 - (1 - fMin) x curve(t)`, with `fMin` 0.15 (supereruption), 0.35 (VEI 7), 0.10-0.30 (asteroid); `curve` rises 0 -> 1 over months 1-6, stays 1 until month 12, then decays with a half-life of 14 months.
- `coldF(t)`: peak anomaly -10 F (year 0 summer, supereruption), decays with a half-life of 14 months; winter anomaly is half the summer value.
- `solar(t) = 1 - 0.4 x curve(t)`; `sunDim` drives `look`.
- `foodStress(t)` = clamp((1 - growFactor over the last 12 months) x (1 - storedShare) + hoardingPressure, 0, 1); drives `priceMods`, `encounterWeights`, `hardship`.

`ash_winter`, `asteroid` (land and ocean variants) and `nuclear` (exchange) call it with their own `severity` and start date. This replaces three separate one-off hooks.

### Hook seam (`src/sim/disasters/ash_winter.ts` plus `src/sim/winter.ts`)

| Column | Hook | Teeth |
|---|---|---|
| Econ | `priceMods` | Food, seed, hay x2 to x5 on `foodStress`, fuel x1.8 |
| Supply | `daily` | growFactor on every crop, greenhouse multipliers, hay need x1.5, game and fish scarcity, frost kill events |
| Raiders | `encounterWeights` | Food raiders, hungry travelers, parleys; cadence by `foodStress` |
| NPC | `daily` | Neighbors fail, sell land, ask for seed; refugee flow by region |
| Sky | `look` | `sunDim` and cold grading, halo, violet twilight, frost |
| Infra | `daily` | `solar` derate; fuel use of stoves; snow roof loads |
| Bldg | `buildingDamage` | Frost heave, snow on already-strained roofs, greenhouse film loss |
| Med | `medical` | Hunger, cold, vitamin D, scurvy, pneumonia |
| UI | `radioBulletins` | USDA and anomaly reports, rationing, price lines |
| Oasis | `oasisWeights` | Weight `stores` and `deliveries` strongly: a stocked, lit, warm compound reads as an oasis in a hungry world |

Ten of ten columns.

### Numbers

- `growFactor` and `coldF` as above; solar 0.6 year 0-1, 0.8 year 2, 0.95 year 3.
- Heating fuel x1.3 (year 0-1, Mountain West scaled by `RegionDef.cold`).
- Starvation: a person needs about 2,000 kcal/day (3,500 for labor in cold); the existing `body.ts` loop applies; Cozy still warns first.
- Price index: food x(1 + 3 x foodStress), seed x(1 + 4 x foodStress).
- Ash fertility bonus: year 4+, +15% yield on ash-covered (1 to 6 in) soil, -50% if buried more than 12 in.

## 11. Chaining

- From `supervolcano` (always), `asteroid` (land and ocean variants), `nuclear` exchange (already has its own winter; migrate it onto the engine).
- Into `lawless` (existing 0.4 chain), `financial` (hyperinflation variant p 0.2), `pandemic` (hungry refugee towns, 1 to 3 years in, p 0.15), `civil_war` (the Cascade Compact vs Plains Alliance over grain, p 0.1, owner-gated).
- `drought` can stack: a dry year after the ash makes the season worse; a prior drought makes the winter worse (stored food is lower).
