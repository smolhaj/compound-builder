// Interrogation conversation: puts a prisoner in the gate state, opens the Hud's Outside tab and asks the questions through the real buttons, one screenshot after each.
//   node scripts/aftermathPrisonerShots.mjs --out /tmp/claude-0/prisoner [--port 6071]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 6071)), outDir = resolve(opt('--out', '/tmp/claude-0/prisoner'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite exited ' + c))); });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: Number(opt('--w', 1280)), height: Number(opt('--h', 800)) }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  await page.evaluate(() => {
    const G = window.__cb.game;
    G.setState(s => { const g = structuredClone(s.game); g.gate.prisoners = [{ id: 'p1', name: 'Dale Reyes', since: Math.floor(g.clock.t) - 2, sev: 20, talked: false, trust: 30, asked: [] }]; g.gate.humanity = 60; return { game: g }; });
    G.getState().focusHud?.({ right: 'outside' });
  });
  await page.getByRole('button', { name: 'Who sent you?' }).waitFor();
  const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${outDir}/${n}.png`, clip: { x: 940, y: 56, width: 340, height: 560 } }); console.log('shot', n); };
  await shot('0_prisoner');
  await page.getByRole('button', { name: 'Who sent you?' }).click(); await shot('1_kind_who_sent');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Where is the loot?' }).click(); await shot('2_harsh_stash');
  await page.getByRole('button', { name: 'Who is coming next?' }).click(); await shot('3_harsh_next');
  console.log('DONE');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
