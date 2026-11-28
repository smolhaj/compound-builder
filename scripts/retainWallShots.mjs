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
  const audit = await page.evaluate(() => {   /* (all near meshes, seen or not) */
    const cb = window.__cb, W = cb.world.walls, res = [];
    for (const m of W.group.children) {
      if (!/_near$/.test(m.name)) continue;
      const pos = m.geometry.attributes.position, cells = new Map();
      for (let i = 0; i < pos.count; i++) { const k = Math.round(pos.getX(i) / 0.1) + ',' + Math.round(pos.getZ(i) / 0.1); cells.set(k, Math.min(cells.get(k) ?? Infinity, pos.getY(i))); }
      let max = 0, over = 0, n = 0;
      for (const [k, y] of cells) { const [cx, cz] = k.split(',').map(Number); const gap = y - cb.world.groundAt(cx * 0.1, cz * 0.1); n++; if (gap > 0.03) over++; max = Math.max(max, gap); }
      const worst = [...cells].map(([k, y]) => { const [cx, cz] = k.split(',').map(Number); return { x: cx * 0.1, z: cz * 0.1, y, g: cb.world.groundAt(cx * 0.1, cz * 0.1) }; }).map(c => ({ ...c, gap: c.y - c.g })).sort((a, b) => b.gap - a.gap).slice(0, 6).map(c => [c.x.toFixed(1), c.z.toFixed(1), c.y.toFixed(3), c.g.toFixed(3)].join(' '));
      const w = W._walls.get(m.name.replace(/^retaining_/, '').replace(/_near$/, ''));
      res.push({ wall: m.name, cells: n, over, maxGap: +max.toFixed(3), worst, rect: w && w.plan.rect, y: w && w.plan.y });
    }
    return res;
  });
  console.log('AUDIT', JSON.stringify(audit));
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
    for (const [tag, back, lat] of [['low', 1.7, 0.4], ['oblique', 1.4, 1.1]]) {
      await page.evaluate(([mx, mz, nx, nz, tx, tz, back, lat]) => {
        const g = window.__cb.world.groundAt, ex = mx + nx * (0.14 + back) + tx * lat, ez = mz + nz * (0.14 + back) + tz * lat, lx = mx + nx * 0.1, lz = mz + nz * 0.1;
        window.__cb.qa.pose = { x: ex, y: g(ex, ez) + 0.28, z: ez, lx, ly: g(lx, lz) + 0.05, lz, fov: 55 };
      }, [mx, mz, nx, nz, tx, tz, back, lat]);
      await page.waitForTimeout(300);
      await shot(`wall-${w.id}-side${r.side}-${tag}`);
    }
  }
  await page.evaluate(() => { window.__cb.qa.pose = null; const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 0.9; cam.yaw = 0.6; });
  await page.waitForTimeout(300); await shot('above');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
