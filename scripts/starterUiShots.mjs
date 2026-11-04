/**
 * Starter compound through the real HUD: new game by the wizard, click the card's buttons (Cancel, x on a row, One by one, Place all),
 * order, advance days. Screenshots the whole 1280x800 page at each step; prints console errors.
 *   flock $SP/render.lock node scripts/starterUiShots.mjs --out shots/starterui [--port 5340]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5340)), out = resolve(opt('--out', 'shots/starterui'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const issues = [];
page.on('pageerror', e => { issues.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') { issues.push(m.text().slice(0, 200)); console.log('CONSOLE ERROR', m.text().slice(0, 200)); } });
let n = 0;
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(500); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log('shot', f); };
const st = () => page.evaluate(() => { const g = window.__cb.game.getState().game; return { t: Math.floor(g.clock.t), money: Math.round(g.money), structures: g.structures.map(s => s.kind + (s.finishedAt !== null ? '*' : '')), runs: g.perimeter.length, tool: window.__cb.game.getState().tool, preview: window.__cb.store.getState().starterPreview?.pieces.filter(p => !p.later).length ?? null }; });
const click = async (name, exact = true) => { await page.getByRole('button', { name, exact }).first().click(); await page.waitForTimeout(400); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { const g = window.__cb.game.getState(); g.setSpeed(0); window.__cb.store.getState().setQuality('low'); const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 20; cam.pitch = 1.0; cam.yaw = 0.5; });
  await page.waitForTimeout(1500);
  console.log('start', JSON.stringify(await st()));
  // the Build tab
  const buildTab = page.getByRole('button', { name: /^Build/ }).first();
  if (await buildTab.count()) await buildTab.click().catch(() => {});
  await page.getByText('Get operational').waitFor();
  await shot('1-card-first-run');
  await click('Lay out a starter compound');
  await shot('2-preview');
  console.log('after open', JSON.stringify(await st()));
  // x on a row (the garden), then put it back
  await page.getByRole('button', { name: '×', exact: true }).nth(1).click(); await page.waitForTimeout(500);
  await shot('3-garden-left-out');
  console.log('after x', JSON.stringify(await st()));
  await page.getByRole('button', { name: '+' }).first().click(); await page.waitForTimeout(500);
  // Cancel
  await click('Cancel');
  await shot('4-cancelled');
  console.log('after cancel', JSON.stringify(await st()));
  // One by one: two pieces
  await click('Lay out a starter compound');
  await click('One by one');
  await shot('5-one-by-one');
  await page.getByRole('button', { name: /^Place / }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Place / }).first().click(); await page.waitForTimeout(600);
  await shot('6-two-placed');
  console.log('after two', JSON.stringify(await st()));
  await click('Done');
  // Place all of the rest
  await click('Lay out a starter compound');
  await shot('7-preview-rest');
  await click('Place all');
  await page.waitForTimeout(800);
  await shot('8-placed-all');
  console.log('after place all', JSON.stringify(await st()));
  const ord = page.getByRole('button', { name: /Order what the plans need/ });
  console.log('order offered', await ord.count());
  if (await ord.count()) { await ord.first().click(); await page.waitForTimeout(500); }
  await shot('9-ordered');
  // advance days
  for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__cb.game.getState().advance(30)); await page.waitForTimeout(300); }
  console.log('after 180 days', JSON.stringify(await st()));
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  await shot('10-after-days');
} catch (e) { console.log('ERR', e.message); await page.screenshot({ path: `${out}/err.png` }); }
console.log('issues', JSON.stringify(issues));
await browser.close(); vite.kill(); process.exit(0);
