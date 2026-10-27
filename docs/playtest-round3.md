# Playtest round 3: a smarter bot, a longer game

The scripted playtest (`scripts/playtest.test.ts`) plays four strategies against nine disasters for two years each (36 runs, `PLAYTEST=1`). It also plays a 40-year long game through the eras (`PLAYTEST=long`). This round the long game covers every region: a homestead and a prepper in each of the seven, plus the idle and fortress baselines, for 16 runs. The full outputs are `playtest-report.md` and `playtest-long.md` at the repo root.

## What the bot does now

- **Fields for the mouths.** Before and after the collapse, the bot keeps enough fields to grow a year of food for everyone. It counts a year of eating against what a field yields, less the garden and the hens. It keeps at least one field per 1.5 mouths and at most 16. The yield is the book figure (`FIELD_KCAL × (0.6 + 0.08 × best gardener) × soil`) until it has seen a harvest. After that it uses the mean of the last three harvests per field, so it learns from short northern seasons, hail and drought. It plants only while the seed and fence for a field are on hand (not already owed to a field waiting on that stage), with no more than two fields open at once.
- **Seed and fence put by.** While the stores still deliver, the bot keeps seed, lumber, wire and hardware on hand for the fields still to come. That is the number wanted plus a spare: 3 for the homestead, 6 for the prepper. It also keeps 3 extra hardware kits for repairs.
- **Seed saving: not in the sim (a gap, not invented).** A field, once planted, harvests every year without seed. Seed is only spent planting a new field. Nothing turns a harvest into seed. GDS §10.5 lists "seed saving for next year". See the questions below.
- **Taking people in only when food covers them.** The stores must last everyone, newcomers included, until the next harvest is in. The harvest the fields have been making must then feed them all, with a margin: 10 % for the homestead and 25 % for the prepper, which also wants 240 days of stores per head. Before, both strategies took in anyone while the shops were open. An intermediate rule let a big pantry stand in for the harvest. In the long game, families then ate the pantry down with the newcomers and starved.
- **Hiding.** The homestead already hid when outgunned. The prepper already hid from everything. I tried "fight when the place clearly outclasses them" (their strength under 0.6 × the defense) as an option, `PREPPER_FIGHTS=1`, and it lost lives. Grid-down went from 11/11 alive to 7/13, the solar flare from 7/7 to 4/7 and the ash winter from 6/6 to 4/6. So hiding stays the default.
- **A pantry for the fortress:** a siege year of staples, 200 canning lids and the hygiene stock. Before, it had no food at all.
- **Upkeep a player would do:**
  - It repairs a broken pump with a hardware kit and fits a spare into whatever the EMP fried. Before, it did neither.
  - It keeps a spare well pump.
  - It marks woodlot trees for next winter's firewood once the yard is closed. The world's trees stand in as numbered ones.
  - It keeps ordering for as long as trucks deliver after the hit, not only before it.
