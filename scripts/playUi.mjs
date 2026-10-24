/**
 * Hands-on playtest through the real UI (clicks, not store calls, wherever a
 * player would click): new game, place buildings with the mouse, order what
 * the plans need and a pantry, then fast-forward through the warning signs
 * and the hit, answering the gate with its buttons, to the report card.
 * Screenshots and a log of anything odd (page errors, console errors).
 *
 *   node scripts/playUi.mjs [--port 5241] [--out shots/play] [--kind grid_down]
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
const port = Number(opt('--port', 5241));
const outDir = resolve(opt('--out', 'shots/play'));
const kind = opt('--kind', 'grid_down');
mkdirSync(outDir, { recursive: true });

const notes = [];
const note = (s) => { notes.push(s); console.log(s); };
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => note(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') note(`console error: ${m.text()}`); });
  await page.goto(`http://localhost:${port}/?new`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 60000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  const shot = async (name) => { await frames(3); const f = `${outDir}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
  const state = () => page.evaluate(() => { const g = window.__cb.game.getState().game; return { t: g.clock.t, money: Math.round(g.money), built: g.structures.length, fin: g.structures.filter(s => s.finishedAt !== null).map(s => s.kind), hit: g.disaster.hitAt, warn: g.disaster.warnAt, ending: g.ending, pending: !!g.gate.pending, alive: g.personState.filter(p => p.needs.died == null).length }; });

  // new game: Scenario, the chosen disaster, a year of peace, Standard
  await page.getByText('Scenario', { exact: true }).click();
  await page.locator('select').first().selectOption(kind);
  await page.getByText('1 year').click();
  await page.getByText('Start', { exact: true }).click();
  await frames(4);
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  // frame the camp from above so clicks land on open ground near it
  await page.evaluate(() => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.1; cam.yaw = 0; });
  await shot('start');

  // place by clicking: pick the tool, ask the game for a free spot near where we'd like it, project it to the screen and click there
  const place = async (label, kind, dx, dz) => {
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
    const before = (await state()).built;
    // the first free spot near the wish that lands on open map (not under the side panels)
    const xy = await page.evaluate(([k, ax, az]) => {
      const cb = window.__cb, c = cb.world.camp;
      for (const [ox, oz] of [[0, 0], [-4, 0], [0, 4], [-4, 4], [-8, 0], [0, -4], [-8, 4], [4, 4]]) {
        const sp = cb.tool.findSpot(k, c.x + ax + ox, c.z + az + oz, 0);
        if (!sp) continue;
        const v = new cb.THREE.Vector3(sp[0], cb.world.groundAt(sp[0], sp[1]), sp[1]).project(cb.ws.camera);
        const x = Math.round((v.x + 1) / 2 * innerWidth), y = Math.round((1 - v.y) / 2 * innerHeight);
        if (x > 290 && x < 970 && y > 70 && y < 680) return [x, y];
      }
      return null;
    }, [kind, dx, dz]);
    if (xy) { await page.mouse.move(xy[0], xy[1]); await frames(2); await page.mouse.click(xy[0], xy[1]); await frames(2); }
    const ok = (await state()).built > before;
    note(ok ? `placed ${label} at screen ${xy}` : `could not place ${label} (spot ${xy})`);
    if (!ok) await page.keyboard.press('Escape');
    return ok;
  };
  await place('Timber cabin', 'timber_cabin', 0, 2);
  await shot('cabin-placed');
  await place('Kitchen garden', 'garden', -4, 5);
  await place('Field plot', 'field', -10, -6);
  await place('Field plot', 'field', 9, -6);
  await place('Root cellar', 'root_cellar', 5, 5);
  await shot('plans-placed');
  // order what the plans need, by its button
  await page.getByRole('button', { name: /Order what the plans need/ }).click();
  // a pantry: canning lids and bulk staples through the order list (+ buttons)
  const orderSome = async (id, times) => {
    await page.locator('select').filter({ hasText: 'Order…' }).selectOption(id);
    // the + on that material's own stockpile row (the row the order list adds for it)
    const name = await page.evaluate(m => window.__cb && document.querySelector('option[value="' + m + '"]')?.textContent?.split(' (')[0], id);
    const plus = page.locator('div', { hasText: new RegExp(`^${name}`) }).getByRole('button', { name: '+', exact: true }).last();
    for (let i = 1; i < times; i++) await plus.click();
  };
  await orderSome('staples', 12);
  await orderSome('lids', 20);
  await shot('ordering');
  await page.getByRole('button', { name: /^Order \$/ }).click();
  await shot('ordered');

  // fast-forward the way a player at top speed would, a week at a time, keeping the plans supplied
  const s0 = await state();
  let lastShot = -1;
  for (let wk = 0; wk < 160; wk++) {
    const st = await state();
    if (st.ending) break;
    if (st.pending) {
      await shot(`gate-day-${Math.floor(st.t)}`);
      // a sensible player: read the card; take people in only if the food stretches to them
      const card = await page.locator('body').innerText();
      const m = card.match(/with them, (\d+) days/);
      const away = page.getByRole('button', { name: /^Turn them away/ });
      if (m && Number(m[1]) < 90 && await away.count()) { await away.click(); note(`turned away (food with them: ${m[1]} days)`); }
      else { await page.getByRole('button').filter({ hasText: /Take them in|A month's trial|Trade|Parley|Hide|Defend|Warn off/ }).first().click(); }
      await shot('gate-answered');
      await page.getByRole('button', { name: 'Carry on' }).click().catch(() => {});
      continue;
    }
    const food = page.getByRole('button', { name: /^Order three months of staples/ });
    if (await food.count() && await food.isEnabled()) { await food.click(); note(`ordered staples on day ${Math.floor(st.t)}`); }
    const need = page.getByRole('button', { name: /Order what the plans need/ });
    if (await need.count() && await need.isEnabled()) await need.click();
    const phase = st.t < st.warn ? 'peace' : st.t < st.hit ? 'warning' : 'after';
    if (phase !== lastShot) { await shot(`${phase}-day-${Math.floor(st.t)}`); lastShot = phase; }
    await page.evaluate(() => window.__cb.game.getState().advance(7));
  }
  const end = await state();
  note(`end: day ${Math.floor(end.t)} (hit ${Math.floor(end.hit)}), money ${end.money}, finished ${end.fin.join(', ')}, alive ${end.alive}, ending ${JSON.stringify(end.ending)} (started with $${s0.money})`);
  await shot('final');
  if (end.ending) { await page.evaluate(() => { const c = document.querySelector('[data-report]'); c?.scrollIntoView(); }); }
} finally {
  writeFileSync(`${outDir}/notes.txt`, notes.join('\n'));
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
