// Fortress reputation UI: the Defense tab readout for an open place and a walled, guarded one, desktop and phone width.
//   node scripts/reputationShots.mjs <outDir> [port=5946]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2] || 'shots/reputation', port = Number(process.argv[3] || 5946);
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
  await page.evaluate(async () => {
    const per = await import('/src/sim/perimeter.ts');
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    g.structures.push({ id: 'qahome', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    g.money = 90000;
    G.setState({ game: g });
    window.__qa = { per };
  });
  await page.evaluate(async () => { const gd = await import('/src/sim/guards.ts'); const G = window.__cb.game; G.getState().money(g => { gd.hireGuard(g); gd.hireGuard(g); return null; }); });
  const open = async () => { await page.getByText('Defense', { exact: true }).last().click(); await page.waitForTimeout(400); const el = page.getByText('Reputation on the county road').first(); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); };
  await open();
  await shot('01-reputation-guards-only');
  await page.evaluate(() => window.__cb.game.setState(s => {
    const g = structuredClone(s.game);
    const r = window.__qa.per.planRun(g, 'stone_wall', [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]]); r.finishedAt = 0; r.done = r.hours; r.supplied = true;
    g.gate.respect = 0.7; g.gate.tookIn = 6; g.gate.humanity = 92;
    g.neighbors.forEach(n => { n.status = 'home'; n.members = 3; n.disposition = 15; });
    return { game: g };
  }));
  await page.waitForTimeout(500);
  await shot('02-reputation-fortress');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Show panels/ }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Family', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await open().catch(() => {});
  await shot('03-reputation-fortress-phone');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
