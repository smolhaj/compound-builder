/**
 * Weather / disaster look QA: a built place (cabin, barn, palisade, a person) in each weather and disaster state, eye level + aerial.
 *   flock /tmp/cb.lock node scripts/weatherShots.mjs --scenes rain,snow --out /tmp/claude-0/gfx/weather/after [--q medium] [--region plains]
 * scenes: clear rain storm snow fire wildfire nuclear raid dust fog
 * Always ?lowrender (frames drawn on request with renderFull).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5391)), outDir = resolve(opt('--out', '/tmp/claude-0/gfx/weather/after')), qual = opt('--q', 'medium');
const scenes = opt('--scenes', 'rain').split(',');
const regionDef = opt('--region', 'plains');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
// scene: [weather mode, doy, hour, region, extra setup name]
const SC = {
  clear: ['clear', 226, 14, null], rain: ['rain', 292, 14, null], storm: ['storm', 160, 17, null], snow: ['snow', 20, 14, null],
  fire: ['clear', 226, 21, null], wildfire: ['clear', 226, 17, null], nuclear: ['clear', 226, 15, null], raid: ['clear', 226, 8, null],
  dust: ['clear', 200, 15, 'desert_southwest'], fog: ['fog', 288, 7, null],
};
try {
  for (const name of scenes) {
    const [mode, doy, hour, reg] = SC[name];
    const region = reg ?? regionDef;
    await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7&region=${region}`);
    await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
    await page.evaluate(async ([q, name]) => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp;
      G.getState().setSpeed(0); cb.store.getState().setQuality(q);
      const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
      G.getState().plan('timber_cabin', sp[0], sp[1], 0);
      const sp2 = cb.tool.findSpot('sheep_barn', sp[0] + 7, sp[1] + 1, 0);
      G.getState().plan('sheep_barn', sp2[0], sp2[1], 0);
      const h = 11;
      G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h + 6, sp[1] - h], [sp[0] + h + 6, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
      G.setState(s => {
        const g = structuredClone(s.game);
        for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
        for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
        return { game: g };
      });
      window.__home = { cabin: sp, barn: sp2 };
    }, [qual, name]);
    await page.waitForTimeout(1500);
    await page.evaluate(async ([name, mode, doy, hour]) => {
      const cb = window.__cb, G = cb.game, s = cb.store.getState();
      cb.qa.weather = true;
      s.setWeatherMode(mode); s.setSeasonMode(doy > 330 || doy < 80 ? 'winter' : doy < 170 ? 'summer' : doy < 270 ? 'summer' : 'fall'); s.setDayOfYear(doy); s.setTimeOfDay(hour);
      const stepW = (m, season) => { for (let i = 0; i < 16; i++) cb.weather.sim.update(5, season, hour, m); cb.valley?.snap?.(); };
      stepW(mode, doy < 80 ? 'winter' : doy < 270 ? 'summer' : 'fall');
      const { startFires } = await import('/src/sim/raidFire.ts');
      const { addBurnScar } = await import('/src/sim/raidDamage.ts');
      if (name === 'fire') {
        G.setState(st => { const g = structuredClone(st.game); startFires(g, g.structures.filter(x => /barn|cabin/.test(x.kind)).map(x => ({ structure: x.id, x: x.x, z: x.z }))); for (const f of g.raidFires ?? []) f.intensity = f.structure === g.structures[0].id ? 0.45 : 0.75; return { game: g }; });
      }
      if (name === 'raid') {
        G.setState(st => { const g = structuredClone(st.game); const b = g.structures[g.structures.length - 1]; addBurnScar(g, b.x + 3, b.z - 4, 'shed'); g.raidDamage[g.raidDamage.length - 1].day = Math.floor(g.clock.t); return { game: g }; });
      }
      if (name === 'wildfire') {
        G.setState(st => { const g = structuredClone(st.game); g.disaster.kind = 'wildfire'; g.disaster.phase = 'survival'; g.disaster.hitAt = g.clock.t - 1; return { game: g }; });
      }
      if (name === 'nuclear') {
        G.setState(st => { const g = structuredClone(st.game); g.disaster.kind = 'nuclear'; g.disaster.variant = 'distant'; g.disaster.phase = 'survival'; g.disaster.hitAt = g.clock.t - 0.15; return { game: g }; });
      }
    }, [name, mode, doy, hour]);
    await page.waitForTimeout(800);
    const shot = async n => { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(200); const f = `${outDir}/${name}-${n}.png`; await page.screenshot({ path: f }); console.log(f); };
    const tick = async n => { await page.waitForTimeout(n * 100); };
    await page.evaluate(() => { const { world, cam } = window.__cb, h = window.__home.cabin; cam.target.set(h[0] + 3, world.groundAt(h[0], h[1]), h[1]); cam.radius = 26; cam.pitch = 0.7; cam.yaw = 0.5; });
    await tick(30);
    await shot('aerial');
    await page.evaluate(() => { const { world, cam } = window.__cb, h = window.__home.cabin; const p = world.family.positions()[0] ?? { x: h[0], z: h[1] + 5 }; const [ex, ez] = world.openSpotNear(h[0] - 4, h[1] + 7, 0.8); cam.placeEye(ex, ez, h[0] + 3, h[1], 0.3); });
    await tick(5);
    await shot('eye');
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
