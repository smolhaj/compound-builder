# Compound Builder

Build the family compound you'd want when everything falls apart. Then find out if you were right.

A browser-based builder and survival management game. In peacetime you design and build a homestead: layout, materials, defense and beauty. Then a disaster you didn't choose tests every decision. Your homestead can stay a single family or grow into a hamlet and beyond, depending on who you take in.

- Design spec (the contract): [`COMPOUND_BUILDER_GDS.md`](COMPOUND_BUILDER_GDS.md)
- Stack: Vite, TypeScript (strict), React, Zustand, Three.js and Vitest. The simulation is a pure, seeded step function over one plain `GameState` (`src/sim/engine.ts`); saves go to IndexedDB with JSON export and import. Everything is procedural; there are no external art assets.
- Play the latest `main` on GitHub Pages (`.github/workflows/pages.yml`).

## Running it

```sh
npm install
npm run dev          # http://localhost:5173 (a new parcel each run; ?seed=7 pins it)
npm test             # Vitest (30 s default test timeout)
npm run lint         # ESLint
npm run build        # tsc -b && vite build
npm run perf:budget  # draw-call / triangle / heap budget per quality tier (needs a build and Playwright)
npm run shots -- terrain   # Playwright screenshots into shots/<set>/ (sets in scripts/shotSets.mjs)
```

CI (`.github/workflows/ci.yml`) runs two jobs on every PR and on `main`: `check` (`npm ci`, `npm run lint`, `npm test`, `npm run build`) and `perf-budget` (build, Playwright 1.63 with Chromium, `npm run perf:budget`). The Pages workflow builds and deploys `main`.

**URL parameters** (QA and development): `seed=N` (new game on that seed), `new`, `clean` (no HUD), `region=<id>`, `lot=<kind>&relief=N&acres=N&lotseed=N&elev=N`, `showcase=mountain` (the north-star compound assembled with the real build actions), `lowrender` and `looktier=low|medium|high` (draw only on request; used by the screenshot and budget scripts).

**Controls:** drag to orbit, right-drag or Shift-drag to pan, wheel to zoom, arrow keys pan. *Timber cabin* and the other Build-menu items arm the build tool: click to place, **R** rotates, **S** snaps to a pad, **Esc** cancels. **V** cycles Walls / Cutaway / X-ray, **U** toggles the underground view, **H** hides the side panels. Camera buttons (bottom right): Diorama (orbit), Walk (WASD + mouse, Shift to run), Fly (WASD + Space / C, wheel = speed) and Tour (cinematic); **Esc** returns to Diorama. Bottom left: **View** (season, weather, graphics quality, frame cap, FPS readout, sightline and terrain overlays, Blueprint, property line, photo mode) and the clock, speed and date.

## What is in the game

- **Setup:** modes (Surprise, Scenario, Sandbox, God Mode), 11 regions, three difficulties (Cozy, Standard, Hardcore), lifestyles (weekender, full-time, independent), a family with jobs and skills, and a lot listing with terrain, price and access.
- **Build:** a modular kit with staged construction by hired crews or your family, furnished interiors, cutaway and X-ray views, bunkers under the ground, perimeter walls and gates, towers, moats, tunnels, utilities that wire themselves, farm, kitchen and livestock buildings, vehicles and a yard.
- **Disasters:** 16 kinds on one collapse clock, with warning signs, a hidden fate, regional effects, and endings (recovered, new normal, equilibrium, wipe) on a report card.
- **Defense:** raids by ring, a siege-wave clock, gate cards with honest odds, a battle simulation, and a raid cutscene you watch (director-cut cameras, voices, aftermath scenes).
- **Long game:** generations, eras, households and quarters, joiners, house rules by vote at the hamlet stage, a chronicle and a Generations view.
- **Overlays and views:** Blueprint, sightlines (road, ridge, night, viewshed), terrain (high ground, lanes, water, fire, shade, sun), weak spots, Diorama look (tilt-shift, High only), photo capture.

## Status

Save version is 95 (`SAVE_VERSION` in `src/sim/state.ts`; migrations in `src/sim/save/migrations.ts`). What landed and why: [`docs/DECISIONS.md`](docs/DECISIONS.md). Open gaps: [`docs/GDS_AUDIT.md`](docs/GDS_AUDIT.md) (status block at the top), [`docs/DEPTH_AUDIT.md`](docs/DEPTH_AUDIT.md), [`docs/ROADMAP.md`](docs/ROADMAP.md). Branch inventory (a dated snapshot): [`docs/BRANCHES.md`](docs/BRANCHES.md).

**Workflow:** feature branch, draft PR, squash-merge when `check` and `perf-budget` pass (merge `main` first; never raise the perf budgets). U.S. spelling and U.S. units, procedural art only, real scale. See [`CLAUDE.md`](CLAUDE.md).

Rendering is ported from University Empire's world renderer; see [`docs/PORTING.md`](docs/PORTING.md).
