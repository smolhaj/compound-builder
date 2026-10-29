// Neighbors and strangers who join: the gate card (stranger + "how many can we carry"), the neighbor request card,
// the Family tab, and the compound with newcomers housed. Run from the repo root under the render lock:
//   flock $SP/render.lock node scripts/newcomersShots.mjs <outDir> [port=5941]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5941);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  await frames(); lap('loaded');
  const shot = async (name, o = {}) => { await frames(); await page.screenshot({ path: `${out}/${name}.png`, ...o }); lap(name); };

  // the compound: a house, a guest house, a cottage, the barn, the garden; the hit three weeks ago
  await page.evaluate(async () => {
    const st = await import('/src/sim/state.ts');
    const cb = window.__cb, G = cb.game; G.getState().setSpeed(0);
    const c = cb.world.camp;
    const g = structuredClone(G.getState().game);
    g.structures = g.structures.filter(x => Math.hypot(x.x - c.x, x.z - c.z) > 16);
    const B = [['farmhouse', -3, -4], ['guest_house', 0.9, -8.2], ['cottage', 5.2, -4.4], ['barn', -9, -7.5], ['metal_garage', 6.8, 2.4], ['well_drilled', 0.5, 4.5], ['garden', -3.5, -9], ['workshop', -6, 3]];
    for (const [kind, dx, dz] of B) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const tmp = st.newGame(g.seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.disaster = tmp.disaster;
    g.clock.t = Math.floor(g.disaster.hitAt + 24) + 0.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 90; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.sleeping_bag = 8; g.stock.tent = 1;
    g.gate.next = 1e9; g.gate.pending = null; g.gate.card = null;
    for (const ps of g.personState) ps.employed = false;
    G.setState({ game: g });
    G.getState().advance(0.02);
  });
  await frames(); lap('built');

  // 1. a family at the gate, two questions asked
  await page.evaluate(async () => {
    const nc = await import('/src/sim/newcomers.ts');
    const { mulberry32 } = await import('/src/sim/rng.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    let e; for (let i = 1; i < 400; i++) { e = nc.strangerArrival(g, mulberry32(i), `e${i}`, Math.floor(g.clock.t)); if (e.arche === 'family' && e.people.length >= 4) break; }
    e.secret = 'thief';   // hidden: the card shows only what a good talker would catch
    g.gate.pending = e;
    g.people[0].skills.negotiator = 7;
    nc.askQuestion(g); nc.askQuestion(g);
    G.setState({ game: g });
  });
  await shot('01-gate-stranger-family');

  // 2. the same gate with the stores nearly empty: taking them in would be more than the table can feed
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); window.__rich = { canned: g.stock.canned, staples: g.stock.staples }; g.stock.canned = 6; g.stock.staples = 1.2; G.setState({ game: g }); });
  await shot('02-gate-over-what-we-can-feed');
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.stock.canned = window.__rich.canned; g.stock.staples = window.__rich.staples; G.setState({ game: g }); });

  // 3. take the family in (a card of what happened), then a neighbor in a storm
  await page.evaluate(async () => {
    const E = await import('/src/sim/encounters.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    E.resolve(g, 'take_in');
    g.gate.card = null;
    G.setState({ game: g });
  });
  await page.evaluate(async () => {
    const nc = await import('/src/sim/newcomers.ts');
    const { mulberry32 } = await import('/src/sim/rng.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    // before the hit, in spirit: a blizzard on the way (the hit is long past here, so ask for the storm directly)
    const n = g.neighbors.find(x => x.kind === 'widow' || x.kind === 'young_family' || x.kind === 'old_farmer') ?? g.neighbors[0];
    n.disposition = 62; n.status = 'home'; n.members = Math.max(2, n.members);
    const day = Math.floor(g.clock.t);
    g.weather = { active: { kind: 'blizzard', at: day + 1, until: day + 3 }, last: -999 };
    nc.requestShelter(g, n, 'storm', mulberry32(3));
    G.setState({ game: g });
  });
  await shot('03-neighbor-asks-for-shelter');
  await page.evaluate(async () => {
    const E = await import('/src/sim/encounters.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    E.resolve(g, 'take_in'); g.gate.card = null;
    G.setState({ game: g });
  });

  // 4. a mechanic with a truck taken in, one person given the guest house, a month on
  await page.evaluate(async () => {
    const nc = await import('/src/sim/newcomers.ts');
    const E = await import('/src/sim/encounters.ts');
    const { mulberry32 } = await import('/src/sim/rng.ts');
    const G = window.__cb.game; const g = structuredClone(G.getState().game);
    let e; for (let i = 1; i < 600; i++) { e = nc.strangerArrival(g, mulberry32(i + 1000), `m${i}`, Math.floor(g.clock.t)); if (e.arche === 'mechanic') break; }
    e.secret = 'gem'; g.gate.pending = e; E.resolve(g, 'take_in'); g.gate.card = null;
    let e2; for (let i = 1; i < 600; i++) { e2 = nc.strangerArrival(g, mulberry32(i + 3000), `v${i}`, Math.floor(g.clock.t)); if (e2.arche === 'nurse') break; }
    e2.secret = 'lazy'; g.gate.pending = e2; E.resolve(g, 'take_in'); g.gate.card = null;
    const nurse = g.people.at(-1);
    const gh = g.structures.find(x => x.kind === 'guest_house');
    nc.givePlace(g, nurse.id, gh.id);
    G.setState({ game: g });
  });
  await page.evaluate(() => { const G = window.__cb.game; for (let i = 0; i < 30; i++) { G.getState().advance(1); const g = G.getState().game; if (g.gate.pending) { const s = structuredClone(g); s.gate.pending = null; G.setState({ game: s }); } if (G.getState().game.gate.card) { const s = structuredClone(G.getState().game); s.gate.card = null; G.setState({ game: s }); } } });
  await frames(); lap('advanced a month');

  // 5. the Family tab
  await page.getByText('Family', { exact: true }).first().click();
  await frames();
  await page.locator('[data-testid="carry-panel"]').first().scrollIntoViewIfNeeded();
  await shot('04-family-tab-newcomers');
  await page.locator('[data-testid="carry-panel"]').first().evaluate(el => { el.parentElement.parentElement.scrollTop = el.parentElement.offsetTop - 20; });
  await shot('05-family-tab-newcomers-scrolled');

  // 6. the compound with the newcomers about, at a sensible hour: from above, then at eye level beside a person
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.clock.t = Math.floor(g.clock.t) + (10 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24)); G.setState({ game: g }); G.getState().advance(0.03); });
  await page.keyboard.press('h');
  const c = await page.evaluate(() => window.__cb.world.camp);
  await page.evaluate(([x, z]) => { const cb = window.__cb; cb.qa.pose = null; cb.cam.target.set(x, cb.world.groundAt(x, z) + 0.3, z); cb.cam.radius = 14; cb.cam.pitch = 0.75; cb.cam.yaw = 0.7; }, [c.x, c.z]);
  await shot('06-compound-from-above');
  // eye level: stand on open ground ~1.8 units from the nearest newcomer (never inside a wall) and look at them
  const eye = (tx, tz, within = 12) => page.evaluate(([tx, tz, within]) => {
    const cb = window.__cb, w = cb.world;
    const all = w.family.positions().filter(p => w.family.shown.has(p.id));
    const nb = Object.keys(cb.game.getState().game.newcomers.bonds);
    const ppl = all.some(p => nb.includes(p.id)) ? all.filter(p => nb.includes(p.id)) : all;
    let best = null, bd = Infinity;
    for (const p of ppl) { const d = Math.hypot(p.x - tx, p.z - tz); if (d < bd) { bd = d; best = p; } }
    if (!best || bd > within) return { ok: false, bd, n: ppl.length };
    // a spot on open ground a little way off, on the side facing the yard centre
    const dx = tx - best.x, dz = tz - best.z, L = Math.hypot(dx, dz) || 1;
    const [ex, ez] = w.openSpotNear(best.x + dx / L * 1.5, best.z + dz / L * 1.5, 0.7);
    cb.qa.pose = { x: ex, y: w.groundAt(ex, ez) + 0.28, z: ez, lx: best.x, ly: w.groundAt(best.x, best.z) + 0.2, lz: best.z, fov: 52 };
    return { ok: true, who: best.id, d: bd, cam: [ex, ez], person: [best.x, best.z] };
  }, [tx, tz, within]);
  for (const [name, dx, dz] of [['07-eye-level-yard', 0, 0], ['08-eye-level-guest-house', 0.9, -8.2], ['09-eye-level-cottage', 5.2, -4.4]]) {
    let r; for (let i = 0; i < 3; i++) { r = await eye(c.x + dx, c.z + dz); if (r.ok) break; await page.evaluate(() => window.__cb.game.getState().advance(0.01)); await frames(); }
    console.log(name, JSON.stringify(r));
    await shot(name);
  }
  // night, cutaway: who sleeps where (the guest house is the nurse's)
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.clock.t = Math.floor(g.clock.t) + (1.5 + 18) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24)); G.setState({ game: g }); G.getState().advance(0.03); });
  await page.getByText('Cutaway', { exact: true }).click();
  await page.evaluate(([x, z]) => { const cb = window.__cb; cb.qa.pose = null; cb.cam.target.set(x, cb.world.groundAt(x, z) + 0.3, z); cb.cam.radius = 4; cb.cam.pitch = 1.0; cb.cam.yaw = 0.7; }, [c.x + 0.9, c.z - 8.2]);
  await shot('10-night-cutaway-guest-house');
  await page.evaluate(([x, z]) => { const cb = window.__cb; cb.cam.target.set(x, cb.world.groundAt(x, z) + 0.3, z); cb.cam.radius = 4.5; }, [c.x + 5.2, c.z - 4.4]);
  await shot('11-night-cutaway-cottage');
  console.error('done');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
