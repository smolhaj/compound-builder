# Dome and bunker interiors: ground-level review

Scripts: `scripts/domeInteriorShots.mjs` (dome floors, day and night pairs, same camera), `scripts/bunkerInteriorShots.mjs` (standalone bunker, hardening tiers, lights on and off, people), `scripts/domeBunkerInside.mjs` (a bunker under a dome). High quality, `?lowrender`, a person (0.28 tall) in frame where possible. The camera stands on the drawn path plan, so it is never inside a building. `before/` holds two frames from before the fix.

## Verdicts, dome complex (glass dome, 24 cells)
| Frame | Verdict |
|---|---|
| 00 aerial inside, day and night | Good context. Houses, barn, orchard, plant visible. Night is moonlit blue with lit windows and path lamps; dark but not black. |
| 01 lawn and homes | Pass after the fix: person on the porch next to the cistern, door and person read at the right size. Before: a bare green plane with no props and no person. |
| 02 path between buildings | Best frame. Gravel path with curbs, benches, a lamp post, a sign and crates at the door. Night: lamp pools on the grass and the airlock arch visible. The path itself is dark at night (gravel albedo); bench lamps were added after this frame. |
| 03 house door | Camera on the porch. Day is good (open door, stair, lit interior). Night porch is very dark; houses now get a larger window-light pool (not yet re-shot). |
| 05 person airlock, inner door | Good: person in front of the open airlock door, gravel apron, crates, sign, bench. Night is readable by lamp light only. |
| 06 glass ceiling | Good: gridshell, roof hatches, no clipping. Night shows stars through the glass. |
| 07 hatch on the dome floor | Hatch collar with a person beside it. Empty dome now has paths, benches, lamps and a sign. Night is dark in the middle (ring lamps added after). |

## Verdicts, bunkers
| Frame | Verdict |
|---|---|
| Bunkroom, tier 0, lights on | Furnished (bunks, locker, rug, table, books, a person at the table). Seated person was blown out white by the lamp; lamp is now higher and 15 percent dimmer. |
| Bunkroom, lights off | Dim red emergency glow (new). Before, the lamps ignored a blackout. |
| Galley, supply room, filter room | Good: shelves, pallets, tanks, panels, a door into the next room. |
| Tunnel (escape tunnel) | Was pitch black (dark boards, small lamp). Now lit, with bunks and stores down the sides. |
| Tier 3 (lead-lined walls, I-beams, posts) | Reads as hardened; sleepers and a sheltering person visible. |
| Under a dome: bunkroom, galley, plant, control | Good. Control room screens are black because the shot has no camera feeds powered; that is data, not a bug. |

## What was wrong and what changed
- Dome floors were bare grass between the buildings: new floor dressing (`src/game/fx/domeInteriorPlan.ts` pure, `DomeInterior.ts` draws it): gravel paths with curbs from every airlock, a ring path, benches, supply crates and a sign at each door, planters and lamp posts at a plaza, bench lamps with pools of light, a pool of window light round each lived-in house. Props keep clear of buildings, plant machinery and airlock lanes (unit tests). Geodesic domes get it too.
- Bunker tunnel was black: its lamp is now 2.4 times stronger (it is lined in dark boards).
- Bunker room lamp: higher (0.32) and dimmer (0.34 instead of 0.4) so the table and the seated person do not blow out; lights go dim red in a blackout (rendering only, reads `sim/blackout`).
- QA only: a stale light pick left far rooms black in shots; the scripts now put the camera at the pose and clear the kept-light set before the pick. In play the pick runs five times a second.

## More frames
| Frame | Verdict |
|---|---|
| Arcology 00, 02, 04, 05, 06 (day and night) | Good. Path, lamps, bench, sign and crates read at person scale; the airlock tower and its door are clear; 04 is the plant span (garage-style unit doors) seen from the aisle with a person; the glazed ceiling frame (06) is clean. Night 00 shows the armored band's light line and lamp points inside. |
| Bunker tier 1 bunkroom, tier 2 filter room | Tier 2 shows the hung blast door in the doorway; tier 1 reads like tier 0 (as designed: the first fallout step is invisible). |
| Bunker tier 3 | Lead-lined walls, I-beams, posts: clearly harder than tier 0. People sleeping and sheltering visible. |
| Escape tunnel end (tier 3) | Good: arched boards, stores, a bench, extinguisher, a green door at the end. |

