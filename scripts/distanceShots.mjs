/**
 * Distance views: eye level across the valley, an aerial and a wide high view at chosen hours, in a region, plus what the main pass draws
 * (draw calls and triangles after frustum culling) for each view. Serves a built dist with `vite preview`.
 *   flock /tmp/cb.lock timeout 340 node scripts/distanceShots.mjs --dist dist --out /tmp/x [--region pnw] [--times 7,12,18.5,23] [--tier high] [--views eye,aerial,wide] [--tilt]
 * Regions: pnw (hillside lot, the mountain showcase's), mountain_west, coast, plains, appalachia, desert, midwest ...
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 4311)), outDir = resolve(opt('--out', 'shots/distance')), dist = opt('--dist', 'dist'), region = opt('--region', 'pnw'), tier = opt('--tier', 'high');
const times = opt('--times', '7,12,18.5,23').split(',').map(Number), views = opt('--views', 'eye,aerial,wide').split(','), tag = opt('--tag', region);
mkdirSync(outDir, { recursive: true });
const LOT = region === 'pnw' ? 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600' : `region=${region}`;
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { srv.stdout.on('data', d => /localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, '')) && ok()); srv.on('exit', c => no(new Error('preview exited ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto(`http://localhost:${port}/?lowrender=0.75&looktier=${tier}&clean&seed=7&${LOT}`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow);
await page.evaluate(([tier]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); const s = store.getState(); s.setQuality(tier); s.setWeatherMode('clear'); s.setSeasonMode('summer'); }, [tier]);
for (let i = 0; i < 10; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(100); }
console.error('loaded', Date.now() - t0, 'ms');
const stats = {};
const draw = async name => {
  await page.evaluate(q => window.__cb.qa.renderFull(q), tier); await page.evaluate(q => window.__cb.qa.renderFull(q), tier);
  stats[name] = await page.evaluate(() => { const cb = window.__cb, r = cb.ws.renderer; r.info.autoReset = false; r.info.reset(); r.render(cb.ws.scene, cb.ws.camera); const i = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = true; return i; });
  await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name, JSON.stringify(stats[name]));
};
// the bearing with the highest ground 600 units out: look across the valley at that range
const bearing = await page.evaluate(() => { const w = window.__cb.world, c = w.camp; let best = 0, bh = -1e9; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, h = w.groundAt(c.x + Math.cos(a) * 600, c.z + Math.sin(a) * 600); if (h > bh) { bh = h; best = a; } } return best; });
for (const h of times) {
  await page.evaluate(h => { const cb = window.__cb; cb.store.getState().setTimeOfDay(h); }, h);
  for (const v of views) {
    await page.evaluate(([v, a]) => {
      const cb = window.__cb, w = cb.world, c = w.camp, cam = cb.cam;
      if (v === 'eye') {
        const [ex, ez] = w.openSpotNear(c.x - Math.cos(a) * 3, c.z - Math.sin(a) * 3, 0.4);
        const y = w.groundAt(ex, ez) + 0.5;
        cb.qa.pose = { x: ex, y, z: ez, lx: ex + Math.cos(a) * 800, ly: y + 25, lz: ez + Math.sin(a) * 800, fov: 55 };
      } else {
        cb.qa.pose = null;
        cam.target.set(c.x, w.groundAt(c.x, c.z) + 1, c.z); cam.yaw = Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI + 0.25;
        if (v === 'aerial') { cam.radius = 150; cam.pitch = 0.42; } else { cam.radius = 520; cam.pitch = 0.2; }
      }
    }, [v, bearing]);
    await draw(`${tag}-${tier}-h${String(h).replace('.', '_')}-${v}`);
    if (args.includes('--tilt') && v === 'aerial') {
      await page.evaluate(() => window.__cb.store.getState().setTiltShift(true)); await draw(`${tag}-${tier}-h${String(h).replace('.', '_')}-${v}-tilt`);
      await page.evaluate(() => window.__cb.store.getState().setTiltShift(false));
    }
  }
}
writeFileSync(`${outDir}/${tag}-${tier}-stats.json`, JSON.stringify(stats, null, 1));
await browser.close(); srv.kill();
process.exit(0);
