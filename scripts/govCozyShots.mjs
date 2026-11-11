/**
 * House rules card (Family tab) and the Cozy comfort tier (Land tab, Paperwork), 1280x800.
 *   node scripts/govCozyShots.mjs [--port 5263] [--out shots/govcozy]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5263));
const outDir = resolve(opt('--out', 'shots/govcozy'));
mkdirSync(outDir, { recursive: true });

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [tag, vp] of [['desk', { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.setDefaultTimeout(240000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
    const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
    const shot = async (name) => { await frames(2); await page.screenshot({ path: `${outDir}/${tag}-${name}.png` }); console.log(tag, name); };
    await page.evaluate(() => { const cb = window.__cb, g = cb.game.getState().game;
      g.disaster.difficulty = 'cozy'; g.stats.days = 800; g.money = 420000;
      const base = g.people.find(p => !p.kid), bps = g.personState[g.people.indexOf(base)];
      for (let k = 0; k < 14; k++) { const p = structuredClone(base); p.id = `x${k}`; p.first = ['Dana', 'Moe', 'Ines', 'Tobias', 'Rue', 'Walt', 'Cass', 'Odell', 'Pia', 'Hank', 'Lena', 'Abe', 'Nora', 'Gus'][k]; p.kin = k >= 7; p.origin = k < 7 ? { kind: 'stranger', since: 0 } : undefined; g.people.push(p); g.personState.push({ ...structuredClone(bps), id: p.id }); }
      g.paper.comfort = 'comfortable';
      cb.game.setState({ game: { ...g } }); });
    await frames(3);
    await page.getByRole('button', { name: /^Family/ }).first().click();
    await page.getByText('House rules').first().scrollIntoViewIfNeeded();
    await shot('1-house-rules');
    await page.getByRole('button', { name: /Vote: Open door/ }).first().click();
    await frames(2);
    await page.getByText('House rules').first().scrollIntoViewIfNeeded();
    await shot('2-after-vote');
    await page.getByRole('button', { name: /^Land/ }).first().click();
    await page.getByText('Comfort:').first().scrollIntoViewIfNeeded();
    await shot('3-comfort-tier');
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
