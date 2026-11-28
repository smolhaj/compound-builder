/**
 * Visual sweep (one scene per run; software GL is slow, so run it under the render lock and in the background):
 *   nohup flock /tmp/cb.lock node scripts/visSweep.mjs --region plains --stage home|late --views aerial,eye,low,far --hours dawn,noon,dusk,night \
 *     --seasons summer --weathers clear --out /tmp/vs --port 5801 > /tmp/vs/plains.log 2>&1 &
 * Each (season, weather, hour, view) combination is one full-quality frame (`renderFull(tier)`), saved as <tag>-<season>-<weather>-<hour>-<view>.png.
 * `--lot hillside` selects a lot kind with relief; `--tier high|medium`.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const regions = opt('--regions', opt('--region', 'mountain_west')).split(',');
const planArg = opt('--plan', '');   // season:weather:hour:view,... overrides the cross product; '*' region-rotates the season
const stage = opt('--stage', 'home');
const views = opt('--views', 'aerial,eye').split(',');
const HOURS = { dawn: 6.4, noon: 12.5, dusk: 18.6, night: 23 };
const hours = opt('--hours', 'noon').split(',');
const seasons = opt('--seasons', 'summer').split(',');
const weathers = opt('--weathers', 'clear').split(',');
const tier = opt('--tier', 'high');
const lot = opt('--lot', '');
const port = Number(opt('--port', 5801));
const outDir = resolve(opt('--out', '/tmp/vs'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  for (const region of regions) {
  const tag = opt('--tag', `${region}-${stage}${lot ? '-' + lot : ''}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(1200000);
  page.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 300)));
  page.on('crash', () => console.log('PAGE CRASHED'));
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
  const lotQ = lot ? `&lot=${lot}&relief=9&acres=40&lotseed=8` : '&acres=40&lotseed=8';
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender&looktier=${tier}&region=${region}${lotQ}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 900000 });
  await page.evaluate(() => { window.__cb.qa.weather = true; });
  lap('loaded');
  const frames = async k => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  const info = await page.evaluate(async ([stage]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    cb.store.getState().setHudHidden?.(true);
    const put = (k, x, z, rot = 0, r = 8) => { const sp = cb.tool.findSpot(k, x, z, rot, r); if (!sp) return null; G.getState().plan(k, sp[0], sp[1], rot); return { x: sp[0], z: sp[1] }; };
    const placed = {};
    const home = put('timber_cabin', c.x, c.z, 0, 8);
    placed.home = home;
    put('barn', c.x + 14, c.z - 8, 0, 6); put('chicken_coop', c.x - 7, c.z + 4, 0, 4); put('garden', c.x + 5, c.z + 9, 0, 5);
    if (stage === 'late') {
      const kinds = [['stone_house', -14, 6], ['guest_house', -12, -10], ['workshop', 10, 12], ['metal_garage', 18, 4], ['greenhouse', -4, 14], ['orchard', 16, 18], ['sheep_barn', -18, -2], ['root_cellar', 6, -12], ['water_tower', -22, 12], ['solar_array', 22, -12], ['wind_turbine', 26, 8], ['watchtower_wood', 0, 24], ['equipment_yard', 22, 14], ['field', -20, 22], ['apiary', 12, -16], ['cottage', -26, -12], ['lodge', 28, -2]];
      for (const [k, dx, dz] of kinds) { try { placed[k] = put(k, c.x + dx, c.z + dz, 0, 10); } catch (e) { placed[k] = 'err ' + e.message.slice(0, 60); } }
      try {
        const { useWorldStore } = await import('/src/store/worldStore.ts');
        const geo = useWorldStore.getState().siteGeo ?? {};
        G.getState().fortifyRing(geo, { towers: 5, towerKind: 'watchtower_wood', passage: false, shape: 'rounded', wall: 'stone_wall', rings: 1 });
        placed.ring = 'ok';
      } catch (e) { placed.ring = 'err ' + e.message.slice(0, 100); }
    }
    G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; st.permit = 'ok'; } g.utilities.lit = ['x']; g.clock.t += 0.07; return { game: g }; });
    placed.camp = [c.x, c.z]; placed.n = G.getState().game.structures.length;
    return placed;
  }, [stage]);
  console.log('staged', JSON.stringify(info));
  await frames(10);
  // a person for scale near the home porch
  await page.evaluate(() => { const w = window.__cb.world, c = w.camp; const [fx, fz] = w.openSpotNear(c.x + 3.2, c.z + 4.6, 0.3); w.qaFigure(fx, fz); window.__fig = [fx, fz]; });
  const view = mode => page.evaluate(m => {
    const cb = window.__cb, gr = cb.world.groundAt, c = cb.world.camp, f = window.__fig;
    cb.world.setEyeView?.(null);
    if (m === 'eye') { const x = f[0] + 2.4, z = f[1] + 3.2; cb.qa.pose = { x, y: gr(x, z) + 0.34, z, lx: f[0] - 1, ly: gr(f[0], f[1]) + 0.35, lz: f[1] - 2, fov: 64 }; }
    else if (m === 'low') { const x = c.x - 12, z = c.z + 16; cb.qa.pose = { x, y: gr(x, z) + 0.45, z, lx: c.x + 8, ly: gr(c.x, c.z) + 0.6, lz: c.z - 6, fov: 70 }; }
    else if (m === 'ridge') { const x = c.x + 38, z = c.z + 30; cb.qa.pose = { x, y: gr(x, z) + 6, z, lx: c.x, ly: gr(c.x, c.z), lz: c.z, fov: 60 }; }
    else if (m === 'far') { cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 150; cb.cam.pitch = 0.42; cb.cam.yaw = 0.9; }
    else if (m === 'top') { cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 95; cb.cam.pitch = 1.35; cb.cam.yaw = 0.2; }
    else { cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 48; cb.cam.pitch = 0.62; cb.cam.yaw = 0.8; }
  }, mode);
  const combos = planArg ? planArg.split(',').map(x => x.split(':')) : seasons.flatMap(se => weathers.flatMap(w => hours.flatMap(h => views.map(v => [se, w, h, v]))));
  let last = '';
  for (const [season, weather, hn, v] of combos) {
    const hour = HOURS[hn] ?? Number(hn);
    await page.evaluate(([season, weather, hour]) => { const st = window.__cb.store.getState(); st.setSeasonMode(season); st.setWeatherMode(weather); st.setTimeOfDay(hour); }, [season, weather, hour]);
    {
      await view(v);
      await frames(weather === 'clear' ? 4 : 24);
      await page.evaluate(q => window.__cb.qa.renderFull(q), tier);
      const f = `${outDir}/${tag}-${season}-${weather}-${hn}-${v}.png`;
      await page.screenshot({ path: f, timeout: 600000 });
      lap(f);
      if (process.env.PROBE && v === (process.env.PROBE_VIEW || 'low')) {
        for (const pp of process.env.PROBE.split(';')) { const [px, py] = pp.split(',').map(Number);
        lap('probe ' + pp + ' ' + JSON.stringify(await page.evaluate(([px, py]) => {
          const cb = window.__cb, T = cb.THREE, cam = cb.ws.camera, out = [];
          const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(px / 1280 * 2 - 1, -(py / 720) * 2 + 1), cam);
          for (const h of rc.intersectObjects(cb.ws.scene.children, true).slice(0, 4)) {
            let o = h.object, names = []; while (o) { names.push(o.name || o.type); o = o.parent; }
            out.push({ d: +h.distance.toFixed(2), p: h.point.toArray().map(v => +v.toFixed(2)), ground: +cb.world.groundAt(h.point.x, h.point.z).toFixed(2), inst: h.instanceId, names: names.slice(0, 4), ud: h.object.userData?.type, inst3: h.instanceId !== undefined ? (() => { const m = new T.Matrix4(); h.object.getMatrixAt(h.instanceId, m); const P = new T.Vector3(), Q = new T.Quaternion(), S = new T.Vector3(); m.decompose(P, Q, S); return { pos: P.toArray().map(v => +v.toFixed(2)), scale: S.toArray().map(v => +v.toFixed(2)), verts: h.object.geometry.attributes.position.count, bb: (h.object.geometry.computeBoundingBox(), h.object.geometry.boundingBox.max.toArray().map(v => +v.toFixed(2))) }; })() : null });
          }
          return { cam: cam.position.toArray().map(v => +v.toFixed(2)), out };
        }, [px, py]))); }
      }
    }
  }
  await page.close();
  }
} catch (e) { console.log('ERR', e.message); }
await browser.close(); vite.kill(); process.exit(0);
