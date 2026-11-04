# Branch inventory (2026-11-04)

Audit of the 192 `origin/claude/*` branches against `origin/main` (save v78). Method: a branch is **merged** when a merged PR has its head ref and its tip equals that PR head; otherwise every added line of `merge-base..tip` was looked up in main's version of the same file. Squash merges mean `git branch --merged` shows nothing, so the PR list is the evidence.

## Summary

- unmerged unique: 2
- active: 2
- in main / superseded / obsolete: 188

**Not safe to delete:** claude/starter-compound, claude/resume-notes (open PRs), claude/survival-realism, claude/farm-kitchen (unique work, see table). Tags/archive refs could not be pushed from this environment (proxy 403), so these two stay as branches.

Uncommitted work in worktrees was reviewed: all of it was scratch (env-var experiment toggles in sim files, playtest report/harness tweaks, one-off scripts, a mid-merge cb-merge whose content is already in main as #169/#170). Nothing needed rescuing.

## Origin branches

| Branch | Status | Safe to delete | Last commit |
|---|---|---|---|
| claude/farm-kitchen | UNMERGED, not rescued: WIP (no UI). Part superseded by #89/#97/#145, but preserving.ts, seeds.ts, dairy.ts, poultry.ts, livestockHealth.ts, gestation/breeding are not in main | NO - unique work | 2026-10-25 |
| claude/resume-notes | active (open draft PR #55, main checkout) | NO - active work | 2026-11-04 |
| claude/starter-compound | active (open draft PR #173) | NO - active work | 2026-11-04 |
| claude/survival-realism | UNMERGED, not rescued: radiation sickness (radiation.ts), dehydration (thirst.ts) are not in main; cold.ts was re-implemented differently in main (#134). Merging conflicts in 10 files incl. cold.ts add/add and save v45 vs main v78 - needs an owner design decision | NO - unique work | 2026-10-25 |
| claude/armory | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/armory-gear | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/arrow-keys | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/assigned-quarters | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/atmosphere | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/auto-utilities | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/auto-weapons | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/backlog-f | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/balance | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/barter | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/bathroom | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/battle-armor | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/battle-camera | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/battle-polish | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/battle-sim | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/battle-view | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/black-market | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/blackout | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/body-household | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/boundary | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/bridge-door-locks | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/bug-out-fort | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/building-interiors | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/buildings | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/bunker | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/bunker-hardening | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/bunker-hatch | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/bunker-interiors | already in main (PR #106 merged; 7 later WIP commits, 0% of added lines missing from main) | yes - content in main | 2026-10-29 |
| claude/collapse-clock | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/combat | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/combat-base | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/combat-realism | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/compound-buildings | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/compound-rings | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/container-colours | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/cottage-garage | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/creek-bars | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/daily-life | superseded: re-landed as #76 (daily life v2) | yes - superseded | 2026-10-25 |
| claude/daily-life-2 | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/defense-extras | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/depth-audit | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/disasters | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/dogs | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/door-breach | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/drainage-channels | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/encounter-realism | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-25 |
| claude/encounters | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/escape-tunnel | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/family-fleet | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/family-reroll | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/family-variety | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/farm-choices | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/farm-kitchen-depth | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/farm-kitchen-herd | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/fix-daily-balance | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/fleet | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/food-items | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-25 |
| claude/food-needs | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/forge | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/forge-roof | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/fort-labels | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/fortress-ring | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/gate-door-line | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/gatehouse-sally-towers | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/greenhouse-orchard | superseded: re-landed via #47 / #82 (heated greenhouse, orchard grove) | yes - superseded | 2026-10-24 |
| claude/grid-down | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/hardcore-harden | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/hillside-example | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/house-cover | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/housing | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/housing-leftovers | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/housing-styles | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/hydro-walls | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/infra-aqua | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/infra-docks | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/infra-hydro | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/infra-microclimate | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/infra-outposts | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/infra-terrace | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/interiors | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/joiners-bring-stuff | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/keep-build-tab | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/land | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/land-improvements | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/landscape | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/lane-walk | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/leftovers | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/linked-compounds | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/lived-in | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/livestock | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/long-game | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/long-game-2 | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/long-game-endless | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/lowrender | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/m1-scaffold | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/m1-terrain | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/m1-trees | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/m1-weather-water-cabin | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/m2-people | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/m2-sim-core | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/m2-timber | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-23 |
| claude/misty-mountain | already in main (PR #117 merged; 4 later commits, 1% differs) | yes - content in main | 2026-10-29 |
| claude/money-metals | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/monotone-defense | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/motor-court-razor | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/mountain-lots-listings | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/mountain-lots-slope | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/mountain-lots-terrain | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/neighbors-join | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/nuclear | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/opsec | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/orchard-plots | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/pad-stairs | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/pages | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/paperwork | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/peacetime-breakins | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/people-depth | superseded: re-landed as #93 (mental health, skills) and #95 (medical depth) | yes - superseded | 2026-10-25 |
| claude/people-extras | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/people-medical | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/people-mind-skills | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/people-sickbay | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/perf-adaptive | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/perf-budget | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/perf-load | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/perf-pass | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/perf-showcase-slice | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/perimeter-shapes-pr | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/playtest | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/playtest-long | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-25 |
| claude/playtest-polish | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/playtest-round2 | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/playtest3-fixes | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/polish-playtest2 | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/polish-verify | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/qa-bughunt | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/radio | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/raid-aftermath | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/raid-cutscene | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/raid-depth | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/ravine-tunnel-bridge | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/real-prices | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/regions | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/report-card | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/rescue | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-25 |
| claude/retaining-walls | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/retaining-walls-2 | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/ring-creek-bars | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/ring-fallback | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/road-gate | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/roads-polish | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/rock-tunnel | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/rumor-scouting | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/sally-no-choke | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/seasons-upkeep | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/self-sufficient | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/shared-harvest | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/shelf-life | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/shop-escape | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-31 |
| claude/showcase-mountain | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/soap-making | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/spare-parts | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/systems | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/terrain-analysis | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/terrain-roads | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/tools | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/tower-parapet | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/tunnel-use | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/ui-declutter | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/ui-declutter-2 | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/upgrades | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/ux-first-time | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/ux-pass | obsolete: only a regenerated playtest-report.md | yes - generated report | 2026-10-27 |
| claude/vehicles | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/visual-qa | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/walkers-3d | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-11-04 |
| claude/wall-hazards | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |
| claude/wall-stone-darker | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/walls-drive-fix | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-30 |
| claude/watchtowers | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/water | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/water-wild-food | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/weather-threats | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/weekender | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/weekender-farm-tune | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-29 |
| claude/wild-food | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/wildlife | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-28 |
| claude/world-fates | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-24 |
| claude/world-life | already in main by content (squashed in with a combined PR; residual diff is later evolution of the same files) | yes - content in main | 2026-10-27 |

## Local branches

| Local-only branch | Status | Safe to delete |
|---|---|---|
| claude/visual-polish | active (cb-polish worktree) | NO - active work |
| resume-notes | active (main checkout, = PR #55 head) | NO - active work |
| claude/gds-gaps, claude/playthrough-qa | 0 commits ahead of main (newest local work 2026-11-04, check worktree before deleting) | yes, if no worktree is using it |
| claude/bunker-base, claude/defense-depth, claude/playtest-main, claude/playtest2, claude/playtest2-hands | 0 commits ahead of main | yes (playtest2 / bunker-base worktrees have uncommitted playtest-script tweaks, scratch) |
| bridge-rebuild, claude/bunker-shots, claude/infra-tunnels, claude/lived-in-final, claude/mountain-lots, claude/perimeter-shapes, doors, drain, gatehouse, motorcourt, ringbars, rings-rebuild, rings2, tmp-docks, tmp-out, tmp-out2, tmp-rebuild, tmp-ter, tmp-ter2, tmp-ter3, tmp2, tmp3, herd-old, claude/hail-fix | not on origin; at least 95% of their added lines already exist in main (only hail-fix 81%, differences are playtest-report.md / harness) | yes |
| claude/battle-armor, claude/pad-stairs, claude/retaining-walls | local copies ahead of origin by 1 / 6 / 4 commits; nothing missing from main (battle-armor 0 lines, others 2-14%) | yes |
