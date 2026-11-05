# Balance playtest 2 (sim level, merged main at 8d847a9)

Scripted bots (`scripts/playtest.test.ts`) on main after #158 / #168 / #169 / #170 / #172 / #177 / #181 / #182 / #184 / #185. 36 two-year runs per table (9 disasters x idle / homestead / prepper / fortress, seeds fixed by the table position), one vitest at a time. Raw reports were kept out of the repo; the numbers below are the aggregates. No balance numbers were changed.

"Wipe" is `ending = wipe`. "Fostered" is the playtest's `line alive, nobody home (fostered)` outcome: every adult is dead, the children are wards of a neighbor, the line is not over. **Adults extinct = wipe + fostered**: that is the number a player would call "the family died".

## 1. Standard / Hardcore / Cozy / joiner modes

| Run | Strategy | wipe | fostered | alive (recovered / new normal / equilibrium / still going) | grades A/B/C/D/F |
|---|---|---|---|---|---|
| Cozy | all | 0 | 0 | 36 (10/9/5/12) | 10/13/12/1/0 |
| Standard, before #185 | all | 6 | 12 | 18 (5/3/7/3) | 4/9/1/4/18 |
| **Standard (main)** | idle | 1 | 6 | 2 | 0/1/0/1/7 |
| | homestead | 2 | 3 | 4 (1/1/1/1) | 1/1/1/1/5 |
| | prepper | 2 | 1 | 6 (1/1/4/0) | 2/4/0/0/3 |
| | fortress | 1 | 3 | 5 (2/1/1/1) | 1/3/0/1/4 |
| | **all** | **6** | **13** | **17 (5/3/6/3)** | 4/9/1/3/19 |
| Standard STAY=mixed ADMIT=0.5 | all | 7 | 13 | 16 (6/3/5/2) | 12/3/1/0/20 |
| Hardcore, before #185 | all | 14 | 10 | 12 (4/1/4/3) | 5/1/3/2/25 |
| **Hardcore (main)** | idle | 7 | 1 | 1 | 0/0/0/1/8 |
| | homestead | 2 | 4 | 3 (1/0/0/2) | 1/0/1/1/6 |
| | prepper | 3 | 1 | 5 (1/1/3/0) | 2/1/2/0/4 |
| | fortress | 3 | 4 | 2 (2/0/0/0) | 2/0/0/0/7 |
| | **all** | **15** | **10** | **11 (4/1/3/3)** | 5/1/3/2/25 |
| Hardcore STAY=mixed ADMIT=0.5 | all | 14 | 9 | 13 (5/1/4/3) | 8/3/2/0/23 |

Wall time: Standard 384 s, Hardcore 407 s, joiner modes 451 / 488 s, Cozy 389 s.

Comparison with the recorded numbers:

* Hardcore stays lethal: 15 wipes (record about 14/36), 25/36 adults extinct, 25/36 grade F.
* Standard wipes are 6/36 (not "mostly wipes"), the same as the pre-#185 tree and the 20:46 run on main-before-fostering+guests. Against the earlier "about 4/36" figure it is +2. Standard is fair in the sense that 17/36 runs end with the line surviving and 13/36 end in A or B, but adults-extinct is **19/36 (53 %)**, because 13 deaths are now labelled "fostered". If "fair" means "most families keep an adult", Standard is on the line. Bisecting the 4 to 6 drift was out of scope; the first sign is in the 07:50 to 20:46 span of today's merges, and #185 is not the cause (identical to its parent, below).
* Hardcore "nobody home" is now 10/36 (earlier 26/36 was before fostering ended most of those in the wipe column or kept the run going).
* No bot bug was flagged in any full run except one false positive (below).

Joiner coverage (STAY=mixed, ADMIT=0.5): about 2 to 29 joiners admitted per run; stays that actually used the richer options are rare: across both tables, rigs 0, modular 0, own_build 1, "qtr" (quarters) only in pandemic runs (5 to 29). Most stay picks "fell back" (2 to 8 per run), i.e. the mixed list is dominated by the bed fallback. That is worth a look but is a coverage finding, not a balance one: the bots rarely own what a rig / modular / own_build stay needs.

