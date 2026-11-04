/**
 * Stone stair / terrace ramp on a steep slope: finds ground steeper than --grade near the camp on the hillside lot, sets the piece along the fall line,
 * and takes an aerial and an eye-level shot with a scale figure beside it.
 *   flock $SP/render.lock node scripts/steepStairShots.mjs --out shots/steep [--port 5330] [--kinds terrace_stair,terrace_ramp] [--grade 0.35]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5330)), outDir = resolve(opt('--out', 'shots/steep')), kinds = opt('--kinds', 'terrace_stair,terrace_ramp').split(','), grade = Number(opt('--grade', 0.35));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const HILL = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
try {
  await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7&${HILL}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(14); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
  await page.waitForTimeout(1500);
  const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(350); };
  for (const kind of kinds) {
    const info = await page.evaluate(async ([kind, grade]) => {
      const cb = window.__cb, G = cb.game, w = cb.world, c = w.camp;
      const g = structuredClone(G.getState().game); g.structures = []; G.setState({ game: g });
      const K = await import('/src/game/buildkit/kit.ts');
      // the steepest ground within 40 u of the camp that the piece can stand on: try the four turns, keep the one that rises most along its length
      let best = null;
      for (let dx = -40; dx <= 40; dx += 2) for (let dz = -40; dz <= 40; dz += 2) {
        const x = c.x + dx, z = c.z + dz;
        for (const r of [0, 1, 2, 3]) {
          const a = r * Math.PI / 2, ux = Math.sin(a), uz = Math.cos(a), L = KIT_LEN(K, kind);
          const rise = w.groundAt(x + ux * L / 2, z + uz * L / 2) - w.groundAt(x - ux * L / 2, z - uz * L / 2);
          const gr = rise / L;
          if (gr >= grade * 0.9 && (!best || Math.abs(gr - grade) < Math.abs(best.gr - grade))) { const sp = cb.tool.findSpot(kind, x, z, r, 1); if (sp) best = { sp, r, gr }; }
        }
      }
      function KIT_LEN(K, kind) { return K.KIT[kind].cellsZ * 2; }
      if (!best) return { ok: false };
      const cur = structuredClone(G.getState().game);
      cur.structures.push({ id: 'q1', kind, x: best.sp[0], z: best.sp[1], rot: best.r, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      G.setState({ game: cur });
      return { ok: true, ...best };
    }, [kind, grade]);
    console.error(kind, JSON.stringify(info));
    if (!info.ok) continue;
    for (let i = 0; i < 4; i++) await frame();
    const geo = await page.evaluate(() => { const w = window.__cb.world, st = window.__cb.game.getState().game.structures[0]; return { x: st.x, z: st.z, gy: w.groundAt(st.x, st.z), rot: st.rot }; });
    await page.evaluate(([x, z, gy]) => { const { cam } = window.__cb; cam.target.set(x, gy + 0.3, z); cam.radius = 8; cam.pitch = 0.9; cam.yaw = 0.6; }, [geo.x, geo.z, geo.gy]);
    await frame(); await page.screenshot({ path: `${outDir}/${kind}-aerial.png` });
    // eye level: a figure beside the stair's foot, the camera off to the side looking across the slope at it
    await page.evaluate(([geo]) => {
      const w = window.__cb.world, a = geo.rot * Math.PI / 2, ux = Math.sin(a), uz = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
      const [fx, fz] = w.openSpotNear(geo.x - ux * 1.6 + px * 1.0, geo.z - uz * 1.6 + pz * 1.0, 0.2); w.qaFigure(fx, fz);
    }, [geo]);
    // orbit camera low and near, from four sides (which one looks up the stair depends on the turn)
    for (let k = 0; k < 4; k++) {
      await page.evaluate(([x, z, gy, k, rot]) => { const { cam } = window.__cb; cam.target.set(x, gy + 0.3, z); cam.radius = 3.2; cam.pitch = 0.12; cam.yaw = rot * Math.PI / 2 + k * Math.PI / 2; }, [geo.x, geo.z, geo.gy, k, geo.rot]);
      await frame(); await page.screenshot({ path: `${outDir}/${kind}-eye${k}.png` });
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill(); process.exit(0);
