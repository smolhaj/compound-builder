/**
 * UX audit screenshots (docs/UX_AUDIT.md (S4 Build drawer catalog, day-0 card order)). Tooling only; reads the real HUD, changes nothing in the game.
 *   flock /tmp/cb.lock node scripts/uiS4Shots.mjs --out shots/ui-s4 [--vp 1512x860,1280x720,1100x700] [--set early,mid,disaster,tabs] [--port 5990]
 * Writes <out>/<set>-<name>-<w>x<h>.png and <out>/metrics.json (HUD coverage of the viewport, visible buttons, fixed-element overflow).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/ui-s4')), port = Number(opt('--port', 5990));
const VPS = opt('--vp', '1512x860,1280x720,1100x700').split(',').map(s => s.split('x').map(Number));
const SETS = opt('--set', 'build').split(',');
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
    if (set === 'build') {
      await newRun(); key = 'build';
      // day 0 as the player meets it: the card order (first-hour goal leads, food follows)
      await page.evaluate(() => window.__cb.game.getState().setWelcome(false));
      for (const vp of VPS) { await setVp(vp); await cabin(); await drawerState('none'); await shot('day0-card'); }
      for (const vp of VPS) {
        await setVp(vp); await cabin();
        await drawerState('build'); await page.mouse.move(300, 600); await page.waitForTimeout(300);
        await shot('open');
        await page.getByTestId('build-search').click(); await page.keyboard.type('well'); await page.waitForTimeout(300); await shot('search-well');
        await page.getByTestId('build-search').fill('power'); await page.waitForTimeout(300); await shot('search-power');
        await page.getByTestId('build-search').fill(''); await page.waitForTimeout(200);
        await page.getByTestId('build-chips').getByRole('button', { name: 'Food', exact: true }).click(); await page.waitForTimeout(300); await shot('chip-food');
        await page.locator('[data-testid="build-card"]').nth(1).hover(); await page.waitForTimeout(500); await shot('hover-bill');
        await page.mouse.move(300, 700);
        await page.getByTestId('build-chips').getByRole('button', { name: 'Bunker', exact: true }).click(); await page.waitForTimeout(300);
        await page.locator('[data-testid="build-card"][data-state="off"]').first().hover(); await page.waitForTimeout(500); await shot('dim-card');
        await page.mouse.move(300, 700);
        await page.getByTestId('build-drawer').getByRole('button', { name: 'Tools', exact: true }).click(); await page.waitForTimeout(300); await shot('more-tools');
        await page.getByTestId('build-drawer').getByRole('button', { name: 'Tools', exact: true }).click();
        await page.getByTestId('build-chips').getByRole('button', { name: /^Suggested/ }).click(); await page.waitForTimeout(300); await shot('chip-suggested');
        await page.getByTestId('build-chips').getByRole('button', { name: /^Suggested/ }).click();
        await drawerState('none');
      }
      // keyboard: / focuses search, arrows move, Enter arms
      await setVp(VPS[0]); await cabin(); await drawerState('build');
      await page.keyboard.press('Slash'); console.log('slash focuses search ->', await page.evaluate(() => document.activeElement?.getAttribute('data-testid')));
      await page.keyboard.type('cabin'); await page.keyboard.press('ArrowDown');
      console.log('arrow focuses card ->', await page.evaluate(() => document.activeElement?.getAttribute('data-key')));
      await page.keyboard.press('Enter'); await page.waitForTimeout(400);
      console.log('Enter armed ->', await page.evaluate(() => window.__cb.game.getState().tool), 'drawer visible', await page.evaluate(() => [...document.querySelectorAll('[data-drawer]')].filter(e => getComputedStyle(e).display !== 'none').length));
      await shot('armed');
    }
    if (set === 'toasts') {   // toast stack vs the View box
      await newRun(); key = 'toasts'; await setVp(VPS[0]);
      await page.evaluate(() => window.__cb.game.getState().setWelcome(false));
      await page.getByTestId('view-toggle').click(); await page.waitForTimeout(300);
      for (let i = 0; i < 3; i++) { await page.evaluate(i => window.__cb.game.setState({ toast: { id: Date.now() + i, text: 'Refused click number ' + i } }), i); await page.waitForTimeout(250); }
      await page.waitForTimeout(700);
      const boxes = await page.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }; return { view: r('[data-view-box]'), toast: r('[data-testid="toast-stack"]') }; });
      console.log('view box / toast stack top,bottom', JSON.stringify(boxes));
      await shot('over-viewbox');
    }
  }
} finally { await browser.close(); vite.kill(); }
