// Perimeter-vocabulary shots with ?lowrender. Each scenario reloads the page, builds its compound (finished) and takes its shots.
//   flock <lock> node scripts/terrainShots.mjs <outDir> [port=5971] [scenarioFilter]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5971), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;
mkdirSync(out, { recursive: true });
const { TERRAIN_SCENARIOS } = await import('./terrainSets.mjs');
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const sc of TERRAIN_SCENARIOS.filter(s => !only || s.name.includes(only))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(120000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=${sc.seed ?? 7}`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await page.evaluate(() => window.__cb.store.getState().setQuality('medium'));
    await page.evaluate(() => { window.__done = 0; });
    await page.evaluate(s => new Function('cb', s)(window.__cb), sc.setup);
    await page.waitForFunction(() => window.__done === 1, null, { timeout: 120000 }).catch(() => console.error('setup never finished', sc.name));
    let n = 0;
    for (const s of sc.shots) {
      await page.evaluate(s => {
        const { store, cam, world } = window.__cb, st = store.getState();
        window.__cb.game.getState().setSpeed(0);
        st.setTimeOfDay(s.time ?? 11); st.setSeasonMode('summer'); st.setWeatherMode('clear');
        window.__cb.qa.pose = null; world.setEyeView?.(null);
        cam.target.set(world.camp.x, 0, world.camp.z); cam.yaw = 0.8; cam.pitch = 0.55; cam.radius = 40;
      }, s);
      for (let k = 0; k < 3; k++) {
        await page.evaluate(async () => { await window.__cb.qa.renderNow(); });
        await page.evaluate(s => new Function('cb', s.cam)(window.__cb), s);
      }
      await page.evaluate(() => window.__cb.qa.renderNow());
      const file = `${out}/${sc.name}-${s.name}.png`;
      await page.screenshot({ path: file });
      console.log(file);
    }
    await page.close();
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
