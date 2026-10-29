/**
 * Misty-valley shots on the hillside lot: aerial up the slope, an eye-level view with a person, and the view out over the fog from the camp.
 *   flock $SP/render.lock node scripts/mistShots.mjs --out shots/mist [--port 5420] [--preset misty|overcast|clear|drizzle] [--q medium|high] [--tod 7] [--doy 288]
 * Always ?lowrender (drawn on request); the frames are drawn at the full-quality look (`renderFull`), because Low has no fog at all.
 * Presets (the shots tooling's lighting presets; the default look is 10:00 clear, mid-August):
 *   clear     10:00, August, forced clear               (the old default, for before / after)
 *   misty     07:00, mid-October, the weather forced to fog: a valley fog bank under the camp, low cloud on the ridges, cool overcast light
 *   overcast  11:00, November, overcast: soft light, cool grade, cloud hugging the ridgelines
 *   drizzle   09:00, October, rain: mist and droplets near the camera
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PRESETS = {
  clear: { tod: 10, doy: 226, mode: 'clear', season: 'summer' },
  misty: { tod: 7, doy: 288, mode: 'fog', season: 'fall' },
  overcast: { tod: 11, doy: 315, mode: 'overcast', season: 'fall' },
  drizzle: { tod: 9, doy: 292, mode: 'rain', season: 'fall' },
};
const preset = { ...(PRESETS[opt('--preset', 'misty')] ?? PRESETS.misty) };
if (args.includes('--tod')) preset.tod = Number(opt('--tod'));
if (args.includes('--doy')) preset.doy = Number(opt('--doy'));
const port = Number(opt('--port', 5420)), outDir = resolve(opt('--out', 'shots/mist')), q = opt('--q', 'medium'), tag = opt('--tag', preset.mode);
const LOT = opt('--lot', 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (!args.includes('--no-serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
try {
  await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}${opt('--extra', '')}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow);
  await page.evaluate(p => { const { game, store } = window.__cb; window.__cb.qa.weather = true; game.getState().setSpeed(0); const s = store.getState(); s.setWeatherMode(p.mode); s.setSeasonMode(p.season); s.setTimeOfDay(p.tod); s.setDayOfYear(p.doy); s.setTimeOfDay(p.tod); }, preset);
  await page.waitForTimeout(1500);
  // let the weather layer and the valley fog arrive (they ease in over some seconds): step them instead of waiting
  await page.evaluate(p => { const { weather, valley } = window.__cb; for (let i = 0; i < 14; i++) weather.sim.update(5, p.season === 'summer' ? 'summer' : 'fall', p.tod, p.mode); }, preset);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__cb.valley.snap());
  const settle = async () => { for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); } };
  const shot = async name => {
    await settle();
    await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(300);
    const f = `${outDir}/${tag}-${name}.png`; await page.screenshot({ path: f }); console.log(f);
  };
  const info = await page.evaluate(() => { const { world } = window.__cb; return { camp: world.camp, campY: world.groundAt(world.camp.x, world.camp.z), fall: world.parcel.lot?.fall }; });
  console.log(JSON.stringify(info));
  const orbit = (r, pitch, yaw, dx = 0, dz = 0, lift = 0.8) => page.evaluate(([r, pitch, yaw, dx, dz, lift]) => { const { world, cam } = window.__cb, c = world.camp; const x = c.x + dx, z = c.z + dz; cam.target.set(x, world.groundAt(x, z) + lift, z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, dx, dz, lift]);
  const up = await page.evaluate(() => { const f = window.__cb.world.parcel.lot.fall; return Math.atan2(Math.cos(f), Math.sin(f)); });
  const only = opt('--only', 'aerial,wide,eye,valley').split(',');
  if (only.includes('aerial')) { await orbit(34, 0.5, up + 0.25); await shot('1-aerial'); }
  if (only.includes('wide')) { await orbit(70, 0.32, up - 0.4, 0, 0, 0); await shot('2-wide'); }
  if (only.includes('eye')) {
    await page.evaluate(() => {
      const { world, cam } = window.__cb, c = world.camp;
      const ps = world.family.positions(); const p = ps[0] ?? { x: c.x, z: c.z };
      const [ex, ez] = world.openSpotNear(p.x - 2.6, p.z + 1.4, 0.8);
      cam.placeEye(ex, ez, p.x, p.z, 0.45);
    });
    await shot('3-eye');
  }
  if (only.includes('valley')) {
    // from the camp, looking down the way the land falls toward the lowest ground (the valley the fog fills)
    const dir = await page.evaluate(() => {
      const { world } = window.__cb, c = world.camp; let best = 0, bh = 1e9;
      for (let a = 0; a < 360; a += 10) { let h = 0, n = 0; for (let r = 80; r <= 300; r += 20) { h += world.groundAt(c.x + r * Math.cos(a * Math.PI / 180), c.z + r * Math.sin(a * Math.PI / 180)); n++; } if (h / n < bh) { bh = h / n; best = a; } }
      return { a: best, h: bh };
    });
    console.log('lowest way', JSON.stringify(dir));
    await page.evaluate(d => {
      const { world, cam } = window.__cb, c = world.camp, ar = d.a * Math.PI / 180;
      const gy = world.groundAt(c.x, c.z);
      cam.placeEye(c.x, c.z, c.x + Math.cos(ar) * 120, c.z + Math.sin(ar) * 120, 0.5);
      cam.target.y = gy - 3;
    }, dir);
    await shot('4-valley');
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); if (vite) vite.kill();
process.exit(0);
