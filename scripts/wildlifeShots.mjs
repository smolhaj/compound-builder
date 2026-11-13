// In-world shots of the native wildlife and the family dogs (docs/DECISIONS.md, "Realistic wildlife and dogs"): eye level with a person for
// scale, a deer meadow at dawn, a bear at the treeline, turkeys, a coyote at dusk, small game, the family dogs. The real game, QA hooks only.
//   flock /tmp/cb.lock node scripts/wildlifeShots.mjs <outDir> [port=5971] [quality=high] [only]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5971), quality = process.argv[4] || 'high', only = process.argv[5] || '';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
// Each shot: the time of day, the season and day of year, the animals [species, dx, dz (m east / south of the spot), facing deg (0 = away from the camera), male, mood], a person at (px, pz) m, the camera.
const M = 1 / 6;
const SHOTS = [
  { region: 'plains', name: '01-deer-meadow-dawn', time: 7.9, season: 'fall', doy: 290, animals: [['deer', -3, 1, 10, false, 'graze'], ['deer', 1, 2.5, -30, false, 'alert'], ['deer', 6, 0, 45, true, 'alert'], ['deer', 4, 6, -70, false, 'graze'], ['deer', -9, 6, -120, true, 'graze']], person: [-3, 1.5], cam: { dist: 13, bearing: 0.3, h: 0.24, fov: 46 } },
  { region: 'plains', name: '02-buck-closeup-eye', time: 9, season: 'fall', doy: 295, animals: [['deer', 0, 0, 25, true, 'alert'], ['deer', 3, 3, -50, false, 'graze']], person: [-3, 1.5], cam: { dist: 7, bearing: 0.2, h: 0.22, fov: 44 } },
  { region: 'mountain_west', name: '03-buck-summer-velvet', time: 8.5, season: 'summer', doy: 170, animals: [['deer', 0, 0, 60, true, 'graze'], ['deer', 4, 2, 10, true, 'alert']], person: [-3, 1.5], cam: { dist: 9, bearing: 0.5, h: 0.22, fov: 44 } },
  { region: 'mountain_west', name: '04-elk-herd', time: 8.5, season: 'fall', doy: 280, animals: [['elk', 0, 0, 40, true, 'alert'], ['elk', -5, 2, 0, false, 'graze'], ['elk', 4, 3, -30, false, 'graze'], ['elk', -2, 7, -70, false, 'alert']], person: [-3, 1.5], cam: { dist: 24, bearing: 0.2, h: 0.25, fov: 46 } },
  { region: 'north_woods', name: '05-moose-bull', time: 18.5, season: 'fall', doy: 270, animals: [['moose', 0, 0, 30, true, 'alert'], ['moose', 5, 4, -40, false, 'graze']], person: [-3, 1.5], cam: { dist: 14, bearing: 0.3, h: 0.25, fov: 46 } },
  { region: 'plains', name: '06-pronghorn', time: 10, season: 'summer', doy: 180, animals: [['antelope', 0, 0, 35, true, 'alert'], ['antelope', -4, 2, 10, false, 'graze'], ['antelope', 3, 3, -40, false, 'graze']], person: [-3, 1.5], cam: { dist: 14, bearing: 0.3, h: 0.22, fov: 44 } },
  { region: 'desert', name: '07-javelina', time: 17.5, season: 'summer', doy: 180, animals: [['javelina', 0, 0, 30, true, 'graze'], ['javelina', 2, 1.5, -30, false, 'graze'], ['javelina', -2, 2.5, 0, false, 'alert']], person: [-3, 1.5], cam: { dist: 8, bearing: 0.3, h: 0.2, fov: 44 } },
  { region: 'appalachia', name: '08-bear-treeline-dusk', time: 18.9, season: 'summer', doy: 190, animals: [['bear', 0, 0, 45, true, 'alert']], person: [-3, 1.5], cam: { dist: 10, bearing: 0.4, h: 0.23, fov: 44 }, treeline: true },
  { region: 'appalachia', name: '09-bear-graze-eye', time: 8, season: 'fall', doy: 285, animals: [['bear', 0, 0, 10, true, 'graze']], person: [-3, 1.5], cam: { dist: 6, bearing: 0.5, h: 0.2, fov: 44 } },
  { region: 'appalachia', name: '10-turkeys-flock', time: 9, season: 'fall', doy: 300, animals: [['turkey', 0, 0, 30, true, 'alert'], ['turkey', -1.5, 1.2, 0, false, 'graze'], ['turkey', 1.5, 1.6, -30, false, 'graze'], ['turkey', 2.5, -0.6, 50, false, 'graze'], ['turkey', -2.5, -0.4, -70, false, 'graze'], ['turkey', 0.2, 3, -10, true, 'graze']], person: [-3, 1.5], cam: { dist: 6, bearing: 0.3, h: 0.2, fov: 44 } },
  { region: 'appalachia', name: '11-grouse-squirrel', time: 9, season: 'fall', doy: 290, animals: [['grouse', 0, 0, 30, true, 'alert'], ['grouse', 1.2, 0.8, -20, false, 'graze'], ['squirrel', -1.3, 0.4, 50, false, 'alert'], ['squirrel', -2, 1.5, -60, false, 'graze']], person: [-3, 1.5], cam: { dist: 3.8, bearing: 0.3, h: 0.06, fov: 42 } },
  { region: 'plains', name: '12-rabbits', time: 7.5, season: 'summer', doy: 170, animals: [['rabbit', 0, 0, 40, false, 'alert'], ['rabbit', 1.2, 1.2, -30, false, 'graze'], ['rabbit', -1.4, 0.8, 0, false, 'graze']], person: [-3, 1.5], cam: { dist: 3.6, bearing: 0.3, h: 0.05, fov: 42 } },
  { region: 'upper_midwest', name: '13-ducks-geese', time: 10, season: 'spring', doy: 110, animals: [['waterfowl', 0, 0, 40, true, 'graze'], ['waterfowl', 1.2, 0.6, 10, false, 'graze'], ['waterfowl', -1.2, 0.8, -30, true, 'alert'], ['waterfowl', 0.4, 2, 0, false, 'graze'], ['waterfowl', -2.4, 2, -50, false, 'graze']], person: [-3, 1.5], cam: { dist: 4.4, bearing: 0.3, h: 0.07, fov: 42 } },
  { region: 'plains', name: '14-coyote-dusk', time: 19, season: 'fall', doy: 300, animals: [['coyote', 0, 0, 35, true, 'alert'], ['coyote', 3, 2, -30, false, 'graze']], person: [-3, 1.5], cam: { dist: 9, bearing: 0.3, h: 0.2, fov: 44 } },
  { region: 'north_woods', name: '15-wolf-cougar', time: 19, season: 'winter', doy: 20, animals: [['wolf', 0, 0, 35, true, 'alert'], ['wolf', 3, 1.5, -10, false, 'graze'], ['cougar', -6, 3, -50, true, 'alert']], person: [-3, 1.5], cam: { dist: 12, bearing: 0.3, h: 0.2, fov: 46 } },
  { region: 'appalachia', name: '16-deer-aerial', time: 8.2, season: 'fall', doy: 290, animals: [['deer', -3, 1, 10, false, 'graze'], ['deer', 1, 2.5, -30, false, 'alert'], ['deer', 6, 0, 45, true, 'alert'], ['turkey', 5, 6, -70, false, 'graze'], ['bear', -8, -6, -150, true, 'graze']], person: [-3, 1.5], aerial: { radius: 9, pitch: 0.95 } },
  { region: 'plains', name: '17-walking-deer', time: 8.5, season: 'fall', doy: 295, animals: [['deer', 0, 0, 80, true, 'walk'], ['deer', -3, 1.5, 80, false, 'walk'], ['deer', -6, 0.5, 80, false, 'walk']], person: [-3, 1.5], cam: { dist: 14, bearing: 0.0, h: 0.1, fov: 42 }, step: 30 },
];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
  // (renderNow keeps the quality tier the page was set to; renderFull switches tiers, which drops the animals' meshes until the next update)
  const frames = async () => { await page.evaluate(() => { const { world, game } = window.__cb; world.updateWildlife(0.001, game.getState().game, 1); return window.__cb.qa.renderNow(); }); };
  let loaded = '';
  for (const s of SHOTS) {
    if (only && !only.split(',').some(o => s.name.includes(o))) continue;
    if (loaded !== s.region) {
      loaded = s.region;
      await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.75&clean&new&region=${s.region}`);
      await page.waitForFunction(() => window.__cb?.qa?.lowrender && window.__cb?.world, null, { timeout: 300000 });
      await page.evaluate(q => { window.__cb.store.getState().setQuality(q); window.__cb.game.getState().setSpeed(0); }, quality);
      await frames(); await frames();
    }
    await page.evaluate(s => {
      const { store, cam, world, game } = window.__cb, st = store.getState();
      st.setHudHidden(true); st.setTimeOfDay(s.time); st.setSeasonMode(s.season); st.setDayOfYear?.(s.doy); st.setWeatherMode('clear');
      { const G = game, g2 = structuredClone(G.getState().game); g2.clock.t = Math.floor(g2.clock.t) + ((((s.time - 6) % 24) + 24) % 24) / 24; g2.gate.next = 1e9; g2.gate.pending = null; g2.gate.card = null; G.setState({ game: g2 }); G.getState().advance(0.0001); st.setTimeOfDay(s.time); }
      window.__cb.qa.pose = null;
      const c = world.camp, cover = world.lowCover;
      // a meadow: the open spot near the camp farthest from every shrub and rock
      let best = null, bd = -1;
      for (let i = -16; i <= 16; i += 2) for (let j = -16; j <= 16; j += 2) {
        const x = c.x + i, z = c.z + j, [ox, oz] = world.openSpotNear(x, z, 1.5);
        if (Math.hypot(ox - x, oz - z) > 0.3) continue;
        const d = cover.reduce((m, o) => Math.min(m, Math.hypot(o.x - x, o.z - z) - o.r), 99) - Math.hypot(i, j) * 0.03;
        if (d > bd) { bd = d; best = [x, z]; }
      }
      const [sx, sz] = best ?? world.openSpotNear(c.x + 7, c.z + 6, 1.2), gy = (x, z) => world.groundAt(x, z), K = 1 / 6;
      // the animals: the renderer's own debug hook; offsets are in metres
      world.wildlife.clearDebug();
      for (const [sp, dx, dz, face, male, mood] of s.animals) {
        world.wildlife.spawnDebug(sp, sx + dx * K, sz + dz * K, (face * Math.PI) / 180 + (s.cam?.bearing ?? 0.4) + Math.PI, male);
        const b = [...world.wildlife._beasts.values()].pop();
        b.mood = mood; b.t = 9999; b.head = mood === 'alert' ? 1 : mood === 'walk' ? 0.55 : 0; b.vis = 1; b.want = true;
        if (mood === 'walk') { b.v = 0.2; b.tx = b.x + Math.sin(b.rot) * 6; b.tz = b.z + Math.cos(b.rot) * 6; b.t = 9999; }
      }
      world.qaFigures?.();
      window.__spot = [sx, sz];
    }, s);
    if (s.step) await page.evaluate(n => { const { world, game } = window.__cb, g = game.getState().game; for (let i = 0; i < n; i++) world.updateWildlife(0.1, g, 1); }, s.step);
    await page.evaluate(s => {
      const { world, cam, game } = window.__cb, K = 1 / 6, g = game.getState().game;
      world.updateWildlife(0.05, g, 1);
      const an = world.wildlife.animals().filter(a => a.id.startsWith('qa:'));
      const cx = an.reduce((q, a) => q + a.x, 0) / an.length, cz = an.reduce((q, a) => q + a.z, 0) / an.length;
      // a person for scale, beside the group (lateral m to the camera's right, depth m toward the camera)
      if (window.__fig) window.__fig.removeFromParent();
      { const fx = Math.sin(s.cam?.bearing ?? 0.4), fz = Math.cos(s.cam?.bearing ?? 0.4), px = cx + (fx * s.person[1] + fz * s.person[0]) * K, pz = cz + (fz * s.person[1] - fx * s.person[0]) * K;
        const n0 = world._root.children.length; world.qaFigure(px, pz); window.__fig = world._root.children[n0]; }
      if (s.aerial) { window.__cb.qa.pose = null; cam.target.set(cx, world.groundAt(cx, cz) + 0.1, cz); cam.radius = s.aerial.radius; cam.pitch = s.aerial.pitch; cam.yaw = 0.4; return; }
      const d = s.cam.dist * K, [ex, ez] = world.openSpotNear(cx + Math.sin(s.cam.bearing) * d, cz + Math.cos(s.cam.bearing) * d, 0.5), gy = world.groundAt(ex, ez);
      window.__cb.qa.pose = { x: ex, y: gy + s.cam.h, z: ez, lx: cx, ly: world.groundAt(cx, cz) + 0.09, lz: cz, fov: s.cam.fov };
    }, s);
    await frames(); await frames();
    if (process.env.WDBG) console.error(JSON.stringify(await page.evaluate(() => { const { world, cam } = window.__cb; return { qa: world.wildlife.animals().filter(a => a.id.startsWith('qa:')).map(a => [a.sp, +a.x.toFixed(1), +a.z.toFixed(1), a.vis]), meshes: world._ws.scene.children.filter(o => o.name.startsWith('wildlife_')).map(o => `${o.name}:${o.visible}:${o.count}`), pose: window.__cb.qa.pose, cam: world._ws.camera.position.toArray(), ndc: (() => { const a = world.wildlife.animals().find(q => q.id.startsWith('qa:')); const v = world._ws.camera.position.clone().set(a.x, world.groundAt(a.x, a.z) + 0.08, a.z).project(world._ws.camera); return [v.x, v.y, v.z]; })(), mats: world._ws.scene.children.filter(o => o.name.startsWith('wildlife_deer')).map(o => [o.name, o.geometry.attributes.position.count, o.geometry.boundingSphere?.radius, o.material.type, o.frustumCulled, o.layers.mask]) }; })));
    await page.screenshot({ path: `${out}/${s.name}.png` }); lap(s.name);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
