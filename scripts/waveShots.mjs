/**
 * The siege-wave clock in the real app: the HUD chip and the compound board card while it is quiet, in the warning days, and a wave arriving (the Watch prompt).
 *   node scripts/waveShots.mjs [--port 5971] [--quality medium] [--out shots/waves]
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
const port = Number(opt('--port', 5971)), quality = opt('--quality', 'medium');
const outDir = resolve(opt('--out', 'shots/waves'));
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
  const board = async (open) => {
    const is = await page.getByRole('dialog', { name: 'Compound board' }).count();
    if (!!is !== open) await page.getByRole('button', { name: /^Board/ }).first().click();
  };
  // a cabin with a palisade, the collapse in progress, law gone, set a number of days before wave 1
  const setup = async (daysBefore) => page.evaluate(async (daysBefore) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { waveDue } = await import('/src/sim/waves.ts');
    if (!window.__built) {
      const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
      G.getState().plan('timber_cabin', sp[0], sp[1], 0);
      const h = 9;
      G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
      window.__built = true;
    }
    const g = structuredClone(G.getState().game);
    if (!g.disaster.kind) { G.setState({ game: g }); G.getState().trigger('grid_down', 0); return null; }
    return null;
  }, daysBefore);
  await setup(0);
  const prep = async (daysBefore, hour) => page.evaluate(async ([daysBefore, hour]) => {
    const cb = window.__cb, G = cb.game;
    const { waveDue } = await import('/src/sim/waves.ts');
    const { DIFFICULTY } = await import('/src/sim/difficulty.ts');
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
      g.stock.canned = 30; g.armory.ammo['556'] = 2000;
      for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
      const hit = Math.floor(g.disaster.hitAt), due = waveDue(g.seed, hit, 1, DIFFICULTY[g.disaster.difficulty ?? 'standard'].lull);
      const SUB = 0.25 / 24;
      g.clock.t = Math.round((due - daysBefore - 0.25 + hour / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
      g.gate.pending = null; g.gate.incoming = null;
      return { game: g };
    });
    return true;
  }, [daysBefore, hour]);
  await frames(6);
  await prep(10, 10);
  await frames(8);
  await page.waitForTimeout(2500);
  const ok = page.getByRole('button', { name: 'OK', exact: true }); if (await ok.count()) await ok.first().click();
  await shot('1-quiet-hud', 4);
  await board(true); await shot('2-quiet-board', 3); await board(false);
  await prep(2, 10); await frames(6);
  await shot('3-warning-hud', 4);
  await board(true); await shot('4-warning-board', 3); await board(false);
  // the wave day: step the sim (no rendering) to the wave's arrival hour, then hand the raid to the Watch prompt like the real clock does
  await prep(0.25, 0); await frames(4);
  await page.evaluate(async () => {
    const G = window.__cb.game;
    const { step } = await import('/src/sim/engine.ts');
    let g = structuredClone(G.getState().game);
    for (let i = 0; i < 400 && !g.gate.incoming && !g.gate.pending; i++) g = step(g, 0.25 / 24 * 4);
    g = structuredClone(g);
    const inc = g.gate.incoming;
    if (inc) { g.clock.t = inc.at; g.gate.pending = inc.e; g.gate.incoming = null; }
    g.clock.speed = 0;
    G.getState().load(g);
  });
  await page.waitForTimeout(3500);
  await shot('5-wave-arrives', 6);
  console.log(JSON.stringify(await page.evaluate(() => { const g = window.__cb.game.getState(); const e = g.game.gate.pending; return e ? { title: e.title, size: e.size, wave: e.wave, dossier: e.dossier } : null; })));
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
