// Load probe: opens the showcase URL headless in Chromium against the production build and records what blocks the main thread at startup.
//   node scripts/loadProbe.mjs [--tier low|medium|high] [--q '<query>'] [--out file.json] [--port 4173] [--dev]
// Records: long tasks (>50 ms) timeline, longest task, total blocked ms, time to first frame, time until the showcase finished,
// JS heap peak, renderer.info memory (geometries / textures), draw calls and triangles of a frame, and a CPU profile
// aggregated by inclusive time of the named functions (the stages). GPU time cannot be measured under software GL.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const tier = opt('--tier', 'medium'), port = Number(opt('--port', 4173)), out = opt('--out', 'load.json');
const Q = opt('--q', 'clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain');
const SOAK = Number(opt('--soak', 0));
const W = Number(opt('--w', 1280)), H = Number(opt('--h', 800));
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', opt('--dist','dist'), '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { srv.stdout.on('data', d => { if (/localhost:\d+/.test(String(d))) ok(); }); srv.on('exit', c => no(new Error('preview ' + c))); });
const browser = await chromium.launch({ args: [...(args.includes('--cpu2d') ? ['--disable-gpu-rasterization','--disable-accelerated-2d-canvas'] : []), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const res = { tier, query: Q };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(([tier]) => {
    try { localStorage.setItem('cb.quality', tier); } catch {}
    window.__lt = []; window.__heapPeak = 0; window.__t0 = performance.now();
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
    setInterval(() => { const m = performance.memory; if (m) window.__heapPeak = Math.max(window.__heapPeak, m.usedJSHeapSize); }, 50);
  }, [tier]);
  const page = await ctx.newPage(); page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?${Q}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__cb?.qa, null, { polling: 50 });
  res.firstCanvasMs = Date.now() - t0;
  await page.waitForFunction(() => window.__cb.qa.frames > 2, null, { polling: 100 });
  res.firstFramesMs = Date.now() - t0;
  if (Q.includes('showcase=')) { await page.waitForFunction(() => window.__showcase, null, { polling: 200 }); res.showcaseDoneMs = Date.now() - t0; }
  for (let i = 0; i < 12; i++) await page.waitForFunction(f => window.__cb.qa.frames >= f + 1, await page.evaluate(() => window.__cb.qa.frames), { polling: 50 });
  const { profile } = await cdp.send('Profiler.stop');
  if (SOAK) {
    // growth over time: heap after a forced GC, renderer.info counts, scene objects, canvases, every 10 s of play at speed 1
    await page.evaluate(() => { window.__cb.game.getState().setSpeed(1); });
    res.soak = [];
    for (let t = 0; t <= SOAK; t += 10) {
      const row = await page.evaluate(async () => {
        if (window.gc) window.gc(); await new Promise(r => setTimeout(r, 100));
        const cb = window.__cb, r = cb.ws.renderer; let objs = 0; cb.ws.scene.traverse(() => objs++);
        return { frames: cb.qa.frames, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length, objs, canvases: document.querySelectorAll('canvas').length, day: +cb.game.getState().game.clock.t.toFixed(2) };
      });
      res.soak.push({ t, ...row }); console.error('soak', t, JSON.stringify(row));
      await page.waitForTimeout(10000);
    }
  }
  const info = await page.evaluate(() => {
    const cb = window.__cb, r = cb.ws.renderer, lt = window.__lt;
    r.info.autoReset = false; r.info.reset(); r.render(cb.ws.scene, cb.ws.camera);
    return { longTasks: lt, ltTotal: lt.reduce((a, x) => a + x[1], 0), ltMax: Math.max(0, ...lt.map(x => x[1])), heapPeakMB: window.__heapPeak / 1048576, heapNowMB: performance.memory.usedJSHeapSize / 1048576,
      calls: r.info.render.calls, tris: r.info.render.triangles, geos: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length, frameMs: cb.qa.frameMs,
      structures: cb.game.getState().game.structures.length, sig: (() => { const g = cb.game.getState().game; const str = JSON.stringify([g.structures.map(x => [x.kind, +x.x.toFixed(2), +x.z.toFixed(2), x.rot]), g.perimeter.map(r => [r.kind, r.pts?.length ?? 0]), g.vehicles?.length]); let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h + ':' + g.structures.length + ':' + g.perimeter.length; })(), showcaseMs: window.__showcaseMs ?? null, trees: cb.world.treeSpecs.length, boot: window.__boot ?? null, showcase: window.__showcase ? { problems: window.__showcase.problems?.length, error: window.__showcase.error } : null };
  });
  Object.assign(res, info);
  // inclusive time per function name from the CPU profile
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), self = new Map(); const dts = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dts[i] ?? 0)));
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const incl = new Map();
  for (const [id, t] of self) { const seen = new Set(); for (let p = id; p; p = parent.get(p)) { const cf = nodes.get(p).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/(assets|src)\//, '')}:${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + t); } } }
  res.inclusiveTop = [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => [k, Math.round(v / 1000)]);
  const selfBy = new Map(); for (const [id, t] of self) { const cf = nodes.get(id).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/(assets|src)\//, '')}:${cf.lineNumber + 1}`; selfBy.set(k, (selfBy.get(k) ?? 0) + t); }
  res.selfTop = [...selfBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v / 1000)]);
  writeFileSync(out, JSON.stringify(res, null, 1));
  const { inclusiveTop, selfTop, longTasks, ...sum } = res; console.log(JSON.stringify(sum), '\nlong tasks:', JSON.stringify(longTasks));
} finally { await browser.close(); srv.kill(); setTimeout(() => process.exit(0), 200); }
