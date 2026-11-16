# Scenario: Livestock plague (`livestock_plague`, new kind)

Design doc, not code. Status today: **not built**. `docs/DISASTER_TEETH.md` section 4 item 6 proposes "Zoonotic livestock plague (avian flu plus foot-and-mouth) and a slow human pandemic"; WP7 reserves `src/sim/disasters/livestock_plague.ts`. Hooks that exist: the coop and flock (`livestock.ts`: chickens, eggs), goats, sheep, cattle, pigs and rabbits with condition and hunger, a **sickness roll per head** (`herd.ts`: goats 12%/yr, cow 15%, pigs 6%, steer 5%, sheep 10%, rabbits 15%; vet kit; "in peacetime the vet comes out for $250 and sets right 92%"), `swine.ts` (sow, boar, litters), butchering and meat preservation (`kitchen.ts`), `haying.ts`, `stealth.ts` (animals make noise), `pets.ts` (dogs), the Livestock duty (`daily.ts`), and the encounter system's `requisition` and `patrol`.

Evidence tags: **(verified)**, **(commonly cited)**, **(design)**.

The thesis: **the compound's animals are its savings account, and this scenario is a bank run on four legs.** Nothing here kills the family directly (the zoonotic tail is mild and optional). What it kills is *the plan*: eggs, milk, meat and manure vanish from the shelves and from the barn; a government agent with a tablet arrives and tells the player to **kill every animal, with compensation** ... or hide them. The hard choices are about **cull, hide, or defend**, and about what a rancher feels when the vet's truck is white-flagged.

---

## 1. Real-world basis and analogs

