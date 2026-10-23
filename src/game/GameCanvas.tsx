import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WorldScene } from '../engine/world/WorldScene';
import { moonPhase, skyDarkness } from '../engine/world/sky/skyState';
import { useWorldStore } from '../store/worldStore';
import { DioramaCamera } from './DioramaCamera';
import { HomesteadWorld } from './HomesteadWorld';
import { seasonState, type VisualSeason } from '../engine/world/season/seasonState';
import { WeatherRenderer } from '../engine/world/weather/WeatherRenderer';
import { TourController } from '../engine/world/camera/TourController';
import { CameraOccluders } from '../engine/world/camera/cameraOcclusion';
import { PARCEL_SIZE } from './HomesteadWorld';
import { PlacementTool } from './PlacementTool';
import { MarkTool } from './MarkTool';
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
      getBlocked: () => world.walkBlocked,
      heightAt: world.groundAt,
      describeBuildings: () => world.describeBuildings(),
      siteBounds: () => ({ w: PARCEL_SIZE, h: PARCEL_SIZE }),
      onCaption: c => useWorldStore.getState().setTourCaption(c),
    });
    const tool = new PlacementTool(ws.scene, ws.camera, canvas, world);
    const marker = new MarkTool(ws.scene, ws.camera, canvas, world);
    const applyCameraMode = () => {
      const m = useWorldStore.getState().cameraMode;
      if (m === 'diorama') { if (tour.active) tour.exit(); cam.enabled = true; return; }
      cam.enabled = false;
      if (tour.active) tour.setMode(m);
      else tour.enter(m, { x: cam.target.x, z: cam.target.z, theta: cam.yaw, phi: cam.pitch });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && useWorldStore.getState().cameraMode !== 'diorama') useWorldStore.getState().setCameraMode('diorama');
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
      useGameStore.subscribe(s => s.tool, k => { tool.setKind(k); marker.setOn(k === 'fell'); }),
    ];

    let lastVisual = '';
    let lastParticles = '-';
    let lastWetKey = -1;
    let last = performance.now();
    let raf = 0;
    const qa = { frames: 0, frameMs: 0 };
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
      ws.setWeather(wx, weather.flash, weather.skyLightning);
      // lamps on inside from dusk (a little after sunset, off by late night)
      setWindowGlow(Math.max(0, Math.min(1, (ws.nightFactor - 0.25) / 0.4)) * (t > 23.5 || t < 5 ? 0.25 : 1));
      if (tour.active) {
        const f = tour.update(dt);
        ws.setShadowFocus(f.x, f.z, 30);
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
    (window as unknown as Record<string, unknown>).__cb = { ws, world, weather, cam, tour, tool, marker, game: useGameStore, store: useWorldStore, THREE, qa };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      unsub.forEach(u => u());
      window.removeEventListener('keydown', onKey);
      tour.dispose();
      tool.dispose();
      marker.dispose();
      cam.dispose();
      weather.dispose();
      world.dispose();
      ws.dispose();
    };
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
