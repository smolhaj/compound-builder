import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WorldScene } from '../engine/world/WorldScene';
import { moonPhase, skyDarkness } from '../engine/world/sky/skyState';
import { useWorldStore } from '../store/worldStore';
import { DioramaCamera } from './DioramaCamera';
import { HomesteadWorld } from './HomesteadWorld';
import { seasonState } from '../engine/world/season/seasonState';

/** React ↔ three.js bridge: owns the WorldScene, the camera and the frame loop. */
export function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ws = new WorldScene(canvas);
    const world = new HomesteadWorld(ws, useWorldStore.getState().seed);
    const cam = new DioramaCamera(canvas);
    cam.groundAt = world.groundAt;
    cam.target.set(world.center.x, 0, world.center.z);

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
      world.setQuality(s.quality);
    };
    applyLook();
    const unsub = [
      useWorldStore.subscribe(s => s.quality, applyLook),
    ];

    let lastVisual = '';
    let last = performance.now();
    let raf = 0;
    const qa = { frames: 0, frameMs: 0 };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t0 = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = useWorldStore.getState();
      if (st.hourSeconds > 0) st.advanceHours(dt / st.hourSeconds);
      const { timeOfDay: t, dayOfYear, totalDays, seasonMode } = useWorldStore.getState();
      ws.setNightSky(moonPhase(dayOfYear + t / 24), skyDarkness('mountain_west', false));
      world.tick(dt, dayOfYear, totalDays, seasonMode);
      // Season grade + particles follow the drawn (eased) visual season
      const vis = seasonState.visual;
      if (vis !== lastVisual) { lastVisual = vis; ws.setSeasonGrade(vis); ws.setSeasonalParticles(vis); }
      cam.apply(ws.camera);
      ws.setShadowFocus(cam.target.x, cam.target.z, cam.radius);
      ws.tick(dt);
      ws.updateDayNight(t);
      ws.renderFrame();
      qa.frames++;
      qa.frameMs = performance.now() - t0;
    };
    raf = requestAnimationFrame(frame);

    // QA hook (screenshot harness, console poking).
    (window as unknown as Record<string, unknown>).__cb = { ws, world, cam, store: useWorldStore, THREE, qa };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      unsub.forEach(u => u());
      cam.dispose();
      world.dispose();
      ws.dispose();
    };
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
