// Farm tab screenshots (HUD included) with ?lowrender:  flock <lock> node scripts/farmTabShots.mjs <outDir> [port=5992] [herd]
//   builds the farm-kitchen compound (shotSets farmkitchen / farmherd), fills the pantry, and walks the Farm tab's sub-tabs.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5992), herd = process.argv[4] === 'herd';
mkdirSync(out, { recursive: true });
const { SETS } = await import('./shotSets.mjs');
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
  const kitchen = SETS.farmkitchen[0], hd = SETS.farmherd?.[0];
  for (const st of [kitchen, ...(herd && hd ? [hd] : [])]) {
    await page.evaluate(s => { const st = window.__cb.store.getState(); st.setTimeOfDay(s.time ?? 10); new Function('cb', s.setup)(window.__cb); }, st);
    await page.evaluate(async () => { await window.__cb.qa.renderNow(); await window.__cb.qa.renderNow(); });
    await page.evaluate(s => new Function('cb', s.setup)(window.__cb), st);
  }
  // a state the panel can show: seed, a cow and goats, bees, taps, the region's maples
  await page.evaluate(herdOn => {
    const G = window.__cb.game;
    G.setState(s => { const g = structuredClone(s.game);
      g.clock.startDoy = 235; g.clock.t = 0.3;
      if (herdOn) {
        g.stock.cow = 1; g.stock.goat = 4; g.stock.pig = 2; g.stock.hay = 90; g.stock.feed = 20; g.stock.cheese_kit = 1; g.stock.vet_kit = 2; g.stock.bee_nuc = 1; g.stock.hive_supplies = 1; g.stock.maple_taps = 4;
        g.site.region = 'new_england';
        const ap = g.structures.find(x => x.kind === 'apiary');
        g.farm = { ...(g.farm ?? { greenhouses: {}, orchards: {}, ponds: {}, yard: {} }), apiaries: ap ? { [ap.id]: { colonies: 3, strength: 0.85, stores: 62, surplus: 34, mites: 0.22, treated: -1, taken: -1, checked: -1, honeyYear: 0, lostWinter: 1, year: 0 } } : {} };
        g.livestock = { condition: { goat: 0.95, pig: 1, steer: 1, rabbit: 1, sheep: 1, cow: 0.9 }, butchered: -1, steerSince: null, litterAt: -1 };
        g.farm.herd = { sick: { goat: 1 }, pasture: 0.9, kidded: -1, calved: -1, meatKids: 2, born: 3, vetAt: -99, year: 0, milk: 250000, butterLb: 24, cheeseLb: 31, butchered: 0, deaths: 0 };
      }
      return { game: g }; });
  }, herd);
  // the Farm is a sub-tab of Supplies now
  await page.getByText('Supplies', { exact: true }).first().click();
  await page.getByText('Farm', { exact: true }).first().click();
  const tabs = herd ? ['Season', 'Animals'] : ['Season', 'Fields', 'Kitchen', 'Food plan'];
  let n = 0;
  for (const t of tabs) {
    await page.getByRole('button', { name: t, exact: true }).first().click();
    await page.evaluate(async () => { await window.__cb.qa.renderNow(); });
    await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-farm-${t.toLowerCase().replace(' ', '-')}.png` });
    const info = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().right > innerWidth - 20 && d.innerText.includes('Family'));
      const over = [...panel.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto' && e.clientWidth > 0).map(e => (e.innerText || '').slice(0, 60));
      const dis = [...panel.querySelectorAll('button')].filter(b => b.disabled).map(b => (b.innerText || '').trim().slice(0, 40) + ' :: ' + (b.title || '').slice(0, 80));
      return { text: panel.innerText.slice(0, 4000), over, dis };
    });
    console.log('=== ' + t + ' over:', JSON.stringify(info.over), 'disabled:', JSON.stringify(info.dis));
    console.log(info.text);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
