// Floor hatch (shut and open, cutaway and eye level, the stairs) and the bunker construction stages (dig with excavator and tipper,
// formwork and rebar, culvert tubes beside the trench, backfill and mound, finished entrance). Software GL is slow: ?lowrender.
//   flock $SP/render.lock node scripts/hatchShots.mjs <outDir> [port=5962] [only=substring]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5962), only = process.argv[4] || '';
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

  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    window.__b = {};
    const place = (key, kind, dx, dz, rot = 0, abs = false) => { const sp = abs ? cb.tool.findSpot(kind, dx, dz, rot, 1.5) : cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot, 6); if (!sp) { console.warn('no spot', key); return null; } G.getState().plan(kind, sp[0], sp[1], rot); const st = G.getState().game.structures.at(-1); window.__b[key] = st; return st; };
    // the house with the floor hatch in it, and a bunkroom and a corridor beyond
    const h = place('log_house', 'log_house', -4, -3);
    if (h) { place('floorhatch', 'bunker_floorhatch', h.x - 0.25, h.z + 0.25, 0, true); place('bunker_dorm', 'bunker_dorm', h.x + 0.5, h.z + 0.25, 0, true); }
    // five stage sites: each a hatch, a corridor and the room being built
    const site = (key, dx, dz, room, stage, f) => {
      place(key + '_hatch', 'bunker_hatch', dx + 0.25, dz - 6.75); place(key + '_corr', 'bunker_corridor', dx + 1.0, dz - 6.75, 1);
      const r = place(key, room, dx + 2.25, dz - 6.5);
      window.__stage = window.__stage ?? []; window.__stage.push([key, stage, f]);
    };
    site('s1', -22, -4, 'bunker_galley', 1, 0.5); site('s2', -22, 6, 'bunker_galley', 2, 0.45); site('s3', -22, 16, 'bunker_galley', 3, 0.8); site('s4', -22, 26, 'bunker_galley', 4, 0.5);
    G.setState(s => {
      const g = structuredClone(s.game);
      const hrs = [8, 50, 190, 85, 60];
      for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; }
      for (const [key, stage, f] of window.__stage) { const st = g.structures.find(x => x.id === window.__b[key]?.id); if (!st) continue; st.stage = stage; st.done = f * hrs[stage]; st.finishedAt = null; }
      g.utilities.lit = ['x'];
      return { game: g };
    });
    cb.store.getState().setHudHidden?.(true);
  });
  await frames(2); lap('built');
  const at = (key, r, pitch, yaw) => page.evaluate(([key, r, pitch, yaw]) => { const cb = window.__cb, b = window.__b[key]; if (!b) return; cb.qa.pose = null; cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw; }, [key, r, pitch, yaw]);
  const eye = (key, ex, ey, ez, lx, ly, lz, fov = 70) => page.evaluate(([key, ex, ey, ez, lx, ly, lz, fov]) => {
    const cb = window.__cb, b = window.__b[key], W = cb.world; if (!b) return;
    const e = W.localToWorld(b.id, ex, ey, ez), l = W.localToWorld(b.id, lx, ly, lz);
    cb.qa.pose = { x: e.x, y: e.y, z: e.z, lx: l.x, ly: l.y, lz: l.z, fov };
  }, [key, ex, ey, ez, lx, ly, lz, fov]);
  const set = (js) => page.evaluate(new Function('cb', js));

  // construction stages (daylight, from above)
  await set("cb.store.getState().setTimeOfDay(12);");
  await at('s1', 7, 0.8, 0.5); await shot('01-stage1-dig-excavator-tipper');
  await at('s2', 7, 0.8, 0.5); await shot('02-stage2-formwork-rebar');
  await at('s3', 7, 0.8, 0.5); await shot('03-stage3-backfill-tipping');
  await at('s4', 7, 0.8, 0.5); await shot('04-stage4-mound-fitout');
  // the corridor as the room: tubes beside the trench
  await set(`cb.game.setState(s => { const g = structuredClone(s.game); const st = g.structures.find(x => x.id === window.__b.s2_corr?.id); if (st) { st.stage = 2; st.done = 0.4 * 190; st.finishedAt = null; } const r = g.structures.find(x => x.id === window.__b.s2?.id); if (r) { r.stage = 99; r.finishedAt = 0; } return { game: g }; });`);
  await at('s2_corr', 6, 0.75, 0.4); await shot('05-stage2-culvert-tubes-corridor');
  await at('s4_hatch', 3.2, 0.55, 0.6); await shot('06-finished-entrance-hatch');
  // the floor hatch: underground view first (the shaft and stairs), then the cutaway, then eye level in the house
  await set("cb.store.getState().setUnderground(true); cb.store.getState().setBuildingView('cutaway');");
  await at('floorhatch', 3.2, 1.0, 0.5); await shot('07-underground-floor-hatch-shaft');
  await set("cb.store.getState().setUnderground(false); cb.world.qaLid = 0;");
  await at('floorhatch', 3.0, 1.05, 0.2); await shot('08-cutaway-hatch-closed');
  await set("cb.world.qaLid = 1;");
  await shot('09-cutaway-hatch-open');
  await at('floorhatch', 1.8, 0.7, 0.9); await shot('10-cutaway-hatch-open-close');
  await set("cb.store.getState().setBuildingView('full'); cb.world.qaLid = 0;");
  await eye('floorhatch', -0.35, 0.27, -0.4, 0.0, 0.0, 0.0, 74); await shot('11-eye-level-hatch-closed');
  await set("cb.world.qaLid = 1;");
  await eye('floorhatch', 0.02, 0.27, -0.4, 0.0, 0.0, 0.0, 74); await shot('12-eye-level-hatch-open');
  await eye('floorhatch', 0.0, 0.2, -0.3, 0.0, -0.1, 0.2, 80); await shot('13-eye-level-hatch-open-stairs-down');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
