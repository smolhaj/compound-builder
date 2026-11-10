/**
 * An animal crossing a tunnel-bridge, in a real game on a gorge lot (the sim finds the span; the real WildlifeRenderer walks the deer over the deck).
 *   flock $SP/render.lock node scripts/wildlifeBridgeShots.mjs --out shots/wildlife-bridge [--port 5496] [--serve] [--q medium]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5496)), outDir = resolve(opt('--out', 'shots/wildlife-bridge')), q = opt('--q', 'medium');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?clean&lowrender=0.75&seed=7&lot=gorge&relief=9&acres=40&region=mountain_west&lotseed=3`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 900000 });
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('medium'); store.getState().setTimeOfDay(11); store.getState().setWeatherMode('clear'); });
const sp = await page.evaluate(async () => {
  const cb = window.__cb, G = cb.game, m = await import('/src/sim/terrainFx.ts'), s = m.gorgeSpan(G.getState().game);
  if (!s) return null;
  const problem = G.getState().planSpan('tunnel_bridge', s.a, s.b);
  G.setState(st => { const g = structuredClone(st.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } g.clock.t += 0.02; return { game: g }; });
  return { a: s.a, b: s.b, problem };
});
console.error('span', JSON.stringify(sp));
if (!sp) { await browser.close(); vite?.kill(); process.exit(2); }
for (let i = 0; i < 10; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(150); }
const frames = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(300); };
const shot = async name => { await frames(); await frames(); await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
// a deer comes to the mouth; the real renderer walks it over the deck (spawnDebug + the world's own bridge list)
const info = await page.evaluate(async () => {
  const cb = window.__cb, w = cb.world, W = await import('/src/game/wildlife/wildlifeCrossing.ts');
  const bridges = w._wildBridges();
  if (!bridges.length) return { bridges: 0 };
  const br = bridges[0];
  w.wildlife.spawnDebug('deer', br.mouth[0][0], br.mouth[0][1], 0, true, 'free');
  const b = [...w.wildlife._beasts.values()].find(x => x.id.startsWith('qa:deer'));
  b.deck = W.deckFrom(br, 0); b.x = br.mouth[0][0]; b.z = br.mouth[0][1];
  window.__bridge = br;
  return { bridges: bridges.length, deckPts: br.deck.length, y0: br.deck[0][2], opens: !(w.doorLock ?? false) };
});
console.error('bridge', JSON.stringify(info));
if (!info.bridges) { await browser.close(); vite?.kill(); process.exit(3); }
// walk it a third, then two thirds of the way over; log the height and the position each time
const step = n => page.evaluate(n => { const cb = window.__cb, w = cb.world, g = cb.game.getState().game; for (let i = 0; i < n; i++) { w.updateWildlife(0.1, g, 1); w.updateDoors(0.1, g); } const b = [...w.wildlife._beasts.values()].find(x => x.id.startsWith('qa:deer')); return { x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: b.y === undefined ? null : +b.y.toFixed(2), deck: !!b.deck, ground: +w.groundAt(b.x, b.z).toFixed(2) }; }, n);
const len = await page.evaluate(() => { const br = window.__bridge; return Math.hypot(br.mouth[1][0] - br.mouth[0][0], br.mouth[1][1] - br.mouth[0][1]); });
const walk = 0.2, secs = len / walk, third = Math.round(secs / 0.1 / 3);
const cam = (eye, tgt, fov = 55) => page.evaluate(([e, t, f]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: t[0], ly: t[1], lz: t[2], fov: f }; }, [eye, tgt, fov]);
const geo = await page.evaluate(() => { const br = window.__bridge, ux = br.mouth[1][0] - br.mouth[0][0], uz = br.mouth[1][1] - br.mouth[0][1], l = Math.hypot(ux, uz); return { ux: ux / l, uz: uz / l, ax: br.mouth[0][0], az: br.mouth[0][1] }; });
// the deer steps in at the near door (day: the leaves stand open), then deeper on the deck
let st = await step(60); console.error('just inside', JSON.stringify(st));
await cam([geo.ax - geo.ux * 3.2 - geo.uz * 0.5, st.y + 0.32, geo.az - geo.uz * 3.2 + geo.ux * 0.5], [st.x, st.y + 0.1, st.z], 55); await shot('1-eye-deer-in-the-open-door');
// the same moment from beside the span
await cam([st.x - geo.uz * 5 - geo.ux * 2, st.y + 0.8, st.z + geo.ux * 5 - geo.uz * 2], [st.x, st.y + 0.1, st.z], 50); await shot('2-from-the-side-door-and-deer');
// the cutaway views: the tube opened so the deer on the deck shows, high over the gorge bed
st = await step(250); console.error('on the span', JSON.stringify(st));
for (const [mode, name] of [['cutaway', '3-cutaway-deer-on-the-deck'], ['xray', '3b-xray-deer-on-the-deck']]) {
  await page.evaluate(m => { try { window.__cb.store.getState().setBuildingView(m); } catch (e) { console.error('view', String(e)); } }, mode);
  await page.waitForTimeout(600);
  await cam([st.x - geo.uz * 4 - geo.ux * 1.5, st.y + 1.2, st.z + geo.ux * 4 - geo.uz * 1.5], [st.x, st.y + 0.05, st.z], 50); await shot(name);
}
await page.evaluate(() => { const s = window.__cb.store.getState(); s.setBuildingView('full'); s.setUnderground(true); });
await page.waitForTimeout(600);
await cam([st.x - geo.uz * 4 - geo.ux * 1.5, st.y + 1.2, st.z + geo.ux * 4 - geo.uz * 1.5], [st.x, st.y + 0.05, st.z], 50); await shot('3c-underground-deer-on-the-deck');
await browser.close(); vite?.kill();
