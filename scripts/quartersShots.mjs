/**
 * Assigned quarters shots: the Family -> Quarters fold and the building drawer.
 *   node scripts/quartersShots.mjs [--port 5261] [--out shots/quarters]
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
const port = Number(opt('--port', 5261));
const outDir = resolve(opt('--out', 'shots/quarters'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
  const shot = async (name) => { await frames(2); await page.screenshot({ path: `${outDir}/${name}.png` }); console.log(name); };
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp, G = cb.game.getState();
    for (const [k, dx, dz] of [['log_house', 0, 0], ['guest_house', 14, 6], ['cottage', -14, 6]]) { const sp = cb.tool.findSpot(k, c.x + dx, c.z + dz, 0); if (sp) G.plan(k, sp[0], sp[1], 0); }
    G.money(d => { for (const st of d.structures) { st.stage = 99; st.finishedAt = 0; st.supplied = true; }
      const mk = (id, age, o) => ({ id, first: id, last: 'Moreno', age, kid: age < 18, body: 'f', skills: { builder: 0, gardener: 0, medic: 0, mechanic: 0, hunter: 0, negotiator: 0, teacher: 0, radio: 0 }, shirt: 0x3b5b8c, ...o });
      const add = (p) => { d.people.push(p); d.personState.push({ id: p.id, task: 'idle', target: null, needs: JSON.parse(JSON.stringify(d.personState[0].needs)) }); };
      add(mk('Rosa', 41, { origin: { kind: 'neighbor', from: 'n1', since: 2 } })); add(mk('Leo', 9, { kid: true, origin: { kind: 'neighbor', from: 'n1', since: 2 } }));
      add(mk('Abuela', 72, { elder: true, rel: { role: 'grandmother', of: d.people[0].id } }));
      return null; });
    G.advance(1); });
  await frames(3);
  await page.getByRole('button', { name: /^Family/ }).first().click();
  await frames(2);
  await page.getByText(/^▸ Quarters/).first().click();
  await shot('01-quarters-fold');
  // move the neighbor household to the cottage, set the guest house as sick bay
  const sels = page.locator('[data-testid=quarters] select');
  console.log('selects', await sels.count());
  await sels.nth(1).selectOption({ index: 1 });
  await shot('02-after-move');
  await page.getByRole('button', { name: /^Projects/ }).first().click();
  await page.evaluate(() => { const G = window.__cb.game.getState(); G.select(G.game.structures[0].id); });
  await shot('03-drawer');
} finally { await browser.close(); vite.kill(); }
