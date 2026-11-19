# Raids on domes: audit, staging and proposed tuning (2026-11-19)

Owner request: "show some raider attempts on the domes, with dialogue and frustration, because no raiders should be able to bust through currently."
Everything in the audit comes from `src/sim/dome/siege.ts`, `protection.ts`, `crossing.ts`, `plantStrike.ts`, `breachMeans.ts` and a 24-seed run of `planBattle`
(Hardcore, armed layout, a dome over the farmhouse, no other wall; Standard multiplies every attempt by 0.8, Cozy by 0.6).

## The claim "no raider can bust through": verdict

* **True for the arcology, almost.** Hand tools never work (`cutSeconds` is infinite), a ram is 0 on the panels, rifles, heavy rifles, rockets and missiles
  do 0 to 3 percent. Two small doors remain: one satchel on a panel is **2 percent**, and a ram at an airlock door **3 percent** (`AIRLOCK_DOOR.arcology`).
  A crew only ever gets one attempt a fight, so a dome is breached about 1 fight in 40 to 50 when the crew has a satchel or a truck plus a satchel.
  In 24 seeds per row the arcology was never breached (0 of 288 fights across all means and crew sizes), as the odds say.
* **False for the geodesic and glass domes.** The audit table shows both are breached routinely by organized crews (below). Only the arcology matches the intent.
* **False for the earthen dome**, a 4 ft earthbag shell: a 16-man crew got in on 23 of 24 seeds with no means at all (900 s of hand work divided by the square root of the crew).
* **Sealing the dome changes nothing in the fight.** `planBattle` never reads the lockdown state. A sealed dome matters only after the line is passed (plant strikes,
  `plantTargetOdds` x1.8) and for air (CO2 clock). So a "sealed vs unsealed" shell is the same wall.

## What each means does, by tier (Hardcore numbers)

| | earthen | geodesic | glass | arcology |
|---|---|---|---|---|
| Shell, rifle round gets through (1 - stop) | 10% | 95% | 65% | 0% |
| Heavy rifle / rocket gets through | 30% / 70% | 100% / 100% | 90% / 100% | 0% / 3% |
| Panels a fight's stray fire can break (cap one tenth of the shell) | 0 | up to 15 | up to 28 | 0 |
| Ram on a panel (truck) | 30% | 30% | 25% | 0% |
| Satchel on a panel | 50% | 90% | 80% | 2% |
| Ram at an airlock outer door | 55% | 45% | 35% | 3% |
| Satchel at an airlock outer door | 85% | 88% | 70% | 12% |
| Hand tools (saw, sledge, axe) to open a hole: crew of 4 / 9 / 16 | 7.5 / 5 / 3.8 min | 45 / 30 / 22 s | 3.5 / 2.3 / 1.8 min | never |
| Inside an airlock door: held in the chamber before the line is lost (`SALLY_HOLD`) | 3 s | 7 s | 12 s | 22 s |
| One airlock trip cycles (`AIRLOCK_CYCLE_S`) | 3 s | 10 s | 14 s | 24 s |
| Buried skirt against a dig (plain crew / crew that learned the place) | 0% / 0% | 99% / **0%** | 99% / 99% | 99% / 99% |
| Panel repair after a breach (glazier, special order) | 40 h, 0 d | 3 h each, 4 d | 9 h each, 21 d | 14 h each, 45 d |

Measured breach rate (line passed, 24 seeds, Hardcore, a truck and satchels as listed; "none" = hand tools only):

| crew | means | earthen | geodesic | glass | arcology |
|---|---|---|---|---|---|
| 3 looters | none / truck / charges | 5 / 5 / 5 | 2 / 4 / 5 | 1 / 3 / 3 | 0 / 0 / 0 |
| 8 gang | none / truck / charges | 17 / 17 / 17 | 15 / 14 / 21 | 8 / 10 / 14 | 0 / 0 / 0 |
| 16 militia | none / truck / charges | 23 / 23 / 23 | 19 / 24 / 20 | 18 / 20 / 19 | 0 / 0 / 0 |

(Numbers are of 24; the means of the row are forced, real crews rarely bring both. Most breaches are a cut through the shell by a big crew, then the fight moves into the yard.)

## What raiders can do, and what they cannot

