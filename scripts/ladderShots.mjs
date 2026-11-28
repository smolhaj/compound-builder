/**
 * A raider's ladder after the retreat (cutscene props): the ladder leans on a wall, its climber climbs and walks away, and the ladder is
 * laid flat and picked up. Drives SceneProps by hand on the QA hillside lot (the same events and update the cutscene sends).
 *   flock /tmp/cb.lock node scripts/ladderShots.mjs <outDir> [port]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const [out = 'shots/ladder', portArg = '5990'] = process.argv.slice(2);
const port = Number(portArg);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${port}/?clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&lowrender&looktier=high`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 180000 });
  const spot = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    cb.tool.setKind('timber_cabin'); cb.tool.hoverAt(sp[0], sp[1], 0); cb.tool.placeHere(); cb.tool.setKind(null);
    G.setState(s => { const g = structuredClone(s.game); g.structures.forEach(x => { x.finishedAt = g.clock.t; x.stage = 99; }); return { game: g }; });
    G.getState().advance(3);
    return { x: sp[0], z: sp[1] };
  });
  let n = 0;
  const shot = async name => { await page.evaluate(() => window.__cb.qa.renderFull('high')); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f, timeout: 120000 }); console.log('shot', f); };
  // the ladder: foot 0.3 u out from a point 6 u east of the cabin, top 0.5 u up the wall (a fence's height)
  await page.evaluate(([x, z]) => {
    const cb = window.__cb, P = cb.battle.props, g = cb.world.groundAt;
    window.__lad = { x: x + 6, z, owner: { x: x + 6.3, y: 0, z, rot: 0, dead: false, gone: false } };
    P.onEvent({ t: 0, kind: 'ladder', x: x + 6, z, h: 0.5, fx: x + 6.3, fz: z, unit: 'r9' });
    const L = window.__lad; cb.cam.target.set(L.x + 0.1, g(L.x, L.z) + 0.2, L.z); cb.cam.radius = 2.6; cb.cam.pitch = 0.25; cb.cam.yaw = 0.9;
  }, [spot.x, spot.z]);
  const step = async (secs, owner) => page.evaluate(([secs, owner]) => { const L = window.__lad; const o = { ...L.owner, ...owner }; for (let i = 0; i < Math.round(secs / 0.1); i++) window.__cb.battle.props.update(0.1, () => o); }, [secs, owner]);
  await step(0.2, {}); await page.waitForTimeout(300); await shot('standing-at-foot');
  await step(0.4, { y: 0.4 });   // (up the rungs)
  await step(2.0, { x: 99, z: 99 });   // the raider is far off, retreating
  await page.waitForTimeout(300); await shot('after-retreat-lying');
  await step(4.0, { x: 99, z: 99 });
  await page.waitForTimeout(300); await shot('picked-up');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
