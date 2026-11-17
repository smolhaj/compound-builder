/**
 * The stone-faced road banks, photographed from above and at eye level on hillside lots.
 *   flock /tmp/cb.lock node scripts/roadBankShots.mjs --out shots/roadbank [--regions mountain_west,pnw,appalachia] [--port 5612]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5612)), outDir = resolve(opt('--out', 'shots/roadbank')), regions = opt('--regions', 'mountain_west,pnw,appalachia').split(',');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const region of regions) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(900000);
    page.on('pageerror', e => console.error('PAGEERROR', e.message));
    await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&region=${region}&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__showcase, null, { timeout: 900000 });
    await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(10); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
    for (let i = 0; i < 10; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
    const shot = async name => { for (let i = 0; i < 2; i++) { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(250); } await page.screenshot({ path: `${outDir}/${region}-${name}.png` }); console.error('shot', region, name); };
    const info = await page.evaluate(() => { const p = window.__cb.world.plan; const w = [...p.walls].sort((a, b) => (b.s1 - b.s0) * b.heightU - (a.s1 - a.s0) * a.heightU)[0]; const s = w ? (w.s0 + w.s1) / 2 : p.pts.at(-1).s / 2; let i = 0; while (i < p.pts.length - 2 && p.pts[i + 1].s < s) i++; return { walls: p.walls.length, wall: w ?? null, s, x: p.pts[i].x, z: p.pts[i].z, len: p.pts.at(-1).s }; });
    console.error(region, JSON.stringify(info));
    await page.evaluate(([x, z]) => { const { world, cam } = window.__cb; window.__cb.qa.pose = null; cam.target.set(x, world.groundAt(x, z) + 0.3, z); cam.radius = 14; cam.pitch = 0.9; cam.yaw = 0.6; }, [info.x, info.z]);
    await shot('aerial');
    await page.evaluate(([s]) => {
      const { world } = window.__cb, P = world.plan.pts;
      const at = ss => { let i = 0; while (i < P.length - 2 && P[i + 1].s < ss) i++; const a = P[i], b = P[i + 1], t = Math.max(0, Math.min(1, (ss - a.s) / Math.max(1e-6, b.s - a.s))); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t }; };
      const c = at(s), a = at(s - 0.6), b = at(s + 0.6), tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
      const m = at(s + 1.4); world.qaFigure(m.x + nx * 0.2, m.z + nz * 0.2);
      const cx = c.x - tx / tl * 3.5 + nx * 0.25, cz = c.z - tz / tl * 3.5 + nz * 0.25, look = at(s + 2);
      window.__cb.qa.pose = { x: cx, y: Math.max(world.groundAt(cx, cz), c.y - 0.3) + 0.45, z: cz, lx: look.x, ly: look.y + 0.05, lz: look.z, fov: 62 };
    }, [info.s]);
    await shot('eye');
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
