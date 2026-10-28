import { litTowerIds } from '../sim/towers';
import { burnedFarms } from '../sim/neighborLife';
import { useEffect, useRef } from 'react';
import type { GameState } from '../sim/state';
import { MushroomCloud } from './fx/MushroomCloud';
import { disasterSky } from '../sim/nuclear';
import * as THREE from 'three';
import { WorldScene } from '../engine/world/WorldScene';
import { moonPhase, skyDarkness } from '../engine/world/sky/skyState';
import { BUILDING_VIEWS, useWorldStore } from '../store/worldStore';
import { DioramaCamera } from './DioramaCamera';
import { HomesteadWorld } from './HomesteadWorld';
import { seasonState, type VisualSeason } from '../engine/world/season/seasonState';
import { WeatherRenderer } from '../engine/world/weather/WeatherRenderer';
import { TourController } from '../engine/world/camera/TourController';
import { CameraOccluders } from '../engine/world/camera/cameraOcclusion';
import { PARCEL_SIZE } from './HomesteadWorld';
import { PlacementTool } from './PlacementTool';
import { MarkTool } from './MarkTool';
import { BoundaryOutline } from './BoundaryOutline';
import { PerimeterTool } from './PerimeterTool';
import { SightOverlay } from './sightlines/SightOverlay';
import { PARCEL_SIZE as PS } from './parcel/parcelTerrain';
import { fenceLive, type PerimeterKind } from '../sim/perimeter';
import { useGameStore } from '../store/gameStore';
import { useBattleStore } from '../store/battleStore';
import { BattleRenderer } from './battle/BattleRenderer';
import { demoBattle } from './battle/demoBattle';
import { CutscenePlayer } from './battle/CutscenePlayer';
import { useCutsceneView } from '../store/cutsceneStore';
import { isFinished } from '../sim/construction';
import { isHome } from '../sim/blueprints';
import { calendarOf, hourOf, SECONDS_PER_DAY } from '../sim/state';
import { setWindowGlow } from './buildkit/materials';
import { homeOutsideForty } from '../sim/site';
import { ownsAt } from '../sim/land';
import type { SiteQuery } from './buildkit/kit';
import { parseLowRender, RenderRequests, type QaQuality } from './qaRender';

/** Background damp of the season (ground darkens a little in the shoulder seasons). */
const SEASON_WETNESS: Record<VisualSeason, number> = { spring: 0.22, fall: 0.28, winter: 0.14, summer: 0 };

