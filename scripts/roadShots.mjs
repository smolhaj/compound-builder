/**
 * The way in, drawn: an aerial of the whole planned road and eye-level shots (a person in frame) at its features.
 *   flock $SP/render.lock node scripts/roadShots.mjs --out shots/roads [--port 5311] [--quality low|medium] [--only name] [--tod 15]
 * Cases are below (region + lot + seed, with the drive built); each shot is drawn on request (?lowrender).
 * Focus: struct:<kind> | hairpin:<n> | frac:<0..1> | gate.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5311)), outDir = resolve(opt('--out', 'shots/roads')), only = opt('--only', ''), quality = opt('--quality', 'low'), tod = Number(opt('--tod', 15));
mkdirSync(outDir, { recursive: true });

/** name, query, focus list */
const CASES = JSON.parse(opt('--cases', 'null')) ?? [
  ['mw-switchbacks', 'lowrender&clean&seed=7&drive&lot=hillside&relief=9&region=mountain_west&lotseed=1&elev=2500', ['hairpin:0', 'hairpin:1', 'frac:0.5', 'gate']],
  ['app-hollow', 'lowrender&clean&seed=6&drive&region=appalachia', ['struct:low_water', 'side:struct:low_water', 'frac:0.5']],
  ['plains-section', 'lowrender&clean&seed=6&drive&region=plains', ['struct:bridge1', 'side:struct:bridge1', 'frac:0.4']],
  ['pnw-spur', 'lowrender&clean&seed=7&drive&lot=hillside&relief=9&region=pnw&lotseed=3&elev=900', ['side:struct:culvert', 'frac:0.5']],
  ['plains-bridgedown', 'lowrender&clean&seed=6&drive&bridgedown&region=plains', ['side:struct:bridge1']],
  ['mw-tunnel', 'lowrender&clean&seed=7&drive&lot=saddle&relief=30&outlier&region=mountain_west&lotseed=6', ['portal:tunnel', 'orbit:portal:tunnel', 'frac:0.3']],
];

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text().slice(0, 200)); });
const summary = {};
try {
  for (const [name, query, focus] of CASES) {
    if (only && !name.includes(only)) continue;
    await page.goto(`http://localhost:${port}/?${query}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
    await page.evaluate(([t, q]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality(q); store.getState().setTimeOfDay(t); }, [tod, quality]);
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => { const p = window.__cb.world.plan; return { region: p.region, phase: p.phase, lengthM: p.lengthM, straightM: p.straightM, maxGradePct: p.maxGradePct, hairpins: p.hairpins.length, usd: p.usd, structures: p.structures.map(s => s.kind + '@' + Math.round(s.s0)), lines: p.lines, driveMin: p.driveMin, straightMin: p.straightMin }; });
    console.log(name, JSON.stringify(info));
    summary[name] = info;
    const shot = async label => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(300); const f = `${outDir}/${name}-${label}.png`; await page.screenshot({ path: f }); console.log(f); };
    // aerial over the whole road
    await page.evaluate(() => {
      const { world, cam } = window.__cb, P = world.plan.pts;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      window.__cb.qa.pose = null;
      cam.target.set(cx, world.groundAt(cx, cz), cz);
      cam.radius = Math.max(x1 - x0, z1 - z0) * 1.15 + 9; cam.pitch = 0.95; cam.yaw = 0.35;
    });
    await shot('aerial');
    for (const f of focus) {
      const ok = await page.evaluate(spec0 => {
        const { world } = window.__cb, plan = world.plan, P = plan.pts;
        // side:<focus> looks at the feature from beside the road (a person on it), 3 units off and a little above the ground
        const side = spec0.startsWith('side:'), orbit = spec0.startsWith('orbit:'), spec = side ? spec0.slice(5) : orbit ? spec0.slice(6) : spec0;
        let s;
        if (spec === 'gate') s = P[plan.gateAt].s + 1.5;
        else if (spec.startsWith('frac:')) s = P[P.length - 1].s * Number(spec.slice(5));
        else if (spec.startsWith('hairpin:')) { const h = plan.hairpins[Number(spec.slice(8))]; if (!h) return false; s = h.s; }
        else if (spec.startsWith('struct:')) { const k = spec.slice(7), st = plan.structures.find(x => x.kind === k); if (!st) return false; s = (st.s0 + st.s1) / 2; }
        else if (spec.startsWith('portal:')) { const k = spec.slice(7), st = plan.structures.find(x => x.kind === k); if (!st) return false; s = st.s0 - 0.2; }
        else return false;
        const at = ss => { let i = 0; while (i < P.length - 2 && P[i + 1].s < ss) i++; const a = P[i], b = P[i + 1], t = Math.max(0, Math.min(1, (ss - a.s) / Math.max(1e-6, b.s - a.s))); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t }; };
        if (spec0.startsWith('orbit:')) {
          // the orbit camera (kept out of the ground) on the approach side, looking at the feature from above and to the side
          const c = at(s), a = at(s - 0.6), b = at(s + 0.6), tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
          const man = at(s - 1.3);
          world.qaFigure(man.x + tz / tl * 0.2, man.z - tx / tl * 0.2);
          window.__cb.qa.pose = null;
          const cm = window.__cb.cam;
          cm.target.set(c.x, c.y + 0.3, c.z); cm.radius = 5.2; cm.pitch = 0.42; cm.yaw = Math.atan2(-tx, -tz) + 0.5;
          return true;
        }
        if (side) {
          const c = at(s), a = at(s - 0.6), b = at(s + 0.6), tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
          const man = at(s + 1.4);
          world.qaFigure(man.x + nx * 0.2, man.z + nz * 0.2);
          const cx = c.x + nx * 1.6 - tx / tl * 3.4, cz = c.z + nz * 1.6 - tz / tl * 3.4;
          window.__cb.qa.pose = { x: cx, y: Math.max(world.groundAt(cx, cz), c.y - 0.5) + 0.45, z: cz, lx: c.x, ly: c.y + 0.05, lz: c.z, fov: 58 };
          return true;
        }
        const cam = at(Math.max(0.5, s - 4.5)), look = at(s + 1.5), man = at(Math.max(0.5, s - 1.6)), fx = look.x - cam.x, fz = look.z - cam.z, fl = Math.hypot(fx, fz) || 1;
        // the person stands beside the road, 0.22 to the left of the centre line
        const nx = fz / fl, nz = -fx / fl;
        world.qaFigure(man.x + nx * 0.2, man.z + nz * 0.2);
        const ey = Math.max(world.groundAt(cam.x, cam.z), cam.y) + 0.26;
        window.__cb.qa.pose = { x: cam.x, y: ey, z: cam.z, lx: look.x, ly: look.y + 0.1, lz: look.z, fov: 62 };
        return true;
      }, f);
      if (!ok) { console.log('no focus', name, f); continue; }
      await page.waitForTimeout(400);
      await shot((f.startsWith('side:') || f.startsWith('orbit:') ? '' : 'eye-') + f.replace(/:/g, ''));
    }
    // a second, higher look from the side at the first feature
    await page.evaluate(() => { window.__cb.qa.pose = null; });
  }
} catch (e) { console.error('ERR', e.message); }
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
await browser.close(); vite.kill();
process.exit(0);
