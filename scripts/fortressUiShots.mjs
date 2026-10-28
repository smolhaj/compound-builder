// Fortify my ring plan screen and the Defense tab rows, HUD visible, ?lowrender.
//   flock <lock> node scripts/fortressUiShots.mjs <outDir> [port=5943]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5943);
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
  const render = () => page.evaluate(() => window.__cb.qa.renderNow());
  await render();
  const shot = async name => { await render(); await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };
  // the plan screen (core compound first, then the full property line)
  const open = page.getByRole('button', { name: /Fortify my ring/ }).first();
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await page.waitForTimeout(500);
  await shot('01-fortify-plan-core');
  await page.getByText('Expand to the full property line').first().click();
  await page.waitForTimeout(300);
  await shot('02-fortify-plan-full');
  await page.getByText(/^Core compound$/).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Lay it out/ }).first().click();
  await page.waitForTimeout(500);
  await shot('03-fortify-laid');
  // finish everything, then the Defense tab
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game);
    for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
    for (const st of g.structures) if (st.kind === 'gate_garage' || st.kind.startsWith('watchtower')) { st.stage = 5; st.supplied = false; st.finishedAt = 0; st.permit = 'ok'; }
    return { game: g }; }));
  await page.getByText('Defense', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await shot('04-defense-top');
  for (const [name, text] of [['05-defense-walkway', 'Wall-top walkway'], ['06-defense-watching', 'Towers on the ring']]) {
    const el = page.getByText(text).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(name);
  }
  // before the ring is finished: the Build tab's Enclose card steps
  await page.getByText('Build', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await shot('07-build-enclose-card');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
