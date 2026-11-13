/**
 * Oasis contrast QA: a held stone-wall compound with a gate lantern, paired shots from just outside the wall looking in and from inside
 * looking out, at dusk and night, at disaster stage 0 / mid / late.
 *   flock /tmp/cb.lock node scripts/oasisShots.mjs --region plains --out /tmp/claude-0/oasis/grade [--stages 0,mid,late] [--hours 19.6,22.5] [--views out,in] [--breach]
 * Writes <region>-<stage>-<hour>-<view>.png. Always ?lowrender (frames drawn on request with renderFull).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5392)), outDir = resolve(opt('--out', '/tmp/claude-0/oasis/grade')), qual = opt('--q', 'medium');
const region = opt('--region', 'plains'), stages = opt('--stages', '0,mid,late').split(','), hours = opt('--hours', '19.6,22.5').split(',').map(Number);
const views = opt('--views', 'out,in').split(','), breach = args.includes('--breach'), doy = Number(opt('--doy', 226));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const DAYS = { 0: null, mid: 25, late: 150 };
try {
  await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7&region=${region}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(async ([q]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0); cb.store.getState().setQuality(q); cb.world.atmos.lanterns.forceGlow = true;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 12, cx = sp[0] + 2, cz = sp[1];
    G.getState().planRun('stone_wall', [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h], [cx - h, cz - h]], [{ at: 4 * h + h, w: 2.6 }], 0);
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      return { game: g };
    });
    window.__home = { cabin: sp, cx, cz, h };
  }, [qual]);
  await page.waitForTimeout(1500);
  for (const stage of stages) {
    for (const hour of hours) {
      await page.evaluate(async ([stage, hour, doy, days, breach]) => {
        const cb = window.__cb, G = cb.game, s = cb.store.getState();
        cb.qa.weather = true;
        s.setWeatherMode('clear'); s.setSeasonMode('summer'); s.setDayOfYear(doy); s.setTimeOfDay(hour);
        const { triggerDisaster } = await import('/src/sim/disaster.ts');
        G.setState(st => {
          const g = structuredClone(st.game);
          if (days == null) { g.disaster.kind = null; }
          else { triggerDisaster(g.disaster, g.clock.t - days, 'lawless', 7, 0); }
          g.raidDamage = [];
          if (breach) { const r = g.perimeter[0]; g.raidDamage = [{ id: 'dmg1', kind: 'breach', x: r.pts[0][0] + 12, z: r.pts[0][1], runId: r.id, day: Math.floor(g.clock.t), hours: 10, done: 0, supplied: false, bill: {} }]; }
          return { game: g };
        });
        cb.oasis.qa = { snap: true };
      }, [stage, hour, doy, DAYS[stage] ?? null, breach && stage !== '0']);
      await page.waitForTimeout(900);
      const info = await page.evaluate(async () => {
        const { homeSafety, homeSafetyInput } = await import('/src/game/atmosphere/homeSafety.ts');
        const g = window.__cb.game.getState().game, i = homeSafetyInput(g);
        return { collapse: +i.collapse.toFixed(2), perimeter: +i.perimeter.toFixed(2), breaches: i.breaches, safety: +homeSafety(i).level.toFixed(2), lanterns: window.__cb.world.atmos.lanterns.count };
      });
      console.log(region, 'stage', stage, 'hour', hour, JSON.stringify(info));
      for (const view of views) {
        await page.evaluate(([view]) => {
          const { world, qa, ws } = window.__cb, { cx, cz, h } = window.__home;
          const gy = (x, z) => world.groundAt(x, z);
          if (view === 'out') { // just outside the south wall (the gate side), looking in
            const x = cx + 4.5, z = cz + h + 5.5; qa.pose = { x, y: gy(x, z) + 0.3, z, lx: cx, ly: gy(cx, cz) + 0.35, lz: cz - 3, fov: 62 };
          } else if (view === 'far') { // a wide look from the road, 30 units out
            const x = cx - 2, z = cz + h + 30; qa.pose = { x, y: gy(x, z) + 0.45, z, lx: cx, ly: gy(cx, cz) + 0.5, lz: cz, fov: 55 };
          } else { // inside, a few units from the gate, looking out over the wall
            const x = cx + 3, z = cz + h - 6; qa.pose = { x, y: gy(x, z) + 0.3, z, lx: cx + 1, ly: gy(cx, cz) + 0.5, lz: cz + h + 30, fov: 62 };
          }
        }, [view]);
        await page.waitForTimeout(700);
        await page.evaluate(() => window.__cb.qa.renderFull('medium'));
        await page.waitForTimeout(250);
        const f = `${outDir}/${region}-${stage}-${String(hour).replace('.', '_')}${breach ? '-breach' : ''}-${view}.png`;
        await page.screenshot({ path: f }); console.log(f);
      }
    }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
