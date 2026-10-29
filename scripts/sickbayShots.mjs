// People depth part 3b: the sickbay. A patient lying in the farmhouse's sickbay cot with the medic at the bedside (cutaway from above,
// close, and at eye level in the room and through the front door), and a serious case in the bunker's medical corner (underground view).
//   flock $SP/render.lock node scripts/sickbayShots.mjs <outDir> [port=5951] [only=home|bunker|all]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5951), only = process.argv[4] || 'all';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  await frames(); lap('loaded');
  const shot = async (name, o = {}) => { await frames(); await page.screenshot({ path: `${out}/${name}.png`, ...o }); lap(name); };
  // set the sim at an hour and run one step so the roster's tasks follow (a jump of more than 0.05 days puts people straight at their goals)
  const stage = async (hour, patch) => {
    await page.evaluate(([h, patch]) => {
      const G = window.__cb.game, g = structuredClone(G.getState().game);
      g.clock.t = Math.floor(g.clock.t) + (h - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      if (patch) (new Function('g', patch))(g);
      G.setState({ game: g });
      G.getState().advance(0.0125);
    }, [hour, patch]);
    await new Promise(r => setTimeout(r, 700));
    await frames();
    console.error(JSON.stringify(await page.evaluate(() => { const g = window.__cb.game.getState().game; return { t: g.clock.t, tasks: g.personState.map(p => p.task), shown: [...window.__cb.world.family.shown] }; })));
  };

  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts');
    const M = await import('/src/sim/medical.ts');
    const { freshNeeds } = await import('/src/sim/needs.ts');
    const { autoPlan } = await import('/src/sim/daily.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['barn', -9, -7.5], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    let day = Math.floor(g.disaster.hitAt + 120);
    g.clock.t = day + 0.38; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.clock.startDoy = (((231 - day) % 365) + 365) % 365 + 1;   // late August
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.sleeping_bag = 8; g.stock.antibiotics = 2; g.stock.splints = 1;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    G.setState({ game: g });
    G.getState().advance(0.02);
    const g2 = structuredClone(G.getState().game);
    const adults = g2.people.filter(p => !p.kid);
    adults[0].skills.medic = 6;
    window.__who = { medic: adults[0].first, patient: adults[1].first, kid: g2.people.find(p => p.kid).first };
    G.setState({ game: g2 });
  });
  await frames(); lap('built');
  console.error(JSON.stringify(await page.evaluate(() => window.__who)));

  if (only !== 'bunker') {
    // (the door shot comes first when only=door)
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game;
      const { rotQ } = await import('/src/game/buildkit/kit.ts');
      cb.store.getState().setHudHidden(true);
      cb.store.getState().setTimeOfDay(14);
      cb.store.getState().setBuildingView('cutaway');
      const f = G.getState().game.structures.find(s => s.kind === 'farmhouse');
      const [bx, bz] = rotQ(0.53, 0.66, f.rot), [dx, dz] = rotQ(0.0, 1.0, f.rot), [px, pz] = rotQ(-0.45, 1.25, f.rot);
      window.__bed = { x: f.x + bx, z: f.z + bz, door: { x: f.x + dx, z: f.z + dz }, porch: { x: f.x + px, z: f.z + pz }, f: { x: f.x, z: f.z, rot: f.rot } };
    });
    // 13:30: the afternoon's medic hour; the patient has a fever and a bad wound, health down, resting in bed
    await stage(13.5, `
      const adults = g.people.filter(p => !p.kid), i = g.people.indexOf(adults[1]);
      g.personState[i].needs.health = 28;
      g.personState[i].needs.hurt.push({ what: 'a fever', sev: 55 });
      g.personState[g.people.indexOf(adults[0])].task = 'medic';
    `);
    await stage(13.5, `
      const adults = g.people.filter(p => !p.kid), i = g.people.indexOf(adults[1]);
      g.personState[i].task = 'sleep';
      g.personState[g.people.indexOf(adults[0])].task = 'medic';
    `);
    await page.evaluate(() => { const { cam } = window.__cb, b = window.__bed; cam.target.set(b.x, 0.12, b.z); cam.radius = 0.85; cam.pitch = 1.0; cam.yaw = 0.55; });
    await shot('01a-sickbay-cutaway-close');
    await page.evaluate(() => { const { cam } = window.__cb, b = window.__bed; cam.target.set(b.f.x, 0.1, b.f.z); cam.radius = 3.0; cam.pitch = 0.85; cam.yaw = 0.5; });
    await shot('01b-farmhouse-cutaway');
    // eye level in the room, from the doorway: the cot in the corner
    await page.evaluate(() => {
      const cb = window.__cb, b = window.__bed, fl = cb.world.tourHeight(b.x, b.z);
      cb.qa.pose = { x: b.door.x - 0.02, y: fl + 0.27, z: b.door.z - 0.05, lx: b.x, ly: fl + 0.13, lz: b.z, fov: 64 };
    });
    await shot('02a-eye-level-sickbay-from-the-door');
    // eye level through the open front door, standing on the porch, full walls (no cutaway)
    await page.evaluate(() => {
      const cb = window.__cb, b = window.__bed, fl = cb.world.tourHeight(b.x, b.z);
      cb.store.getState().setBuildingView('full');
      cb.qa.pose = { x: b.porch.x, y: fl + 0.27, z: b.porch.z, lx: b.x, ly: fl + 0.13, lz: b.z, fov: 60 };
    });
    await shot('02b-eye-level-through-the-front-door');
    await page.evaluate(() => { const cb = window.__cb; cb.qa.pose = null; cb.store.getState().setBuildingView('cutaway'); });
    // the medic and the patient from the foot of the bed at eye level
    await page.evaluate(() => {
      const cb = window.__cb, b = window.__bed, fl = cb.world.tourHeight(b.x, b.z);
      cb.qa.pose = { x: b.x - 0.4, y: fl + 0.22, z: b.z + 0.04, lx: b.x, ly: fl + 0.15, lz: b.z, fov: 58 };
    });
    await shot('02c-eye-level-foot-of-the-bed');
    await page.evaluate(() => { window.__cb.qa.pose = null; });
  }

  if (only !== 'home') {
    // a serious case goes to the bunker's medical corner: build the bunker (hatch, corridor, dorm, medical, galley), put the worst case there
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp;
      window.__bm = {};
      const place = (kind, dx, dz, rot = 0) => { const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot, 6); if (!sp) { console.warn('no spot', kind); return; } G.getState().plan(kind, sp[0], sp[1], rot); window.__bm[kind] = G.getState().game.structures.at(-1); };
      place('bunker_hatch', 0.25, -6.75); place('bunker_corridor', 1.0, -6.75, 1); place('bunker_dorm', 2.25, -7.75); place('bunker_medical', 2.25, -5.5); place('bunker_galley', 2.25, -6.5);
      G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) if (st.kind.startsWith('bunker_')) { st.stage = 5; st.done = 0; st.finishedAt = 0; st.supplied = true; } return { game: g }; });
      cb.qa.pose = null; cb.store.getState().setHudHidden(true); cb.store.getState().setUnderground(true);
    });
    await new Promise(r => setTimeout(r, 1200));
    await stage(13.5, `
      const adults = g.people.filter(p => !p.kid), i = g.people.indexOf(adults[1]);
      for (const ps of g.personState) { ps.needs.hurt = []; ps.needs.health = 80; }
      g.personState[i].needs.health = 24;
      g.personState[i].needs.hurt.push({ what: 'a gunshot wound', sev: 72 });
      g.personState[i].task = 'sleep';
      g.personState[g.people.indexOf(adults[0])].task = 'medic';
    `);
    await stage(13.5, `
      const adults = g.people.filter(p => !p.kid), i = g.people.indexOf(adults[1]);
      g.personState[i].task = 'sleep';
      g.personState[g.people.indexOf(adults[0])].task = 'medic';
    `);
    await page.evaluate(() => { const cb = window.__cb, b = window.__bm.bunker_medical; cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = 3.2; cb.cam.pitch = 0.85; cb.cam.yaw = 0.7; });
    await shot('03a-bunker-medical-corner-underground');
    await page.evaluate(() => { const cb = window.__cb, b = window.__bm.bunker_medical; cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = 7; cb.cam.pitch = 0.95; cb.cam.yaw = 0.5; });
    await shot('03b-bunker-underground-wide');
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
