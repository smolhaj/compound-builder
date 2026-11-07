/**
 * The collapse's look in the real app: for each disaster, the warning, the day-it-happened card, the impact and three days after,
 * from the air and at eye level; for the grid disasters a night shot before and after.
 *   node scripts/collapseShots.mjs [--kinds ash_winter,grid_down,wildfire] [--port 5971] [--out shots/collapse]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5971)), quality = opt('--quality', 'medium');
const quickDay = Number(opt('--day', 6));
const quick = args.includes('--quick');   // day 6 at noon and at night only (eye and air): the look at rest, a fraction of the frames
const kinds = opt('--kinds', 'ash_winter,grid_down,wildfire').split(',');
const outDir = resolve(opt('--out', 'shots/collapse'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  // (software GL: the live loop draws Low; each shot lifts one frame to full quality, with the weather layer on)
  await page.evaluate(() => { window.__cb.qa.weather = true; });
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  const shot = async (name, k = 6) => { await frames(2); await page.evaluate(q => window.__cb.qa.renderFull(q), quality === 'medium' ? 'medium' : 'high'); const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.log(f); };
  // a cabin with a palisade, finished
  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    window.__spot = sp;
  });
  await frames(4);
  const view = async (mode) => page.evaluate(([mode, quick]) => {
    window.__cb.store.setState({ hudHidden: mode === 'eye' || quick });
    const cb = window.__cb, sp = window.__spot, gr = cb.world.groundAt;
    if (mode === 'eye') { const x = sp[0] + 2, z = sp[1] + 7; cb.qa.pose = { x, y: gr(x, z) + 0.34, z, lx: sp[0] - 1, ly: gr(sp[0], sp[1]) + 0.9, lz: sp[1] - 8, fov: 66 }; }
    else { cb.qa.pose = null; cb.cam.target.set(sp[0], gr(sp[0], sp[1]), sp[1]); cb.cam.radius = 26; cb.cam.pitch = 0.62; cb.cam.yaw = 0.7; }
  }, [mode, quick]);
  // put the world at a day (days from the hit) and hour; the disaster's phase and tracks follow
  const setDay = (kind, days, hour, variant, exact = false) => page.evaluate(async ([kind, days, hour, variant, exact, kinds]) => {
    const { triggerDisaster, tracksAt } = await import('/src/sim/disaster.ts');
    const G = window.__cb.game;
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      if (g.disaster.kind !== kind) { g.disaster.mode = 'sandbox'; g.disaster.phase = 'peace'; triggerDisaster(g.disaster, 0, kind, g.seed, 14, variant); g.disaster.hitAt = 20 + 40 * kinds.indexOf(kind); g.disaster.warnAt = g.disaster.hitAt - 14; g.disaster.fate = 'full'; }
      const hit = g.disaster.hitAt;
      g.clock.t = exact ? hit + days : Math.floor(hit + days) + 0.25 + (hour - 12) / 24;
      g.clock.speed = 0; g.gate.pending = null; g.gate.incoming = null;
      g.disaster.phase = days < -0.001 ? 'warning' : days < 3 ? 'impact' : 'survival';
      g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
      return { game: g, resumeTo: null };
    });
  }, [kind, days, hour, variant, exact, kinds]);
  const NOON = 12, NIGHT = 23;
  for (const kind of kinds) {
    const variant = kind === 'grid_down' ? 'substation' : undefined;
    if (quick) {
      await setDay(kind, quickDay, NOON, variant);
      for (const mode of ['aerial', 'eye']) { await view(mode); await shot(`${kind}-day${quickDay}-noon-${mode}`, 10); }
      await setDay(kind, quickDay, NIGHT, variant);
      for (const mode of ['eye', 'aerial']) { await view(mode); await shot(`${kind}-day${quickDay}-night-${mode}`, 10); }
      continue;
    }
    await setDay(kind, -12, NOON, variant);
    for (const mode of ['aerial', 'eye']) { await view(mode); await shot(`${kind}-1-warning-${mode}`, 8); }
    // the card: the clock running through the hit
    await view('aerial');
    await setDay(kind, -0.02, NOON, variant, true);
    await page.evaluate(() => window.__cb.game.getState().setSpeed(3));
    // (a stranger at the gate stops the clock too: wave him off and run on until the card is up)
    for (let n = 0; n < 40; n++) {
      if (await page.evaluate(() => window.__cb.game.getState().dayCard !== null)) break;
      await page.evaluate(() => { const G = window.__cb.game; G.setState(s => { const g = structuredClone(s.game); g.gate.pending = null; g.gate.incoming = null; g.clock.speed = 3; return { game: g, cutscene: null, resumeTo: null }; }); });
      await page.waitForTimeout(1500);
    }
    await shot(`${kind}-2-card`, 4);
    await page.getByRole('button', { name: 'Face it' }).click();
    await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
    await setDay(kind, 0.1, NOON, variant);
    for (const mode of ['aerial', 'eye']) { await view(mode); await shot(`${kind}-3-impact-${mode}`, 10); }
    await setDay(kind, 3, NOON, variant);
    for (const mode of ['aerial', 'eye']) { await view(mode); await shot(`${kind}-4-day3-${mode}`, 12); }
    if (kind !== 'wildfire') {
      await setDay(kind, -12, NIGHT, variant); await view('aerial'); await shot(`${kind}-5-night-before`, 8);
      await setDay(kind, 3, NIGHT, variant); await shot(`${kind}-6-night-day3`, 12);
    }
  }
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