## Review round (second pass)
- **Tier 3 galley, tier 0 control room, stairwell** were black in the harness. The cause was the light pick: it ranks by lamp strength, so the small, dim rooms lost to a bright neighbor. The room you stand in now keeps its lamp (weight 4 within 0.8 units). Verified with the render lock: tier 3 galley, tier 0 control room (operator at the desk) and the stairwell looking up to the hatch are lit. The stairwell foreground treads are dark (unlit side faces); the landing close-up (blast door) is too dim to publish and was dropped.
- **Seated person in the tier 0 bunkroom:** lamp moved up (0.37) and dimmed (0.28); skin and clothing colors now read (cream shirt, blue-gray trousers).
- **Glass ceiling at night (06):** reframed on a lit log house with the gridshell and stars; the gridshell is faint at night but present.
- **Dome dressing changes after main moved:** vehicle port gets a paved lane (0.55 wide, tested) and nothing is set in its way; only person airlocks get footpaths.
- **Not delivered (blocked):** the dome night frames for house porch, the arcology plant yard pools and the glass plant-yard span. The code for house and plant-unit light pools is in (pools lie on the lawn and in front of the units), but every dome frame shot on main after the no-snow merge (#396) renders neon green with glowing, flat-orange buildings, so those frames cannot be judged. Another agent is fixing that; re-shoot with `scripts/domeInteriorShots.mjs` once it lands. The published dome frames are from before that merge and before the one-entrance layout. The glass plant-yard span still has no usable frame (camera ends inside a machinery building).
- **Honest note on the pools:** a deck-height pool washed the porch white and was removed; the first version of the plant pools hugged the machinery and was nearly invisible. Neither was re-checked on a healthy render.
- Geodesic dressing was dropped (perf scene has no draw-call room); earthen dome has no standing view; link-walkway end not shot.

## Perf (`node scripts/perfBudget.mjs`, Medium and High, no budget raised)
| Scene | Before (calls, tris, heap) | After |
|---|---|---|
| mountain medium / high | 396, 753k / 1042k, 99 / 115 MB | 396, 753k / 1042k, 99 / 115 MB |
| dome_glass medium / high | 411, 766k / 1055k, 101 / 118 MB | 411, 769k / 1058k, 102 / 119 MB |
| dome_arcology medium / high | 412, 772k / 1063k, 102 / 119 MB | 412, 783k / 1074k, 103 / 120 MB |
| dome_geodesic | not measured before | 411 (merged main), 757k / 1045k |
A first version of the dressing added its own meshes (+3 draw calls on dome_glass, +4 on the arcology) and broke the budget; it now merges into the plant's machinery mesh and its lamp and pool instances, so draw calls are unchanged. Shadow triangles and casters are unchanged.

Latest run on main plus this branch: dome_glass 409 calls (766k / 1052k tris, 101 / 118 MB), dome_arcology 411 (778k / 1073k, 103 / 120 MB), mountain 396; all under budget, no budget changed.


## Round 3: dome re-shoot on current main (night fix #403, camera grade #405, vehicle port #401)
All 36 dome frames were re-shot (stale pre-merge `dome-*` frames removed). Glass and arcology, day and night pairs; the 08 to 10 frames show the new one-entrance layout from inside.

| Frame | Verdict |
|---|---|
| 00 aerial inside (glass, arcology) | Good. Night no longer glows green; lamps, lit windows, plant block readable. |
| 01 lawn and homes, glass night | Good: greenhouse, house, bench lamp pool. Lawn is a little green-black. |
| 02 path between buildings | Good. Day clear; night has two lamp posts at the door and warm pools. |
| 03 house door, glass | Fixed. Shot from the lawn: lit gable and windows, a lamp post, a bench; before, the porch was a black deck. |
| 04 plant yard, glass | Usable now: the camera stands in an aisle (the shot script keeps that sector clear of houses), plant buildings and lamp posts with pools at night. |
| 04 plant yard, arcology night | Better: lamp posts and a lit apron in front of the garage-style units. The middle of the floor is still dark lawn. |
| 05 person airlock, 06 ceiling | Good; arcology 05 night shows the lit door lamp, bench and crates. |
| 08 vehicle lane, 09 entrance complex, 10 vehicle port door (glass, arcology) | New. The truck lane is paved and marked; the person airlock sits beside the vehicle port; lamps flank both doors. Glass night shows lit door lamps. Arcology night lane frames are dark: asphalt albedo is low and the lane has no lamp of its own. |

Changes: lamp posts beside every lived-in house and flanking each person airlock; plant-unit lamp posts with larger pools; shot script keeps the plant sector free, adds the lane and entrance shots.
Not done: the arcology 08 and 10 night frames are still dark (lane lamps would fix them). Interior pools are still soft, not rim-bright.


## Round 4 (final): on main with #408 (airtight airlock look)
All 36 dome frames re-shot again (glass 00 to 06 and 08 to 10, arcology 00 to 10 without 01 and 03). New this round: lamp posts down both sides of the vehicle lane (tested), and on the arcology, soft lit pools and lamp posts down the plant aisle so the floor in front of the units is lit, clean and even.

Frames opened and judged: arcology 04 night (plant aisle lit, units and posts read), 02 night, 00 night (second entrance outside, lit band), 08 night (lane and both doors lamp-lit), 10 night (lit lane, both doors), 09 day (paved lane with markings, sealed doors with status lights); glass 04 night, 08 night, 09 day. The other frames of the set are from the same run and were opened in the previous round at the same poses.

Known defects
- Glass 08 night: a lamp post and a black wall fill the left edge; the lens is too close. Usable but not good.
- At night the door leaves of the sally port and airlocks are near black (only status lights and lamps show).
- The arcology lawn at night is a dark green; the paths are dark gravel and read only through lamp pools.
- No frames of a walkway link end or the earthen dome.

Perf (Medium / High, no budget touched)
| Scene | Calls | Triangles | Shadow tris | Heap |
|---|---|---|---|---|
| mountain | 396 / 396 | 753k / 1042k | 234k / 283k | 99 / 115 MB |
| dome_glass | 416 / 416 | 772k / 1058k | 243k / 292k | 103 / 119 MB |
| dome_arcology | 419 / 418 | 792k / 1086k | 247k / 299k | 104 / 121 MB |

dome_glass and dome_arcology are OVER the committed caps (411 / 412 calls, 240k shadow triangles, arcology high heap 121 vs 120 MB). This is not from this branch: a clean checkout of origin/main (58eca25, #408) measures the same 416 calls and 243k / 292k shadow triangles on dome_glass and 419 calls on arcology medium. This branch adds only about 1.3k to 2.3k triangles and no draw calls. The cause is #408's new sally-port and airlock geometry; someone needs to either trim that or the caps need a decision (the rule is never to raise them silently).
