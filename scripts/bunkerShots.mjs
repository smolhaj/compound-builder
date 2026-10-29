// Bunker interiors (arched wood tunnel, bunkroom TV and games, labeled pantry and water filters, air handling, control room
// with live screens, medical corner) and the people in them. Software GL is slow: one browser, ?lowrender.
//   flock $SP/render.lock node scripts/bunkerShots.mjs <outDir> [port=5961] [only=substring]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5961), only = process.argv[4] || '';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=0.75`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
  const shot = async (name) => { if (only && !name.includes(only)) return; await frames(2); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };

  // the compound: a house, a garden, solar; the bunker with every room; the family's gear
  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    window.__b = {};
    const place = (key, kind, dx, dz, rot = 0) => { const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot, 6); if (!sp) { console.warn('no spot', key); return; } G.getState().plan(kind, sp[0], sp[1], rot); window.__b[key] = G.getState().game.structures.at(-1); };
    place('log_house', -4, -3); place('garden', -2, 4); place('solar_array', 6, 3);
    place('bunker_hatch', 0.25, -6.75); place('bunker_corridor', 1.0, -6.75, 1); place('bunker_galley', 2.25, -6.5); place('bunker_dorm', 2.25, -7.75);
    place('bunker_stores', 3.25, -6.5); place('bunker_plant', 3.25, -7.75); place('bunker_medical', 2.25, -5.5); place('bunker_comms', 1.0, -5.75, 1);
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; }
      g.stock.cameras = 1; g.stock.thermal_cam = 1; g.stock.driveway_alarm = 1; g.stock.games = 1; g.stock.novels = 1; g.stock.instrument = 1; g.stock.canned = 120; g.stock.staples = 14;
      g.utilities.lit = ['x'];
      g.gate.pending = { id: 'e1', kind: 'gang', size: 4, title: 'An armed crew', dossier: [], strength: 40, wants: {}, stances: ['hide'], armed: true } ;
      return { game: g };
    });
    cb.store.getState().setHudHidden?.(true);
  });
  await frames(2); lap('built');
  const room = (kind, ex, ey, ez, lx, ly, lz, fov = 72) => page.evaluate(([kind, ex, ey, ez, lx, ly, lz, fov]) => {
    const cb = window.__cb, b = window.__b[kind], W = cb.world;
    const e = W.localToWorld(b.id, ex, ey, ez), l = W.localToWorld(b.id, lx, ly, lz);
    cb.qa.pose = { x: e.x, y: e.y, z: e.z, lx: l.x, ly: l.y, lz: l.z, fov };
  }, [kind, ex, ey, ez, lx, ly, lz, fov]);
  const aerial = (kind, r, pitch, yaw) => page.evaluate(([kind, r, pitch, yaw]) => { const cb = window.__cb, b = window.__b[kind]; cb.qa.pose = null; cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw; }, [kind, r, pitch, yaw]);
  await page.evaluate(() => { const cb = window.__cb; cb.store.getState().setTimeOfDay(12); cb.store.getState().setUnderground(true); });
  await page.evaluate(() => window.__cb.world.bunkerFolk.setDebug([{ room: 'bunker_comms', role: 'console' }, { room: 'bunker_dorm', role: 'seat' }, { room: 'bunker_galley', role: 'seat' }, { room: 'bunker_medical', role: 'bed' }]));

  await aerial('bunker_galley', 12, 1.0, 0.6); await shot('01-underground-aerial');
  await aerial('bunker_comms', 6, 0.95, 0.5); await shot('02-aerial-control-room');
  await aerial('bunker_dorm', 6.5, 0.95, 0.7); await shot('03-aerial-bunkroom');
  await aerial('bunker_corridor', 5.5, 0.9, 0.4); await shot('04-aerial-tunnel');
  await room('bunker_corridor', 0.0, 0.25, 0.42, 0.0, 0.2, -0.4, 80); await shot('05-eye-tunnel-arch');
  await room('bunker_dorm', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3); await shot('06-eye-bunkroom');
  await room('bunker_comms', 0.1, 0.27, 0.38, -0.1, 0.16, -0.35, 80); await shot('07-eye-control-room');
  await room('bunker_comms', -0.08, 0.2, -0.1, 0.15, 0.2, 0.4, 80); await shot('08-eye-control-room-b');
  await room('bunker_stores', -0.3, 0.27, 0.3, 0.25, 0.1, -0.3); await shot('09-eye-pantry');
  await room('bunker_plant', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3); await shot('10-eye-plant-air');
  await room('bunker_medical', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3); await shot('11-eye-medical');
  await room('bunker_galley', 0.3, 0.27, 0.3, -0.25, 0.1, -0.3); await shot('12-eye-galley');
  // the cutaway, night (the screens glow)
  await page.evaluate(() => { const cb = window.__cb; cb.store.getState().setBuildingView('cutaway'); cb.store.getState().setTimeOfDay(23); });
  await aerial('bunker_comms', 4.5, 0.85, 0.4); await shot('13-cutaway-control-room-night');
  await aerial('bunker_dorm', 5.5, 0.9, 0.9); await shot('14-cutaway-bunkroom-night');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
