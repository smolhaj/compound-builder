/**
 * Animals crossing the county road with the traffic stopped for them, on open plains (no trees in the way). The animals and the car are
 * started with QA hooks (WildlifeRenderer.qaCross, RoadTraffic.qaDrive) and then stepped by the world's own update functions.
 *   flock /tmp/cb.lock node scripts/roadDeerShots.mjs --out /tmp/x [--port 5761] [--serve] [--sp deer] [--region plains]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5761)), outDir = resolve(opt('--out', 'shots/deer')), sp = opt('--sp', 'deer'), region = opt('--region', 'plains');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?lowrender=0.75&new&clean&seed=7&region=${region}`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__cb?.world, null, { timeout: 900000 });
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(6.4); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
for (let i = 0; i < 14; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
const shot = async name => { for (let i = 0; i < 2; i++) { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(250); } await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
const step = (n, dt = 0.1) => page.evaluate(([n, dt]) => { const { world, game } = window.__cb; const g = game.getState().game; let held = 0, on = 0, minGap = 99; for (let i = 0; i < n; i++) { world.updateWildlife(dt, g, 1); world.updateRoadLife(dt, g, 1); held = Math.max(held, world.roadLife.held); on = Math.max(on, world.wildlife.roadCrossers().length); } return { held, on, live: world.roadLife._live.map(l => +l.z.toFixed(2)), animals: world.wildlife.animals().filter(a => a.id.startsWith('road:')).map(a => ({ x: +a.x.toFixed(2), z: +a.z.toFixed(2), vis: +a.vis.toFixed(2) })) }; }, [n, dt]);
const gz = await page.evaluate(() => window.__cb.world.access.drive[0][1]);
await step(3);
// a southbound car comes down the road toward the crossing; the animals cross just south of the camera
await page.evaluate(([gz, sp]) => { const { world } = window.__cb; world.roadLife.qaDrive('pickup', gz + 12, -1, 1.4); world.wildlife.qaCross(sp, 3, gz, 1); }, [gz, sp]);
let seen = null;
for (let i = 0; i < 40; i++) {
  const r = await step(5);
  console.error(i, JSON.stringify({ held: r.held, on: r.on, live: r.live, n: r.animals.length }));
  if (r.on > 0 && r.held > 0 && !seen) {
    seen = r;
    await page.evaluate(gz => { const { world, cam } = window.__cb, x = world.county.x(gz); world.qaFigure(x + 1.1, gz - 2.2); cam.placeEye(x + 0.9, gz - 5, x, gz + 4, 0.34); }, gz);
    await shot('3-crossing-eye-traffic-stopped');
    await page.evaluate(gz => { const { world, cam } = window.__cb, x = world.county.x(gz); cam.target.set(x, world.groundAt(x, gz) + 0.1, gz); cam.radius = 9; cam.pitch = 0.6; cam.yaw = 1.0; }, gz);
    await shot('3b-crossing-aerial-traffic-stopped');
    break;
  }
}
console.error('captured while held:', !!seen, JSON.stringify(seen));
await browser.close(); vite?.kill();
process.exit(0);