/** React ↔ three.js bridge: owns the WorldScene, the camera and the frame loop. */
export function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ws = new WorldScene(canvas);
    const world = new HomesteadWorld(ws, useGameStore.getState().game.seed, useGameStore.getState().game.site);
    const weather = new WeatherRenderer(ws.scene, useGameStore.getState().game.seed);
    const cam = new DioramaCamera(canvas);
    cam.groundAt = world.groundAt;
    cam.solidAt = world.crownAt;
    const occluders = new CameraOccluders(ws.scene, () => []);   // the diorama camera keeps its own ground clearance
    cam.target.set(world.camp.x, 0, world.camp.z);
    const tour = new TourController({
      camera: ws.camera, dom: canvas, scene: ws.scene,
      getBlocked: () => world.tourBlocked,
      heightAt: world.tourHeight,
      portal: world.tourPortal,
      describeBuildings: () => world.describeBuildings(),
      siteBounds: () => ({ w: PARCEL_SIZE, h: PARCEL_SIZE }),
      onCaption: c => useWorldStore.getState().setTourCaption(c),
    });
    const tool = new PlacementTool(ws.scene, ws.camera, canvas, world);
    const marker = new MarkTool(ws.scene, ws.camera, canvas, world);
    const fence = new PerimeterTool(ws.scene, ws.camera, canvas, world);
    const sight = new SightOverlay(ws.scene, {
      sightWorld: () => world.sightWorld(), bounds: { x0: -6, z0: -6, x1: PS + 6, z1: PS + 6 },
      observers: k => world.observers(k), lights: () => world.nightLights(),
    });
    // viewshed: with the overlay in viewshed mode, a click on the ground sets the eye (Shift: from a 10 m tower)
    const vsRay = new THREE.Raycaster(), vsNdc = new THREE.Vector2();
    let vsDown: { x: number; y: number } | null = null;
    const onVsDown = (e: PointerEvent) => { vsDown = { x: e.clientX, y: e.clientY }; };
    let servicesKey = '';
    const onVsUp = (e: PointerEvent) => {
      const d = vsDown; vsDown = null;
      // click a building (no tool, no viewshed) to select it
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 5 && e.button === 0 && !useGameStore.getState().tool && useWorldStore.getState().sightMode !== 'viewshed') {
        const r = canvas.getBoundingClientRect();
        vsNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        vsRay.setFromCamera(vsNdc, ws.camera);
        const id = world.pickBuilding(vsRay.ray);
        if (id) useGameStore.getState().select(id);
        return;
      }
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || useWorldStore.getState().sightMode !== 'viewshed' || useGameStore.getState().tool || !world.terrain.mesh) return;
      const r = canvas.getBoundingClientRect();
      vsNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      vsRay.setFromCamera(vsNdc, ws.camera);
      const h = vsRay.intersectObject(world.terrain.mesh, false)[0];
      if (h) sight.set('viewshed', { x: h.point.x, z: h.point.z, eye: e.shiftKey ? 1.7 : 0.3 });
    };
    canvas.addEventListener('pointerdown', onVsDown);
    canvas.addEventListener('pointerup', onVsUp);
    const applyCameraMode = () => {
      const m = useWorldStore.getState().cameraMode;
      if (m === 'diorama') { if (tour.active) tour.exit(); cam.enabled = true; return; }
      cam.enabled = false;
      if (tour.active) tour.setMode(m);
      else tour.enter(m, { x: cam.target.x, z: cam.target.z, theta: cam.yaw, phi: cam.pitch });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && useWorldStore.getState().cameraMode !== 'diorama') useWorldStore.getState().setCameraMode('diorama');
      // V cycles the building view: full → cutaway → x-ray
      if (e.code === 'KeyV' && !(e.target instanceof HTMLInputElement)) {
        const w = useWorldStore.getState();
        w.setBuildingView(BUILDING_VIEWS[(BUILDING_VIEWS.indexOf(w.buildingView) + 1) % BUILDING_VIEWS.length]);
      }
      // U: the underground view (bunker rooms under see-through ground)
      if (e.code === 'KeyU' && !(e.target instanceof HTMLInputElement)) useWorldStore.getState().setUnderground(!useWorldStore.getState().underground);
    };
    window.addEventListener('keydown', onKey);
    let shiftDown = false;
    const onShift = (e: KeyboardEvent) => { shiftDown = e.shiftKey; };
    window.addEventListener('keydown', onShift);
    window.addEventListener('keyup', onShift);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ws.resize(w, h);
    };
    ws.setupPostProcessing(canvas.clientWidth || 1280, canvas.clientHeight || 800);
    resize();
    window.addEventListener('resize', resize);

    // QA-only on-demand rendering (?lowrender): Low quality, reduced pixel ratio, drawn only when asked
    const lowRender = parseLowRender(window.location.search);
    const renderReq = new RenderRequests();
    const setLook = (q: QaQuality) => {
      ws.qaPixelRatio = lowRender.on ? (q === 'low' ? lowRender.scale : 1) : null;
      ws.setGraphicsQuality(q);
      weather.setQuality(q);
      world.setQuality(q);
    };
    const applyLook = () => setLook(lowRender.on ? 'low' : useWorldStore.getState().quality);
    applyLook();
    // what came with the land: the world picks its spots once, then it's laid in like anything built
    const unplaced = useGameStore.getState().game.structures.filter(x => x.unplaced);
    if (unplaced.length) {
      const query: SiteQuery = {
        height: (x, z) => world.parcel.natural(x, z).h,
        owned: (x, z) => ownsAt(useGameStore.getState().game, x, z),
        water: (x, z) => world.parcel.isCreek(x, z) || world.stream.depthAt(x, z) > 0,
        blocked: (x, z) => world.onCamp(x, z, 0.4) || world.onAccess(x, z, 0.4),
      };
      useGameStore.getState().placeImprovements(world.siteImprovements(unplaced, query));
    }
    const placedOnly = (list: GameState['structures']) => list.filter(x => !x.unplaced);
    world.syncStructures(placedOnly(useGameStore.getState().game.structures));
    // the neighbor parcels: survey what each is once (timber, creek bottom, hay ground, dry grazing), and plant what's bought
    const ownedRects = (g: GameState) => [...homeOutsideForty(g.site), ...g.land.parcels.filter(p => p.owner === 'you').map(p => p.rect)];
    if (!useGameStore.getState().game.land.surveyed) useGameStore.getState().survey(world.surveyLand(useGameStore.getState().game.land.parcels));
    world.setOwnedLand(ownedRects(useGameStore.getState().game));
    // the property line: on by the Boundary button, and while a fence or wall is being drawn
    const boundary = new BoundaryOutline(ws.scene, world.groundAt);
    const rebuildBoundary = () => boundary.build([world.home, ...ownedRects(useGameStore.getState().game)]);
    const showBoundary = () => { boundary.visible = useWorldStore.getState().showBoundary || !!useGameStore.getState().tool?.startsWith('fence:'); };
    rebuildBoundary(); showBoundary();
    useWorldStore.getState().setSiteGeo({ creekZ: x => world.parcel.creek.zAt(x), creekHalf: world.parcel.creek.halfWidth, roadGate: [world.access.gate.x, world.access.gate.z] });
    world.setBurnedFarms(burnedFarms(useGameStore.getState().game));
    const unsub = [
      // wildfire weather: measure the fuel round every building (what cleared ground there is decides what burns)
      useGameStore.subscribe(s => s.game.disaster.phase, ph => { const g = useGameStore.getState().game; if (g.disaster.kind === 'wildfire' && ph === 'warning' && !g.disaster.fuel) useGameStore.getState().setFuel(world.fuelNear(g.structures)); }),
      useGameStore.subscribe(s => s.game.land, () => { world.setOwnedLand(ownedRects(useGameStore.getState().game)); rebuildBoundary(); }),
      useWorldStore.subscribe(s => s.showBoundary, showBoundary),
      useGameStore.subscribe(s => s.tool, showBoundary),
      useWorldStore.subscribe(s => s.quality, applyLook),
      useWorldStore.subscribe(s => s.cameraMode, applyCameraMode),
      useGameStore.subscribe(s => s.game.structures, list => { world.syncStructures(placedOnly(list)); occluders.invalidate(); }),
      useGameStore.subscribe(s => s.game.site.improvements.drive, on => world.setDrive(on)),
      // a neighbor's farm burned (sim/neighborLife.ts): drawn charred once the family knows
      useGameStore.subscribe(s => burnedFarms(s.game).join(), () => world.setBurnedFarms(burnedFarms(useGameStore.getState().game))),
      useGameStore.subscribe(s => s.tool, k => { tool.setKind(k); marker.setOn(k === 'fell'); fence.setKind(k?.startsWith('fence:') ? k.slice(6) as PerimeterKind : null); if (k === 'fence:escape_tunnel' || k === 'fence:underground_passage') useWorldStore.getState().setUnderground(true); }),
      useWorldStore.subscribe(s => s.buildingView, v => world.setBuildingView(v)),
      useWorldStore.subscribe(s => s.underground, on => world.setUnderground(on)),
      useWorldStore.subscribe(s => s.sightMode, m => sight.set(m)),
      // the compound changed: recompute the overlay
      useGameStore.subscribe(s => `${s.game.structures.map(x => x.id + x.stage).join()}|${s.game.perimeter.map(r => r.id + (r.finishedAt === null ? Math.round(r.done) : 'f')).join()}`, () => sight.refresh()),
    ];

    let lastVisual = '';
    let lastParticles = '-';
    let mushroom: MushroomCloud | null = null;
    let lastWetKey = -1;
    let last = performance.now();
    let raf = 0;
    /** QA hooks: frame counter, and an exact camera pose (eye → look) for interior shots. */
    const battle = new BattleRenderer(ws.scene, world.groundAt, () => useGameStore.getState().game.people);
    battle.onEnd = () => useBattleStore.getState().endBattle();
    let battleSkip = useBattleStore.getState().skipReq, battleSync = 0;
    // the raid cutscene: plays a staged siege (sim/siege.ts), cutting between wall, house and raiders
    const homeSpot = () => {
      const g = useGameStore.getState().game;
      const h = g.structures.find(x => isFinished(x) && isHome(x.kind)) ?? g.structures.find(isFinished);
      return h ? { x: h.x, y: 0, z: h.z } : { x: world.camp.x, y: 0, z: world.camp.z };
    };
    const player = new CutscenePlayer({ battle, ground: world.groundAt, house: homeSpot, commit: () => useGameStore.getState().commitCutscene(), seed: useGameStore.getState().game.seed });
    let cineSaved: { fov: number; near: number } | null = null;
    let promptAt = -1, skipScene = useCutsceneView.getState().skipScene, skipAll = useCutsceneView.getState().skipAll;
    let battleView: { x: number; z: number; radius: number; pitch: number } | null = null;
    const qa: { frames: number; frameMs: number; lowrender?: boolean; renderNow?: () => Promise<void>; renderFull?: (q?: QaQuality) => Promise<void>; pose: null | { x: number; y: number; z: number; lx: number; ly: number; lz: number; fov?: number } } = { frames: 0, frameMs: 0, pose: null };
    // window.__cb.qa.renderNow(): draw one frame (a promise); renderFull('high'|'medium'): one slow full-quality, full-resolution shot
    if (lowRender.on) Object.assign(qa, { lowrender: true, renderNow: () => renderReq.request(), renderFull: (q: QaQuality = 'high') => renderReq.request(q) });
    let slow = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t0 = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      // a slow machine on High (SSAO, 2× pixels) steps down to Medium by itself after ~5 s under 40 fps
      slow = dt > 0.025 ? slow + dt : Math.max(0, slow - dt * 2);
      if (!lowRender.on && slow > 5 && useWorldStore.getState().quality === 'high') { useWorldStore.getState().setQuality('medium'); slow = 0; }
      last = now;
      // the sim advances in real time at its speed; the view clock follows it (outside photo mode)
      // the clock stands still while the new-game screen is up
      if (!useGameStore.getState().setupOpen) useGameStore.getState().tick(dt);
      const game = useGameStore.getState().game;
      // the raid cutscene: start / stop the player, and read the clock off its timeline while it plays
      const cs = useGameStore.getState().cutscene;
      if (cs?.phase === 'playing' && !player.active) {
        cineSaved = { fov: ws.camera.fov, near: ws.camera.near };
        cam.enabled = false;
        player.start(cs);
      } else if (cs?.phase !== 'playing' && player.active) {
        player.stop();
        cam.enabled = useWorldStore.getState().cameraMode === 'diorama';
        if (cineSaved) { ws.camera.fov = cineSaved.fov; ws.camera.near = cineSaved.near; ws.camera.updateProjectionMatrix(); }
      }
      world.powered = game.utilities.lit.length > 0 || (game.utilities.grid && game.disaster.tracks.grid > 0.5);
      world.litTowers = new Set(litTowerIds(game));
      const cv = useCutsceneView.getState();
      if (cv.skipScene !== skipScene) { skipScene = cv.skipScene; player.skipScene(); }
      if (cv.skipAll !== skipAll) { skipAll = cv.skipAll; player.skipAll(); }
      const cine = player.active ? player.update(dt) : null;
      if (!useWorldStore.getState().photo) {
        const t = player.active && cs?.t0 != null ? cs.t0 + player.clockGame / 86400 : game.clock.t;
        const cal = calendarOf(game.clock, t);
        useWorldStore.getState().syncClock(hourOf(t), cal.doy, t);
      }
      // the prompt: the camera settles low in the yard, looking down the drive; you can still orbit
      if (cs?.phase === 'prompt') {
        if (promptAt < 0) promptAt = now;
        if (now - promptAt < 2600) {
          const h = homeSpot(), k = Math.min(1, dt * 2);
          cam.target.x += (h.x + 0 - cam.target.x) * k; cam.target.z += (h.z + 7 - cam.target.z) * k;
          cam.target.y += (world.groundAt(cam.target.x, cam.target.z) + 0.15 - cam.target.y) * k;
          cam.radius += (6.5 - cam.radius) * k; cam.pitch += (0.16 - cam.pitch) * k;
          let dy = Math.PI - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); cam.yaw += dy * k;
        }
      } else promptAt = -1;
      world.syncProgress(game.structures);
      world.syncFood(game);
      world.syncTents(game);
      world.syncForestry(game.forestry);
      world.simTime = game.clock.t;
      world.syncPerimeter(game.perimeter, game.clock.t, { lit: fenceLive(game), sensors: (game.stock.ground_sensor ?? 0) > 0 });
      const svKey = `${game.structures.filter(x => x.stage >= 5).length}|${game.perimeter.filter(r => r.finishedAt !== null).length}|${game.utilities.fittings.filter(f => f.finishedAt !== null).length}`;
      if (svKey !== servicesKey) { servicesKey = svKey; world.syncServices(game); }
      sight.update(6);
      const speedK = game.clock.speed === 0 ? 0 : 60 / SECONDS_PER_DAY[game.clock.speed];
      world.updatePeople(dt, game, hourOf(game.clock.t), speedK);
      world.updateWildlife(dt, game, speedK);
      world.updateDeliveries(dt, game, speedK);
      const speed = game.clock.speed;
      const { timeOfDay: t, dayOfYear, totalDays, seasonMode, weatherMode } = useWorldStore.getState();
      ws.setNightSky(moonPhase(dayOfYear + t / 24), skyDarkness(world.climate, false));
      Object.assign(world.air, { hour: t, wind: weather.outputs.wind, daylight: 1 - ws.nightFactor * 0.85, viewportH: canvas.clientHeight || 800 });
      world.tick(dt, dayOfYear, totalDays, seasonMode);
      const sp = world.seasons.params;
      // Season grade, particles and damp ground follow the drawn (eased) visual season
      const vis: VisualSeason = seasonState.visual;
      if (vis !== lastVisual) { lastVisual = vis; ws.setSeasonGrade(vis); }
      const pKey = vis === 'fall' && sp.fall > 0.45 && sp.bare < 0.9 && seasonState.climate.blaze >= 0.5 ? 'fall'
        : vis === 'spring' && sp.bloom > 0.3 ? 'spring' : '';
      if (pKey !== lastParticles) { lastParticles = pKey; ws.setSeasonalParticles(pKey); }
      const wetKey = Math.round((Math.max(SEASON_WETNESS[vis], world.atmos.mud * 0.55) * (1 - sp.snow) + sp.wet * 0.45) * 50);
      if (wetKey !== lastWetKey) { lastWetKey = wetKey; ws.setWetness(wetKey / 50); }
      // Weather → sky / light / fog (next frame), wet + snowy surfaces.
      const wxSeason = vis === 'winter' && seasonState.weatherSnow <= 0 ? 'fall' : vis;
      const wx = weather.update({
        dt, speed: speed === 0 ? 1 : 60 / SECONDS_PER_DAY[speed], season: wxSeason, hour: t,
        mode: weatherMode, eventWetness: ws.eventWetness, night: ws.nightFactor,
        camera: ws.camera, focus: cam.target,
        snowBase: sp.snow, snowAllow: seasonState.weatherSnow, region: seasonState.climate.id,
      });
      // nuclear war: the flash, a mushroom cloud on the northern skyline, a sickly hazed sky, grey dust falling
      const gs = useGameStore.getState().game, nk = disasterSky(gs);
      if (gs.disaster.kind === 'nuclear' && gs.clock.t >= gs.disaster.hitAt && gs.disaster.variant !== 'exchange') {
        if (!mushroom) { // within the far plane, sized to the angle it would fill: ≈ 6° for the missile fields 100+ km off, ≈ 20° for the base
          mushroom = new MushroomCloud(PARCEL_SIZE * 0.3, -2250, gs.disaster.variant === 'nearby' ? 220 : 70); ws.scene.add(mushroom.group); }
        mushroom.update((gs.clock.t - gs.disaster.hitAt) * 24);
      } else if (mushroom) { ws.scene.remove(mushroom.group); mushroom.dispose(); mushroom = null; }
      if (nk.haze + nk.dust + nk.flash > 0) {
        wx.cloud = Math.max(wx.cloud, 0.55 * nk.haze + 0.3 * nk.dust);
        wx.fog = Math.max(wx.fog, 0.35 * nk.haze + 0.4 * nk.dust);
        wx.haze = Math.max(wx.haze ?? 0.4, 0.9 * nk.haze);
        wx.snow = Math.max(wx.snow, 0.6 * nk.dust);
      }
      ws.setWeather(wx, Math.max(weather.flash, nk.flash), weather.skyLightning);
      // lamps on inside from dusk (which windows, and how, is the atmosphere's: who's up, power, blackout curtains)
      setWindowGlow(Math.max(0, Math.min(1, (ws.nightFactor - 0.25) / 0.4)), now / 1000);
      world.updateAtmosphere({
        dt, time: now / 1000, hour: t, night: ws.nightFactor, daylight: 1 - ws.nightFactor * 0.85, wind: wx.wind, rain: wx.rain, cloud: wx.cloud,
        snow: Math.max(sp.snow, wx.snowCover * seasonState.weatherSnow) * (wx.rain > 0.3 ? 0.4 : 1), viewportH: canvas.clientHeight || 800, battle: battle.playing,
      }, gs, seasonState.doy);
      if (tour.active) {
        const f = tour.update(dt);
        // walking indoors: a near plane short enough that walls and furniture never clip
        const near = useWorldStore.getState().cameraMode === 'walk' ? 0.02 : 0.05;
        if (ws.camera.near !== near) { ws.camera.near = near; ws.camera.updateProjectionMatrix(); }
        ws.setShadowFocus(f.x, f.z, 30);
      } else if (cine) {
        ws.camera.position.set(cine.eye.x, cine.eye.y, cine.eye.z);
        ws.camera.lookAt(cine.look.x, cine.look.y, cine.look.z);
        ws.camera.near = 0.02; ws.camera.fov = cine.fov;
        ws.camera.updateProjectionMatrix();
        ws.setShadowFocus(cine.eye.x, cine.eye.z, 16);
      } else if (qa.pose) {
        const p = qa.pose;
        ws.camera.position.set(p.x, p.y, p.z);
        ws.camera.lookAt(p.lx, p.ly, p.lz);
        ws.camera.near = 0.02;
        ws.camera.fov = p.fov ?? 64;
        ws.camera.updateProjectionMatrix();
        ws.setShadowFocus(p.x, p.z, 6);
      } else {
        cam.step(dt, shiftDown);
        cam.apply(ws.camera);
        occluders.keepOut(ws.camera, cam.target.x, cam.target.z, cam.target.y);
        // looking down, fit the shadows to the ground actually on screen (the far edge of the view
        // lies well beyond the target); low views keep the tight fit round the target for sharp shadows
        const foot = cam.pitch > 0.75 ? viewFootprint(ws.camera, cam.target.y, cam.radius * 3) : null;
        if (foot) ws.setShadowFocus(foot.x, foot.z, foot.r / 1.1);
        else ws.setShadowFocus(cam.target.x, cam.target.z, cam.radius);
      }
      // battle playback: start / skip / tick, camera shake, overlay progress
      const bs = useBattleStore.getState();
      if (bs.battle && bs.battle !== battle.battle) { battle.play(bs.battle); battleView ??= { x: cam.target.x, z: cam.target.z, radius: cam.radius, pitch: cam.pitch }; }
      else if (!bs.battle && battle.playing) battle.stop();
      // the camera follows the fight (eased), and goes back where it was afterwards
      const f = battle.playing ? battle.focus() : null;
      if (f && !player.active) {
        const k = Math.min(1, dt * 1.5);
        cam.target.x += (f.x - cam.target.x) * k; cam.target.z += (f.z - cam.target.z) * k; cam.target.y += (world.groundAt(cam.target.x, cam.target.z) - cam.target.y) * k;
        cam.radius += (Math.min(26, Math.max(8, f.spread * 2.2 + 5)) - cam.radius) * k;
        cam.pitch += (0.45 - cam.pitch) * k;
      } else if (battleView && !battle.playing) {
        cam.target.x = battleView.x; cam.target.z = battleView.z; cam.radius = battleView.radius; cam.pitch = battleView.pitch;
        battleView = null;
      }
      if (bs.skipReq !== battleSkip) { battleSkip = bs.skipReq; battle.skip(); }
      if (battle.playing) {
        battle.update(dt);
        if (battle.shake > 0) ws.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * battle.shake, (Math.random() - 0.5) * battle.shake, (Math.random() - 0.5) * battle.shake));
        battleSync += dt;
        if (battleSync > 0.2 && battle.playing) { battleSync = 0; bs.setProgress(battle.time, battle.lines); }
      }
      ws.tick(dt);
      ws.updateDayNight(t);
      if (!lowRender.on) ws.renderFrame();
      else if (renderReq.pending) {
        // one on-demand draw; a full-quality shot lifts the look for this frame only
        const q = renderReq.quality;
        if (q) { setLook(q); ws.updateDayNight(t); }
        ws.renderFrame();
        if (q) { setLook('low'); }
        renderReq.drawn();
      }
      qa.frames++;
      qa.frameMs = performance.now() - t0;
    };
    raf = requestAnimationFrame(frame);

    // QA hook (screenshot harness, console poking).
    (window as unknown as Record<string, unknown>).__cb = { player, ws, world, weather, cam, tour, tool, marker, fence, sight, game: useGameStore, store: useWorldStore, THREE, qa, battle,
      demoBattle: () => {
        const g = useGameStore.getState().game;
        const b = demoBattle(g.structures, g.people, g.structures.length ? undefined : world.camp);
        useBattleStore.getState().playBattle(b);
        return b;
      } };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      unsub.forEach(u => u());
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onShift);
      window.removeEventListener('keyup', onShift);
      player.stop();
      battle.dispose();
      tour.dispose();
      tool.dispose();
      marker.dispose();
      fence.dispose();
      sight.dispose();
      boundary.dispose();
      useWorldStore.getState().setSiteGeo(null);
      canvas.removeEventListener('pointerdown', onVsDown);
      canvas.removeEventListener('pointerup', onVsUp);
      cam.dispose();
      weather.dispose();
      world.dispose();
      ws.dispose();
    };
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}

const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
/** The bounding circle of the ground (plane y) under the view's corners and center; rays past `maxR` are clamped. */
function viewFootprint(camera: THREE.PerspectiveCamera, y: number, maxR: number): { x: number; z: number; r: number } | null {
  const pts: THREE.Vector3[] = [];
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) {
    _ndc.set(u, v);
    _ray.setFromCamera(_ndc, camera);
    const d = _ray.ray.direction, o = _ray.ray.origin;
    const t = d.y < -1e-3 ? (y - o.y) / d.y : Infinity;
    const far = Math.min(t, maxR * 1.5);
    pts.push(_hit.copy(o).addScaledVector(d, far).clone());
  }
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  const r = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.z - cz)));
  return Number.isFinite(r) ? { x: cx, z: cz, r: Math.min(r, maxR) } : null;
}

