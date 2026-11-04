// Moat / covered bridge / vehicle yard shots with ?lowrender (cheap on-demand frames).
//   node scripts/defenseExtrasShots.mjs <outDir> [port=5993] [only]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5993), only = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;
mkdirSync(out, { recursive: true });
const { SETS } = await import('./shotSets.mjs');
const shots = SETS.defenseExtras.filter(s => !only || s.name.includes(only));
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => window.__cb.store.getState().setQuality('medium'));
  let n = 0;
  for (const s of shots) {
    await page.evaluate(s => {
      const { store, cam, world } = window.__cb, st = store.getState();
      window.__cb.game.getState().setSpeed(0);
      st.setTimeOfDay(s.time ?? 10); st.setSeasonMode(s.season ?? 'auto'); st.setWeatherMode(s.weather ?? 'clear');
      window.__cb.qa.pose = null; st.setBuildingView?.('full');
      const c = s.cam; world.setEyeView?.(null); cam.target.set(c.x, 0, c.z); cam.yaw = c.yaw; cam.pitch = c.pitch; cam.radius = c.radius;
      if (s.setup) new Function('cb', s.setup)(window.__cb);
    }, s);
    await page.evaluate(async () => { for (let i = 0; i < 4; i++) await window.__cb.qa.renderNow(); });
    await page.evaluate(s => { if (s.setup) new Function('cb', s.setup)(window.__cb); }, s);
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) await window.__cb.qa.renderNow(); });
    const file = `${out}/${String(++n).padStart(2, '0')}-${s.name}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
