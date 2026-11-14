# Playtest 3: rich versus poor, and a first-time player's pass

Branch `claude/playtest3`, on `origin/main` at `5f6ec04` (after the bunker-hiding, defense-payoff, rituals, oasis and crews merges). Everything below is measured with the existing sim, not changed by this PR: the only game change is one CSS fix (problem 10). New tooling: `scripts/wealth.test.ts` (the wealth harness), `scripts/playQa.firsttime.mjs` (the first-time scenario) and two small harness edits (`FUNDS` and `LANDSHARE` in `scripts/playtest.test.ts`; the `Continue` button in `scripts/playQa.mjs`). Screenshots are in `docs/shots/playtest3/`.

## Verdict in five lines

1. **Money buys speed, almost not at all safety.** A rich family has its four basics (roof, water, power, food) in a median of 60 days; a poor one takes 292 days (4.9 times slower). But people lost per run only fall from 1.66 to 1.42, and the 95 % interval on the paired difference (0.24 people) includes zero.
2. **The wealth gap is the wrong shape:** big where it matters least (a 3-year peace lets almost everyone finish), nearly flat where it matters most (the raids). Wipes: Standard 35 % poor, 29 % middle, 21 % rich; Hardcore 44 / 38 / 32 %.
3. **Poor families have a viable strategy, and it is the same one the rich use: hide.** A hide gate costs a poor family someone 4.0 % of the time, a rich one 3.5 %. That equalizes too much, and it makes spending on defense look pointless.
4. **A rich family runs out of things to buy by about day 160** and ends with a median $182k unspent (poor: $47k).
5. **The new systems are discoverable, with one exception:** the bunker hide cost card and the raid breakdown card read well; rituals have no caption anywhere outside the Cutaway view.

## 1. The runs (how, and what could not be done)

`scripts/wealth.test.ts`. The same bot plays the same seeds at three wealth levels, so a gap between rows is money, not a different player.

| Level | Start | Source (`sim/startFunds.ts`, `sim/site.ts`) |
|---|---|---|
| poor | full-time family, $450k nest egg, day jobs | floor of the full-time range |
| middle | full-time, $800k | the lifestyle's own budget |
| rich | financially independent, real roll $1.0M to $2.0M, passive income, no jobs | the independent range |

Each level puts at most 40 % of its nest egg into land and buys the biggest listing under that (`LANDSHARE`). Mean land bought: poor 35 acres for $143k, middle 60 acres for $227k, rich 77 acres for $373k (listing prices from the market: 5 acres $44k to $430k, 80 acres $74k to $1.0M by region). All three follow one spend policy that mimics the crew and Idle-cash cards: hire crews on unfinished work while the cash covers a week of wages plus a $40k reserve (2 crews plus one per $150k spare), and hire contract guards at one per $120k over a $150k cushion.

**Main sweep (576 runs, 16 seeds):** bot `prepper` (builds the bunker, hides from nearly everything), regions mountain_west, appalachia, plains; disasters grid_down and financial; Standard and Hardcore; 3-year peace; 365 days after the hit. **Supplements:** `fortress` and `homestead` bots (5 seeds each, 360 runs, same cells); an 18-month peace (108 runs, 6 seeds, Standard only, prepper). 1,044 runs in all, 0 bugs, NaNs or stuck runs flagged.

**Could not run / limits, stated plainly:**
- 16 seeds, not 20, for the main sweep; 5 and 6 seeds for the supplements. Cell counts are 96 per wealth level per difficulty; read differences under about 8 points as noise.
- "Poor" is the floor of the *full-time* range ($450k). The game has no household poorer than that except the weekender ($400k to $750k, split between town and land), which I did not run. A real $50k family is not in the game.
- Two disasters and three regions only, and one bot style per sweep. Neighbors' mutual aid, barter and the bug-out trip are not exercised by any bot, so "running" and "mutual aid" as poor strategies are **untested here** (only hiding is).
- The spend policy is mine. A smarter rich bot (walls first, a gate house, dogs, cameras, a clinic) was not written; the `fortress` supplement is the closest test.
- `raids` counts siege-wave gates (`e.wave`); other fights (scouts, strangers) are in the "lost" totals but not in the per-gate rates.

### Results (prepper, 192 runs per level)

