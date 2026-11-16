/**
 * FL2: the felt layer's persistent world state in the real app. For each kind, at each day after the hit, eye level and from above (and the
 * county road and a neighbor farm), against a peacetime baseline at the same pose and hour, with a mean-absolute-pixel-difference audit.
 *   flock /tmp/cb.lock node scripts/feltWorldShots.mjs --kinds wildfire,mega_quake,dam_flood [--days 1,7,30] [--views eye,aerial,road,farm]
 *       [--hours 12,23] [--out shots/fl2] [--audit] [--min 1.5] [--port 5977]
 * --audit: exit 1 when a kind's eye, aerial, road or farm shot at day 7 differs from peacetime by less than --min percent in ALL of its views
 * (the doc's rule is "at least one visible change"; the best view counts), or a page error / console error shows, or a modal covers the view.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5977)), quality = opt('--quality', 'medium');
const kinds = opt('--kinds', 'wildfire,mega_quake,dam_flood,zombies,supervolcano').split(',');
const days = opt('--days', '1,7,30').split(',').map(Number);
const views = opt('--views', 'eye,aerial,road,farm').split(',');
const hours = opt('--hours', '12').split(',').map(Number);
const audit = args.includes('--audit'), minPct = Number(opt('--min', '1.5'));
const outDir = resolve(opt('--out', 'shots/fl2'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error(`vite exited ${c}`))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => { console.error('pageerror:', e.message); problems.push('pageerror: ' + e.message); });
  page.on('console', c => { if (c.type() === 'error') { console.error('console error:', c.text().slice(0, 200)); problems.push('console: ' + c.text().slice(0, 120)); } });
  await page.goto(`http://localhost:${port}/?seed=7&lowrender`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => { window.__cb.qa.weather = true; });
  const frames = async k => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  let warmed = false;
  const shot = async name => {
    await frames(warmed ? 2 : 10); warmed = true;
    await page.evaluate(q => window.__cb.qa.renderFull(q), quality);
    const f = `${outDir}/${name}.png`; await page.screenshot({ path: f });
    return f;
  };
  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    window.__spot = sp;
  });
  await frames(4);
  const view = async mode => page.evaluate(mode => {
    const cb = window.__cb, sp = window.__spot, gr = cb.world.groundAt, H = cb.world.feltHost();
    cb.store.setState({ hudHidden: true });
    if (mode === 'eye') { const x = sp[0] + 2, z = sp[1] + 7; cb.qa.pose = { x, y: gr(x, z) + 0.34, z, lx: sp[0] - 1, ly: gr(sp[0], sp[1]) + 0.9, lz: sp[1] - 8, fov: 66 }; }
    else if (mode === 'road') { const z = H.gateZ - 1, x = H.roadX(z) - 1.6; cb.qa.pose = { x, y: gr(x, z) + 0.4, z, lx: H.roadX(H.gateZ - 30), ly: gr(x, z) + 0.45, lz: H.gateZ - 30, fov: 70 }; }
    else if (mode === 'farm') { const f = H.farms[0]; const x = f.x - 13, z = f.z - 13; cb.qa.pose = { x, y: gr(x, z) + 0.5, z, lx: f.x, ly: gr(f.x, f.z) + 0.35, lz: f.z, fov: 64 }; }
    else if (mode === 'creek') { const x = H.size * 0.5, z = H.creekZ(x) + 7; cb.qa.pose = { x, y: gr(x, z) + 0.6, z, lx: x, ly: gr(x, z) - 0.1, lz: H.creekZ(x) - 6, fov: 70 }; }
    else { cb.qa.pose = null; cb.cam.target.set(sp[0], gr(sp[0], sp[1]), sp[1]); cb.cam.radius = 30; cb.cam.pitch = 0.62; cb.cam.yaw = 0.7; }
  }, mode);
  const setDay = (kind, d, hour) => page.evaluate(async ([kind, d, hour, kinds]) => {
    const { triggerDisaster, tracksAt } = await import('/src/sim/disaster.ts');
    const G = window.__cb.game;
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      g.gate.pending = null; g.gate.incoming = null; g.clock.speed = 0;
      if (kind === 'peace') { g.disaster.kind = null; g.disaster.phase = 'peace'; g.clock.t = 30 + 0.25 + (hour - 12) / 24; return { game: g, resumeTo: null, dayCard: null }; }
      if (g.disaster.kind !== kind) { g.disaster.mode = 'sandbox'; g.disaster.phase = 'peace'; triggerDisaster(g.disaster, 0, kind, g.seed, 14); g.disaster.hitAt = 20 + 40 * Math.max(0, kinds.indexOf(kind)); g.disaster.warnAt = g.disaster.hitAt - 14; g.disaster.fate = 'full'; }
      g.clock.t = g.disaster.hitAt + d + 0.25 + (hour - 12) / 24;
      g.disaster.phase = d < 3 ? 'impact' : 'survival';
      g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
      return { game: g, resumeTo: null, dayCard: null };
    });
    window.__cb.feltSync(true);
  }, [kind, d, hour, kinds]);
  const diff = async (a, b) => {
    const pa = readFileSync(a).toString('base64'), pb = readFileSync(b).toString('base64');
    return page.evaluate(async ([pa, pb]) => {
      const load = async s => { const im = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(im.width, im.height); const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const [x, y] = await Promise.all([load(pa), load(pb)]);
      let sum = 0; for (let i = 0; i < x.length; i += 4) sum += (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2])) / 3;
      return sum / (x.length / 4) / 255 * 100;
    }, [pa, pb]);
  };
  // peacetime baselines, one per view and hour
  const base = {};
  await setDay('peace', 0, 12);
  for (const hr of hours) for (const v of views) { await setDay('peace', 0, hr); await view(v); base[`${v}-${hr}`] = await shot(`peace-${v}-h${hr}`); }
  for (const kind of kinds) {
    let best7 = 0;
    for (const d of days) for (const hr of hours) {
      await setDay(kind, d, hr);
      const st = await page.evaluate(() => { const w = window.__cb.feltWorld; return { ...w.stats, hud: !!document.querySelector('[role="dialog"]') }; });
      for (const v of views) {
        await view(v);
        const f = await shot(`${kind}-day${d}-${v}-h${hr}`);
        const pct = await diff(f, base[`${v}-${hr}`]);
        if (d === 7 && hr === 12) best7 = Math.max(best7, pct);
        results.push({ kind, day: d, view: v, hour: hr, pct: Number(pct.toFixed(2)) });
        console.log(`${kind} day ${d} ${v} h${hr}: ${pct.toFixed(2)}% from peacetime  (marks ${st.marks}, decals ${st.decals}, props ${st.props}, fires ${st.fires}, flood ${st.flood} ft, draws ${st.draws}, tris ${Math.round(st.triangles)})`);
        if (st.hud) problems.push(`${kind} day ${d}: a dialog covers the view`);
      }
    }
    if (audit && days.includes(7) && hours.includes(12) && best7 < minPct) problems.push(`${kind}: week-1 shots differ from peacetime by only ${best7.toFixed(2)}% (best view; need ${minPct}%)`);
  }
} finally {
  await browser.close();
  vite.kill();
}
console.log(JSON.stringify(results));
if (audit && problems.length) { console.error('AUDIT FAILED:\n' + problems.join('\n')); process.exit(1); }
setTimeout(() => process.exit(0), 200);
