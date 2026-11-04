# Resume notes (updated at pause 2026-11-04, main after #171, save v78)

State: all feature PRs merged (latest #170 joiners bring things + choose where they stay). Only this notes PR (#55) is open. docs/OVERNIGHT-SUMMARY.md lists every merge, save bump and balance flag since the first overnight run.

Landed this week: HUD declutter rounds 1+2, auto utilities, Escape closes Shop, long game (dynasty parts, orphans fostered, yearly threats, v73/v75), hunter course (v74), moat + covered bridge + vehicle yard, boats/lake ice/stairs/lodge cutaway, livestock + animals + trucks on routes + guard dog post, QA fixes, assigned household quarters (v76), joiners bring stuff + stay options (v77), tunnel collapse + per-ring gate vetting (v78), visual QA (dense forest for Appalachia/PNW/north_woods lots, camp clearing, woodpile fix).

Pick up here:
1. Ask the user for real-browser load time + FPS on Medium and Try High (decides High default).
2. Watch: fostered-orphan runs are not wipes (Standard wipes 20->4/36, Hardcore 25->14); if Hardcore feels soft, require orphans to be a few years old or add a 'line alive, nobody home' column to the bot report.
3. Open: fire on the covered bridge not modeled; lake ice looks blotchy from above; modular-home eye shot unverified; QA rendered all 23 real region x lot combos (4 regions have lots, the rest get classic ground); Appalachia ground colour still saturated green; hillside tents sit partly in the slope; moat water reads as a flat teal strip from low angles; Appalachia winter snow looks patchy; no real-hardware frame times; bots never pick a stay choice (add STAY env to scripts/playtest.test.ts); tower bunks dormant.
4. Ideas queued: tunnel collapse as a raid outcome, per-ring gate vetting, per-person beds (user chose household level).
Workflow: feature branches, draft PRs, squash-merge when `check` and `perf-budget` are green (CI does not run on conflicting PRs: merge main first); never raise perf budgets; DECISIONS.md rows conflict, keep both sides; bump save version + migration on state changes and renumber after merging main. docs/NEXT-ROUND.md has the agent brief template.
