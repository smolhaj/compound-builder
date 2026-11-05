/**
 * The Defense-tab panels of the home-security PRs through the real HUD: Wall tops and weak spots, The gate and the drive, Armed response and the road watch.
 *   node scripts/securityPanelsShots.mjs <outDir> [port=5964]
 * Screenshots go through CDP Page.captureScreenshot (page.screenshot can stall on the software GL canvas).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5964);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
const cdp = await page.context().newCDPSession(page);
let n = 0;
const shot = async name => {
  await page.evaluate(() => window.__cb.qa.renderNow());
  await page.waitForTimeout(400);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
  writeFileSync(f, Buffer.from(data, 'base64')); console.log(f);
};
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { const G = window.__cb.game.getState(); G.setSpeed(0); window.__cb.store.getState().setQuality('low'); });
  await page.waitForTimeout(1500);
  // a finished stone wall with a workshop against it, an electric fence on it, the gate kit, a subscription, trusting neighbors
  await page.evaluate(() => {
    const G = window.__cb.game, c = window.__cb.world.camp;
    G.getState().planRun('stone_wall', [[c.x - 10, c.z + 10], [c.x + 10, c.z + 10]], []);
    G.setState(s => { const g = structuredClone(s.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 400; r.brush = 0.7; }
      g.structures.push({ id: 'ws1', kind: 'workshop', x: c.x, z: c.z + 9.4, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
      g.stock.wire = 99; g.stock.cable = 99; g.stock.hardware = 99; g.money = 90000; g.utilities.lit = ['x'];
      g.stock.gate_intercom = 1; g.stock.sally_gate = 1;
      for (const nb of g.neighbors) { nb.disposition = 40; nb.status = 'home'; nb.members = Math.max(1, nb.members); }
      return { game: g }; });
    G.getState().addElectric(G.getState().game.perimeter[0].id, true);
    G.getState().subscribeArmedResponse(); G.getState().foundRoadWatch();
  });
  await page.getByRole('button', { name: /^Defense/ }).first().click();
  await page.waitForTimeout(600);
  const groups = [['Wall tops and weak spots', 'wall-tops'], ['The gate and the drive', 'gate'], ['Armed response and the road watch', 'community']];
  for (const [vw, vh, tag] of [[390, 844, 'phone']]) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(700);
    for (const [title, id] of groups) {
      const head = page.getByText(title, { exact: false }).first();
      if (!(await head.count())) { console.log('no group', title); continue; }
      try { await head.scrollIntoViewIfNeeded({ timeout: 4000 }); } catch { console.log('not reachable at', tag, title); await shot(`${tag}-hud-as-is`); break; }
      const body = page.getByText(title, { exact: false }).first();
      const open = await page.evaluate(t => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent && e.textContent.includes(t)); return !!el?.parentElement?.nextElementSibling; }, title);
      if (!open) await head.click();
      await page.waitForTimeout(400);
      await head.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      await shot(`${tag}-${id}`);
    }
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
