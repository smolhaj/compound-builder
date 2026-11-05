/**
 * Terrain / infrastructure QA: many lots across regions and kinds, with the drive in. Per case: a wide aerial over the county road
 * and the way in, a road-and-water close-up, an eye-level with a person, and a JSON line of the plan's structures + where the county
 * road meets water. Always ?lowrender.
 *   node scripts/terrainQa.mjs --out shots/terrain-before [--port 5360] [--cases mountain_west:gorge:3,pnw:hillside:2] [--noshots]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5360)), outDir = resolve(opt('--out', 'shots/terrain-before')), noshots = args.includes('--noshots');
const cases = opt('--cases', 'mountain_west:gorge:3,mountain_west:hillside:3,mountain_west:bench:3,mountain_west:ridge:3').split(',').map(c => { const [region, kind, seed, extra] = c.split(':'); return { region, kind, seed: seed ?? '3', extra: extra ?? '' }; });
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(240000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
for (const c of cases) {
  const tag = `${c.region}-${c.kind}-${c.seed}${c.extra ? '-' + c.extra : ''}`;
  try {
    const q = `lowrender&clean&seed=7&drive&lot=${c.kind}&relief=8&acres=40&region=${c.region}&lotseed=${c.seed}${c.extra.includes('o') ? '&outlier' : ''}${c.extra.includes('c') || c.kind === 'hillside' ? '&lotcreek' : ''}`;
    await page.goto(`http://localhost:${port}/?${q}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 240000 });
    await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(14); });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const { world } = window.__cb, p = world.plan, ct = world.county, par = world.parcel;
      // sample the county road for water / steepness
      const out = { camp: world.camp, gate: world.access.gate, structures: p ? p.structures.map(s => ({ k: s.kind, x: +s.x.toFixed(1), z: +s.z.toFixed(1), m: s.lengthM })) : null, phase: p?.phase, lengthM: p?.lengthM, maxGrade: p?.maxGradePct, countyWet: [] };
      const cz = par.creek;
      for (let z = -40; z <= 140; z += 2) { const x = ct.x(z); const g = world.groundAt(x, z); const cc = cz ? Math.abs(cz.zAt(x) - z) : 99; if ((cz && cc < 3) ) out.countyWet.push([+x.toFixed(1), z, +g.toFixed(2), +cc.toFixed(1)]); }
      return out;
    });
    console.log(tag, JSON.stringify(info));
    if (args.includes('--profile')) console.log(tag, 'profile', JSON.stringify(await page.evaluate(() => { const w = window.__cb.world, g = w.countyGaps.find(g => g.wet); if (!g) return null; const o = []; for (let z = g.z0 - 3; z <= g.z1 + 3; z += 2) { const x = w.county.x(z); o.push([z, +w.groundAt(x, z).toFixed(2), +w.countyY(x, z).toFixed(2), +w.parcel.creek.waterY(x).toFixed(2)]); } return o; })));
    if (noshots) continue;
    const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(300); const f = `${outDir}/${tag}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
    // wide aerial: county road and the way in
    await page.evaluate(() => { const { world, cam } = window.__cb, g = world.access.gate, x = g.x + 4, z = g.z; cam.target.set(x, world.groundAt(x, z), z); cam.radius = 46; cam.pitch = 0.95; cam.yaw = 1.5; });
    await shot('aerial');
    // along the way in, from the gate toward the county road
    await page.evaluate(() => { const { world, cam } = window.__cb, g = world.access.gate; cam.target.set(g.x, world.groundAt(g.x, g.z), g.z); cam.radius = 14; cam.pitch = 0.42; cam.yaw = 0.7; });
    await shot('gate');
    // eye with a person at the camp
    await page.evaluate(() => { const { world, cam } = window.__cb, c = world.camp, ps = world.family.positions(), p = ps[0] ?? { x: c.x, z: c.z }; const [ex, ez] = world.openSpotNear(p.x - 2.6, p.z + 1.4, 0.8); cam.placeEye(ex, ez, p.x, p.z, 0.45); });
    await shot('eye');
    // the county road where it crosses water or a cut: aerial, then eye level on the road looking at the crossing
    const gaps = await page.evaluate(() => window.__cb.world.countyGaps?.map(g => ({ z0: g.z0, z1: g.z1, wet: g.wet, depth: +g.depth.toFixed(2), m: Math.round(g.lengthM) })) ?? null);
    console.log(tag, 'countyGaps', JSON.stringify(gaps));
    const wet = await page.evaluate(() => { const w = window.__cb.world, c = w.parcel.creek; if (!w.parcel.hasStream) return null; for (let z = -60; z < 200; z += 0.5) { if (Math.abs(c.zAt(w.county.x(z)) - z) < 0.6) return z; } return null; });
    const gp = gaps && (gaps.find(g => g.wet && g.z0 > -120 && g.z1 < 220) ?? gaps.filter(g => g.z0 > -60 && g.z1 < 190)[0]), cz = gp ? (gp.z0 + gp.z1) / 2 : wet;
    if (cz !== null && cz !== undefined) {
      await page.evaluate(z => { const { world, cam } = window.__cb, x = world.county.x(z); cam.target.set(x, world.countyY(x, z), z); cam.radius = 26; cam.pitch = 0.8; cam.yaw = 2.2; }, cz);
      await shot('cross');
      await page.evaluate(z => { const { world, cam } = window.__cb, x = world.county.x(z); cam.target.set(x, world.countyY(x, z), z); cam.radius = 9; cam.pitch = 0.3; cam.yaw = 1.2; }, cz);
      await shot('crossclose');
      await page.evaluate(z => { const { world, cam } = window.__cb; const g0 = world.countyGaps.find(g => z >= g.z0 && z <= g.z1), zz = (g0 ? g0.z0 : z) - 7, x = world.county.x(zz) - 0.3; cam.placeEye(x, zz, world.county.x(z), z, 0.5); }, cz);
      await shot('crosseye');
    }
    // each structure of the plan, close
    const n = info.structures?.filter(s => !['cattle_guard', 'pass'].includes(s.k)).length ?? 0;
    for (let i = 0; i < Math.min(n, 2); i++) {
      await page.evaluate(i => { const { world, cam } = window.__cb, s = world.plan.structures.filter(s => !['cattle_guard', 'pass'].includes(s.kind))[i]; cam.target.set(s.x, world.groundAt(s.x, s.z), s.z); cam.radius = 9; cam.pitch = 0.5; cam.yaw = s.rot + 0.9; }, i);
      await shot('struct' + i);
    }
  } catch (e) { console.error('ERR', tag, e.message); }
}
await browser.close(); vite.kill();
process.exit(0);
