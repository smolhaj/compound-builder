# Compound Builder

Build the family compound you'd want when everything falls apart. Then find out if you were right.

A browser-based builder and survival management game. In peacetime you design and build a homestead: layout, materials, defense and beauty. Then a disaster you didn't choose tests every decision. Your homestead can stay a single family or grow into a town, depending on who you take in.

- Design spec: [`COMPOUND_BUILDER_GDS.md`](COMPOUND_BUILDER_GDS.md)
- Stack: Vite, TypeScript (strict), React, Zustand, a custom ECS, Three.js and Vitest. Everything is procedural; there are no external art assets.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173  (?seed=7 pins the parcel; otherwise a new one each run)
npm test           # Vitest
npm run lint && npm run build
npm run shots -- terrain   # Playwright screenshots into shots/<set>/ (sets in scripts/shotSets.mjs)
```

**Controls:** drag to orbit, right-drag / shift-drag to pan, wheel to zoom. *Timber cabin* (top left) starts the
build tool: click to place, **R** rotates, **Esc** cancels. Camera buttons (bottom right): Diorama, Walk (WASD +
mouse, Shift to run), Fly (WASD + Space / C, wheel = speed), Tour. Bottom left: clock, speed, date, season, weather,
quality.

## Status

Playable end to end: build in peacetime, a chosen disaster, raids and defense by rings, a multi-generation long game with a Generations view, households and assigned quarters, joiners who bring their own things, auto-wired utilities, and a decluttered HUD (Get operational checklist, folded advanced groups). Save version is 78 (`SAVE_VERSION` in `src/sim/state.ts`). What landed and why: [`docs/DECISIONS.md`](docs/DECISIONS.md); open gaps: [`docs/DEPTH_AUDIT.md`](docs/DEPTH_AUDIT.md), [`docs/ROADMAP.md`](docs/ROADMAP.md); branch inventory: [`docs/BRANCHES.md`](docs/BRANCHES.md).

**Workflow:** feature branch, draft PR, squash-merge when `check` and `perf-budget` pass (merge main first; never raise the perf budgets). US spelling, procedural art only, real scale. See `CLAUDE.md`.

Rendering is ported from University Empire's world renderer — see [`docs/PORTING.md`](docs/PORTING.md).
Design decisions made along the way are in [`docs/DECISIONS.md`](docs/DECISIONS.md).
