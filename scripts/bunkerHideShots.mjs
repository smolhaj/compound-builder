// Screenshots for bunker hiding: the cost / risk lines on the gate card, then the cutscene and report of a raid that finds the bunker.
//   flock /tmp/cb.lock node scripts/bunkerHideShots.mjs --out /tmp/claude-0/bunkershots [--armed]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const armed = args.includes('--armed'), port = Number(opt('--port', 5977)), out = resolve(opt('--out', '/tmp/claude-0/bunkershots'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite exited ' + c))); });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  const info = await page.evaluate(async armed => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { resolve } = await import('/src/sim/encounters.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } return { game: g }; });
    const g = structuredClone(G.getState().game);
    g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.55; g.clock.speed = 0;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.structures.push({ id: 'bk', kind: 'bunker_hatch', x: sp[0] + 3, z: sp[1] + 3, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.structures.push({ id: 'bkc', kind: 'bunker_comms', x: sp[0] + 5, z: sp[1] + 3, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    Object.assign(g.stock, { canned: 30, staples: 6, water_jugs: 24 }); g.utilities.storedL = 300;
    if (!armed && g.tools) g.tools.items = [];   // starter axes and hammers count as weapons below; the unarmed case has none
    if (armed) { g.armory.ammo['556'] = 600; for (const [i, p] of g.people.entries()) if (!p.kid) g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); }
    const mk = d => ({ id: 'e' + d, kind: 'gang', day: d, title: 'An armed crew', dossier: ['8 of them, organized, rifles. They have been working the farms east of town.'], size: 8, armed: true, strength: 96, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend'], temper: 'hard', back: true, scouted: 'A man at the fence' });
    let day = 0;
    for (let d = 1; d < 400 && !day; d++) { const t = structuredClone(g); t.gate.pending = mk(d); const o = resolve(t, 'hide'); if (o.bunker && o.bunker.fight === (armed ? 'shootout' : 'loot')) day = d; }
    g.gate.pending = mk(day);
    G.getState().load(g);
    return { day };
  }, armed);
  console.log(JSON.stringify(info));
  await page.waitForSelector('[data-testid="hide-cost"]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${armed ? 'armed' : 'unarmed'}_card.png` });
  await page.locator('[data-testid=stance-hide]').dispatchEvent('click');
  await page.getByRole('button', { name: 'Watch', exact: true }).dispatchEvent('click');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const ph = await page.evaluate(() => window.__cb.game.getState().cutscene?.phase ?? 'none');
    if (i % 3 === 0) await page.screenshot({ path: `${out}/${armed ? 'armed' : 'unarmed'}_scene${String(i).padStart(2, '0')}.png` });
    console.log(i, ph);
    if (ph === 'aftermath' || ph === 'report' || ph === 'none') break;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${armed ? 'armed' : 'unarmed'}_report.png` });
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