| | poor | middle | rich |
|---|---|---|---|
| Survive to the end (not a wipe) | 60 % | 67 % | 73 % |
| Standard / Hardcore survive | 65 / 56 % | 71 / 62 % | 79 / 68 % |
| Lost at least one person | 61 % | 61 % | 58 % |
| People lost per run | 1.66 | 1.53 | 1.42 |
| Siege-wave gates per run | 6.0 | 6.0 | 6.4 |
| Gates that cost someone (hide / defend) | 4.0 % / 18.8 % | 4.0 % / 10.3 % | 3.5 % / 8.3 % |
| Hide gates : defend gates | 1,137 : 16 | 1,120 : 29 | 1,173 : 48 |
| Four basics done, median day (p25 to p75) | 292 (216 to 390) | 64 (58 to 82) | 60 (2 to 66) |
| Home finished, median day | 256 | 60 | 58 |
| Four basics before the hit (3-year / 18-month peace) | 86 % / 78 % | 98 % / 94 % | 99 % / 100 % |
| "Defense" tick before the hit | 1 % | 7 % | 32 % |
| Final defense score (0 to 100) | 27 | 35 | 41 |
| Food on hand at the end (median days) | 375 | 603 | 512 |
| Cash unspent at the end (median) | $47k | $43k | $182k |
| Spent on crews / materials / guards (mean) | $39k / $265k / $6k | $150k / $381k / $49k | $283k / $362k / $419k |

Paired by seed, region, disaster and difficulty (192 triples): poor to rich saves a median of 229 days to a roof; fewer people were lost in 59 triples, more in 47, equal in 86. Poor minus rich: 0.24 people per run (95 % bootstrap interval -0.01 to 0.49); middle minus rich 0.10 (-0.12 to 0.32). Causes of loss are the same shape at every level: fights first (215 / 185 / 156 people), then "other" and hunger (hunger 23 / 15 / 24), taken 28 / 23 / 19.

Wipes (everyone gone), prepper: Standard 35 / 29 / 21 %, Hardcore 44 / 38 / 32 % (poor / middle / rich). By region the gap is largest in mountain_west (45 % to 62 % survive) and plains (73 % to 86 %), and absent in appalachia for lives lost.

### Does money buy safety if it is spent on defense? (`fortress`, 60 runs per level)

| | poor | middle | rich |
|---|---|---|---|
| Wipes | 68 % | 62 % | 55 % |
| People lost per run | 2.37 | 2.32 | 2.28 |
| Final defense score | 36 | 49 | 56 |
| Spent on crews | $73k | $235k | $506k |

The score rises by 20 points and lives lost barely move (2.37 to 2.28). The standing fortress also loses more than the hiding prepper at every wealth level (wipes 55 to 68 % against 21 to 44 %), as in playtest round 3. `homestead` (no bunker, 60 runs per level): wipes 62 / 55 / 53 %, people lost 2.33 / 2.47 / 2.77, so with a wall-less, bunker-less bot the rich lose slightly *more* (they attract and stay in the same fights with the same strength).

## 2. Rich versus poor: the design principle checked

Owner principle (DECISIONS 2026-11-13): "money solves everything: things can be built quickly with a lot of money and manpower, an advantage for wealthy families; a poor family still takes much longer by hand."

