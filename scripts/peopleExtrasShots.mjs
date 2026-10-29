// People depth part 3 (coping goods, courses, drills): the Shop's "Courses & evenings" shelf, the Family tab (evenings, classes and
// drills), the roster's "who should do what", the goods on the family's table (from above in the cutaway, and at eye level through the
// door with a person at the table), an evening class round the table and the firing line.
//   flock $SP/render.lock node scripts/peopleExtrasShots.mjs <outDir> [port=5947] [only=ui|world|all]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5947), only = process.argv[4] || 'all';
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
    const Ev = await import('/src/sim/evenings.ts');
    const Co = await import('/src/sim/courses.ts');
    const { freshNeeds } = await import('/src/sim/needs.ts');
    const { autoPlan } = await import('/src/sim/daily.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    // a timber cabin is the home (its table has seats); a barn, the well and a garden round it
    const B = [['timber_cabin', -3, -4], ['barn', -9, -7.5], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9], ['workshop', -6, 3]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    // a drill day, about 8 pm (class) is set below; start at 3 pm
    let day = Math.floor(g.disaster.hitAt + 120);
    while (!(day % 7 === 5)) day++;
    g.clock.t = day + 0.38; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.clock.startDoy = (((231 - day) % 365) + 365) % 365 + 1;   // late August: no snow on the floors
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.sleeping_bag = 8;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    const base = g.people.find(p => !p.kid);
    const add = (o) => { const p = { ...structuredClone(base), ...o, skills: { ...base.skills, ...o.skills } }; delete p.job; delete p.partner; delete p.conditions; delete p.parents; g.people.push(p); g.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 }); return p; };
    const elder = add({ id: 'p7', first: 'Walt', age: 71, elder: true, kin: true, skills: { gardener: 8, builder: 7, mechanic: 5, hunter: 4, teacher: 4, medic: 5 } });
    G.setState({ game: g });
    G.getState().advance(0.02);
    const g2 = structuredClone(G.getState().game);
    const adults = g2.people.filter(p => !p.kid && !p.elder);
    const [a, b] = adults;
    // the evenings' goods: some worn, one on the shelf to put it right; the cards are wearing thin
    g2.stock.games = 2; g2.stock.instrument = 1; g2.stock.novels = 1; g2.stock.toys = 1; g2.stock.picture_books = 1; g2.stock.music_player = 1; g2.stock.batteries = 1;
    g2.stock.game_pieces = 0; g2.stock.guitar_strings = 1;
    const E = Ev.eveningsOf(g2); E.cond.games = 0.3; E.cond.guitar = 0.55; E.cond.books = 0.8; E.cond.toys = 0.9;
    // a class: the elder (medicine 5) teaches Wren (b) first aid from the book set; a ham licence already on the fridge; two drills a week
    g2.stock.course_firstaid = 1; g2.stock.course_welding = 0; g2.stock.course_ham = 1;
    b.skills.medic = 1;
    Co.enroll(g2, 'firstaid', b.id, 'teacher', elder.id);
    Co.coursesOf(g2).enrolled[0].done = 8;
    Co.coursesOf(g2).certs.push({ pid: a.id, course: 'ham', at: g2.clock.t - 40, mode: 'book' });
    g2.armory.guns.push({ id: 'gA', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: a.id }, { id: 'gB', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: b.id });
    g2.armory.ammo['22lr'] = 240;
    Co.setDrills(g2, 2, true);
    Co.coursesOf(g2).drills.ready[a.id] = 0.45;
    autoPlan(g2, { build: false, fell: false });
    window.__who = { a: a.first, b: b.first, elder: elder.first };
    G.setState({ game: g2 });
  });
  await frames(); lap('built');
  console.error(JSON.stringify(await page.evaluate(() => window.__who)));

  if (only !== 'world' && only !== 'drill') {
    // 1. the shop shelf
    await page.evaluate(() => window.__cb.game.getState().openShop(true, 'learning'));
    await frames();
    await page.screenshot({ path: `${out}/01-shop-learning.png` }); lap('01-shop-learning');
    await page.evaluate(() => window.__cb.game.getState().openShop(false));
    // 2. the Family tab: the evenings, classes and drills
    await page.getByRole('button', { name: 'Family' }).first().click().catch(() => {});
    await frames();
    for (const [i, title] of [['02a', 'How everyone is'], ['02b', 'Classes and drills']]) {
      await page.evaluate(t => { const el = [...document.querySelectorAll('div')].find(d => d.firstChild?.textContent === t); el?.scrollIntoView({ block: 'start' }); }, title);
      await frames();
      await page.screenshot({ path: `${out}/${i}-family-${title.split(' ')[0].toLowerCase()}.png`, clip: { x: 940, y: 0, width: 340, height: 900 } }); lap(i);
    }
    // 3. the roster window
    await page.evaluate(() => window.__cb.game.getState().openSchedule(true));
    await frames();
    await page.screenshot({ path: `${out}/03-roster.png` }); lap('03-roster');
    await page.evaluate(() => window.__cb.game.getState().openSchedule(false));
  }

  if (only !== 'ui') {
    // stage the sim at an hour: everyone is placed where the roster has them (a jump of more than 0.05 days puts people straight at their goal)
    const stage = async (hour) => {
      await page.evaluate(h => {
        const G = window.__cb.game, g = structuredClone(G.getState().game);
        g.clock.t = Math.floor(g.clock.t) + (h - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
        G.setState({ game: g });
        G.getState().advance(0.0125);
      }, hour);
      await new Promise(r => setTimeout(r, 700));
      await frames();
      console.error(JSON.stringify(await page.evaluate(() => { const g = window.__cb.game.getState().game; return { t: g.clock.t, tasks: g.personState.map(p => p.task), shown: [...window.__cb.world.family.shown] }; })));
    };
    // 4. the goods on the family's table: from above in the cutaway, and at eye level in the room
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game;
      const { rotQ } = await import('/src/game/buildkit/kit.ts');
      cb.store.getState().setHudHidden(true);
      cb.store.getState().setTimeOfDay(15);
      cb.store.getState().setBuildingView('cutaway');
      const cab = G.getState().game.structures.find(s => s.kind === 'timber_cabin');
      const [tx, tz] = rotQ(-0.25, 0.02, cab.rot);
      const [dx, dz] = rotQ(-0.13, 0.62, cab.rot);
      window.__table = { x: cab.x + tx, z: cab.z + tz, door: { x: cab.x + dx, z: cab.z + dz }, cab: { x: cab.x, z: cab.z, rot: cab.rot } };
      G.setState(s => ({ game: { ...s.game } }));
    });
    if (only !== 'drill') {
    await stage(15.2);
    await page.evaluate(() => { const { cam } = window.__cb, t = window.__table; cam.target.set(t.x, 0.1, t.z); cam.radius = 0.55; cam.pitch = 1.15; cam.yaw = 0.5; });
    await shot('04a-table-aerial-close');
    await page.evaluate(() => { const { cam } = window.__cb, t = window.__table; cam.target.set(t.x, 0.05, t.z); cam.radius = 2.4; cam.pitch = 0.9; cam.yaw = 0.4; });
    await shot('04b-cabin-cutaway');
    // an evening class: the elder and the student round the table, seated
    await stage(19.5);
    await page.evaluate(() => { const { cam } = window.__cb, t = window.__table; cam.target.set(t.x, 0.1, t.z); cam.radius = 0.95; cam.pitch = 0.9; cam.yaw = 0.5; });
    await shot('05a-class-round-the-table');
    // eye level in the room, a person at the table: standing at the door, looking at the table
    await page.evaluate(() => {
      const cb = window.__cb, t = window.__table, fl = cb.world.tourHeight(t.x, t.z) + 0.0;
      cb.qa.pose = { x: t.door.x, y: fl + 0.27, z: t.door.z, lx: t.x, ly: fl + 0.2, lz: t.z, fov: 62 };
    });
    await shot('05b-eye-level-class-at-the-table');
    await page.evaluate(() => { const cb = window.__cb, t = window.__table, fl = cb.world.tourHeight(t.x, t.z); cb.qa.pose = { x: t.x + 0.16, y: fl + 0.4, z: t.z + 0.16, lx: t.x, ly: fl + 0.14, lz: t.z, fov: 62 }; });
    await shot('05c-eye-level-goods-on-the-table');
    await page.evaluate(() => { window.__cb.qa.pose = null; });
    }
    // 6. the firing line: drill day, 3 pm
    await stage(15.2);
    await page.evaluate(() => {
      const { cam, world } = window.__cb; const ps = world.family.positions();
      const c = world.camp; const a = ps.filter(p => Math.hypot(p.x - c.x, p.z - c.z) < 6);
      const m = a.length ? { x: a.reduce((s, p) => s + p.x, 0) / a.length, z: a.reduce((s, p) => s + p.z, 0) / a.length } : { x: c.x, z: c.z };
      window.__line = m;
      cam.target.set(m.x, 0.05, m.z); cam.radius = 2.6; cam.pitch = 0.55; cam.yaw = 0.3;
    });
    await shot('06a-firing-line');
    await page.evaluate(() => {
      const { cam, world } = window.__cb; const m = window.__line;
      const [ex, ez] = world.openSpotNear(m.x - 0.7, m.z - 1.0, 0.5);
      cam.placeEye(ex, ez, m.x, m.z, 0.3);
      cam.radius = Math.max(cam.radius, 2.2);
    });
    await shot('06b-firing-line-eye-level');
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
