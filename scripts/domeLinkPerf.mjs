// Dome link perf census (docs/ux/dome-links): three domes without links, then with a walkway and a tunnel on each pair. Counts only (no screenshots).
//   node scripts/domeLinkShots.mjs <outDir> [port] [only=comma,names]      PANEL=1 adds the Dome panel with the HUD.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5994), only = process.argv[4] ? process.argv[4].split(',') : null;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const want = n => !only || only.includes(n);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7${process.env.PANEL ? '&layout=a' : '&clean'}&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=0&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('medium', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const info = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const put = (kind, x, z, r = 4) => { const sp = cb.tool.findSpot(kind, x, z, 0, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], 0); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1], kind }; };
    const domes = { glass: put('dome_glass', c.x - 9, c.z - 2, 14), geo: put('dome_geodesic', c.x + 6, c.z - 1, 14), earth: put('dome_earthen', c.x + 6, c.z + 15, 12) };
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    const live = await import('/src/sim/dome/live.ts');
    G.setState(s => { const g = structuredClone(s.game);
      for (const [k, d] of Object.entries(domes)) { if (!d) continue; const ref = live.domeOf(g, d.id); if (!ref) continue; const o = live.ownState(g, ref); o.filtering = 'advanced'; o.loop = k === 'earth' ? 'none' : 'recycle'; g.utilities.fittings.push({ building: d.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 }); }
      return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    return { domes, camp: [c.x, c.z] };
  });
  lap(JSON.stringify(info));
  if (!info.domes.glass || !info.domes.geo) throw new Error('missing domes');
  const LK = '/src/sim/dome/links.ts';
  const order = (a, b, kind, depth) => page.evaluate(async ([a, b, kind, depth, LK]) => {
    const m = await import(LK), G = window.__cb.game; let why = null;
    G.setState(s => { const g = structuredClone(s.game); why = m.orderLink(g, a, b, kind, depth); return { game: g }; });
    return why;
  }, [a, b, kind, depth, LK]);
  const finishAll = () => page.evaluate(() => { const G = window.__cb.game; G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; }); });
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34; });
  const census = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); await page.evaluate(() => window.__cb.qa.renderNow()); return page.evaluate(() => { const c = window.__cb.census(); return { drawCalls: c.drawCalls, triangles: c.triangles, shadowTriangles: c.shadowTriangles, shadowCasters: c.shadowCasters }; }); };
  const before = await census(); console.log('without links ' + JSON.stringify(before));
  await order(info.domes.glass.id, info.domes.geo.id, 'walkway'); await order(info.domes.glass.id, info.domes.geo.id, 'tunnel'); await order(info.domes.geo.id, info.domes.earth.id, 'walkway'); await order(info.domes.geo.id, info.domes.earth.id, 'tunnel', 4);
  await finishAll();
  const after = await census(); console.log('with 4 links  ' + JSON.stringify(after));
  console.log('delta         ' + JSON.stringify(Object.fromEntries(Object.keys(after).map(k => [k, after[k] - before[k]]))));
  await page.close();
} finally { await browser.close(); vite.kill(); }
