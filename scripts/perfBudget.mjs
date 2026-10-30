// Performance budget check (CI-runnable, no GPU): loads the mountain showcase headless at each quality tier with `&lowrender&looktier=<tier>`
// (the world is built at that tier, nothing is drawn every frame), counts what the scene would send to the GPU from the scene graph
// (src/game/perfCensus.ts) and compares it with scripts/perfBudget.json. Exit 1 when a count is over its budget.
//
//   node scripts/perfBudget.mjs [--tiers low,medium,high] [--print]   (--print: just show the numbers, e.g. to set a new budget)
//   needs a built app (`npm run build`) and playwright with chromium; the budget and how to change it: docs/DECISIONS.md
//
// Counts are deterministic (seeded world); load time is JS-only (no GL) and noisy, so it only fails at a wide margin (`loadMsFail`).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const tiers = opt('--tiers', 'low,medium,high').split(','), port = Number(opt('--port', 4195)), printOnly = args.includes('--print');
const budget = JSON.parse(readFileSync(new URL('./perfBudget.json', import.meta.url), 'utf8'));
const scenes = budget.scenes;
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { srv.stdout.on('data', d => /localhost:\d+/.test(String(d)) && ok()); srv.on('exit', c => no(new Error('preview exited ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas', '--enable-precise-memory-info'] });
let failed = false; const rows = [];
try {
  for (const [sceneName, sc] of Object.entries(scenes)) for (const tier of tiers) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    page.on('pageerror', e => { console.error('pageerror:', e.message); failed = true; });
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/?${sc.query}&lowrender&looktier=${tier}`);
    await page.waitForFunction(() => window.__cb?.qa?.frames > 2, null, { polling: 100 });
    if (sc.query.includes('showcase=')) await page.waitForFunction(() => window.__showcase, null, { polling: 200 });
    const loadMs = Date.now() - t0;
    // the camera the probe uses: aerial over the compound (building LOD reads the camera), a few update frames to settle
    await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34; });
    await page.evaluate(() => new Promise(ok => { const f0 = window.__cb.qa.frames; const w = () => (window.__cb.qa.frames >= f0 + 8 ? ok() : setTimeout(w, 30)); w(); }));
    const m = await page.evaluate(() => { const c = window.__cb.census(); return { ...c, heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, showcaseMs: window.__showcaseMs ?? 0, problems: window.__showcase?.problems?.length ?? 0 }; });
    await ctx.close();
    if (tier === 'low') { m.shadowTriangles = 0; m.shadowCasters = 0; }   // (no shadow pass at Low)
    const lim = sc.tiers[tier] ?? {};
    const checks = ['drawCalls', 'triangles', 'shadowTriangles', 'shadowCasters', 'heapMB'].map(k => ({ k, v: m[k], max: lim[k], bad: lim[k] != null && m[k] > lim[k] }));
    if (lim.loadMsFail != null && loadMs > lim.loadMsFail) checks.push({ k: 'loadMs', v: loadMs, max: lim.loadMsFail, bad: true });
    if (m.problems) checks.push({ k: 'showcaseProblems', v: m.problems, max: 0, bad: true });
    rows.push({ scene: sceneName, tier, loadMs, ...Object.fromEntries(checks.map(c => [c.k, Math.round(c.v)])) });
    const bad = checks.filter(c => c.bad);
    console.log(`${sceneName}/${tier}: calls ${m.drawCalls} tris ${(m.triangles / 1000).toFixed(0)}k shadowTris ${(m.shadowTriangles / 1000).toFixed(0)}k casters ${m.shadowCasters} heap ${m.heapMB.toFixed(0)}MB load ${loadMs}ms (script ${Math.round(m.showcaseMs)}ms)`
      + (bad.length ? '  OVER BUDGET: ' + bad.map(c => `${c.k} ${Math.round(c.v)} > ${c.max}`).join(', ') : '  ok'));
    if (bad.length && !printOnly) failed = true;
  }
} finally { await browser.close(); srv.kill(); }
process.exit(failed ? 1 : 0);
