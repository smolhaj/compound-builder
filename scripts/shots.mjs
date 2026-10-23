/**
 * QA screenshot harness (ported in spirit from UE's Playwright shots).
 *
 *   node scripts/shots.mjs [setName] [--out dir] [--quality medium]
 *
 * Starts its own Vite dev server, opens the game with ?clean (no HUD), drives
 * the scene through window.__cb and saves 1280×800 PNGs. Each shot sets the
 * time, season, weather and camera explicitly. Swiftshader is slow: give the
 * scene a few frames to settle (PMREM bake, shadows) before each capture.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const setName = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? 'basic';
const outDir = resolve(opt('--out', `shots/${setName}`));
const quality = opt('--quality', 'medium');
const port = Number(opt('--port', 5199));
mkdirSync(outDir, { recursive: true });

const { SETS } = await import('./shotSets.mjs');
const shots = SETS[setName];
if (!shots) { console.error(`unknown set ${setName}; have ${Object.keys(SETS).join(', ')}`); process.exit(1); }

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?clean&seed=${opt('--seed', '7')}`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 60000 });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  for (const [i, s] of shots.entries()) {
    await page.evaluate(s => {
      const { store, cam, world } = window.__cb;
      const st = store.getState();
      st.setHourSeconds(0);
      st.setTimeOfDay(s.time ?? 10);
      if (s.season) st.setSeason(s.season);
      world.setWeatherOverride?.(s.weather ?? null);
      const c = s.cam;
      if (c.eye) {
        // eye level: stand at (x, z), look toward (lx, lz)
        world.setEyeView?.(c);
      } else {
        world.setEyeView?.(null);
        cam.target.set(c.x, 0, c.z);
        cam.yaw = c.yaw; cam.pitch = c.pitch; cam.radius = c.radius;
      }
      if (s.setup) new Function('cb', s.setup)(window.__cb);
    }, s);
    await page.waitForTimeout(s.settle ?? 2500);
    const file = `${outDir}/${String(i + 1).padStart(2, '0')}-${s.name}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
