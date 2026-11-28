# Design audit, November 2026: graphics, gameplay, UI/UX

Status: audit with a few trivially safe polish edits (section 6). No rules, balance or save changes. Save version unchanged (v107).
Base: `origin/main` at e10ec32e. Branch `claude/design-audit`. Written 2026-11-28.

Scope note. Four other agents are fixing the solar-array bug, known visuals, soak-test crashes and playtest-flow bugs. Nothing here duplicates those; where a finding touches the same ground it says so. `docs/UX_AUDIT.md` (the layout A audit) is the baseline for the HUD: findings below are what is left or what the redesign did not reach.

## 0. Method and evidence

- **Read:** `CLAUDE.md`, `COMPOUND_BUILDER_GDS.md`, `docs/GDS_AUDIT.md`, `docs/DEPTH_AUDIT.md`, the DECISIONS headers, `docs/UX_AUDIT.md`, `docs/PLAYTEST_3.md`, `docs/BALANCE_PLAYTEST_3.md`, `playtest-report.md`, and the code under `src/ui/hud/*`, `src/ui/Hud.tsx`, `src/ui/GateCard.tsx`, `src/sim/{difficulty,operational,state}.ts`, `src/game/DioramaCamera.ts`.
- **Ran the game** with Playwright (`scripts/designAuditShots.mjs`, new, drives a real new game through the charter; `?new&lowrender&looktier=high`, full-quality `qa.renderFull('high')` per frame, under `flock /tmp/cb.lock`). 1512 x 860 for the main pass, then 1280 x 720, 1100 x 700 and 390 x 844. 65 frames were captured and every one was opened and looked at; the 38 that carry evidence are in `docs/audits/frames/` (JPEG copies, 1280 px wide, named `fNN-...`; index in section 10).
- **Colorblind check:** the lanes and road-sight frames were run through the Machado 2009 deuteranopia and protanopia matrices (linear RGB, severity 1.0). Results are `f19`, `f20`.
- **Counts** (reproducible with the greps in section 7).
- **Not measured here** (carried from the earlier playtests and labeled "carried"): win rates and wealth curves in `docs/PLAYTEST_3.md` and `docs/BALANCE_PLAYTEST_3.md`.

Harness caveat, stated once. Four frames (`b34` to `b38` in the run) were taken with an invalid season string typed by the harness (`autumn`; the valid word is `fall`), which paints the ground black. I did not judge graphics from those frames. It is a robustness note (finding G10), not a game defect a player can reach.

Severity key: **high** = a new or returning player is misled, blocked or excluded; **med** = costs clarity, time or trust; **low** = polish. Effort: S under a day, M a few days, L a week or more. "Owner?" marks a call that is the owner's, not an engineering default.

## 1. Executive summary

The game is strong where it was designed deliberately: the gate card, the Board, the overlay legends, the report-card prose, winter and close-range lighting, and the layout A drawers are all better than most games of this scope. The weaknesses are at the seams:

1. **Alarm calibration and first-minute signal.** At minute zero, five of nine top-bar chips are red or amber and a red, then amber, "Out of food in 1 day" stays on the goal card and the food chip for 28+ days of a peacetime run with $65,000 to $155,000 in the bank. Nothing bad happens until the disaster, and then it is total. A new player learns to ignore red (P1, P2).
2. **Time is the biggest unmanaged control.** There is no pause or speed hotkey anywhere, and 1x is one minute per game day (a game year is six hours at 1x, nine minutes at 4x). The GDS says peacetime is 30 to 60 minutes; that is only true at 4x (P3, U1).
3. **The overlays are the game's signature and the hardest thing to find.** Four overlay families (Blueprint, Sightlines, Terrain, Weak spots) are spread over three places, share one 27-control popover with raw selects, have no hotkeys, and the popover covers the map the overlay draws on (U2). Their colors fail for deuteranopia (G1).
4. **Placement and site markers vanish on snow**, and construction props are unlabeled shapes (G2, G3).
5. **Type, color and z-index discipline slid back** after the declutter: 287 font-size literals under 12 px (was 251), 516 hex colors (was 446), 23 z-index values (was 18) (U6).
6. **Narrow windows lose the panel buttons entirely** (390 px): no way to open Build or Family (U7).

## 2. Ranked findings (all areas)

