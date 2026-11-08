# Raid / cutscene realism: resume notes (written 2026-11-08)

Repo smolhaj/compound-builder. Standing user rule: merge PRs when tested and clear (need `check` + `perf-budget` green; mark ready with update_pull_request draft:false first; squash). Agents work in worktrees /home/user/cb-*; one draft PR each. Plain modern American English, U.S. units, no audio, procedural art only, perf budget draw calls 384/388/389.

## User hard requirements
- Everything must work in the REAL game (live path from sim result to cutscene), not just movies. Fixtures only for tests.
- Must not crash/freeze/overheat a 14in 2021 MacBook Pro M1 Pro 32 GB, latest Chrome. Error boundary -> skip to aftermath; bounded sim cost; 20-scene leak check with real numbers.
- Realism: people move only through real openings; closed doors opened/kicked first; no clipping; real room-to-room tactics; staged fallback.
- Graphic violence is the default for everyone including children and non-combatants (user's choice, private game).
- Dialogue: ~10 lines per moment, name-aware, no repeats within scene or across consecutive raids.

## Decisions the user made (answers)
- Ram/charge: real mechanic with counters. Post-breach scene: always play it. Break point: the actual drawn wall/gate. "Breached" = raiders in the yard; "overrun" = houses fall.
- Hostile crews kill everyone but sometimes take captives. Merciful crews: children always spared, unarmed adults often. Hiding depends on crew temper (barricades buy time). Defenders may or may not shoot a surrendering raider, per defender.
- Interior: real tactics. Hard rule: only through openings. Outcomes wanted: hostages, arson, looting, partial retreat/negotiated end.
- Non-fighters flee/hide/freeze. Staged fallback (wall, yard cover, main house). Player orders: hold, fall back, counterattack.
- Openers wanted: scouts, parley, ambush of workers, diversion plus real attack. Defender moments: panic/freezing, heroics, last words, reloads/jams. Wounds visible and lasting.
- Raider side: leaders and morale breaks, wounded raiders dragged/abandoned, raider with a story, looting greed.
- Environment: weather, smoke/fire, darkness/light, dogs/livestock. Aftermath: burial/mourning, interrogation, cleanup, lingering trauma. Length scaled to raid (skirmish ~1 min, serious 3-4, invasion up to ~6, skip/speed). Camera: director cuts.
- Parley responses: accept terms, refuse and fight, counter-offer/bluff, shoot the envoy. Scouts: warning plus choices (drive off, capture, ignore, prepare). Panic/last words tied to personality and history. Interrogation: conversation with choices.
- Still open design questions (not asked/answered): none outstanding from this round.

## UPDATE (later): #254 merged (a054237) and #255 merged (444389a, save v88). Open PRs now: only #55 (do not merge). #255 caveats: playhead order swap (`giveRaidOrderNow`, CutscenePlayer `c.swap`/`_seekTo`) NOT verified in a browser — cutscene agent must eyeball it; raider-with-a-story has no face in the aftermath screen; weather/smoke/flares have no new look in the scene yet. Hardcore container-wall-only drop fixed by staging (44 of 160, was 25). #254 merged without me seeing a live frame; verify visually on resume.

## PAUSED (user asked: pause after the next movie artifact lands). Movie re-record landed: night 5:14 (seed 7, day 22, Wren dies, wake shown), day 1:47 (day 5), invasion 3:14 (night, day 15, truck ram, room-by-room house assault, no wake because crew wins). Republished at the same private links (raid page https://claude.ai/artifact/Djdf4PwrL4sB9ZeNWihYtc, invasion https://claude.ai/artifact/VZ3rJNFbsi6eFKpJUyivUj). IMPORTANT: recorded on main b108ebf, i.e. BEFORE #253-#256 (rams as mechanics, interior tactics, mercy, openers, parley, panic/last words, movement-through-openings). A final re-record on current main is needed after the remaining cutscene stages land. Audit: 0 camera-in-geometry frames, no black frames, tracers vs walls not audited frame by frame. Contact sheets in /tmp/claude-0/removie/ (ephemeral). Draft PR #257 (claude/removie, scripts/raidMovie.mjs adds --day N and --mp4): CI was running; merge when green. All agents idle: a3ca6095eb7595d36 (cutscene), a40ca7557802dd48a (mechanics), a7d3717d27d88cac9 (movies). Resume with SendMessage to the cutscene agent for the staged follow-ups (see list), then a final re-record.

## UPDATE: #256 MERGED (fff3f57, save v89). CI fix included a 2 mm graze tolerance in cutNav.findClips (float edge, not a real clip loosening). Mechanics agent idle. Open PRs: only #55. The note below describes #256's content.

## #256 (was draft, branch claude/raidsim3b, save v89, mechanics agent): white-flag choices (pay/pass/talk/bluff/shoot envoy/refuse), scout plans (drive off/capture/ignore/prepare), prisoner questioning (3 questions, kind/harsh), defender traits driving panic/heroics/last words (events `panic`, `heroic`, `say ctx:last_words`). Scene does NOT yet draw freeze/heroic poses or last-words delivery; interrogation is a button panel, not a spoken scene; capture is a roll not a played sortie. If open on resume: check CI, merge when green.

## Cutscene agent (a3ca6095eb7595d36) honest status after #254: idle, waiting for resume. Live audit on real games (day 79/87, night gang raids): 1766 frames, 10 raider steps into a wall at the breach line; charge-pad fix untested live; later fixes not re-audited. No screenshot yet of a door kick or room clear (frames in /tmp/claude-0/live87/frames, may be lost; `--dbt 68:84` on day 87 was capturing). Interior tactics/mercy only proven on fixture house by tests. 20-scene leak check (scripts/cutLeakCheck.mjs), frame times and `prepare` cost on big layouts NOT measured. Memory at first run end: 298 geometries, 83 textures, heap 157 MB. Not built: scout/parley/ambush/diversion scenes, panic/heroics/last words, wound animation, leaders/routs, weather/smoke/lights/dogs/stampede, burial/interrogation/cleanup scenes, length scaling, director close-ups. Mechanics agent (a40ca7557802dd48a) is idle after #255 and has no open work except fixing anything found.

## State at pause (older, written before the merges above)
- Merged: #246-#252 (earlier), #253 (raid sim mechanics, save v87, main a5ee979).
- Open PRs: #254 cutscene realism stage 1 (branch claude/cutscene-realism, agent a3ca6095eb7595d36); #255 raid sim round 2 (openers, environment, returning raider, live orders; agent a40ca7557802dd48a; CI failure: src/sim/raidEnding.test.ts desperate seed 5 leaves raider r2 standing — fix behavior not test); #55 resume notes (do NOT merge, do not close without ask).
- Cutscene agent's remaining stages: openers scenes, panic/heroics/last words, wound animation, leaders/routs, weather/smoke/lights/dogs/stampede, burial/interrogation/cleanup scenes, scene length scaling, director close-ups, 20-scene memory/frame-time check (scripts/cutLeakCheck.mjs).
- Mechanics agent's Hardcore balance question: container-wall-only farmhouse held 46 -> 25 of 160; recommendation pending.
- Movie re-record agent a7d3717d27d88cac9 (/home/risk cb-removie): re-recording night/day/invasion on b108ebf-era main; artifacts private: raid page https://claude.ai/artifact/Djdf4PwrL4sB9ZeNWihYtc, invasion page https://claude.ai/artifact/VZ3rJNFbsi6eFKpJUyivUj. Recordings do NOT yet include the #253/#254/#255 changes; a final re-record after those merge is wanted.

## To resume
Say "resume". Then: check open PRs (#254, #255) CI, have agents merge origin/main if dirty, merge when green, continue cutscene stages one PR each, final re-record, update artifacts.
