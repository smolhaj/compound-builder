// The Build drawer's Enclosure group (layout A) with the hover bill, as the player sees it.
//   flock /tmp/cb.lock node scripts/domeBuildUiShots.mjs <outDir> [port=5975]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5975);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const click = async (name) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(350); };
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender&layout=a&region=mountain_west`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await click('Next'); await click('Next'); await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setWelcome(false); const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.0; });
  await page.waitForTimeout(1200);
  await page.getByTestId('bar-build').click(); await page.mouse.move(700, 500); await page.waitForTimeout(350);
  await page.getByTestId('build-chips').getByRole('button', { name: 'Enclosure', exact: true }).click(); await page.waitForTimeout(400);
  await page.mouse.move(700, 500);
  await shot('enclosure-poor');
  const cards = page.locator('[data-testid="build-card"]');
  await cards.nth(1).hover(); await page.waitForTimeout(500); await shot('hover-geodesic');
  await page.mouse.move(700, 600);
  await cards.nth(3).hover(); await page.waitForTimeout(500); await shot('hover-arcology-gated');
  // a Founder: $12M in the bank unlocks the glass dome; a Magnate: $80M the arcology
  await page.evaluate(() => window.__cb.game.setState(s => ({ game: { ...s.game, money: 80_000_000 } })));
  await page.mouse.move(700, 600); await page.waitForTimeout(500);
  await cards.nth(2).hover(); await page.waitForTimeout(500); await shot('hover-glass');
  await page.mouse.move(700, 600);
  await cards.nth(3).hover(); await page.waitForTimeout(500); await shot('hover-arcology');
} finally { await browser.close(); vite.kill(); }
