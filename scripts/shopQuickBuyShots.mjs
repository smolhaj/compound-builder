/**
 * Shop quick-buy through the real HUD (sim/shopQuickBuy.ts): the new controls on three tabs at 1280x800 and at a phone width, and a before/after of an order
 * placed through "Add everything I'm missing" (pressing it twice adds nothing; nothing is bought twice).
 *   node scripts/shopQuickBuyShots.mjs --out shots/shopquickbuy [--port 5343]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5343)), out = resolve(opt('--out', 'shots/shopquickbuy'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
let bad = 0;
page.on('pageerror', e => { bad++; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') { bad++; console.log('CONSOLE ERROR', m.text().slice(0, 200)); } });
let n = 0;
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
const openShop = async tab => { await page.evaluate(() => window.__cb.game.getState().openShop(false)); await page.waitForTimeout(250); await page.evaluate(t => window.__cb.game.getState().openShop(true, t), tab); await page.waitForTimeout(500); };
/** The shop's box must sit inside the viewport and nothing in it may scroll sideways (clamped and scrolling-by-design boxes excluded). */
const overflow = async label => {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight, root = document.querySelector('[style*="z-index: 11"]'), box = root.firstElementChild.getBoundingClientRect();
    const inside = box.left >= -1 && box.top >= -1 && box.right <= vw + 1 && box.bottom <= vh + 1;
    const hscroll = [...root.querySelectorAll('*')].filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2 && !['hidden', 'auto', 'scroll'].includes(getComputedStyle(e).overflowX)).map(e => (e.textContent || '').slice(0, 30));
    return { inside, box: [Math.round(box.left), Math.round(box.top), Math.round(box.right), Math.round(box.bottom)], hscroll };
  });
  console.log('overflow', label, JSON.stringify(r)); if (!r.inside || r.hscroll.length) bad++;
};
const cartLines = () => page.evaluate(() => [...document.querySelectorAll('div')].filter(e => /^\d+ × /.test(e.firstElementChild?.textContent ?? '') && e.children.length === 2).map(e => e.firstElementChild.textContent));
const owned = () => page.evaluate(() => { const g = window.__cb.game.getState().game; const on = {}; for (const o of g.orders) if (o.status === 'ordered') for (const l of o.lines) on[l.material] = (on[l.material] ?? 0) + l.qty; return { stock: { ...g.stock }, on, money: g.money }; });
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
  // a family with some cash and a few things already owned, so "Owned" badges and shortfalls both show
  await page.evaluate(() => {
    const G = window.__cb.game, g = G.getState().game;
    g.money = 400000; g.stock.gun_safe = 1; g.stock.sleeping_bag = 2;
    G.setState({ game: { ...g } });
  });
  await page.waitForTimeout(400);

  // 1280x800: three tabs with the controls
  for (const tab of ['household', 'defense', 'food']) { await openShop(tab); await shot(`desktop-${tab}`); await overflow('desktop-' + tab); }
  await openShop('fuel'); await shot('desktop-fuel-owned-safe');
  await page.getByLabel('Show missing only').check(); await page.waitForTimeout(300); await shot('desktop-fuel-missing-only'); await overflow('desktop-fuel-missing');

  // before / after: Add everything I'm missing on the Medical & household tab, twice, then place the order
  await openShop('household');
  const before = await owned(); await shot('flow-1-before');
  await page.getByRole('button', { name: /Add everything I'm missing/ }).click(); await page.waitForTimeout(300);
  const once = await cartLines(); await shot('flow-2-added-once');
  const btn = page.getByRole('button', { name: /Add everything I'm missing|Nothing missing here/ });
  console.log('button after first press:', await btn.innerText());
  await btn.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
  const twice = await cartLines();
  console.log('cart lines once', once.length, 'twice', twice.length, JSON.stringify(once) === JSON.stringify(twice) ? 'IDENTICAL (idempotent)' : 'DIFFERENT'); if (JSON.stringify(once) !== JSON.stringify(twice)) bad++;
  await shot('flow-3-pressed-twice');
  await page.getByRole('button', { name: 'Place the order' }).click(); await page.waitForTimeout(500);
  if (await page.getByRole('button', { name: 'Do it anyway' }).count()) { console.log('spend guard asked (kept): confirming'); await page.getByRole('button', { name: 'Do it anyway' }).click(); await page.waitForTimeout(400); }
  const after = await owned(); await shot('flow-4-after-order');
  const ordered = Object.entries(after.on).filter(([, q]) => q > 0).map(([m, q]) => `${m}:${q}`);
  console.log('on order after:', ordered.join(' '), 'money', before.money, '->', after.money);
  const single = ['clinic_suite', 'gun_safe', 'medical_books'];
  for (const m of single) { const total = Math.floor(after.stock[m] ?? 0) + (after.on[m] ?? 0); console.log('single', m, total); if (total > 1) bad++; }
  // every tab again: nothing more to add for the household tab; pressing the (now disabled) button changes nothing
  console.log('button now:', await page.getByRole('button', { name: /Add everything I'm missing|Nothing missing here/ }).first().innerText());
  await shot('flow-5-nothing-more');

  // phone width
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  for (const tab of ['household', 'defense', 'food']) { await openShop(tab); await shot(`phone-${tab}`); await overflow('phone-' + tab); }
} finally { await browser.close(); vite.kill(); }
if (bad) { console.log('PROBLEMS', bad); process.exitCode = 1; }
