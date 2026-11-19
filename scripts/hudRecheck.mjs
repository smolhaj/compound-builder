/**
 * Layout A recheck: toast stack vs the View box vs the road banner at three viewport sizes, and drawer close behaviour.
 *   flock /tmp/cb.lock node scripts/hudRecheck.mjs --out docs/ux/recheck/hud [--layout a|classic] [--vp 1280x720,1512x860,1920x1080] [--port 5991]
 * Prints overlap rectangles (toast-stack, view-box, road banner, action bar) per viewport and saves PNGs. Real HUD, ?lowrender.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/hud')), port = Number(opt('--port', 5991)), LAYOUT = opt('--layout', 'a');
const VPS = opt('--vp', '1280x720,1512x860,1920x1080').split(',').map(s => s.split('x').map(Number));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VPS[0][0], height: VPS[0][1] } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(450); };
const click = async (name) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(350); };
const rects = () => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const o = { toast: r('[data-testid="toast-stack"]'), view: r('[data-view-box]'), road: r('[data-testid="road-hail"]'), bar: r('[data-testid="action-bar"]'), top: r('[data-testid="top-bar"]') };
  const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  o.overlaps = ['toast-view', 'toast-road', 'toast-bar', 'view-road', 'view-bar', 'road-bar'].filter(k => { const [x, y] = k.split('-'); return hit(o[x], o[y]); });
  return o;
});
try {
  await page.goto(`http://localhost:${port}/?new&lowrender&layout=${LAYOUT}`);
  console.log('loaded'); await page.getByText('1. Region').waitFor(); console.log('wizard');
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await click('Next'); await click('Next'); await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { const cb = window.__cb; cb.game.getState().setSpeed(0); cb.store.getState().setQuality('low'); cb.game.getState().setWelcome(false); const c = cb.world.camp, cam = cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.0; });
  console.log('layout', await page.evaluate(() => window.__cb.store.getState().layout));
  await page.waitForTimeout(1200);
  // the road banner (a hail at the line) + 3 toasts + the View box open
  await page.evaluate(async () => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const rp = await import('/src/sim/roadPassers.ts'); const road = rp.roadOf(g);
    road.hail = { id: 'h1', pass: 'q2', until: g.clock.t + 0.5, party: { id: 'q2', cls: 'traffic', dir: -1, speed: 4.8, members: [{ kind: 'pickup', gap: 0, lat: 0.17, tint: 0.35, riders: 0, loaded: true }], lights: true, heads: 1 }, by: 'block', text: 'A pickup stopped at the checkpoint and asked if you would swap 4 fuel for 5 canned.', offer: [{ good: 'fuel', qty: 4 }], want: [{ good: 'canned', qty: 5 }], shady: false, begging: false };
    G.setState({ game: g });
  });
  const vt = page.getByTestId('view-toggle'); if (await vt.count()) { await vt.click(); await page.waitForTimeout(300); }
  for (const vp of VPS) {
    await page.setViewportSize({ width: vp[0], height: vp[1] }); await page.waitForTimeout(500);
    for (let i = 0; i < 3; i++) { await page.evaluate(i => window.__cb.game.setState({ toast: { id: Date.now() + i, text: 'Refused click number ' + i } }), i); await page.waitForTimeout(250); }
    await page.waitForTimeout(600); await frame();
    console.log(`${vp.join('x')}`, JSON.stringify(await rects()));
    await page.screenshot({ path: `${out}/${LAYOUT}-toast-road-view-${vp.join('x')}.png` });
  }
  // drawer close behaviour (layout A): open Build, close by Esc, by the same bar button, by clicking the map
  if (LAYOUT === 'a') {
    await page.setViewportSize({ width: 1512, height: 860 }); await page.waitForTimeout(400);
    const open = () => page.evaluate(() => document.querySelector('[data-open="1"]')?.getAttribute('data-testid') ?? 'none');
    const log = async (s) => console.log('drawer:', s, '->', await open());
    await page.getByTestId('bar-build').click(); await page.waitForTimeout(300); await log('open build');
    await page.screenshot({ path: `${out}/a-drawer-open-1512x860.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await log('Esc');
    await page.getByTestId('bar-build').click(); await page.waitForTimeout(300); await page.getByTestId('bar-build').click(); await page.waitForTimeout(300); await log('same button twice');
    await page.getByTestId('bar-build').click(); await page.waitForTimeout(300); await page.mouse.click(700, 400); await page.waitForTimeout(300); await log('click map');
    await page.getByTestId('bar-build').click(); await page.waitForTimeout(300); await page.getByTestId('bar-family').click().catch(() => {}); await page.waitForTimeout(300); await log('switch to family');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await log('Esc again');
    await frame(); await page.screenshot({ path: `${out}/a-drawer-closed-1512x860.png` });
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
