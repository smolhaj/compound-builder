// Animal turntable contact sheets, fast: only the real LivestockRenderer on a neutral ground, no game.
//   flock /tmp/cb.lock node scripts/animalSheet.mjs <outDir> [kinds=cow,steer,...] [query=pose=stand&lod=0] [port=5994]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], kinds = (process.argv[3] || 'cow,steer,goat,sheep,pig,rabbit,hen,rooster').split(','), queries = (process.argv[4] || '').split(';'), port = Number(process.argv[5] || 5994);
mkdirSync(out, { recursive: true });

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.setDefaultTimeout(90000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text().slice(0, 600)); });
  for (const extra of queries) for (const k of kinds) {
    const ex = new URLSearchParams(extra), cw = Number(ex.get('cw') || 360), nviews = (ex.get('view') || 'side,front,rear,top').split(',').length;
    await page.setViewportSize({ width: nviews * cw, height: 4 * Math.round(cw * 0.72) });
    const rooster = k === 'rooster', kind = rooster ? 'hen' : k;
    await page.goto(`http://localhost:${port}/scripts/animalviewer.html?kind=${kind}${rooster ? '&rooster=1' : ''}&${extra}`);
    await page.waitForFunction(() => window.__done);
    const f = `${out}/${k}${extra ? '-' + extra.replace(/[^a-z0-9]+/gi, '_') : ''}.png`;
    await page.locator('canvas').screenshot({ path: f });
    console.log(f);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
