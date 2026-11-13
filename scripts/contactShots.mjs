/**
 * Contact shadows / wall-foot occlusion before-and-after: eye level with a person beside a wall, and from above, across the day.
 *   flock /tmp/cb.lock node scripts/contactShots.mjs --out /tmp/claude-0/gfx/ao [--mode showcase|plain] [--region pnw] [--times 7,12,18.5,22] [--q medium] [--before 12,18.5]
 * showcase: the mountain showcase (a compound on a slope); plain: the family's camp on the region's flat lot. `--before` lists the hours that also get an "off" shot.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', '/tmp/claude-0/gfx/ao')), mode = opt('--mode', 'showcase'), region = opt('--region', 'pnw'), q = opt('--q', 'medium'), port = Number(opt('--port', 5447));
const times = opt('--times', '7,12,18.5,22').split(',').map(Number), before = opt('--before', '12,18.5').split(',').map(Number), tag = opt('--tag', mode === 'showcase' ? 'pnw-slope' : region);
const views = opt('--views', 'eye,wall,air').split(',');
mkdirSync(out, { recursive: true });
setTimeout(() => { console.error('watchdog'); process.exit(2); }, 560000).unref();
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => /localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, '')) && ok()); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }); page.setDefaultTimeout(300000);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.text().slice(0, 400)); });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  const url = mode === 'showcase'
    ? `http://localhost:${port}/?lowrender=0.75&clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain`
    : `http://localhost:${port}/?lowrender=0.75&clean&seed=7&region=${region}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow && (location.search.includes('showcase') ? window.__showcase : true));
  await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), q);
  for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(100); }
  // the subject: the lodge (showcase) or the camp; a person stood beside its wall
  const S = await page.evaluate(() => {
    const cb = window.__cb, g = cb.game.getState().game, w = cb.world;
    const lodge = g.structures.find(s => s.kind === 'lodge') ?? g.structures.find(s => s.finishedAt !== null && s.kind !== 'perimeter');
    const b = lodge ? w._built.get(lodge.id) : null;
    return b ? { x: b.placed.x, z: b.placed.z, f: b.fpBody } : { x: w.camp.x, z: w.camp.z, f: null };
  });
  console.error('subject', JSON.stringify(S));
  const place = async (px, pz, fx, fz) => page.evaluate(([x, z, fx, fz]) => {
    const w = window.__cb.world; const a = [...w.family._agents.values()][1] ?? [...w.family._agents.values()][0]; if (!a) return false;
    a.x = x; a.z = z; a.rot = Math.atan2(fx - x, fz - z); a.via = []; a.viaFor = null; return true;
  }, [px, pz, fx, fz]);
  // the scene-graph census with and without the layer (upper bound, no culling): what it adds to the perf budget
  if (args.includes('--census')) {
    for (const tier of ['medium']) {
      await page.evaluate(q => window.__cb.store.getState().setQuality(q), tier);
      for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(100); }
      const r = await page.evaluate(() => {
        const cb = window.__cb, m = cb.world.contact.mesh, on = cb.census(), n = m.count, vis = m.visible;
        m.visible = false; const off = cb.census(); m.visible = vis;
        return { instances: n, calls: on.drawCalls - off.drawCalls, tris: on.triangles - off.triangles, total: { calls: on.drawCalls, tris: on.triangles, shadowTris: on.shadowTriangles } };
      });
      console.error('CENSUS', tier, JSON.stringify(r));
    }
    await page.evaluate(q => window.__cb.store.getState().setQuality(q), q);
  }
  const frames = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(200); };
  const shoot = async (name, on) => { await page.evaluate(v => { window.__cb.world.contact.enabled = v; }, on); await frames(); await frames(); await page.screenshot({ path: `${out}/${tag}-${name}-${on ? 'after' : 'before'}.png` }); console.error('shot', tag, name, on, JSON.stringify(await page.evaluate(() => { const c = window.__cb.world.contact; return { n: c.mesh.count, vis: c.mesh.visible, par: !!c.mesh.parent }; }))); };
  const f = S.f;
  // person 0.45 off the south-east wall corner (or at the camp)
  const px = f ? f.x1 + 0.42 : S.x + 1.2, pz = f ? f.z0 + (f.z1 - f.z0) * 0.35 : S.z + 0.8;
  const eye = (x, z, lx, lz, h) => page.evaluate(([x, z, lx, lz, h]) => { const { world } = window.__cb, gr = world.groundAt; window.__cb.qa.pose = { x, y: gr(x, z) + h, z, lx, ly: gr(lx, lz) + 0.1, lz, fov: 55 }; }, [x, z, lx, lz, h]);
  if (args.includes('--debug')) {
    await page.evaluate(t => window.__cb.store.getState().setTimeOfDay(t), 12);
    await place(px, pz, px, pz - 1); await eye(px + 1.2, pz + 0.8, px, pz, 0.5); await place(px, pz, px, pz - 1);
    await page.evaluate(() => { const m = window.__cb.world.contact.mesh.material; m.uniforms.uColor.value.set(1, 0, 0); m.uniforms.uOpacity.value = 6; m.uniforms.uNight.value = 1; m.uniforms.uFade.value.set(1e4, 2e4); });
    await shoot('dbg1-red', true);
    await page.evaluate(() => { const c = window.__cb.world.contact, m = c.mesh; m.material = new window.__cb.THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false }); m.material.needsUpdate = true; });
    await shoot('dbg2-basic', true);
    process.exit(0);
  }
  for (const t of times) {
    await page.evaluate(t => window.__cb.store.getState().setTimeOfDay(t), t);
    const states = before.includes(t) ? [false, true] : [true];
    for (const on of states) {
      const hh = String(t).replace('.', 'h');
      if (views.includes('eye')) { await place(px, pz, px, pz - 1); await eye(px + 1.2, pz + 0.8, px, pz, 0.5); await place(px, pz, px, pz - 1); await shoot(`${hh}-eye`, on); }
      if (views.includes('wall') && f) { await place(px, pz, px, pz - 1); await eye(f.x1 + 1.8, f.z1 + 1.8, f.x1, f.z1 - 0.2, 0.45); await place(px, pz, px, pz - 1); await shoot(`${hh}-wall`, on); }
      if (views.includes('air')) { await page.evaluate(([x, z]) => { const { world, cam } = window.__cb; window.__cb.qa.pose = null; cam.target.set(x, world.groundAt(x, z) + 0.5, z); cam.radius = 11; cam.pitch = 0.62; cam.yaw = 0.7; }, [S.x, S.z]); await shoot(`${hh}-air`, on); }
    }
  }
} finally { await browser.close(); vite.kill(); }
