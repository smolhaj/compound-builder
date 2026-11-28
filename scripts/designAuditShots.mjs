/**
 * Design-audit frame capture (docs/audits/DESIGN_AUDIT_2026-11.md). Drives a real new game through the charter, then
 * captures HUD, drawers, overlays and eye-level frames. Read-only on the game; writes PNGs to the out dir.
 *   AUDIT_SCRIPT=scripts/designAudit.partB.mjs flock /tmp/cb.lock node scripts/designAuditShots.mjs <outDir> [port] [part]
 * AUDIT_SCRIPT is an ES module run after the browser is up; it reads the helpers from globalThis.A
 * ({ page, shot, note, txt, port, shotWizard, out }). Part B: wizard, HUD, drawers, overlays, viewports. Part C: sightlines
 * with settle time, eye level, time of day, quality tiers, the first raid and the report card.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const [out = '/tmp/audit', portArg = '5981', part = 'a'] = process.argv.slice(2);
const port = Number(portArg);
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const note = s => { const l = `[${Math.round((Date.now() - t0) / 1000)}s] ${s}`; console.log(l); appendFileSync(`${out}/notes-${part}.txt`, l + '\n'); };
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
page.setDefaultTimeout(30000);
page.on('pageerror', e => note('PAGEERROR ' + e.message.slice(0, 200)));
let n = 0;
const shot = async (name, full = true) => {
  await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full).catch(() => {});
  const f = `${out}/${part}${String(++n).padStart(2, '0')}-${name}.png`;
  try { await page.screenshot({ path: f, timeout: 120000 }); note('shot ' + f); } catch (e) { note('shot failed ' + name); }
};
const txt = () => page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
const shotWizard = async tag => { await page.screenshot({ path: `${out}/${part}w-${tag}.png`, timeout: 120000 }).catch(() => {}); note('wizard ' + tag); };
globalThis.A = { page, shot, note, txt, out, port, shotWizard, browser, vite };
await import(new URL(process.env.AUDIT_SCRIPT, `file://${process.cwd()}/`).href);
await browser.close(); vite.kill();
