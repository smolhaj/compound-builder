// People lineup sheet: every role in a row at eye level, then the same people in the action poses, on the real ground beside the camp.
//   flock /tmp/cb.lock node scripts/peopleLineup.mjs <outDir> [port=5951] [tag=after]
// Works against the old figure kit too (no roleWear module: personas only), for the before images.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2] || '/tmp/claude-0/gfx/people', port = Number(process.argv[3] || 5951), tag = process.argv[4] || 'after';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 520 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.9&looktier=medium`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('medium'));
  const info = await page.evaluate(async () => {
    const cb = window.__cb;
    const K = await import('/src/engine/world/people/figureKit.ts');
    let R = null; try { R = await import('/src/engine/world/people/roleWear.ts'); } catch { /* old kit */ }
    const C = await import('/src/engine/world/people/crowdWear.ts');
    const c = cb.world.camp;
    const [ox, oz] = cb.world.openSpotNear(c.x, c.z + 6, 3.5);
    const ground = cb.world.groundAt;
    const layer = new K.FigureLayer(cb.ws.scene, 64, 'lineup');
    window.__lineup = { layer, K, R };
    const rnd = (s) => { let a = s >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
    const rowRoles = R
      ? [['child', { age: 8 }], ['teen', { age: 15, female: true }], ['adult', { female: true }], ['adult', {}], ['elder', { age: 72 }], ['elder', { age: 70, female: true }], ['farmer', {}], ['builder', {}], ['cook', { female: true }], ['medic', { female: true }], ['guard', {}], ['neighbor', {}], ['trader', {}], ['scavenger', {}], ['militia', {}], ['tactical', {}]]
      : [['kid'], ['kid'], ['resident'], ['resident'], ['elder'], ['elder'], ['vendor'], ['volunteer'], ['vendor'], ['parent'], ['faculty'], ['resident'], ['parent'], ['resident'], ['lecturer'], ['lecturer']];
    const wears = rowRoles.map(([r, o], i) => R ? R.wearForRole(1000 + i * 37, r, { season: 'fall', climate: 'mild', ...o }) : C.pickPersonaWear(rnd(1000 + i * 37), r, { season: 'fall', team: null }));
    const scales = rowRoles.map(([r]) => (r === 'child' || r === 'kid') ? 0.66 : r === 'teen' ? 0.92 : 1);
    window.__lineup.rows = { wears, scales, n: wears.length, ox, oz };
    window.__lineup.ground = ground;
    return { ox, oz, n: wears.length };
  });
  await page.keyboard.press('h');
  await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); window.__cb.store.getState().setTimeOfDay(13); });
  const frames = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); };
  const setRow = async (name, poseFn) => {
    await page.evaluate(([poseFn]) => {
      const { layer, K, rows } = window.__lineup, ground = window.__cb.world.groundAt;
      const cb = window.__cb;
      const f = new Function('i', 'K', `return (${poseFn})(i, K)`);
      const cam = cb.cam;
      const cx = rows.ox + (rows.n - 1) * 0.5 * 0.34 / 2, cz = rows.oz;
      for (let i = 0; i < rows.n; i++) {
        const x = rows.ox + i * 0.34 - (rows.n - 1) * 0.17, z = rows.oz;
        layer.setWear(i, rows.wears[i]);
        const o = f(i, K);
        layer.setPose(i, { x, y: ground(x, z), z, rot: Math.PI, scale: rows.scales[i], phase: 0, amp: 0, ...o });
      }
      layer.commit(rows.n, true);
      if (layer.setTime) layer.setTime(3.7);
      cam.target.set(rows.ox - 1.4, 0.14, rows.oz); cam.radius = 1.7; cam.pitch = 0.12; cam.yaw = 0;
    }, [poseFn]);
    await frames(); await frames();
    await page.screenshot({ path: `${out}/lineup-${tag}-${name}-a.png` });
    await page.evaluate(() => { const { rows } = window.__lineup; window.__cb.cam.target.set(rows.ox + 1.4, 0.14, rows.oz); });
    await frames(); await frames();
    await page.screenshot({ path: `${out}/lineup-${tag}-${name}-b.png` });
    console.error('shot', name);
  };
  await setRow('roles', '(i,K)=>({pose:K.FIG_POSE.STAND})');
  await setRow('walk', '(i,K)=>({pose:K.FIG_POSE.STAND, phase: i*0.9, amp:0.55})');
  if (await page.evaluate(() => !!window.__lineup.R)) {
    await setRow('actions', `(i,K)=>{const P=K.FIG_POSE,T=K.FIG_TOOL;const l=[[P.CHOP,T.AXE],[P.HOE,T.HOE],[P.DIG,T.SHOVEL],[P.STIR,T.SPOON],[P.REACH,T.HAMMER],[P.KNEEL,0],[P.CARRY,T.LOGS],[P.PAIL,T.PAIL],[P.AIM,T.RIFLE],[P.RIFLE,T.RIFLE],[P.COVER,0],[P.CARRYP,0],[P.BENCH,0],[P.CROSS,0],[P.HANG,0],[P.STAND,0]][i%16];return {pose:l[0],tool:l[1]}}`);
  } else {
    await setRow('actions', `(i,K)=>{const P=K.FIG_POSE,T=K.FIG_TOOL;const l=[[P.CHOP,T.AXE],[P.HOE,T.HOE],[P.STIR,T.SPOON],[P.REACH,T.HAMMER],[P.KNEEL,0],[P.CARRY,0],[P.PAIL,T.PAIL],[P.RIFLE,T.RIFLE],[P.BENCH,0],[P.CROSS,0],[P.HANG,0],[P.STAND,0]][i%12];return {pose:l[0],tool:l[1]}}`);
  }
  // close up, two people
  await page.evaluate(() => { const { rows } = window.__lineup, cb = window.__cb; cb.cam.target.set(rows.ox - 0.34 * 3, 0.14, rows.oz); cb.cam.radius = 0.8; });
  await frames(); await frames(); await page.screenshot({ path: `${out}/lineup-${tag}-close.png` });
} finally { await browser.close(); vite.kill(); }
