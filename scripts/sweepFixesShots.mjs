// Sweep-fixes pass 3 shots: the ash-winter sky, a wildfire on a forest lot, aerial + eye level with a person.
//   node scripts/sweepFixesShots.mjs --out shots/sweepfix3 --region pnw [--lot gorge] [--port 5741] [--only ash40,fire3]
// (template: encounterLeadShots.mjs) One headless browser, ?lowrender, frames lifted with renderFull('medium').
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5741)), out = resolve(opt('--out', 'shots/sweepfix3')), region = opt('--region', 'pnw'), lot = opt('--lot', '');
const only = opt('--only', '').split(',').filter(Boolean), tag = opt('--tag', lot ? `${region}-${lot}` : region);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.setDefaultTimeout(400000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const q = `lowrender&clean&seed=7&region=${region}` + (lot ? `&lot=${lot}&relief=${opt('--relief', '9')}&acres=40&lotseed=3&elev=${opt('--elev', '600')}` : '');
try {
  await page.goto(`http://localhost:${port}/?${q}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 400000 });
  await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('medium'); });
  const shot = async n => { await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.waitForTimeout(150); const f = `${out}/${tag}-${n}.png`; await page.screenshot({ path: f }); console.log(f); };
  const look = async (tod, doy) => page.evaluate(([tod, doy]) => { const s = window.__cb.store.getState(); s.setWeatherMode('auto'); s.setSeasonMode('summer'); s.setDayOfYear(doy); s.setTimeOfDay(tod); }, [tod, doy]);
  const world = (kind, days) => page.evaluate(async ([kind, days]) => {
    const st = await import('/src/sim/state.ts'), dz = await import('/src/sim/disaster.ts');
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const tmp = st.newGame(g.seed, 160, 2027, { mode: 'scenario', peace: 'short', kind });
    g.disaster = tmp.disaster; const d = g.disaster;
    g.clock.t = d.hitAt + days; d.phase = 'survival';
    d.tracks = dz.tracksAt(d, g.clock.t);
    g.gate.next = 1e9; g.gate.pending = null; g.gate.incoming = null; g.gate.card = null;
    G.setState({ game: g });
  }, [kind, days]);
  const cams = async name => {
    await page.waitForTimeout(600);
    await page.evaluate(() => { const { world, cam } = window.__cb; const x = 0, z = 0; cam.target.set(x, world.groundAt(x, z), z); cam.radius = 60; cam.pitch = 0.6; cam.yaw = 2.4; });
    await shot(name + '-aerial');
    await page.evaluate(() => { const { world, cam } = window.__cb; const x = 0, z = 0; world.qaFigure?.(x + 0.9, z + 0.9); cam.target.set(x, world.groundAt(x, z) + 0.3, z); cam.radius = 2.2; cam.pitch = 0.08; cam.yaw = 2.4; });
    await shot(name + '-eye');
  };
  const want = n => !only.length || only.includes(n);
  if (want('ash3')) { await world('ash_winter', 3); await look(13, 200); await cams('ash3'); }
  if (want('ash40')) { await world('ash_winter', 40); await look(13, 200); await cams('ash40'); }
  if (want('fire3')) { await world('wildfire', 3); await look(15, 230); await cams('fire3'); }
  if (want('fire0')) { await world('wildfire', 0.2); await look(15, 230); await cams('fire0'); }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
