# Morning summary (main is now save v64)

Merged overnight (squash, CI green, visuals viewed):
- #86 Weekender lifestyle (v59)
- #87 Neighbors and strangers, scout betrayal (v60)
- #91 Playtest round 3 fixes (no save)
- #92 Performance pass: update loop ~2x cheaper, ~17% fewer main-pass draw calls, probe script (no save)
- #89 Farm & kitchen 1: crops/seed/soil, kitchen, cellar, Farm tab (v61)
- #90 Farm & kitchen 2: bees, maple, herd (v62)
- #94 Polish + verify: night aerial lift, re-roof suggestion, build tool disarm, setup text fixes, Monday start (no save)
- #93 People 1: mental health + skills (v63)
- #95 People 2: medical depth (v64)

Reports: playtest3-report.md, verify-v62-report.md, perf/ (before/after), MORNING-SUMMARY.md.

Decisions for you:
1. Hardcore hardening for prepper audience? Built-up prepper dies ~16-21% on Hardcore vs 7-8% Standard. Agent suggests modest hardening (crew size vs fortified places after year 1, first-winter store tax), target 25-30%.
2. Weekender cash pacing: town house ~$4.8k/mo leaves cabin unbuilt; weekend runs die 47-61% on Standard. Pacing, not difficulty.
3. Farm Qs: hybrid seed (keep / cheap hybrid + pricey heirloom / garden only), field with no seed (fallow / weedy 40% crop / seed trickle), Farm tab slot (8 tabs).
4. People: coping goods strength, skill classes/courses, medic visuals (sickbay bed).
5. Watch: welcome-everybody prepper 10% -> 27% dead (small N; rerun at 36).
Known small leftovers: apiary Stock button greyed w/o reason, cellar loss rounding, root-cellar jar scale, permit wait shown twice, difficulty note wording.

