/**
 * Building audit contact sheets: each kit piece at four angles finished, plus a mid-construction view, on the flat lot or the hillside
 * lot (graded pad / retaining wall). One 2x3 sheet per kind (stitched with PIL if python3 has it, else the loose PNGs stay).
 *   flock /tmp/cb.lock node scripts/buildingSheet.mjs --out /tmp/claude-0/audit/buildings/before --kinds barn,cottage [--lot flat|hill] [--port 5330]
 * Always ?lowrender. Pieces are placed through the same tool the player uses (`tool.findSpot`).
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5330)), outDir = resolve(opt('--out', 'shots/buildings'));
const views = opt('--views', 'a0,a2,top,build').split(','), kinds = opt('--kinds', 'barn').split(','), lot = opt('--lot', 'flat'), tod = Number(opt('--tod', 14));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 420 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const HILL = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
try {
  await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7${lot === 'hill' ? '&' + HILL : ''}`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(([t]) => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(t); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); }, [tod]);
  await page.waitForTimeout(1500);
  const frame = async () => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  for (const kind of kinds) {
    const place = (stage, done) => page.evaluate(async ([kind, stage, done]) => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp;
      const g = structuredClone(G.getState().game); g.structures = [];
      g.clock.t = 2 * 365 + 150.45; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      G.setState({ game: g });
      const K = await import('/src/game/buildkit/kit.ts'); const def = K.KIT[kind];
      if (!def) return { ok: false };
      let best = null;
      for (const r of [0, 1, 2, 3]) { const sp = cb.tool.findSpot(kind, c.x, c.z, r, 40); if (sp) { const d = Math.hypot(sp[0] - c.x, sp[1] - c.z); if (!best || d < best.d) best = { sp, r, d }; } }
      if (!best) return { ok: false };
      const cur = structuredClone(G.getState().game);
      cur.structures.push({ id: 'q1', kind, x: best.sp[0], z: best.sp[1], rot: best.r, stage, done, supplied: true, finishedAt: 0 });
      G.setState({ game: cur });
      return { ok: true, r: Math.max(def.cellsX, def.cellsZ) * 0.5 };
    }, [kind, stage, done]);
    let info = await place(99, 0);
    if (!info.ok) { console.error('NOSPOT', kind); continue; }
    const names = [];
    const aim = async (yaw, pitch, rad, h) => { await page.evaluate(([yaw, pitch, rad, h]) => { const { cam, world, game } = window.__cb, st = game.getState().game.structures[0]; cam.target.set(st.x, world.groundAt(st.x, st.z) + h, st.z); cam.radius = rad; cam.yaw = yaw; cam.pitch = pitch; }, [yaw, pitch, rad, h]); await frame(); };
    for (let i = 0; i < 3; i++) await frame();
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    const R = 1.3 + info.r * 1.15;
    for (let i = 0; i < 4; i++) if (views.includes('a' + i)) { await aim(0.5 + i * Math.PI / 2, 0.55, R, 0.25); const f = `${outDir}/${kind}-${lot}-a${i}.png`; await page.screenshot({ path: f }); names.push(f); }
    if (views.includes('top')) { await page.evaluate(() => window.__cb.store.getState().setBuildingView('cutaway')); await aim(0.5, 1.2, R * 1.05, 0.15); const f = `${outDir}/${kind}-${lot}-top.png`; await page.screenshot({ path: f }); names.push(f); }
    if (views.includes('build')) {
      await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
      info = await place(2, 0.6); for (let i = 0; i < 3; i++) await frame();
      await aim(0.5, 0.5, R, 0.25); const f = `${outDir}/${kind}-${lot}-build.png`; await page.screenshot({ path: f }); names.push(f);
    }
    try { execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f) for f in fs]; w,h=ims[0].size
cols=2 if len(ims)<=4 else 3
rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(w*cols,h*rows))
for i,im in enumerate(ims): S.paste(im,((i%cols)*w,(i//cols)*h))
S.save(sys.argv[1])`, `${outDir}/sheet-${kind}-${lot}.png`, ...names]); for (const n of names) execFileSync('rm', [n]); } catch (e) { console.error('stitch failed', e.message.slice(0, 120)); }
    console.error('done', kind);
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
