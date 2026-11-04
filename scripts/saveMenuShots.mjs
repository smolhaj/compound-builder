/**
 * Starter compound through the real HUD: new game by the wizard, click the card's buttons (Cancel, x on a row, One by one, Place all),
 * order, advance days. Screenshots the whole 1280x800 page at each step; prints console errors.
 *   flock $SP/render.lock node scripts/saveMenuShots.mjs --out shots/savemenu [--port 5340]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5340)), out = resolve(opt('--out', 'shots/savemenu'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const issues = [];
page.on('pageerror', e => { issues.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') { issues.push(m.text().slice(0, 200)); console.log('CONSOLE ERROR', m.text().slice(0, 200)); } });
let n = 0;
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(500); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log('shot', f); };
const st = () => page.evaluate(() => { const g = window.__cb.game.getState().game; return { t: Math.floor(g.clock.t), money: Math.round(g.money), structures: g.structures.map(s => s.kind + (s.finishedAt !== null ? '*' : '')), runs: g.perimeter.length, tool: window.__cb.game.getState().tool, preview: window.__cb.store.getState().starterPreview?.pieces.filter(p => !p.later).length ?? null }; });
const click = async (name, exact = true) => { await page.getByRole('button', { name, exact }).first().click(); await page.waitForTimeout(400); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await shot('menu');
  // export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export save' }).click()]);
  console.log('download', dl.suggestedFilename());
  await dl.saveAs(`${out}/exported.json`);
  // bad import
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('/tmp/cbio/bad.json');
  await page.waitForTimeout(300);
  await shot('bad-file');
  // good import -> confirm
  await page.locator('input[type=file]').setInputFiles(`${out}/exported.json`);
  await page.waitForTimeout(300);
  await shot('confirm');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await page.waitForTimeout(300);
  console.log('after replace menu open?', await page.getByRole('button', { name: 'Export save' }).count());
  // clock resume: running at speed 3, card arrives, answered
  const r = await page.evaluate(async () => {
    const G = window.__cb.game; const sleep = ms => new Promise(r => setTimeout(r, ms));
    G.getState().setSpeed(3);
    G.setState(s => { const g = structuredClone(s.game); g.gate.card = { title: 'Test', text: 'x', tone: 'good', lines: [] }; return { game: g, resumeTo: 3 }; });
    G.getState().tick(0.1); await sleep(100);
    const during = G.getState().game.clock.speed;
    G.getState().dismissCard(); G.getState().tick(0.1); await sleep(100);
    const after = G.getState().game.clock.speed;
    G.getState().setSpeed(0); G.getState().tick(0.1);
    return { during, after, handPaused: G.getState().game.clock.speed };
  });
  console.log('clock', JSON.stringify(r));
} finally {
  console.log('issues', issues.length);
  await browser.close(); vite.kill();
}
