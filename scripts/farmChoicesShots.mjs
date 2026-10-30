// Farm choices: Supplies > Farm sub-tab, a field with no seed (the warning), the Shop's hybrid and heirloom seed cards.
//   flock <lock> node scripts/farmChoicesShots.mjs <outDir> [port=5944]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5944);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  const frames = async n => { for (let i = 0; i < (n ?? 2); i++) await page.evaluate(() => window.__cb.qa.renderNow()); };
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.9`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  await frames(3);
  await page.evaluate(async () => {
    const C = await import('/src/sim/crops.ts');
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0);
    const g = structuredClone(G.getState().game);
    g.structures = [];
    for (const [k, dx, dz] of [['timber_cabin', -3, -4], ['garden', -3.5, -8], ['field', 5, -10], ['field', 8, -10], ['root_cellar', 4, 3]]) g.structures.push({ id: 'cb' + k + dx, kind: k, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: -300 });
    for (const st of g.structures.filter(x => x.kind === 'field')) C.plotsOf(g)[st.id] = { kind: 'field', fert: 1, prev: null, prev2: null, crop: null, loads: 0, cover: false, settled: -1, planted: true };
    g.stock.seed = 1; g.stock.seed_heirloom = 0; g.stock.seed_saved = 0;
    g.money = 40000;
    const [w0, w1] = C.sowWindow(g);
    const doy = w1 + 10;
    g.clock.t = doy - g.clock.startDoy + 365 * 0 + 0.3; if (g.clock.t < 0) g.clock.t += 365;
    g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    G.setState({ game: g });
    G.getState().advance(0.011);
    void w0;
  });
  await frames(3);
  await page.getByText('Supplies', { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/01-supplies-stores.png` });
  await page.getByText('Farm', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Fields', exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/02-supplies-farm-fields-no-seed.png` });
  // the window closes: the second field comes up weedy
  await page.evaluate(async () => {
    const C = await import('/src/sim/crops.ts');
    const G = window.__cb.game;
    const g = structuredClone(G.getState().game);
    g.clock.t = C.sowWindow(g)[1] + 28 - g.clock.startDoy + 0.3; if (g.clock.t < 0) g.clock.t += 365;
    g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    G.setState({ game: g });
    G.getState().advance(1.2);
  });
  await frames(2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/03-fields-weedy.png` });
  // the Shop: hybrid and heirloom seed
  await page.evaluate(() => window.__cb.game.getState().openShop(true, 'food'));
  await page.waitForTimeout(400);
  await page.waitForTimeout(400);
  await page.evaluate(() => { const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent === 'Hybrid field seed'); e?.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/04-shop-seed-cards.png` });
  console.error('done');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
