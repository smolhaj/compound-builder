/**
 * The signature goal card in the real app (FL5, docs/FELT_LAYER.md 5.5): the Build tab's card swapped for each kind's chain.
 *   node scripts/goalShots.mjs [--kinds solar_flare,mega_quake,dam_flood,nuclear,pandemic] [--port 5977] [--out /tmp/claude-0/goals]
 * A kind can be `kind@offset` (days from the hit; default -1 = warning) and `+done` fakes the first step by stocking its state.
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
const port = Number(opt('--port', 5977));
const outDir = resolve(opt('--out', '/tmp/claude-0/goals'));
const kinds = opt('--kinds', 'solar_flare,mega_quake,dam_flood,nuclear,pandemic').split(',');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
  await page.waitForFunction(() => window.__cb?.game && window.__cb?.qa, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  await page.getByRole('button', { name: /^Build/ }).first().click().catch(() => undefined);
  for (const spec of kinds) {
    const [kindPart, flag] = spec.split('+');
    const [kind, off] = kindPart.split('@');
    const day = off === undefined ? -1 : Number(off);
    await page.evaluate(([kind, day, flag]) => {
      window.__cb.game.getState().money(d => {
        d.disaster.kind = kind; d.disaster.warnAt = 0; d.disaster.hitAt = 3;
        d.clock.t = d.disaster.hitAt + day;
        d.money = 4200;
        if (flag === 'done') { d.utilities.off.push('x'); d.stock.water_jugs = 30; d.stock.fuel = 6; d.stock.radios = 1; d.stock.seed = 6; }
        return null;
      });
    }, [kind, day, flag ?? '']);
    await page.waitForSelector('[data-testid="goals-card"], [data-testid="goals-set"]', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => { const c = document.querySelector('[data-testid="goals-card"]'); return c ? { head: c.querySelector('span')?.textContent, text: c.textContent?.slice(0, 160) } : null; });
    console.log(spec, JSON.stringify(info));
    const box = await page.evaluate(() => { const c = document.querySelector('[data-testid="goals-card"], [data-testid="goals-set"]'); const r = c?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });
    const clip = box ? { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: Math.min(560, 1440 - Math.max(0, box.x - 20)), height: Math.min(520, 810 - Math.max(0, box.y - 20)) } : undefined;
    await page.screenshot({ path: `${outDir}/goal-${spec.replace(/[@+]/g, '_')}.png`, ...(clip ? { clip } : {}) });
  }
  await page.screenshot({ path: `${outDir}/full.png` });
  console.log('errors', JSON.stringify(errs.slice(0, 5)));
} finally { await browser.close(); vite.kill(); }