| Attack | Geodesic | Glass | Arcology | Notes |
|---|---|---|---|---|
| Shoot the shell | Rounds go through, a few panels per fight, open gap until the glazier comes | 65% of rounds get through; chips and the odd panel | Pings off, scuffs only | `panelsHit` caps a fight at a tenth of the shell |
| Cut it by hand (saw, sledge) | Yes, 22-45 s for a real crew | Yes for 9+ men (about 2 min) | **No** | the existing `climb`; the card calls it cutting |
| Ram it (truck) | 30% / try | 25% / try | 0% | one truck, one run a fight; bollards and ditch lower it |
| Satchel on the panels | 90% | 80% | 2% | one sapper, one charge a fight |
| Force an airlock door | 45% ram, 88% charge | 35% ram, 70% charge | 3% ram, 12% charge (only if the crew rams; see flag 2) | then a sally-port kill zone of 7 to 22 s |
| Dig under the skirt | Turned (plain crew); **a learned crew digs under** | Turned | Turned | skirt 20 / 30 / 60 ft vs dig 6 to 14 ft (+12 learned) |
| Plant yard wall (hardened, no outside gate) | Concrete wall: ram 12%, satchel 45% | same | same | the **real soft spot of a sealed arcology**: a crew past the line, or one that blows the yard wall, starves it out (`plantStrike`) |
| Hit a link walkway | Shell odds of the link's tier; tunnels by `linkDefense` | | | covered under `links.test.ts` |
| Burn it | Embers only (`SHELL.fire`: 0.5 / 0.7 / 1) | | | no fire model on the shell itself |
| Siege and starve | `plantStrike`, escalating waves (`sim/waves.ts`) | | | the arcology's practical weakness |
| Snipe through the shell | Yes, glass and film do not stop rifles | | No (shell stops fire in the line-of-fire map) | |

## Flags for the owner

1. **The arcology is not literally impregnable, and that is right, but it is nearly so.** 2 percent a satchel and 3 percent at the door. Keep it: it is a rare but possible story.
   *Proposed (not built):* nothing; or lift the wall satchel to 0 and leave only the airlock door at 3 to 12 percent, so the arcology can only fall at its doors, by siege or at the plant yard.
2. **A crew with a truck and a satchel never aims the satchel at an airlock.** `chooseHow` weighs the wall's blast odds (2%), not the door's (12%). A smart organized crew would blow the
   door of an arcology (12%). *Proposed:* let a charge go to the airlock when the airlock's blast odds beat the wall's by three times or more, only for organized late-game crews
   (`late > 0.5`), so the arcology can be threatened by heavy charges at the door and nothing else. Marked proposed; the staging below already draws the door being worked.
3. **Glass is too soft for the owner's intent.** A 9 to 16 man crew with only hand tools gets through laminated glass in 2 to 3 minutes (cut time 420 s over the square root of the crew), 14 of 24 seeds for an
   8-man gang with a satchel. *Proposed:* raise `cutSeconds.glass` base to 1500 s (about 8 min for 9 men, so only organized crews with a long siege), keep the satchel at 80% but only for
   late-game organized crews with `satchels >= 2`. The geodesic stays soft on purpose (it is the starter dome).
4. **A crew that has learned the place digs under the geodesic skirt.** At full adaptation the 20 ft skirt stops 0%. *Proposed:* geodesic skirt 30 ft.
5. **Earthen dome breached by a bare-handed crew.** Intended (it is a hideout, not a fortress).
6. **Sealed or not does not matter to the fight.** *Proposed:* a sealed dome with the shell whole removes the "is anyone home" signal for opportunists (`visibility`), nothing more.

None of these are applied in this PR; the odds tables are unchanged.

## What the PR stages (all presentation, no outcome changed)

`sim/dome/domeBeats.ts` (pure, tested) runs after the cutscene's voicing and adds events to the final fight when a dome stands over the house:

* raiders walk to the shell (only on its outer side) and work it: **rifles** (ping, sparks, a chip on glass), **sledge**, **saw** (really cuts the geodesic if the fight's own timeline breaks it), **torch** (scorch), **pry** at the
  nearest airlock (the interlock holds), and one raider circles the shell;
* a failed **ram** now stops at the wall and rocks back (before, the cutscene truck drove through the shell); a failed **charge** removes the bag and leaves a scorch;
* voices (`sim/raidLinesDome.ts`, plain American English, nothing stronger than "damn", varied by temper and crew size): the scout's report ("sealed, lights on"), shock that the glass
  does not shatter, cursing at the airlock, a failed ram or charge, a crew turned back at the skirt, an argument about leaving, a leader's order to pull back, a crew member who panics, a vow to come back with a plan, and the family
  watching, firing from inside, saying it holds, saying they are going;
* the director cuts to a raider at the shell (close shots); the lasting marks (`GameState.shellScars`, save v105, optional) show on the dome and wear off in 12 to 120 days.

Cases that cannot be a cutscene: a **tunneler crew turned back at the skirt** is a log line from `digDay` (there is no encounter or battle for it; the next crew arrives at the airlock, and carries the skirt lines when its kind is `tunnelers`);
**plant-yard wall circling** has no fight events to hang a scene on (the strike resolves in `strikePlant` after the fight).
