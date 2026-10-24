import { useEffect, useRef } from 'react';
import { MushroomCloud } from './fx/MushroomCloud';
import { nuclearSky } from '../sim/nuclear';
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
import { PerimeterTool } from './PerimeterTool';
import { SightOverlay } from './sightlines/SightOverlay';
import { PARCEL_SIZE as PS } from './parcel/parcelTerrain';
import type { PerimeterKind } from '../sim/perimeter';
import { useGameStore } from '../store/gameStore';
import { calendarOf, hourOf, SECONDS_PER_DAY } from '../sim/state';
import { setWindowGlow } from './buildkit/materials';

/** Background damp of the season (ground darkens a little in the shoulder seasons). */
const SEASON_WETNESS: Record<VisualSeason, number> = { spring: 0.22, fall: 0.28, winter: 0.14, summer: 0 };

/** React ↔ three.js bridge: owns the WorldScene, the camera and the frame loop. */
export function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ws = new WorldScene(canvas);
    const world = new HomesteadWorld(ws, useGameStore.getState().game.seed);
    const weather = new WeatherRenderer(ws.scene, useGameStore.getState().game.seed);
    const cam = new DioramaCamera(canvas);
    cam.groundAt = world.groundAt;
    cam.solidAt = world.crownAt;
    const occluders = new CameraOccluders(ws.scene, () => []);   // the diorama camera keeps its own ground clearance
    cam.target.set(world.center.x, 0, world.center.z);
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

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ws.resize(w, h);
    };
    ws.setupPostProcessing(canvas.clientWidth || 1280, canvas.clientHeight || 800);
    resize();
    window.addEventListener('resize', resize);

    const applyLook = () => {
      const s = useWorldStore.getState();
      ws.setGraphicsQuality(s.quality);
      weather.setQuality(s.quality);
      world.setQuality(s.quality);
    };
    applyLook();
    world.syncStructures(useGameStore.getState().game.structures);
    const unsub = [
      useWorldStore.subscribe(s => s.quality, applyLook),
      useWorldStore.subscribe(s => s.cameraMode, applyCameraMode),
      useGameStore.subscribe(s => s.game.structures, list => { world.syncStructures(list); occluders.invalidate(); }),
      useGameStore.subscribe(s => s.tool, k => { tool.setKind(k); marker.setOn(k === 'fell'); fence.setKind(k?.startsWith('fence:') ? k.slice(6) as PerimeterKind : null); if (k === 'fence:escape_tunnel') useWorldStore.getState().setUnderground(true); }),
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
    const qa: { frames: number; frameMs: number; pose: null | { x: number; y: number; z: number; lx: number; ly: number; lz: number; fov?: number } } = { frames: 0, frameMs: 0, pose: null };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t0 = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // the sim advances in real time at its speed; the view clock follows it (outside photo mode)
      useGameStore.getState().tick(dt);
      const game = useGameStore.getState().game;
      if (!useWorldStore.getState().photo) {
        const cal = calendarOf(game.clock);
        useWorldStore.getState().syncClock(hourOf(game.clock.t), cal.doy, game.clock.t);
      }
      world.syncProgress(game.structures);
      world.syncForestry(game.forestry);
      world.simTime = game.clock.t;
      world.syncPerimeter(game.perimeter, game.clock.t);
      const svKey = `${game.structures.filter(x => x.stage >= 5).length}|${game.perimeter.filter(r => r.finishedAt !== null).length}|${game.utilities.fittings.filter(f => f.finishedAt !== null).length}`;
      if (svKey !== servicesKey) { servicesKey = svKey; world.syncServices(game); }
      sight.update(6);
      const speedK = game.clock.speed === 0 ? 0 : 60 / SECONDS_PER_DAY[game.clock.speed];
      world.updatePeople(dt, game, hourOf(game.clock.t), speedK);
      world.updateDeliveries(dt, game, speedK);
      const speed = game.clock.speed;
      const { timeOfDay: t, dayOfYear, totalDays, seasonMode, weatherMode } = useWorldStore.getState();
      ws.setNightSky(moonPhase(dayOfYear + t / 24), skyDarkness('mountain_west', false));
      Object.assign(world.air, { hour: t, wind: weather.outputs.wind, daylight: 1 - ws.nightFactor * 0.85, viewportH: canvas.clientHeight || 800 });
      world.tick(dt, dayOfYear, totalDays, seasonMode);
      const sp = world.seasons.params;
      // Season grade, particles and damp ground follow the drawn (eased) visual season
      const vis: VisualSeason = seasonState.visual;
      if (vis !== lastVisual) { lastVisual = vis; ws.setSeasonGrade(vis); }
      const pKey = vis === 'fall' && sp.fall > 0.45 && sp.bare < 0.9 && seasonState.climate.blaze >= 0.5 ? 'fall'
        : vis === 'spring' && sp.bloom > 0.3 ? 'spring' : '';
      if (pKey !== lastParticles) { lastParticles = pKey; ws.setSeasonalParticles(pKey); }
      const wetKey = Math.round((SEASON_WETNESS[vis] * (1 - sp.snow) + sp.wet * 0.45) * 50);
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
      const gs = useGameStore.getState().game, nk = nuclearSky(gs);
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
      // lamps on inside from dusk (a little after sunset, off by late night)
      setWindowGlow(Math.max(0, Math.min(1, (ws.nightFactor - 0.25) / 0.4)) * (t > 23.5 || t < 5 ? 0.25 : 1));
      if (tour.active) {
        const f = tour.update(dt);
        // walking indoors: a near plane short enough that walls and furniture never clip
        const near = useWorldStore.getState().cameraMode === 'walk' ? 0.02 : 0.05;
        if (ws.camera.near !== near) { ws.camera.near = near; ws.camera.updateProjectionMatrix(); }
        ws.setShadowFocus(f.x, f.z, 30);
      } else if (qa.pose) {
        const p = qa.pose;
        ws.camera.position.set(p.x, p.y, p.z);
        ws.camera.lookAt(p.lx, p.ly, p.lz);
        ws.camera.near = 0.02;
        ws.camera.fov = p.fov ?? 64;
        ws.camera.updateProjectionMatrix();
        ws.setShadowFocus(p.x, p.z, 6);
      } else {
        cam.apply(ws.camera);
        occluders.keepOut(ws.camera, cam.target.x, cam.target.z, cam.target.y);
        ws.setShadowFocus(cam.target.x, cam.target.z, cam.radius);
      }
      ws.tick(dt);
      ws.updateDayNight(t);
      ws.renderFrame();
      qa.frames++;
      qa.frameMs = performance.now() - t0;
    };
    raf = requestAnimationFrame(frame);

    // QA hook (screenshot harness, console poking).
    (window as unknown as Record<string, unknown>).__cb = { ws, world, weather, cam, tour, tool, marker, fence, sight, game: useGameStore, store: useWorldStore, THREE, qa };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      unsub.forEach(u => u());
      window.removeEventListener('keydown', onKey);
      tour.dispose();
      tool.dispose();
      marker.dispose();
      fence.dispose();
      sight.dispose();
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
