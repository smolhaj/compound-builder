// Dog contact sheets, fast: only the dog (the real DogRenderer) beside a 0.28-tall person, no game.
//   node scripts/dogViewer.mjs <outDir> [port=5996] [breeds=shepherd,lab,hound,collie,terrier,mutt] [tone=0]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const extra = process.env.DOGQ || '';
const out = process.argv[2], port = Number(process.argv[3] || 5996), breeds = (process.argv[4] || 'shepherd,lab,hound,collie,terrier,mutt').split(','), tone = process.argv[5] || '0';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: Number(new URLSearchParams(extra).get('cw') || 420) * 3, height: new URLSearchParams(extra).get('sheet') === 'one' ? Math.round(Number(new URLSearchParams(extra).get('cw') || 420) * 290 / 420) : 1450 } });
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  for (const b of breeds) {
    await page.goto(`http://localhost:${port}/scripts/dogviewer.html?breed=${b}&tone=${tone}${extra}`);
    await page.waitForFunction(() => window.__done);
    const f = `${out}/${b}-${tone}${extra ? '-' + extra.replace(/[^a-z0-9]+/gi, '_') : ''}.png`;
    await page.locator('canvas').screenshot({ path: f });
    console.log(f);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
