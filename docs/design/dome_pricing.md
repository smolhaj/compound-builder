# Dome and bunker pricing audit (2025 U.S. dollars)

Owner request, 2026-11-19: "make sure everything is priced appropriately. This should be prohibitively expensive for most people except like billionaires."
Every number marked **PROPOSED** is a new rule awaiting the owner's sign-off. Code: `src/sim/dome/pricing.ts` (earthwork, span factor, running cost),
`src/sim/dome/costSummary.ts` (`domeCostSummary(tier, cells, extras)`, the one call the placing card, the Projects panel and other branches use), prices in `src/sim/materials.ts`.
Tests: `src/sim/dome/pricing.test.ts`.

## Headline

| Dome | Before | After | Real-world check |
|---|---|---|---|
| Earthen, 20 ft | $61k | $63k | Earthbag dome, DIY to contractor: $100 to $250 a sq ft of floor. Unchanged in kind. |
| Geodesic, 60 ft (default) | $1.2M | $1.9M | Custom polycarbonate geodesic greenhouse $150 to $500 a sq ft of floor; this one has two airlocks, a 20 ft skirt, a berm and a sealed plant, so $662 a sq ft. |
| Glass, 100 ft (smallest) | $4.4M | $13.6M | Eight figures. Large conservatory glazing and gridshell work $800 to $2,000 a sq ft of glass. |
| Glass, 150 ft (default) | $9.5M | $32.9M | $1,861 a sq ft of floor; Biosphere 2 was about $2,500 a sq ft in today's dollars. |
| Glass, 240 ft (largest) | $24.9M | $97.4M | The big one: just under nine figures. |
| Arcology, 240 ft (smallest) | $42.5M | $419.8M | Nine figures. |
| Arcology, 360 ft (default, about 2.3 acres of floor) | $98.9M | $1.11B | Ten figures; inside the $500M to $2B the owner expects for a 20-story-class shell. |
| Arcology, 600 ft (largest) | $304M | $3.89B | A national-scale megaproject. |

