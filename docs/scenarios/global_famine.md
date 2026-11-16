# Scenario: global_famine (the harvests fail)

Kind id: `global_famine` (new; best of the brainstorm; see `extra_scenarios.md`). A multi-region crop failure (a "multiple breadbasket failure": wheat, corn and rice together) plus export bans: not an overnight hit but a year of rising price and dwindling shelves. Distinct from `crop blight` (proposal 2) because it is global, political, and long. Conventions in `README.md`.

## 1. Real-world basis and analogs

| Analog | Facts | Lesson |
|---|---|---|
| Bengal famine 1943 | About 2 to 3 million died, caused by wartime policy, hoarding, price inflation and export, not just a lack of rice. | Famine is distribution. The rich hoard, the poor die. |
| Holodomor 1932 to 1933 | Requisition quotas; estimates of about 3.5 to 5 million deaths in Ukraine. | Requisition of seed grain is deadly; hidden stock saves families. |
| Great Chinese Famine 1959 to 1961 | Estimates 15 to 45 million dead. | Official lies hide the famine. |
| Irish Great Famine 1845 to 1852 | About 1 million died, about 1 million emigrated; potato blight while food was exported. | A monoculture and a seed failure. |
| Dutch Hunger Winter 1944 to 1945 | At least 22,000 deaths; rations under 750 kcal, about 400 kcal at the lowest. [Wikipedia](https://en.wikipedia.org/wiki/Dutch_famine_of_1944%E2%80%931945) | A city starves beside farms. |
| Year Without a Summer 1816 (Tambora, 1815) | Crop failure in the Northern Hemisphere; grain prices tripled in places; food riots. | Real, modern analog for the price path. |
| 2007 to 2008 and 2010 to 2011 food-price crises | The FAO Food Price Index roughly doubled from 2005 to mid-2008; export bans (Russia 2010, India 2007, Argentina) and riots in more than 30 countries; the 2011 spike helped trigger the Arab Spring. | Export bans and panic produce riots before the harvest is even in. |
| North Korea 1990s | Hundreds of thousands to about 2.5 million dead; hunger markets (jangmadang). | Black markets. |
Figures are from public record (FAO, scholarly estimates) and have wide ranges; recheck before display. Sources: Hunger Winter page above; others to be verified.

## 2. Warning signs (60 to 180 days)

Growing season news: a wheat belt drought, a rice blast, a monsoon failure; export bans announced (Russia, India, Ukraine corridors blocked); the FAO index at record; the grocery store limiting rice and flour; farm-store seed sells out; the cost of a loaf up 30% then 60%; church food banks double their line; talk on the radio of "grain reserves"; the county announces a rationing plan; neighbors plant every yard. Player notices: market tab (flour, rice, feed prices rising 5 to 10% a week), a hint on the price board, the radio's market report.

## 3. Phase timeline

| Phase | World | Compound |
|---|---|---|
| Hit moment | "The harvest report: world grain stocks lowest in 50 years" and the federal "emergency rationing" declaration (the official hit). | The card. |
| First hour | Panic buying wave at the store. | |
| Day 1 | Shelves of flour, rice, beans, oil empty; limit 1 per customer. | |
| Week 1 | Food riots in the city; trucks escorted; stores open 3 hours a day. | First hungry arrivals (refugees, kin). |
| Month 1 | Ration cards (an official ration of about 1,600 kcal first, then 1,200 within 3 months); price of staples x3. | Neighbors steal from gardens at night. |
| Month 3 | Hunger stunts the labor force; disease rises (malnutrition, dysentery); farm theft and livestock rustling; seed hoarding. | Siege of the compound's stock by neighbors who know. |
| Month 6 | Winter: the hungriest season; hidden hunger deaths in cities; migration into countryside; requisition of grain by the state. | The farmland is the power; the compound may be asked to feed 40 people. |
| Year 1 | Next harvest: if the fate is `full`, a partial recovery (about 70% yield); if `never`, a second failure. | The land is a gold mine; the mouths to feed grow. |
| Year 2+ | Slow recovery, famine memory, a reordered society around land. | |

## 4. Effects

Tracks (variant `breadbasket`): stores C(0,30,0.1,[300,700],120) (the key: slow fall over a month to 10%, slow return), deliveries C(5,40,0.25,[300,700]), banks C(30,60,0.5,[250,600]) (price shocks, capital controls), fuel C(20,60,0.5,[300,700]) (diesel for farms), medical C(30,90,0.4,[300,700]) (malnutrition load), law C(20,90,0.3,[300,800]), grid C stays at 1 until month 6 then 0.7, phone 1.
Prices (priceFactor by food class, cash): flour 1.0 now, 3x at month 1, 6x at month 3, 10x at month 6 in cash (Weimar and 2008 patterns), grain/beans/rice best store; salt, sugar and cooking oil 5x; meat 3x; seeds 10x; calories become the unit of barter (a "cup of wheat" is a coin); `moneyWorks` stays true longer than in lawless, with the "quantity limits" and a black market.
Raiders and arrivals: `refugees` 3x, `kin` 3x; `looters` 1.5x ("hungry people" who steal garden food and chickens; `desperate` temper; spare children; trade labor for food); `gang` 1.5x raiding farms for grain and livestock; `requisition` 2x (state grain levy at a fixed quota of 20% of grain produced or stored); `trader` rises and falls: grain traders appear at fair price early, then vanish, then reappear at extortion rates.
Health and food: starvation mechanics: 1,200 kcal rations produce weight loss; kids and elderly first; edema; infections; 5% of the neighbors die in the first 6 months in the `never` fate; vitamin deficiencies (scurvy, pellagra, rickets) matter for a household that relies on one staple. Water unaffected unless chained.

## 5. Factions

The State (rationing, requisition quotas, relief convoys), the Food Committee (neighbors dividing stores), the Hoarders (the rich neighbor with a warehouse), the Grain Speculators and black marketeers, the Churches, the Hungry (mobs).
Checkpoints: grain checkpoints on the county road (inspect trucks for grain; fine or confiscate); a "bread riot" event at the town store; a soup kitchen as a faction building the player can supply.
Requisitions: grain levy (20 to 30% of stores or yield per season; hidden stock safe unless informant), livestock levy, seed grain levy (the Holodomor rule: giving up the seed means no harvest; hidden seed is the key resource).
Humanity: feeding strangers +6 per family each month (cap), turning away -8, selling at extortion rates -6 (no cap), hiding grain from starving neighbors -4 but legal, stealing a neighbor's potatoes -10, giving seed to a neighbor +10, running a soup kitchen +15.

## 6. Regional variation

| Region | Notes |
|---|---|
| mountain_west | Short season, marginal yield; hay and cattle; fewer mouths but fewer calories; elk and trout help (wildfood). |
| appalachia | Subsistence heritage, gardens everywhere, game and forage (ramps, pawpaws, chestnuts, hogs) lessen the hit; many poor. |
| desert | Irrigation-dependent; deep wells; low yield; heavy import dependence; the worst. |
| north_woods | Short season, many lakes (fish), hunting; low mouths. |
| plains | The breadbasket: farmers have grain in the bin and the state requisitions it; food is power; heavy raids; combines and fuel are prizes. |
| pnw | Mild; fishing and gardens help; cities depend on imports; arrivals from Seattle and Portland. |
| upper_midwest | Dairy, corn, potatoes; strong yields; heavy arrivals from Chicago. |
| new_england | Small farms, short season, coastal fish; dense dependence on imported food; rocky. |
| ozarks | Gardens, hogs, game, nuts; strong self reliance. |
| hill_country | Cattle, pecans, deer; drought risk; wells; ranchers' mouths. |
| rust_belt | Dense, dependent, little farmland; riot and arrivals; farmland prized. |

## 7. Radio and day cards

Radio: market reports in prices per bushel; ration schedule; a pastor's sermon on sharing; an announcement of "gleaning rights"; a price-gouging arrest; an interview with a farmer on requisition; a school lunch closing; "wheat at $38 a bushel" (vs about $6 to $8 in 2022). Day cards: "Day 40. The bakery in town closed. A hand-lettered sign: no flour." "Day 130. A man asks for work for a bag of oats."

## 8. Decisions; rich vs poor

Plant everything, hide seed, trade surplus now or hoard, feed neighbors or keep, use the state ration or go off-grid, leave for a better region. Rich: buy bulk early (rice, beans at x1 in the warning period, a 2-year pantry), a root cellar, a grain mill, seed bank, a greenhouse, hire farmhands, buy farmland at distressed prices (land is cheap in the first months until it isn't), pay for convoy escorts. Money buys speed early, nothing later: silver and food do. Poor: forage, hunt, labor-for-food deals, gleaning, rely on the church, small garden intensively, rabbits and chickens.

## 9. What makes it fun

A strategy game of calories and land: the compound becomes a food factory with real planning (crop rotations, preservation, livestock feed efficiency, seed saving) and a politics game over who eats. The player can be a hero (a soup kitchen) or a lord, and the report grades it. Slow burn leaves time to build; the threats are mostly neighbors, not monsters, so humanity matters.

## 10. Numbers and hook seam

Variants: `breadbasket` (above, weight 3), `export_ban` (price-driven, shorter; stores C(0,15,0.3,[150,400]), fate leans `full`), `monoculture_blight` (one crop family fails; regional). Warn 60 to 180 days (the longest after asteroid/drought). `famine` factor: the existing `threats` famine line `grow *= 1 - 0.35 * famine` is reused; here `famine` = 0.5 to 0.8 for a year (the `breadbasket` variant), 0.35 for `export_ban`. Ration: calories per adult 1,600, 1,200, 900 by month 1, 3, 6 for those relying on the state; own-grown ignores this. Levy: 20% grain every 90 days.
Hook seam: `src/sim/disasters/global_famine.ts`; `onWarning` (price drift 5 to 10%/week), `daily` (levy clock, hunger on neighbors, rustling event), `priceMods` (food classes), `encounterWeights` as above, `medical` (malnutrition deficiency hook), `radioBulletins` (market reports), `oasisWeights` (stores x3, deliveries x1.5 so the contrast reads at a full grid), `look` (empty shelves/line, no blackout). Reuses `climate()` growth factor and `wildfood` supply. Seed-saving milestone from proposal 2.

## 11. Chaining

Into: `drought` (35% already chains to wildfire; add famine 25%), `ash_winter` (40%), `asteroid` (impact winter), `blight`, `civil_war`, `invasion`, `unknown` C (50%). Out of: `lawless` (50% in `never` fate), `mass_exodus` (40%), `pandemic` (malnutrition-linked, 25%), `civil_war` (bread riots, 15%).
