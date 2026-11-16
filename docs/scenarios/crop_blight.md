# Scenario: Crop blight and pest plague (`crop_blight`, new kind)

Design doc, not code. Status today: **not built**. `docs/DISASTER_TEETH.md` section 4 item 2 proposes it ("Nobody's shelves go empty at once: the harvest fails county by county"), and WP7 reserves `src/sim/disasters/blight.ts` and `src/sim/blight.ts`. What exists to hang it on: the yearly `famine` threat (`threats.ts`; `climate().grow *= 1 - 0.35 * famine`), the field model in `crops.ts` (potatoes, dry beans, wheat; rotation; hybrid / heirloom / saved seed; "the same crop twice running pays for it: blight in the potatoes, bean beetle, wheat rust"), the orchard (`orchard.ts`), the garden, `herd.ts` and `livestock.ts` feed and hay, and `climate()` in `effects.ts` (ash winter, asteroid and drought already scale `grow`).

Evidence tags: **(verified)**, **(commonly cited)**, **(design)**.

The thesis: **the slowest disaster in the game and the one with the longest memory.** Nothing is destroyed. The lights are on, the trucks run, the roads are open, and there is simply *less food* every month, in a way that rewards what the player built in peacetime (seed diversity, storage, a cellar, animals, a second crop family) and punishes the monoculture, the hybrid-seed-only, the "I'll buy it at the store" player. It is also the scenario in which the **neighbors are the threat**: no one needs to be a villain to be dangerous when the fields fail.

---

## 1. Real-world basis and analogs

