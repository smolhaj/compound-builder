// Dome vehicle sally port shots (docs/ux/dome-road): the road ends at the port, apron, gates, lane inside. HIGH quality, one dome per page load.
//   KIND=dome_glass ROT=1 flock /tmp/cb.lock node scripts/domePortShots.mjs <outDir> [port] [names]
// names: aerial, eye, inside, night, closeup (default: all)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5994), only = process.argv[4] ? process.argv[4].split(',') : null;
const KIND = process.env.KIND || 'dome_glass', ROT = Number(process.env.ROT ?? 1), TAG = process.env.TAG || '';
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const want = n => !only || only.includes(n);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=${process.env.RELIEF ?? 0}&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${TAG}${name}.png` }); lap(name); };
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async ([KIND, ROT]) => {
    const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const y = w.access.yard, drive = w.access.drive, end = drive[drive.length - 1];
    // the dome stands over the end of the drive, as in the owner's scene: its centre a little way back from the yard toward the house
    const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, ROT, 14);
    if (!sp) return null;
    G.getState().plan(KIND, sp[0], sp[1], ROT);
    const st = G.getState().game.structures.at(-1);
    G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    return { id: st.id, x: st.x, z: st.z, rot: ROT, port: st.portAngle ?? null, yard: [y.x, y.z], end };
  }, [KIND, ROT]);
  if (!info) throw new Error('no spot for ' + KIND);
  lap(JSON.stringify(info));
  await frames(4);
  const dm = await page.evaluate(async id => { const s = await import('/src/sim/dome/standing.ts'); const d = s.domesOf(window.__cb.game.getState().game).find(x => x.id === id); const a = d.airlocks.find(l => l.role === 'vehicle'); return { r: d.r, x: d.x, z: d.z, a: a ? { angle: a.angle, x: a.x, z: a.z, inX: a.inX, inZ: a.inZ } : null, tier: d.tier }; }, info.id);
  lap(JSON.stringify(dm));
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const poseRaw = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const pr = async (e, l, fov = 55) => poseRaw([e[0], (await gd(e[0], e[2])) + e[1], e[2]], [l[0], (await gd(l[0], l[2])) + l[1], l[2]], fov);
  const person = async (x, z) => page.evaluate(async ([x, z]) => { const m = await import('/src/game/HomesteadWorld.ts'); window.__cb.ws.scene.add(m.scaleFigure(x, z, window.__cb.world.groundAt(x, z))); }, [x, z]);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(${process.env.NIGHT ? 21.5 : 15.5}); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  const a = dm.a, u = a ? [Math.sin(a.angle), Math.cos(a.angle)] : [1, 0], n = [u[1], -u[0]], R = dm.r;
  const at = (rho, lam) => [dm.x + u[0] * rho + n[0] * lam, dm.z + u[1] * rho + n[1] * lam];
  if (want('aerial')) {
    await pr(at(R + 14, -9), [dm.x + u[0] * R * 0.5, 0.5, dm.z + u[1] * R * 0.5].map((v, i) => i === 1 ? 0.5 : v), 55);
    await shot('aerial-from-port-side');
    await pr([dm.x - 0.5 * u[0] * R, R * 3.2, dm.z + R * 1.2], [at(R + 3, 0)[0], 0, at(R + 3, 0)[1]], 60); await shot('aerial-high');
  }
  if (want('closeup')) { await pr(at(R + 6.5, -3.5), [...at(R, 0)].flatMap((v, i) => i === 0 ? [v, 0.25] : [v]).slice(0, 3), 52); await shot('port-closeup'); }
  if (want('eye')) {
    await page.evaluate(([x, z]) => { const lines = [{ material: 'lumber', qty: 6 }]; window.__cb.world.truck.qaHold(lines, window.__cb.world.truck.inLength - 0.5); }, [0, 0]);
    await person(...at(R + 2.2, 0.75));
    await frames(2);
    await pr(at(R + 5.8, -2.3), [...at(R, 0)].flatMap((v, i) => i === 0 ? [v, 0.25] : [v]).slice(0, 3), 58); await shot('eye-at-port-truck-person');
  }
  if (want('inside')) {
    await person(...at(R - 1.8, 0.5));
    await pr(at(R - 3.2, 0), [...at(R + 1.2, 0)].flatMap((v, i) => i === 0 ? [v, 0.3] : [v]).slice(0, 3), 62); await shot('inside-looking-out');
  }
  if (want('night')) {
    await set(`cb.store.getState().setTimeOfDay(21.5)`);
    await pr(at(R + 6.5, -3.5), [...at(R, 0)].flatMap((v, i) => i === 0 ? [v, 0.25] : [v]).slice(0, 3), 55); await shot('night-port');
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