| Analog | Figures | Lesson |
|---|---|---|
| **UK foot-and-mouth disease (FMD), 2001** | First confirmed Feb 20, 2001 at an Essex abattoir; the infection had already spread via sheep sold through markets across the country. **2,026 confirmed cases** on farms; about **6 million animals culled** (some counts about 10 million including the "welfare" cull) over about 7 months; pyres burned for weeks; the cost about **GBP 8 billion** (the National Audit Office: over GBP 3 billion public and over GBP 5 billion private); the countryside was closed to walkers and tourism lost about GBP 5 billion; the 3-km "contiguous cull" policy killed healthy animals near an infected farm; footpaths closed; the foot-and-mouth disinfectant mat at every farm gate. (verified via the NAO report; widely cited) | **Movement of animals spreads it before anyone knows.** The cure (preemptive culling) is a social disaster of its own. Disinfectant mats and vehicle washes at the gate are the iconic image. |
| **UK BSE ("mad cow"), 1986-** | About 4.4 million cattle slaughtered in the eradication; about 180,000 cattle cases; **178 human vCJD deaths** in the UK by the 2010s; a global beef export ban on the UK 1996-2006 (commonly cited). | A feed-borne (prion) disease; the cull and the export ban were the economic disaster; the compound's own hay and feed were the vector. |
| **Highly pathogenic avian influenza (HPAI H5N1), US 2022-25** | More than **168 million** birds affected in all 50 states in just over three years, the largest and longest animal-health outbreak in US history (CSIS, verified in this session's search). Layers: about 75% of the poultry lost. Retail eggs: a record **$5.27 a carton in Dec 2024** per the search result and averages above $6 a dozen by March 2025 (BLS; commonly cited). Spread to **dairy cattle in March 2024**: over 1,000 herds in 17 states in 2025; about 70 human cases in the US and one death (Louisiana, Jan 2025) (CDC; commonly cited). Wild-bird migration (the flyways) is the main vector. | A backyard flock is the **front line**: the compound's few hens meet the same wild geese. Eggs are the first thing to vanish from the shelves; the price signal is the player's first warning. |
| **African swine fever (ASF), 2018-19** | Entered China Aug 2018; the herd fell by an official **38.7% by Aug 2019**, and industry (Rabobank) estimated about **half** of China's roughly 400 million pigs (about 200 million head) lost and pork output down about 25%; pork prices roughly doubled; then Vietnam, the Philippines, Eastern Europe; no vaccine; the virus survives for months in cured pork products and years in frozen meat (commonly cited; Bloomberg, FAO verified in this session). Not yet in the US; a US outbreak would shut pork exports. | ASF **kills 100% in the pen and has no vaccine**: swill, cured meat, boots, trucks and wild boar carry it. The *backyard pig* is the weak link. A pork-heavy compound is exposed. |
| **Newcastle disease, California, 2002-03** | About 3.2 million birds destroyed; the cost about $160 million (commonly cited). | A "quarantine zone" and a **movement permit** system on the county road. |
| **Q fever in Dutch goats, 2007-10** | About 4,000 human cases and about 95 deaths; about 50,000 pregnant goats culled in 2009 (commonly cited). | The zoonotic tail: a goat herd can sicken humans; abortion storms. |
| **Rinderpest (eradicated 2011)** | Killed up to 80-90% of cattle in sub-Saharan Africa in the 1890s, causing a famine and the end of pastoral societies (commonly cited). | The worst case: a livestock plague as a *human* famine. |
| **1997 Hong Kong H5N1; 2009 H1N1 ("swine flu")** | 1997: 18 human cases, 6 dead, 1.5 million chickens culled in 3 days. 2009: pigs as the mixing vessel. (commonly cited) | The origin of the zoonotic worry. |

Calibration: **animal mortality is high (50-100% of exposed animals) but human mortality is low** unless the zoonotic tail variant is chosen. The economy of food and trade is the blow, along with the *cull order*.

## 2. Warning signs and how the player notices

Warning 14-60 days (Standard; it moves with migration and animal trade). Cozy x1.6, Hardcore x0.4.

| Stage | News | Player notice |
|---|---|---|
| Early | "Dead wild geese found at the reservoir." "State vet reports sick poultry at a commercial farm two counties over." "Egg prices up 40% since Monday." The feed store's chicks are sold out; the sale barn closes "for cleaning." | Egg price creep (a shop price line: eggs and milk first). Wild-bird behavior in the world (dead geese on the pond; `wildlife`). The *hatchery's chick order* is cancelled (the shop shows "backordered"). |
| Middle | "Quarantine zone declared around a dairy in the next county." "State veterinarian bans all livestock movement for 30 days." "Auctions cancelled." County fair canceled. A white truck of the state Department of Agriculture is seen at the neighbor's. | The shop's **livestock goods** go off the shelf: no purchases of live animals. A **movement permit** is needed to move or sell an animal (`countyCrossings` checkpoint hook). The neighbor puts up a **"KEEP OUT: BIOSECURITY"** sign and a bleach mat. |
| Late | "Control area established within 10 miles of confirmed case." "Mandatory cull of infected premises and 3-mile contiguous premises." Helicopters and trucks; **pyres** smoke on the horizon. | A distant column of black smoke (the `look` profile). A state vet's card: "We have a case within 3 miles. Allow an inspection?" |

Notice-ability rule: **the first sign always reaches the player through the price of eggs, milk or pork** (a real HPAI lesson), and the second through the *quiet at the neighbor's barn*. A compound without animals sees only a price and a smoke column; one with animals sees its first sick bird.

## 3. Timeline (Standard; variant `hpai` or `fmd`; others in section 5)

| Phase | The world | The compound |
|---|---|---|
| **Hit moment** | A state order: "Standstill: no movement of livestock, hay, feed or equipment from farms in the control area." Headline: "The plague is in the county." | A gate card: **the inspector** arrives (a patrol-type encounter with a clipboard): "Any sick animals? We will need to cull if so." Decision: comply, hide, or negotiate. |
| **First hour** | The sale barn locks its gate; trucks turn around; a **disinfectant checkpoint** at the county line; the radio reads the controlled-area map. | Close the gate; put a bleach mat or a lime-and-water footbath at the barn door (cheap; works partially); stop visitors from touching the animals. |
| **Day 1** | Egg and milk shelves thin; the store limits eggs to 1 dozen. **Mandatory reporting**: the sheriff's deputy takes a list of livestock in the county. | The inspector may take a list of your animals (a registration card): *hiding* this is a decision with a consequence (a fine and a search; `stealth`/`law`). |
| **Week 1** | The first cull teams and rendering trucks; on the road, a line of white trucks. Neighbors lose their flocks; **compensation** (a USDA indemnity check: 2001 UK paid market value; US pays fair market value for culled animals). Some neighbors **hide their animals** at night. | The first sick bird (HPAI: sudden death, swollen combs, 50-100% mortality in 48 hours) or lame, drooling cow (FMD: blisters on mouth and feet, 2-14 days incubation; adults mostly *survive* but are ruined: milk drops, weight drops). The cull order. |
| **Month 1** | The county's chicken flocks are 70% gone; the livestock market is closed; milk and meat prices 2-3x; egg prices x4 (HPAI) or beef and lamb x2 (FMD). Pyres burn; the smell lingers; rural families are in shock. | The compound has either lost its animals or is **a lone surviving flock/herd**, now a target: neighbors' eyes, thieves, an inspector who comes back. |
| **Month 3** | The cull is largely done; **restocking** is banned until the zone is clear (a "fallow" period of 21-90 days; 3 months in FMD, long). Meat is **scarce and dear**; hunting pressure on wild game rises (deer and turkey populations drop). A cold winter's lack of animals (no milk, no eggs, no butter). | Replacement stock: you can *rebuild with a few surviving animals* (if hidden) or from a supplier at 4x the price (if any). **Barter value of a live laying hen: very high**. |
| **Month 6** | A **seasonal return** (HPAI: spring and fall migrations; ASF: summer). Some regions clear; in others the pathogen is endemic in wild birds or feral hogs. | Rebuild: day-old chicks, a bred doe, a breeding sow; the biosecurity discipline (a mat, a change of boots, a closed coop net) matters as the second wave arrives. |
| **Year 1** | Policy: vaccination (HPAI vaccine for poultry was approved conditionally by USDA in 2025; FMD vaccination is banned in the US so exports continue; ASF none) in `full` fate; markets reopen. In `partial` the supply chain never recovers fully (industrial production is now concentrated: 90% of US egg layers are in a few dozen houses). | The compound's animals are a **valuable closed herd** (disease-free certified, bought by neighbors). |
| **Year 2+** | The county's herds are restocked or not; heritage breeds survive in backyards (genetic diversity); a new **local meat economy**; the human tail (if zoonotic) fades. | Dynasty: the family with the closed, healthy herd supplies the valley. |

## 4. Effects by system

### 4.1 Service tracks

Like `crop_blight`, this is a **selective** disaster: grid, fuel, banks, phone and law barely move. The track layer is slow and thin:

| Variant | Weight | What | Tracks |
|---|---|---|---|
| `hpai` | 4 | Highly pathogenic avian influenza; poultry first; mortality 50-100% of exposed birds in 2 days; spreads in migration seasons (fall, spring); optional zoonotic tail to cattle (dairy) and rarely people | stores C(7, 45, 0.7, [90, 300], 90); deliveries C(10, 45, 0.8, [90, 300], 90); medical C(60, 90, 0.9, [200, 500], 90); others none |
| `fmd` | 3 | Foot-and-mouth: cloven-hoofed animals (cattle, pigs, sheep, goats, deer); 5% mortality in adults, 50%+ in young; weight, milk and fertility loss; the cull is the main damage; movement ban | stores C(10, 60, 0.6, [150, 420], 90); deliveries C(10, 60, 0.7, [150, 420], 90); law C(30, 60, 0.85, [200, 500], 90) |
| `asf` | 2 | African swine fever: pigs and wild hogs, 100% fatal, no vaccine, hardy virus; no human risk | stores C(15, 60, 0.75, [180, 450], 90); deliveries C(15, 60, 0.8, [180, 450], 90) |
| `mixed_zoonotic` | 1 | An avian influenza that crosses to cattle and swine and to people with a mild-to-moderate human wave (a slow pandemic tail, per DISASTER_TEETH) | as `hpai` plus medical C(100, 120, 0.7, [300, 600], 90); a small `outbreak` from the pandemic model at prev 0.5-1.5%, mortality x0.4 |
| `bse_like` | 1 | A feed-borne prion (hay, bagged feed, meat-and-bone meal): the culprit may be the **purchased bagged feed** the player uses; no cure; cattle and goats affected for years; human risk through meat (slow) | stores C(30, 120, 0.7, [400, 800], 120); deliveries similar |

### 4.2 Prices, shops, barter

- **Eggs, milk, butter, cheese, chicken, pork, beef, lamb and live animals** get a **selective food price curve**: HPAI: eggs x2.5 at the hit, x4 at month 1, x3 at month 6; chicken x1.8; FMD: beef and lamb and milk x1.6-2.2, pork x1.4; ASF: pork x2.5, with other meats x1.3 (substitution).
- **Live animals cannot be bought during the standstill** (shop line off); at restock (fallow period ends) prices are **x4** (a laying hen $12 becomes $45-60; a dairy doe $350 becomes $1,400; a sow $450 becomes $1,800).
- **Feed and hay**: during a control area, hay and feed *drop* in price locally (nobody has animals) and spike elsewhere; a hay barn full of dry hay is a compound asset *and* a potential vector (BSE-like).
- **Cull compensation:** an indemnity check (market value in peacetime, `law` and `banks` > 0.5; otherwise nothing and *no* cull teams come). A compensation card lists a fair-market-value payment per head (design: 100% for pure-bred or certified, 70% unregistered) paid in 14-45 days.
- **The black market in animals**: hidden animals sell at x3 face value to desperate neighbors; a risk if discovered (a fine of 2x and a seizure).
- **Barter:** eggs and chicks and milk goats are the currency that most households want. A surviving flock can *feed a street*.

### 4.3 Neighbors

- Each neighbor household with animals rolls an **infection exposure** (by distance to the nearest case: 40% within 1 mile, 15% at 3 miles, 3% at 10 miles per week of exposure; design) and a **culled-by-order** roll (3-mile contiguous). Typical county: 60-80% of poultry and 40-70% of ruminant households lose animals by month 3.
- **Neighbors hide animals** (trust game): some tell you, some ask you to hold their goats ("just for a week") (a vector and a loyalty test).
- **Neighbor behavior**: hardship from loss of income (dairy families, egg-sellers), anger at the cull teams (a **sheriff's deputies and agents** standoff story, like the 2001 farm resistance and the Bundy-style standoff genre: a rural *civil resistance* thread), grief. They ask for eggs, milk, meat and for help burying carcasses (a heavy labor task: **a pit of lime and soil**, or a pyre; a burial permit).
- After month 3, if the plague continues, farms are *abandoned* and **feral livestock** roam (escaped pigs, loose cattle): real hazards (`wildlife` hooks for hogs).

### 4.4 Raiders and the encounter mix

- **Livestock theft raids** (a new opener on `looters` / `gang`): the thieves want live breeding animals: a night truck with a stock trailer at the pasture, dogs barking; **cattle rustling** returns. The counter is a night-watch, a **guard dog** (existing), a locked barn, a hard yard gate and a **stock marking/brand**.
- **Hunger looters** appear after month 2: families after eggs and meat; weights `refugees` x1.3, `looters` x1.2 from week 3 for compounds with visible animals (the `stealth` noise signal: roosters and cattle make noise; `soundK`).
- **Inspectors and cull crews** are a *non-hostile hostile*: a `patrol` encounter of state agents (or contract cullers) who **demand access**, take a list, and may order a cull; refusal escalates (deputies, a warrant, in `law` > 0.5; in a collapsed world nobody comes: *the biosecurity regime is the first thing to fail*). The `gate.government` setting (help vs hinder) decides how welcome they are.
- **Traders**: livestock and feed traders x0.2; egg and meat traders at premium; a **black-market dealer** in animals appears (`blackMarket.ts`).
- **Cadence**: not much change; the compound's visible herd draws the raiders.

### 4.5 Health, food and water

- **Protein and fat crisis**: with eggs, milk and meat gone for the neighbors and the county, the compound's own animals feed the household and the barter economy. A **non-animal protein path** (beans, a hunting and fishing plan, rabbits that are *not* susceptible to most of these viruses (rabbit calicivirus is its own matter), insects, mussels) is the lesson.
- **Zoonotic tail** (the `mixed_zoonotic` and any variant if the player handles sick animals bare-handed): a **handler exposure roll** when the player culls or butchers an infected bird or animal without PPE: HPAI conjunctivitis and mild flu (most human cases in 2024 were conjunctivitis from dairy workers), serious but rare. Protection: gloves, goggles, N95 (the same protective items as the pandemic doc; `pandemic.md` 5.2). A person with fever after cull work **gets the `fever` hurt record** at `sev` 25-50.
- **Milk safety**: raw milk from an infected cow is an exposure; **pasteurizing** (a stove and a thermometer; the kitchen skill) removes the virus; the player can choose to drink raw or not.
- **Disease in the pantry**: well-cooked meat and eggs are safe for HPAI and FMD; ASF is harmless to humans; BSE-like needs a no-brain rule. The game's dread is mostly **economic, not medical**.
- **Water**: pyres and burial pits near the well are a contamination risk (existing `water.ts` hook; rule: 200 feet from the well or **the water goes bad**, a rule shared with the bioweapon doc).

## 5. Disease and exposure mechanics

### 5.1 The herd model (`src/sim/livestockPlague.ts`, pure)

Per species a small status: `healthy`, `exposed` (incubating), `sick`, `recovered`, `culled`, `dead`.

| Disease | Species | Incubation | Mortality (head) | Spread (per exposed contact) | Notes |
|---|---|---|---|---|---|
| HPAI | chicken, duck, turkey, goose; rarely goats and cats; cattle (dairy) | 1-3 days | 50-100% in 48 h in chickens; low in ducks (carriers) | Very high: wild-bird droppings, boots, feed, shared water | Wild-bird visits (existing `wildlife`) are the vector; the **closed coop with a net roof** is the defense |
| FMD | cattle, pigs, sheep, goats, deer | 2-14 days (median 3-5) | 1-5% adults; 20-50% young | Extreme: aerosol (pigs excrete 3,000x more virus than cattle), carried on wind up to ~30 miles over water, on vehicles and boots; milk | Animals look "sick and ruined" (blisters, drooling, lameness, milk down 80%); stock survive but are culled by order |
| ASF | domestic pigs, wild hogs | 3-15 days | ~100% | Very high by contact and by **pork products and boots**, ticks (Ornithodoros) | No vaccine; the **swill and kitchen-scrap feeding** of pigs is the classic vector; no cure |
| BSE-like | cattle, goats | years | 100% once clinical | Feed only | Not contagious animal-to-animal; the player's **bagged feed and meat-and-bone** source decides |

Mortality and the cull rule are separate: in FMD the *order* kills far more animals than the virus does.

### 5.2 Exposure rolls for the compound

Each day a flock or herd gets `p = base x vectors x (1 - biosecurity)`, where

- `vectors` = (wild-bird presence in season) + (visitors with animal contact) + (new stock) + (shared equipment) + (the neighbor's distance in miles from the nearest case) + (the player's own boots and truck after going to a neighbor's farm) + (feed and hay source) + (wind for FMD);
- `biosecurity` is a sum (cap 0.9) of measures:

| Measure | Effect | Cost |
|---|---|---|
| **Closed gate, no visitors to the barn** | +0.2 | free (lost trade) |
| **Footbath / bleach mat at barn door** (dilute bleach or Virkon; *must be changed daily; dirty mats do nothing*) | +0.15 | $20 and daily labor |
| **Dedicated barn boots and coveralls** | +0.15 | $30 |
| **Closed, netted run and roof** (no wild-bird contact: HPAI) | +0.3 vs HPAI; 0 vs others | lumber and wire |
| **Separate water (a closed trough, not a pond)** (HPAI) | +0.1 | tank |
| **No new animals; a 30-day quarantine for any new head** | +0.2 | a quarantine pen |
| **Own feed and hay** (not purchased; the player's haying) | +0.1 (BSE-like: +0.8) | the existing `haying.ts` |
| **Distance** (barn 300+ feet from the road and boundary) | +0.1 | a siting decision (the world already has terrain and sightlines) |
| **Guard dog on the perimeter** (discourages wildlife and strangers; but **dogs also carry mud on their paws**; for ASF/FMD they are mechanical vectors) | +0.05 | existing |
| **Vaccination** (HPAI poultry vaccine in `full` fate year 1) | +0.5 | $0.20 a bird; supply limited |

A compound that runs three of these has about 50% protection; a **fully closed system** (own feed, no visitors, netted run, boots, quarantine) approaches 85-90%. Hardcore: wild-bird pressure x1.5 and hay and feed from a neighbor are riskier.

### 5.3 The cull decision (the signature mechanic)

When the inspector confirms a case within the radius (3 miles) or on the compound, a **cull gate card** (the existing `GateCard` pattern):

1. **Comply**: animals killed (a scene of rendering trucks or **burial pit** work by your own hands if no team comes), indemnity paid in `full`/`partial` fate; **fallow** period of 21-90 days before restocking; the player keeps a clean record.
2. **Hide / refuse**: animals stay; every day a `found` chance (stealth + law): a fine, a forced cull, a **confiscation of the entire stock and a ban from trading**; the sick animals continue to infect (the disease spreads to the neighbors, who learn and **turn on the compound**: neighbor trust drops sharply).
3. **Selective cull**: kill only the infected and exposed (veterinarian approval; Medical skill and a **vet kit**; in `partial`/`never` fates nobody comes).
4. **Eat them**: a **mass slaughter and preservation** day: 450 lb of beef a steer, 150 lb pork a pig (existing figures) into the smoker, freezer (if power), jerky; meat from infected animals is safe for FMD, HPAI (cooked) and ASF; **an enormous feast** and a pantry gain, the best response for a small farm that can process quickly (a labor spike: 2.5 person-hours a head).
5. **Move them** to a secret pen or the **bunker** (a hide location: animals make noise: the existing `stealth` noise reads).

Choice 4 is the elegant answer for a skilled homesteader and is **allowed** and rewarded: the cull becomes a harvest. It's also the realistic response in a collapse (no one comes to cull).

### 5.4 Human tail

For `mixed_zoonotic` only: a pandemic-doc `outbreak` with `prevPeak` 0.5-1.5%, incubation 2-5 days, mortality x0.4 of the COVID-like table, spread through **animal handlers first**: the compound that works with animals is the first exposed (no vector at the gate). Use pandemic.md's exposure, mask and quarantine model unchanged. It is the slow tail and ends in 8-14 weeks.

## 6. Regional variation

Odds proposed as `livestock_plague` keys in `RegionDef.odds`.

| Region | Odds | Notes |
|---|---|---|
| Mountain West | 1.0 | Cattle country; elk and deer (FMD in wildlife, an eradication nightmare); **sheep and cattle grazing allotments** on public land complicate movement bans; long distances to a vet; brucellosis in the Greater Yellowstone is the real analog. |
| Appalachia | 0.9 | Backyard flocks and hogs everywhere; **feral hogs** (ASF reservoir); strong cull resistance culture; hunters as food. |
| Desert Southwest | 0.7 | Few animals; goats and chickens; border (a source of FMD risk historically: the US Mexico border commission); heat kills virus on surfaces. |
| North Woods | 0.8 | Cold favors virus survival (HPAI in winter); few flocks; wild game and fish are the safety net. |
| Great Plains | 1.6 | Huge cattle feedlots and hog barns: the epicenter; **a feedlot outbreak is a county-sized event**; the compound's neighbors are producers with *thousands* of head; culls are massive and **pyres or rendering are visible for miles**; the player is the odd small keeper. |
| Pacific Northwest | 1.2 | Wet winters help HPAI (Pacific flyway); dairy; the compound's duck and goose flocks are at risk. |
| Upper Midwest | 1.5 | Dairy and poultry (Wisconsin, Michigan; the 2022-25 outbreak epicenters): milk shortage and **raw milk culture**; HPAI in dairy cattle first. |
| New England | 0.9 | Small farms, direct sales; high density of backyard flocks; strict state ag departments (fast, polite, relentless culls). |
| Ozarks | 1.4 | Poultry belt (Arkansas, Missouri: the broiler heart of America: large contract growers), cattle and hogs; many small-time growers; ASF risk from feral hogs. |
| Hill Country | 1.3 | Cattle, goats and sheep (Texas leads in sheep and goats), exotic ranches (axis deer, oryx: reservoirs); wild hogs everywhere. |
| Rust Belt edge | 0.8 | Smaller herds, dense towns; markets and Amish country (Pennsylvania's Lancaster County had a 2022 HPAI outbreak; Amish cull resistance and horse-and-buggy movement). |

## 7. What the player sees and hears (text only)

- **Radio: the farm report** (shared with `crop_blight`), plus a **State Veterinarian Bulletin**: "A control area is in effect for the following zip codes... no movement of poultry, eggs, equipment or feed... report sick animals at 1-800-..." Then: "Indemnity payments are being processed." In `never` fate: silence; a farm station reads only the market closes.
- **Neighbor voices**: "They took all four hundred of Henry's hens. He sat in the truck with the radio off."; "Lime and a pit; I'm not going to watch." The **ethical weight of the cull** (kids' 4-H animals: a hard beat).
- **Day cards**: "Eggs: out of stock at the store. Your hens: 11 healthy, 1 weak." "Control area: 3 miles; you are 2.1 miles from the nearest case." "Footbath: replace the bleach (day 2)."
- **Visuals** (`collapseLook` profile): a black column of smoke from a pyre on the horizon (cull), white vans and flatbeds with state seals, **lime-white pits** at the field corner, empty barns with open doors, a lone cat on a feed sack, **bleach-mat signs** and "BIOSECURITY: NO ENTRY" tape at a gate (`props`), a rooster silent. No animals dying on screen: aftermath and text.
- **Report card**: head lost / saved / culled / eaten, indemnity received, biosecurity measures in place on the day of exposure, "the measure that would have saved the flock", neighbor trust change.

## 8. Player decisions and strategies; rich vs. poor

### Decisions

1. **Before the hit:** which animals (and how many) to keep; where to put the barn (distance from road and neighbors); closed or free-range; own feed or purchased; a quarantine pen; a **diverse protein base** (rabbits, fish, beans, hunting).
2. **At the hit:** close the gate or keep the trade; footbaths; **tell the inspector the truth or not**.
3. **The cull card** (section 5.3): comply, hide, selective, eat, move.
4. **What to do with the meat** (an enormous harvest day: smoker and freezer capacity; spoilage if power is out) and **the carcasses of the neighbors' flocks** (salvage?).
5. **Restock when?** After the fallow period at 4x cost, or from your closed bloodline.
6. **Neighbors:** hold their goats; sell eggs at a high price or give them (bonds vs reputation).
7. **Zoonotic risk:** PPE for the cull; the human-wave tail.
8. **Long game:** become the valley's breeder (a **closed herd**, clean certification) or move to crops.

### Rich vs. poor

| | Rich | Poor |
|---|---|---|
| Before | A modern closed barn: netted run, concrete floor, a dedicated vehicle, a vet on retainer, a walk-in freezer and a smoker; own hay and feed stock; **vaccines** when available; a hired hand. | A backyard coop and a doe or two; free-range habits; manure on the garden; no freezer; a hand-dug root cellar. |
| During | Pays for lab tests, **disinfectant**, a **wash bay** for vehicles; can **buy replacement stock** at x4 prices after the fallow; indemnity matters less. | Hides the flock or **eats it all**; **swaps eggs** for labor; keeps a few hens in a closet-sized net; loses less (fewer to lose). |
| After | Rebuilds fast, **becomes a breeder**, supplies neighbors; lives on the capital. | Rebuilds slowly from a hidden pair; **heritage breeds** carry the line; goodwill with neighbors. |

Money buys *speed and capacity* (closed barns, vaccines, replacement stock); poor pay in hours and in hidden hens.

## 9. What makes it fun, not just punishing

- **A scenario of tradeoffs, not damage**: the cull card is a real, readable dilemma with five distinct answers, each with a story (the comply, the hide, the feast).
- **Tension of secrecy:** hiding the goats from the deputy, the footbath routine, the neighbor who knows (a stealth game *about animals*).
- **Biosecurity as a puzzle:** a farm map where wild-bird flyways, roads and neighbors are *vectors* (an overlay: "biosecurity" in the Blueprint / Terrain overlays: red wedges from the road and the pond).
- **A harvest in the middle of a disaster**: the compound butchering its entire herd and smoking meat for a week is a satisfying, hearty scene, the only scenario with an *abundance* beat.
- **A rural civic drama:** standoffs at the gate, the church supper with the last eggs, the vet who drives out at midnight.
- **A reward for craft:** the closed herd, the heritage breed, the seed-and-breed ledger in the chronicle.
- **Soft failure:** no one in the family dies from the disease on Standard; Cozy compensates generously (indemnity x1.2, nothing is ever seized).
- **Recoverability:** a single hidden hen can rebuild a flock in a season (10 chicks per hen per 21-day brood, existing flock growth).

## 10. Suggested numeric parameters and the hook seam

| Parameter | Cozy | Standard | Hardcore |
|---|---|---|---|
| Warning days | 22-96 | 14-60 | 6-24 |
| Base daily exposure (unprotected flock in the control area) | 2% | 5% | 9% |
| Biosecurity cap | 0.95 | 0.9 | 0.8 |
| Neighbor flock loss by month 3 | 30% | 60% | 80% |
| Live-animal price after fallow | x2 | x4 | x5 |
| Egg price at month 1 (HPAI) | x2 | x4 | x5 |
| Indemnity (share of value) | 120% | 100% | 70% |
| Fallow days | 21 | 60 | 90 |
| Hide-and-found chance per week | 5% | 12% | 25% |
| Human tail (mixed variant) `prevPeak` | 0.3% | 1% | 2% |
| Fate | full 55 / partial 35 / never 10 | full 45 / partial 40 / never 15 | full 30 / partial 45 / never 25 |

KindFx mapping (`src/sim/disasters/livestock_plague.ts`, `src/sim/livestockPlague.ts`, with `herd.ts`, `swine.ts` and `livestock.ts` reading `fx.herd.status(species)`):

| Hook | Livestock plague |
|---|---|
| `onWarning` | Roll variant, the flyway season and the case map (nearest-case distance by day); egg/milk/pork price ramp; sale-barn closure; movement permits. |
| `onHit` | Standstill and control-area radius; the inspector card; neighbor culls begin; shop's live-animal goods off. |
| `daily` | Per-flock exposure rolls; sickness and mortality by species; cull orders; neighbors lose and hide animals; pyres and pits; compensation timing; the fallow clock; wild-bird events. |
| `encounterWeights` | inspector/cull `patrol` (law > 0.5), livestock-theft opener, refugees x1.3, trader livestock x0.2 / egg and meat premium, black-market animals. |
| `priceMods` | Selective food and animal prices; feed and hay local dip. |
| `buildingDamage` | Optional: **barn and coop condemned** (a structure can be burned or disinfected by order; downtime 14-30 days; a disinfected building is *returned* with a clean-status flag); pit and pyre as buildable work sites. |
| `medical` | Handler exposure (zoonotic tail), raw milk risk, protein variety penalty (shared with `crop_blight`). |
| `radioBulletins` | State veterinarian bulletins, the farm report, neighbor stories. |
| `oasisWeights` | Weight `stores` and the **animal-count gap** between compound and county. |
| `look` | Pyre smoke, white vans, lime pits, bleach-mat tape, silent barns. |

Save: state lives in the `fx` bag (WP0); no new field.

## 11. Chaining

- **From:** `crop_blight` (hungry animals, moved feed; 10%), `drought` (stressed herds, shared water holes: 10%), `pandemic` (absent inspectors: the plague runs freer; 5%), `financial` or `lawless` (no one to enforce a cull and nobody to stop movement).
- **Into:** `crop_blight`'s **food price world** is amplified (the player loses protein and calories at once); `pandemic` (the `mixed_zoonotic` variant is its own origin: 40% of the time it chains into a mild human wave at day 60-150); `lawless` (food-riot) 15%; `financial` (a rural credit crisis) 10%.
- **Internal:** **second wave** with the fall migration (HPAI returns every year in a weaker form: the existing `threats.ts` could host a yearly "avian flu" threat after this kind has fired); a feral-hog wave after ASF; a **herd re-infection** when restocking is rushed.

## 12. Sources

- National Audit Office (UK), *The 2001 Outbreak of Foot and Mouth Disease* (HC 939, 2002); Anderson I, *Foot and Mouth Disease 2001: Lessons to be Learned Inquiry* (2002).
- CSIS, "How Is Bird Flu Impacting Agriculture and Food Security in the United States?" (168 million birds); USDA APHIS HPAI detections; BLS average price of eggs, Grade A large (record in March 2025).
- Bloomberg 2019-09-27, "Deadly Virus Has Slashed China's Pig Herd by Half, Rabobank Says"; The Pig Site 2019-09, official 38.7% decline; FAO, "One year on, close to 5 million pigs lost to Asia's swine fever outbreak".
- CDC, H5N1 human cases and the dairy-worker conjunctivitis cluster (2024-25).
- For FMD modeling see Keeling MJ et al., *Science* 294 (2001) "Dynamics of the 2001 UK foot and mouth epidemic"; Kitching RP, "Foot-and-mouth disease: current perspectives".
- `docs/DISASTER_TEETH.md` section 4 item 6; `src/sim/{herd,livestock,swine,haying,kitchen,stealth,pets,encounters,countyCrossings,neighborLife}.ts`.
