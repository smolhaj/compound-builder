/**
 * UX audit screenshots (docs/UX_AUDIT.md (S5 polish: sub-page chips, Board drawer, hover cards, UI size, touch)). Tooling only; reads the real HUD, changes nothing in the game.
 *   flock /tmp/cb.lock node scripts/uiS5Shots.mjs --out shots/ui-s5 [--vp 1512x860,1280x720,1100x700] [--set early,mid,disaster,tabs] [--port 5990]
 * Writes <out>/<set>-<name>-<w>x<h>.png and <out>/metrics.json (HUD coverage of the viewport, visible buttons, fixed-element overflow).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/ui-s5')), port = Number(opt('--port', 5990));
const VPS = opt('--vp', '1512x860,1280x720,1100x700').split(',').map(s => s.split('x').map(Number));
const SETS = opt('--set', 'pages').split(',');
const LAYOUT = opt('--layout', 'a');
mkdirSync(out, { recursive: true });
const mf = `${out}/metrics.json`, metrics = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : {};
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VPS[0][0], height: VPS[0][1] } });
page.setDefaultTimeout(60000);
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

const disaster = async () => {
  await newRun();
  await page.evaluate(() => window.__cb.game.getState().setWelcome(false));
  await page.evaluate(async () => {
    const [D, E, FS, CA] = await Promise.all([import('/src/sim/disaster.ts'), import('/src/sim/engine.ts'), import('/src/sim/felt/state.ts'), import('/src/sim/felt/cards.ts')]);
    const G = window.__cb.game; let g = structuredClone(G.getState().game);
    g.disaster.mode = 'god'; g.disaster.phase = 'peace'; g.stock.sw_radio = 1;
    D.triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 14); g.disaster.fate = 'full';
    for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
    g.gate.pending = null; g.gate.next = 1e9; g.clock.t = g.disaster.hitAt - 0.02; g.clock.speed = 0;
    let n = 0;
    while (g.clock.t - g.disaster.hitAt < 7 && n++ < 3000) { const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id); g.gate.pending = null; g.gate.next = 1e9; g = E.step(g, 0.25); }
    const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id);
    void FS;
    G.setState({ game: g, dayCard: null, resumeTo: null, cutscene: null, welcome: false });
  });
  await page.waitForTimeout(600);
};
const DRAWERS = ['family', 'supplies', 'utilities', 'land', 'defense', 'outside', 'projects', 'chronicle', 'board', 'log'];
const chipsOf = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="page-chip-"]')].filter(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').map(e => e.getAttribute('data-testid').slice(10)));
/** every drawer; every sub-page chip at the first viewport, the first page only at the others */
const pagesOf = async (world, full) => {
  for (const d of DRAWERS) {
    await drawerState('none'); await drawerState(d);
    const chips = await chipsOf();
    const list = full ? (chips.length ? chips : ['']) : [chips[0] ?? ''];
    for (const c of list) {
      if (c) { await page.getByTestId(`page-chip-${c}`).click(); await page.mouse.move(700, 400); await page.waitForTimeout(250); }
      await shot(`${d}${c ? '-' + c : ''}`);
    }
    // the scroll position / overflow check: is any page wider than its drawer?
    const ov = await page.evaluate(() => [...document.querySelectorAll('[data-drawer]')].filter(e => getComputedStyle(e).display !== 'none').map(e => { const sc = e.querySelector('div[style*="overflow-y"]') ?? e; return { w: e.clientWidth, sw: sc.scrollWidth, cw: sc.clientWidth }; }));
    if (ov.some(o => o.sw > o.cw + 1)) console.log('  HORIZONTAL OVERFLOW in', d, JSON.stringify(ov));
  }
  await drawerState('none');
};
try {
  for (const set of SETS) {
    if (set === 'pages') {
      await newRun(); key = 'day0'; await page.evaluate(() => window.__cb.game.getState().setWelcome(false));
      for (const [i, vp] of VPS.entries()) { await setVp(vp); await cabin(); await pagesOf('day0', i === 0); }
      await disaster(); key = 'week1';
      for (const [i, vp] of VPS.entries()) { await setVp(vp); await cabin(); await pagesOf('week1', i === 0); }
    }
    if (set === 'hover') {
      await disaster(); key = 'hover'; await setVp(VPS[0]); await cabin();
      await drawerState('supplies'); await page.waitForTimeout(300);
      const row = page.locator('[data-drawer=right] [title]').first(); await row.hover(); await page.waitForTimeout(700); await shot('title-card');
      await page.getByTestId('page-chip-keeping').hover(); await page.waitForTimeout(700); await shot('chip-card');
      await drawerState('family');
      await page.locator('[data-drawer=right] [title]').nth(3).hover(); await page.waitForTimeout(700); await shot('family-card');
      await page.mouse.move(700, 400);
      await page.locator('[data-chip="food"]').first().hover(); await page.waitForTimeout(600); await shot('top-chip');
      await page.getByTestId('bar-defense').hover(); await page.waitForTimeout(600); await shot('bar-button');
      await page.mouse.move(700, 400);
      await page.getByTestId('feed-line').hover().catch(() => {}); await page.waitForTimeout(500); await shot('feed-line');
      await page.getByTestId('feed-line').click().catch(() => {}); await page.waitForTimeout(400); await shot('feed-opened');
    }
    if (set === 'scale') {
      await disaster(); key = 'scale'; await setVp(VPS[0]); await cabin();
      for (const sc of [1.25, 0.9]) {
        await page.evaluate(sc => window.__cb.store.getState().setUiScale(sc), sc); await page.waitForTimeout(500);
        for (const vp of VPS) { await setVp(vp); await cabin(); await drawerState('none'); await shot(`u${Math.round(sc * 100)}-closed`); await drawerState('supplies'); await shot(`u${Math.round(sc * 100)}-supplies`); await drawerState('defense'); await shot(`u${Math.round(sc * 100)}-defense`); await drawerState('board'); await shot(`u${Math.round(sc * 100)}-board`); }
      }
      await page.evaluate(() => window.__cb.store.getState().setUiScale(1));
    }
    if (set === 'final') {
      await disaster(); key = 'final'; await setVp(VPS[0]); await cabin();
      await drawerState('supplies'); await page.getByTestId('page-chip-kitchen').click(); await page.mouse.move(700, 400); await page.waitForTimeout(300); await shot('supplies-kitchen');
      await drawerState('defense'); await page.getByTestId('page-chip-walls').click(); await page.mouse.move(700, 400); await page.waitForTimeout(300); await shot('defense-walls');
      await drawerState('build'); await page.locator('[data-testid="build-card"]').nth(1).hover(); await page.waitForTimeout(600); await shot('build-hover-one-card');
      await drawerState('none'); await page.mouse.move(700, 400);
      await page.waitForTimeout(700);       await page.evaluate(() => window.__cb.game.setState({ toast: { id: Date.now(), text: 'Refused click: not enough cash' } })); await page.waitForTimeout(500); await shot('toast');
      await page.evaluate(() => window.__cb.store.getState().setUiScale(1.25)); await page.waitForTimeout(500); await shot('u125-toast');
    }
    if (set === 'touch') {
      await newRun(); key = 'touch'; await setVp(VPS[0]); await cabin(); await page.evaluate(() => window.__cb.game.getState().setWelcome(false));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const press = async (loc, ms) => { const b = await loc.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300); };
      await drawerState('build'); await page.waitForTimeout(300);
      const card = page.locator('[data-testid="build-card"]').nth(1);
      await press(card, 700); await shot('long-press-bill');
      console.log('bill up after long press:', await page.evaluate(() => !!document.querySelector('[data-testid="build-bill"]')), 'tool armed:', await page.evaluate(() => window.__cb.game.getState().tool));
      await page.mouse.click(600, 500);
      console.log('bill closed by tap elsewhere:', await page.evaluate(() => !document.querySelector('[data-testid="build-bill"]')));
      await drawerState('none'); await drawerState('supplies'); await page.waitForTimeout(300);
      await press(page.locator('[data-drawer=right] [title]').first(), 700); await shot('long-press-title-card');
      console.log('title card up:', await page.evaluate(() => !!document.querySelector('[data-tip=title]')));
      await press(page.getByTestId('page-chip-keeping'), 700); await shot('long-press-chip-card');
      console.log('chip stayed on stores (click swallowed):', await page.evaluate(() => document.querySelector('[data-testid=page-chip-stores]').getAttribute('aria-pressed')));
      await press(page.getByTestId('page-chip-keeping'), 80);
      console.log('quick tap switches page:', await page.evaluate(() => document.querySelector('[data-testid=page-chip-keeping]').getAttribute('aria-pressed')));
    }
  }
} finally { await browser.close().catch(() => {}); vite.kill(); }
