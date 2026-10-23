# Design decisions log

Decisions made with the user where the GDS was silent or open. Newest last.

| Date | Question | Decision |
|---|---|---|
| 2026-10-23 | Parcel generation (GDS §9 Q1) | **Seeded per run.** Procedural Mountain West parcel from a seed; QA uses a fixed seed. A parcel picker may come later. |
| 2026-10-23 | M1 parcel size | **40 acres** (~400 m square ≈ 67 world units ≈ 34 UE tiles). |
| 2026-10-23 | Build grid | **3 m sub-grid** (½ world unit, ¼ UE tile) for structures; terrain stays on UE's 12 m tiles. |
| 2026-10-23 | Merging | Claude merges each increment's PR itself once CI is green. |
| 2026-10-23 | M1 cabin placement | **Instant.** Real construction stages (scaffold → frame → clad, built by people over time) come with M2. |
| 2026-10-23 | Milestone 2 focus | **Construction + family:** a family of 4 (UE crowd kit) builds structures over time through scaffold → frame → clad. |
| 2026-10-23 | Time pace | **Speed tiers:** pause, 1× = 1 day / 60 s (watch the work), fast-forward up to 1 day / 1.5 s. A cabin ≈ 3 in-game weeks. |
| 2026-10-23 | Construction cost (M2) | **Money + materials.** Starting savings; materials bought and delivered, or produced. |
| 2026-10-23 | Starting family | **2 adults + 2 kids**, different adult skill mixes; kids help a little. |
| 2026-10-23 | Deliveries | **Truck on a gravel county road** along a parcel edge with a driveway gate; orders arrive after a lead time and unload to a visible stockpile. |
| 2026-10-23 | Self-supply (M2) | **Fell own timber:** mark trees, fell, buck into logs, haul to the stockpile. |
| 2026-10-23 | Saves | **IndexedDB autosave now** (version 1 + migrations, autosave each in-game day, JSON export / import). |
| 2026-10-23 | What logs are for | **Log cabin blueprint + firewood.** Conifers give saw logs (2–4), aspen 1, cottonwood firewood only; tops and limbs give firewood. No sawmill / selling for now. |
| 2026-10-23 | How felling plays | **Mark trees, the family works them** as a scheduled task: fell → buck → skid to the yard (haul time grows with distance). With building and felling both waiting, every other person goes to the woods. |
| 2026-10-23 | Firewood (provisional) | The stove burns firewood on cold days (≈ 0.12 rick/day in January, none in summer, ≈ 4–5 cords a winter). Running out is logged; comfort / health effects wait for the needs system. Start with 2 ricks. |
| 2026-10-23 | Next builds (user picked all) | Order: **more buildings** (workshop / garage, root cellar, chicken coop + run, garden beds, log house, **outhouse**) → **perimeter + sightlines** → **water + power** → **underground bunker**. Every building has a furnished interior. |
| 2026-10-23 | Plumbing and electricity | **Allowed on higher-tech, self-sustaining compounds, but only through real infrastructure that costs something.** Running water needs a source (well / spring / cistern), pressure (gravity tank or pump), pipe runs, fixtures and waste handling (outhouse → composting toilet → septic tank + leach field). Electricity needs generation (solar / micro-hydro / wind / generator + fuel), batteries, an inverter and wiring. Each costs materials, labour, know-how (someone with plumbing / electrical skill, or slower and riskier without) and upkeep (pump wear, battery ageing, frozen pipes in winter, fuel). Interiors show the tier: oil lamps, hand pump and outhouse at first; faucets, a water heater, a flush toilet and electric lights once a building is connected. |
| 2026-10-23 | What the perimeter protects against | **Both:** (1) **events that test you**: wildlife (bears, coyotes after the hens), trespassers and thieves, and later raids during a crisis, picking targets by what they can see and reach; fences, hedges, lights and dogs deter or delay them, and you see the outcome; (2) **real-time raids**: attackers visibly approach and you respond (defenders to positions, lights, gates). Build order: perimeter pieces + sightlines → threat events → real-time raids. |
| 2026-10-23 | Sightlines | **Both views:** an exposure heatmap (visible from the county road, from the ridge, at night from your lights) with a per-building "seen from road %", and a click-a-point viewshed for towers, gates and posts. Terrain, trees, hedges, berms and walls block sight. |
| 2026-10-23 | Lived-in spaces | Every building is dressed with seeded clutter (dishes, books, toys, boots, pets, pictures, woodpiles, laundry lines …) so no two homes look alike. |
| 2026-10-23 | Scale | **Everything, now and later, is to human scale** (user). 1 unit ≈ 6 m, a person 0.28 ≈ 1.7 m; furniture and props are authored in metres × M. `src/game/scale.test.ts` guards doors, storeys, furniture, clutter, animals and perimeter heights: add a line there for every new piece, and check new work with a street-level shot that includes a person. |
