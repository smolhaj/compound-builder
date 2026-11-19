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

## Not done or not shot (honest list)
- **Plant yard span, glass dome (04):** three tries, still not a usable frame (camera ends up against a machinery wall). The arcology version works. Not delivered for glass.
- **Geodesic dome interior:** shot with the new dressing, but the dressing was then dropped for geodesic (its perf scene has no draw-call room), so those frames were removed. Earthen dome: no standing view (arched door 0.26 high; the 20 ft dome is not enterable on foot), not shot.
- **Dome with a walkway link end, and the link airlock door:** not shot (needs a linked second dome; not reached).
- **Bunker control room and stairwell (standalone):** frames were pitch black in the shot harness (the control room's lamp lost the light pick to a brighter neighbor). Added a rule that the bunker room you stand in keeps its lamp; the re-shoot (`dig/`) was still waiting for the shared render lock when this was written, so those two frames are **not verified**. The same rooms are lit in the under-a-dome run.
- **Glass porch at night (03):** still very dark; the window-light pool round houses is faint (the pool texture fades to nothing at its rim). Not fixed.
- **Hatch shaft close-ups** (standalone and under a dome): camera ended up inside the hatch collar; dropped.
- **Dome frames after the last code change:** the dressing now rides in the plant's own meshes (see Perf) and bench and ring lamps were added after the first glass frames, so frames 01 to 07 are from the version just before; the look is the same except the extra lamps.

## Perf (`node scripts/perfBudget.mjs`, Medium and High, no budget raised)
| Scene | Before (calls, tris, heap) | After |
|---|---|---|
| mountain medium / high | 396, 753k / 1042k, 99 / 115 MB | 396, 753k / 1042k, 99 / 115 MB |
| dome_glass medium / high | 411, 766k / 1055k, 101 / 118 MB | 411, 769k / 1058k, 102 / 119 MB |
| dome_arcology medium / high | 412, 772k / 1063k, 102 / 119 MB | 412, 783k / 1074k, 103 / 120 MB |
| dome_geodesic | not measured before | 408, 757k / 1046k (unchanged code path) |
A first version of the dressing added its own meshes (+3 draw calls on dome_glass, +4 on the arcology) and broke the budget; it now merges into the plant's machinery mesh and its lamp and pool instances, so draw calls are unchanged. Shadow triangles and casters are unchanged.
