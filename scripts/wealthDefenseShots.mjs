/**
 * The gate card with and without defense spending, and the Idle-cash card with the tier-2 sinks (sim/deterrence.ts, sim/richSinks.ts).
 *   flock /tmp/cb.lock node scripts/wealthDefenseShots.mjs --out shots/wealthdefense [--port 5344]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5344)), out = resolve(opt('--out', 'shots/wealthdefense'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR', m.text().slice(0, 200)); });
let n = 0;
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(600); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
const crew = { id: 'qa-e1', kind: 'gang', day: 3, title: 'A work crew of eight men with a truck', dossier: ['Eight men, six rifles, a flatbed.', 'They have been working the county road for a week.'], size: 8, armed: true, strength: 80, temper: 'hard', wave: 1, stances: ['hide', 'parley', 'trade', 'defend'] };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { const G = window.__cb.game.getState(); G.setSpeed(0); window.__cb.store.getState().setQuality('low'); });
  await page.waitForTimeout(1500);
  // a family with a roof and a bunker-less compound: nothing bought for defense
  await page.evaluate(crew => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    g.structures.push({ id: 'qahome', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    g.gate.pending = structuredClone(crew);
    G.setState({ game: g });
  }, crew);
  await page.waitForTimeout(1200); await shot('gate-card-poor');
  // the same crew, after $300k of defense: guards, cameras, a gate house
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.money = 900000; g.stock.gate_house = 1; g.stock.cameras = 2; g.stock.thermal_cam = 1; G.setState({ game: g }); });
  await page.evaluate(() => { const G = window.__cb.game.getState(); G.hireGuard(); G.hireGuard(); G.hireGuard(); });
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.utilities.lit = ['qahome']; G.setState({ game: g }); });
  await page.waitForTimeout(1500); await shot('gate-card-rich');
  // the idle-cash card: a family with a roof and $900k, nothing in the way
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.gate.pending = null; g.stock.gate_house = 0; g.stock.cameras = 0; g.money = 1_400_000; G.setState({ game: g }); });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await page.getByText('Hide goals').first().click().catch(() => {});
  await page.waitForTimeout(1000); await shot('idle-cash-card');
} finally { await browser.close(); vite.kill(); }