- **Ransom (main #50):** if a crew holding one of the family sends word, the bot pays when it can, haggles when six-tenths of the price is on hand, and otherwise refuses. Every 10 days it sends word that it will pay while there's a lead. The idle family never pays. No ransom offer came up in these 52 runs.
- **Harness fixes:**
  - **Fights were counted twice.** Every day's step clones the state, so the last battle on file was counted again at every later gate encounter. Grid-down / homestead listed 22 fights; it had 3.
  - **The harness now tallies the cause of each loss:** a fight, taken, hunger, thirst, radiation, wounds, sickness, old age or other.
  - **It counts repeated log lines**, flags money that jumps by more than $100k in a day, and flags runs where everyone is gone but no ending was given.
  - **`YEARLY_EVERY=<days>` and `SEED=<n>`** narrow the `YEARLY` trace to one run. **`GATES=1`** prints every fight with its strength against the defense.

## Outcomes, before and after (36 runs, two years each)

The "before" column is `origin/main` at the start of this round. It was re-run and matches the committed report.

| | Wipes | Alive at the end | Starved (wipes with 59+ hungry days) |
|---|---|---|---|
| **Before** | 21 of 36 | 112 / 215 | 16 |
| **After** | 14 of 36 | 83 / 154 | 8 (6 idle, 2 fortress after raids took the pantry) |

| Strategy | Wipes before → after | Alive before → after | Notes |
|---|---|---|---|
| idle | 7 → 7 | 6/38 → 6/38 | Unchanged by design: no pantry, no fields. |
| homestead | 5 → 3 | 28/55 → 22/39 | No more starvation. All 3 wipes are a single lost fight (2–4 killed or taken). |
| prepper | 2 → 0 | 73/84 → 39/39 | No deaths, but it takes in far fewer people, so the grades go A → B on humanity. |
| fortress | 7 → 4 | 5/38 → 16/38 | The pantry helps. It still always stands and fights, and loses (see Q2). |

Run by run, before → after:

| Disaster | idle | homestead | prepper | fortress |
|---|---|---|---|---|
| grid_down | wipe → wipe | wipe 0/8 → equilibrium 3/6 | recovered 16/16 → recovered 4/4 | recovered 3/5 → recovered 5/5 |
| nuclear | wipe → wipe | 8/8 → wipe 0/4 (a fight) | 12/12 → 4/4 | wipe → wipe (raided) |
| drought | 4/4 → 4/4 | new_normal 7/7 → 4/4 | new_normal 4/4 → 4/4 | 2/4 → 2/4 |
| pandemic | wipe → wipe | 7/7 → equilibrium 5/5 | recovered 15/15 → equilibrium 4/4 | wipe → new_normal 1/4 |
| wildfire | 2/4 → 2/4 | 6/6 → 4/4 | 6/6 → 4/4 | wipe → recovered 4/4 |
| ash_winter | wipe → wipe | wipe 0/4 → equilibrium 2/4 | wipe 0/7 → equilibrium 7/7 | wipe → wipe |
| financial | wipe → wipe | wipe → wipe (a fight) | 16/16 → 4/4 | wipe → wipe (fights) |
| solar_flare | wipe → wipe | wipe 0/4 → equilibrium 4/4 | wipe 0/4 → equilibrium 4/4 | wipe → still going 4/4 |
| zombies | wipe → wipe | wipe 0/7 → wipe 0/4 | equilibrium 4/4 → 4/4 | wipe → wipe |

The long game, 40 years, by region:

| | Before (8 runs, all Mountain West) | After (16 runs, all seven regions) |
|---|---|---|
| Lines still alive at 40 years | 0 of 8 | 1 of 16 (North Woods prepper, 10 of 13 alive, 2 died of old age) |
| How the lines ended | (not tallied) | 8 in fights (6 of the 7 homesteads, the Mountain West prepper, the fortress), 2 thirst in a later era's drought, 2 radiation, 2 starvation (a homestead, a prepper), 1 idle starvation |
| Latest wipe | 2043 | 2065 (Appalachia prepper) |

## Bugs found and fixed

| # | Bug | Fix | Test |
|---|---|---|---|
| 1 | **A wipe between eras was never declared.** If everyone died in the quiet years before the next hit, or after a played-on card, the run went on with nobody left. In the long game one run went on for 3+ years with 0 people. | `src/sim/report.ts:49` (`tallyDay`): the last of them gone is a wipe at any time. | `report.test.ts` "everyone gone is a wipe in the quiet years…" |
| 2 | **The dead and the taken still drank water.** Use was `s.people.length`. In a long game with as many dead as living, water use doubled (810 L instead of 410 L a day in one drought). | `src/sim/utilities.ts:349` counts the living. Same fix for heat-wave evaporation at `src/sim/weatherThreats.ts:158`. | `utilities.test.ts` "only the living use water" |
| 3 | **A dead mechanic kept the trucks running.** | `src/sim/vehicles.ts:107` | `vehicles.test.ts` "a mechanic who has died…" |
| 4 | **Fallout in the produce scaled with the size of the farm**, not with what each person eats: `0.002 × k × producedKcal / 2000` a person. A strike at harvest time on a 16-field place gave everyone about 0.3 Sv a day, and 13 of 13 died in a bunker family's third era. | `src/sim/nuclear.ts:133`: by the share of the diet that's fresh, `min(1, produced / need)`. | `nuclear.test.ts` "fallout in the produce goes by how much of the diet it is…" |
| 5 | **A storm-wrecked pump house needed a new pump.** Storm damage (and the chimney fire and the ash-roof collapse) knocked a structure back to its roof stage. The later stages then took their materials again: the well's pump and hardware kit, a log house's 30 hardware kits. After the collapse nobody can buy those, so wells stayed dead for good. One long-game family died of thirst in a drought with the well stuck at "Pump, pressure tank and controls". | New `knockBack` in `src/sim/construction.ts:98` salvages what the later stages put in. It is used at `weatherThreats.ts:92`, `upkeep.ts:96` and `effects.ts:82`. The wildfire's full burn is left alone. | `weatherThreats.test.ts` "a storm-wrecked pump house is re-roofed with the pump it already had" |
| 6 | **"Out of firewood: a cold night at camp"** was logged for years after the cabin went up. | `src/sim/heating.ts:39` names the house. | `heating.test.ts` "says where the cold night was" |
| 7 | **The harness counted fights twice** (see above). | `scripts/playtest.test.ts` | — |

There is no save bump: no state fields changed.

No NaN, negative stock, stuck gate or money jump turned up in any of the 52 runs.

## Found, not fixed (other agents' files)

- **The best gardener's skill counts the dead.** In `src/sim/needs.ts:73` (`fieldHarvest`) and `:92` (`produce`), `Math.max(...s.people.map(p => p.skills.gardener))` has no alive check, so a dead gardener keeps the yields up. This is a one-line fix, left for the food-model branch, which is rewriting `needs.ts`.
- **A lost fight takes the raiders' wants twice.** `applyBattle` takes 30 / 60 / 90 % of the stores, then `resolve` takes `e.wants` on top (`src/sim/encounters.ts:520`). It is small next to the share, but it is a double count.

## Open design questions (with numbers)

1. **Radiation never heals.** `needs.ts` takes `(dose − 1) × 2` health a day for as long as the cumulative dose is over 1 Sv. Rest gives back 0.6 a day, so anyone over about 1.3 Sv dies slowly, however long ago the dose was. In the desert prepper's third era the worst dose was 1.65 Sv, and all 7 died over the next six months. Real acute radiation syndrome at 1–2 Sv is nausea and weeks of weakness, with few deaths; the LD50 is about 4 Sv. Should the harm fade (the dose rate, not the total, doing the damage), or should the threshold move?
2. **The defense number doesn't predict the fight.** These are 52 fights from `GATES=1`, as raider strength ÷ the place's defense (`defenseOf`):

   | Ratio | Fights | Family won |
   |---|---|---|
   | under 0.75 | 16 | 12 |
   | 0.75–1 | 11 | 4 |
   | 1–1.5 | 7 | 3 |
   | over 1.5 | 18 | 0 |

   Two "desperate" looters (strength 18) overran a fortress whose defense read 25, four times in a row, and the lone survivor lived through each. A two-man "savage" crew (strength 18 against 28) killed or took a homestead family of 4. Should the gate card's numbers track the battle sim more closely? And should a ruthless crew of two be able to end a family of four?
3. **Hiding is dominant.** In the 36 runs the prepper hid from every threat, fought nothing and lost nobody. Fighting when it clearly outclassed them cost lives (above). A savage crew that finds the family still only takes the stores when there's a bunker or a safe room. Is that the intended balance?
4. **Fields are forever and seed is only for new ones** (GDS §10.5 "seed saving"). A field never needs replanting, and seed only matters for expansion. Should a field need seed each spring, kept back from the harvest (say a tenth of it)? Then losing the seed stock to mice or a raid would matter.
5. **One field per 1.5 mouths isn't enough.** A field makes 0.6–1.2 × 700,000 kcal a year by skill and soil. A person eats 876,000 kcal a year (2,400 a day). That is one field a head with a master gardener on deep soil, and two a head at skill 0. The northern harvests the bot saw were lower still. Is the field (a quarter acre) sized as intended?
6. **Thirst with a drilled well and no power.** The pump needs power, and there is no hand-pump or bucket fallback. In a drought the creek dries everywhere. Two long-game prepper lines (Plains in era 4, PNW in era 7) died of thirst in a later era's drought. Both had a finished, working drilled well with no power to run it: the grid was down and the banks were closed. Before fix 5, a North Woods line died the same way with its pump broken and no hardware kit left. Death came slowly: −2 health a day, about 50 days, where real thirst kills in days. Should a drilled well take a hand-pump retrofit? Should people walk out for water?
7. **The cold does nothing to people.** Running out of firewood only logs a line every day (up to 1,070 times in a two-year idle run) and can freeze the pipes. GDS §10.5 has "freezing without heat". Should the cold cost health, or morale at least?
8. **The trial period is the same as taking people in.** `trial` adds the arrivals to the family just as `take_in` does. Nothing ends after the month, and there's no camp outside the wall (GDS §5.2).
9. **Bills run into debt.** The prepper ran to −$7,668 after spending down: tax and insurance are still charged below zero. Is debt intended, and should it have consequences?
10. **A wildfire burns a drilled well back to stage 0.** That means re-drilling, which can't be bought after the collapse. The bore should survive the fire, as the bunkers and the root cellar do.
11. **The long game trends to a wipe.**
    - 15 of 16 lines ended within 40 years.
    - Homesteads die in fights: 6 of the 7 homestead lines ended in a fight.
    - Preppers die of the next era's drought, its fallout, or a world that never came back. Banks stay closed, so nothing can be bought.

    GDS §10.11 says it trends toward a more permanent collapse. Is about one line in sixteen surviving 40 years the intended difficulty for a competent bot?
