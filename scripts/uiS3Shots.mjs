/**
 * UX audit screenshots (docs/UX_AUDIT.md (S3 What-to-do card, queue, dim)). Tooling only; reads the real HUD, changes nothing in the game.
 *   flock /tmp/cb.lock node scripts/uiS3Shots.mjs --out shots/ui-s3 [--vp 1512x860,1280x720,1100x700] [--set early,mid,disaster,tabs] [--port 5990]
 * Writes <out>/<set>-<name>-<w>x<h>.png and <out>/metrics.json (HUD coverage of the viewport, visible buttons, fixed-element overflow).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/ui-s3')), port = Number(opt('--port', 5990));
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
  const ab = document.querySelector('[data-testid="action-bar"]'), abr = ab?.getBoundingClientRect();
  return { bar: ab ? `${ab.getAttribute('data-mode')} ${Math.round(abr.width)}x${Math.round(abr.height)} left ${Math.round(abr.left)}` : null, coveredPct: +(100 * c / g.length).toFixed(1), centerCoveredPct: +(100 * mid / midN).toFixed(1), controls: btns, hScroll: document.documentElement.scrollWidth > vw + 1, overflow, fixedBoxes: boxes.length };
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
const drawerState = async (id) => {   // open exactly one drawer (or none) through the real action bar
  const open = await page.evaluate(() => document.querySelector('[data-open="1"]')?.getAttribute('data-testid') ?? '');
  if (id === 'none') { if (open) await page.keyboard.press('Escape'); }
  else if (open !== `bar-${id}`) await page.getByTestId(`bar-${id}`).click();
  await page.mouse.move(700, 400); await page.waitForTimeout(350);
};
/** closed, People (family), Supplies at the current size */
const trio = async (name) => { await drawerState('none'); await shot(name); };
const click = async (name, exact = true) => { await page.getByRole('button', { name, exact }).first().click(); await page.waitForTimeout(350); };
const cabin = () => page.evaluate(() => { const cb = window.__cb, c = cb.world.camp, cam = cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.0; });
const newRun = async () => {
  await page.goto(`http://localhost:${port}/?new&lowrender&layout=${LAYOUT}`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await click('Next'); await click('Next'); await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); window.__cb.store.getState().setQuality('low'); window.__cb.qa.weather = true; });
  await cabin(); await page.waitForTimeout(1200);
};
const feel = fn => page.evaluate(async f => { const m = await import('/src/store/feelStore.ts'); return new Function('m', 'return (' + f + ')(m)')(m); }, fn.toString());
try {
  for (const set of SETS) {
    if (set === 'early') {
      await newRun(); key = 'early';
      for (const vp of VPS) { await setVp(vp); await cabin(); await trio('day0'); }
      await setVp(VPS[0]); await page.getByTestId('bar-defense').hover(); await page.waitForTimeout(600); await shot('hover-bar-defense'); await page.mouse.move(700, 400);
      await drawerState('build'); await shot('build-open'); await drawerState('none');
    }
    if (set === 'tool') {   // hotkeys, a tool armed (drawer steps aside, the tool card shows), Esc order
      await newRun(); key = 'tool'; await setVp(VPS[0]); await cabin();
      const openId = () => page.evaluate(() => document.querySelector('[data-open="1"]')?.getAttribute('data-testid') ?? 'none');
      const vis = () => page.evaluate(() => [...document.querySelectorAll('[data-drawer]')].filter(e => getComputedStyle(e).display !== 'none').length);
      await page.keyboard.press('KeyB'); console.log('B ->', await openId(), 'visible drawers', await vis());
      await page.keyboard.press('KeyF'); console.log('F ->', await openId(), await vis());
      await page.keyboard.press('KeyF'); console.log('F again ->', await openId(), await vis());
      await page.keyboard.press('Tab'); console.log('Tab ->', await openId(), await vis());
      await page.keyboard.press('KeyB');
      await page.getByRole('button', { name: /^Cottage/ }).click(); await page.waitForTimeout(400);
      console.log('tool armed: open', await openId(), 'visible drawers', await vis(), 'tool-card', await page.getByTestId('tool-card').count());
      await shot('tool-armed');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log('Esc 1 ->', await openId(), 'visible drawers', await vis(), 'tool-card', await page.getByTestId('tool-card').count());
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log('Esc 2 ->', await openId(), 'visible drawers', await vis());
      await page.keyboard.press('KeyH'); await page.keyboard.press('KeyF'); console.log('F then H-hidden ->', await openId(), await vis()); await page.keyboard.press('KeyH'); console.log('H again ->', await vis());
      await page.getByTestId('top-menu').click(); await page.keyboard.press('Escape'); console.log('menu Esc keeps drawer ->', await openId(), await vis());
    }
    if (set === 'extras') {   // welcome in the queue, Esc stack, N / M, toast cap, collapse
      await newRun(); key = 'extras'; await setVp(VPS[0]);
      const q = sel => page.locator(sel).count();
      console.log('welcome up', await q('[data-testid="welcome"]'));
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      console.log('Esc closes welcome ->', await q('[data-testid="welcome"]'));
      await page.keyboard.press('KeyN'); await page.waitForTimeout(400);
      console.log('N opens board ->', await page.getByLabel('Compound board').count());
      await shot('board'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log('Esc closes board ->', await page.getByLabel('Compound board').count());
      await page.keyboard.press('KeyM'); await page.waitForTimeout(500);
      console.log('M opens shop ->', await page.evaluate(() => window.__cb.game.getState().shopOpen));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log('Esc closes shop ->', await page.evaluate(() => window.__cb.game.getState().shopOpen));
      await page.keyboard.press('KeyF'); await page.getByTestId('view-toggle').click(); await page.waitForTimeout(300);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log('Esc 1 (view box gone, drawer stays) ->', await q('[data-view-box]'), await page.evaluate(() => document.querySelector('[data-open="1"]')?.getAttribute('data-testid')));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      console.log('Esc 2 (drawer gone) ->', await page.evaluate(() => document.querySelector('[data-open="1"]')?.getAttribute('data-testid') ?? 'none'));
      for (let i = 0; i < 6; i++) { await page.evaluate(i => window.__cb.game.setState({ toast: { id: Date.now() + i, text: 'Refused click number ' + i } }), i); await page.waitForTimeout(200); }
      await page.waitForTimeout(300);
      console.log('toasts after 6 pushes ->', await q('[data-testid="toast-a"]'));
      await shot('toasts');
      await page.getByTestId('todo-toggle').click(); await page.waitForTimeout(300); await shot('collapsed');
      await page.getByTestId('todo-toggle').click();
      await page.getByTestId('view-toggle').click(); await page.waitForTimeout(300); await shot('viewbox'); await page.getByTestId('view-toggle').click();
    }
    if (set === 'mid') {
      if (!(await page.evaluate(() => !!window.__cb?.game)) || SETS[0] !== 'early') await newRun();
      key = 'mid';
      await setVp(VPS[0]);
      await page.getByTestId('todo-main').getByRole('button').first().waitFor();
      await page.getByRole('button', { name: 'Lay out a starter compound' }).first().click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Place all' }).first().click().catch(() => console.log('no Place all'));
      await page.waitForTimeout(600);
      await page.evaluate(async () => { // three days of the real sim: the family works, an order arrives
        const E = await import('/src/sim/engine.ts'); const G = window.__cb.game;
        let g = structuredClone(G.getState().game), n = 0; const t0 = g.clock.t;
        while (g.clock.t - t0 < 3 && n++ < 1000) { g.gate.pending = null; g = E.step(g, 0.25); }
        G.setState({ game: g });
      });
      await cabin();
      for (const vp of VPS) { await setVp(vp); await cabin(); await trio('day3'); }
      await setVp(VPS[0]);
      await page.evaluate(() => { const s = window.__cb.game.getState(); const st = s.game.structures.find(x => !x.unplaced && x.finishedAt === null); if (st) s.select(st.id); });
      await shot('day3-projects');
    }
    if (set === 'disaster') {
      key = 'disaster';
      await newRun();
      await page.evaluate(() => window.__cb.game.getState().setWelcome(false));
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
      await setVp(VPS[0]);
      const hitUp = await page.waitForSelector('[data-testid="hit-moment"]', { timeout: 4000 }).then(() => true).catch(() => false);
      console.log('hit moment up', hitUp);
      if (hitUp) { await shot('hit'); await page.keyboard.press('Space'); await page.waitForTimeout(600); }
      await page.waitForTimeout(500);
      await shot('daycard');
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
      await shot('week1-or-card');
      for (const vp of VPS.slice(1)) { await setVp(vp); await shot('card'); }
      await setVp(VPS[0]);
      await setVp(VPS[0]);
      await page.evaluate(async () => { // settle any card, run to day 7
        const CA = await import('/src/sim/felt/cards.ts'); const G = window.__cb.game;
        let g = structuredClone(G.getState().game), n = 0;
        while (g.clock.t - g.disaster.hitAt < 7 && n++ < 3000) { const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id); g.gate.pending = null; g.gate.next = 1e9; g = window.__E.step(g, 0.25); }
        const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id);
        G.setState({ game: g, dayCard: null, resumeTo: null, cutscene: null });
      });
      for (const vp of VPS) { await setVp(vp); await cabin(); await trio('week1'); }
      await setVp(VPS[0]);


      if (LAYOUT === 'a') {
        await setVp(VPS[0]); await cabin();
        await page.locator('[data-chip="food"]').first().hover(); await page.waitForTimeout(500); await shot('hover-food');
        await page.mouse.move(700, 500);
        await page.getByTestId('bar-family').hover(); await page.waitForTimeout(600); await shot('hover-bar-family'); await page.mouse.move(700, 500);
        await drawerState('defense'); await shot('defense');
        await drawerState('utilities'); await shot('utilities');
        await drawerState('none');
        await page.getByTestId('view-toggle').click(); await page.waitForTimeout(300); await shot('view-open'); await page.getByTestId('view-toggle').click();
        await page.keyboard.press('KeyH'); await page.waitForTimeout(300); await shot('hidden'); await page.keyboard.press('KeyH');
        await page.setViewportSize({ width: 900, height: 700 }); await page.waitForTimeout(500); await shot('w900'); await drawerState('land'); await shot('w900-land'); await drawerState('none');
        await setVp(VPS[0]);
      }
    }
  }
} finally { await browser.close(); vite.kill(); }
