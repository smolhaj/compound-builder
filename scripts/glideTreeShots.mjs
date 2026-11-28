/**
 * The raid prompt's camera and the glide back to the player's view must not sit inside a tree: a raid prompt is staged, the camera is put at a conifer
 * (the eye in its crown), and a frame is taken. Before the fix the eye stays in the foliage; after it is moved out to the edge of the crown.
 *   flock /tmp/cb.lock node scripts/glideTreeShots.mjs <outDir> [port]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const [out = 'shots/glidetree', portArg = '5991'] = process.argv.slice(2);
const port = Number(portArg);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&lowrender&looktier=high`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 180000 });
  const tree = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp;
    const near = cb.world.treeSpecs.filter(t => t.kind === 'conifer' && t.scale >= 1.0).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    // a raid at the gate: the prompt (the cutscene state the camera hands over for)
    cb.game.setState(s => { const g = structuredClone(s.game); g.clock.speed = 0; g.gate.pending = { id: 'qaR', kind: 'gang', day: Math.floor(g.clock.t), title: 'QA armed gang', dossier: ['Armed men at the gate.'], size: 4, armed: true, strength: 9, wants: { canned: 2 }, stances: ['hide', 'parley', 'warn', 'defend', 'pay'] }; return { game: g, cutscene: null }; });
    cb.game.getState().advance(0.001);
    return near ? { x: near.x, z: near.z, y: near.y, scale: near.scale, sx: near.sx } : null;
  });
  console.log('tree', JSON.stringify(tree));
  await page.waitForTimeout(4500);   // (the prompt settles the camera for 2.6 s)
  let n = 0;
  const shot = async name => { await page.evaluate(() => window.__cb.qa.renderFull('high')); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f, timeout: 120000 }); console.log('shot', f); };
  for (const [tag, k] of [['crown', 0.45], ['crown-deep', 0.25]]) {
    await page.evaluate(([t, k]) => {
      const cb = window.__cb, g = cb.world.groundAt, R = 0.62 * t.scale * (t.sx ?? 1);
      // the eye a little in from the crown's edge, at two thirds of the tree's height, looking at the trunk
      const ex = t.x + R * k, ez = t.z, ey = g(ex, ez) + 1.4 * t.scale;
      const dx = ex - t.x, dz = ez - t.z, h = Math.hypot(dx, dz), up = ey - g(t.x, t.z);
      cb.cam.target.set(t.x, g(t.x, t.z), t.z); cb.cam.radius = Math.hypot(h, up); cb.cam.pitch = Math.atan2(up, h); cb.cam.yaw = Math.atan2(dx, dz);
    }, [tree, k]);
    await page.waitForTimeout(400); await shot(tag);
    console.log('eye', await page.evaluate(() => { const p = window.__cb.ws.camera.position; return [p.x, p.y, p.z].map(v => v.toFixed(2)).join(' '); }));
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
