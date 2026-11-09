# Balance playtest 3: Cozy later-years sinks, house rules, and the weakest Standard rows

Scripted bots (`scripts/playtest.test.ts`), seeds fixed by table position. "Before" is main at 07fdf2a (#260); "after" is this branch (house rules + Cozy estate sinks, merged with that main). New column **$ at end** in the report (cash when the run stops). Cozy tables use `YEARS=6` (about three years after the hit), 36 runs; Standard and Hardcore use the default horizon (about 400 days after the hit), 36 runs each.

## 1. Cozy: later-years money sinks (`sim/estate.ts`)

| Cozy, 36 runs, YEARS=6 | before | after |
|---|---|---|
| wipes | 9 | 9 |
| alive with everyone | 20 | 20 |
| grades A/B/C/D/F | 8/11/4/1/12 | 8/11/4/1/12 |
| $ at end, median | $334,341 | $315,508 |
| $ at end, mean | $400,855 | $390,316 |
| runs ending over $500k | 12 | 12 |
| runs ending over $1M | 2 | 2 |

No outcome changed in any row (ending, grade, alive, lost-to are identical row by row): the sinks cost money and give morale, nothing else.

Where the county is still up, the sinks bite. Rows that moved (end cash, before to after): drought/idle $187k to $94k, drought/homestead $167k to $116k, drought/fortress $339k to $170k, grid_down/prepper $736k to $722k, pandemic/fortress $638k to $613k, ash_winter/homestead $489k to $480k, financial/homestead $925k to $911k.

**Finding: most Cozy cash is idle after the collapse, and no peacetime sink can reach it.** In 25 of 36 rows the world falls and the county, banks and stores stay down for the rest of the horizon, so the property tax, the insurance and the comfort tier (all paid only while those services run) do nothing there; the 1M+ rows are all of that kind (grid_down/idle $1.02M, zombies/idle $1.13M, financial/homestead $0.91M). Post-collapse cash only spends at the black market, in barter and on the richSinks goods; the bots do not buy those. See the design questions in the PR.

## 2. Standard and Hardcore are unchanged

Row-by-row diff of the report columns (ending, grade, alive, lost-to, hungry days, days, $ at hit, $ at end, built at hit, fights, hid, trials): **identical** for Standard (36 runs) and Hardcore (36 runs), before vs after. The estate rules read `disaster.difficulty === 'cozy'` and the house rules only run when the player calls a vote, so a run that never votes is bit-for-bit as before. The passive bot (Standard, 9 runs) is identical too.

## 3. House rules (`sim/rules.ts`)

Not exercised by the bots (they never call a vote; that is the point of "nothing changes unless you vote"). Covered by `rules.test.ts`: stage gate, determinism, kin vs newcomer leanings, cooldowns, standing effects on morale / loyalty / watch, the sore side, breaking "kin only", and a 40-day live run of a 19-person hamlet under all three rules with no NaN.

## 4. The weakest Standard rows

Standard main, 36 runs: idle and homestead carry most of the F grades.

* **idle** (the do-nothing control): the family dies of hunger about 70 days after the hit in 6 of 9 runs. The start stock is two cases of canned food (about one day for four people). That is Standard working as designed, not a defect. No change proposed.
* **homestead**: the bot keeps 3 months of staples, so hunger is not the first problem. The log of grid_down/homestead shows the outhouse and the kitchen garden **stalled for the whole run waiting on fieldstone** ("STILL STUCK: order 18 fieldstone ($5,475)" with $571,590 in the bank). Site works (a retaining wall, a cut into the slope) add materials the blueprint bills do not list, the bot's `orderNeeds` never orders them, and the bot starts a new plan only while fewer than 2 are unfinished, so the three fields were never planted. A real player gets the stuck card and presses Order. With the bot pressing that button (`STUCK_ORDERS=1`, the same `stalls.stuckProject` lines the card orders):

| Standard, 9 disasters each | wipes | alive at the end | grade F | grade A/B |
|---|---|---|---|---|
| homestead, as recorded | 6 | 3 | 7 | 1 |
| homestead, `STUCK_ORDERS=1` | 3 | 6 | 3 | 3 |
| prepper, as recorded | 5 | 4 | 5 | 4 |
| prepper, `STUCK_ORDERS=1` | 2 | 7 | 2 | 7 |
| fortress, as recorded | 5 | 4 | 5 | 2 |
| fortress, `STUCK_ORDERS=1` | 6 | 3 | 6 | 2 |

So about half of the weak homestead and prepper rows were a bot that ignored the stuck card, not Standard being too hard. I left the default bot as it was (all earlier tables stay comparable) and put the fix behind `STUCK_ORDERS=1`.

* Also tried and rejected: opening the homestead bot with three fields before the outhouse and garden (`FIELDS_FIRST`, reverted): wipes 6 to 6, no gain, because the failures come 70 to 180 days after the hit, before a field could feed anyone.
* **Misleading checklist (proposal, not built):** *Get operational* marks Food done as soon as one garden is finished. A garden is about 5% of a family's year (250,000 kcal against about 3,000,000); three fields about 55%. Proposal: mark Food done at 90 days put by **or** growing food covering half a year (`farmPlan.outlook().coverage >= 0.5`), and offer "Plant a field" while it is short. About 10 lines in `sim/operational.ts` plus one expectation in `compoundBoard.test.ts` (a garden alone no longer counts as done). I built and tested it (all operational / board / first-hour tests pass except that one expectation), then backed it out: the bots do not read the checklist (passive bot identical before/after), so it cannot be shown to move a number.
