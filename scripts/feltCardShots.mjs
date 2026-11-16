/**
 * The felt decision card in the real app: for each kind, jump to the hit, raise the day's card, and shoot it with the HUD up at 1100 x 700
 * (and a second pass with a poor family so the unavailable-option text shows). Checks the card fits the viewport (no clipped buttons).
 *   node scripts/feltCardShots.mjs [--kinds grid_down,pandemic,mega_quake] [--port 5975] [--out shots/felt-cards] [--w 1100 --h 700]
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
const port = Number(opt('--port', 5975)), kinds = opt('--kinds', 'grid_down,pandemic,mega_quake').split(',');
const W = Number(opt('--w', 1100)), H = Number(opt('--h', 700));
const outDir = resolve(opt('--out', 'shots/felt-cards'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => { bad++; console.error('pageerror:', e.message); });
  await page.goto(`http://localhost:${port}/?seed=7&lowrender`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  for (const kind of kinds) for (const [tag, money, step] of [['rich', 90000, 0], ['poor', 40, 1]]) {
    await page.evaluate(async ([kind, money, step]) => {
      const { triggerDisaster } = await import('/src/sim/disaster.ts');
      const { feltCards } = await import('/src/sim/felt/cards.ts');
      const { feltSpec } = await import('/src/sim/felt/registry.ts');
      const G = window.__cb.game;
      window.__cb.store.setState({ hudHidden: false });
      G.setState(s => {
        const g = structuredClone(s.game);
        g.disaster.mode = 'god'; g.disaster.phase = 'peace'; g.disaster.fx = undefined; g.gate.pending = null; g.gate.card = null;
        triggerDisaster(g.disaster, g.clock.t, kind, g.seed, 0);
        g.clock.t = g.disaster.hitAt + step; g.clock.speed = 0; g.money = money;
        feltCards(g, { day: step, r: () => 0.5, once: () => true }, feltSpec(kind));
        return { game: g, resumeTo: null, dayCard: null };
      });
    }, [kind, money, step]);
    await page.waitForSelector('[role=dialog]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    const fit = await page.evaluate(() => { const e = document.querySelector('[role=dialog]'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, scrolls: e.scrollHeight > e.clientHeight }; });
    const f = `${outDir}/${kind}-${tag}.png`;
    await page.screenshot({ path: f });
    console.log(f, JSON.stringify(fit));
    if (!fit || fit.top < 0 || fit.bottom > fit.h) { bad++; console.error('card not fully in view:', kind, tag); }
  }
} finally { await browser.close(); vite.kill(); }
process.exit(bad ? 1 : 0);
