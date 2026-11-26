// (derived) Arcology control block shots (docs/ux/dome-control): eye-level close-ups of each wing and the operations room, from the port, the yard airlock, above, day and night. HIGH quality.
//   ROT=1 flock /tmp/cb.lock node scripts/domeControlShots.mjs <outDir> [port] [names]
// names: ops, opsclose, power, water, air, doors, sec, pipes, fromport, fromyard, aerial, cutaway, long, nightops, nightlong
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5994);
// SCENES='glass:dome_glass:1:aerial,closeup,eye,inside,night;arc:dome_arcology:1:aerial,eye,inside;...' (name:kind:rot:shots), or KIND/ROT for one
const TAG = process.env.TAG || '';
const SCENES = (process.env.SCENES || `${process.env.KIND || 'dome_arcology'}:${process.env.KIND || 'dome_arcology'}:${process.env.ROT ?? 1}:${process.argv[4] || 'ops,opsclose,power,water,air,doors,sec,pipes,fromport,fromyard,aerial,cutaway,long,nightops,nightlong'}`).split(';').map(x => { const [name, kind, rot, shots, doors] = x.split(':'); return { name, kind, rot: Number(rot), shots: shots.split(','), doors }; });
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  for (const SC of SCENES) {
  const KIND = SC.kind, ROT = SC.rot, want = n => SC.shots.includes(n), PFX = `${TAG}${SC.name}-`;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=${process.env.RELIEF ?? 0}&lotseed=${process.env.LOTSEED ?? 8}&looktier=high`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${PFX}${name}.png` }); lap(name); };
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async ([KIND, ROT, DOORS]) => {
    const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const y = w.access.yard, drive = w.access.drive, end = drive[drive.length - 1];
    // the dome stands over the end of the drive, as in the owner's scene: its centre a little way back from the yard toward the house
    (await import('/src/game/buildkit/domeBuildings.ts')).setDoorLook(DOORS);
    const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, ROT, 14);
    if (!sp) return null;
    G.getState().plan(KIND, sp[0], sp[1], ROT);
    const st = G.getState().game.structures.at(-1);
    G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; } return { game: g }; });   // (no lit lamps by day: their warm point lights tinted every frame; the night shots switch them on)
    // clean air: the inner haze of a dust or CO2 reading tints everything near the shell (the gates) tan, which hid the new look
    { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const ref = live.domeOf(g, st.id); if (ref) { const o = live.ownState(g, ref); o.dust = 0; o.co2ppm = 500; } return { game: g }; }); }
    cb.store.getState().setHudHidden?.(true);
    return { id: st.id, x: st.x, z: st.z, rot: ROT, port: st.portAngle ?? null, yard: [y.x, y.z], end };
  }, [KIND, ROT, SC.doors || 'open']);
  if (!info) { console.error('no spot for ' + KIND); await page.close(); continue; }
  lap(JSON.stringify(info));
  await frames(4);
  // ── the audit: every mesh of the starter camp and its chore yard (tent, tables, poles, clothesline, grill, tub, stumps, chairs) against the dome's level pad ──
  const res = await page.evaluate(async () => {
    const { Box3 } = await import('/node_modules/three/build/three.module.js');
    const w = window.__cb.world, lv = [...w._domeLevels.values()][0], pad = lv ? lv.y : NaN;
    const out = { pad, campY: w._campGroup.position.y, yardY: w._yard.group.position.y, visible: w._campGroup.visible && w._yard.group.visible, items: [] };
    for (const [grp, g] of [['camp', w._campGroup], ['yard', w._yard.group]]) {
      g.updateMatrixWorld(true);
      g.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        const b = new Box3().setFromObject(o);
        out.items.push({ grp, name: o.name || o.parent?.name || '', verts: o.geometry.attributes.position.count, minGap: +(b.min.y - pad).toFixed(3), h: +(b.max.y - b.min.y).toFixed(3), w: +(b.max.x - b.min.x).toFixed(2) });
      });
    }
    return out;
  });
  const HUNG = /light|cord|wash|cloth|line|bulb|smoke|flag/i;   // explicit allow-list: hung or mounted items (string lights, laundry, smoke sprites)
  const bad = res.items.filter(i => i.minGap > 0.02 && !HUNG.test(i.name));
  console.log(`${SC.name}: pad ${res.pad.toFixed(3)} campY ${res.campY.toFixed(3)} yardY ${res.yardY.toFixed(3)} campVisible ${res.visible}; ${res.items.length} meshes, ${bad.length} above the pad`);
  for (const b of bad) console.log('  OFFENDER', JSON.stringify(b));
  if (res.visible && (!Number.isFinite(res.pad) || Math.abs(res.campY - res.pad) > 0.001 || bad.length)) process.exitCode = 1;
  await page.close();
  }
} finally { await browser.close(); vite.kill(); }
