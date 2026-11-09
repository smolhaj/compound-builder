/**
 * Shade overlay, radiation view and photo capture on the mountain showcase (aerial, top, eye level with a person, the HUD readouts, the album).
 *   flock $SP/render.lock node scripts/viewsShots.mjs --out shots/views [--port 5442] [--serve] [--q medium] [--only photo]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5442)), outDir = resolve(opt('--out', 'shots/views')), q = opt('--q', 'medium'), only = opt('--only', 'photo').split(',');
mkdirSync(outDir, { recursive: true });
let vite = null;
if (args.includes('--serve')) {
  vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
}
const LOT = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(900000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/?lowrender=0.75${only.includes("photo") ? "" : "&clean"}&seed=7&${LOT}&showcase=mountain&rings=1&wall=stone&layout=shelf`);
await page.waitForFunction(() => window.__cb?.qa?.renderNow && window.__showcase, null, { timeout: 900000 });
await page.evaluate(() => { const { game, store } = window.__cb; game.getState().setSpeed(0); store.getState().setQuality('low'); store.getState().setTimeOfDay(12); store.getState().setWeatherMode('clear'); store.getState().setSeasonMode('winter'); store.getState().setViewOpen(true); });
for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(120); }
const frames = async () => { await page.evaluate(q => window.__cb.qa.renderFull(q), q); await page.waitForTimeout(300); };
const shot = async name => { await frames(); await frames(); await page.screenshot({ path: `${outDir}/${name}.png` }); console.error('shot', name); };
const info = await page.evaluate(() => { const cb = window.__cb, w = cb.world, f = w.parcel.lot.fall; return { camp: [w.camp.x, w.camp.z], up: Math.atan2(Math.cos(f), Math.sin(f)) }; });
const orbit = (r, pitch, yaw, dx = 0, dz = 0) => page.evaluate(([r, pitch, yaw, c]) => { const { world, cam } = window.__cb; cam.target.set(c[0], world.groundAt(c[0], c[1]) + 0.8, c[1]); cam.radius = r; cam.pitch = pitch; cam.yaw = yaw; }, [r, pitch, yaw, [info.camp[0] + dx, info.camp[1] + dz]]);
// a person at eye level: camera just behind and above a walker, looking where they look
const eye = async () => {
  const e = await page.evaluate(() => { const cb = window.__cb, w = cb.world, ag = [...w.family._agents.values()].find(a => a.x !== undefined); if (!ag) return null; return { x: ag.x, z: ag.z, rot: ag.rot ?? 0 }; });
  if (!e) return false;
  await page.evaluate(([e]) => { const { world, cam } = window.__cb; cam.target.set(e.x, world.groundAt(e.x, e.z) + 0.25, e.z); cam.radius = 1.6; cam.pitch = 0.12; cam.yaw = e.rot + Math.PI; }, [e]);
  return true;
};

if (only.includes('shade')) {
  await page.evaluate(() => window.__cb.store.getState().setTerrainMode('shade'));
  await page.waitForTimeout(1500);
  const ro = await page.evaluate(() => window.__cb.store.getState().shadeReadout);
  console.error('shade readout', JSON.stringify(ro));
  const ms = await page.evaluate(async () => { const { shadeSceneOf } = await import('/src/game/terrain/shadeScene.ts'); const { shadeGrid } = await import('/src/sim/shade.ts'); const { terrainOf } = await import('/src/sim/terrainState.ts'); const cb = window.__cb, g = cb.game.getState().game, t = terrainOf(g); const t0 = performance.now(); const { sc } = shadeSceneOf(g, cb.world.groundAt, cb.world.treeSpecs); const grid = shadeGrid(sc, t.grid); return { ms: +(performance.now() - t0).toFixed(1), cells: grid.shade.length, boxes: sc.boxes.length }; });
  console.error('shade cost', JSON.stringify(ms));
  await orbit(46, 0.9, info.up + 0.3); await shot('shade-1-aerial');
  await orbit(24, 1.2, info.up); await shot('shade-2-top');
  if (await eye()) { await page.evaluate(() => window.__cb.store.getState().setTerrainMode('off')); await shot('shade-3-eye-off'); await page.evaluate(() => window.__cb.store.getState().setTerrainMode('shade')); await shot('shade-3-eye'); }
  await page.evaluate(() => window.__cb.store.getState().setTerrainMode('off'));
}
if (only.includes('radiation')) {
  await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, g = structuredClone(G.getState().game);
    g.disaster.kind = 'nuclear'; g.disaster.variant = 'distant'; g.disaster.warnAt = 0; g.disaster.hitAt = g.clock.t + 3;
    const add = (kind, id, x, z) => g.structures.push({ id, kind, x, z, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const c = cb.world.camp;
    add('root_cellar', 'rc1', c.x + 3, c.z + 6);
    G.setState({ game: g });
    cb.store.getState().setBlueprint(true);
  });
  await page.waitForTimeout(1500);
  console.error('radiation readout', await page.evaluate(() => document.querySelector('[data-testid=radiation-readout]')?.textContent ?? 'none'));
  await orbit(34, 0.7, info.up + 0.3); await shot('rad-1-aerial');
  await orbit(18, 1.0, info.up + 0.3); await shot('rad-2-close');
  await page.evaluate(() => window.__cb.store.getState().setBlueprint(false));
}
if (only.includes('photo')) {
  await page.evaluate(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(17.5); s.setSeasonMode('fall'); });
  await orbit(30, 0.5, info.up + 0.6);
  await frames();
  const r = await page.evaluate(async () => {
    const { capturePhoto } = await import('/src/game/photoCapture.ts'); const { useGameStore } = await import('/src/store/gameStore.ts'); const vault = await import('/src/sim/save/photoVault.ts');
    const out = [];
    for (const cap of ['First golden evening on the shelf', '']) { const d = capturePhoto(); out.push({ len: d?.length ?? 0, head: d?.slice(0, 22), why: d ? useGameStore.getState().keepPhoto(d, cap) : 'no capture' }); }
    const g = useGameStore.getState().game;
    window.__photoData = (g.photos ?? []).map(p => vault.photoData(p.id));
    return { out, album: (g.photos ?? []).map(p => ({ id: p.id, caption: p.caption, size: p.size })), vault: vault.vaultSize(), chron: g.lineage.chronicle.filter(e => e.kind === 'photo').length };
  });
  console.error('photo', JSON.stringify(r));
  const datas = await page.evaluate(() => window.__photoData);
  const { writeFileSync } = await import('node:fs');
  datas.forEach((d, i) => { if (d) writeFileSync(`${outDir}/photo-kept-${i + 1}.jpg`, Buffer.from(d.split(',')[1], 'base64')); });
  // the HUD: View panel shutter, then the Years tab with the album and chronicle thumbnails
  await page.evaluate(() => window.__cb.store.getState().setViewOpen(true));
  await page.waitForTimeout(500);
  await orbit(30, 0.5, info.up + 0.6);
  await shot('photo-1-view-panel');
  const tab = page.getByRole('button', { name: /^Years/ }).first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(800); await page.screenshot({ path: `${outDir}/photo-2-album.png` }); console.error('shot photo-2-album'); }
  // reload from IndexedDB: pixels must come back
  const survived = await page.evaluate(async () => {
    const { useGameStore } = await import('/src/store/gameStore.ts'); const vault = await import('/src/sim/save/photoVault.ts'); const { loadGame, saveGame, AUTOSAVE } = await import('/src/sim/save/saveSystem.ts');
    const g = useGameStore.getState().game; await saveGame(AUTOSAVE, g);
    const ids = (g.photos ?? []).map(p => p.id);
    vault.forgetMemory(); const gone = ids.every(id => !vault.photoData(id));
    const back = await loadGame(AUTOSAVE); await vault.syncVault((back.photos ?? []).map(p => p.id));
    return { gone, restored: ids.every(id => !!vault.photoData(id)) };
  });
  console.error('photo persistence', JSON.stringify(survived));
}
await browser.close(); vite?.kill();