| # | Area | Sev | Finding | Effort | Owner? |
|---|---|---|---|---|---|
| P1 | Gameplay | high | Alarm cry-wolf: red then amber food chip and goal for 28+ days of peacetime; 5 of 9 chips red/amber at t=0 | M | partly |
| P2 | Gameplay | high | "Food" checklist item goes green after one garden (about 5 percent of a year) | S | no |
| P3 | Gameplay | high | Pacing: 1x = 60 s per game day; GDS length only reachable at 4x; no skip-to-event | M | yes |
| U1 | UI | high | No Space pause, no 1 to 4 speed keys | S | no |
| U2 | UI | high | View settings is a 27-control popover; overlays split over three places; no overlay hotkeys; popover covers the overlay | M | no |
| G1 | Graphics | high | Overlay palettes (lanes, fire, road sight) fail deuteranopia and protanopia | S to M | no |
| G2 | Graphics | high | Staked sites and starter ghosts are near-invisible on snow | S | no |
| P4 | Gameplay | med | Money buys speed not safety; rich players run out of sinks; hiding equalizes (carried) | L | yes |
| P5 | Gameplay | med | Material orders are manual busywork per project ("stuck 36 days" with $709,000 cash) | M | yes |
| P6 | Gameplay | med | After "Get operational" there is no peacetime ladder; "Nothing under way" at day 28 | M | yes |
| P7 | Gameplay | med | Stance cards clamp the consequence text to two lines; full text only in a native tooltip | S | no |
| G3 | Graphics | med | Construction-stage props read as unlabeled shapes (dark wedge, gray cube); progress only in a drawer | S to M | no |
| G5 | Graphics | med | Pickup truck is a white featureless lump (vanishes on snow) | S | no |
| U3 | UI | med | The same fact appears in up to four places (chip, goal card, Board, Waiting on you) | M | no |
| U4 | UI | med | Drawers open on the first page, not the alerting one; urgent line sits below 49 tools | S | no |
| U5 | UI | med | 634 native `title=` tooltips vs 4 hover cards; legends and tooltips duplicate each other | M | no |
| U6 | UI | med | Type, color, z-index drift (numbers above) | M | no |
| U7 | UI | med | 390 px: panel buttons, goal card and part of the top bar are gone; no pinch or two-finger pan | S to L | yes |
| G4 | Graphics | low to med | Darkest nights are near-black at the diorama camera; the 06:00 start is the dimmest light | S to M | partly |
| G11 | Graphics | low to med | Pure-black faces at eye level (a low strip, a gable end); look-dev check | S | no |
| G6 | Graphics | low | Flat water ribbon and flat county road outline next to lit, textured assets | M | no |
| P8 | Gameplay | low | Report card has no one-line "try this next" and no restart on the same land | S to M | no |
| G12 | Graphics | low | Fall crowns outrank the compound in visual hierarchy | S | no |
| U8 | UI | low | Naming drift (People/Family, Shop and money / Town and mail-order catalog, four near-synonym order buttons, "Graphic") | S | no |
| U9 | UI | low | Clock shows no year in a multi-decade game | S | no |
| G10 | Graphics | low | An invalid season string paints the whole ground black (QA and corrupt-state only) | S | no |

Fixed in this PR (section 6): the People/Family label (U8) and the unlabeled View-settings selects (part of U2, U8).

Each finding below gives: the principle, the evidence, the proposed fix.

## 3. Graphics

### G1 (high) Overlay colors are not colorblind-safe
- **Principle:** do not carry meaning in hue alone (WCAG 1.4.1); redundant coding.
- **Evidence:** the Terrain "Lanes" overlay is green (easy), amber (scramble), red (cliff), blue (ford) (`src/game/terrain/TerrainOverlay.ts:20`; frame `f18`). Under a deuteranopia simulation green and amber collapse into one khaki yellow and the red cliff is lost: `f19` (the same frame, simulated). The Fire overlay uses green/amber/red rings (`f20`); the ring also grows with risk, which is good redundancy, but the legend leads with color. Road and Ridge sight are "red-orange vs blue-green" (`SIGHT_LEGEND`, `src/ui/Hud.tsx:162`); red-orange vs blue-green survives deuteranopia better than red vs green, but it is not tested either. I could not frame those two overlays: they fill in progressively over live frames, and the on-demand renderer used for the harness did not complete them in 12 s (`f15` is the empty result; the Night overlay did draw, `f16`). So this part rests on the legend text, not a frame. The top bar already pairs color with glyphs (`T.glyph`, `src/ui/hud/tokens.ts`), so the project knows the rule; the world overlays do not follow it.
- **Fix (S to M):** (a) redundant encoding: hatch or dash the cliff class, give the chosen path a white casing, a different ring thickness for fire; (b) one colorblind-safe ramp (Okabe-Ito: blue, orange, vermillion, with a luminance step) behind a Settings toggle, default on for the three overlays that use red/green; (c) a unit test that the legend palettes keep a minimum simulated distance under deuteranopia (the simulation matrices are 20 lines).
- **Owner?** No.

### G2 (high) Staked sites and ghosts disappear on snow
- **Principle:** figure-ground contrast; interactive objects must be findable.
- **Evidence:** after "Place all", the four staked pieces are thin white outlines on white snow with no label (`f03`; the same frame at full size shows them only because the player knows to look). The starter ghosts are pale cream blocks on a white-lavender field (`f02`). The goal card's own button says "Order what the plans need", but the map gives no visible "plan" to look at.
- **Fix (S):** a dark under-stroke (halo) on every stake outline, corner posts, and a one-line name chip ("Solar array, waiting on permit") reusing the Blueprint label chips (`f14` shows they already read well). Tint ghosts by validity.
- **Owner?** No.

