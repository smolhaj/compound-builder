// Dome lockdown, air, ecology and climate (docs/DOME_COMPOUND.md, "Lockdown slice"): the Dome card in layout A and the dome from outside and in.
// Run under the render lock:  flock /tmp/cb.lock node scripts/domeAirShots.mjs <outDir> [set=card,fallout,winter,inside] [port=5973]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], sets = (process.argv[3] || 'card,fallout,winter,inside').split(','), port = Number(process.argv[4] || 5973);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
page.setDefaultTimeout(600000);
page.on('pageerror', e => console.error('pageerror:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.75&layout=a&region=mountain_west&acres=40&lotseed=8`);
await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(350); };
const shot = async name => { await frames(3); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
const pose = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
const info = await page.evaluate(async () => {
  const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
  G.setState(s => ({ game: { ...s.game, money: 500_000_000 } }));
  const putAt = (kind, x, z) => { const before = G.getState().game.structures.length; G.getState().plan(kind, x, z, 0); const gm = G.getState().game; if (gm.structures.length === before) return null; const st = gm.structures.at(-1); return { id: st.id, x: st.x, z: st.z }; };
  const put = (kind, x, z, r = 12) => { const sp = cb.tool.findSpot(kind, x, z, 0, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], 0); const st = G.getState().game.structures.at(-1); return { id: st.id, x: st.x, z: st.z }; };
  const dome = put('dome_geodesic', c.x - 1, c.z - 1, 14);
  const R = 1.25;
  const cab = dome && (putAt('timber_cabin', dome.x - R * 0.3, dome.z - R * 0.2) ?? put('timber_cabin', dome.x - R * 0.3, dome.z - R * 0.2, 0.6));
  const gar = dome && (putAt('garden', dome.x + R * 0.35, dome.z + R * 0.25) ?? put('garden', dome.x + R * 0.35, dome.z + R * 0.2, 0.6));
  const sol = put('solar_farm', c.x + 4, c.z + 3, 10); put('solar_farm', c.x + 6, c.z + 5, 10); put('battery_bank', c.x + 4, c.z + 6, 8);
  G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; }
    if (dome) g.utilities.fittings.push({ building: dome.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
    return { game: g }; });
  cb.store.getState().setBuildingView?.('full'); G.getState().setWelcome?.(false);
  return { dome, cab, gar, sol, camp: [c.x, c.z] };
});
lap(JSON.stringify(info));
if (!info.dome) { console.error('no dome spot'); process.exit(1); }
const D = info.dome, R = 1.25;
const ground = await page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [D.x, D.z]);
/** run the real sim a while (days) with the dome set up by `mut`, in the page */
const sim = (days, mut) => page.evaluate(async ([days, mut]) => {
  const CA = await import('/src/sim/felt/cards.ts'), E = await import('/src/sim/engine.ts'), L = await import('/src/sim/dome/live.ts'), DI = await import('/src/sim/disaster.ts');
  const G = window.__cb.game; let g = structuredClone(G.getState().game);
  new Function('g', 'L', 'DI', mut)(g, L, DI);
  g.gate.pending = null; g.gate.next = 1e9;
  let left = days; while (left > 1e-6) { const d = Math.min(0.05, left); g = E.step(g, d); { const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id); } g.gate.pending = null; g.gate.next = 1e9; left -= d; }
  G.setState({ game: g, dayCard: null, cutscene: null, welcome: false });
  return { dome: g.dome, t: g.clock.t };
}, [days, mut ?? '']);
const drawer = async (page_) => {
  await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' }));
  await page.waitForTimeout(500);
  if (page_) { const b = page.getByTestId(`page-chip-${page_}`); if (await b.count()) await b.click(); }
  await page.mouse.move(700, 400); await page.waitForTimeout(400);
};
const aim = async () => { await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 9; cam.pitch = 0.75; }, [D.x, D.z]); await page.evaluate(() => { window.__cb.qa.pose = null; }); };
const hideHud = () => page.evaluate(() => { for (const e of document.querySelectorAll('body *')) { if (e.tagName === 'CANVAS' || e.closest('canvas')) continue; const cs = getComputedStyle(e); if (cs.position === 'fixed' && !e.querySelector('canvas')) e.style.display = 'none'; } });
const noon = () => page.evaluate(() => { window.__cb.store.getState().setTimeOfDay(12); });
await noon();
await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
if (sets.includes('card')) {
  await aim(); await drawer('dome');
  await shot('01-card-open');
  await sim(0.01, `L.setLockdown(g, true);`);
  await shot('02-card-sealed');
  const r = await sim(3, ``);
  lap('sealed 3 days ' + JSON.stringify({ co2: r.dome.co2ppm, alarm: r.dome.alarm, hours: r.dome.hours, lock: r.dome.lockdown }));
  // run until the low-air alarm shows
  for (let i = 0; i < 40; i++) { const x = await sim(0.1, ``); if (x.dome.alarm !== 'ok' || !x.dome.lockdown) { lap('alarm ' + JSON.stringify({ co2: x.dome.co2ppm, alarm: x.dome.alarm, hours: x.dome.hours, lock: x.dome.lockdown })); break; } }
  await drawer('dome'); await shot('03-card-low-air');
  await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'family' })); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await shot('03b-hud-low-air-topbar');
  // closed ecology running: buy path through the pure functions, then fast-forward its fit
  await sim(0.001, `g.dome = { ...g.dome, lockdown: false, filtering: 'closed', ecoHealth: 1, filterHealth: 1, co2ppm: 420, o2pct: 20.9, alarm: 'ok' }; L.setLockdown(g, true);`);
  await sim(2, ``);
  await aim(); await drawer('dome'); await shot('04-card-ecology-running');
}
if (sets.includes('fallout')) {
  await sim(0.001, `g.dome = undefined; DI.triggerDisaster(g.disaster, g.clock.t, 'nuclear', g.seed, 1); g.disaster.mode='god'; g.disaster.variant='distant'; g.disaster.fate='full'; g.disaster.phase='warning'; L.setLockdown(g, true);`);
  await sim(0.9, ``);
  const r = await sim(0.8, ``);
  lap('fallout sealed ' + JSON.stringify({ dust: r.dome.dust, lock: r.dome.lockdown, co2: r.dome.co2ppm, alarm: r.dome.alarm }));
  await aim(); await drawer('dome'); await shot('05-fallout-sealed-card');
  await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'family' })); await page.keyboard.press('Escape');
  await noon(); await pose([D.x + R * 1.1, ground + R * 2.0 + 1.0, D.z + R * 1.3], [D.x, ground, D.z], 55); await shot('06-fallout-sealed-3d');
  await page.evaluate(() => { window.__cb.qa.pose = null; });
  await sim(0.001, `L.setLockdown(g, false);`);
  const r2 = await sim(0.5, ``);
  lap('fallout opened ' + JSON.stringify({ dust: r2.dome.dust }));
  await aim(); await drawer('dome'); await shot('07-fallout-opened-card');
}
if (sets.includes('winter')) {
  await sim(0.001, `g.disaster.kind = null; g.disaster.phase = 'peace'; g.clock.startDoy = 355; g.clock.t = Math.floor(g.clock.t) + 0.5; g.weather = { active: { kind: 'blizzard', at: 0, until: 999999 }, last: 0 }; g.dome = { ...(g.dome ?? L.newDomeState()), lockdown: false, filtering: 'advanced', mode: 'temperate', dust: 0 };`);
  await sim(0.2, ``);
  await aim(); await drawer('dome'); await shot('08-winter-card');
  await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'family' })); await page.keyboard.press('Escape');
  await noon(); await pose([D.x + R * 1.2, ground + R * 1.4 + 0.8, D.z + R * 1.6], [D.x, ground + 0.3, D.z], 55); await shot('09-winter-3d');
  await page.evaluate(() => { window.__cb.qa.pose = null; });
}
if (sets.includes('inside')) {
  await sim(0.001, `g.disaster.kind = null; g.disaster.phase = 'peace'; g.weather = undefined; g.clock.startDoy = 150; g.dome = { ...(g.dome ?? L.newDomeState()), lockdown: true, filtering: 'closed', ecoHealth: 1, co2ppm: 900 };`);
  await sim(0.3, ``);
  await noon(); await hideHud();
  const IN = [[D.x + R * 0.8, ground + 0.4, D.z - R * 0.2], [D.x - R * 0.1, ground + R * 0.5, D.z + R * 0.55]]; await pose(IN[0], IN[1], 78); await shot('10-inside-ecology');
  await pose([D.x + R * 1.1, ground + R * 2.0 + 1.0, D.z + R * 1.3], [D.x, ground, D.z], 55); await shot('11-above-ecology');
  await sim(0.001, `g.dome = { ...g.dome, lockdown: true, filtering: 'none', co2ppm: 15000, o2pct: 18, dust: 0.8 };`);
  await pose(IN[0], IN[1], 78); await shot('12-inside-bad-air');
  await pose([D.x + R * 1.1, ground + R * 2.0 + 1.0, D.z + R * 1.3], [D.x, ground, D.z], 55); await shot('13-above-bad-air');
}
await browser.close(); vite.kill();
