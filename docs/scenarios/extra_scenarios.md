# Extra end-times scenarios: brainstorm and ranking

Owner request: six more scenarios not in the game or in `docs/DISASTER_TEETH.md` section 4, with the best three fully mapped. The three already proposed in the audit (mega-quake, blight, EMP, dam flood, heat dome, livestock plague, satellite loss, oil shock, exodus, reactor) are excluded; `mass_exodus` is mapped in its own file. Candidates considered and why some were merged or dropped are noted.

## Ranked list

| Rank | Id | One line | Why it ranks here | Teeth (columns of the matrix with a real hook) | File |
|---|---|---|---|---|---|
| 1 | `global_famine` | Multi-region harvest failure plus export bans; a year of rising price, rations, levies | Uses only existing food, price, neighbor and requisition systems, so cheap; the slow burn rewards planning; a new feel (calories and land politics) unlike any raid scenario; strong real analogs | Econ, Supply, Raiders, NPC, Med, UI, Oasis | `global_famine.md` |
| 2 | `water_war` | A river compact breaks; water rights, ditch riders, tanker mafias | Distinct from drought (property and force, not weather); reuses water table, land, thirst; region fit is dramatic (desert, plains, mountain west); strong "build for flow" gameplay | Econ, Supply, Raiders, NPC, Infra, Med, UI | `water_war.md` |
| 3 | `cult_takeover` | A persuasive movement captures the town council and tithes the valley | A nonviolent, social antagonist; reuses neighbors and requisition; gives a story-heavy replay; can attach as a modifier to any collapse | NPC, Raiders, Econ, UI, Med | `cult_takeover.md` |
| 4 | `automation_failure` | The "AI and just-in-time" failure: logistics, payments and healthcare software mis-fire for weeks | Close to cyberattack and satellite loss, so overlap; fun twist: sensors and smart devices lie (a bad update bricks locks, pumps, vehicles with software locks). Best built as a variant of cyberattack (WP2) rather than a new kind | Infra, UI | summarized below |
| 5 | `coastal_surge` | A tsunami or storm surge floods the coast and the lower valleys; salt in wells | Real (Cascadia 1700 tsunami; Tohoku 2011: about 18,000 dead; Katrina surge up to 28 ft), but only pnw, new_england, hill_country (a Gulf remnant) feel it, and it duplicates the dam flood and mega-quake; build as a variant of those | Bldg, Infra, Med | summarized below |
| 6 | `deep_freeze` | A new ice age start (a decade of cooling) or an AMOC shutdown | Overlaps `ash_winter` (growing season cut), little new except permanent cold; fold into ash_winter as a `cold_decade` variant | Sky, Supply | summarized below |

Dropped or merged: **geomagnetic reversal** (a real slow process with a weak, century-long effect; no felt hit in a game year; fold its tail (auroras, more flare exposure, navigation and bird migration trouble) into `solar_flare` as a variant), **ocean die-off** (plankton collapse, fisheries failing and oxygen drop: too slow for a compound game and its effect is mostly on coastal food prices; fold into `global_famine` as a `fish_collapse` input that cuts wildfood fish in coastal regions), **religious takeover** (mapped as `cult_takeover`), **resource wars** (mapped as `water_war`; oil is `oil shock`).

## Short sketches of the unmapped ones

### automation_failure ("the Update")
- Basis: CrowdStrike outage July 19, 2024 (about 8.5 million Windows machines, airlines, hospitals, 911 centers down; Delta cancelled about 7,000 flights over days); Knight Capital 2012 ($440 million lost in 45 minutes); the 2003 Northeast blackout (about 50 million people, software alarm bug); Colonial Pipeline May 2021 (5 days, panic buying); Boeing 737 MAX MCAS.
- Felt effects: smart locks, smart thermostats, connected tractors and vehicles with remote-kill or locked software fail at once; card readers and payroll stop; supply chains mis-route; hospital systems down. Off-grid and analog compounds shrug; the player who automated everything is hit hardest (a "tech fragility" report line from the research doc's lesson).
- Variants: `bad_update` (fix in 2 to 14 days), `ai_cascade` (autonomous trading and logistics agents mis-optimize: shelves are full in the wrong places; fate decides repair), `kill_switch` (a vendor shuts off devices; the player's smart equipment is bricked until a manual override).
- Tracks: phone C(0,1,0.2,[3,30]), banks C(0,1,0,[5,45]), deliveries C(0,2,0.2,[10,60]), grid C(2,5,0.7,[3,30]), stores C(3,10,0.5,[10,60]), law 0.9, medical C(1,5,0.5,[5,40]).
- Place in the plan: WP2 (cyberattack teeth) as a variant, with `device` flags on installed equipment.

### coastal_surge
- Basis: Cascadia M9 tsunami of Jan 26, 1700 (arrival in Japan recorded), Tohoku March 11, 2011 (about 18,000 dead; waves up to about 130 ft run-up), Indian Ocean 2004 (about 230,000 dead), Katrina surge (up to about 28 ft); Galveston 1900 (6,000 to 12,000 dead).
- Felt effects: warning of minutes to hours; flood line to a contour on the terrain; buildings below it swept (a `terrainFx.floodCandidates` use); wells salted for years (a `saltWell` flag), the coast road gone, the port closed; refugees uphill.
- Regions: pnw (very high), new_england (hurricane surge), hill_country (a Gulf remnant), others none. Build as a variant of `mega_quake` and `dam_flood` once WP6's `structureDamage.ts` exists.

### deep_freeze
- Basis: 1816 Year Without a Summer, Little Ice Age lows in the 1690s (the Maunder Minimum; the Great Frost 1709 killed about 600,000 in France), the Younger Dryas (about 12,900 years ago), AMOC slowdown studies.
- Felt effects: frost-free days cut 30 to 60%; heating fuel use doubled; a decade of failing yields; migration south. Fold into `ash_winter` (variant `cold_decade`, climate factor 0.5, no ash on panels).

## Order to build

`global_famine`, then `water_war`, then `cult_takeover` (as a modifier on lawless), then the variants (`automation_failure` under WP2, `coastal_surge` under WP6, `cold_decade` under ash_winter).
