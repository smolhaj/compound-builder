// Census delta of the shared contact-shadow layer on the mountain showcase: node scripts/contactCensus.mjs [tier] (needs a built app)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const tier = process.argv[2] ?? 'medium', port = 4197;
setTimeout(() => process.exit(2), 5 * 60 * 1000).unref();
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { srv.stdout.on('data', d => /localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, '')) && ok()); srv.on('exit', c => no(new Error('exit ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } }); page.setDefaultTimeout(200000);
  await page.goto(`http://localhost:${port}/?clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain&lowrender&looktier=${tier}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cb?.qa?.frames > 2 && window.__showcase, null, { polling: 200 });
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34; });
  await page.evaluate(() => new Promise(ok => { const f0 = window.__cb.qa.frames; const w = () => (window.__cb.qa.frames >= f0 + 8 ? ok() : setTimeout(w, 30)); w(); }));
  const r = await page.evaluate(() => {
    const cb = window.__cb, m = cb.world.contact.mesh, on = cb.census(), n = m.count, vis = m.visible;
    m.visible = false; const off = cb.census(); m.visible = vis;
    return { instances: n, on: { calls: on.drawCalls, tris: on.triangles }, off: { calls: off.drawCalls, tris: off.triangles }, shadowTris: on.shadowTriangles };
  });
  console.log(tier, JSON.stringify(r), 'delta calls', r.on.calls - r.off.calls, 'tris', r.on.tris - r.off.tris);
} finally { await browser.close(); srv.kill(); }