Tiers that moved most: arcology (11x), glass (3.4x), geodesic (1.5x), earthen (about 1x; it is dug by hand and sits on the family's own land).

## References used

(From memory and the owner's figures; no live lookup was made, so treat the third digit as soft.)

- Custom geodesic or glass greenhouse structures: $150 to $500 a sq ft of floor.
- Biosphere 2: about $150M in 1991 dollars for 3.14 acres (136,800 sq ft): about $345M today, about $2,500 a sq ft, and that was a research facility, not a house.
- Amazon Spheres, Eden Project, Gardens by the Bay conservatories: the owner's figure of about $4.0M to $4.5M per thousand sq ft of enclosed area for the spheres ($4,000 to $4,500 a sq ft). The arcology shell here is $5,000 a sq ft of shell surface, a 10 to 25 percent premium for ballistic and blast-rated panels (bullet-resistant glazing alone runs $200 to $500 a sq ft).
- Earthwork (RSMeans-style 2025 ranges): mass excavation $5 to $15 a cu yd, haul and dump $15 to $35, backfill in lifts $8 to $15, rock premium $30 to $80 a cu yd, soil-nail or soldier-pile shoring $50 to $100 a sq ft of face, dewatering $30,000 to $100,000 a month for a big pit, formed and placed deep wall $700 to $1,400 a cu yd.
- Plant: a 500-ton chiller $200,000 to $400,000 (about $2,000 to $3,500 a ton with towers, pumps and piping); a 5 to 20 MVA substation $2M to $8M; grid-scale battery about $400 a kWh (the 5 kWh pack at $1,900 is $380 a kWh, so unchanged); HEPA and carbon air handling $10 to $30 a cfm.
- Operating: commercial power $0.13 to $0.17 a kWh (the game's co-op price is $0.14, unchanged); facility maintenance 1 to 3 percent of installed value a year; commercial property insurance 0.4 to 1 percent; building engineers about $95,000 loaded.
- Permits: plan review and permit fees on a large project run about 1 percent of value, plus impact and environmental review on a mega-project.
- Bunkers: a basic family shelter $50,000 to $150,000; a high-end luxury bunker (Vivos, Atlas Survival) $500,000 to $3M; hardened facilities $10M and up; hardened below-grade concrete in place $900 to $1,800 a cu yd.

## Per-tier table (after)

Columns: before total, **after total**, after $ per sq ft of floor, then the after breakdown: shell, skirt plus earthwork (earthwork alone in brackets), airlocks, plant, yard, permit, finish, crew wages on site, and the yearly running cost (power at the design day x 0.55, upkeep 1.5 percent, insurance 0.6 percent, staff).

| Tier | Size | Floor sq ft | Before | After | $/sq ft | Shell | Skirt + earthwork | Airlocks | Plant | Yard | Permit | Finish | Crew wages | Running a year |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| earthen | 20 ft | 314 | $61k | **$63k** | $199 | $14k | $6k ($0k earthwork) | $0k | $0k | $0k | $0k | $0k | $42k | $0k |
| earthen | 40 ft | 1,257 | $204k | **$206k** | $164 | $49k | $12k ($0k earthwork) | $0k | $0k | $0k | $0k | $0k | $146k | $1k |
| geodesic | 30 ft | 707 | $496k | **$866k** | $1,225 | $150k | $194k ($148k earthwork) | $320k | $22k | $0k | $12k | $65k | $103k | $19k |
| geodesic | 60 ft | 2,827 | $1.2M | **$1.9M** | $662 | $450k | $402k ($310k earthwork) | $320k | $132k | $0k | $12k | $195k | $360k | $42k |
| geodesic | 110 ft | 9,503 | $3.6M | **$5.1M** | $540 | $1.5M | $808k ($639k earthwork) | $320k | $770k | $0k | $12k | $650k | $1.1M | $121k |
| glass | 100 ft | 7,854 | $4.4M | **$13.6M** | $1,737 | $8.4M | $1.9M ($1.6M earthwork) | $480k | $594k | $196k | $350k | $520k | $1.2M | $469k |
| glass | 150 ft | 17,671 | $9.5M | **$32.9M** | $1,861 | $23.4M | $2.9M ($2.4M earthwork) | $480k | $2.0M | $202k | $350k | $1.2M | $2.4M | $876k |
| glass | 240 ft | 45,239 | $24.9M | **$97.4M** | $2,153 | $74.8M | $5.1M ($4.3M earthwork) | $480k | $8.0M | $219k | $350k | $3.0M | $5.6M | $2.2M |
| arcology | 240 ft | 45,239 | $42.5M | **$419.8M** | $9,281 | $370.0M | $18.4M ($16.3M earthwork) | $960k | $8.0M | $207k | $15.0M | $3.0M | $4.3M | $9.6M |
| arcology | 360 ft | 101,788 | $98.9M | **$1.11B** | $10,886 | $1.02B | $29.4M ($26.3M earthwork) | $960k | $26.9M | $233k | $15.0M | $6.6M | $9.0M | $24.1M |
| arcology | 600 ft | 282,743 | $304.0M | **$3.89B** | $13,771 | $3.65B | $57.0M ($51.9M earthwork) | $960k | $124.4M | $241k | $15.0M | $18.4M | $22.6M | $82.7M |

(The crew wages column is the on-site labor at $60 an hour; the shell kit price includes the supplier's erectors. Crew wages and materials both count in the total, as before.)

Sample earthwork bill, 360 ft arcology: crater 384,907 cu yd; 75,415 cu yd of it weathered rock; 54,440 sq ft of shored wall; 43 dewatering wells for 12 months; 10,222 cu yd of skirt. Earthwork lines: **$26.3M** of the $29.4M skirt-and-earthwork line.

## What changed (all PROPOSED unless noted)

| Item | Before | After | Why |
|---|---|---|---|
| Glass kit, per 1,000 sq ft of shell | $128,000 | $650,000 | $650 a sq ft of glass: laminated insulated glass gridshell with steel, erected. |
| Arcology kit, per 1,000 sq ft of shell | $320,000 | $5,000,000 | $5,000 a sq ft: Spheres-class enclosure with ballistic and blast panels. |
| Span factor (new) | none | (diameter / usual) ^ 0.5, 0.75 to 1.4, glass and arcology | A wider clear span needs a heavier frame; the owner's "a big one is nine figures". |
| Crater and skirt earthwork (new) | not priced | itemized, see below | The pit is over 100,000 cu yd for the arcology. |
| Skirt rebar | 1 bundle per 6 cu yd (44 lb a yard) | 1 bundle per 2.2 cu yd (about 120 lb a yard) | Deep reinforced wall. |
| Dome air plant, per 10,000 cu ft | $16,000 | $22,000 | NBC-grade filtration and controls on top of chillers and air handlers. |
| Dome airlock | $85,000 | $160,000 | Pressure-rated two-door vestibule, interlock, armored doors. |
| Dome fit-out, per 1,000 sq ft of floor | $18,000 | $65,000 | $65 a sq ft for paths, drainage, beds, lighting (conservatory interiors run $50 to $200). |
| Permit fee: geodesic / glass / arcology | $2,800 / $24,000 / $180,000 | $12,000 / $350,000 / $15,000,000 | About 1 percent of value, as plan review and impact fees. Still a flat fee per tier (see "Needs an owner decision"). |
| Wealth gate: glass / arcology | $5M / $60M | $15M / $500M | The gate was below the price of the smallest dome. Now about 45 percent of the default dome. |
| Chiller spare (N+1) | $12 a sq ft of floor | $15,000 + $30 a sq ft | Arcology 360 ft: $3.1M (a few 500-ton chillers with towers). |
| Substation spare | $3.5 a sq ft | $60,000 + $55 a sq ft | Arcology 360 ft: $5.7M (5 to 20 MVA band $2M to $8M). |
| Closed ecology | $750,000 + $450 a sq ft | $2,000,000 + $1,500 a sq ft | Biosphere 2 class; its daily upkeep (0.012 percent a day) follows the price. |
| Blast door | $14,000 | $22,000 | Pressure-rated steel door and frame, 2025. |
| Fallout and gas filter | $9,500 | $16,000 | Hand-crank NBC unit with blast valves. |
| Egress hatch / passage hatch | $4,500 / $3,800 | $6,500 / $7,500 | Blast-rated hatch and collar. |
| Hardened concrete works (new good, `bunker_works`) | not priced | $1,200 per cu yd of structural concrete | Shoring, forms, pump, waterproofing detail, the engineer's stamp and inspections. Added to every bunker room and every hardening tier that pours concrete. |

Unchanged on purpose: concrete $190 a cu yd (ready-mix), the 5 kWh battery pack ($380 a kWh), the grid price ($0.14 a kWh), the plant's rush premium (1.5x), repair parts (they scale with the air plant price, so a chiller repair is now about 40 percent dearer).

### The earthwork rules (PROPOSED), `earthwork(tier, cells, { waterFt })`

| Line | Rate | Based on |
|---|---|---|
| Crater cut, haul, backfill | $2,500 per 100 cu yd (= $7 cut + 90% x $11 place and compact + 35% x $24 haul off) | The existing grading rates ($7, $11, $24), now shared with `grading.ts` through `EARTH_RATES`. |
| Rock | +$4,500 per 100 cu yd below 44 ft (the strata line in `dig.ts`) | Ripping and hammering weathered rock, $30 to $80 over common earth. |
| Shoring | $7,000 per 100 sq ft of pit wall below 20 ft | Soil nails and shotcrete. |
| Dewatering | $5,500 per well-month; a well every 40 ft of rim; 4 + head/4 months when the pit floor is below the water table | The water table is the cutaway's 28 ft (a picture, not a site rule). Glass at 30 ft gets a small system; the arcology at 60 ft a full ring of wells. |
| Skirt forms and placement | $650 per cu yd of skirt and stem | Formwork, pump, finishing, inspector. |

Earthen domes are hand-dug and have no earthwork lines. Geodesic (20 ft) is above both the rock and the water.

## Bunkers

Before, a poured bunker room cost about $74 a sq ft in materials, the same as a cottage ($73), because concrete is bought at ready-mix price with no shoring, forms or engineering. After, `bunker_works` adds $1,200 a cu yd.

| Piece | Before (materials) | After (materials) | Per sq ft after | Reference |
|---|---|---|---|---|
| Hatch and shaft | $24,070 | $53,670 | $537 | Shaft entry $25,000 to $60,000. |
| Buried 40 ft container (adds a blast door and a filter) | $18,830 | $83,230 | $208 | Basic family bunker $50,000 to $150,000. |
| Bunk room, galley, storeroom, medical (20 x 20 ft) | about $28,000 to $30,000 | about $90,000 to $92,000 | $225 to $230 | A house room is $70 to $100 a sq ft in this game's materials, and the crew's wages come on top for both. |
| Plant room | $40,360 | $109,260 | $273 | Filter, batteries, generator, tank. |
| A six-room family bunker (hatch, tunnel, bunks, galley, stores, plant) | about $160,000 | about $474,000 | | High-end luxury bunkers $500,000 to $3M; hardened facilities $10M and up (several rooms and hardening tiers). |

A test (`pricing.test.ts`) holds a bunker room above the dearest house per sq ft, with a crew at $60 an hour on both sides, and the container bunker inside $50,000 to $150,000.
Hardening upgrades pick up the same concrete works charge: a 100 psi blast shell (tier 3) is now about $96,000 in materials where it was $40,000, on top of the room.

## Do families start rich enough? (nest eggs)

Starting cash comes from `sim/startFunds.ts`, minus the land and closing costs:

| Start | Cash range |
|---|---|
| Weekend family | $400,000 to $750,000 |
| Full-time | $450,000 to $1,100,000 |
| Financially independent | $1,000,000 to $2,000,000, plus $22,000 to $70,000 a year of investment income |
| No funds roll (fallback) | $30,000 |

Cozy difficulty adds 15 percent to the start and cuts all prices 40 percent; Standard and Hardcore are 1.0. A household takes home about $100,000 a year (two adults at about $200 a day).

| Dome (default size) | Cost | Years of household income | Who can raise it |
|---|---|---|---|
| Earthen 20 ft | $63k | 0.6 | Anyone. |
| Geodesic 60 ft | $1.9M | 19 | Only the top of the independent start, spending everything; others save or earn into it. |
| Glass 100 ft (smallest) | $13.6M | 136 | No start. |
| Glass 150 ft | $32.9M | 329 | No start; needs the $15M gate in the bank. |
| Arcology 360 ft | $1.11B | 11,100 | No start; needs $500M in the bank. |

**There is no billionaire or rich-start option in the game today** (the setup screen has the three lifestyles above, and `FUNDS_RANGE.independent` tops out at $2M). Nothing was added. Today the glass and arcology tiers can only be reached by late-game wealth or god mode. Owner decision needed (below).

## Operating costs (see `runningCost`, PROPOSED yearly figures)

The sim already bills the dome's power day by day through the utilities (kWh x $0.14 plus the day's service charge, or fuel when off grid), so power is a real running cost. It does not model upkeep, insurance or staff; `runningCost` supplies them for the table and for a card. The design day in the table is the worse of a 20 F frost night and a 100 F sunny day, plus the always-on house load: glass 150 ft peaks at about 1,900 kWh a day in the sim (the owner's 3,500 kWh a day figure for a glass dome at peak is higher; the sim's number follows `domeLoad`, unchanged here).

## Needs an owner decision (not invented)

1. **A rich start.** Without one, a glass or arcology dome is out of reach in the first years by design. Recommendation: a "Founder" start (about $20M to $40M, no land debt) and a "Magnate" start (about $1B to $2B) on the New Game screen, clearly labeled sandbox-like and kept out of the scoring, since the owner wants "billionaires". Not built.
2. **Charge the upkeep.** Maintenance, insurance and staff are shown but not billed. Recommendation: bill them daily from `live.ts` after the dome-links and dome-bunker branches merge (that file is theirs to touch), and add a Projects line. Would change money flow, no saved fields.
3. **Permit fee by size.** The county fee is a flat figure per tier (`paperwork.ts`, keyed on the tier's base kind), so a 100 ft glass dome ($13.6M) and a 240 ft one ($97M) pay the same $350,000. Recommendation: scale by price at about 1 percent.
4. **Per-site dewatering.** Blueprints are static, so the water table is the cutaway's 28 ft. A site-aware price needs the regional groundwater depth passed to `earthwork(..., { waterFt })` at placement; the function already takes it.
5. **Panel repair.** `siege.ts` `panelJob` rounds up to a whole 1,000 sq ft kit unit, so one glass panel job is now $650,000 and one arcology job $5M (real panels: about $60,000 and $1M). Recommendation: sell panel kits by the 100 sq ft.

## Prices from the other branches that still need an audit after they merge

- `claude/dome-links` (tunnels and walkways between domes): any new tunnel, walkway or crossing goods. Compare with real hardened tunnel at $1,000 to $3,000 a linear foot for an 8 ft box, and walkways with glazed bridges at $1,500 to $4,000 a sq ft. The existing `culvert` ($3,600 per 20 ft) is still the old poured-arch price and is too cheap for hardened work.
- `claude/dome-bunker` (bunkers under domes, built in the dome's crater): its rooms should use `bunker_works` and the crater's earthwork should not be charged twice. Call `domeCostSummary(tier, cells, extras)` and put the bunker lines in `extras`; `grandUsd` is the total.