### G3 (med) Construction props are unlabeled shapes
- **Principle:** what is interactive and what is it; state readable in the world.
- **Evidence:** at day 3 with five crews hired (`f11`) a dark triangular wedge and a small gray block stand in the yard with no label and no progress; progress exists only in the Projects drawer ("Battery & inverter shed 70%"). The GDS says "you see scaffold, then framing, then cladding", but at diorama distance the stages do not read.
- **Fix (S to M):** a world-space progress ring or bar on active sites (the label system already exists for Blueprint), shown at diorama distance only; hover or click selects the project row.
- **Owner?** No.

### G4 (low to med) Night and dawn readability
- **Principle:** readability across the day cycle; the player must be able to act at any hour.
- **Evidence:** it depends on the night. At 21:30 on the pond lot (`f38`) the moonlit water, lit windows and campfire read well: moody and playable. At 23:00 on the first lot (`f24`) the diorama view is almost black: the house is a dark mass with four pin-prick windows and nothing else is legible. A new game also starts, and every paused review sits, at 06:00, the dimmest light of the day in a sparse-sun region (`f12`: roof near-black on olive ground); the snow start (`f01`) is bright only because snow reflects.
- **Fix (S to M):** a minimum ambient floor for the diorama camera only (not walk or fly, so eye-level night stays moody), slightly larger window emissives for the OPSEC story, and start new games at 09:00. Check the perf budget; this is a uniform, not geometry.
- **Owner?** Partly (mood vs readability).

### G5 (med) The pickup truck is a white featureless lump
- **Principle:** silhouette and recognizable detail at the camera's distance.
- **Evidence:** from above it is a white block that reads like a snow patch (`f01`, `f03`); at eye level (`b37` in the run) it is a white box with no wheels, glass or shadow.
- **Fix (S):** dark glass and wheel decals plus an ambient-occlusion blob under it, like the shared decal atlas already used on the dome (`fx/plantDecals.ts`). A visuals agent is already working "known visuals": confirm it is not already on their list before starting.
- **Owner?** No.

### G6 (low) Flat water and road next to lit assets
- **Evidence:** in snow the creek is a uniform navy ribbon with a hard edge (`f02`, `f03`); the county road has a thin black outline line that reads as a drawing, not a surface (`f12`). Trees, house and solar panels in the same frames have lit, textured surfaces.
- **Fix (M):** edge foam and a soft shore falloff; road shoulder blend; both are shader-only.

### G10 (low) Invalid season string blackens the ground
- `setSeasonMode` takes any string (`src/store/worldStore.ts`); an unknown value leaves a NaN-like state and the terrain draws black (the harness hit this with `autumn`). `isSeasonMode` exists in `seasonState.ts:29`. Fix (S): validate in the setter. Not reachable from the UI.

### G11 (low to med, look-dev check) Pure-black faces at eye level
- **Evidence:** in the eye-level frames a long low strip crossing the yard is a solid, textureless black (`f35`, `f36`), the farmhouse's right gable end is a flat black triangle (`f35`) and a spruce crown at the right edge has a black face. At noon with a clear sky these should take sky ambient. They may be intended (a black fence, a dark grill: the grill in `f36` reads as a deliberate black prop) or a missing normal or backface; I could not tell from stills.
- **Fix (S):** confirm what the strip is; if it is geometry, give it a material and a minimum ambient. Possibly on the "known visuals" agent's list: check before starting.

### G12 (low) In fall the saturated crowns outrank the compound
- **Evidence:** `f39`. The yellow and orange tree crowns are the most saturated, highest-contrast elements in the frame and larger than the house, so the eye goes to the trees, not the place. In summer and winter the house reads first (`f34`, `f25`).
- **Fix (S):** desaturate the fall yellow by about 15 percent and lift the house roof value, or add a faint rim light to the compound. Visual hierarchy rule: the player's own buildings should be the focal point.

### Graphics checks that came out fine (no finding)
- **Scale (SCALE v2, person 0.28):** two eye-level frames with a person in them (`f35`, `f36`) read right: the standing figure's head clears the picnic-table top by about half a body, the benches sit at knee height, the woodpile is about shoulder high and the farmhouse door reads as a door. Close-range frames of the first lot (`f23`) are consistent. No finding.
- **LOD:** `buildkit/buildingLod.ts` hides only layers that cannot be seen (framing behind siding), with a hysteresis band, so there is no visible pop-in by design; walking toward and away from the house in `f23` vs `f12` showed none.
- **Quality tiers:** not judged from frames. The harness's `qa.renderFull('high')` forces High for every shot, so the three tier frames of the second pass all show shadows and are not valid comparisons; I did not use them. What the code and docs say: Low has no shadows or post, Medium soft shadows, High adds ambient occlusion and a sharper pixel ratio, with step-down only (`CLAUDE.md`, `perfBudget.json`). A tier comparison needs `scripts/shots.mjs --quality low|medium|high`, which I did not run for lack of lock time.
- **Animation feel and feedback VFX:** not judgeable from stills. The cutscene and aftermath were reviewed through the other agents' frames only (see P7).

## 4. Gameplay

