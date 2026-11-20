# Dome movie: entry and failed raids

Floating-camera film of a glass dome complex (Mountain West, High quality, `?lowrender`, 960x540). Deterministic: every frame is a fixed pose and a fixed clock.
Made with `scripts/domeEntryMovie.mjs` (entry = Part A, raid = Part B through `scripts/domeRaidMovie.mjs`, join = ffmpeg). Run each under `flock /tmp/cb.lock`.
`dome-movie.mp4` (about 4.5 min, 24 fps H.264) joins the parts: entry day, entry night (36 s each, rendered at 5 fps, so it steps), then three raid cutscenes as time-lapse (each captured frame held 0.6 s).

## Part A: a person on foot and a truck, county road to the dome
The truck takes the vehicle sally port (outer gate, waits while the lock cycles, rolls in). The person walks the shoulder and goes in through the personnel airlock beside the port.
The camera is a smooth flight through rigs tied to the road, the person, the truck and the port frame (never under the ground, kept out of the shell skin and 1.1 units (22 ft) away from both actors).

| File | Verdict |
|---|---|
| a-day-01-road-establishing | Good. Whole road, dome at the end, person on the road. |
| a-day-02-road-person-walking | Good. Person on the shoulder, dome ahead. |
| a-day-03-truck-overtakes-person | Good. Truck and person on the road at the same time. |
| a-day-04-approach-dome-ahead | Good. Walking-level view with the dome and its entrance. |
| a-day-05-truck-waits-outer-gate | Good. Truck at the outer gate, apron below. |
| a-day-06-entrance-complex-person-on-road | Good. Entrance complex, apron, person far left on the road. |
| a-day-07-apron-person-at-lock | Good. Person on the apron at the airlock. |
| a-day-08-aerial-entrance-complex | Good. Aerial of the complex and lane. |
| a-day-09-aerial-high | Good, apron slab is ragged (see gaps). |
| a-day-10-inside-after-entry | Good. Inside the dome, person standing past the gate. |
| a-night-01-road-truck-person | Fair. Dark but readable; no headlights on the truck. |
| a-night-02-truck-at-gate | Good. Gate complex lit, truck waiting. |
| a-night-03-apron-lit-dome | Good. |
| a-night-04-aerial-lit-dome | Good. Lamps and lit lawn. |
| a-night-05-inside-after-entry | Good. Inside at night. |

## Part B: raiders try the dome and fail to get in
Staged by the dome raid beats (probes at the shell, family voices, frustration, aftermath). Day 30 encounter, crew of 10.

| File | Verdict |
|---|---|
| b-glass-day-01-scouts-probe-the-line | Fair. Two scouts, dome small on the horizon. |
| b-glass-day-02-family-inside-wake-everyone | Good. Family inside, first dialogue. |
| b-glass-day-03-sledge-at-the-shell-orders | Good. Orders bar is the game's own. |
| b-glass-day-04-inside-view-raiders-keep-firing | Good. |
| b-geodesic-night-01-family-behind-glass | Good. Night, family behind the struts. |
| b-geodesic-night-02-leader-count-vehicles | Good. Raiders in the field, dome and name tags. |
| b-arcology-day-01-scout-on-foot | Fair. One scout, red ring. |
| b-arcology-day-02-elena-at-the-shell | Good. Muzzle flashes outside. |
| b-arcology-day-03-swap-out-next-pair | Good. Raider line, family reaction. |
| b-arcology-day-04-leader-were-leaving | Good. Crew turning back. |
| b-arcology-day-05-quiet-then-someone-cries | Good. |
| b-arcology-day-06-aftermath-line-held | Good. The aftermath card covers the right 40 percent of the view (the game's own report). |

Dropped after opening: camera hard against the shell skin (entry day frame 90), a tent roof filling the view (glass raid frame 115), a tan wall filling half the view (arcology frames 66, 74), empty shots (geodesic frames 10, 30, 88; glass 36, 50, 66; arcology 44, 56).

## Gaps and findings
* The delivery truck's own `inLength` is only 32.6 units (the first 107 ft of a 195 unit road) in this scene: its drivable-prefix cut stops it far from the dome. The script lays the truck on the full road + drive + port tail by itself. The truck is hidden behind the entrance complex once it is in the lane, so no frame shows it inside.
* The concrete apron slab is ragged and stretched in the aerial shots.
* Glass dome raid at day 30: a family member (Wren) is shot through the glass and buried (shell stops 35 percent of rounds on glass). Not a clean repel; the arcology raid is.
* One generic raider line in the glass run uses a swear word ("Fuck you too"), from the general raid dialogue pool, not the dome pool. The arcology aftermath text says "There was no wall to stop them" although the dome stands.
* Not staged on film: a ram or satchel at the sally port, tunnelers at the skirt (no encounter for them). The night geodesic film covers only the first 75 s (the probe scene).
* 17 s per frame at High on software GL, so the entry films are 5 fps.