- **Built quickly with money and manpower: yes, and strongly.** Roof and basics at 60 days against 292. Rich crews cost $283k a family and land with permit waits (homes 21 days times the county's strictness) as the floor, so no amount of money gets a roof before about day 25 to 60.
- **Safer: weakly.** Survival improves 13 points in 3-year runs, but lives lost per run only 15 %, and more cash on defense does not add much (fortress). The wealthy advantage is real but small and noisy.
- **Does the poor family still have a viable path? Yes, but only one: hide.** They are operational (basics) before the hit in 86 % of 3-year runs and 78 % of 18-month runs, so the long peace forgives them. Poor survival is 60 % overall and 45 % in the harshest region (mountain_west: 77 % of poor runs lose someone, 2.4 people a run, against 73 % and 2.0 for the rich there). A poor family that cannot afford the bunker hides in the timber; the gate card's own odds ("they find the place lived in about 5 in 10") are the same ones.
- **Shape: too small where it should hurt, too big where it does not.** The gap should show up in what a crew of raiders meets at the gate. Today a rich compound's extra $400k becomes three guards and a better score that the battle resolves almost the same way as the poor one's. Speed advantage (4.9 times) is large but only matters in the first 8 months, which the 18-month to 5-year peace hides.
- **Where money does show:** food on hand (600 against 375 days), crews, guards (2.5 against 0.1), land (77 against 35 acres), and 32 % reaching "defense ok" before the hit against 1 %.

Verdict: **the speed gap is about right (a clear 4 to 5 times), the safety gap is too small, and the equalizer (hiding) is too strong.** Fixing the third makes the second possible.

## 3. First-time player pass (real UI, Playwright)

`flock /tmp/cb.lock node scripts/playQa.mjs firsttime <outDir>`: wizard (Mountain West, Standard, an 18-month grid-down), the goal card's primary button, the starter compound, the shop, Projects, play to the first siege. Placement uses the same `cb.tool` call a click makes, as the other hands-on scripts do; the clock advances through the store (`advance(25)`), not at real speed. Nine images, all viewed:

| Image | What it shows |
|---|---|
| `01-start-rich-day0.jpg` | Day 0 of a $710k family: tents, 17 degrees F and snow, "4 people have no bed". Goal card: "Lay out a starter compound" |
| `02-starter-compound.jpg` | The ghost compound: 8 pieces, about $118,900, "Place all / One by one / Cancel" |
| `03-shop-catalog.jpg` | Catalog with "Order what the plans need" (about $148k, leaves $558k) |
| `04-projects-crews-permit.jpg` | Four crews hired, each "$0 so far" and waiting 7 days on the county permit |
| `05-shelter-gate-card.jpg` | A neighbor family asks for shelter (day 146) |
| `06-raid-gate-card.jpg` | Wave 1: a county requisition team; odds, toll, Hide / Parley / Trade / Defend |
| `07-raid-breakdown-card.jpg` | The morning-after card with "Why it went this way" (HELD / FAILED lines) |
| `08-bunker-hide-cost-card.jpg` | "If you hide in the bunker": drain, find chance, shootout |
| `09-dinner-ritual-cutaway.jpg` | Dusk dinner at the table, stove lit, Cutaway view |

What worked: the starter compound is one tap with a total price; the shop's "Plans are short 13 materials" button is the best first-hour control in the game; the gate card and the breakdown card explain themselves; no modal covered a view that mattered (except the harness leaving the shop open, below).

Hands-on notes:
- **The rich family starts in tents in the snow and stays there about 8 weeks** (`01`, `04`). The "suggested" home is a timber cabin ("about 8 weeks for ~$84,000 more"), though a modular home needs 128 hours (about a week with a crew, about $7,700). Cash cannot shorten the 7 to 21 day permit review either.
- **Food is a secondary goal.** Following only the big goal button, the family had "Food on hand: 2 days" at day 146 with $486k in the account (`05`). It is under "Also open".
- **Goal card heading clipped:** "ALSO OPEN: START ANY OF THES" (`02`, `01`). Fixed in this PR.
- **The Pay a toll option is greyed with "you do not have enough to offer"** for a family with $230k: the toll is goods (2 fuel, 3 canned, 1 meds), and the stores are closed. Correct, but a first-timer reads it as a bug; one clause ("cash is no use now") would help.
- **The hide cost card is clipped inside its box** at 1100 by 700 (`08`): the "If found" sentence stops at "the family fires first)" and scrolls. The Hide / Parley chips end in "...".
- **Two cards in a row for every shelter family** ("The door is open", then "They are staying"): fine, but with my harness each one needs the Continue button, and the card kept reappearing because the harness looked for "Carry on" (a harness fix, not a game bug).
- **Not verified live:** the dinner ritual was captured by `ritualShots.mjs`, not reached in my own run, because the report card left the clock inside a cutscene. The `evening` step in my script was covered by the aftermath report.

## 4. Top 10 problems, ranked by impact

1. **Money does not buy survival.** People lost per run 1.66 to 1.42; the interval includes zero; fortress lives lost 2.37 to 2.28 while the defense score rises 36 to 56. The battle's outcome depends on crew strength and stance, not on what the compound cost. Look at `sim/encounters.ts` (`fightOdds`, `postureOf`, `defenseOf`), `sim/battle.ts`, `sim/defenseReport.ts`. Fix: let guards, dogs, cameras and wall tier raise the *first-contact* outcomes (deterrence, scouts turned back, raiders breaking early), not only the fight, and show the rise on the gate card's odds.
2. **Hiding is dominant and wealth-blind.** 3,400 hide gates against 93 defend gates; a hide loses someone 3.5 to 4 % of the time, a defend 8 to 19 %. The default prepper bot never fights, so the wealthy defense never gets used. `sim/bunkerHide.ts` (`bunkerFindChance`, `drainStores`, `hidePreview`), `sim/encounters.ts` (`hideFoundChance`). Fix: make a found hide worse the more there is to find (a rich stocked place is a target), and make a fought raid at a strong wall clearly cheaper than a hide for a family that paid for the wall.
3. **A rich family has nothing to buy after about day 160.** The "defense ok" tick arrives on day 158 and the median end balance is $182k (mean 272k). Beyond crews, guards (max 3) and land, no sink. `sim/richSinks.ts` exists but the harness only buys it behind `SINKS`. Fix: a second tier of sinks the Idle-cash card offers (a clinic, a gate house, a power plant, a second well, a hired militia-style watch), each with a measurable effect.
4. **Home advice ignores time.** `sim/homeAdvice.ts` picks "the cheapest home that closes the bed gap" from `FIRST_HOMES = cottage, timber_cabin, log_house`, never the modular home (128 hours) or stilted house. A rich family in 17 degrees F gets an 8-week plan. Fix: when the crew is affordable, prefer the fastest home that closes the gap, or add "Modular home (about 1 week)" beside it.
5. **No shelter bridge for a family with cash.** Day-0 housing offers only "Buy 2 tents $360" (`ui/HousingPanel.tsx`, `sim/housing.ts`). A rented RV, motel weeks or the `rv_camper` couch kit should be one click for $5k to $20k, and permits (`sim/paperwork.ts` `reviewDays`) could take an expedite fee. This is the clearest place to express the owner's principle.
6. **Poor families lose their first 8 months in tents with no feedback that it is slow.** Median 256 days to a finished home; p90 626; 14 % of poor runs are not at four basics before an 18-month hit. The UI shows the crew price, not the family's own ETA until Projects. `sim/pace.ts`, `sim/crewNudge.ts`: show "about 40 weeks by hand" on the stake button and on the day-0 goal.
7. **The Get-operational "Defense" tick is almost unreachable.** Reached before the hit in 1 % (poor), 7 % (middle), 32 % (rich); the guards add little. `sim/operational.ts` (`DEFENSE_OK = 45`) against `defenseReport`. Either the threshold is too high or guards and a game fence count too little; a first-timer can never finish the checklist.
8. **Food is not in the primary goal chain** (see section 3): 2 days of food at day 146 with $486k. `ui/feel/GoalsCard.tsx` (`alsoOpen`), `sim/guidance.ts`. Promote "stock a month of staples" ahead of Drive/Fence once the home is staked.
9. **Rituals are invisible outside the Cutaway.** The only text is "family evenings" inside a person's mind popover (`sim/mind.ts:425`); no caption in the Family panel, the log or a photo prompt. `ui/PeoplePanel.tsx`: add "Dinner together tonight" / "Eating in shifts after the breach", and offer a photo (`sim/photos.ts`) when calm is high at dusk.
10. **Small clipping and wording defects:** the goal heading (fixed in this PR, `ui/feel/GoalsCard.tsx`); the hide cost box and chip descriptions clipped (`ui/GateCard.tsx:162`); "Pay a toll" greyed with no reason it is goods (`sim/parleyChoices.ts`).

## 5. What feels good, what feels flat

**Good:** the starter compound ghosts with one price and Place all; the shop's one-tap "order what the plans need"; the gate card's plain odds; the breakdown card's HELD / FAILED lines are actionable ("No tower: nobody had the high ground"); the hide cost card makes the trade honest; a lit table at dusk reads as a home; the wave-1 requisition scene (a deputy with a clipboard) is a good, human opening.

**Flat:** the long peace for a family that has already built everything (most of a 3-year peace for a rich family, after day 160); money after day 160; hiding as the answer to every gate; the second of two stacked cards after every shelter arrival; the first view of the world (snow and a tiny house, `01`) before the camera is framed.

## 6. Reproducing

```
WEALTH=16 WEALTH_SHARD=0/3 WEALTH_OUT=/tmp/w0.jsonl npx vitest run scripts/wealth.test.ts      # also 1/3, 2/3
WEALTH=5 WEALTH_STRATS=fortress,homestead ...  ;  WEALTH=6 WEALTH_PEACE=short WEALTH_DIFFS=standard ...
flock /tmp/cb.lock node scripts/playQa.mjs firsttime /tmp/ft 5971
```
Rows are JSON lines (opDay by checklist item, crew / materials / guard spend, per-gate stance and people lost). The wealth harness resumes from an existing output file.