## Overnight merges (flag list)
- SAVE BUMP: v70 (#135 bug-out + house hardening: six new goods at zero, migration test).
- BALANCE: #137 watchtower/sandbag posts take 0.3 s (towers no longer make raids easier; 0/1/2/3 towers = 218/159/141/139 breached of 300). #138 sally ports no longer shorten the ring hold (sortie bonus stays). #133 raiders walk the terrain lane at the pace of the going + guard dogs.
- UI: #139 gate card shows tunnel-door hold time. #135 Fleet bug-out card + Defense "Harden the house".
- BALANCE: #134 adds cold (frostbite without heat), sanitation (privy-to-well 30 m), heirs inherit skills, per-era raid pressure (+0.03/+0.08/+0.16 Cozy/Standard/Hardcore, caps 1.2/1.6/2.4). Pre-merge 36-run playtest: Standard unchanged, Hardcore still lethal; merged-result run was still going at merge time.
- #131 blueprint view (toggle, off by default, overlay ~0.1 ms). #141 house hardening now counts in battles (monotone). #143 scouting to confirm radio rumors.
- PENDING (not merged): #142 roads polish (save v71, failed perf budget, being trimmed), #136 stairs/pad rules, #140 plinth lodge (waiting on screenshots).
- BALANCE (long game): #144 spare parts get scarcer over five years once stores are shut (service interval shorter, more hardware per repair; card when service kits < 120 days). #136 stairs/ramps + pad-aware placement (S snaps ghost to a clear spot).
- Standard after-merge playtest of all defense PRs: unchanged/fair; Hardcore result pending.
- !! FLAG: after-merge Hardcore bot playtest: fortress 20/38 -> 15/38 survivors (more fight-death runs), the opposite of "stronger defense = harder raid". Standard fair, Hardcore overall still lethal (idle/homestead/prepper unchanged). Agent C is attributing it across seeds (main vs #132 reverted etc.) and will fix it with a campaign-level regression test.
- #145 soap from lard and ash, #147 shared harvest (pact households take 8% each, max 16%). One Hardcore run moved due to #134 cold rule (single seed, bisected).
- SAVE BUMP: v71 (#142 roads polish: site.entrance, site.listed; migration 70 -> 71). Big visual change: road ends blend into terrain, bank facing, drainage strips fixed (these target the user's gate glitches); new Land card "Where should the road come in?", plowing, wildlife crossings, razor on deck. Perf budget held (razor wire cut ~9x).
- #148 micro-hydro plant + 5 kW wind turbine merged (agent E's stack of 6; #149-153 still red/being rebased).
- !! Hardcore fortress now 10/36 on main b25898c (was 15/38 at e101225, 20/38 before defense PRs); single-offset 9-run tables are noisy (+-3). Agent C running NOCOLD/NOERA/NOPOST/NOCOVER/NOSEEP switches (attr2-*.md). If unresolved by morning: consider reverting #137/#141/#134 pieces individually; Standard stayed fair.
- #149 frost pockets/wind wired into crops, orchard, solar, wood; #150 polytunnels + aquaponics bay (crop/food balance; playtest after stack pending).
- #154 forge: tool repairs need no hardware (-25% toll), improvised steel tools tempered 0.9. Candles skipped (no light system yet).
- #140 lodge_plinth (flat-ground lodge on fieldstone piers, no basement, cheaper, low fallout protection).
- BALANCE: #157 tower parapet (refines #137): towers still post in 0.3 s (breach gain) but aimed rounds find the cab only 70% => defender deaths -33% at crew 10 (150->112), breaches down. The first Hardcore fortress 20->15 at offset 0 was mostly seed chaos (offsets 1000/2000 ~equal), but the per-raid extra deaths were real. A second fortress drop (15 -> 10) between d3d2c81 and b25898c is still being bisected.
- SAVE BUMP: v72 (#146 tunnel use: optional PerimeterRun.collapsed + Vehicle.stranded; 71->72 fills nothing). People/dogs/vehicles route through the rock bore, tunnel-bridge and slope tunnel (never teleport), doors open by day / lock at night, vehicles drive through tilted at half pace, a collapsed tunnel strands cars outside, sappers may collapse a portal after a tunnel raid (contractor clears it, $38/m3, 9 days). Browser walk check passed (424-448 m walks incl. 296-367 m inside the bore). Gaps: dog and tunnel-bridge door verified by unit tests only (no screenshot); raid playback does not walk the crew through the bore.
- Second Hardcore fortress step (15 -> 10 at offset 0) lands at #142 (roads polish); probably it changes which lot the bot plays (listing = game pinning, entrance choice), being verified on 2 more seeds. If systematic, #142's entrance choice/lot changes need review.
- #151 docks, marina and boats on lake/river lots (jon boat, skiff, lake fishing, ice/freeze-day boat loss, raids across water/ice).

## Hardcore fortress regression: resolved (agent C, bis6)
- 15->10 at #142 is NOT systematic: offset 0 is one lot that #142 pins (listing=game); across offsets 0/1000/2000 totals are 42 (before) vs 39 (after) of ~114, within noise.
- Real cost was #137 faster tower posting (~20% more defender deaths per raid), fixed by #157 (tower parapet). Fortress now 12-15/38 on Hardcore across offsets; not collapsed.
- Not done: 3D renderer for wildlife/livestock/trucks + guard dog inner post; moat, covered wooden bridge, vehicle yards.

## Playtest round 12 (main 542b23f, after area E landed)
- Standard: wipes 20->20/36, alive 52->56/149, hungry days 959->1034 (homestead rows). Fair.
- Hardcore: wipes 23->23/36, alive 43->41, idle/homestead still wipe 15 of 18. Lethal. Fortress 11 alive (noise).
- Area E (#148-#153) merged: no save bump after v72. Open: boatSeats not wired into bugout.ts, stilted-house floor pop, no lake ice visual, no eye shots of aquaponics/stilted house/tower pod.
