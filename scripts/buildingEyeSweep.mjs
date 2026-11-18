/**
 * Building visual sweep: one eye-level shot per kit kind with a person for scale (SCALE v2), stitched into contact sheets.
 *   flock /tmp/cb.lock node scripts/buildingEyeSweep.mjs --out docs/ux/recheck/buildings [--port 5340] [--only a,b] [--per 6]
 * Always ?lowrender. Each piece is placed finished by the same tool the player uses (`tool.findSpot`).
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5340)), outDir = resolve(opt('--out', 'shots/buildings-eye')), per = Number(opt('--per', 6));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 420 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
const frame = async (n = 1) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(200); } };
try {
  await page.goto(`http://localhost:${port}/?lowrender&clean&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.renderNow, null, { timeout: 300000 });
  await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(14); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('summer'); });
  await page.waitForTimeout(1500);
  let kinds = opt('--only', null)?.split(',');
  if (!kinds) kinds = await page.evaluate(async () => { const K = await import('/src/game/buildkit/kit.ts'); return Object.keys(K.KIT); });
  const from = Number(opt('--from', 0)), to = Number(opt('--to', 9999)); const allKinds = kinds; kinds = kinds.slice(from, to);
  console.error('kinds', allKinds.length, 'from', from, 'to', to);
  const done = [];
  for (const kind of kinds) {
    const info = await page.evaluate(async ([kind]) => {
      const cb = window.__cb, G = cb.game, w = cb.world, c = w.camp;
      const g = structuredClone(G.getState().game); g.structures = [];
      g.clock.t = 2 * 365 + 150.45; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      G.setState({ game: g });
      const K = await import('/src/game/buildkit/kit.ts'); const def = K.KIT[kind];
      let best = null;
      for (const r of [0, 1, 2, 3]) for (const rad of [30, 60]) { const sp = cb.tool.findSpot(kind, c.x, c.z, r, rad); if (sp) { best = { sp, r }; break; } if (best) break; }
      if (!best) return { ok: false };
      const cur = structuredClone(G.getState().game);
      cur.structures.push({ id: 'q1', kind, x: best.sp[0], z: best.sp[1], rot: best.r, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      G.setState({ game: cur });
      return { ok: true, big: Math.max(def.cellsX, def.cellsZ) };
    }, [kind]);
    if (!info.ok) { console.error('NOSPOT', kind); continue; }
    await frame(3);
    await page.evaluate(() => window.__cb.store.getState().setBuildingView('full'));
    await page.evaluate(([big]) => {
      const cb = window.__cb, w = cb.world, st = cb.game.getState().game.structures[0];
      const half = big * 1.0 + 0.8;
      // placed directly (openSpotNear pushes everything away from the camp, where the pieces stand)
      const fx = st.x - 0.3, fz = st.z + half, px = st.x + 0.6, pz = st.z + half + 1.4 + big * 0.4;
      w.qaFigure(fx, fz);
      cb.cam.placeEye(px, pz, st.x, st.z, 0.26);
    }, [info.big]);
    await frame(2);
    const f = `${outDir}/${String(from + done.length).padStart(3, '0')}-${kind}.png`;
    await page.screenshot({ path: f }); done.push([kind, f]);
    console.error('shot', kind);
  }
  for (let i = 0; i * per < done.length; i++) {
    const grp = done.slice(i * per, (i + 1) * per);
    try {
      execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[2:]; ims=[Image.open(f) for f in fs]; w,h=ims[0].size
cols=3; rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(w*cols,h*rows)); d=ImageDraw.Draw(S)
for i,im in enumerate(ims):
  S.paste(im,((i%cols)*w,(i//cols)*h)); d.rectangle([(i%cols)*w,(i//cols)*h,(i%cols)*w+250,(i//cols)*h+16],fill=(0,0,0)); d.text(((i%cols)*w+4,(i//cols)*h+2),fs[i].split('/')[-1],fill=(255,255,0))
S.save(sys.argv[1])`, `${outDir}/sheet-${String(from + i * per).padStart(3, '0')}.png`, ...grp.map(g => g[1])]);
    } catch (e) { console.error('stitch failed', e.message.slice(0, 160)); }
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