False positive (bot, not sim): Standard mixed `financial / homestead`: "money jumped $142,998". It is joiner cash (`joinerHome.ts`: 8 % of couples/families carry an extra $50-140k, plus relatives' savings) pooled on arrival. Not a bug; the bot's jump detector could subtract pooled joiner cash.

## 2. The PR #185 non-nobody-home differences: not a regression

I ran the full Standard and Hardcore tables on the tree before #185 (`b3eb208`, #183) and on main. The only code change in #185 that touches the sim is `nobodyHome()` gating `gateDay`, `requestShelter`, `shelterDay` and `take_in`. Row by row:

* Every row that differs is a `fostered` row, plus nuclear/homestead (1 survivor, a ward, "still going"). **No row without a nobody-home stretch differs.** Wildfire rows are identical in all three tables (all recovered, same days); I could not reproduce "wildfire recovered 0 vs 2" between the two trees. Likely that comparison was against an older main (before #181 / #182), not against #185's parent.
* The differences are encounter counts (for example grid_down/homestead 27 (6) to 8 (1) Standard, ash_winter/fortress 15 to 4): after the last adult dies, gate cards stopped, so no more fights, hides, or "overrun" outcomes are logged. That is the intended rule.
* Two outcomes moved:
  * Standard `zombies / fortress`: `equilibrium D 1/3 at day 440` to `fostered 0/2`. Trace (GATES log): from day 178 the adults are gone and, in the old tree, gate cards kept coming (hides on days 257 to 440); the bot's fortress took in one stranger ("You took in 1 person"), who became the sole survivor and ended the run as `equilibrium`. With #185 nobody is admitted, so the run stays fostered.
  * Hardcore `solar_flare / homestead`: `equilibrium F 1/3 at day 537` to `wipe 0/2 at day 675`. Same mechanism ("You took in 1 person" while nobody was home); now the wards' host households run out and the line ends.
* That is the "solar_flare wipe 12 vs 16", "zombies prepper wipe" and "nuclear homestead still going" noise: sequencing of gate cards after nobody-home, not a balance change. Design note: before #185 a stranger could inherit an empty homestead and keep a family "alive"; whether that should stay possible (a squatter taking over the place held for the wards) is a design question, not a bug.

## 3. "Everyone is gone but the run goes on" and real wipes

* Real wipes are still flagged: `tallyDay` wipes when no one is on the roster and no ward is away; the playtest only reclassifies as fostered when `wards.length > 0`. New Vitest in `src/sim/nobodyHome.test.ts` ("a real wipe is still a wipe"): everyone dead and no wards ends the run with `wipe`; with a ward away it does not. 
* grid_down seeds: seed 11 is grid_down/idle, seed 12 is grid_down/homestead (seed = 11 + 4 x disaster index + strategy index). Both end `fostered` in Standard and Hardcore with a ward away, so they are correctly not flagged. Their report-card lines do not say that children survived (they only list who "did not make it"), which makes a fostered run read like a wipe on the card. Recommendation: one report line ("The children are with the Petersens").
* Long mode produced three "everyone is gone but the run goes on" bugs (seeds 46, 53, 55 of the first long run; days 4816, 9583, 7538). Each coincides with the ending year of that run: a last death at the gate is tallied at the next midnight, so the check on the same day sees an empty roster with no ending yet. Fixed in the bot: it now flags only if the roster is still empty and unended a day later. Re-run of those three seeds: no flag. This was a bot false positive, not a sim hang.

## 4. Long game (40 years, 24 runs, all 12 regions x homestead / prepper + idle / fortress)

* 24/24 runs end in a wipe (2033 to 2058). In the previous committed long playtest 1 of 16 survived to 40 years (north_woods prepper, 2 generations). Heirs, aging and orphans coming of age are therefore **barely exercised**: "born here" is 0 to 2, generations 0 everywhere, 2 fosterings logged (both moved on to another household), 0 "came home to the place", 2 wards lost when no household was left. The scripted bots do not carry a family to the second generation, so the heir path has unit tests only.
* Eras run (several rows pass 4 to 5 eras, up to 7 milestones, dynasty points up to 1,310). Rust belt homestead (seed 61) held 26 people over its life.
* Nothing stuck, no NaN or Infinity, no throw, no runaway money or endless starvation observed (the only assertion failures were the three false positives above, now fixed). Remaining flag: long-run survival is about 0 %, so a future bot needs a heir-seeking strategy (keep children, stay small) before long mode can test the generational code.

## 5. Balance flags: data and recommendations (no numbers changed)

* **Cozy families end rich with nothing to spend.** Cozy `$ at hit` median $344k, max $1.26M; only 2 of 36 have under $50k. Standard median $260k, Hardcore $262k (same budgets, so Cozy's is the starting grant and cheaper disasters). Recommendation: keep the money, give it sinks (see #184's spend guidance: hire-a-crew prompts, long-lead purchases, a "comfort" tier, property tax or insurance in later years) rather than shrinking the start.
* **Cozy starving families never die.** Confirmed with data: 16/36 Cozy runs had over 30 hungry days, 12 of them over 300; for example nuclear/idle 726 hungry days with 4/4 alive, solar_flare/idle 727, zombies/idle 719. In Standard and Hardcore no run with 200+ hungry days kept everyone. Recommendation: either keep this as the explicit Cozy promise and say so on the difficulty card ("no one starves to death, hunger just hurts morale and grade"), or let Cozy hunger kill very slowly (children and the old first) after about 120 hungry days. Data favors the first as long as hunger visibly costs grade and morale; 726 days of hunger with nothing happening is the part that reads as a bug.
* **Crews cost about $70k versus about $47k shown.** From the code (`crews.ts`): the quote is remaining person-hours x $60, rounded; the bill is the person-hours actually worked x $60. They agree except when spring-thaw mud slows work (hours billed go up by 1 / mud factor), when a well driller adds footage (billed on top), when fixes are queued after hire, and when the bot hires one crew per building across a whole build (the quote shown is per building). I could not reproduce a 1.5x gap from a single quote, so I did not touch it; the likely cause is the sum over several buildings plus the extras. Recommendation: show the quote with "plus mud days and drilling" and add a crew-paid column to the playtest to settle it with data.
* **Hardcore nobody-home was 26/36 earlier.** Now 10/36 fostered + 15 wipes; the rest of the old nobody-home share has moved into wipes or been cut by the gate rule. Hardcore stays lethal, and idle is a certain wipe (7/9). Recommendation: leave.
* **Standard adults-extinct at 53 %.** Not asked for, but the headline risk: either label Standard's expectation clearly, or look at the weakest rows (idle 7/9 F; homestead 5/9 F; grid_down/homestead at 7 % food covered, 117 hungry days). A cheap lever would be a better homestead bot opener (more fields early), because the homestead and idle strategies carry most of the F grades.

## Files

* `scripts/playtest.test.ts`: the "everyone is gone" check waits one day (a last death at the gate); `SEEDS=` filter for long mode.
* `src/sim/nobodyHome.test.ts`: real wipe test.