### P1 (high) Alarm calibration: peacetime red and the cry-wolf effect
- **Principle:** consequence legibility; alarms must be calibrated or players learn to ignore them; information before consequence.
- **Evidence:** the first frame after "Buy it and start" (`f01`) has "x 1 day" (food, red), "0 days" (water, amber), "x 7" (alerts, red), "x Exposed 17" (defense, red) and "9 days" (fuel, amber): five of nine chips are red or amber with $155,020 in the bank and 18 months of peace. The goal card's second item is a red "Out of food in 1 day" (and "Out of food in 3 days" on a second lot at day 14, `f34`). At day 28 (`f12`) the card still reads "1 day of food on hand" and the top-bar food chip is amber; another agent's scripted first-time run showed the same text at day 30 (its `notes.txt`, 2026-11-27). Peacetime groceries are a store run away; the consequence only arrives after the hit, when hunger kills fastest: the scripted `idle` control in `playtest-report.md` ends in a wipe in 7 of its 9 rows, six of them after 73 to 77 hungry days.
- **Why it matters:** the player cannot learn the real rule ("stock the shelf before the warning phase") from a red that never costs anything. Red and amber at t=0 also flatten the hierarchy: a genuinely urgent chip later looks like the other four.
- **Fix (M):** (a) keep chips neutral while the stores are open and the shortfall is cheap, and say so: "Stores open: a month of staples is about $415" (the goal card already says this in prose); (b) turn the chip red when the warning phase starts, the stock is under N days *and* a consequence is near; (c) show the Board's "Days with no resupply" row (`f09`), which is already the right frame ("only what is on the place now"), as the one place that talks about the post-collapse clock.
- **Owner?** Partly: how loud peacetime should be is a tone call. The rest is not.

### P2 (high) The "Food" item completes after one garden
- **Evidence:** `src/sim/operational.ts:77` marks Food done when a kitchen garden is finished (`fin(FOOD)`) *or* 90 days are put by. `docs/BALANCE_PLAYTEST_3.md` section 4 measured it: a garden is about 5 percent of a family's year, three fields about 55 percent, and listed the fix as "proposal, not built".
- **Fix (S):** the doc's own proposal: done at 90 days put by *or* growing food covering half a year (`farmPlan` output). Add the unit test beside `operational.test.ts`.
- **Owner?** No (documented; only the threshold is a tuning number).

### P3 (high) Pacing: one real minute per game day
- **Principle:** pacing and flow; the player controls the clock but the default should match the design target.
- **Evidence:** `SECONDS_PER_DAY` is `{1: 60, 2: 20, 3: 6, 4: 1.5}` (`src/sim/state.ts:85`). A game year is 6 hours at 1x, 2 hours at 2x, 36 minutes at 3x, 9 minutes at 4x. GDS section 1 says peacetime is "about 4 to 8 in-game years (30 to 60 minutes)"; that needs about 0.6 to 2.5 seconds per day, and only 4x (1.5 s) is inside that window; at 3x four years take about 2.4 hours. The speed buttons are labeled only "1x to 4x" with no hint of cost, and there is no "skip to the next thing that needs me". A project row quotes "about 2.7 years" at the family's pace (`f33`).
- **Fix (M):** (a) label the speeds in real time ("1 min per day"); (b) a "Run until something needs me" control that stops at a gate, a permit, a completed build, a warning phase (the engine already holds the clock while placing, `clockResume`); (c) remember the last speed per phase. Re-check the GDS target against measured first-hour play before changing any rate.
- **Owner?** Yes: what the intended first-hour length is.

### P4 (med, carried) Money buys speed, not safety; hiding equalizes
- **Source:** `docs/PLAYTEST_3.md`: a rich family has the four basics in a median of 60 days vs 292 for a poor one, but people lost per run only fall from 1.66 to 1.42; a hide gate costs a poor family someone 4.0 percent of the time, a rich one 3.5 percent; a rich family runs out of things to buy by about day 160. `docs/BALANCE_PLAYTEST_3.md` finds most Cozy cash idle after the collapse. Domes (DECISIONS 2026-11-19) are a rich sink but are late and rich-start only.
- **Principle:** meaningful decisions, risk and reward, replayability.
- **Fix (L):** owner decision. Options: raid pressure that scales with visible wealth (the OPSEC systems exist), more mid-tier sinks (guard housing, vehicles, a clinic), and a cost to hiding that grows with how often it works.
- **Owner?** Yes. Not re-measured here.

