# Scenario: invasion (foreign occupation)

Kind id: `invasion` (exists, pulpy; one patrol encounter, requisition off, a parley card). Owner default: **checkpoints and requisitions first, curfew, informants and conscription in later tiers.** Conventions in `README.md`.

## 1. Real-world basis and analogs

| Analog | What happened | Figures | Lesson |
|---|---|---|---|
| France 1940 to 1944 | Defeat in 6 weeks, then the occupation: ID papers, curfew, requisition and "occupation costs"; the Vichy zone; forced labor (STO, from 1942); resistance and reprisals. | The June 1940 Exodus: about 8 million people on the roads. Occupation costs were set at about 20 million reichsmarks a day. About 600,000 or more French workers sent to Germany. Oradour-sur-Glane reprisal, June 10, 1944: 642 killed. Bread ration for adults roughly 350 g a day in 1941; about 1,200 to 1,500 kcal a day typical urban ration. | Most people neither collaborated nor resisted; they got by (attentisme). Rationing and black market (marche noir) is the economy. |
| Netherlands 1940 to 1945 | Occupation, then the Hunger Winter after the railway strike and a food embargo. | At least 22,000 died of famine (a lower estimate is 18,000). Official rations fell below 750 kcal after Nov 1944 and under 400 near the end. People ate tulip bulbs and sugar beets and walked to farms to barter. | Occupation means the food goes to the army first, and a city can starve beside a farm. The farm is the power. |
| Iraq 2003 onward | Occupation, checkpoints, curfews, house searches, an insurgency. | Roughly 5 million displaced at peak; civilian deaths estimated from about 150,000 to more than 500,000 (wide range). | Checkpoints and searches create the insurgency; local councils bargained. |
| Ukraine 2022 onward | Occupied regions (Kherson March to November 2022): filtration, ID checks, collaborators, disappearances, partisans. | About 8 million refugees abroad and about 6 million internally displaced by end 2022. Bucha, March 2022. | Information flows by phone and Telegram; filtration points sort by documents and phone contents. |
| Sources | [The Exodus (1940)](https://en.wikipedia.org/wiki/The_Exodus_(1940)), [Dutch famine 1944 to 1945](https://en.wikipedia.org/wiki/Dutch_famine_of_1944%E2%80%931945), [Cambridge, Hunger Winter](https://www.cambridge.org/core/books/hunger-winter/introduction/B79B9D43B2DC2E7FA2C1C515D62E0677); other figures are commonly cited and should be rechecked. |

## 2. Warning signs (10 to 40 days)

- Early: satellites over the Pacific go dark; carrier groups recalled; a presidential address. Notice: GPS drift on the radio and map ("signal degraded" line), prices of fuel up 20%.
- Middle: paratroopers near the missile fields; martial law in three states; National Guard son called up. Notice: the neighbor's truck leaves with a duffel; a convoy of green trucks on the interstate.
- Late: columns of vehicles on the interstate, not ours; radio stations off the air one by one; a cyber opener (grid flickers).
- Player actions: bury caches, buy fuel, decide whether to move; hide the radio.

## 3. Phase timeline (tier 1 is the default; tiers 2 and 3 on a timer)

| Phase | World | Compound |
|---|---|---|
| Hit moment | "Foreign troops are in the valley. Checkpoints on every road." Air strikes at bases, grid wobbles, phones jammed. | A day card; a checkpoint appears at the town bridge. |
| First hour | Jets overhead; the radio goes to a music loop then to a foreign announcement. | Nothing at the gate. |
| Day 1 | Tier 1: checkpoints, proclamation posters (a list of orders), weapons surrender order. | The player must decide on guns (hand in, hide, or keep). |
| Week 1 | Troops requisition fuel and vehicles at stations; local officials told to keep running; some do. | First patrol visit: a polite lieutenant with an interpreter lists the farm. |
| Month 1 | Tier 1 full: requisition rolls every 14 days; ID checks to cross the county line; a ration card for purchases if the shop is open. | Quota note: X bushels of grain, Y head of cattle. |
| Month 3 | Tier 2 begins: curfew 8 p.m. to 5 a.m.; ID cards; searches. Resistance cells appear; reprisal threats. | Night curfew restricts watch and work; a night patrol. |
| Month 6 | Tier 3 begins if the fate is `never`: informant network pays for tips, conscription of labor (forced labor draft of 18 to 35, like STO). First reprisal against a neighbor village after an ambush. | A labor draft notice; an informant among your neighbors. |
| Year 1 | Normalization: the black market is the real market; some collaborate, some profit. | |
| Year 2+ | Liberation (reprisals against collaborators) or a negotiated partition. | End report grades what the player did when tested. |

Tier clock default: tier 1 at the hit, tier 2 at day 60 to 90, tier 3 at day 150 to 240. Cozy: tier 1 only. Standard: tier 2 by month 3. Hardcore: tier 3.

## 4. Effects

Tracks (variant `occupation`): law C(0,5,0.2,null), grid C(0,2,0.2,null), phone C(0,0,0,null), banks C(0,2,0,null), fuel C(0,5,0.1,null), stores C(2,10,0.2,null), deliveries C(0,3,0.1,null), medical C(2,10,0.3,null). Proposal: the phone does not drop to 0 permanently; it is jammed (0) for 3 days, then 0.3 under monitoring (a "phone watched" flag that raises informant chance). Grid recovers to 0.5 in a collaboration zone (the occupiers want power for the town); keep `back: null` for a hard run but add the variant `soft` (see section 10).

- **Banks and money:** a new occupation currency decree: old dollars accepted at 50% (a `cashMultiplier` of 0.5 at day 10, 0.25 at day 60); `moneyWorks` true only when the occupier currency is available; barter always works. Shops open on odd days with ration cards.
- **Prices:** fuel x5 (requisitioned), flour x2 then x4; cigarettes, coffee, sugar, penicillin are coins.
- **Neighbors:** informants (1 in 8 neighbors takes pay, up to 1 in 5 in tier 3), collaborators in the town council, resistors, silent majority. Disposition changes shown on the neighbor card.
- **Health:** shelling injuries early; clinics under occupier control; rationing hunger (Dutch pattern) in the city; the farm becomes a pilgrimage point for hungry relatives (kin encounters).

Encounter mix: `patrol` 20 at the hit (4 to 8 soldiers, an officer and an interpreter, polite, written receipts, `hard`), `requisition` back on (the existing "requisition off" rule removed): quota schedule; `looters` 0.6x (soldiers shoot them); `gang` 0.5x; `trader` 0.5x (black marketeers: want silver, give salt); `refugees` 1.8x; `kin`; new `partisan` (4 to 6, want shelter, food, guns; risk reprisal); new `informant` card (a neighbor asks for your radio, your stock, who visits).
- Hostile crews (rogue unit, drunk garrison troops): kill all but sometimes take captives or hostages; `savage` weight 0 unless the unit is punitive in tier 3 (reprisal column: 20 to 40 soldiers burn a farm and shoot men).
- Merciful soldiers (conscripts far from home) spare children and may give food; sometimes they show up as a single lost soldier asking for water. The player can hide or help (humanity +, reprisal risk).
- Civilians speak in fragmentary lines: "They took my husband. He didn't do anything." The occupier speaks formally: "You will provide forty kilograms of grain by Friday."

## 5. Factions, checkpoints, requisitions, collaboration vs resistance

Factions: the Occupation Authority (a real state, see section 12, Invaders), the Town Council (collaborators), the Free Valley Committee (resistance), the Black Market, the Church.

Checkpoints: bridge and crossroads; papers (an ID document named by the invader, 30 days), curfew passes. Stances: flag_pay (bribe 2 silver or a pack of cigarettes), flag_pass, flag_bluff (forged paper, success 40%), flag_shoot (reprisal on the village).

Requisitions: tier 1 takes up to 25% of visible stores (grain, meat, fuel, a truck) every 14 days; concealment quality (cellar, false wall, buried barrels) protects hidden stock. A search roll per visit: hidden stock found with p 0.1 baseline, 0.35 if an informant exists. Receipts in occupation money.

Conscription/forced labor (tier 3): one adult per household sent to a work detail for 60 days; pay (a bribe, 4 silver), hide (bunker), send an elder, or flee. Reprisals: an ambush within 3 miles means a hostage roll on neighbors (10 men shot in the WWII pattern, Oradour at the far end).

Collaboration vs resistance: Comply (quota paid, safe, humanity -3 over time as neighbors resent, small trading privileges: a pass), Quietly resist (short-weight the quota, hide stock, shelter a hidden airman), Resist openly (partisan cell: intel and weapons, reprisal risk rising 5 per week). Informing on a neighbor: humanity -20; hiding a hunted family +10.

## 6. Regional variation

| Region | Notes |
|---|---|
| mountain_west | Missile fields and bases (Malmstrom, F.E. Warren, Hill) are first targets; heavy air activity; remote ranches see few patrols but strategic roads are held. |
| appalachia | Hard to occupy: hollows; partisans ideal; occupier relies on collaborators; reprisal burn villages. |
| desert | Border and base proximity; open roads; heavy patrol; water points seized. |
| north_woods | Light occupation; border crossing and wood patrols; refugees from the south. |
| plains | The silo and grain are the target: heavy requisition; flat, observed. |
| pnw | Port and ship landings; heavy early presence; urban resistance; bridges. |
| upper_midwest | Industrial requisition (factories, trucks); the Great Lakes shipping seized. |
| new_england | Coastal landings; towns forced to billet; town meetings as collaboration arena. |
| ozarks | Guerrilla country; reprisals; many hunters; remote. |
| hill_country | Heavy armed population, base Fort Cavazos nearby; fighting early, then gray-zone. |
| rust_belt | Industrial requisition and labor drafts; large collaborator class; heavy ID checks. |

## 7. What the player sees and hears

Radio: the occupier's "Proclamation No. 1" read in two languages; a "Free Valley" voice at night; BBC-style "personal messages" analog ("the blue goat sleeps at noon" as a resistance signal that unlocks the partisan option); ration notices; curfew times; lists of hostages. Day cards: "Day 12. A notice on the church door: surrender all firearms by Friday." "Day 74. Curfew begins at eight. A truck idles at the bridge all night." Title: "Foreign troops are in the valley."

## 8. Decisions and rich vs poor

Decide: hand in or hide guns, quota or short-weight, shelter or report, black market or ration card, flee or stay. Rich: bribes (a colonel's price list, $1,000 and a case of whiskey per exemption), forged papers ($800 each, 40% fail), pre-dug caches, a fake wall, a generator to run in curfew, fuel for flight before day 5, a second home abroad or in a quiet county. Money works until the currency decree; silver and goods after. Poor: tight hiding; walk to a farm; join the committee for protection; labor trades.

## 9. What makes it fun

A tense, civilized horror: you talk to the enemy, you decide what to give. Hiding things in the compound (stock, people, radio) is a build puzzle. Moral choices are real and the report card names them. Tier timers give escalating drama and a preparation window.

## 10. Numbers and hook seam

Variants: `occupation` (default; as above), `soft` (a friendly-ish occupation: grid back C 0.5 in 30 to 60 days, no tier 3), `contested` (front lines move; shares with civil_war's holder mechanic; occupier flips). Tier clock fields in `fx`: `tier`, `tierDay`. Requisition cadence 14 days; quota 10 to 25% of visible stock; curfew hours 20:00 to 05:00 (the existing day clock; stealth bonus); search p 0.1 (0.35 with informant); informant fraction 0.125 (tier 1 to 2) to 0.2 (tier 3); reprisal hostage roll p 0.3 per ambush within 3 miles; forced labor 60 days.
Hook seam: `src/sim/disasters/invasion.ts` and `src/sim/occupation.ts` (shared with civil_war; pure functions `nextTier`, `requisitionDue`, `searchRoll`, `reprisal`). `encounterWeights` adds `partisan`, `informant`, `checkpoint_stop` through `ExtraEncounterKind`; `daily` advances tiers and quotas; `priceMods` currency decree; `radioBulletins` proclamations; `oasisWeights` (law x2, fuel x1.5, banks x1.5) so the contrast reads at once; `look` convoys. Existing `countyCrossings` consumed for the bridge checkpoint; `gate.government` hindrance becomes an "occupier relations" flag.

## 11. Chaining

Into: `civil_war` (backing faction), `lawless` (when the occupier withdraws, 40%), `financial` (currency decree), `mass_exodus` (columns of refugees ahead of the front, 35%). Out of: `global_famine` (month 8 to 14, in the Dutch pattern, 20% if tier 3 and fate `never`), `lawless` at liberation (reprisals). Cyberattack or `grid_down` as the opener (30%).

## 12. Invaders (owner decision, 2026-11-17)

The occupier is a real state that could plausibly invade, chosen at the hit from the region (seeded on the run; most seeds follow the lean). Code: `src/sim/invaders.ts` (pure data and the region lean), wired through `sim/disasters/invasion.ts`, `sim/orderEncounters.ts` and `sim/dayCard.ts`. The chosen id is `disaster.fx.invasion.invader` (no save bump).

| Invader | Regions (primary) | Force and authority | Papers and money | Style |
|---|---|---|---|---|
| China (Pacific side) | pnw, desert, mountain_west (by road) | the People's Liberation Army under the Pacific Military Administration; the State Security Bureau | household register card, travel permit; occupation yuan | Register posts: card scanned, face matched to photo, the clerk copies every name in the household; a "fee" to the clerk; procurement notices. |
| Russia (northern front) | north_woods, upper_midwest, new_england, rust_belt, appalachia, plains | the Russian Army under the Northern Military Command; the Federal Security Service | occupation passport, propusk; occupation rubles | Filtration posts: phones scrolled, a man in a plain coat asks the same question three ways, a tent for those sent aside; the commandant's office issues requisition orders. |
| Coalition (an axis of three: Russia, China, Iran) | ozarks, hill_country | the Combined Command; the Joint Security Directorate | joint registry card, joint pass; settlement notes | Joint checkpoints: three flags, a liaison officer for each partner, notices in three languages that do not always agree; nobody can say who took the envelope. |

Lean (shares of China / Russia / coalition): pnw 90/10/0, desert 90/0/10, mountain_west 85/15/0, north_woods 5/95/0, upper_midwest 0/92/8, new_england 0/92/8, rust_belt 0/90/10, appalachia 0/60/40, plains 15/60/25, ozarks 0/20/80, hill_country 10/0/90. Interior regions (mountain_west, rust_belt, appalachia, plains, ozarks) get a hit headline that says the coasts fell first and the column came by road; the mechanics are the same.

Forcing one: variants `pacific`, `northern` and `axis_coalition` (weight 0, never rolled) in Free build / God Mode and the Scenario picker "Invader" select; they play like the plain occupation. `soft` and `contested` still work and take the region's invader.

Tone rule: the villain is the occupying state apparatus (officers, political officers, security services). Ordinary people of that nationality, conscripts and decent soldiers included, stay human; the lost-soldier card stays sympathetic. No ethnic caricature, slurs, stereotyped accents or mocking of languages; translated words are few and short (`Zhengjian`, `Dokumenty`, `Spasibo`). A blocklist test (`sim/invaders.test.ts`) guards it. Neighbors who collaborate or resist are the moral texture.
