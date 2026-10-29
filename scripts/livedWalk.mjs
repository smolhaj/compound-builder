// Do the family keep to the paths, and out of the walls? Runs a game day at 1x and samples where the people are.
//   flock <lock> node scripts/livedWalk.mjs [port=5964] [straight]     ("straight" turns the path-following off to compare)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const port = Number(process.argv[2] || 5964), straight = process.argv[3] === 'straight';
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?clean&lowrender=0.2&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  const res = await page.evaluate(async straight => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const K = await import('/src/game/buildkit/kit.ts');
    const g = structuredClone(G.getState().game);
    g.structures = [];
    for (const [kind, dx, dz, rot] of [['farmhouse', -3, -4, 0], ['cottage', 4.5, -4.5, 0], ['workshop', 7, 4.5, 3], ['barn', -8.5, -7.5, 0], ['chicken_coop', -8, -1.5, 1], ['garden', -3.5, -9, 0], ['greenhouse', 1.5, -9, 0], ['outhouse', 8, -2, 3], ['well_hand', 0.5, 4.5, 0], ['field', -9, 3, 0]]) g.structures.push({ id: 'cb' + kind, kind, x: c.x + dx, z: c.z + dz + 5, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    g.clock.t = 3 * 365 + 120 + 0.25; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    G.setState({ game: g });
    cb.world.paths.qaNoVia = straight;
    G.getState().setSpeed(1);
    const bodies = g.structures.map(s => K.footprint(K.KIT[s.kind], s.x, s.z, s.rot, false));
    const inBody = (x, z) => bodies.some(b => x > b.x0 + 0.02 && x < b.x1 - 0.02 && z > b.z0 + 0.02 && z < b.z1 - 0.02);
    const last = new Map();
    let moving = 0, onPath = 0, inside = 0, near = 0, samples = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 80000) {
      await cb.qa.renderNow();
      for (const p of cb.world.family.positions()) {
        const l = last.get(p.id);
        if (l && Math.hypot(p.x - l.x, p.z - l.z) > 0.01) {
          moving++;
          if (cb.world.paths.surfaceAt(p.x, p.z)) onPath++;
          if (cb.world.paths.distTo(p.x, p.z) < 0.4) near++;
          if (inBody(p.x, p.z)) inside++;
        }
        samples++;
        last.set(p.id, { x: p.x, z: p.z });
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return { straight, samples, moving, onPath, near, inside, trails: cb.world.paths.network.trails.length, day: G.getState().game.clock.t };
  }, straight);
  console.log(JSON.stringify(res));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
