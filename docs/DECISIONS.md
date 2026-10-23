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
