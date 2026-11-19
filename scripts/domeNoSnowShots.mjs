/**
 * The ground under a climate-held dome keeps its normal season (docs/ux/dome-no-snow). One dome (and optionally a second, unprotected one) in an ice age or
 * a heat year; the views are the owner's aerial (from above and the southwest), an eye-level shot inside the dome with a person, and a top-down.
 * One scene per run (software GL is slow); run under the render lock:
 *   flock /tmp/cb.lock node scripts/domeNoSnowShots.mjs --climate cold --region north_woods --years 3 --views sw,inside --state ok
 *   --state ok | dark (plant dark, 90 panels down, the protection eased for --days 2 | 12) ; --two adds an unprotected second dome ; --dome glass|arcology|geodesic
 *   flock /tmp/cb.lock node scripts/domeNoSnowShots.mjs --climate heat --region plains --years 4 --views sw,inside
 * Options: --quality high|medium, --doy (default 20 cold, 200 heat), --port 5973, --out docs/ux/dome-no-snow, --tag name.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const kind = 'dome';
const stateOpt = opt('--state', 'ok'), two = args.includes('--two'), days = Number(opt('--days', 2));
const region = opt('--region', 'north_woods');
const years = opt('--years', '0,2,4').split(',').map(Number);
const views = opt('--views', 'sw,inside').split(',');
const HOURS = { dawn: 6.4, noon: 13, dusk: 18.6, night: 23 };
const hours = opt('--hours', '13').split(',').map(h => HOURS[h] ?? Number(h));
const quality = opt('--quality', 'medium');
const port = Number(opt('--port', 5973));
const climate = opt('--climate', 'cold');                 // (dome scene) heat | cold
const domeTier = opt('--dome', 'glass');
const doy = Number(opt('--doy', kind === 'ice' || climate === 'cold' ? 20 : 200));
const outDir = resolve(opt('--out', 'docs/ux/dome-no-snow'));
const tag = opt('--tag', `${domeTier}-${climate}-${stateOpt}${two ? '-two' : ''}`);
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('crash', () => console.error('PAGE CRASHED'));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender&region=${region}&acres=40&lotseed=8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => { window.__cb.qa.weather = true; });
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  let warmed = false;
  const shot = async (name) => {
    await frames(warmed ? 2 : 10); warmed = true;
    await page.evaluate(q => window.__cb.qa.renderFull(q), quality);
    lap('shell ' + JSON.stringify(await page.evaluate(async () => { const m = await import('/src/game/fx/DomeShell.ts'); const { kitMaterial } = await import('/src/game/buildkit/materials.ts'); return { ...m.shellClimateNow(), op: kitMaterial('dome_glass').opacity, ro: kitMaterial('dome_glass').roughness }; })));
    const f = `${outDir}/${tag}-${name}.png`; await page.screenshot({ path: f }); lap(f);
  };
  // staging: a finished cabin, a person, and (for the dome scene) a dome with a house under it
  const stage = await page.evaluate(async ([kind, domeTier]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 500_000_000 } }));
    cb.store.getState().setWeatherMode('clear');
    const put = (k, x, z, rot = 0, r = 8) => { const sp = cb.tool.findSpot(k, x, z, rot, r); if (!sp) return null; G.getState().plan(k, sp[0], sp[1], rot); return { x: sp[0], z: sp[1] }; };
    let spot, R = 0.5;
    if (kind === 'dome') {
      R = { geodesic: 1.25, glass: 3.75, arcology: 9 }[domeTier];
      spot = put('dome_' + domeTier, c.x - 1, c.z - 1, 0, domeTier === 'geodesic' ? 12 : 30);
      if (spot) put('timber_cabin', spot.x - R * 0.25, spot.z - R * 0.15, 0, 0.5);
      if (spot && two) { const s2 = put('dome_' + domeTier, spot.x + R * 2.6, spot.z - R * 0.4, 0, 6); if (s2) put('timber_cabin', s2.x - R * 0.25, s2.z - R * 0.15, 0, 0.5); }
    } else {
      spot = put('timber_cabin', c.x, c.z, 0, 8);
      put('barn', c.x + 14, c.z - 8, 0, 6);
    }
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    return { spot, R };
  }, [kind, domeTier]);
  lap('staged ' + JSON.stringify(stage));
  if (!stage.spot) throw new Error('no spot');
  const sp = [stage.spot.x, stage.spot.z], R = stage.R;
  // the world at `yrs` game years after the hit, at the day of the year and the hour; the disaster's tracks follow
  const setYear = (yrs, hour, st = 'ok', extra = 0) => page.evaluate(async ([k, yrs, hour, doy, st, extra, two]) => {
    const { triggerDisaster, tracksAt } = await import('/src/sim/disaster.ts');
    const { newDomeState, domesOf, ownState } = await import('/src/sim/dome/live.ts');
    const G = window.__cb.game, dk = k === 'ice' ? 'ice_age' : 'runaway_heat';
    G.setState(s => {
      const g = structuredClone(s.game);
      if (g.disaster.kind !== dk) { g.disaster.mode = 'sandbox'; g.disaster.phase = 'peace'; triggerDisaster(g.disaster, 0, dk, g.seed, 14, dk === 'ice_age' ? 'dimmed_sun' : 'dry_furnace'); g.disaster.hitAt = 20; g.disaster.warnAt = 6; g.disaster.fate = 'full'; }
      const t = g.disaster.hitAt + Math.floor(yrs * 365) + 0.25 + (hour - 12) / 24 + extra;
      g.clock.t = t; g.clock.startDoy = doy - Math.floor(t) % 365; g.clock.startDoy = ((g.clock.startDoy % 365) + 365) % 365 || 365;
      g.clock.speed = 0; g.gate.pending = null; g.gate.incoming = null;
      g.disaster.phase = 'survival'; g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
      // (the dome scene: the dome's last reading, since the clock is paused: cold and unheated, or scorching outside)
      const [o, i] = k === 'ice' ? [-20, -15] : [118, 100];
      for (const dr of domesOf(g)) ownState(g, dr);   // (files a state for each dome so there is one to set)
      const list = domesOf(g);
      list.forEach((dr, idx) => {
        const d = ownState(g, dr), dark = (st === 'dark' && idx === 0) || (two && idx > 0);
        d.outF = o; d.powered = !dark; d.indoorF = dark ? o + 4 : i;
        g.raidDamage = (g.raidDamage ?? []).filter(j => !(j.kind === 'panel' && j.structure === dr.st.id));
        if (st === 'dark' && idx === 0) g.raidDamage.push({ id: 'qa' + idx, kind: 'panel', x: dr.st.x, z: dr.st.z + 1, structure: dr.st.id, day: 0, hours: 99, done: 0, supplied: true, bill: {}, panels: 90 });
      });
      return { game: g, resumeTo: null };
    });
  }, [kind === 'dome' ? (climate === 'cold' ? 'ice' : 'heat') : kind, yrs, hour, doy, st, extra, two]);
  const view = (mode) => page.evaluate(([mode, sp, R]) => {
    const cb = window.__cb, gr = cb.world.groundAt;
    if (mode === 'sw') { const c = [sp[0], sp[1]]; cb.qa.pose = { x: c[0] - R * 1.5, y: gr(c[0], c[1]) + R * 1.15 + 1.2, z: c[1] + R * 1.6, lx: c[0], ly: gr(c[0], c[1]) + R * 0.25, lz: c[1], fov: 58 }; }
    else if (mode === 'inside') { const x = sp[0] - R * 0.15, z = sp[1] + R * 0.45; cb.qa.pose = { x, y: gr(x, z) + 0.34, z, lx: sp[0] - R * 0.2, ly: gr(x, z) + 0.45, lz: sp[1] - R * 0.9, fov: 70 }; }
    else if (mode === 'top') { cb.qa.pose = { x: sp[0] + 0.01, y: gr(sp[0], sp[1]) + R * 3.4, z: sp[1] + 0.8, lx: sp[0], ly: gr(sp[0], sp[1]), lz: sp[1], fov: 55 }; }
    else if (mode === 'eye') { const x = sp[0] + 2 + R, z = sp[1] + 7 + R; cb.qa.pose = { x, y: gr(x, z) + 0.34, z, lx: sp[0] - 1, ly: gr(sp[0], sp[1]) + 0.9, lz: sp[1] - 8, fov: 66 }; }
    else if (mode === 'sky') { const x = sp[0] + 2, z = sp[1] + 7; cb.qa.pose = { x, y: gr(x, z) + 0.5, z, lx: sp[0] + 14, ly: gr(x, z) + 3.3, lz: sp[1] - 10, fov: 80 }; }
    else if (mode === 'dome') { cb.qa.pose = { x: sp[0] + R * 1.15, y: gr(sp[0], sp[1]) + R * 0.9 + 0.8, z: sp[1] + R * 1.5, lx: sp[0], ly: gr(sp[0], sp[1]) + R * 0.3, lz: sp[1], fov: 58 }; }
    else { cb.qa.pose = null; cb.cam.target.set(sp[0], gr(sp[0], sp[1]), sp[1]); cb.cam.radius = 30; cb.cam.pitch = 0.6; cb.cam.yaw = 0.7; }
  }, [mode, sp, R]);
  // a person in the frame for scale: by the porch (outside the dome for the dome scene)
  await page.evaluate(([sp, R]) => { const w = window.__cb.world, [fx, fz] = w.openSpotNear(sp[0] - R * 0.2, sp[1] - R * 0.35, 0.3); w.qaFigure(fx, fz); }, [sp, R]);
  for (const hour of hours) for (const y of years) {
    await setYear(y, hour, 'ok', 0);
    // the protection is eased in game days: land on the protected value first (snap), then for a dark plant let `days` game days run with the plant dark and the shell breached
    await frames(14); await page.evaluate(() => window.__cb.domeInterior.snap()); await frames(14);
    if (stateOpt === 'dark') { await setYear(y, hour, 'dark', days); await frames(14); }
    for (const mode of views) {
      await view(mode);
      const hn = Object.entries(HOURS).find(([, v]) => v === hour)?.[0] ?? `h${hour}`;
      await shot(`y${y}-${hn}-${mode}`);
    }
    const info = await page.evaluate(async () => {
      const { collapseLook } = await import('/src/sim/collapseLook.ts'); const l = collapseLook(window.__cb.game.getState().game);
      const { getSeasonUniformValues } = await import('/src/engine/world/season/seasonShader.ts'); const s = getSeasonUniformValues();
      const { shellClimateNow } = await import('/src/game/fx/DomeShell.ts'); const { domeOf, stateOf } = await import('/src/sim/dome/live.ts'); const gg = window.__cb.game.getState().game, dd = domeOf(gg), ss = dd ? stateOf(gg, dd) : null;
      return { shell: shellClimateNow(), dome: ss && { outF: ss.outF, indoorF: ss.indoorF }, scorch: l.scorch, snowCover: l.snowCover, freeze: l.freeze, sunScale: l.sunScale, sunLower: l.sunLower, seaB: s.b, seaC: s.c };
    });
    lap('look ' + JSON.stringify(info));
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill(); process.exit(0);
