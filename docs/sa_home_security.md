# South African home security, as a design reference

Why: South African homes and estates are the best-known real example of a household building defenses in a high-crime place where the state's response is slow, patchy or sold as a subscription. The game's collapse is the same problem with the subscription gone. This note records the principles (from vendor, press and government guidance; see Sources) and what each means for the sim. **No measured armed-response times were found, so no number here is a fact: every balance number is marked tunable and lives in one table per module.**

## Principles

1. **Layers, outside in; no single layer is enough.** Perimeter detection, wall or palisade, electric fence, lights, cameras, then house bars and beams and gates, then a safe room. A wall is the first line, but only detection plus delay plus response works.
2. **Time is security.** Every measure buys minutes until someone responds. A measure that does not detect or delay is decoration. In a real collapse nobody responds, so the minutes must be bought by the family, guards and neighbors.
3. **Wall-top deterrents.** An electric fence on outriggers above a wall is a tripwire and a deterrent: it is wired to the alarm so a cut or a tamper raises a response. It needs power and a battery backup or it fails in load-shedding. It must be installed by a certified person (compliance certificate, SANS 10222-3), carry yellow warning signs, and gates in it must be shock-free to open. Razor and barbed wire cannot be electrified (never the same run). Razor coils are cheap, need no power, delay a climber, but municipal zoning may forbid them in peacetime.
4. **Weak spots defeat walls.** A tree, an outbuilding, stacked material or a ladder within reach of a wall lets a climber bypass it. Overgrown foliage blocks cameras and fences and hides the intruder. Fencing the cameras do not cover is fencing nobody sees.
5. **Detection is part of the wall.** Beams (best on the house, free-standing less so), CCTV with line crossing (deterrence plus evidence), an alarm with a panic button; all must be tested and maintained. Visible alarm and armed-response signs deter opportunists because they imply limited time on site. They do not deter an organized crew that has already measured the response.
6. **House level: bars, gates, safe room.** Burglar bars mounted outside the windows and well welded (cheap, badly fitted ones fail), a security (trellis) gate in front of every access door with sturdy locks and an intercom, a safe room behind a physical barrier with the keys, remotes and a phone kept inside.
7. **Gates and vehicles are the soft spot.** The gate motor can be lifted or defeated (anti-lift brackets, a cage), and it is dead without power. Hijacking and ambush happen at the drive when arriving or leaving. The classic answer is a gate house or guard, an intercom with a camera, and a double gate (sally port) so a vehicle is never exposed to the road while the outer gate stands open.
8. **Community as a layer.** Neighborhood watch and community policing forums, street patrols, chat-group alerts shared with security firms, plate cameras, street booms. Contested: privatized security can be exclusionary, a fortress look can cool relations with neighbors, and booms can make residents feel more exposed. Guards on estate roads give visible deterrence.
9. **Armed response is a subscription, not a law of nature.** Monthly fee, panic button, a response time that depends on distance and on the firm still operating. It only works while banks and law hold.

## What the game already had (checked before building)

| Principle | Existing code |
| --- | --- |
| Layered line | 30 perimeter kinds in `sim/perimeter.ts` (fence, wall, moat), `sim/rings.ts` ring fallback, watchtowers `sim/towers.ts`, wall-top deck `sim/walkway.ts` |
| Electric | `electric_steel` is a whole wall tier (needs `fenceLive`, else it is a steel wall), battle hazard `WALL_HAZARD` |
| Razor | `sim/razor.ts`: per-run coil, +0.06 of what the run stops, no power, no zoning |
| Detection | `sim/gear.ts` `gearPosture` (cameras, thermal, driveway alarm, floodlights, tripwire, dogs, ground sensors, nightwatch); `sim/lights.ts` |
| House | `sim/houseHardening.ts` (steel door, security door, bars, shutters, ballistic, safe room), `sim/hardening.ts` (bunker) |
| Gate | `sim/gateVetting.ts` per-ring vetting, `sim/roadGate.ts`, `sim/garage.ts` gate-house garage, `sim/motorCourt.ts`, gate house stock item (`sim/richSinks.ts`) |
| Upkeep, law | `sim/upkeep.ts` seasons and chores, `sim/paperwork.ts` county permits, inspectors and fines |
| Neighbors | `sim/neighborLife.ts`, `sim/pact.ts`, mutual aid, `sim/radio.ts` rumors |
| Monotonicity | `sim/monotone.test.ts`: every element must not make a raid easier |

## What is new, by PR

### PR A: wall tops and weak spots

- **Electric fence on outriggers** (`sim/wallTops.ts`): an add-on to a finished wall or fence, mutually exclusive with razor on the same run. Live while the on-site power runs or the grid is up; with the battery option it also rides out a mains outage for `BACKUP_DAYS`, then goes dark. While live: climbers are shocked, climbing takes longer, a cut or climb is an alarm (more warning). While dark it is only the wires on the wall (no shock, no alarm). Needs a certified installer in peacetime (fee, certificate); self-installed it risks the county inspector.
- **Razor coils** keep their price and effect, now delay climbers in the battle, and in a strict county in peacetime the inspector may order them down once (fine).
- **Warning signs** come with the electric fence (compliance), and an alarm sign can be put on a gate: opportunists (looters, break-ins) are deterred a little; organized crews are not.
- **Weak spots** (`weakSpots`): outbuildings and homes within a step of a wall, trees within reach (read from the world's trees), and brush that grows along the wall in the growing season. Each gives a climbing bypass: the run stops fewer people, capped at `MAX_PENALTY`. A Weak spots overlay marks them; trimming (brush and the marked trees) fixes them.
- **Overgrowth** degrades cameras (line of sight) and the electric fence (grass shorts the wires: a live fence in brush is weaker) until trimmed. Seasonal, so spring is the trimming season.

### PR B: gate and house

- **Sally port** (double gate) on the drive: a vehicle is never exposed to the road while the outer gate is open; cuts the arrival and returning-from-town ambush risk.
- **Intercom and gate camera**, **anti-lift caged gate motor** (a powered motor fails dark; manual override), **inner security gates** in front of doors as a house hardening tier, window bars as exterior-mounted with weld quality by tier.
- **Safe room keeps the keys and remotes**: a small effect only if cheap to model.

### PR C: neighborhood watch and armed response

- **Armed-response subscription**: monthly fee, panic button, response time (tunable), works only while banks and law hold (the permanent-collapse thresholds of the guards PR).
- **Neighborhood watch (CPF)**: shared alerts give early warning on raids heading to your area; small shifts cost, goodwill. The exclusion critique is modeled as: a fortress look cools neighbor goodwill while it deters opportunists.

## Sources

Home magazine "Layers of Security" (2021, via PressReader), ooba.co.za "how to secure your home", securitysa.com, Daily Maverick "8 security barriers" (2023), Trellidor, Western Cape Government "keeping safe at home", sans10400.co.za and stemar.co.za electric fence rules (SANS 10222-3), BusinessTech and PressReader on boom gates, Sunday Independent on community policing forums.
