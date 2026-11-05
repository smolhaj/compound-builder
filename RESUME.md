# Resume notes (updated 2026-11-05, main at e04e141 = #198, SAVE_VERSION 78)

PR #55 is the only open PR and it is notes only (do not merge). Everything below is on main. Details per merge are in docs/DECISIONS.md (append-only), docs/OVERNIGHT-SUMMARY.md (flag list), docs/BALANCE_PLAYTEST_2.md, docs/GDS_AUDIT.md, docs/BRANCHES.md.

**Save version: 78** (`src/sim/state.ts`). No save bump since #172 (v78 = tunnel collapse + per-ring gate vetting). Bumps this stretch: v73 #161, v74 #164, v75 #168, v76 #169, v77 #170, v78 #172.

## 1. Merged since the last notes (PR numbers)

- **Auto utilities and HUD declutter:** #158 utilities run themselves (no drawn pipes/cables), #159 declutter round 1 (Get operational checklist, top-3 next steps, folded groups), #160 Escape closes Shop, #165 declutter round 2 (wizard, decision cards, Supplies, Family, report), #167 QA bug hunt (gate card under Shop, hookup text).
- **Quarters, joiners, guests:** #169 assigned household quarters (v76), #170 joiners bring things and choose where to stay (v77), #178 bots take STAY/ADMIT env, #181 guests walk in from the road and out the gate, going home remembered by how bad it was.
- **Long game:** #161 dynasty score parts, self-fed milestones, chronicle, Generations tab (v73), #168 orphans fostered by neighbors, yearly threats, off-grid milestone (v75), #164 depth audit + hunter course (v74).
- **Defense extras and raid depth:** #162 moat, covered bridge, vehicle yard (first-pass numbers: WATER, YARD_RULES), #163 boats/lake ice/stair aprons/lodge cutaway, #166 wildlife, livestock, trucks, guard dog on routes, #172 tunnel collapse + per-ring gate vetting (v78), #157 tower parapet (fixed the Hardcore fortress regression).
- **Starter compound:** #173 one-click proposed layout.
- **Save/Load, spend guidance, nobody-home:** #183 Save menu (export/import JSON, clock resumes after decision cards), #184 spend guidance (order/crew totals, reserve confirm, stock-food nudge), #195 spend guard counts hired crew wages + gate queue guard, #194 spend guard on staking/off-lot runs/import sanitising/food nudge, #185 gate quiet while nobody is home (+ masthead, debt, report-card polish), #188 raid aftermath copy, trailer power wording, nobody-home raids.
- **God Mode, settlement, play style, comfort, fire, flow:** #177 GDS audit of every section + God Mode (grade S, not graded), settlement stage, play style (Hermit/Clan/Ark/Haven), comfort and beauty (strain relief up to +4), fire overlay; #182 flow = walking distances as a few percent extra labor hours.
- **County road bridges:** #186 bridges over creeks, ravines, gorges.
- **Road life traffic:** #198 ambient traffic by the collapse clock, wanderers, stalled cars, raids/encounters seen coming on the road (this is the "encounter lead time" work; it is merged, visual only, no save).
- **Regional visual fixes and polish:** #180 forest floors, moat water, winter snow, tent platforms; #190 calmer eye-level ground grain; #197 woodpile, eye camera inside props, desert look, New England tree line, plains leaf-out; #171 visual QA (dense forests, camp clearing).
- **QA sweeps and harness:** #179 and #187 playthrough QA (rounds 1-2), #191 and #194 strategy sweeps (scenarios `scripts/playQa.<hermit|clan|ark|haven|fortress|farmstead|weekender|rich|badstart|god|saveload|uistress>.mjs`), #193 and #196 start-matrix sweep (`playQa.mjs sweep`, narrow-window HUD fold), #189 balance playtest 2, #176 and #178 playtest bot fixes.
- **CI:** #192 CI quiet (superseded runs cancel) and perf-budget heap sampling uses a synchronous last-resort GC (heap swung 68-100 MB for one build; real heap flat ~76 MB). Budgets unchanged.
- **Docs:** #174 branch inventory, #175 README/CLAUDE.md refresh.

