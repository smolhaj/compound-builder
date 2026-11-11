/**
 * The tilt-shift diorama look, photographed on the mountain showcase at High quality (`&lowrender`): the same aerial view with the look off and on,
 * a steeper one, and an eye-level view with a person (the look fades out there).
 *   flock /tmp/cb.lock node scripts/tiltShiftShots.mjs --out /tmp/x [--port 5741] [--serve]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5741)), outDir = resolve(opt('--out', 'shots/tilt'));
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const LOT = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}&showcase=mountain`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__showcase, null, { timeout: 900000 });
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(15); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
for (let i = 0; i < 14; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
const frames = async () => { await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.waitForTimeout(250); };
const shot = async name => { await frames(); await frames(); await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
const tilt = on => page.evaluate(on => { window.__cb.store.getState().setTiltShift(on); }, on);
const orbit = (r, pitch, yaw) => page.evaluate(([r, pitch, yaw]) => { const { world, cam } = window.__cb; window.__cb.qa.pose = null; const c = world.camp; cam.target.set(c.x, world.groundAt(c.x, c.z) + 0.3, c.z); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw]);
await orbit(30, 0.75, 0.6); await tilt(false); await shot('1-aerial-off'); await tilt(true); await shot('1b-aerial-on');
await orbit(18, 1.0, 0.9); await shot('2-steep-on'); await tilt(false); await shot('2b-steep-off');
await tilt(true);
await page.evaluate(() => { const { world } = window.__cb, c = world.camp, x = c.x + 2.5, z = c.z + 3; world.qaFigure(x - 0.3, z - 0.6); window.__cb.qa.pose = { x, y: world.groundAt(x, z) + 0.42, z, lx: c.x, ly: world.groundAt(c.x, c.z) + 0.35, lz: c.z, fov: 62 }; });
await shot('3-eye-level-on');
await browser.close(); vite?.kill();
process.exit(0);
