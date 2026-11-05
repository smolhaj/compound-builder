/**
 * Money sinks through the real HUD (sim/richSinks.ts): the shop cards for the clinic suite (Medical & household), the radio mast and the gate house (Kit & security),
 * the Land panel with a neutral neighbor's cash offer, and the Defense tab with the gate house fitted.
 *   node scripts/moneySinksShots.mjs --out shots/moneysinks [--port 5342]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5342)), out = resolve(opt('--out', 'shots/moneysinks'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR', m.text().slice(0, 200)); });
let n = 0;
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(500); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
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
  await page.evaluate(() => window.__cb.game.getState().openShop(true, 'household'));
  await page.waitForTimeout(600); await shot('shop-medical');
  await page.evaluate(() => window.__cb.game.getState().openShop(true, 'defense'));
  await page.waitForTimeout(600); await shot('shop-kit-security');
  await page.evaluate(() => window.__cb.game.getState().openShop(false));
  // fit the gate house and the clinic, make the west neighbor neutral
  await page.evaluate(() => {
    const G = window.__cb.game, g = G.getState().game;
    g.stock.gate_house = 1; g.stock.clinic_suite = 1; g.stock.radio_mast = 1; g.money = 900000;
    for (const p of g.land.parcels) { const nb = g.neighbors.find(x => x.id === p.owner); if (nb) { nb.status = 'home'; nb.disposition = 5; p.forSale = false; } }
    G.setState({ game: { ...g } });
  });
  await page.waitForTimeout(500);
  const tabs = await page.getByRole('button').allInnerTexts();
  console.log('buttons', JSON.stringify(tabs.slice(0, 40)));
  for (const name of [/^Land/, /^Place/, /^Property/, /^Defense/]) { const b = page.getByRole('button', { name }).first(); if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(500); await shot('tab-' + String(name).replace(/\W/g, '')); } }
} finally { await browser.close(); vite.kill(); }
