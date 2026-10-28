/**
 * A raid on a container-wall ring WITH a patrol walkway: the home side's guards stand on the real deck (sim/walkway.ts deckSpots). Plants a cabin and a ring,
 * plans the battle, plays it and saves eye-level and aerial frames at the moments a guard is up on the wall.
 *   flock <lock> node scripts/battleDeckShots.mjs <outDir> [port=5944]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5944);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=0.8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const info = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { planBattle } = await import('/src/sim/battle.ts');
    const { useBattleStore } = await import('/src/store/battleStore.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    G.getState().planRun('container_wall', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    const finish = () => G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; });
    finish();
    const host = G.getState().game.perimeter.find(r => r.kind === 'container_wall');
    G.getState().addWalkway(host.id);
    finish();
    const g = structuredClone(G.getState().game);
    g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
    // the seed with the most guards up on the deck
    let best = null;
    for (let seed = 1; seed <= 30; seed++) {
      const b = planBattle(structuredClone(g), 8, seed);
      const up = b.events.filter(e => e.kind === 'move' && (e.y ?? 0) > 0.3 && String(e.unit).startsWith('h_'));
      if (!best || up.length > best.up.length) best = { seed, b, up };
    }
    const ev = best.up[0];
    useBattleStore.getState().playBattle(best.b);
    return { seed: best.seed, result: best.b.result, ups: best.up.length, t: ev?.t ?? 3, x: ev?.x, z: ev?.z, y: ev?.y, unit: ev?.unit, camp: { x: c.x, z: c.z } };
  });
  console.log(JSON.stringify(info));
  await page.waitForFunction(() => window.__cb.battle.playing, null, { polling: 200 });
  const frame = async (name, mode) => {
    await page.evaluate(([m, i]) => window.__gp(m, i), [mode, info]);
    await page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
    const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(',')[1], 'base64')); console.log(name);
  };
  await page.evaluate(() => { window.__gp = (mode, i) => { const b = window.__cb.battle; b.update(0.05);
    const find = () => [...b._units.values()].find(q => q.def?.id === i.unit) ?? null;
    // run the battle on until the guard has walked up to his post on the wall
    while (b.time < i.t + 60) { b.update(0.1); const q = find(); if (q && b.time > i.t + 0.5 && Math.hypot(q.x - i.x, q.z - i.z) < 0.6) break; }
    const u = find();
    const gx = u?.x ?? i.x, gz = u?.z ?? i.z, gy = (u?.y ?? i.y ?? 0.45), cb = window.__cb, gr = cb.world.groundAt;
    const dx = i.camp.x - gx, dz = i.camp.z - gz, d = Math.hypot(dx, dz) || 1;
    if (mode === 'eye') { const x = gx + dx / d * 4.5, z = gz + dz / d * 4.5; cb.qa.pose = { x, y: gr(x, z) + 0.3, z, lx: gx, ly: gy + 0.12, lz: gz, fov: 58 }; }
    else if (mode === 'close') { const x = gx + dx / d * 2.2, z = gz + dz / d * 2.2; cb.qa.pose = { x, y: gr(x, z) + 0.25, z, lx: gx, ly: gy + 0.1, lz: gz, fov: 60 }; }
    else { cb.qa.pose = null; cb.cam.target.set(gx, gy, gz); cb.cam.radius = 7; cb.cam.pitch = 0.6; cb.cam.yaw = Math.atan2(dx, dz) + 0.6; } }; });
  for (const [name, mode] of [['01-raid-eye-guard-on-deck', 'eye'], ['02-raid-close-guard-on-deck', 'close'], ['03-raid-aerial-guard-on-deck', 'air']]) {
    await frame(name, mode);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
