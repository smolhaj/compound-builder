# Compound Builder — Project Guide

> **`COMPOUND_BUILDER_GDS.md` is the source of truth for game design.** Read it before building any system. Ask before inventing mechanics it does not cover.

## Stack (same as University Empire; do not substitute)
Vite, TypeScript (strict), React, Zustand (with subscribeWithSelector), a custom ECS simulation, Three.js, IndexedDB saves with JSON export, and Vitest.

## The graphics bar
Compound Builder must look at least as good as **University Empire** (`smolhaj/UniversityEmpire`, `src/three/`). Do not rebuild rendering from scratch. Port UE's stack following GDS §8.1:
1. Extract the game-agnostic world rendering into `src/engine/world/`. This covers the light rig and sky, post-processing (SSAO, bloom, color grading, god rays), weather, seasons, instanced trees with wind, regional terrain and site grading, water, regional houses, barns and fences, procedural normal maps and materials, geometry merging and LOD, instanced people, night windows, the walk/fly camera, and the Playwright screenshot QA harness.
2. Strip the campus, era and university hooks behind thin adapters (terrain grid, region, season, weather, time of day).
3. Then build the Compound Builder layers on top: the modular build kit and its materials, weathering, construction stages, damage states, and the defense, visibility, sun, fire and flow overlays.

## Rules
1. **Procedural art only.** No external assets, HDRIs or downloaded models.
2. **Performance:** instanced and merged geometry, LOD tiers, and High/Medium/Low quality settings. Target 60 fps at homestead scale and 30+ fps at town scale.
3. **Scale:** match University Empire's SCALE v2 (1 world unit ≈ 6 m; a person ≈ 0.28 tall). Check with a street-level screenshot that includes a person.
4. **Keep systems modular and testable.** Put pure logic in plain TS modules with Vitest tests.
5. **Save versioning:** bump the save version and add a migration whenever state fields change.
6. **Eye-test visuals:** take screenshots at eye level and from above, with no camera inside geometry and no modals covering the view.
