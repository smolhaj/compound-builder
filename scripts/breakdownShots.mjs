/**
 * (breakdown variant) A fortress (stone wall, towers, guards, guard dogs, cameras) holds a raid; the aftermath report shows "Why it went this way".
 *   node scripts/breakdownShots.mjs [--port 5963] [--bare] [--out /tmp/claude-0/breakdown]
 * Based on cutsceneShots.mjs.
 * The raid cutscene, end to end in the real app: a gang arrives at 2:15 AM,
 * the Watch prompt, the scenes of a night siege (lead-in, the fight, the gap
 * card, the assault), the aftermath report. Saves full-page frames.
 *   node scripts/cutsceneShots.mjs [--single] [--port 5961] [--quality medium] [--out shots/cutscene]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const bare = args.includes('--bare');
const port = Number(opt('--port', 5961)), quality = opt('--quality', 'medium');
const outDir = resolve(opt('--out', 'shots/cutscene'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  const shot = async (name, k = 4) => { await frames(k); const f = `${outDir}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };

  const info = await page.evaluate(async (bare) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { planSiege } = await import('/src/sim/siege.ts');
    const { hireGuard } = await import('/src/sim/guards.ts');
    const { adoptDog } = await import('/src/sim/pets.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    if (!bare) G.getState().planRun('stone_wall', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      if (!bare) {
        g.structures.push({ id: 'tw1', kind: 'watchtower_wood', x: sp[0] + 5, z: sp[1] + 7, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }, { id: 'tw2', kind: 'watchtower_wood', x: sp[0] - 6, z: sp[1] - 7, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
        g.money = 1e6; for (let i = 0; i < 3; i++) hireGuard(g);
        adoptDog(g, { guard: true, training: 80, ageYears: 3 }); adoptDog(g, { guard: true, training: 80, ageYears: 3 });
        g.stock.cameras = 3; g.utilities.lit = [g.structures[0].id];
      }
      return { game: g };
    });
    const g = structuredClone(G.getState().game);
    const SUB = 0.25 / 24;
    const day = Math.floor(g.disaster.hitAt + 20);
    g.clock.t = Math.round((day - 0.25 + 14 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 6; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
    let ed = 0;
    for (let d = 1; d < 300; d++) {
      const p = planSiege({ kind: 'gang', size: 8, temper: 'hard', hour: 14, seed: g.seed * 131 + d * 7 + 1, fought: true, fightSeconds: 90 });
      if (p.scenes.length >= 1) { ed = d; break; }
    }
    g.gate.pending = { id: 'e9', kind: 'gang', day: ed, title: 'A gang comes up the road', dossier: ['Eight men, armed.'], size: 8, armed: true, strength: 60, temper: 'hard', stances: ['hide', 'parley', 'warn', 'defend'] };
    const { useBattleStore } = await import('/src/store/battleStore.ts');
    const { useCutsceneView } = await import('/src/store/cutsceneStore.ts');
    window.__adv = (match, maxSteps = 6000, dt = 0.1) => {
      for (let i = 0; i < maxSteps; i++) {
        const v = useCutsceneView.getState().view;
        if (v && match(v, cb.battle.time)) return true;
        cb.player.update(dt);
        const bs = useBattleStore.getState();
        if (bs.battle && bs.battle !== cb.battle.battle) cb.battle.play(bs.battle);
        else if (!bs.battle && cb.battle.playing) cb.battle.stop();
        if (cb.battle.playing) { cb.battle.update(dt); bs.setProgress(cb.battle.time, cb.battle.lines); }
        if (!cb.player.active) return false;
      }
      return false;
    };
    G.getState().load(g);
    return { day: ed };
  }, bare);
  console.log(JSON.stringify(info));
  await frames(10);
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: /^Defend/ }).click();
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await frames(2);
  await page.evaluate(() => window.__cb.player.skipAll());
  await page.evaluate(() => window.__adv(() => false, 4));
  await frames(6);
  await page.waitForFunction(() => window.__cb.game.getState().cutscene?.phase === 'aftermath', null, { polling: 300 });
  await shot(bare ? 'aftermath-bare' : 'aftermath-fortress', 6);
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
