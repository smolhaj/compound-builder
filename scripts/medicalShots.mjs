// People depth part 2: the Family tab's Medical section (patients, supplies, an epidemic's quarantine choice), the next-step card,
// the medic tending at the house door at eye level, and the bunker's medical corner (underground view).
//   flock $SP/render.lock node scripts/medicalShots.mjs <outDir> [port=5944] [only=ui|world|all]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5944), only = process.argv[4] || 'all';
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

  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts');
    const Mind = await import('/src/sim/mind.ts');
    const Sk = await import('/src/sim/skills.ts');
    const { freshNeeds } = await import('/src/sim/needs.ts');
    const { autoPlan } = await import('/src/sim/daily.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['cottage', 5.2, -4.4], ['barn', -9, -7.5], ['metal_garage', 6.8, 2.4], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9], ['workshop', -6, 3], ['chicken_coop', -8, -1.5]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    g.clock.t = Math.floor(g.disaster.hitAt + 120) + 0.38; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));   // about 3 pm
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.sleeping_bag = 8; g.stock.games = 1; g.stock.novels = 1;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    // a grandfather who knows the garden and the saw, and a teenager who does not yet
    const base = g.people.find(p => !p.kid);
    const add = (o) => { const p = { ...structuredClone(base), ...o, skills: { ...base.skills, ...o.skills } }; delete p.job; delete p.partner; delete p.conditions; delete p.parents; g.people.push(p); g.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 }); return p; };
    const elder = add({ id: 'p7', first: 'Walt', age: 71, elder: true, kin: true, skills: { gardener: 8, builder: 7, mechanic: 5, hunter: 4, teacher: 4 } });
    const teen = add({ id: 'p8', first: 'Jonah', age: 14, kid: true, kin: true, skills: { gardener: 1, builder: 2, mechanic: 1, hunter: 1 } });
    G.setState({ game: g });
    G.getState().advance(0.02);
    const g2 = structuredClone(G.getState().game);
    const [a, b] = g2.people.filter(p => !p.kid && !p.elder);
    const M = await import('/src/sim/medical.ts');
    g2.stock.antibiotics = 1; g2.stock.splints = 0; g2.stock.meds = 0.5; g2.stock.ors = 0;
    a.skills.medic = 6; g2.disaster.tracks.medical = 0;
    g2.mind = Mind.newMind(); g2.learning = Sk.newLearning();
    // Wren broke an arm felling (set by Elena), the elder has dysentery and no salts, Hannah has a flu with the house catching it
    M.startCase(g2, b.id, 'fracture', 45, { bone: 'arm', set: 'good', care: 'arm set and splinted' }, 'broken arm');
    M.startCase(g2, elder.id, 'dysentery', 55, { src: 'water' }, 'dysentery');
    const teenIdx = g2.people.findIndex(p => p.id === 'p8');
    M.startCase(g2, teen.id, 'flu', 40, { src: 'contact' }, 'flu');
    M.startCase(g2, a.id, 'wound', 25, {}, 'a gash from the axe');
    M.medicalDay(g2);
    M.medicalOf(g2).lasting[b.id] = ['a stiff wrist'];
    g2.personState.find(x => x.id === a.id).task = 'medic';
    autoPlan(g2, { build: false, fell: false });
    window.__who = { a: a.first, b: b.first, elder: elder.first, teen: teen.first, teenIdx };
    G.setState({ game: g2 });
  });
  await frames(); lap('built');
  console.error(JSON.stringify(await page.evaluate(() => window.__who)));

  if (only !== 'world') {
    await page.getByRole('button', { name: 'Family' }).first().click().catch(() => {});
    await frames();
    await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => d.firstChild?.textContent === 'Medical'); el?.scrollIntoView({ block: 'start' }); });
    await frames();
    await page.screenshot({ path: `${out}/01-family-medical.png`, clip: { x: 940, y: 0, width: 340, height: 900 } }); lap('01-family-medical');
    await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => d.firstChild?.textContent === 'Medical'); el?.parentElement?.scrollTo?.(0, 0); document.querySelectorAll('div').forEach(d => { if (d.scrollTop) d.scrollTop = 0; }); });
    await frames();
    await page.screenshot({ path: `${out}/02-family-top.png`, clip: { x: 940, y: 0, width: 340, height: 900 } }); lap('02-family-top');
    await page.getByRole('button', { name: 'Build' }).first().click().catch(() => {});
    await frames();
    await page.screenshot({ path: `${out}/03-next-step.png`, clip: { x: 0, y: 0, width: 340, height: 560 } }); lap('03-next-step');
  }

  if (only !== 'ui') {
    // 4. the medic at the door of the house, eye level (and the whole yard from above)
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game; const g = structuredClone(G.getState().game);
      for (const ps of g.personState) if (ps.task === 'medic') ps.task = 'medic';
      G.setState({ game: g });
      G.getState().advance(0.005);
      cb.store.getState().setHudHidden(true);
      cb.store.getState().setTimeOfDay(15);
      cb.store.getState().setBuildingView('cutaway');
    });
    await frames();
    for (const [k, ang] of [['a', 0.6], ['b', 2.2], ['c', 3.8], ['d', 5.3]].filter(x => only !== 'medic' || ['a', 'c'].includes(x[0]))) {
      const info = await page.evaluate(ang => {
        const { cam, world } = window.__cb;
        const g = window.__cb.game.getState().game;
        const m = g.people.find((p, i) => g.personState[i].task === 'medic');
        const ps = world.family.positions();
        const el = ps.find(p => p.id === m?.id) ?? ps[0];
        const [ex, ez] = world.openSpotNear(el.x + Math.cos(ang) * 4.2, el.z + Math.sin(ang) * 4.2, 0.6);
        cam.placeEye(ex, ez, el.x, el.z, 0.9);
        return { medic: m?.first, el, ex, ez };
      }, ang);
      console.error(JSON.stringify(info));
      await shot(`04${k}-eye-level-medic`);
    }
    if (only === 'medic') { await browser.close(); vite.kill(); process.exit(0); }
    // 5. the bunker's medical corner, underground view
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp;
      window.__bm = {};
      const place = (kind, dx, dz, rot = 0) => { const sp = cb.tool.findSpot(kind, c.x + dx, c.z + dz, rot, 6); if (!sp) { console.warn('no spot', kind); return; } G.getState().plan(kind, sp[0], sp[1], rot); window.__bm[kind] = G.getState().game.structures.at(-1); };
      place('bunker_hatch', 0.25, -6.75); place('bunker_corridor', 1.0, -6.75, 1); place('bunker_dorm', 2.25, -7.75); place('bunker_medical', 2.25, -5.5); place('bunker_galley', 2.25, -6.5);
      G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) if (st.kind.startsWith('bunker_')) { st.stage = 5; st.done = 0; st.finishedAt = 0; st.supplied = true; } return { game: g }; });
      cb.qa.pose = null; cb.store.getState().setHudHidden(true); cb.store.getState().setUnderground(true);
      const b = window.__bm.bunker_medical; if (b) { cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = 7; cb.cam.pitch = 0.95; cb.cam.yaw = 0.5; }
    });
    await shot('05a-bunker-medical-underground-aerial');
    await page.evaluate(() => { const cb = window.__cb, b = window.__bm.bunker_medical; if (b) { cb.cam.target.set(b.x, 0, b.z); cb.cam.radius = 3.2; cb.cam.pitch = 0.8; cb.cam.yaw = 0.9; } });
    await shot('05b-bunker-medical-underground-close');
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
