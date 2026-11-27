// Dome ground / base artifact probe: stands a dome as domeDetailShots does and renders top-down and eye-level frames with scene toggles.
//   flock /tmp/cb.lock node scripts/domeArtifactShots.mjs <outDir> [port]      env: KIND=dome_arcology|dome_glass  TAG=  EXP='name;name' (toggles, see EXPS)  CAMS=top,eye,low  LIST=1 (print the scene graph)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5971);
const KIND = process.env.KIND || 'dome_arcology', TAG = process.env.TAG || '', TOD = process.env.TOD || 12.5;
const CAMS = (process.env.CAMS || 'top,eye').split(','), EXP = (process.env.EXP || 'base').split(';');
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
// each toggle runs in the page with (cb, id) and may return a restore function
const EXPS = {
  base: () => () => {},
  noshadow: cb => { const l = cb.ws._sunLight; l.castShadow = false; cb.ws.renderer.shadowMap.enabled = false; cb.ws.scene.traverse(o => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } }); return () => {}; },
  nodome: (cb, id) => { const b = cb.world._built.get(id); b.group.visible = false; return () => { b.group.visible = true; }; },
  lambert: cb => { const prev = cb.ws.scene.overrideMaterial; cb.ws.scene.overrideMaterial = new cb.THREE.MeshLambertMaterial({ color: 0x909090 }); return () => { cb.ws.scene.overrideMaterial = prev; }; },
  noforest: cb => { const saved = []; cb.ws.scene.traverse(o => { const a = o.isMesh && o.geometry?.getAttribute?.('aForest'); if (a) { saved.push([a, a.array.slice()]); a.array.fill(0); a.needsUpdate = true; } }); return () => saved.forEach(([a, v]) => { a.array.set(v); a.needsUpdate = true; }); },
  // the terrain mesh alone: stop it receiving shadows / swap its shader for a plain gray Lambert (same geometry and normals)
  terrNoRecv: cb => { const t = cb.ws.scene.getObjectByName('terrain'); const r = t.receiveShadow; t.receiveShadow = false; (t.material.needsUpdate = true); return () => { t.receiveShadow = r; t.material.needsUpdate = true; }; },
  terrLambert: cb => { const t = cb.ws.scene.getObjectByName('terrain'); const m = t.material; t.material = new cb.THREE.MeshLambertMaterial({ color: 0x8a8a70 }); return () => { t.material = m; }; },
  terrLambertNoRecv: cb => { const t = cb.ws.scene.getObjectByName('terrain'); const m = t.material, r = t.receiveShadow; t.receiveShadow = false; t.material = new cb.THREE.MeshLambertMaterial({ color: 0x8a8a70 }); return () => { t.material = m; t.receiveShadow = r; }; },
  noterrain: cb => { const hid = []; cb.ws.scene.traverse(o => { if (o.isMesh && /terrain/i.test(o.name + (o.parent?.name || ''))) { o.visible = false; hid.push(o); } }); return () => hid.forEach(o => { o.visible = true; }); },
};
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=0.9&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=${process.env.RELIEF ?? 0}&lotseed=${process.env.LOTSEED ?? 8}&looktier=high`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const info = await page.evaluate(async ([KIND, TOD]) => {
    const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const y = w.access.yard;
    const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, 1, 14);
    G.getState().plan(KIND, sp[0], sp[1], 1);
    const st = G.getState().game.structures.at(-1);
    G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; } return { game: g }; });
    { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const ref = live.domeOf(g, st.id); if (ref) { const o = live.ownState(g, ref); o.dust = 0; o.co2ppm = 500; } return { game: g }; }); }
    cb.store.getState().setHudHidden?.(true);
    const s = cb.store.getState(); s.setTimeOfDay(TOD); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');
    const d = (await import('/src/sim/dome/standing.ts')).domesOf(G.getState().game).find(x => x.id === st.id);
    const pad = w.parcel.pads.map(p => [p.x0, p.z0, p.x1, p.z1, p.y, p.skirt]);
    return { id: st.id, x: d.x, z: d.z, r: d.r, pad };
  }, [KIND, TOD]);
  console.error(JSON.stringify(info));
  await frames(4);
  if (process.env.LIST) console.error(await page.evaluate(() => { const o = []; const walk = (n, d) => { if (d > 2) return; o.push('  '.repeat(d) + n.type + ' "' + n.name + '" ' + (n.children?.length ?? 0) + (n.isMesh ? ' mesh ' + (n.material?.type || '') : '')); for (const c of n.children) walk(c, d + 1); }; walk(window.__cb.ws.scene, 0); return o.join('\n'); }));
  if (process.env.DUMP) {
    // heights and the drawn slope along a line crossing the pad's west edge and its south-west corner area
    console.error('DUMP', JSON.stringify(await page.evaluate(([x0, x1, z]) => { const w = window.__cb.world, o = []; for (let x = x0; x <= x1; x += 0.15) { const h = w.groundAt(x, z), n = w.parcel.sample(x, z); o.push([+x.toFixed(2), +h.toFixed(3), +n.forest.toFixed(2)]); } return o; }, [info.pad[0][0] - 2, info.pad[0][0] + 1.5, info.z])));
  }
  if (process.env.LISTDOME) console.error('DOME MESHES\n' + (await page.evaluate(id => { const g = window.__cb.world._built.get(id).group, o = []; let i = 0; g.traverse(m => { if (m.isMesh) { const mt = [].concat(m.material).map(q => q.name || q.type + '#' + (q.color?.getHexString?.() ?? '')).join(','); o.push(i++ + ' ' + (m.name || '-') + ' [' + m.parent?.name + '] ' + mt + ' v=' + m.geometry.attributes.position.count + ' vis=' + m.visible + ' shadow=' + m.castShadow); } }); return o.join('\n'); }, info.id)));
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const y0 = await gd(info.x, info.z);
  const ring = async (ang, dist, h, lookH = 0.1, fov = 60) => { const ex = info.x + Math.sin(ang) * (info.r + dist), ez = info.z + Math.cos(ang) * (info.r + dist), lx = info.x + Math.sin(ang) * info.r, lz = info.z + Math.cos(ang) * info.r; return { e: [ex, (await gd(ex, ez)) + h, ez], l: [lx, (await gd(lx, lz)) + lookH, lz], fov }; };
  const poses = {
    top: { e: [info.x + 0.05, y0 + info.r * 2.6, info.z + 0.05], l: [info.x, y0, info.z], fov: 62 },
    eye: await ring(-2.3, 6, 0.3, 0.8, 60),
    low: await ring(-0.9, 5, 0.9, 0.6, 58),
  };
  // base close-ups round the foot of the shell, at eye height (a person is 0.28 tall)
  for (let i = 0; i < 8; i++) poses['b' + i] = await ring(i * Math.PI / 4 + 0.3, 1.8, 0.2, 0.12, 62);
  for (const name of EXP) {
    const fn = name.split('+').map(n => n.trim());
    await page.evaluate(([src, fn, id]) => {
      const ex = {}; for (const [k, v] of Object.entries(src)) ex[k] = new Function('return ' + v)();
      window.__undo = fn.map(n => { const dc = /^dchild:(\d+)$/.exec(n); if (dc) { const g = window.__cb.world._built.get(id).group, ms = []; g.traverse(o => { if (o.isMesh) ms.push(o); }); const o = ms[+dc[1]]; o.visible = false; return () => { o.visible = true; }; } const m = /^hide:(.+)$/.exec(n); if (m) { const re = new RegExp(m[1]), hid = []; window.__cb.ws.scene.traverse(o => { if (o.visible && re.test(o.name)) { o.visible = false; hid.push(o); } }); return () => hid.forEach(o => { o.visible = true; }); } return ex[n](window.__cb, id); });
    }, [Object.fromEntries(Object.entries(EXPS).map(([k, v]) => [k, v.toString()])), fn, info.id]);
    for (const c of CAMS) {
      const p = poses[c];
      await page.evaluate(p => { window.__cb.qa.pose = { x: p.e[0], y: p.e[1], z: p.e[2], lx: p.l[0], ly: p.l[1], lz: p.l[2], fov: p.fov }; }, p);
      await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high'));
      await page.screenshot({ path: `${out}/${TAG}${name.replace(/[+:|^$()]/g, '_')}-${c}.png` }); console.error(name, c);
    }
    await page.evaluate(() => { for (const u of window.__undo) u(); });
  }
} finally { await browser.close(); vite.kill(); }
