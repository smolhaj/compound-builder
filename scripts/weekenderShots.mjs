// The weekender (sim/weekender.ts): the setup tile, the Family tab with people in town, the move-in card, the caught-in-town card,
// the "why slow" text, and the same compound on a weekday and on a Saturday.
//   flock <lock> node scripts/weekenderShots.mjs <outDir> [port=5941] [only]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5941), only = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  const frames = async n => { for (let i = 0; i < (n ?? 2); i++) await page.evaluate(() => window.__cb.qa.renderNow()); };

  // ── the setup screen: the Weekend getaway tile ──
  if (!only || only === 'setup') {
    await page.goto(`http://localhost:${port}/?new&lowrender=0.4&seed=7`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await frames(2);
    await page.getByRole('button', { name: 'Next', exact: true }).click();   // region -> land
    await frames(1);
    await page.getByText('Weekend getaway', { exact: false }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/01-setup-weekend-tile.png` });
    lap('setup tile');
    await page.getByRole('button', { name: 'Next', exact: true }).click();   // land -> family & play
    await page.waitForTimeout(300);
    await page.evaluate(() => { for (const el of document.querySelectorAll('div')) if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY === 'auto') el.scrollTop = 99999; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/02-setup-weekend-money.png` });
    lap('setup money');
  }
  if (only === 'setup') { console.error('done'); process.exit(0); }

  // ── a built compound, as a weekender ──
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.9`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  await frames(3); lap('loaded');
  await page.evaluate(async () => {
    const W = await import('/src/sim/weekender.ts');
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0);
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 13);
    const B = [['farmhouse', -3, -4], ['cottage', 4, -4.5], ['workshop', 6.5, 5], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -8], ['chicken_coop', -4.5, 2.6], ['field', 5, -10]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind + dx, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    // one thing still going up, for the "why slow" text
    g.structures.push({ id: 'cbbarn', kind: 'barn', x: c.x - 9, z: c.z - 1, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null });
    g.lifestyle = 'weekend';
    for (const ps of g.personState) ps.employed = true;
    g.weekend = W.newWeekend(g.people, g.seed, g.site.miles);
    g.money = 180000;
    g.vehicles = [{ id: 'v1', kind: 'pickup', mileage: 130000, condition: 0.8, fuel: 60, oilAt: 128000, serviceAt: 128500 }];
    // a quiet Friday afternoon of the third week: the family is still in town
    const day = 18; g.clock.t = day + (17 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.disaster.mode = 'sandbox';
    window.__wk = { c, g: structuredClone(g) };
    G.setState({ game: g });
    G.getState().advance(0.011);
  });
  await frames(3); lap('built');
  const cam = (x, z, r, pitch, yaw, dy = 0.2) => page.evaluate(([x, z, r, pitch, yaw, dy]) => { const cb = window.__cb; cb.cam.target.set(x, cb.world.groundAt(x, z) + dy, z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw; }, [x, z, r, pitch, yaw, dy]);
  const c = await page.evaluate(() => window.__wk.c);
  const goTo = (day, hour, extra) => page.evaluate(([day, hour, extra]) => {
    const G = window.__cb.game;
    const g = structuredClone(G.getState().game);
    g.clock.t = day + (hour - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    G.setState({ game: g });
    G.getState().advance(0.011);
    return extra;
  }, [day, hour, extra]);
  const hud = on => page.evaluate(on => window.__cb.store.getState().setHudHidden(!on), on);

  // ── Monday, midday: nobody home ──
  await goTo(21, 11);
  await hud(false);
  await cam(c.x - 1, c.z - 2.5, 13, 0.62, 2.6);
  if (!only || only === 'empty') {
    await frames(4); await page.waitForTimeout(800); await frames(2);
    await page.screenshot({ path: `${out}/03-compound-monday-empty.png` });
    lap('monday');
  }
  // ── Saturday, the same view, the family home and the cars in ──
  await goTo(26, 11);
  await frames(3); await page.waitForTimeout(1500); await frames(3);
  if (!only || only === 'empty') {
    await page.screenshot({ path: `${out}/04-compound-saturday-home.png` });
    lap('saturday');
    await cam(c.x - 0.2, c.z + 0.6, 2.8, 0.12, 2.6, 0.12);
    await frames(3); await page.screenshot({ path: `${out}/05-saturday-eye-level.png` });
  }
  await hud(true);

  // ── the Family tab on a weekday evening: who is where ──
  if (!only || only === 'family') {
    await goTo(21, 20);
    await frames(2);
    await page.screenshot({ path: `${out}/06-family-tab-in-town.png` });
    lap('family');
  }
  // ── the Projects tab and the "why slow" text ──
  if (!only || only === 'slow') {
    await page.getByRole('button', { name: /^Projects/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/07-projects-why-slow.png` });
    await page.getByRole('button', { name: /^Build$/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/07b-build-next-step-caretaker.png` });
    lap('slow');
  }
  // ── a caretaker, then the move-in decision card ──
  if (!only || only === 'card') {
    await page.evaluate(async () => {
      const W = await import('/src/sim/weekender.ts');
      const D = await import('/src/sim/disaster.ts');
      const G = window.__cb.game;
      const g = structuredClone(G.getState().game);
      g.disaster.mode = 'scenario'; g.disaster.kind = 'financial'; g.disaster.variant = 'bank_holiday'; g.disaster.phase = 'warning';
      g.disaster.warnAt = g.clock.t - 18; g.disaster.hitAt = g.clock.t + 28;
      g.disaster.news.push({ t: g.clock.t - 3, text: 'Two regional banks fail in a week; lines outside a branch in the city.', tone: 1 }, { t: g.clock.t - 1, text: '"Temporary" withdrawal limits at every bank.', tone: 2 });
      W.hireCaretaker(g, 'visiting');
      g.weekend.askAt = -1;
      void D;
      G.setState({ game: g });
      G.getState().advance(0.0105);
      const gg = structuredClone(G.getState().game);
      W.weekenderDay(gg, 'warning'); gg.weekend.day = -1;
      if (!gg.gate.pending) W.openMoveIn(gg);
      G.setState({ game: gg });
    });
    await frames(2);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/08-move-in-card.png` });
    lap('card');
    // the Family tab with the caretaker and the town house
    await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.gate.pending = null; G.setState({ game: g }); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/09-family-two-homes.png` });
  }
  // ── caught in town ──
  if (!only || only === 'stranded') {
    await page.evaluate(async () => {
      const G = window.__cb.game;
      const g = structuredClone(G.getState().game);
      g.disaster.mode = 'scenario'; g.disaster.kind = 'grid_down'; g.disaster.variant = 'ice_storm'; g.disaster.phase = 'warning'; g.gate.pending = null; g.weekend.caretaker = null;
      g.clock.t = 28 + (21 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));   // Monday 21:00: the family is in town
      g.disaster.warnAt = g.clock.t - 8; g.disaster.hitAt = 28.7;                              // it hits at midnight
      G.setState({ game: g });
      G.getState().advance(0.3);
    });
    await frames(2); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/10-caught-in-town.png` });
    lap('stranded');
  }
  console.error('done');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
