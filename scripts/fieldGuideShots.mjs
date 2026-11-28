/**
 * Field Guide frames (the in-game player manual, drawer key I). Starts a new game through the wizard, then opens the guide:
 * the first section, a table section (Shop), search, and the Esc order (clears the search, then closes the drawer).
 *   flock /tmp/cb.lock node scripts/fieldGuideShots.mjs <outDir> [port]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const [out = '/tmp/fieldguide', portArg = '5983'] = process.argv.slice(2);
const port = Number(portArg);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
page.setDefaultTimeout(30000);
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
let n = 0;
const shot = async name => { await page.waitForTimeout(500); await page.evaluate(() => window.__cb.qa.renderNow()).catch(() => {}); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f, timeout: 120000 }); console.log('shot', f); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender&looktier=high`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.getByRole('button', { name: /Mountain West/ }).first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(800);
  const cards = page.locator('button', { hasText: /acres/ }).filter({ hasText: /Leaves \$/ });
  if (await cards.count()) await cards.first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Scenario/ }).click();
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 26; cam.pitch = 1.0; cam.yaw = 0.3; });
  const open = () => page.getByTestId('field-guide').count();
  await page.keyboard.press('KeyI'); await page.waitForTimeout(600);
  console.log('open after I:', await open());
  await shot('guide-welcome');
  await page.getByTestId('guide-chip-pillars').click(); await shot('guide-pillars');
  await page.getByTestId('guide-chip-shop').click(); await page.waitForTimeout(300); await shot('guide-shop-tables');
  await page.getByTestId('guide-chip-raids').click(); await shot('guide-raids');
  await page.getByTestId('guide-search').fill('tornado'); await shot('guide-search-tornado');
  const state = async tag => console.log(tag, 'guide open:', await open(), 'query:', JSON.stringify(await page.getByTestId('guide-search').inputValue().catch(() => null)), 'welcome up:', await page.getByText('The clock is paused').count());
  await state('typed');
  await page.getByTestId('guide-search').press('Escape'); await page.waitForTimeout(300); await state('Esc 1 (in the box)');
  await page.getByTestId('guide-search').press('Escape'); await page.waitForTimeout(300); await state('Esc 2 (in the box, empty)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await state('Esc 3');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await state('Esc 4');
  await shot('guide-closed');
  await page.getByTestId('top-menu').click(); await page.waitForTimeout(300); await shot('top-menu-field-guide');
  await page.getByRole('menuitem', { name: 'Field Guide' }).click(); await page.waitForTimeout(500);
  console.log('open from menu:', await open());
  await shot('guide-from-menu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); console.log('Esc closes from menu-opened:', !(await open()));
} finally { await browser.close(); vite.kill(); }
