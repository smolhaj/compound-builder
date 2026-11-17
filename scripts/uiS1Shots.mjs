/**
 * UX audit screenshots (docs/UX_AUDIT.md (S1 top bar)). Tooling only; reads the real HUD, changes nothing in the game.
 *   flock /tmp/cb.lock node scripts/uiS1Shots.mjs --out shots/ui-s1 [--vp 1512x860,1280x720,1100x700] [--set early,mid,disaster,tabs] [--port 5990]
 * Writes <out>/<set>-<name>-<w>x<h>.png and <out>/metrics.json (HUD coverage of the viewport, visible buttons, fixed-element overflow).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/ui-s1')), port = Number(opt('--port', 5990));
const VPS = opt('--vp', '1512x860,1280x720,1100x700').split(',').map(s => s.split('x').map(Number));
const SETS = opt('--set', 'early,mid,disaster').split(',');
const LAYOUT = opt('--layout', 'a');
mkdirSync(out, { recursive: true });
const mf = `${out}/metrics.json`, metrics = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : {};
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VPS[0][0], height: VPS[0][1] } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));

/** What the HUD covers: fixed elements (not the full-screen backdrops) rasterized on an 8 px grid. */
const measure = () => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight, cell = 8, cols = Math.ceil(vw / cell), rows = Math.ceil(vh / cell), g = new Uint8Array(cols * rows);
  const boxes = []; let overflow = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    if (r.width >= vw - 2 && r.height >= vh - 2) continue;   // a canvas or a backdrop
    if (cs.pointerEvents === 'none' && !e.querySelector('button')) { /* captions still count */ }
    boxes.push({ t: (e.getAttribute('data-testid') || e.getAttribute('aria-label') || (e.innerText || '').trim().slice(0, 24)), l: Math.round(r.left), tp: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    if (r.left < -1 || r.right > vw + 1 || r.bottom > vh + 1) overflow.push((e.getAttribute('data-testid') || (e.innerText || '').trim().slice(0, 20)) + ` ${Math.round(r.left)}..${Math.round(r.right)}x${Math.round(r.top)}..${Math.round(r.bottom)}`);
    for (let y = Math.max(0, Math.floor(r.top / cell)); y < Math.min(rows, Math.ceil(r.bottom / cell)); y++) for (let x = Math.max(0, Math.floor(r.left / cell)); x < Math.min(cols, Math.ceil(r.right / cell)); x++) g[y * cols + x] = 1;
  }
  let c = 0; for (const v of g) c += v;
  // open the center band too: the middle 50 % of the width is where the player looks
  let mid = 0, midN = 0; for (let y = 0; y < rows; y++) for (let x = Math.floor(cols * 0.25); x < Math.floor(cols * 0.75); x++) { midN++; mid += g[y * cols + x]; }
  const btns = [...document.querySelectorAll('button, select, input')].filter(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; }).length;
  return { coveredPct: +(100 * c / g.length).toFixed(1), centerCoveredPct: +(100 * mid / midN).toFixed(1), controls: btns, hScroll: document.documentElement.scrollWidth > vw + 1, overflow, fixedBoxes: boxes.length };
});
let key = '';
const shot = async name => {
  await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(450);
  const [w, h] = page.viewportSize() ? [page.viewportSize().width, page.viewportSize().height] : [0, 0];
  const id = `${LAYOUT}-${key}-${name}-${w}x${h}`;
  metrics[id] = await measure();
  await page.screenshot({ path: `${out}/${id}.png` });
  console.log(id, JSON.stringify(metrics[id]));
  writeFileSync(mf, JSON.stringify(metrics, null, 1));
};
const setVp = async ([w, h]) => { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500); };
const click = async (name, exact = true) => { await page.getByRole('button', { name, exact }).first().click(); await page.waitForTimeout(350); };
const cabin = () => page.evaluate(() => { const cb = window.__cb, c = cb.world.camp, cam = cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.0; });
const newRun = async () => {
  await page.goto(`http://localhost:${port}/?new&lowrender&layout=${LAYOUT}`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await click('Next'); await click('Next'); await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.getByTestId('welcome').getByRole('button', { name: 'Start' }).click().catch(() => {});
  await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); window.__cb.store.getState().setQuality('low'); window.__cb.qa.weather = true; });
  await cabin(); await page.waitForTimeout(1200);
};
const feel = fn => page.evaluate(async f => { const m = await import('/src/store/feelStore.ts'); return new Function('m', 'return (' + f + ')(m)')(m); }, fn.toString());
try {
  for (const set of SETS) {
    if (set === 'early') {
      await newRun(); key = 'early';
      for (const vp of VPS) { await setVp(vp); await cabin(); await shot('day0'); }
    }
    if (set === 'mid') {
      if (!(await page.evaluate(() => !!window.__cb?.game)) || SETS[0] !== 'early') await newRun();
      key = 'mid';
      await setVp(VPS[0]);
      await page.getByRole('button', { name: /^Build/ }).first().click().catch(() => {});
      await click('Lay out a starter compound');
      await page.getByRole('button', { name: 'Place all' }).first().click().catch(() => console.log('no Place all'));
      await page.waitForTimeout(600);
      await page.evaluate(async () => { // three days of the real sim: the family works, an order arrives
        const E = await import('/src/sim/engine.ts'); const G = window.__cb.game;
        let g = structuredClone(G.getState().game), n = 0; const t0 = g.clock.t;
        while (g.clock.t - t0 < 3 && n++ < 1000) { g.gate.pending = null; g = E.step(g, 0.25); }
        G.setState({ game: g });
      });
      await cabin();
      for (const vp of VPS) { await setVp(vp); await cabin(); await shot('day3'); }
      await setVp(VPS[0]);
      await page.evaluate(() => { const s = window.__cb.game.getState(); const st = s.game.structures.find(x => !x.unplaced && x.finishedAt === null); if (st) s.select(st.id); });
      await shot('day3-projects');
    }
    if (set === 'disaster') {
      key = 'disaster';
      await newRun();
      await page.evaluate(async () => { // the felt-layer pattern: trigger at the Free build menu's route, run to just before the hit
        const [D, E] = await Promise.all([import('/src/sim/disaster.ts'), import('/src/sim/engine.ts')]);
        const G = window.__cb.game; const g = structuredClone(G.getState().game);
        const c = window.__cb.world.camp; void c;
        g.disaster.mode = 'god'; g.disaster.phase = 'peace'; g.stock.sw_radio = 1;
        D.triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 14); g.disaster.fate = 'full';
        for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
        g.gate.pending = null; g.gate.next = 1e9; g.clock.t = g.disaster.hitAt - 0.02; g.clock.speed = 0;
        G.setState({ game: g, dayCard: g.disaster.hitAt, resumeTo: 1, cutscene: null });
        window.__E = E;
      });
      await setVp(VPS[0]); await page.waitForTimeout(500);
      for (const vp of VPS) { await setVp(vp); await shot('daycard'); }
      await setVp(VPS[0]);
      await page.evaluate(() => window.__cb.game.getState().ackDayCard());
      await page.evaluate(async () => {
        const FS = await import('/src/sim/felt/state.ts'); const G = window.__cb.game;
        let g = structuredClone(G.getState().game), n = 0;
        while (g.clock.t - g.disaster.hitAt < 7 && n++ < 3000) { g.gate.pending = null; g.gate.next = 1e9; g = window.__E.step(g, 0.25); if (FS.feltOf(g)?.cards?.pending && g.clock.t - g.disaster.hitAt > 0.5) { break; } }
        G.setState({ game: g, dayCard: null, resumeTo: null, cutscene: null });
        window.__pending = !!FS.feltOf(g)?.cards?.pending;
      });
      console.log('felt card pending', await page.evaluate(() => window.__pending));
      for (const vp of VPS) { await setVp(vp); await shot('week1-or-card'); }
      await setVp(VPS[0]);
      await page.evaluate(async () => { // settle any card, run to day 7
        const CA = await import('/src/sim/felt/cards.ts'); const G = window.__cb.game;
        let g = structuredClone(G.getState().game), n = 0;
        while (g.clock.t - g.disaster.hitAt < 7 && n++ < 3000) { const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id); g.gate.pending = null; g.gate.next = 1e9; g = window.__E.step(g, 0.25); }
        const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id);
        G.setState({ game: g, dayCard: null, resumeTo: null, cutscene: null });
      });
      for (const vp of VPS) { await setVp(vp); await cabin(); await shot('week1'); }
      await setVp(VPS[0]);


      if (LAYOUT === 'a') {
        await setVp(VPS[0]);
        await page.getByTestId('top-menu').click(); await page.waitForTimeout(300); await shot('menu');
        await page.keyboard.press('Escape');
        await page.locator('[data-chip="food"]').first().hover(); await page.waitForTimeout(500); await shot('hover-food');
        await page.locator('[data-chip="threat"]').first().hover(); await page.waitForTimeout(500); await shot('hover-threat');
        await page.mouse.move(700, 500);
        await page.setViewportSize({ width: 900, height: 700 }); await page.waitForTimeout(500); await shot('w900');
        await page.getByTestId('top-overflow').click(); await page.waitForTimeout(300); await shot('w900-overflow');
        await page.keyboard.press('Escape');
        await setVp(VPS[0]);
      }
    }
  }
} finally { await browser.close(); vite.kill(); }
