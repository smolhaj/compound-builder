// The Footpaths panel in the Build menu (HUD included), over the lived-in compound.
//   flock <lock> node scripts/livedUiShot.mjs <outDir> [port=5963] [age=year3]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5963), age = process.argv[4] || 'year3';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?lowrender=0.4&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  const frames = async () => page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
  await frames();
  await page.evaluate(async age => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0);
    const g = structuredClone(G.getState().game);
    g.structures = [];
    for (const [kind, dx, dz, rot] of [['farmhouse', -3, -4, 0], ['cottage', 4.5, -4.5, 0], ['workshop', 7, 4.5, 3], ['barn', -8.5, -7.5, 0], ['chicken_coop', -8, -1.5, 1], ['garden', -3.5, -9, 0], ['outhouse', 8, -2, 3], ['well_hand', 0.5, 4.5, 0]]) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz + 5, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    g.clock.t = (age === 'day1' ? 2 : 3 * 365 + 120) + 0.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.stock.fieldstone = 3;
    G.setState({ game: g });
    for (let i = 0; i < 4; i++) await cb.qa.renderNow();
  }, age);
  await frames();
  await page.getByText('Footpaths…').click();
  await frames();
  await page.screenshot({ path: `${out}/ui-footpaths-${age}.png` });
  console.error('shot');
  // lay everything it can with what is in the stock after ordering: set the stock and click the lay button
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.stock.fieldstone = 40; G.setState({ game: g }); });
  await frames();
  await page.getByRole('button', { name: /Lay paths between my buildings/ }).click();
  await frames(); await frames();
  await page.screenshot({ path: `${out}/ui-footpaths-laid-${age}.png` });
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.store.getState().setHudHidden(true); cb.qa.pose = null; cb.cam.target.set(c.x, cb.world.groundAt(c.x, c.z) + 0.2, c.z + 4); cb.cam.radius = 18; cb.cam.pitch = 0.8; cb.cam.yaw = 0.5; });
  await frames();
  await page.screenshot({ path: `${out}/laid-gravel-aerial-${age}.png` });
  console.error('done');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
