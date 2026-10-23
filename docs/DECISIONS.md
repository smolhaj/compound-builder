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
