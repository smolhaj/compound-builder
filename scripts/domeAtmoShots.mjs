// Dome atmosphere (docs/DOME_COMPOUND.md "Atmosphere slice"): two domes each with their own air, the comfort band on a hot day and in a blizzard,
// the rain and water loop panel, a dome radio line, a dome felt card and the fallout decision with the dome branch.
// Run under the render lock:  flock /tmp/cb.lock node scripts/domeAtmoShots.mjs <outDir> [set=domes,hot,blizzard,water,radio,cards,nuclear] [port=5977]
// The 3D scene does not draw weather inside or outside a dome: the panels carry the climate story, and the 3D shots only show the shell and its haze.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], sets = (process.argv[3] || 'domes,hot,blizzard,water,radio,cards,nuclear').split(','), port = Number(process.argv[4] || 5977);
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
const info = await page.evaluate(async () => {
  const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
  G.setState(s => ({ game: { ...s.game, money: 500_000_000 } }));
  const put = (kind, x, z, r = 12) => { const sp = cb.tool.findSpot(kind, x, z, 0, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], 0); const st = G.getState().game.structures.at(-1); return { id: st.id, x: st.x, z: st.z }; };
  const a = put('dome_geodesic', c.x - 1, c.z - 1, 14), b = put('dome_geodesic', c.x + 4, c.z - 1, 14);
  const cabA = a && put('timber_cabin', a.x - 0.3, a.z - 0.2, 0.6), cabB = b && put('timber_cabin', b.x - 0.3, b.z - 0.2, 0.6);
  const garB = b && put('garden', b.x + 0.4, b.z + 0.3, 0.6), barnB = b && put('barn', b.x - 0.5, b.z + 0.4, 0.6);
  for (let i = 0; i < 6; i++) put('solar_farm', c.x + 3 + 2 * i, c.z + 6 + (i % 2) * 2, 10); for (let i = 0; i < 3; i++) put('battery_bank', c.x + 3 + 1.5 * i, c.z + 11, 8); put('cistern', c.x + 1, c.z + 5, 8);
  G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; }
    for (const d of [a, b]) if (d) g.utilities.fittings.push({ building: d.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
    return { game: g }; });
  cb.store.getState().setBuildingView?.('full'); G.getState().setWelcome?.(false);
  return { a, b, cabA, cabB, garB, barnB };
});
lap(JSON.stringify(info));
if (!info.a || !info.b) { console.error('no dome spots'); process.exit(1); }
/** run the real sim a while in the page, with `mut` applied first */
const sim = (days, mut, hour) => page.evaluate(async ([days, mut, hour]) => {
  const CA = await import('/src/sim/felt/cards.ts'), E = await import('/src/sim/engine.ts'), L = await import('/src/sim/dome/live.ts'), DI = await import('/src/sim/disaster.ts');
  const G = window.__cb.game; let g = structuredClone(G.getState().game);
  new Function('g', 'L', 'DI', mut)(g, L, DI);
  g.gate.pending = null; g.gate.next = 1e9;
  const ST = await import('/src/sim/state.ts'); let left = days; if (hour != null) left += (((hour - ST.hourOf(g.clock.t)) % 24) + 24) % 24 / 24;
  while (left > 1e-6) { const d = Math.min(0.05, left); g = E.step(g, d); { const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id); } g.gate.pending = null; g.gate.next = 1e9; left -= d; }
  G.setState({ game: g, dayCard: null, cutscene: null, welcome: false });
  const ds = L.domesOf(g);
  return ds.map(d => { const s = L.stateOf(g, d); return { id: d.st.id, label: L.domeLabel(g, d), lock: s.lockdown, indoorF: Math.round(s.indoorF), outF: Math.round(s.outF), stage: s.stage, hours: s.hours, cards: s.cards, kwh: Math.round(s.kwhDay), powered: s.powered, rain: s.rainGalDay, saved: s.savedGalDay, pads: s.waterGalDay }; });
}, [days, mut ?? '', hour ?? null]);
const drawer = async (pg, pick) => {
  await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' }));
  await page.waitForTimeout(500);
  if (pg) { const b = page.getByTestId(`page-chip-${pg}`); if (await b.count()) await b.click(); }
  if (pick) { const c = page.getByTestId(`dome-card-${pick}`); if (await c.count()) await c.click(); }
  await page.mouse.move(700, 400); await page.waitForTimeout(400);
};
const scroll = async y => { await page.evaluate(y => { for (const e of document.querySelectorAll('[data-testid=dome-panel]')) { let p = e; while (p) { if (p.scrollHeight > p.clientHeight + 4 && getComputedStyle(p).overflowY !== 'visible') { p.scrollTop = y; break; } p = p.parentElement; } } }, y); await page.waitForTimeout(300); };
const noon = () => page.evaluate(() => { window.__cb.store.getState().setTimeOfDay(14); });
await noon();
await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
const NOEVENT = `g.disaster.kind = null; g.disaster.phase = 'peace'; g.weather = undefined;`;
if (sets.includes('domes')) {
  // dome 2 sealed with a cabin under it, dome 1 open
  const r = await sim(0.4, `${NOEVENT} L.setLockdown(g, true, ${JSON.stringify(info.b.id)}); L.ownState(g, L.domeOf(g, ${JSON.stringify(info.a.id)})).filtering = 'advanced'; L.ownState(g, L.domeOf(g, ${JSON.stringify(info.b.id)})).filtering = 'scrubber';`);
  lap(JSON.stringify(r));
  await drawer('dome'); await shot('01-two-domes-top');
  await drawer('dome', info.b.id); await shot('02-second-dome-selected');
}
if (sets.includes('hot')) {
  const r = await sim(0, `${NOEVENT} g.clock.startDoy = 190; g.utilities.grid = true; g.weather = { active: { kind: 'heat_wave', at: 0, until: 9999 }, last: 0 }; for (const id of [${JSON.stringify(info.a.id)}, ${JSON.stringify(info.b.id)}]) { const s = L.ownState(g, L.domeOf(g, id)); s.mode = 'comfortable'; s.lockdown = false; }`, 14.5);
  lap('hot ' + JSON.stringify(r));
  await drawer('dome', info.a.id); await scroll(380); await shot('03-hot-day-comfort-band');
  await sim(0.05, `L.setLockdown(g, true, ${JSON.stringify(info.a.id)});`);
  await drawer('dome', info.a.id); await scroll(380); await shot('04-hot-day-sealed');
  // the unpowered shell
  const r2 = await sim(0.05, `g.utilities.fittings = g.utilities.fittings.filter(f => f.building !== ${JSON.stringify(info.b.id)});`);
  lap('unpowered ' + JSON.stringify(r2));
  await drawer('dome', info.b.id); await scroll(380); await shot('05-hot-day-no-power');
  await sim(0.001, `g.utilities.fittings.push({ building: ${JSON.stringify(info.b.id)}, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });`);
}
if (sets.includes('blizzard')) {
  const r = await sim(0, `${NOEVENT} g.clock.startDoy = 20; g.utilities.grid = true; g.weather = { active: { kind: 'blizzard', at: 0, until: 9999 }, last: 0 }; for (const id of [${JSON.stringify(info.a.id)}, ${JSON.stringify(info.b.id)}]) { const s = L.ownState(g, L.domeOf(g, id)); s.mode = 'temperate'; s.lockdown = false; }`, 14.5);
  lap('blizzard ' + JSON.stringify(r));
  await drawer('dome', info.a.id); await scroll(380); await shot('06-blizzard-comfort-band');
}
if (sets.includes('water')) {
  await sim(0.001, `${NOEVENT} g.clock.startDoy = 120; L.buyLoop(g, 'recycle', ${JSON.stringify(info.b.id)}); L.buyLoop(g, 'grey', ${JSON.stringify(info.a.id)});`);
  const r = await sim(1.2, ``, 14.5);
  lap('water ' + JSON.stringify(r));
  await drawer('dome', info.b.id); await scroll(900); await shot('07-rain-and-water-loop');
  await sim(0.001, `const s = L.ownState(g, L.domeOf(g, ${JSON.stringify(info.b.id)})); s.loopDownUntil = g.clock.t + 4; s.cards.push('loop');`);
  await drawer('dome', info.b.id); await scroll(900); await shot('08-water-loop-failed');
}
if (sets.includes('radio')) {
  const heard = await page.evaluate(async ([a, b]) => {
    const L = await import('/src/sim/dome/live.ts'), DI = await import('/src/sim/disaster.ts'), R = await import('/src/sim/radio.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    g.disaster.mode = 'god'; g.disaster.phase = 'peace'; DI.triggerDisaster(g.disaster, g.clock.t, 'nuclear', g.seed, 0);
    g.disaster.phase = 'survival'; g.stock.sw_radio = 1; L.setLockdown(g, true, b); g.clock.t = g.disaster.hitAt + 3.2;
    let found = null;
    for (let i = 0; i < 200 && !found; i++) { g.clock.t += 1; g.disaster.fx = undefined; R.radioDay(g); const n = g.disaster.news.at(-1); if (n && /dome|glass house|airlock|sealed/i.test(n.text)) found = n.text; }
    g.clock.speed = 0; g.gate.pending = null; G.setState({ game: g, resumeTo: null, dayCard: null, cutscene: null });
    return { found, news: g.disaster.news.slice(-3).map(x => x.text) };
  }, [info.a.id, info.b.id]);
  lap('radio ' + JSON.stringify(heard));
  await page.evaluate(() => { window.__cb.store.setState({ hudHidden: false }); });
  await frames(3);
  if (!(await page.getByRole('dialog', { name: 'Compound board' }).count())) await page.getByRole('button', { name: /^Board/ }).first().click();
  await page.getByRole('button', { name: 'Radio', exact: true }).first().click().catch(() => {}); await page.mouse.move(300, 500); await page.waitForTimeout(500); await frames(3); await shot('09-dome-radio-line-board');
  await page.keyboard.press('Escape');
}
if (sets.includes('nuclear')) {
  const card = await page.evaluate(async ([a, b]) => {
    const DI = await import('/src/sim/disaster.ts'), CA = await import('/src/sim/felt/cards.ts'), FS = await import('/src/sim/felt/registry.ts');
    const G = window.__cb.game; window.__cb.store.setState({ hudHidden: false });
    G.setState(s => {
      const g = structuredClone(s.game);
      g.disaster.mode = 'god'; g.disaster.phase = 'peace'; g.disaster.fx = undefined; g.gate.pending = null; g.gate.card = null;
      DI.triggerDisaster(g.disaster, g.clock.t, 'nuclear', g.seed, 0);
      g.clock.t = g.disaster.hitAt + 1; g.clock.speed = 0; g.money = 90000;
      CA.feltCards(g, { day: 1, r: () => 0.5, once: () => true }, FS.feltSpec('nuclear'));
      return { game: g, resumeTo: null, dayCard: null };
    });
    return CA.pendingCard(G.getState().game)?.id ?? null;
  }, [info.a.id, info.b.id]);
  lap('nuclear card ' + card);
  await page.waitForSelector('[role=dialog]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600); await shot('10-nuclear-chain-dome-branch');
}
if (sets.includes('cards')) {
  await page.keyboard.press('Escape');
  await page.evaluate(async ([b]) => {
    const L = await import('/src/sim/dome/live.ts'), G = window.__cb.game; const g = structuredClone(G.getState().game);
    g.disaster.kind = null; g.disaster.phase = 'peace'; g.weather = undefined; g.disaster.fx = undefined;
    const s = L.ownState(g, L.domeOf(g, b)); s.mode = 'comfortable'; s.cards = ['hot', 'stock']; s.indoorF = 99; s.stress = 0.8;
    G.setState({ game: g, dayCard: null, cutscene: null, resumeTo: null });
  }, [info.b.id]);
  await page.evaluate(() => { window.__cb.game.getState().focusHud({ right: 'family' }); });
  await page.waitForTimeout(500);
  if (!(await page.getByRole('dialog', { name: 'Compound board' }).count())) await page.getByRole('button', { name: /^Board/ }).first().click().catch(() => {});
  await page.getByRole('button', { name: 'Status', exact: true }).first().click().catch(() => {}); await page.mouse.move(300, 500); await page.waitForTimeout(500);
  await frames(3); await shot('11-dome-felt-cards-board');
}
await browser.close(); vite.kill();
