/** Family panel with the Cozy starvation warning: node scripts/starveShot.mjs --out shots/starve [--port 5341] */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5341)), out = resolve(opt('--out', 'shots/starve'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => {
    const st = window.__cb.game.getState(); st.setSpeed(0);
    const g = st.game; g.disaster.difficulty = 'cozy';
    g.personState.forEach((ps, i) => { ps.needs.hunger = 60000 + i * 20000; ps.needs.starved = [0, 34, 71, 112, 40, 5][i] ?? 0; });
    window.__cb.game.setState({ game: { ...g } });
  });
  await page.waitForTimeout(1200);
  const tab = page.getByRole('button', { name: /^Family/ }).first();
  if (await tab.count()) await tab.click().catch(() => {});
  await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/family-starving.png` });
  console.log('shot', `${out}/family-starving.png`);
} finally { await browser.close(); vite.kill(); }