### P5 (med) Material ordering is manual busywork
- **Evidence:** in `f33` (a frame from another agent's walled-compound run, same build) the kitchen garden "has waited 36 days for 32 fieldstone" with $709,614 in the bank, and the left card nags "Order 32 fieldstone, $9,675". `docs/BALANCE_PLAYTEST_3.md` section 4: about half the weak homestead and prepper rows were a bot that ignored the stuck card. The one-click "Order what the plans need" exists, but each new stake reopens the loop.
- **Principle:** meaningful decision vs busywork.
- **Fix (M):** an "Auto-order what staked plans need, up to $X" switch with a cap and a visible log line; the manual path stays. The OPSEC cost of big deliveries (GDS section 10.4) keeps the decision real.
- **Owner?** Yes (GDS treats materials as the main lever).

### P6 (med) What pulls the player through peacetime after the checklist?
- **Evidence:** at day 28 the Projects drawer reads "Nothing under way. Stake something out from the Build tab." (`f12`); the goals card ends with "You're set for now" (`src/ui/feel/GoalsCard.tsx`) and a list of what to watch. In the other agent's scripted run all seven starter pieces were done by day 196 and the next gate came at day 346. Mid-peace has the Build catalog (101 pieces), courses and land, but no visible ladder of "what a prepared compound looks like next".
- **Principle:** long-game goals and variety; the second hour.
- **Fix (M):** a second goal card, "Prepared", with five or six rungs the sim already measures (90 days of water and food, a hardened gate, a second power source, a trained medic, a neighbor pact, a bunker); each rung links its drawer. Hide it in Free build.
- **Owner?** Yes (it names what "prepared" means).

### P7 (med) Consequence text is clamped on the stance cards
- **Evidence:** in the raid prompt, each stance's one-line description is clamped to two lines (`src/ui/GateCard.tsx:209`, `CLAMP2`), so "Hide: Lights out, everyone underground or into the timber. They may..." and "Parley: ... A good negotiator can send them off wi..." cut off the risk and the condition. Only the native `title` shows the rest (`GateCard.tsx:207`), after a delay, and never on touch or keyboard focus. Frame `f27` (from the raid prompt in the current build).
- **Principle:** information the player needs before a consequence.
- **Fix (S):** drop the clamp on the selected stance (show full text on focus and on select, as the Clamp component does for stuck cards), keep two lines unselected.
- **Owner?** No. The card's other content is exactly right (see the keep list).

### P8 (low) The report card names what happened, not the one thing to try next
- **Evidence:** the card (`f40`, forced to a wipe state for layout only: its body text contradicts itself, "Nobody is left" against "2 of 2 alive", because the state was set by hand) is a good newspaper page with a grade stamp, who was lost and the stats. Real run lines, from `playtest-report.md`, are specific ("No well, no cistern: water came by the bucket from the creek. 73 hungry days. No one knew first aid."), but there is no single next-run hint, and the only buttons are "Load a save" and "New game".
- **Principle:** fail states that teach.
- **Fix (S to M):** one counterfactual line chosen from the worst cause ("A cistern and 90 days of food would have covered the first winter") and a "Start again on this land" button.
- **Owner?** No.

### Gameplay checks that came out fine
- **Core loop** (stake, order, crew, finish, survive the clock) is clear from the goal card plus Projects drawer (`f06` to `f12`); cause and effect for build speed is explained in words ("Slow going: Hank and Eli work in town, so building waits for weekends (quit the job in the Family tab); or hire a crew").
- **Difficulty** is described in plain words on the setup screen and Cozy never lets anyone die for good (`src/sim/difficulty.ts`, frame `f21`).
- **Fail states teach:** report-card lines are specific ("No well, no cistern: water came by the bucket from the creek. 73 hungry days. No one knew first aid.", `playtest-report.md`).
- **Snowballing:** wealth does not snowball into safety (P4); the other direction (starvation death spiral from an unfed start) is by design and signposted by the Board's resupply clock.
- **Replayability:** 16 disasters, nine-plus regions, three difficulties, scenario/surprise/free-build/God Mode, four play styles. Strong.

## 5. UI/UX

### U1 (high) No pause or speed hotkeys
- **Principle:** real-time-with-pause games need one-key pause (Fitts, expert efficiency).
- **Evidence:** every handler listed by `grep addEventListener('keydown'` and the hotkey doc in `src/ui/hud/drawerHooks.ts` (B P F S T L D O Y N G, M, Tab, Esc) has no Space and no digits. `GameCanvas.tsx` binds V, U, H. Fly mode uses Space for up (`TourController.ts:554`). Pause is the leftmost button in the top bar (`f01`).
- **Fix (S):** Space toggles pause and 1 to 4 set speed in the Diorama camera when no tool, shop or setup window is up (the same guard set as `useDrawerKeys`); add them to the speed buttons' hover cards. Unit-test the key map as a pure function. Not done in this PR because it needs a guard review for focused buttons (Space also clicks the focused control).
- **Owner?** No.

### U2 (high) The View settings popover is a junk drawer, and overlays are scattered
- **Principle:** information architecture; progressive disclosure; discoverability.
- **Evidence:** `f13`. One bottom-left popover holds, in this order: HUD layout switch, season, weather, graphics quality, a disabled "Diorama" button, raid blood, raid names, raid status pips, frame cap, skip hit cinematic, FPS, five Sightlines buttons, seven Terrain buttons, Blueprint, Boundary, Photo, a date field and "Take photo". About 27 controls (`src/ui/Hud.tsx:800-852`). Four of the selects showed only their current value ("auto", "auto", "medium", "Graphic") with no visible label before this PR; "Graphic" meant raid violence, not graphics quality. The disabled "Diorama" button gives no reason inline (its tooltip says "needs High graphics"). Weak spots are not in the popover at all: they live in Defense, Walls and towers (`src/ui/hud/WallTopsPanel.tsx:43`), and `f22` shows the empty-state toast, which is a good message. None of the overlays has a hotkey. The popover sits where Blueprint labels render, so it covers part of what the overlay draws (`f14`: the "Kitchen garden" and "Root cellar" labels are behind it). In the Terrain frames (`f17`, `f18`) the legend sentence is shown twice, once inline and once as the button's native tooltip.
- **Fix (M):** split into (a) an **Overlays** tray with Blueprint, Sightlines, Terrain, Weak spots, Boundary together, a legend chip docked under the top bar (not in a popover on the map), number or letter hotkeys, and the Board's "Show me" links kept; and (b) a **Settings** panel for layout, quality, frame cap, cinematic, FPS, violence, names, season/weather (photo tools in their own group). Move "Take photo" next to the camera modes.
- **Owner?** No. Partly done here: the selects now name themselves (section 6).

### U3 (med) The same fact in up to four places
- **Evidence:** "Out of food in 1 day" appears in the top-bar chip, the goal card, the Board's Status row, and the Board's Days-with-no-resupply row (`f01`, `f09`). The solar array permit's 7 days appears in the goal card and in "Waiting on you" (`f09`). The prior audit's root cause 2 ("no single home for what needs me now") is mostly solved by the goal card and the Board; what remains is duplication between them.
- **Principle:** single source of truth; Hick's law.
- **Fix (M):** the Board's "Waiting on you" lists only items not already on the goal card; the goal card shows a count ("+3 more on the Board") (it already does) and the Board marks rows that are on the card.
- **Owner?** No.

### U4 (med) Drawers open on the first page, not the alerting one; urgency is not the sort order
- **Evidence:** Utilities opens on "Heat" with 2 face cords and a clean chimney (`f07`) while the water chip is amber, the power chip says 0 kW, and the goal card says "Pump has no power". Supplies opens on the pantry table and 49 tools; "Food on hand: 1 day" is the third section, below the fold (`f28`). Family leads with five person rows and puts "How everyone is" below them (`f06`). On a second lot (`f34`) the goal card sends the player to Utilities ("the old wiring is unsafe: rewire the house first") while the Utilities bar button is drawn dimmed as "nothing to show here yet".
- **Principle:** recognition over recall; important things first.
- **Fix (S):** open each drawer on the first sub-page whose alert tone is not good (the action bar already computes an alert tone per drawer, `drawerRegistry` and `ActionBar.tsx`; sub-pages need the same signal); sort sections by tone. Add a test over `PAGES` so a page with an alert wins.
- **Owner?** No.

### U5 (med) Tooltips: 634 native titles, 4 hover cards
- **Evidence:** `grep -o 'title=' src/ui | wc -l` gives 634; `<HoverHost` 4, plus `Tip` in drawers. Native titles do not open on touch or keyboard focus, wait a second or more, and in `f17`/`f18` repeat the legend that is already on screen. The new `HoverCard` pattern (long press on touch, focus, Esc) is the right one and is used in the top bar and action bar.
- **Fix (M):** move the title text of controls that carry a decision (stances, overlays, speed buttons, catalog rows) to `Tip`; delete titles that repeat visible text. A lint test that counts remaining `title=` could ratchet down.
- **Owner?** No.

### U6 (med) Type, color and layering drift
- **Evidence (src/ui, this branch vs the numbers in `docs/UX_AUDIT.md`; the two counts may use slightly different scopes):** font-size literals under 12 px: 287 (prior audit: 251); hex colors: 516 distinct (446); z-index values: 23 distinct (18) against 7 tokens and a 5-step scale. 126 literals are exactly 11 px and 136 are 11.5 px, so most body text in drawers is smaller than the 12.5 px scale step. `tokens.test.ts` checks the token colors only.
- **Principle:** consistency and hierarchy.
- **Fix (M):** a ratchet test that fails if any of the three counts goes up, plus a codemod for the 11 and 11.5 literals inside `src/ui/hud`.
- **Owner?** No.

### U7 (med) Narrow windows and touch
- **Evidence:** at 390 x 844 (`f29`) the panel buttons (Build, Family, ...) are not on screen at all: only a look menu, a camera menu, View and Hide remain; the top bar clips the date ("ay 10") and the menu button; the goal card is gone; there is no keyboard to press B. The diorama camera binds one pointer for rotate and shift or right-drag for pan (`src/game/DioramaCamera.ts:37-40`), with no two-finger pan or pinch, and placement needs hover. At 1100 x 700 (`f30`) everything fits: the top bar drops the 4x button into its overflow and the action bar is full width. The hover card pattern already supports long-press.
- **Principle:** responsive design; device capability fit.
- **Fix (S to L):** S: below 900 px show a "needs a larger window" note and keep Hide working; M: fold the panel buttons into one Panels menu in the `menus` mode; L: pinch and two-finger pan and a tap-to-place flow.
- **Owner?** Yes: the GDS says "browser first"; whether phones are a target is not stated.

### U8 (low) Naming and terminology drift
- **Evidence:** the bar button said "People", the hover title and drawer header "Family", the hotkey F, and the first sub-page inside is also "People" (`f06`; now fixed, section 6). The Shop is "Shop & money" in the top bar, "Town & the mail-order catalog" in its header and M on the keyboard; its header offers "Add them to the order", "Order what the plans need", "Add everything I'm missing (~$9,175)" and "Place the order" as four neighbors (`f10`). The Board is "Compound board" in docs. The tilt-shift toggle is "Diorama", which is also a camera mode. Years is the chronicle.
- **Fix (S):** one noun per thing, and one verb per order step ("Add missing", "Place order"). Needs the owner's pick for the Shop and tilt names because both are in the GDS.
- **Owner?** For Shop and Diorama yes.

### U9 (low) No year on the clock
- The clock reads "May 10 06:00" (`f12`); the game is multi-year and multi-generation (`Years` drawer). Fix (S): add the year in the hover card or after the date when the year changes. The photo panel already shows "Spring 2027, day 130".

### UI checks that came out fine
- **Progressive disclosure** works: the Group, Hint and Clamp pattern (`src/ui/hud/common.tsx`) plus sub-page chips keep each drawer to one page; Outside shows "All quiet. more" when nothing is happening (`f31`).
- **Interruptions:** Esc closes one layer at a time (`escStack.ts`); toasts queue and have ttl; the welcome card is dismissible and the clock starts paused. The one lingering item was a "5 purchases..." toast still visible 55 seconds of wall time later (`f11`, `f12`); the toast store uses real-time ttl, so this may be a harness effect, and it is not ranked.
- **Error messages** are good: "No weak spots to mark: there is no finished wall a climber could bypass yet." (`f22`), "Nothing to site yet: place a solar array or a garden bed and its shade shows here." A pattern to copy.
- **US units:** `unitsLint.test.ts` holds; the frames show ft, mi, F and acres throughout.
- **Keyboard:** drawer letters, Tab to reopen, "/" for catalog search, arrow keys in the catalog (`BuildDrawer.tsx:166-182`), Esc stack. Good; the gaps are Space and digits (U1) and overlays (U2).
- **Accessibility basics:** alerts carry glyphs, reduced-motion is honored (`layoutACss.ts:60`, `index.css:12`), contrast tokens are tested. The gap is the overlay palettes (G1) and font size (U6).

## 6. What this PR changes (small, safe, separate commit)

Only copy and label consistency; no rule, layout or balance change.
- `src/ui/hud/drawerRegistry.ts`: the Family drawer's action-bar label is "Family" (was "People"), matching its hover card, its drawer header and the F hotkey. `drawerRegistry.test.ts` gains a test that every drawer's label equals its title.
- `src/ui/Hud.tsx` (View settings): the selects now name themselves in their visible text, so the popover reads without hovering: "Season: auto", "Weather: auto", "Graphics: medium", "Frame cap: 60 fps", and the three raid-scene selects "Raid blood: shown", "Raid names: on", "Raid status dots: on" (was "Graphic", "Names on", "Status pips on"). Option values, test ids and aria labels are unchanged.
- `scripts/designAuditShots.mjs`: the capture driver used for this audit, so the frames can be reproduced.
- Not changed on purpose (owner call): the tilt-shift toggle's "Diorama" name (GDS section 6), the Shop names, any threshold.

## 7. Reproduce the counts and frames

```
# type / color / layering drift (src/ui only)
grep -rhoE "fontSize: ?[0-9.]+" src/ui | sed 's/fontSize: *//' | sort -n | uniq -c
grep -rhoE "#[0-9a-fA-F]{6}\b" src/ui | sort -u | wc -l
grep -rhoE "zIndex: ?[0-9]+" src/ui src/game | sort -u | wc -l
grep -rho "title=" src/ui | wc -l          # native tooltips
grep -rho "<HoverHost" src/ui | wc -l       # hover cards
# frames (one new game, 1512 x 860, then 1280 x 720, 1100 x 700, 390 x 844)
AUDIT_SCRIPT=<script> flock /tmp/cb.lock node scripts/designAuditShots.mjs /tmp/audit 5981 b
```
The drive scripts are `scripts/designAudit.partB.mjs` (wizard, HUD, drawers, overlays, viewports) and `scripts/designAudit.partC.mjs` (sightlines with settle time, eye level, time of day, tiers, the first raid, the report card). Run them with `AUDIT_SCRIPT=scripts/designAudit.partB.mjs`.

## 8. Prioritized roadmap (top 10)

Ordered by player impact over effort; "Owner" marks decisions to settle first.

| # | Do | Findings | Effort | Owner |
|---|---|---|---|---|
| 1 | Space pause and 1 to 4 speed keys; label speeds in real time; add "Run until something needs me" | U1, P3 | S then M | pacing target |
| 2 | Calibrate alarms: neutral peacetime store state, red only when a consequence is near; fix the Food checklist threshold (half a year, not one garden) | P1, P2 | M, S | tone for P1 |
| 3 | Split View settings into an Overlays tray (Blueprint, Sightlines, Terrain, Weak spots, Boundary, docked legend, hotkeys) and a Settings panel | U2 | M | |
| 4 | Colorblind-safe overlays: redundant encoding plus an Okabe-Ito option; a test on simulated palette distance | G1 | S to M | |
| 5 | Make sites findable: halo on stake outlines, name chips, world-space progress rings, unlabeled prop fix | G2, G3 | S to M | |
| 6 | Open drawers on the alerting page and sort sections by urgency | U4 | S | |
| 7 | Stop clamping consequence text on stance cards (selected card shows all) | P7 | S | |
| 8 | Readability floor for night and dawn at the diorama camera; start new games at 09:00 | G4 | S to M | mood |
| 9 | Ratchet tests for type, color, z-index and `title=`; migrate decision tooltips to `Tip` | U5, U6 | M | |
| 10 | Peacetime ladder ("Prepared" card) and auto-order switch; then, as design work, wealth and hiding balance | P6, P5, P4 | M to L | yes |

Also queued behind these: narrow-window policy (U7, owner: is a phone a target), naming pass (U8, owner for Shop and Diorama), year on the clock (U9), flat water and road (G6), truck (G5), season setter validation (G10).

## 9. What is already great (keep it)

- **The gate card.** Stances written as plain-language odds ("a hard wall: about 18 in 100 turn back before a shot", "if you hide: they find the place lived in about 1 in 10") over the live scene, with a full-width Watch button (`f27`). It is the clearest "information before a consequence" in the game. Only the clamp (P7) needs fixing.
- **The Board** (`f09`): vitals with text, not just dots; a "Days with no resupply" row that explains itself ("Only what is on the place now"); every row has a "Show me" jump; read-only on purpose.
- **Overlay legends in plain words, and empty states that explain** (`f17` to `f22`): the Shade readout lists each solar array and bed with its percent shaded; Weak spots says why there is nothing to mark.
- **Blueprint labels** (`f14`): name plus role chips that stay readable at diorama distance.
- **One-primary-action goal card** with a short "why", honest time and cash, and a clock that starts paused with a welcome (`f01`).
- **Glyph plus color alarms and the 5-step type scale** in layout A, a tested token set, reduced-motion support, an Esc stack that closes one layer per press.
- **Report-card prose** that names what the build did ("Your cistern kept the water coming every day", "No one knew first aid").
- **Lighting and eye-level at their best:** snow with long shadows (`f25`), summer noon over the pond (`f34`), golden hour with a warm ground and long shadows (`f37`), and eye-level yards with mountains, laundry line, woodpile, tent, picnic tables and a standing figure (`f23`, `f35`, `f36`) are genuinely good; the procedural-only rule is paying off.
- **Setup screen honesty:** region cards with frost-free days, winter lows and storm lists; "where the money came from"; difficulty written as numbers and consequences (`f26`, `f21`).
- **Discipline:** `unitsLint`, the perf budget (never raised without a DECISIONS row), staged boot, tier step-down.

## 10. Frame index

All in `docs/audits/frames/`. 1512 x 860 unless noted. "Lot 1" is the 5-acre snowy Mountain West lot; "lot 2" is the pond farmhouse lot.

| Frame | What it shows |
|---|---|
| f01 | Lot 1, first frame after "Buy it and start": goal card, 9 chips (5 red or amber), welcome card |
| f02 | Starter-compound preview: ghosts on snow, Build drawer open, duplicate tooltip over the goal card |
| f03 | After "Place all": staked outlines on snow, "Order what the plans need" |
| f06 | Family drawer |
| f07 | Utilities drawer opens on Heat while water and power are the alerts |
| f08 | Defense drawer, "17 Exposed" |
| f09 | Board: Status, Days with no resupply, Waiting on you |
| f10 | Shop (Town and the mail-order catalog) |
| f11 | Day 3 of construction: unlabeled props, Projects drawer, purchase toast |
| f12 | Day 28: Projects "Nothing under way", food still 1 day |
| f13 | View settings popover |
| f14 | Blueprint overlay with the popover covering part of it |
| f15 | Road sight overlay that did not fill in under the on-demand renderer (harness limit) |
| f16 | Night sightline overlay |
| f17, f18, f20, f32 | Terrain overlays: high ground, lanes, fire, shade |
| f19 | Lanes overlay under a deuteranopia simulation |
| f21, f26 | Setup screen: family step, region step |
| f22 | Weak spots empty-state message |
| f23 | Close diorama view of the compound |
| f24 | Lot 1 at 23:00 |
| f25 | Winter and snow at distance |
| f27 | Raid prompt (stance cards, clamped text); another agent's run, same build |
| f28 | Supplies drawer (pantry, 49 tools, food below the fold) |
| f29 | 390 x 844: no panel buttons |
| f30 | 1100 x 700 with Build open |
| f31 | Outside drawer, "All quiet" |
| f33 | Projects drawer with a stuck order and $709,614 in the bank; another agent's run |
| f34 | Lot 2 at noon |
| f35, f36 | Eye-level yard views with a person (scale check) |
| f37 | Golden hour |
| f38 | Lot 2 at 21:30 |
| f39 | Fall foliage |
| f40 | Report card, forced to a wipe state for layout only |
