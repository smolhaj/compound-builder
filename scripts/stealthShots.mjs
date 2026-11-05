// Stealth UI: the Defense tab Light discipline panel with the give-away readout, plain and under full stealth, desktop and phone width.
//   node scripts/stealthShots.mjs <outDir> [port=5945]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2] || 'shots/stealth', port = Number(process.argv[3] || 5945);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.4`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
  const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };
  // after the hit, a cold night, a lit house, stock and dogs
  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts'), he = await import('/src/sim/heating.ts'), pets = await import('/src/sim/pets.ts');
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, grid: 0 };
    g.structures.push({ id: 'qahome', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    g.utilities.lit = ['qahome']; g.stock.firewood = 40; g.stock.goat = 6; g.stock.pig = 3; g.stock.floodlights = 3; g.money = 90000;
    pets.adoptDog(g, { ageYears: 3, training: 80, guard: true });
    let best = 0, bt = 0;
    for (let d = 60; d < 560; d++) { g.clock.t = Math.floor(g.disaster.hitAt) + d + 0.9; const x = he.demandNow(g); if (x > best) { best = x; bt = g.clock.t; } }
    g.clock.t = bt; g.clock.ticks = Math.round(bt / (0.25 / 24));
    G.setState({ game: g });
  });
  const open = async () => { await page.getByText('Defense', { exact: true }).last().click(); await page.waitForTimeout(400); const el = page.getByText('Stealth', { exact: true }).first(); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); };
  await open();
  await shot('01-stealth-plain');
  await page.evaluate(async () => { const s = await import('/src/sim/stealth.ts'); window.__cb.game.getState().money(g => { s.setStealth(g, 'full', true); return null; }); });
  await page.waitForTimeout(400);
  await shot('02-stealth-full');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Show panels/ }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Family', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await open().catch(() => {});
  await shot('03-stealth-full-phone');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
