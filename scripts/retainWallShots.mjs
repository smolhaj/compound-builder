/**
 * Retaining-wall eye-level frames on the QA hillside lot: a manufactured home and a few pieces staked on the slope, then low frames
 * of each fill wall from the downslope side (the footing must meet the ground) and one from above.
 *   flock /tmp/cb.lock node scripts/retainWallShots.mjs <outDir> [port]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const [out = 'shots/retainwalls', portArg = '5980', reliefArg = '9', lotseedArg = '8'] = process.argv.slice(2);
const port = Number(portArg);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${port}/?clean&seed=7&region=pnw&lot=hillside&lotcut&relief=${reliefArg}&acres=40&lotseed=${lotseedArg}&elev=600&lowrender&looktier=high`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 180000 });
  const placed = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game, res = [];
    for (const [k, dx, dz] of [['trailer', 0, 0], ['trailer', 7, 5], ['timber_cabin', -7, 4], ['garden', 0, 8], ['root_cellar', 6, -6]]) {
      let ok = false;
      for (const [ox, oz] of [[0, 0], [-4, 0], [0, 4], [-4, 4], [4, 4], [6, -6], [-6, -6], [8, 8], [-8, -8], [0, 10], [0, -10]]) {
        const sp = cb.tool.findSpot(k, c.x + dx + ox, c.z + dz + oz, 0);
        if (!sp) continue;
        const before = G.getState().game.structures.length;
        cb.tool.setKind(k); cb.tool.hoverAt(sp[0], sp[1], 0); cb.tool.placeHere(); cb.tool.setKind(null);
        if (G.getState().game.structures.length > before) { ok = true; break; }
      }
      res.push(k + (ok ? '' : ' FAILED'));
    }
    G.setState(s => { const g = structuredClone(s.game); g.structures.forEach(x => { x.finishedAt = g.clock.t; x.stage = 99; }); return { game: g }; });
    G.getState().advance(3);
    return res;
  });
  console.log('placed', placed.join(', '));
  await page.evaluate(() => { const ws = window.__cb.world; });
  const walls = await page.evaluate(() => {
    const W = window.__cb.world.walls._walls;
    return [...W.entries()].map(([id, w]) => ({ id, y: w.plan.y, rect: w.plan.rect, runs: w.plan.runs.map(r => ({ side: r.side, pts: [r.pts[0], r.pts[r.pts.length - 1]], fill: Math.max(0, ...r.h.map(v => -v)), cut: Math.max(0, ...r.h) })) }));
  });
  console.log('walls', walls.length, JSON.stringify(walls.map(w => [w.id, w.runs.map(r => [r.side, +r.fill.toFixed(2), +r.cut.toFixed(2)])])));
  // numbers: for every wall, the lowest point of the drawn stone in each 0.1 u cell against the ground the world draws there (a positive gap is a stone in the air)
  const auditFn = () => page.evaluate(() => {   /* (all near meshes, seen or not) */
    // exact: every point of a downward-facing stone face (corners and centre) against the ground drawn at that very point; a point above the ground counts as floating
    // only when no other stone of the wall lies under it (the upper courses sit on the lower ones, they do not touch the ground)
    const cb = window.__cb, W = cb.world.walls, T = cb.THREE, res = [], ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
    for (const m of W.group.children) {
      if (!/_near$/.test(m.name)) continue;
      m.updateMatrixWorld(true);
      const side0 = m.material.side; m.material.side = T.DoubleSide;   // (a ray from just under a tread starts inside the block that carries it: that block's far face must count)
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, bad = [];
      let pts = 0, max = 0;
      for (let t = 0; t + 2 < pos.count; t += 3) {
        if (nor.getY(t) > -0.9) continue;
        { const b0 = Math.floor(t / 36) * 36; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let v = b0; v < b0 + 36; v++) { x0 = Math.min(x0, pos.getX(v)); x1 = Math.max(x1, pos.getX(v)); z0 = Math.min(z0, pos.getZ(v)); z1 = Math.max(z1, pos.getZ(v)); } if (x1 - x0 < 0.045 && z1 - z0 < 0.045) continue; }   // (a weep hole is a dark square set in the face, not a stone)
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cy = pos.getY(t), cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        const tri = [0, 1, 2].map(i => [pos.getX(t + i), pos.getY(t + i), pos.getZ(t + i)]);
        // the centre, and each corner drawn in 6 cm toward the centre (a stone leans back with the batter and a coping lips past it: the last hand's breadth of a face is no footing)
        for (const [x, y, z] of [[cx, cy, cz], ...tri.map(([px, py, pz]) => { const d = Math.hypot(cx - px, cz - pz) || 1, k = Math.min(0.06, 0.9 * d) / d; return [px + (cx - px) * k, py, pz + (cz - pz) * k]; })]) {
          const gap = y - cb.world.groundAt(x, z);
          if (gap <= 0.02) continue;
          ray.set(new T.Vector3(x, y - 0.004, z), down); ray.far = 3;
          if (ray.intersectObject(m, false).length) continue;
          pts++; max = Math.max(max, gap); bad.push([x, z, y, gap]);
        }
      }
      m.material.side = side0;
      bad.sort((a, b) => b[3] - a[3]);
      const w = W._walls.get(m.name.replace(/^retaining_/, '').replace(/_near$/, ''));
      res.push({ wall: m.name, floatingPts: pts, maxGap: +max.toFixed(3), worst: bad.slice(0, 5).map(c => c.map(v => +v.toFixed(3)).join(' ')), rect: w && w.plan.rect, y: w && w.plan.y });
    }
    return res;
  });
  // (the page draws on request only: give the wall layer the frames a running game has had, so a wall whose ground moved since it was drawn has been footed again)
  await page.evaluate(() => { const cb = window.__cb, W = cb.world.walls; for (let i = 0; i < 3; i++) W.update(cb.ws.camera.position, 'high', cb.world.groundAt, 1, 50); });
  console.log('AUDIT', JSON.stringify(await auditFn()));
  if (process.env.REBUILD) {
    await page.evaluate(() => { const cb = window.__cb, W = cb.world.walls; for (const w of W._walls.values()) w.built = ''; W.update(cb.ws.camera.position, 'high', cb.world.groundAt, 0.1, 50); });
    console.log('AUDIT-REBUILT', JSON.stringify(await auditFn()));
  }
  if (process.env.DIAGJS) { const { readFileSync } = await import('node:fs'); console.log('DIAG', JSON.stringify(await page.evaluate(readFileSync(process.env.DIAGJS, 'utf8')))); }
  if (process.env.DUMP) {   // the plans and the ground under every wall, to replay the wall geometry offline (scripts/../src/game/terrain/retainWalls.dump.test.ts-style)
    const { writeFileSync } = await import('node:fs');
    const dump = await page.evaluate(() => {
      const W = window.__cb.world.walls._walls, g = window.__cb.world.groundAt, out = [];
      for (const [id, w] of W.entries()) {
        const b = w.plan.bbox, x0 = b.x0 - 0.8, z0 = b.z0 - 0.8, nx = Math.ceil((b.x1 - b.x0 + 1.6) / 0.05) + 1, nz = Math.ceil((b.z1 - b.z0 + 1.6) / 0.05) + 1, h = [];
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h.push(+g(x0 + i * 0.05, z0 + j * 0.05).toFixed(4));
        out.push({ id, plan: JSON.parse(JSON.stringify(w.plan)), seed: w.seed, k: w.k, grid: { x0, z0, nx, nz, step: 0.05, h } });
      }
      return out;
    });
    writeFileSync(`${out}/walls.json`, JSON.stringify(dump));
    console.log('dumped', dump.length);
  }
  if (process.env.AUDIT_ONLY) process.exit(0);
  let n = 0;
  const shot = async name => {
    await page.evaluate(() => window.__cb.qa.renderFull('high'));
    const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: f, timeout: 120000 });
    console.log('shot', f);
  };
  const NOR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const cands = walls.flatMap(w => w.runs.filter(r => r.fill > 0.12).map(r => ({ w, r }))).sort((a, b) => b.r.fill - a.r.fill).slice(0, 4);
  for (const { w, r } of cands) {
    const [nx, nz] = NOR[r.side], [tx, tz] = [-nz, nx];
    const mx = (r.pts[0][0] + r.pts[1][0]) / 2, mz = (r.pts[0][1] + r.pts[1][1]) / 2;
    for (const [tag, back, lat] of [['low', 1.7, 0.4], ['oblique', 1.4, 1.1], ['close', 0.45, 0.2], ['toe', 0.3, 1.3]]) {
      await page.evaluate(([mx, mz, nx, nz, tx, tz, back, lat]) => {
        const g = window.__cb.world.groundAt, ex = mx + nx * (0.14 + back) + tx * lat, ez = mz + nz * (0.14 + back) + tz * lat, lx = mx + nx * 0.1, lz = mz + nz * 0.1;
        window.__cb.qa.pose = { x: ex, y: g(ex, ez) + (back < 0.5 ? 0.09 : 0.28), z: ez, lx, ly: g(lx, lz) + 0.05, lz, fov: 55 };
      }, [mx, mz, nx, nz, tx, tz, back, lat]);
      await page.waitForTimeout(300);
      await shot(`wall-${w.id}-side${r.side}-${tag}`);
    }
  }
  await page.evaluate(() => { window.__cb.qa.pose = null; const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 0.9; cam.yaw = 0.6; });
  await page.waitForTimeout(300); await shot('above');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
