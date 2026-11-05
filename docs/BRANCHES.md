# Branch inventory (2026-11-04; update 2026-11-05 below)

> Update 2026-11-05: claude/starter-compound (#173) and claude/visual-polish (#180) have merged and are now safe to delete, as are all branches of PRs #174-#198 (see RESUME.md section 6). Still KEEP: claude/resume-notes (open PR #55), claude/survival-realism, claude/farm-kitchen. Only PR #55 is open.

Audit of the 192 `origin/claude/*` branches against `origin/main` (save v78). Method: a branch is **merged** when a merged PR has its head ref and its tip equals that PR head; otherwise every added line of `merge-base..tip` was looked up in main's version of the same file. Squash merges mean `git branch --merged` shows nothing, so the PR list is the evidence.

## Summary

- unmerged unique (not rescued): 2
- active: 3
- merged via PR: 169
- already in main / superseded / obsolete: 22

**Not safe to delete:** claude/starter-compound, claude/resume-notes (open PRs), claude/survival-realism, claude/farm-kitchen (unique work, see table). Tags/archive refs could not be pushed from this environment (proxy 403), so these two stay as branches.

Uncommitted work in worktrees was reviewed: all of it was scratch (env-var experiment toggles in sim files, playtest report/harness tweaks, one-off scripts, a mid-merge cb-merge whose content is already in main as #169/#170). Nothing needed rescuing.

## Origin branches

| Branch | Status | Safe to delete | Last commit |
|---|---|---|---|
| claude/farm-kitchen | UNMERGED, not rescued: WIP (no UI). Part superseded by #89/#97/#145, but preserving.ts, seeds.ts, dairy.ts, poultry.ts, livestockHealth.ts, gestation/breeding are not in main | NO - unique work | 2026-10-25 |
| claude/resume-notes | active (open draft PR #55, main checkout) | NO - active work | 2026-11-04 |
| claude/starter-compound | active (open draft PR #173) | NO - active work | 2026-11-04 |
| claude/survival-realism | UNMERGED, not rescued: radiation sickness (radiation.ts), dehydration (thirst.ts) are not in main; cold.ts was re-implemented differently in main (#134). Merging conflicts in 10 files incl. cold.ts add/add and save v45 vs main v78 - needs an owner design decision | NO - unique work | 2026-10-25 |
| claude/armory | merged via PR #34 | yes | 2026-10-24 |
| claude/armory-gear | merged via PR #35 | yes | 2026-10-24 |
| claude/arrow-keys | merged via PR #57 | yes | 2026-10-27 |
| claude/assigned-quarters | merged via PR #169 | yes | 2026-11-04 |
| claude/atmosphere | merged via PR #59 | yes | 2026-10-27 |
| claude/auto-utilities | merged via PR #158 | yes | 2026-10-30 |
| claude/auto-weapons | merged via PR #39 | yes | 2026-10-24 |
| claude/backlog-f | merged via PR #134 | yes | 2026-10-30 |
| claude/balance | merged via PR #75 | yes | 2026-10-28 |
| claude/barter | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/bathroom | merged via PR #61 | yes | 2026-10-27 |
| claude/battle-armor | merged via PR #44 | yes | 2026-10-24 |
| claude/battle-camera | merged via PR #42 | yes | 2026-10-24 |
| claude/battle-polish | merged via PR #43 | yes | 2026-10-24 |
| claude/battle-sim | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/battle-view | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/black-market | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/blackout | merged via PR #71 | yes | 2026-10-28 |
| claude/body-household | merged via PR #32 | yes | 2026-10-24 |
| claude/boundary | merged via PR #60 | yes | 2026-10-27 |
| claude/bridge-door-locks | merged via PR #111 | yes | 2026-10-29 |
| claude/bug-out-fort | merged via PR #135 | yes | 2026-10-30 |
| claude/building-interiors | merged via PR #49 | yes | 2026-10-24 |
| claude/buildings | merged via PR #9 | yes | 2026-10-24 |
| claude/bunker | merged via PR #10 | yes | 2026-10-24 |
| claude/bunker-hardening | merged via PR #12 | yes | 2026-10-24 |
| claude/bunker-hatch | merged via PR #108 | yes | 2026-10-29 |
| claude/bunker-interiors | already in main (PR #106 merged; 7 later WIP commits, 0% of added lines missing from main) | yes - content in main | 2026-10-29 |
| claude/collapse-clock | merged via PR #13 | yes | 2026-10-24 |
| claude/combat | merged via PR #41 | yes | 2026-10-24 |
| claude/combat-base | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/combat-realism | merged via PR #45 | yes | 2026-10-24 |
| claude/compound-buildings | merged via PR #47 | yes | 2026-10-24 |
| claude/compound-rings | merged via PR #109 | yes | 2026-10-29 |
| claude/container-colours | merged via PR #121 | yes | 2026-10-29 |
| claude/cottage-garage | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/creek-bars | merged via PR #62 | yes | 2026-10-27 |
| claude/daily-life | superseded: re-landed as #76 (daily life v2) | yes - superseded | 2026-10-25 |
| claude/daily-life-2 | merged via PR #76 | yes | 2026-10-28 |
| claude/defense-extras | merged via PR #162 | yes | 2026-11-04 |
| claude/depth-audit | merged via PR #164 | yes | 2026-11-04 |
| claude/disasters | merged via PR #20 | yes | 2026-10-24 |
| claude/dogs | merged via PR #66 | yes | 2026-10-28 |
| claude/door-breach | merged via PR #130 | yes | 2026-10-30 |
| claude/drainage-channels | merged via PR #115 | yes | 2026-10-29 |
| claude/encounter-realism | merged via PR #54 | yes | 2026-10-25 |
| claude/encounters | merged via PR #16 | yes | 2026-10-24 |
| claude/escape-tunnel | merged via PR #11 | yes | 2026-10-24 |
| claude/family-fleet | merged via PR #83 | yes | 2026-10-28 |
| claude/family-reroll | merged via PR #28 | yes | 2026-10-24 |
| claude/family-variety | merged via PR #73 | yes | 2026-10-28 |
| claude/farm-choices | merged via PR #97 | yes | 2026-10-29 |
| claude/farm-kitchen-depth | merged via PR #89 | yes | 2026-10-29 |
| claude/farm-kitchen-herd | merged via PR #90 | yes | 2026-10-29 |
| claude/fix-daily-balance | merged via PR #81 | yes | 2026-10-28 |
| claude/fleet | merged via PR #84 | yes | 2026-10-28 |
| claude/food-items | merged via PR #51 | yes | 2026-10-25 |
| claude/food-needs | merged via PR #15 | yes | 2026-10-24 |
| claude/forge | merged via PR #154 | yes | 2026-10-30 |
| claude/forge-roof | merged via PR #156 | yes | 2026-10-30 |
| claude/fort-labels | merged via PR #131 | yes | 2026-10-30 |
| claude/fortress-ring | merged via PR #80 | yes | 2026-10-28 |
| claude/gate-door-line | merged via PR #139 | yes | 2026-10-30 |
| claude/gatehouse-sally-towers | merged via PR #113 | yes | 2026-10-29 |
| claude/greenhouse-orchard | superseded: re-landed via #47 / #82 (heated greenhouse, orchard grove) | yes - superseded | 2026-10-24 |
| claude/grid-down | merged via PR #14 | yes | 2026-10-24 |
| claude/hardcore-harden | merged via PR #98 | yes | 2026-10-29 |
| claude/hillside-example | merged via PR #110 | yes | 2026-10-29 |
| claude/house-cover | merged via PR #141 | yes | 2026-10-30 |
| claude/housing | merged via PR #77 | yes | 2026-10-28 |
| claude/housing-leftovers | merged via PR #140 | yes | 2026-10-30 |
| claude/housing-styles | merged via PR #118 | yes | 2026-10-29 |
| claude/hydro-walls | merged via PR #155 | yes | 2026-10-30 |
| claude/infra-aqua | merged via PR #150 | yes | 2026-10-30 |
| claude/infra-docks | merged via PR #151 | yes | 2026-10-30 |
| claude/infra-hydro | merged via PR #148 | yes | 2026-10-30 |
| claude/infra-microclimate | merged via PR #149 | yes | 2026-10-30 |
| claude/infra-outposts | merged via PR #152 | yes | 2026-10-30 |
| claude/infra-terrace | merged via PR #153 | yes | 2026-10-30 |
| claude/interiors | merged via PR #8 | yes | 2026-10-23 |
| claude/joiners-bring-stuff | merged via PR #170 | yes | 2026-11-04 |
| claude/keep-build-tab | merged via PR #69 | yes | 2026-10-28 |
| claude/land | merged via PR #19 | yes | 2026-10-24 |
| claude/land-improvements | merged via PR #26 | yes | 2026-10-24 |
| claude/landscape | merged via PR #21 | yes | 2026-10-24 |
| claude/lane-walk | merged via PR #133 | yes | 2026-10-30 |
| claude/leftovers | merged via PR #163 | yes | 2026-11-04 |
| claude/linked-compounds | merged via PR #68 | yes | 2026-10-28 |
| claude/lived-in | merged via PR #85 | yes | 2026-10-29 |
| claude/livestock | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/long-game | merged via PR #38 | yes | 2026-10-24 |
| claude/long-game-2 | merged via PR #168 | yes | 2026-11-04 |
| claude/long-game-endless | merged via PR #161 | yes | 2026-11-04 |
| claude/lowrender | merged via PR #70 | yes | 2026-10-28 |
| claude/m1-scaffold | merged via PR #1 | yes | 2026-10-23 |
| claude/m1-terrain | merged via PR #2 | yes | 2026-10-23 |
| claude/m1-trees | merged via PR #3 | yes | 2026-10-23 |
| claude/m1-weather-water-cabin | merged via PR #4 | yes | 2026-10-23 |
| claude/m2-people | merged via PR #6 | yes | 2026-10-23 |
| claude/m2-sim-core | merged via PR #5 | yes | 2026-10-23 |
| claude/m2-timber | merged via PR #7 | yes | 2026-10-23 |
| claude/misty-mountain | already in main (PR #117 merged; 4 later commits, 1% differs) | yes - content in main | 2026-10-29 |
| claude/money-metals | merged via PR #33 | yes | 2026-10-24 |
| claude/monotone-defense | merged via PR #137 | yes | 2026-10-30 |
| claude/motor-court-razor | merged via PR #116 | yes | 2026-10-29 |
| claude/mountain-lots-listings | merged via PR #104 | yes | 2026-10-29 |
| claude/mountain-lots-slope | merged via PR #105 | yes | 2026-10-29 |
| claude/mountain-lots-terrain | merged via PR #103 | yes | 2026-10-29 |
| claude/neighbors-join | merged via PR #87 | yes | 2026-10-29 |
| claude/nuclear | merged via PR #17 | yes | 2026-10-24 |
| claude/opsec | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/orchard-plots | merged via PR #119 | yes | 2026-10-29 |
| claude/pad-stairs | merged via PR #136 | yes | 2026-10-30 |
| claude/pages | merged via PR #56 | yes | 2026-10-27 |
| claude/paperwork | merged via PR #29 | yes | 2026-10-24 |
| claude/peacetime-breakins | merged via PR #46 | yes | 2026-10-24 |
| claude/people-depth | superseded: re-landed as #93 (mental health, skills) and #95 (medical depth) | yes - superseded | 2026-10-25 |
| claude/people-extras | merged via PR #99 | yes | 2026-10-29 |
| claude/people-medical | merged via PR #95 | yes | 2026-10-29 |
| claude/people-mind-skills | merged via PR #93 | yes | 2026-10-29 |
| claude/people-sickbay | merged via PR #100 | yes | 2026-10-29 |
| claude/perf-adaptive | merged via PR #126 | yes | 2026-10-30 |
| claude/perf-budget | merged via PR #127 | yes | 2026-10-30 |
| claude/perf-load | merged via PR #125 | yes | 2026-10-30 |
| claude/perf-pass | merged via PR #92 | yes | 2026-10-29 |
| claude/perf-showcase-slice | merged via PR #129 | yes | 2026-10-30 |
| claude/perimeter-shapes-pr | merged via PR #102 | yes | 2026-10-29 |
| claude/playtest | merged via PR #22 | yes | 2026-10-24 |
| claude/playtest-long | merged via PR #53 | yes | 2026-10-25 |
| claude/playtest-polish | merged via PR #23 | yes | 2026-10-24 |
| claude/playtest-round2 | merged via PR #48 | yes | 2026-10-24 |
| claude/playtest3-fixes | merged via PR #91 | yes | 2026-10-29 |
| claude/polish-playtest2 | merged via PR #79 | yes | 2026-10-28 |
| claude/polish-verify | merged via PR #94 | yes | 2026-10-29 |
| claude/qa-bughunt | merged via PR #167 | yes | 2026-11-04 |
| claude/radio | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/raid-aftermath | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/raid-cutscene | merged via PR #65 | yes | 2026-10-27 |
| claude/raid-depth | merged via PR #172 | yes | 2026-11-04 |
| claude/ravine-tunnel-bridge | merged via PR #107 | yes | 2026-10-29 |
| claude/real-prices | merged via PR #25 | yes | 2026-10-24 |
| claude/regions | merged via PR #52 | yes | 2026-10-27 |
| claude/report-card | merged via PR #18 | yes | 2026-10-24 |
| claude/rescue | merged via PR #50 | yes | 2026-10-25 |
| claude/retaining-walls | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/retaining-walls-2 | merged via PR #120 | yes | 2026-10-29 |
| claude/ring-creek-bars | merged via PR #112 | yes | 2026-10-29 |
| claude/ring-fallback | merged via PR #132 | yes | 2026-10-30 |
| claude/road-gate | merged via PR #88 | yes | 2026-10-29 |
| claude/roads-polish | merged via PR #142 | yes | 2026-10-30 |
| claude/rock-tunnel | merged via PR #124 | yes | 2026-10-30 |
| claude/rumor-scouting | merged via PR #143 | yes | 2026-10-30 |
| claude/sally-no-choke | merged via PR #138 | yes | 2026-10-30 |
| claude/seasons-upkeep | merged via PR #30 | yes | 2026-10-24 |
| claude/self-sufficient | merged via PR #82 | yes | 2026-10-29 |
| claude/shared-harvest | merged via PR #147 | yes | 2026-10-30 |
| claude/shelf-life | merged via PR #31 | yes | 2026-10-24 |
| claude/shop-escape | merged via PR #160 | yes | 2026-10-31 |
| claude/showcase-mountain | merged via PR #123 | yes | 2026-10-30 |
| claude/soap-making | merged via PR #145 | yes | 2026-10-30 |
| claude/spare-parts | merged via PR #144 | yes | 2026-10-30 |
| claude/systems | merged via PR #40 | yes | 2026-10-24 |
| claude/terrain-analysis | merged via PR #101 | yes | 2026-10-29 |
| claude/terrain-roads | merged via PR #114 | yes | 2026-10-29 |
| claude/tools | merged via PR #72 | yes | 2026-10-28 |
| claude/tower-parapet | merged via PR #157 | yes | 2026-10-30 |
| claude/tunnel-use | merged via PR #146 | yes | 2026-10-30 |
| claude/ui-declutter | merged via PR #159 | yes | 2026-10-30 |
| claude/ui-declutter-2 | merged via PR #165 | yes | 2026-11-04 |
| claude/upgrades | merged via PR #64 | yes | 2026-10-27 |
| claude/ux-first-time | merged via PR #74 | yes | 2026-10-28 |
| claude/ux-pass | obsolete: only a regenerated playtest-report.md | yes - generated report | 2026-10-27 |
| claude/vehicles | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/visual-qa | merged via PR #171 | yes | 2026-11-04 |
| claude/walkers-3d | merged via PR #166 | yes | 2026-11-04 |
| claude/wall-hazards | merged via PR #63 | yes | 2026-10-27 |
| claude/wall-stone-darker | merged via PR #122 | yes | 2026-10-29 |
| claude/walls-drive-fix | merged via PR #128 | yes | 2026-10-30 |
| claude/watchtowers | merged via PR #67 | yes | 2026-10-28 |
| claude/water | merged via PR #36 | yes | 2026-10-24 |
| claude/water-wild-food | merged via PR #24 | yes | 2026-10-24 |
| claude/weather-threats | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/weekender | merged via PR #86 | yes | 2026-10-29 |
| claude/weekender-farm-tune | merged via PR #96 | yes | 2026-10-29 |
| claude/wild-food | merged via PR #37 | yes | 2026-10-24 |
| claude/wildlife | merged via PR #78 | yes | 2026-10-28 |
| claude/world-fates | merged via PR #27 | yes | 2026-10-24 |
| claude/world-life | merged via PR #58 | yes | 2026-10-27 |

## Local branches

| Local-only branch | Status | Safe to delete |
|---|---|---|
| claude/visual-polish | active (cb-polish worktree) | NO - active work |
| resume-notes | active (main checkout, = PR #55 head) | NO - active work |
| claude/gds-gaps, claude/playthrough-qa | 0 commits ahead of main (newest local work 2026-11-04, check worktree before deleting) | yes, if no worktree is using it |
| claude/bunker-base, claude/defense-depth, claude/playtest-main, claude/playtest2, claude/playtest2-hands | 0 commits ahead of main | yes (playtest2 / bunker-base worktrees have uncommitted playtest-script tweaks, scratch) |
| bridge-rebuild, claude/bunker-shots, claude/infra-tunnels, claude/lived-in-final, claude/mountain-lots, claude/perimeter-shapes, doors, drain, gatehouse, motorcourt, ringbars, rings-rebuild, rings2, tmp-docks, tmp-out, tmp-out2, tmp-rebuild, tmp-ter, tmp-ter2, tmp-ter3, tmp2, tmp3, herd-old, claude/hail-fix | not on origin; at least 95% of their added lines already exist in main (only hail-fix 81%, differences are playtest-report.md / harness) | yes |
| claude/battle-armor, claude/pad-stairs, claude/retaining-walls | local copies ahead of origin by 1 / 6 / 4 commits; nothing missing from main (battle-armor 0 lines, others 2-14%) | yes |
