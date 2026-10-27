/**
 * Raiders at the wall: plants a cabin and a ring of the given wall kind in the
 * real world, plans the battle with the sim, plays it, and saves ground-level
 * frames at the moments the wall bites (a man snagged, a crew turning back).
 *   node scripts/battleShots.mjs [--kind barbed_wire] [--raiders 10] [--port 5851] [--out shots/battle]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const kind = opt('--kind', 'barbed_wire'), raiders = Number(opt('--raiders', 10)), port = Number(opt('--port', 5851));
const outDir = resolve(opt('--out', `shots/battle-${kind}`));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 120000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const info = await page.evaluate(async ([kind, raiders]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { planBattle } = await import('/src/sim/battle.ts');
    const { useBattleStore } = await import('/src/store/battleStore.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 8;
    G.getState().planRun(kind, [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      return { game: g };
    });
    // the battle is planned on a copy that also has the collapse behind it and a family with guns
    const g = structuredClone(G.getState().game);
    g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 3; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
    // the seed with the most men hurt at the wall
    let best = null;
    for (let seed = 1; seed <= 40; seed++) {
      const b = planBattle(structuredClone(g), raiders, seed);
      const snags = b.events.filter(e => e.kind === 'snag').length, fled = b.events.filter(e => e.kind === 'flee' && String(e.unit).startsWith('r')).length;
      if (!best || snags * 3 + fled > best.score) best = { seed, b, score: snags * 3 + fled, snags, fled };
    }
    const b = best.b, ev = b.events;
    const snagT = ev.filter(e => e.kind === 'snag').map(e => e.t), fleeT = ev.filter(e => e.kind === 'flee' && String(e.unit).startsWith('r')).map(e => e.t);
    const times = [snagT[0] + 0.7, snagT[1] != null ? snagT[1] + 0.7 : snagT[0] + 4, fleeT[0] != null ? fleeT[0] + 1.2 : snagT[0] + 8, b.duration - 2].filter(x => Number.isFinite(x)).map(x => Math.max(2, x)).sort((a, z) => a - z);
    cb.qa.battleTimes = times;
    useBattleStore.getState().playBattle(b);
    return { seed: best.seed, snags: best.snags, fled: best.fled, result: b.result, duration: b.duration, times, left: b.leftBehind };
  }, [kind, raiders]);
  console.log(JSON.stringify(info));
  let n = 0;
  for (const t of info.times) {
    await page.waitForFunction(t => window.__cb.battle.time >= t, t, { polling: 150 });
    const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    const f = `${outDir}/${String(++n).padStart(2, '0')}-t${Math.round(t)}s.png`;
    writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
    console.log(f);
  }
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