## 2. Balance flags to review (no numbers were changed; data in docs/BALANCE_PLAYTEST_2.md)

1. **Comfort help (#177)** eases Standard slightly (prepper 24/33 alive both ways, homestead 12/30 -> 13/32, idle 4/27 -> 6/29; Hardcore homestead 7/29 -> 9/32). Cap is +4 strain points; the open question is +3 or buildable decor.
2. **Guests bond +8 + hardship (#181):** going home is remembered by how bad the stay was. Treat as a small plus; watch that guests are not a free loyalty farm.
3. **Crews versus the quote:** bot saw about $70k billed vs about $47k shown. Not reproducible from one quote (sum over several buildings, mud slowdown, well-drill footage, queued fixes). Recommendation: label the quote "plus mud days and drilling" and show crew-paid so far. #184/#195 added totals but not that label.
4. **Cozy starvation:** nobody dies; 16/36 Cozy runs had over 30 hungry days, 12 over 300 (up to 727 days). Either state it on the difficulty card or let hunger kill very slowly after about 120 days. Hunger is also uncapped as a counter (cumulative shortfall in the hundreds of thousands for idle families is not a loop, see #195).
5. **Cozy money sinks:** Cozy ends rich (median $344k, max $1.26M). Keep the money, add sinks (comfort tier, property tax or insurance in later years).
6. **Standard adults-extinct 19/36 (53 %):** 6 wipes + 13 fostered. Hardcore 15 wipes + 10 fostered, 25/36 grade F, still lethal. Fostering is a non-wipe by decision (#168). Weakest Standard rows: idle (7/9 F) and homestead (5/9 F); cheap lever is a better homestead bot opener (more early fields).
7. Smaller: a stranger can no longer inherit an empty homestead after the last adult dies (#185 rule; design question whether squatters should be allowed); report card does not say children are with a neighbor (recommend one line); 40-year long runs wipe 24/24 so heirs/generations are only unit tested (needs a heir-seeking bot); bots rarely use rig/modular/own-build stay options; tower bunks dormant; a bare tunnel-bridge adds a lane and makes a crew-of-10 raid slightly easier.

## 3. Open design questions and options not built

- Road passers-by: noticing the compound's lights, trading with them, road blocks, radio rumors tied to road traffic (#198 is visual only and never feeds the encounter generator).
- Governance at hamlet stage (GDS_AUDIT Q1: recommended rules votes only; not built).
- Tilt-shift diorama look (Q2: High only, off by default, toggle in the view bar).
- Shade overlay (Q4: noon winter-solstice shadow as a Terrain mode); radiation overlay (Q6: PF readout in Blueprint view); medical dependency draw (Q5); photo capture, room assignment, districts still missing/partial.
- Comfort weights (Q7): keep derived, or make decor buildable.
- Lake trestle vs reroute (county road over a lake); fire on the covered bridge not modeled; per-person beds (user chose household level).
- Playtest follow-ups: heir-seeking long-mode bot; make the bot jump detector subtract pooled joiner cash.
- Branches with unmerged ideas: claude/survival-realism (radiation sickness, dehydration/thirst; needs an owner design decision, save v45 vs v78) and claude/farm-kitchen (preserving, seeds, dairy, poultry, livestock health, breeding).

## 4. How to run things

- Setup: `npm ci`; `npm test` (vitest run, whole suite), `npm run lint`, `npm run build` (tsc -b + vite build).
- **Playtests (sim only, slow, one vitest at a time):** `PLAYTEST=1 npx vitest run scripts/playtest.test.ts` writes playtest-report.md. Env: `DIFF` (cozy/standard/hardcore), `STAY` (e.g. mixed) and `ADMIT` (fraction, e.g. 0.5) for joiner coverage, `YEARS` (6 = play to about year 3 after the hit; long mode ~40 with `SEEDS=` filter), `STRATS`, `KINDS`, `SEEDOFF`, `LIFESTYLE`, `WELCOME`, `GATES=<file>` (gate trace). 36 runs = 9 disasters x idle/homestead/prepper/fortress; seed = 11 + 4 x disaster index + strategy index. "Adults extinct" = wipe + fostered.
- **Perf budget:** `npm run build && node scripts/perfBudget.mjs [--tiers low,medium,high] [--print]` against scripts/perfBudget.json. Never raise a budget; lower them when a PR makes the scene lighter.
- **QA harnesses (playwright, one browser at a time):** `node scripts/playQa.mjs <scenario> <outDir> [port]` (cozy, farm, hardcore, family, hermit, clan, ark, haven, fortress, farmstead, weekender, rich, badstart, god, saveload, uistress); `node scripts/playQa.mjs sweep <outDir> [port]` with `SWEEP_SET / SWEEP_FULL / SWEEP_DAYS / SWEEP_HIT / SWEEP_ONLY / SWEEP_FROM / SWEEP_TO`; `node scripts/terrainQa.mjs --out shots/terrain-x [--cases region:lot:seed,...] [--noshots]`; `node scripts/roadLifeShots.mjs --out shots/roadlife --region plains [--lot gorge --relief 9 --elev 600 --only peace-day,night]`; `node scripts/playthrough.mjs`; shot scripts `scripts/*Shots.mjs`.
- **Headless tips:** add `?new&lowrender` (QA only: canvas draws on request; `window.__cb.qa.renderNow()` for a cheap frame, `renderFull('high')` for a full-quality frame at key moments); swiftshader screenshots can time out under load, so run under `flock` and avoid parallel browsers; Esc closes the New game screen.
- **Standing rules from the user:** US spelling; procedural art only; real scale; flag save bumps, balance changes and big visual changes in the morning summary; never raise perf budgets; docs/DECISIONS.md is append-only and merge conflicts keep both sides; features must tie into real mechanics; feature branches and draft PRs, squash-merge when `check` and `perf-budget` are green (CI does not run on conflicting PRs: merge main first); bump the save version plus a migration on state changes and renumber after merging main.

## 5. Needed from the user: real-browser numbers

Load time (to first interactive) and FPS on a real GPU, on **Medium** and on **Try High**. They decide whether High becomes the default (the auto start tier from `engine/perf/qualityAuto.ts` steps down, never up). Everything so far is headless swiftshader and the scene-graph census.

## 6. Branch cleanup (nothing was deleted; the user decides)

Open PRs: only #55. About 200 `claude/*` branches exist on origin.
- **KEEP:** `claude/resume-notes` (PR #55), `claude/survival-realism` (unmerged radiation/thirst work), `claude/farm-kitchen` (unmerged preserving/seeds/dairy/poultry/breeding work).
- **Merged and safe to delete:** every other `claude/*` branch. docs/BRANCHES.md marks 169 merged via PR and 22 already in main by content; since that inventory these have also merged and are safe: starter-compound (#173), visual-polish (#180), branch-inventory (#174), docs-refresh (#175), playtest-anomaly (#176), gds-gaps (#177), bots-stay (#178), playthrough-qa (#179), guests-walk-home (#181), flow-labor (#182), fix-export-clock (#183), fix-spend-nudges (#184), fix-gate-polish (#185), terrain-infra-pass (#186), playthrough-qa2 (#187), fix-qa2-findings (#188), balance-playtest2 (#189), sweep-graphics (#190), sweep-strategies (#191), ci-quiet (#192), sweep-starts (#193), sweep-strategies-2 (#194), refugee-loop (#195), sweep-starts-2 (#196), regional-visual-fixes (#197), road-life (#198).
- Local-only branches and worktrees (listed in docs/BRANCHES.md) were not touched; check each worktree for uncommitted scratch before removing it.
