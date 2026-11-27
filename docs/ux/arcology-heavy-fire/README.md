# Sealed Arcology against heavy weapons (stills)

A raid crew throws everything it has at the sealed Arcology dome; each frame is the impact moment and the dome stays whole. Effects are transient
flashes, streaks, smoke and sparks (`game/battle/HeavyFx.ts`); nothing is left on the shell. Frames rendered at High, 1280x720, with
`scripts/domeHeavyFireShots.mjs` (`DIALOGUE=1` for the caption cards). The hiding of trees, shrubs and ground cover in the shots is a QA convenience
only (the camera would otherwise sit in foliage).

| File | What it shows |
| --- | --- |
| 01-wide-tank-and-raiders-vs-dome | Tank and a six-man crew across the stream, muzzle blast, the round bursting on the glass |
| 02-rpg-impact-glass | RPG fireball and sparks on the glass, struts and glass intact |
| 03-tank-round-impact-glass | Tank round on the glass, the biggest single-shot fireball |
| 04-hmg-burst-wide | .50 cal burst: muzzle flash, tracer line, white flash and sparks on the shell |
| 05-anti-materiel-round-armored-base | Anti-materiel round on the dark armored base band, tracer and flash |
| 06-mortar-burst-armored-base | Mortar shell burst at the armored base ring |
| 07-breaching-charge-sally-port-gate | Charge on the sealed entrance module with the boom gate and bollards in frame |
| 08-truck-bomb-at-the-apron-wide | Truck bomb at the apron, crew on the drive |
| 09-inside-household-looking-through-glass-rpg | From inside: the unarmed household stands calm while an RPG bursts on the glass |
| 10-aerial-gate-charge | Aerial of the gate charge |
| 11-before-same-spot / 12-after-same-spot-zero-damage | The same camera and spot on the glass before the RPG and after the smoke has gone |
| 13-night-rpg | Night RPG impact |
| 14-drone-drop | Drone drop (the drone hovers at the lower left) |
| dialogue/01 to 08 | Caption cards in the cutscene's letterbox style, lines from `sim/raidLinesDome.ts` (`dome_heavy_*` pools) |

Honest defects: the fireballs are sprites, so a big one (truck bomb) hides the entrance for the instant it is drawn; the thermite frame is a weak
glow with little spray (not included here); the .50 cal tracer rods are fat in close-ups; the speaker of a caption is shown only as "Raider" or
"Their leader", as in the cutscene overlay (the caption does not say which figure on screen is talking).
