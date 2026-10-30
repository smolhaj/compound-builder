/**
 * Blueprint view shots on the mountain showcase: aerial, mid-height and an eye-level shot with a person, with the view on.
 *   flock $SP/render.lock node scripts/blueprintShots.mjs --out shots/blueprint [--port 5441] [--serve] [--q medium]
 * Also reports the label count and the cost of the overlay (frame time with the view off and on).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5441)), outDir = resolve(opt('--out', 'shots/blueprint')), q = opt('--q', 'medium'), rings = Number(opt('--rings', 2));
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
await page.goto(`http://localhost:${port}/?lowrender=0.75&clean&seed=7&${LOT}&showcase=mountain&rings=${rings}&wall=stone&layout=shelf`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__showcase, null, { timeout: 900000 });
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(10); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
for (let i = 0; i < 14; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
const frames = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(300); };
const shot = async name => { await frames(); await frames(); await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
const info = await page.evaluate(() => { const cb = window.__cb, w = cb.world, g = cb.game.getState().game, f = w.parcel.lot.fall; return { camp: [w.camp.x, w.camp.z], up: Math.atan2(Math.cos(f), Math.sin(f)), gate: g.perimeter.flatMap(r => r.gates.map(x => r)).length }; });
const orbit = (r, pitch, yaw) => page.evaluate(([r, pitch, yaw, c]) => { const { world, cam } = window.__cb; cam.target.set(c[0], world.groundAt(c[0], c[1]) + 0.8, c[1]); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, info.camp]);
const frameMs = async () => page.evaluate(async () => { const cb = window.__cb, t = []; for (let i = 0; i < 9; i++) { const t0 = performance.now(); await cb.qa.renderNow(); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return Math.round(t[4]); });
await orbit(40, 0.55, info.up + 0.3);
// interleave off / on so a busy machine hits both the same
const setBp = on => page.evaluate(on => window.__cb.store.getState().setBlueprint(on), on);
const times = { off: [], on: [] };
for (const on of [false, true, false, true]) {
  await setBp(on); await page.waitForTimeout(900);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(100); }
  times[on ? 'on' : 'off'].push(await frameMs());
}
await setBp(true); await page.waitForTimeout(900);
// the overlay's own CPU: project and place every label, with the camera moving each call (the worst case), and the plan build
const own = await page.evaluate(() => { const cb = window.__cb, o = cb.blueprintOv; const t = []; for (let i = 0; i < 20; i++) { cb.cam.yaw += 0.01; cb.cam.apply(cb.ws.camera); const t0 = performance.now(); o.update(1e6 + i * 100); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return { updateMedianMs: +t[10].toFixed(2), updateMaxMs: +t[19].toFixed(2) }; });
const planMs = await page.evaluate(async () => { const m = await import('/src/game/blueprint/blueprintPlan.ts'); const g = window.__cb.game.getState().game; const t0 = performance.now(); m.blueprintPlan(g); return +(performance.now() - t0).toFixed(1); });
const off = times.off, on = times.on;
const labels = await page.evaluate(() => [...document.querySelectorAll('[data-testid=blueprint-labels] > div')].filter(d => d.style.visibility === 'visible').map(d => d.firstChild.textContent));
console.error(JSON.stringify({ frameMsOff: off, frameMsOn: on, ...own, planMs, labels: labels.length, sample: labels.slice(0, 40) }));
await shot('aerial');
await orbit(22, 0.9, info.up + 0.3); await shot('top');
const eye = await page.evaluate(() => { const cb = window.__cb, w = cb.world, ag = [...w.family._agents.values()].find(a => a.x !== undefined); if (!ag) return null; const rx = Math.sin(ag.rot ?? 0), rz = Math.cos(ag.rot ?? 0); const ex = ag.x - rx * 1.1 + rz * 0.3, ez = ag.z - rz * 1.1 - rx * 0.3; cb.cam.placeEye(ex, ez, ag.x, ag.z, 0.36); return { x: ag.x, z: ag.z }; });
console.error('eye person', JSON.stringify(eye));
await shot('eye');
await page.evaluate(() => window.__cb.store.getState().setBlueprint(false));
await orbit(40, 0.55, info.up + 0.3);
console.error('hidden labels after off:', await page.evaluate(() => document.querySelectorAll('[data-testid=blueprint-labels] > div').length));
await browser.close(); vite?.kill();
