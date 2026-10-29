# Roadmap & feature backlog

Living list of features beyond the current milestone. The GDS stays the source of truth;
items here get folded into it (with the user) before they are built.
Legend: **[user]** asked for by the user · **[gds]** already in the GDS · **[idea]** suggested, needs a yes.

## Perimeter & surroundings (GDS §2.4 defense / visibility)
- **[user]** Barbed-wire fences (cheap, see-through, slows but doesn't stop; snags on approach).
- **[user]** Thorn / bramble hedge lines (blackberry, hawthorn, Osage-orange "hedge apple" — the pre-barbed-wire
  living fence). Grows in over seasons; free once planted; hides and blocks; burns in a dry summer.
- **[user]** Shipping-container walls (fast, conspicuous, rust, stackable, need a crane/forklift).
- **[user]** Motion-sensor lights (detection at night ↔ visibility: they tell everyone where you are).
- **[user]** Dig moats / ditches (earthworks with the terrain tool; vehicle barrier; floods from the creek;
  spoil becomes a berm).
- **[user]** Sightlines matter: hidden in the woods vs. open field — trade-offs (concealment & fire risk vs.
  fields of view & farming). Raycast coverage / dead-ground overlay.
- **[idea]** Earth berms, gabion / Hesco walls, sandbag positions, vehicle barriers (boulders, jersey blocks,
  serpentine driveway), a gate house with a dog-leg entry.
- **[idea]** Early warning: driveway sensors, tripwire alarms, dogs, geese, gravel "crunch" paths, trail cams.
- **[idea]** Observation / listening posts, watchtower, guard rotations (GDS §3 jobs).
- **[idea]** Light, noise and smoke discipline: blackout curtains, generator mufflers, smokeless fires at night.
- **[idea]** Camouflage & deception: netting, natural screening, decoy structures, a run-down "nothing here" look.
- **[idea]** Defensible space for wildfire: firebreaks, cleared zones, a firefighting water tank + pump.

## Underground (GDS §2.2 underground layer)
- **[user]** Underground bunkers, fully buried, with a separate build view (floor toggle). **Built (v1):** hatch / stairwell entrances, tunnel, container, bunkroom, galley, storeroom, plant room, medical, comms & armory; underground view; open pits while digging; spoil → berms.
- **[user]** Bunker entrances inside a walled compound (hidden hatch in a shed / under a floor).
- **[gds]** Root cellar, cistern, tunnels between buildings.
- **[idea]** Escape tunnel to a hidden exit in the woods; storm cellar; fallout shelter with NBC air filtration,
  blast door, decon shower, radiation meter; spoil disposal is visible (OPSEC tell).

## Survival systems (GDS §2.5, expanded)
- **[idea]** Water: hand-pump well, spring box, gravity-fed cistern on high ground, rain catchment, sand / slow
  sand filters, purification — water quality as a disease vector.
- **[idea]** Food: seed vault (heirloom seeds), canning kitchen, smokehouse, root cellar, food forest / orchard,
  aquaponics, hunting & trapping, stock rotation (food expires).
- **[idea]** Power: solar + battery bank, micro-hydro on the creek, wood gasifier, fuel storage with stabiliser
  and rotation, a Faraday cage for spare electronics (EMP scenario).
- **[idea]** Heat: firewood in cords (felling feeds it), wood stove, passive solar, earth-sheltered walls.
- **[idea]** Sanitation: outhouse / composting toilets, graywater, laundry — hygiene drives disease and morale.
- **[idea]** Medical: infirmary, quarantine room (pandemic scenario), dental, med stockpile with expiry.
- **[idea]** Comms: ham / GMRS radio, antenna mast (useful *and* visible), field phones to neighbors, codes.
- **[idea]** Workshop: forge, sawmill, reloading bench, vehicle repair; tool wear.
- **[partly built]** Bug-out: the vehicle, the people and the supplies, and a one-way leave (sim/bugout.ts) are in; still ideas: off-site caches, a fallback retreat, rally points, a bug-out phase that continues the run.

## Community & people (GDS §3, §5)
- **[idea]** Barter goods (salt, coffee, alcohol, medicine, fuel) and a trade post; mutual-aid pacts with the
  neighbor farms; a school, chapel or meeting hall; library and music for morale; skills taught over time.

## Visual / tech
- Construction stages, weathering, damage states (GDS §8.1 step 2); overlays (step 3); photo mode.


## Inspiration
`docs/REFERENCE_LAYOUT.md` describes the user's inspiration image: one possible compound (container walls, towers, family houses, a services row). It is an example of the spirit, **not** a layout to copy. **Every building gets a furnished interior** (shared interior kit), with cutaway / x-ray views and walk-in first person.

## Buildings and improvements catalogue [idea] — what makes this game different
Grouped by what they do. Each has a furnished interior, construction stages, upkeep and a role in the sim.

**Living**
- Log house (two storeys, loft, wraparound porch), timber cabin, A-frame, earth-sheltered house dug into a south slope (warm in winter, hidden), straw-bale / cob cottage, yurt, wall tent platform, tiny house on a trailer, converted school bus, RV / camper pad, bunkhouse for newcomers, guest cabin.
- Interiors set real comfort: a cold, crowded or dark home lowers morale; a library nook, a piano, a porch swing raise it.

**Food**
- Raised-bed garden, market garden, orchard (years to fruit), food forest, berry hedges, three-sisters field, hay field, greenhouse, cold frames, hoop house, aquaponics shed, fish pond.
- Chicken coop + run, rabbit hutches, goat barn + milking parlour, pig pen, beehives + honey house, duck pond, turkey run, livestock guardian dog kennel.
- Root cellar, smokehouse, canning kitchen, summer kitchen, grain bin, seed vault, butcher shed, dairy, cheese cave, cider / brewing shed, still (fuel alcohol).

**Water**
- Hand-dug well with pump house, drilled well + solar pump, spring box, rain catchment off every roof into cisterns, slow-sand filter house, ram pump on the creek, water tower (gravity pressure + a lookout), ponds and swales (fire water, fish, irrigation), ice house.

**Power and fuel**
- Ground-mount and roof solar, battery shed, micro-hydro on the creek, small wind turbine, wood gasifier, generator shed, fuel depot (diesel / gasoline / propane, with stabiliser and rotation), biogas digester, woodshed and firewood rows (years of seasoning), charcoal kiln.

**Making and fixing**
- Workshop, blacksmith forge, sawmill and lumber kiln, machine shop, vehicle bay with pit, reloading bench, sewing / leather room, pottery kiln, soap and candle making, a print room or radio repair bench.

**Sanitation and utilities** (user: plumbing / electricity possible, but only with the infrastructure, and it must cost something)
- Outhouse (first, cheap), composting toilet, bathhouse, septic tank + leach field, graywater wetland.
- Water: hand pump → pressure tank / gravity water tower → plumbed fixtures (sink, shower, water heater, flush toilet); pipes buried below frost line or they freeze.
- Power: oil / candle → generator → solar + batteries + inverter → wired buildings (lights, freezer, well pump, radio). Upkeep: battery ageing, panel cleaning, pump repairs, fuel.

**Health and people**
- Infirmary / clinic with a quarantine room, dental chair, herb garden + drying room, bathhouse / sauna, laundry, composting toilets, school room, chapel or meeting hall, mess hall, children's play yard, cemetery (a quiet, real part of a long game), trading post at the gate.

**Security and defense** (the user's ideas first)
- Barbed-wire and razor-wire fences, thorn hedgerows (hawthorn, blackthorn, Osage orange: years to grow, nearly impassable), shipping-container walls, log palisade, earth berms, gabion walls, rammed-earth walls, HESCO-style barriers, a moat or dry ditch, a pond as a barrier, vehicle ditches and dragon's teeth, a chicane approach and a double gate (sally port), watchtowers, fighting positions, a safe room in each house.
- Motion-sensor lights, driveway alarms, tripwires with noise makers, trail cameras, dog runs, geese (loud alarms), listening posts, a radio relay mast.
- **Sightlines (the user's idea):** hidden in the woods vs out in the open is a real tradeoff. Trees hide you and block your view; open ground lets you see them coming and lets them see you. Overlays for visibility from the road, from the ridge, and at night (lights, smoke, noise). Camouflage nets, earth-covered roofs, light discipline, smokeless stoves, decoy buildings, and a "gray man" mode where the compound looks like an ordinary farm.

**Underground** (the user's idea)
- Root-cellar-grade shelters first, then a buried container bunker, a poured-concrete bunker with blast door and NBC filter, a bunker entered from inside the walls (hatch in a shed or under a house), an escape tunnel to a hidden exit in the woods, underground storage galleries, a bunker that can be extended room by room (dormitory, galley, armory, comms, generator room, water tank, medical bay). Digging moves real dirt: spoil becomes berms.

**Vehicles and mobility**
- Defense truck, farm tractor + implements, ATVs with trailers (log skidding), horses + a barn and tack room (fuel-free transport), bicycles, a boat on the reservoir, a bug-out trailer packed and ready.

## Layouts [idea]
The game should reward many shapes of compound, each with tradeoffs (the GDS cost / visibility / defense / labour lenses):
- **Hidden homestead:** under the timber, no wall, low profile, earth-sheltered house. Hard to find, hard to defend once found, short sightlines.
- **Fortified farm:** a classic walled farmstead in the open: long sightlines and fields, but visible for miles.
- **Hillside dug-in:** buildings cut into a slope, bunker galleries behind, terraces in front.
- **Family village:** several households round a green with shared mess hall, school and workshop; social life and labour pool are its strengths.
- **Island / moat compound:** on a creek bend or behind a dug moat; one bridge in.
- **Mostly underground:** almost nothing on the surface but a barn and a garden; the community lives below.
- **Mobile:** an RV / trailer camp that can pack up and move.
Layout choices feed the systems: walking distance between home, water, food and work (as UE's campus living does), how many people a wall needs to watch, and how far a fire can spread between buildings.

## What makes it different / fun [idea]
- **Time and seasons matter:** orchards take years, firewood must season a year, hedges take 3–5 years to become a barrier, winter shuts down building, and spring mud slows trucks.
- **Real people:** a family with skills, moods and relationships. Kids grow up and learn trades. Newcomers ask to join (vet them, house them, feed them). Grandparents bring knowledge.
- **Peacetime then crisis:** years of preparing with money (GDS), then a crisis that changes the rules: trucks stop coming, money stops mattering, and barter and labour take over.
- **The neighbors:** the farms around you can become allies, traders or threats. Mutual-aid pacts, a shared radio net, a market day.
- **Visible history:** buildings weather, paths wear in, stumps, fresh fill, and patched roofs show what happened.
- **Walk it:** first-person through a furnished home at night with the stove going and rain on the roof, then climb the watchtower and look out over the dark woods.
