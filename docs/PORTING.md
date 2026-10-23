# University Empire → Compound Builder: world-renderer port map

GDS §8.1, step 1. Ported modules live in `src/engine/world/` and know nothing about the
game: they take a site rectangle, a height / cover source, the time of day, the season and
the weather through small adapters. Compound Builder's own layers (parcel, build kit,
placement) live in `src/game/`.

| UE source (`smolhaj/UniversityEmpire/src/…`) | Compound Builder | Changes |
|---|---|---|
| `three/world/CampusScene.ts` | `engine/world/WorldScene.ts` | Campus parcel, grid, city ring, era sweep, off-campus overlays removed. Takes a `WorldSite` rect. Season grade without the era boost. |
| `three/world/skyState.ts` (+test) | `engine/world/sky/skyState.ts` | Verbatim. |
| `CampusScene._phaseWeights` | `engine/world/sky/dayPhase.ts` (+test) | Extracted pure function. |
| `three/postprocessing/ProceduralSky.ts`, `GodRayShader.ts`, `ColorGradingShader.ts` | `engine/world/sky/`, `engine/world/post/` | Stadium glow renamed ground glow (a lit site). |
| `three/season/seasonState.ts`, `seasonShader.ts` (+tests) | `engine/world/season/` | Academic-term calendar replaced by day of year. |
| `three/builders/weatherState.ts`, `WeatherRenderer.ts` (+test) | `engine/world/weather/` | Weather season from day of year; `WeatherMode` local. |
| `three/builders/regionalLandscape.ts`, `coastline.ts`, `cropCalendar.ts`, `edgeHaze.ts` (+tests) | `engine/world/terrain/` | Verbatim. |
| `three/builders/RegionalTerrainRenderer.ts` (mesh + material) | `engine/world/terrain/TerrainRenderer.ts` | One mesh for site + region: fine core (0.35–0.8 u cells), geometric falloff to 2 km. Draws any `TerrainSource`. `refresh()` re-samples a graded pad. |
| `RegionalTerrainRenderer._buildTrees` + `speciesGeos` | `engine/world/trees/FarTreeRenderer.ts` | Generic options; farm windbreaks via `extra`. |
| `RegionalTerrainRenderer._buildWater` | `engine/world/water/RegionalWaterRenderer.ts` | Generic options. |
| `three/builders/treeGeometry.ts`, `instancedLod.ts` (+tests) | `engine/world/trees/` | Verbatim. |
| `HeightmapTerrainRenderer` forest sets | `engine/world/trees/ForestRenderer.ts` | Placement is the caller's (`ForestTreeSpec[]`). |
| `three/builders/waterShading.ts`, `waterFlow.ts` (+test) | `engine/world/water/` | Verbatim. |
| `three/builders/WaterEdgeRenderer.ts` | `engine/world/water/WaterEdgeRenderer.ts` | Occupancy mask replaced by an `EdgeSite` adapter; `buildCampus` → `buildShore`. |
| — (new) | `engine/world/water/StreamRenderer.ts` | A creek whose surface falls along its course (UE water bodies are flat). |
| `GroundDetailRenderer` shared textures + dusk sky fill | `engine/world/materials/groundTextures.ts` | Campus wear / cover masks not ported. |
| `three/builders/normalMapGen.ts` | `engine/world/materials/normalMapGen.ts` | Verbatim. |
| `three/builders/regionalProps.ts`, `regionalFarmsteads.ts`, `houseStyles.ts`, `houseExtras.ts`, `lotFootprints.ts` (+tests) | `engine/world/houses/` | `Farmstead` type moved to `farmstead.ts`; `posHash` to `lotHash.ts`. |
| `three/CampusTourController.ts`, `cameraOcclusion.ts` (+tests) | `engine/world/camera/TourController.ts`, `cameraOcclusion.ts` | Occupancy mask → `SiteBlockedFn`; university tour captions → generic (game supplies highlights). |
| Playwright QA scripts (UE scratchpad) | `scripts/shots.mjs`, `scripts/shotSets.mjs` | In-repo; own Vite server without HMR; reads the canvas. |

Not yet ported (later increments): instanced people (`crowd/`), living clock / window spill
(`life/`), regional roads and rail, `mergeCompat` / building detail LOD, house rendering from
`houseStyles` specs (the town), `streetTextures`, photo mode.
