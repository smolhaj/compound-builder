// People depth: the Family tab (strain, mood, skills, how everyone is), the roster's "who should do what" and the Mentor
// hours, the next-step card for someone not coping, and the compound at eye level and from above (mentoring at the table).
//   flock $SP/render.lock node scripts/peopleShots.mjs <outDir> [port=5943] [only=ui|world|all]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5943), only = process.argv[4] || 'all';
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
    // the days have been hard: a fight three weeks ago, one of them not coping, the elder grieving
    g2.mind = Mind.newMind(); g2.learning = Sk.newLearning();
    Mind.mindOf(g2).lastFight = Math.floor(g2.clock.t) - 20;
    const pa = Mind.psyOf(g2, a.id); pa.stress = 88; pa.trauma = 58; pa.low = 62; pa.kills = 1; pa.what = 'killed'; pa.since = Math.floor(g2.clock.t) - 20;
    pa.broke = { kind: 'withdrawn', day: Math.floor(g2.clock.t) - 1, until: Math.floor(g2.clock.t) + 4 };
    const pb = Mind.psyOf(g2, b.id); pb.stress = 52; pb.trauma = 24;
    for (const k of g2.people.filter(p => p.kid)) { const pk = Mind.psyOf(g2, k.id); pk.stress = 46; pk.trauma = 28; }
    g2.personState.find(x => x.id === a.id).needs.coping = 0.2;
    Sk.practice(g2, b.id, 'gardener', 700); Sk.practice(g2, b.id, 'cooking', 140); Sk.practice(g2, a.id, 'shooting', 30);
    g2.armory.guns.push({ id: 'g1', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: a.id });
    g2.armory.skill[a.id] = 5.6;
    g2.learning.used[b.id] = { radio: -300 }; b.skills.radio = Math.max(3, b.skills.radio);
    for (const p of g2.people) Mind.reading(g2, p) && (Mind.psyOf(g2, p.id).weighs = Mind.reading(g2, p).weighs);
    autoPlan(g2, { build: false, fell: false });
    window.__who = { a: a.first, b: b.first, elder: elder.first, teen: teen.first };
    G.setState({ game: g2 });
  });
  await frames(); lap('built');
  console.error(JSON.stringify(await page.evaluate(() => window.__who)));

  if (only !== 'world') {
    await page.getByRole('button', { name: 'Family' }).first().click().catch(() => {});
    await frames();
    // 1. the Family tab: people with strain and skills, the broken one opened up
    await page.getByRole('button', { name: 'how they are' }).first().click();
    await frames();
    await page.screenshot({ path: `${out}/01-family-tab.png`, clip: { x: 940, y: 0, width: 340, height: 900 } }); lap('01-family-tab');
    // 2. down to "How everyone is" with the skills table
    await page.getByRole('button', { name: 'Who is best at what' }).click();
    await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => d.textContent === 'How everyone is' || d.firstChild?.textContent === 'How everyone is'); el?.scrollIntoView({ block: 'start' }); });
    await frames();
    await page.screenshot({ path: `${out}/02-how-everyone-is.png`, clip: { x: 940, y: 0, width: 340, height: 900 } }); lap('02-how-everyone-is');
    // 3. the next-step card
    await page.getByRole('button', { name: 'Build' }).first().click().catch(() => {});
    await frames();
    await page.screenshot({ path: `${out}/03-next-step.png`, clip: { x: 0, y: 0, width: 340, height: 520 } }); lap('03-next-step');
    // 4. the roster: who should do what, the Mentor hours
    await page.getByRole('button', { name: 'Family' }).first().click().catch(() => {});
    await page.getByRole('button', { name: 'Schedule…' }).click();
    await frames();
    await page.screenshot({ path: `${out}/04-roster.png` }); lap('04-roster');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
  }

  if (only !== 'ui') {
    // 5. the compound: the elder and the youth at the table (Mentoring), eye level and from above
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game; const g = structuredClone(G.getState().game);
      const i = g.people.findIndex(p => p.id === 'p7'), j = g.people.findIndex(p => p.id === 'p8');
      g.personState[i].task = 'teach'; g.personState[j].task = 'teach';
      G.setState({ game: g });
      G.getState().advance(0.005);
      cb.store.getState().setHudHidden(true);
      cb.store.getState().setTimeOfDay(15);
    });
    await frames();
    for (const [k, ang] of [['a', 0], ['b', 1.57], ['c', 3.14], ['d', 4.71]]) {
      const info = await page.evaluate(ang => {
        const { cam, world } = window.__cb;
        const ps = world.family.positions();
        const el = ps.find(p => p.id === 'p7') ?? ps[0];
        const [ex, ez] = world.openSpotNear(el.x + Math.cos(ang) * 1.9, el.z + Math.sin(ang) * 1.9, 0.6);
        cam.placeEye(ex, ez, el.x, el.z, 0.34);
        return { n: ps.length, el, ex, ez };
      }, ang);
      console.error(JSON.stringify(info));
      await shot(`05${k}-eye-level-mentoring`);
    }
    await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, cb.world.groundAt(c.x, c.z) + 0.2, c.z + 1); cb.cam.radius = 14; cb.cam.pitch = 0.95; cb.cam.yaw = 0.5; });
    await shot('06-aerial');
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