| Analog | Figures | Lesson |
|---|---|---|
| **Irish Great Famine, 1845-52** | Potato late blight (*Phytophthora infestans*) hit in Sept 1845; a third to a half of the 1845 crop lost, then 1846 almost total. About **1 million dead** (famine and fever) and about **1 million emigrated**; Ireland's population fell from about 8.2 million (1841) to about 6.5 million (1851) and kept falling for a century. About 3 million people depended on the potato almost entirely (commonly cited; Kinealy, Ó Gráda). Irish grain and livestock **kept being exported** under market and policy rules; relief was late, with soup kitchens (1847), workhouses and "Black '47". | A single-crop dependence plus a single pathogen plus a policy failure. Typhus ("famine fever") and dysentery killed more than starvation. Emigration (coffin ships) is the real exodus. |
| **1816, the Year Without a Summer** | After the April 1815 eruption of Tambora (VEI 7), a summer cooled by about 1-2 F globally and more regionally; New England had frost in every month, snow in June (Vermont, New Hampshire, Maine) and a **failed corn crop**; Europe had a wet cold summer and a harvest failure; prices of grain roughly doubled or more in parts of Europe; emigration from New England to Ohio and the Midwest surged; riots in Europe (commonly cited; Klingaman, Wood). | A **climate** variant of the same disaster: not a pathogen, a cold year. It is the crop blight's cousin and chains from `ash_winter`. |
| **Southern corn leaf blight, 1970** | About **15% of the US corn crop** lost (about 1 billion bushels' worth, roughly $1 billion) because about **85%** of hybrid corn carried the same Texas male-sterile cytoplasm (T-cytoplasm), susceptible to race T of *Bipolaris maydis*; some Southern states lost 50%+ (commonly cited; National Academy of Sciences 1972, "Genetic Vulnerability of Major Crops"). | **Genetic uniformity is the vulnerability.** The game's hybrid-vs-heirloom seed split is exactly this lesson. |
| **Wheat stem rust (*Puccinia graminis*)** | Epidemics in the US northern plains in 1904, 1916, 1935 and **1954** (about 40% of durum and large losses of spring wheat); Norman Borlaug's resistant dwarf wheats (Green Revolution). **Ug99** (a race found in Uganda 1998-99) overcame the Sr31 resistance gene that protected much of the world's wheat; it has spread across East Africa, Yemen and Iran; about 90% of world wheat varieties were susceptible when found (commonly cited; CIMMYT, FAO). | A real, current, slow-moving threat: rust spores ride the wind, and **barberry** (the alternate host) was eradicated across the Midwest in a federal program from 1918. |
| **Rocky Mountain locust, 1874-77** | A swarm over Nebraska in 1875 was estimated at 198,000 square miles, 1,800 miles long and 110 miles wide and an estimated 12.5 trillion insects (the 1875 swarm, Lockwood; commonly cited, estimates vary); crops in Kansas, Nebraska, Missouri, Minnesota and the Dakotas eaten to the ground; the federal Congress and Army (Fort Snelling relief) responded; the species went extinct by 1902. Desert locusts in East Africa 2019-20 (about 70 times larger than any in 25 years in Kenya; FAO). | A **pest plague** arrives from the sky on a wind and eats everything green in days: no pathogen clock, a pure race. Smoke, trenches and burning (period remedies) have game analogs. |
| **Bengal famine, 1943** | About 2-3 million dead; the trigger was brown spot fungus on the rice crop plus a cyclone, wartime exports and hoarding; "food availability decline" was a fraction of the cause (Sen, *Poverty and Famines*, 1981). | The decisive failure is **distribution and policy**, not only yield. |
| **Panama disease / Gros Michel banana** | Race 1 wiped out the Gros Michel export banana by the 1950s; replaced by Cavendish, now threatened by TR4 (commonly cited). | A monoculture dies; the replacement is also a monoculture. |
| **Dust Bowl and grasshoppers, 1930s** | Drought plus grasshopper plagues stripped fields in the Plains; the federal government ran poison-bran programs (commonly cited). | A multiyear grind; and the plains are the region that feeds the nation. |
| **Global food shocks** | 2007-08 and 2022 grain price spikes (Ukraine); Venezuela 2016: 74% of adults lost an average of 19 lb (verified in `research_disasters.md`, 8.7 kg). | What a modern country does when yields fall: price spikes, export bans, hoarding, riots. |

Calibration: **the blight is a 2-3 year event**. Crops fail in a growing season; the first real hunger comes at month 6-9 (the winter before the next harvest). The player's compound can ride it only if it had stored seed and calories. The world's death toll is not modeled directly; the shelves, prices and *neighbor behavior* are.

## 2. Warning signs and how the player notices

Warning is 30-120 days for the pathogen and pest variants (the first sightings come in a growing season), but the **climate variant** (cold year) gives only the *spring frost in June* as its tell. Standard: 60-90 days; Cozy x1.6; Hardcore x0.4.

| Stage | Signs | How the player notices |
|---|---|---|
| Early | "A strange wilt in potatoes in a neighboring state." "Extension agents ask farmers to report black stems." A seed company recall. The feed store raises seed prices. | The **extension agent** (a recurring NPC; a seasonal card) visits and says what to watch for. The player can inspect their own plots (the Farm tab) and see a "spots on lower leaves" indicator weeks before the yield loss: **scout your fields** (a labor task; Farming skill makes it earlier and more accurate). |
| Middle | "The Dakotas report rust on 30% of spring wheat." "Grasshopper counts up 4x." Commodity futures up 25%. The grain elevator stops contracting. Neighbors start buying seed early and canning. | Prices of grain and seed rise (priceFactor on staples and seed, x1.3 then x1.8). Radio farm report at 12:15 (the local ag broadcast tradition): market prices and field reports. |
| Late | "Emergency declared in three states." "Federal crop insurance adjusters in the county." "Dark cloud on the horizon, moving north." | In the pest variant, a **cloud on the horizon** the day before. In the pathogen variant the first lesions on the **player's own plants**, then the county's. |

Key notice-ability rule: **the game tells the truth about diversity.** The Farm tab shows each field's *variety* and *line vigor*, and a "genetic monoculture" warning if 100% of fields are the same hybrid or the same crop family. A player who ignores it sees why in the report.

## 3. Timeline (Standard; pathogen variant `wheat_rust` or `late_blight`; the pest and climate variants differ in section 5)

"Hit" = the first season in which the failure reaches the county (usually late spring to midsummer). The harvest is the clock: the effect is felt at harvest, not at the hit.

| Phase | The world | The compound |
|---|---|---|
| **Hit moment** | A county agent's call: "It's here." Headline: "The blight has reached the county." Prices of seed and staple foods jump 30%. | A gate card: "Plant what you saved or buy new seed?" Fields show lesions; the choice of treatment (copper fungicide or sulfur if the player has it; removing infected plants). |
| **First hour** | Calls between farms. A crop-duster plane flies low. | Take a **field inspection** action; mark infected plots; burn the diseased material (labor). |
| **Day 1** | The elevator pauses buying wheat; the store sells out of seed potatoes. | Apply any treatments; pick early what can be picked; decide which fields to abandon. |
| **Week 1** | Neighbors in tight spots: "The Hendersons lost their whole potato crop." Federal crop-loss relief is announced (`full` fate) or not. Roadside stands vanish. | Early harvest of what is salvageable at a reduced yield. A first **neighbor request** for seed. |
| **Month 1** | The county's harvest is 40-70% down (variant dependent). Food prices up 40-80%. Wheat flour rations at the store. Farmers hold their own seed and refuse to sell. Grain trucks are hijacked once (a rare event). | The harvest comes in short: at Standard, wheat yield x0.45, potato x0.30 (late blight), beans x0.85 (the legume crop is spared), orchard x0.9 (unless a fruit-specific variant), garden x0.7. The pantry is the buffer. |
| **Month 3** | Autumn: bread lines in the county seat; schools serve fewer lunches; the store sells *rice and beans* only. Livestock feed (grain and hay) is dearer; **animals are sold or slaughtered early** (a glut of meat, then a shortage). | The compound counts its calories ("food days" on the compound board). The player decides whether to **cull animals** or buy hay at triple price. The seed question for next spring becomes pressing: **save the seed or eat it**. |
| **Month 6** | Winter. The real hunger starts; neighbors who relied on the store come asking; some people leave for the city or the coast. Prices at 2-3x. Fuel and the grid are fine, the **barter market** for calories is the hot one. | The most dangerous period: the compound that stored 12 months is a visible target (**fortress reputation** and the lights matter: a lit house with smoke from the chimney and a plump family is a tell; see stealth). |
| **Year 1** | Spring: planting with the seed that survived. If the pathogen persists in the soil (late blight overwinters in tubers; stem rust overwinters in the south and blows north each spring), the second harvest is partly lost again. Resistant lines and imported seed appear in the market at huge prices. | Choose varieties: resistant seed (expensive), heirloom (which may have been lost), mixed planting (the cure). Crop rotation matters (the existing rule that the same crop twice pays for it). |
| **Year 2+** | The disease becomes endemic or fades; policy recovers (`full`) or the thinner world persists (`partial`). The land has changed owners (some farms foreclosed; land cheap: `sim/land.ts`). New varieties spread. The "year of the blight" becomes a story and a name for the generation (the chronicle). | Long-term: the seed bank the compound built is a source of income and prestige; the player trades seed to neighbors. A dynasty-level moment: "the family that fed the valley." |

## 4. Effects by system

### 4.1 Service tracks

Unlike most scenarios, **the tracks barely fall**: `grid`, `fuel`, `phone`, `banks` and `law` stay near 1.0 for months. Only `stores` and `deliveries` (food) fall, and slowly. This is the *design point*: the scenario is felt in the food and the prices, and the oasis contrast is the pantry.

Proposed variants (curves in `C(at, fall, floor, back, ramp)`):

| Variant | Weight | What it is | Tracks |
|---|---|---|---|
| `late_blight` | 3 | Potato and tomato family (Irish). Cool wet years; spreads with rain; 30-90% loss of potatoes, tomatoes, peppers in season; orchard unaffected. | stores C(40, 120, 0.55, [300, 600], 120); deliveries C(60, 120, 0.7, [300, 600], 120); medical C(180, 120, 0.85, [400, 800], 90); law C(150, 150, 0.8, [400, 800], 90); banks none |
| `wheat_rust` | 3 | Stem rust (Ug99-like) hits wheat, barley and oats; on the plains, 40-80% loss; flour is the item. | stores C(30, 100, 0.5, [300, 600], 120); deliveries C(45, 100, 0.65, [300, 600], 120); law C(120, 150, 0.75, [400, 800], 90) |
| `locusts` | 2 | A pest plague: any green crop, any garden, grass (so hay and pasture) in a week; passes; may return in 2-3 years. | stores C(5, 30, 0.45, [200, 450], 90); deliveries C(10, 30, 0.6, [200, 450], 90); law C(60, 120, 0.8, [300, 600], 90) |
| `cold_year` | 1 | 1816: a cold summer, frost in July, corn and beans fail, hay short; chain from `ash_winter` or Pacific volcanism; a **climate** effect not a pathogen. | stores C(60, 150, 0.4, [400, 800], 150); deliveries C(80, 150, 0.55, [400, 800], 150); fuel C(120, 100, 0.8, [400, 800], 90) |
| `seed_failure` | 1 | A monoculture / seed-stock failure (1970 corn): one hybrid line fails across the nation; every farm that bought certified hybrid seed is hit; heirloom and open-pollinated are fine. | stores C(20, 80, 0.5, [300, 600], 120); deliveries C(30, 80, 0.65, [300, 600], 120) |

Other tracks keep `back: null` only in the `never` fate; otherwise they recover over 1-3 years.

### 4.2 Prices, shops, barter

- `priceFactor` for **staples, seed, flour, potatoes, bread, feed, hay** rises on a **food-specific curve** rather than only the generic stores/deliveries read: x1.3 at warning, x1.8 at the first short harvest, **x3 at month 6**, x2 year 1, x1.3 year 2 (Standard). Non-food (tools, fuel, medicine) barely move: the scarcity is selective, which is itself a kind of felt difference vs. grid-down.
- **Seed**: seed prices triple; "certified blight-resistant" seed appears at $60 a bag (x4) with a limited stock; heirloom seed exchanges appear (the barter market).
- **Store behavior:** a "limit 1 bag" sign; rice, beans, lentils and oats available longer than wheat and potatoes (imports and the long supply chain).
- **Cash still works** (banks fine). Exchange rate collapses *only for food*: gold, ammo and tools buy less flour than ever: **a calorie economy** emerges (the barter market lists everything in kcal-equivalent).
- A **financial** side effect: farm foreclosures, land cheap (land sales `land.ts`); a rich player can buy neighbors' fields (an ethical dilemma: it makes you a landlord of hungry people).

### 4.3 Neighbors

- The neighbors are **the scenario's emotional engine**. Households have a food reserve; at `stores` < 0.6 and pantry < 60 days they ask for help; at < 30 days they steal (a `looters` of neighbors, "the Hendersons' son was seen at the fence at 2 a.m."); at < 10 days they leave (`gone`).
- Hardship hits them first: `neighborLife.hardship` reads `stores`; a new field `foodDays` per neighbor drives: asks, trades, theft, departure.
- **Mutual aid cards:** seed exchange (the player gives or sells saved seed: bonds and reputation), community garden, grain pool, soup kitchen (the 1847 analog: a **soup kitchen** buildable at the gate that feeds 20 people on 30 lb of grain a day; the *fortress reputation* drops but bonds rise; a Quaker-style moral high).
- Wealthy neighbors **hoard**; ex-farm-families who sold their seed regret it.

### 4.4 Raiders and the encounter mix

- **Hunger raiders** appear after month 4 and peak month 6-9: families, not gangs (`refugees` x1.8, `looters` x1.3 from month 5; weights shift from armed gangs to **desperate crews** with `temper: desperate` (see `crewMercy.ts`), more open to talk (`negotiation.ts`)).
- **Crop-theft raids** at harvest: raiders go for the field and the granary/cellar, not the house; **night-watch in the fields** (a duty) matters. A new encounter opener: "a wagon at the edge of the north field at dusk."
- **Grain-train/truck hijacks** appear on the road (`roadTraffic`, `countyCrossings`): a lean cargo on the highway.
- **Refugee wave** toward the compound: people walking from the dry or blighted regions; **seasonal workers** (existing joiners) ask for work for food: a major labor source.
- `trader` stays at 1.0 for non-food, 0.5 for food.
- Law track stays high until month 6 then slips (food riots).

### 4.5 Health, food and water

- **Calories first, then micronutrients.** A fall in variety brings scurvy (vitamin C, with potatoes lost), pellagra (corn-only diets: niacin; real, South 1900-1940), rickets and goiter in winter. The existing `needs.ts` kcal model gets a **variety score** (design): a family on 100% wheat for 3 months loses condition and immunity (illness chance +25%).
- **Famine fever:** typhus and dysentery from crowded, hungry people (`medical.ts` dysentery, existing), at +40% when the compound shelters more than 8 outsiders.
- Water is unaffected (except in the locust variant: nothing).
- **Livestock.** Hay and grain scarce: the herd is the compound's *bank*. Animals eat what people could; **the dilemma is real**: feed the goat or the child? An existing hay-and-pasture module already has condition, hunger and death at zero.
- Starvation timeline for the player to feel: -10% condition per week at < 70% calories; weakness (work output x0.7) at 3 weeks; severe at 8 weeks (existing `cozy starvation` rule).

## 5. Disease, pest and exposure mechanics

This scenario has no human disease engine, but it has a **crop-disease engine** modeled like the pandemic's (small, deterministic, bag state).

### 5.1 The field model (`src/sim/blight.ts`, pure)

Per crop family a `susceptibility` and a `pressure(t)` (0-1) from the variant:

- **Families:** nightshades (potato, tomato, pepper), grains (wheat, barley, oats, rye), maize, legumes (dry beans, peas), brassicas, orchard (apple, pear, plum), pasture and hay.
- **Pressure curve:** a bump through the growing season: `pressure = peak x exp(-((day - mid)/w)^2)`; `peak` 0.9 `late_blight` at the humid regions, 0.8 `wheat_rust` on the plains, locust 1.0 for 8 days then 0.
- **Yield multiplier** for a field: `y = 1 - pressure x susc x (1 - protect)`, with `susc` by family (late_blight: nightshades 1.0, others 0.05; wheat_rust: wheat 0.95 and oats 0.7, barley 0.8, others 0; locusts: everything green 0.9, root crops 0.4 because the tubers survive, grain in the head 0.6 if late, stored grain 0; cold_year: maize 0.8, beans 0.5, wheat 0.35, potatoes 0.25, orchard 0.5, hay 0.6).
- **`protect`** is a sum, capped at 0.8, of the player's measures:

| Measure | Effect | Cost |
|---|---|---|
| **Genetic diversity** (≥3 varieties of the crop; heirloom or saved lines) | +0.25 (the single best measure; the 1970 lesson). Hybrid seed gives only its existing "a third less hurt by blight and rust the year it is sown" for *non-novel* strains and **none** against the novel one in `seed_failure`. | free if planned |
| **Resistant seed** (bought at a premium) | +0.45 for the named pathogen, 0 for others | $40-60 a bag, scarce |
| **Rotation** (not the same family as last year; existing rule) | +0.15 | free |
| **Scouting and early removal** (Farming skill ≥ 3, a daily scouting task) | +0.15, and warning lead +10 days | labor hours |
| **Fungicide** (copper sulfate or sulfur; Bordeaux mixture is a real period fix for late blight, discovered 1885) | +0.3 for pathogen variants, 0 for the pest; needs a sprayer or a bucket | $15-30 per field |
| **Spacing, drip, row cover and netting** (netting stops locusts partially: +0.3 on a garden up to 1,000 sq ft) | +0.1 to +0.3 | labor and materials |
| **Fire, smoke, trenches** (period remedies for locusts: burning straw smudge, ditches with a lip that trap hoppers) | +0.2 on a field vs nymphs only | labor; smoke gives away your place (stealth) |
| **Poison bran bait** (the 1930s remedy) | +0.4 vs hoppers, kills birds and dogs if mishandled | $20 a field; a hazard card |
| **Polytunnel / greenhouse** (existing buildable) | +0.5 on protected crops against locusts and cold, +0.3 against blight | the build |
| **Early harvest** | gets a fraction out before the peak | lost yield |

- **The soil carries it over.** Late blight overwinters in tubers left in the ground; stem rust in the south and arrives with the wind each spring; locusts lay eggs and **return** (year +1 hatch with 50% of the pressure). So next year's `pressure` is `0.6 x` this year's unless the player rotated, sanitized and used resistant seed. The `blight` fx state tracks `soilLoad` per field (0-1).
- **Seed saving** is the strategic core: keep back seed from healthy plants (existing `Seed` rule: "never more than 40% of a day's crop"), **a seed bank** (a root cellar shelf with a labeled box; the new milestone from DISASTER_TEETH: "seed-saving milestone") that survives even if a whole year fails. Hybrid saved seed has vigor x0.8 (existing), heirloom keeps its line.

### 5.2 The "contagion" at the gate (non-human vectors)

- **Vectors:** *Infected seed potatoes and straw* brought in by trade or by a neighbor are how a clean compound loses the crop: a **purchased bag of seed has a 10-25% chance of carrying the pathogen** during the epidemic (design) unless sourced from a vetted neighbor. A traveling trader's hay can carry rust spores (a risk on trade encounters).
- **Contaminated tools and boots:** moving between fields without cleaning (a labor setting).
- **Quarantine** (a "seed quarantine" patch away from the main fields, planted 30 days earlier as a test plot) catches a bad seed lot: an analog of the pandemic's quarantine cabin.

### 5.3 Stored food as the buffer, and its enemies

The thing that matters in month 6 is the **pantry**: grain in sealed buckets (with oxygen absorbers: real), dry beans, rice, potatoes in the cellar (`root_cellar`, existing), canned goods, smoked meat, an orchard's dried fruit. Enemies of storage: rodents, weevils, mold (damp cellars), and *theft*. Add: **a granary with rodent proofing** (a buildable; a cheaper metal bin) and a **cat** (pets).

## 6. Regional variation

The 11 regions and their odds for `crop_blight` (proposed; add `crop_blight` and `locusts` keys to `RegionDef.odds`).

| Region | Odds | Most likely variants and notes |
|---|---|---|
| Mountain West | 0.8 | `cold_year` (short seasons: a frost in July is a disaster at 6,000 feet); `locusts` and grasshoppers historically strong in the Rockies (1874-77); few potatoes; hay is the critical crop, and a short hay year kills herds. Irrigation lowers the pathogen pressure (dry). |
| Appalachia | 1.1 | `late_blight` (cool wet mountains, a famous potato disease region); gardens and corn are the base; heirloom seed culture (Appalachian seed savers: `heirloom` yield bonus x1.2 here). |
| Desert Southwest | 0.6 | `locusts` (Desert locust analog in the Sonoran: lower odds); irrigated alfalfa and chile; low pathogen pressure; the real hazard is monocultured irrigated lands. |
| North Woods | 1.0 | `late_blight`, `cold_year` (the 1816 analog: short season); wild food (existing `wildfood`) is the net: berries, fish, moose. |
| Great Plains | 1.8 | `wheat_rust` (the 1954 and 1935 analogs, Ug99 on the horizon), `locusts` and `seed_failure` (hybrid corn); **a nation's breadbasket**: when the Plains fail the *whole country* feels it; the player is at the epicenter and the neighbors are farm families with big stocks and big debts. |
| Pacific Northwest | 1.0 | `late_blight` (wet), `cold_year`; salmon and shellfish; orchards (apples) spared. |
| Upper Midwest | 1.4 | `seed_failure` (hybrid corn belt), `late_blight` in Michigan and Wisconsin potato country, `cold_year` after volcanoes. |
| New England | 1.3 | `cold_year` (the 1816 home region), `late_blight`; stone walls and small plots; an old tradition of root cellars and saved seed (heirloom bonus); the coast has seafood. |
| Ozarks | 1.0 | `late_blight`, `locusts` (southern Missouri was in the 1870s zone); wild game strong. |
| Hill Country | 0.9 | `locusts` (Texas had plagues), `wheat_rust` less (not a wheat region); drought-linked: chain with `drought`. |
| Rust Belt edge | 1.0 | `late_blight` and imports: dense population, not much farmland: food scarcity sets in earliest and hardest in the cities; the compound is a target for urban refugees (x1.5). |

## 7. What the player sees and hears (text only)

- **Radio: the farm report.** A daily 12:15 market-and-weather segment is a signature: "Soft red winter wheat up 48 cents on the Chicago board." "The extension office in Dodge City reports stem rust in 60% of fields." "State officials ask farmers not to move straw." Later: "Rationing begins at supermarkets: one bag of flour per family." "The governor has asked the National Guard to protect grain elevators."
- **News beats:** "Bread riot at the county seat." "The mill has closed: no grain to grind." "A farm auction at the Kessler place: the sale barn is packed and nobody is bidding." "The Quaker meeting opens a soup line."
- **Day cards:** "Lesions on 3 of your 5 potato rows." "Seed potatoes: $0.90 a pound, up from $0.25." "Neighbors in need: 2." "Food days at home: 214."
- **Visuals** (`collapseLook` profile): fields in yellow-brown, **gray-black stems**, flat light, a rust-orange haze on wheat fields in the rust variant, a **dark cloud and a rustling hum** for locusts (visual only), and the pale, patchy gardens of neighbors; *no smoke* from the neighbors' chimneys if they run out of wood; a lone cow standing in a bare pasture.
- **Report card:** yield by field vs. expected, seed saved, varieties planted, food days at each month, neighbors fed or turned away, "the choice that mattered most", plus an honest "monoculture risk" line.

## 8. Player decisions and strategies; rich vs. poor

### Decisions

1. **Plant diversity in peacetime** (the pre-hit choice that decides everything): three varieties per crop, rotation, a legume year, heirloom seed in the jar. The game must make this visible and rewarding early.
2. **Scout and treat** (labor and money) or **gamble**.
3. **Seed vs. food**: save the seed from the good plants even when the family is hungry.
4. **Feed the animals or cull** (a bank of calories on four legs).
5. **Buy grain at triple price or hold the cash** for the winter.
6. **Help the neighbors** (seed, a soup line) and gain a bond, or hold the pantry; the fortress reputation and the hunger raids.
7. **Expand**: buy foreclosed land and become a landlord; take in seasonal workers; start a seed business.
8. **Move**: the compound can move calories by trade or hunt (existing hunting, fishing; `wildfood`).

### Rich vs. poor

| | Rich | Poor |
|---|---|---|
| Before | Buys a year of bulk grain and freeze-dried food at pre-panic prices; resistant seed in advance; a polytunnel; a seed vault; a granary. | Has the garden and the habit; saves seed (heirloom); preserves everything (canning skill); has fewer calories in the pantry. |
| During | Can **buy** food on the barter market with cash as long as the store has any (the price is x3 not "unavailable"); can hire laborers and a guard for the fields. | Works the land by hand: scouting, hand-picking, smoke, ditches; trades labor for food; **lean but resilient**. |
| After | Holds the land; may become the neighbors' landlord, or their target. | The skills are the wealth; a generational story ("the family that never ran out of seed"). |

Money buys *capacity and speed* (resistant seed, sprayers, greenhouses, grain); poverty pays in labor hours and *knowledge*.

## 9. What makes it fun, not just punishing

- **A scenario that rewards a long game.** The planning (diversity, seed saving, cellars, a second crop family) pays off *years* later, giving farm-sim players a payoff the other disasters never give.
- **A genuine puzzle each year**: three varieties, rotation, what to plant after the pathogen's soil load; *the field map* becomes a board.
- **Non-violent moral drama:** the soup kitchen, the seed exchange, the neighbor at the fence who is not a villain; and later the **heirloom seed legacy**: the family's saved line becomes the county's seed (a prestige and dynasty score part).
- **Weather of the world:** a cloud of locusts or a rust-orange field is a spectacle (a rare, memorable image).
- **Distinct variants**: late blight is slow and rainy, locusts are fast and brutal and over in a week, cold year is stoic and long, seed failure is a story about technology; the Plains, Appalachia and New England each play it differently.
- **Soft failure**: even a bad year does not kill; it thins the family's calories and options. Cozy: yields x1.3 of the Standard shortfall, prices x0.6, no starvation death.
- **Recoverability**: the next year can be a triumph if the seed lived.

## 10. Suggested numeric parameters and the hook seam

| Parameter | Cozy | Standard | Hardcore |
|---|---|---|---|
| Warning days | 96-144 | 60-90 | 24-36 |
| Crop loss, unprotected, susceptible family | 40% | 65% | 85% |
| `protect` cap | 0.9 | 0.8 | 0.7 |
| Staples price at month 6 | x1.8 | x3 | x4 |
| Neighbor hunger theft starts | month 7 | month 5 | month 3 |
| Seed carries pathogen (bought) | 5% | 15% | 25% |
| Locust return next year | 25% | 50% | 70% |
| Variety (nutrition) penalty | off | +25% illness | +40% illness |
| Pathogen overwinters | 0.3 | 0.6 | 0.8 |
| Fate | full 55 / partial 35 / never 10 | full 40 / partial 45 / never 15 | full 25 / partial 50 / never 25 |

KindFx mapping (`src/sim/disasters/blight.ts` + pure `src/sim/blight.ts` and tests):

| Hook | Crop blight |
|---|---|
| `onWarning` | Roll variant, region and pressure schedule; extension-agent cards; seed and staple price ramp; scouting UI flag. |
| `onHit` | Start `fx.blight = {variant, pressure curve, soilLoad per field, seedLots}`; gate card seed-or-sow; headline. |
| `daily` | Update pressure; apply yield multipliers at harvest (`cropsDay`/`orchard`/hay hooks read `fx.blight.yieldMult(family)`); neighbor `foodDays`; locust events; seed lot checks. |
| `encounterWeights` | refugees x1.8 from month 4, looters x1.3 month 5+, crop-theft opener, food trader x0.5, seasonal-worker joiners x2. |
| `priceMods` | Selective food, feed, hay and seed multipliers (section 4.2); non-food nearly 1.0. |
| `buildingDamage` | none (an optional **granary fire or rodent loss** event; the crop loss is the damage). |
| `medical` | Variety penalty; scurvy, pellagra; famine fever in crowds. |
| `radioBulletins` | The farm report (section 7). |
| `oasisWeights` | Weight `stores` and the **food-days** gap between compound and county (so a full pantry in a hungry county reads as an oasis even with the grid up). |
| `look` | Blight yellowing, rust haze, locust cloud, bare pasture, quiet chimneys. |

`effects.climate()` gains `grow` multipliers per family via `fx.blight`, replacing the single `famine` line when the kind is active. State in `fx` only (no new save field beyond WP0's `fx` bag).

## 11. Chaining

- **From:** `drought` (hot dry years bring locusts and cut yields: odds x1.5 for `locusts` in the year after), `ash_winter` and `asteroid` (the `cold_year` variant is their *natural* continuation: chain 30%), `pandemic` (labor shortage, see pandemic doc; 5%), `financial` (farm credit crunch and foreclosures).
- **Into:** `lawless` (35% at `partial` and `never`: food riots and the militia state), `financial` (a food-price inflation spiral, 20%), `civil_war` (regional food wars: the Plains Alliance holds the grain, 5%), and **`livestock_plague`** (hungry animals and moved feed spread disease: 10%).
- **Internal repeats:** the pest returns next year at 0.5 pressure; the pathogen overwinters; a **second wave mode** (DISASTER_TEETH) fits well: a lull of 12-18 months, then the second season.

## 12. Sources

- Kinealy C, *This Great Calamity: The Irish Famine 1845-52*; Ó Gráda C, *Black '47 and Beyond* (1999). Population figures from the 1841 and 1851 censuses.
- Klingaman W and N, *The Year Without Summer: 1816* (2013); Wood GD, *Tambora* (2014).
- National Research Council, *Genetic Vulnerability of Major Crops* (1972) on the 1970 corn blight.
- CIMMYT and FAO on Ug99; USDA Cereal Disease Laboratory stem rust history.
- Lockwood JA, *Locust* (2004); Lockwood, "Rocky Mountain locust" (A. Lawrence swarm estimates).
- Sen A, *Poverty and Famines* (1981); Dyson and Maharatna on 1943.
- `docs/research_disasters.md` (Venezuela food shock), `src/sim/{crops,orchard,herd,livestock,threats,effects,neighborLife,needs}.ts`.
