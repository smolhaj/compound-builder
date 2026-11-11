// LEAK + COST check for the cutscene (cutscene realism): plays N staged invasions back to back through the real BattleRenderer (prepare: breach look, house assault, movement router), and reports renderer.info.memory / calls, JS heap after a GC, the prepare cost, and the slowest update step. Flat counts after the first scene = no leak.
//   node scripts/cutLeakCheck.mjs [--n 20] [--day 79]
// Adapted from the invasion movie: a night raid whose crew rams (or blows) its way through the wall, fights across the yard and into the house.
// The page's rAF is replaced by a manual pump (1/FPS s of cutscene time per frame), a JPEG per frame, then ffmpeg. Adapted from the day-movie
// script on claude/raid-movie-script (a separate file, so the two never conflict).
//   node scripts/invasionMovie.mjs --day 23 --hour 2.25 --out /tmp/claude-0/invasion/frames --mp4 /tmp/claude-0/invasion/invasion.mp4 [--max N] [--quality high] [--method ram|charge]
//   node scripts/invasionMovie.mjs --scan     lists encounter days whose assault breaks the line (res, deaths, scenes)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5971)), hour0 = Number(opt('--hour', 2.25)), maxF = Number(opt('--max', 100000));
const quality = opt('--quality', null), outDir = resolve(opt('--out', '/tmp/claude-0/movie/night'));
const FPS = Number(opt('--fps', 12));
const scan = false, wantDay = Number(opt('--day', 60));
// a frame is drawn only when it is captured (qa.skipDraw), so stretches can be skipped (--from) or time-lapsed (--sparse, outside the --dense windows) cheaply; --lowrender uses the on-demand mode instead (slower per frame)
const lowrender = args.includes('--lowrender'), sparse = Number(opt('--sparse', 3)), fromS = Number(opt('--from', 0));
const dr = (opt('--dense', '') || '').split(',').filter(Boolean).map(x => x.split(':').map(Number));
const afterSecs = Number(opt('--after', 4));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite exited ' + c))); });
const browser = await chromium.launch();
const log = [];
try {
  const page = await browser.newPage({ viewport: { width: Number(opt('--w', 960)), height: Number(opt('--h', 540)) }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.addInitScript(() => {
    const real = window.requestAnimationFrame.bind(window);
    window.__manual = false; window.__q = []; window.__fakeNow = 0;
    window.requestAnimationFrame = cb => { if (!window.__manual) return real(cb); window.__q.push(cb); return window.__q.length; };
    window.__pump = ms => { window.__fakeNow += ms; const q = window.__q; window.__q = []; for (const cb of q) cb(window.__fakeNow); };
  });
  await page.goto(`http://localhost:${port}/?seed=7${lowrender ? '&lowrender=1&looktier=medium' : ''}`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  if (lowrender) await page.evaluate(() => { window.__cb.qa.weather = true; });
  if (quality) await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  await page.evaluate(async () => { window.__breach = (await import('/src/sim/breach.ts')).breachOptions; });
  if (opt('--method', null)) await page.evaluate(async m => { (await import('/src/sim/breach.ts')).breachOptions.force = m; }, opt('--method', null));
  console.log('quality', await page.evaluate(() => window.__cb.store.getState().quality));
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  

  const out = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 12;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; });
    const g = G.getState().game;
    const rows = [];
    for (const [dx, dz] of [[0, 0], [0, 0.03], [0, -0.03], [0, 0.06], [0, -0.06], [0.5, 0], [-0.5, 0]]) {
      const x = sp[0] + h * 0.2 + dx, z = sp[1] + h + dz;
      rows.push({ x: +x.toFixed(2), z: +z.toFixed(2), r012: cb.world.walkBlocked(x, z, 0.012), r04: cb.world.walkBlocked(x, z, 0.04) });
    }
    return { camp: [sp[0], sp[1]], runs: g.perimeter.map(r => ({ kind: r.kind, pts: r.pts, gates: r.gates })), rows };
  });
  console.log('PROBE', JSON.stringify(out));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
