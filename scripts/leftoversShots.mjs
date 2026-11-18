// Playtest-3 leftovers, as the player sees them (layout A): the stake bill with the family ETA, the shelter bridge on the wait card and the Housing panel,
// a rich family's first week with a rental in effect, the Defense row's fence button, and the ritual photo prompt.
//   flock /tmp/cb.lock node scripts/leftoversShots.mjs <outDir> [port=5977]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5977);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
const click = async (name) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(350); };
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender&layout=a&region=pnw`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await click('Next'); await click('Next'); await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { const st = window.__cb.game.getState(); st.setSpeed(0); window.__cb.store.getState().setQuality('low'); st.setWelcome(false); const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.0; window.__cb.game.setState(s => ({ game: { ...s.game, money: 600000 } })); });
  await page.waitForTimeout(1200);
  await shot('00-start');
  // 1. the Build drawer: hover a house
  await page.getByTestId('bar-build').click(); await page.mouse.move(700, 500); await page.waitForTimeout(350);
  const chips = page.getByTestId('build-chips');
  console.log('chips', await chips.innerText());
  await chips.getByRole('button', { name: /House|Home|Shelter/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  const cards = page.locator('[data-testid="build-card"]');
  const n = await cards.count(); console.log('cards', n);
  for (let i = 0; i < n; i++) { const t = (await cards.nth(i).innerText()).toLowerCase(); if (/cabin|cottage|modular/.test(t)) { await cards.nth(i).hover(); await page.waitForTimeout(500); await shot(`01-stake-bill-eta-${i}`); break; } }
  // 2. stake a cottage next to the camp (the store's own plan action) and look at the wait card
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__cb.game.setState(s => ({ game: { ...s.game, structures: s.game.structures.filter(x => !x.pre) } })));
  const staked = await page.evaluate(() => { const st = window.__cb.game.getState(), c = window.__cb.world.camp; const sp = window.__cb.tool.findSpot('cottage', c.x + 6, c.z + 6, 0, 8); if (!sp) return 'nospot'; st.plan('cottage', sp[0], sp[1], 0); return JSON.stringify(sp); });
  console.log('staked', staked);
  await page.waitForTimeout(600);
  console.log(await page.evaluate(() => { const g = window.__cb.game.getState().game; return JSON.stringify({ structs: g.structures.map(s => [s.id, s.kind, s.permit, s.permitAt, s.pre, s.stage]), money: g.money, t: g.clock.t }); }));
  await shot('02-staked-wait-card');
  // 3. rent the motel (the card's first button), let a few days pass, and look at the people and the card
  await page.getByRole('button', { name: /^Motel rooms/ }).first().click(); await page.waitForTimeout(600);
  const confirm = page.getByRole('button', { name: /^(Spend|Confirm|Yes|Rent)/ }); if (await confirm.count()) { await confirm.first().click(); await page.waitForTimeout(400); }
  console.log(await page.evaluate(() => JSON.stringify(window.__cb.game.getState().game.rental ?? null)));
  await page.evaluate(() => window.__cb.game.getState().setSpeed(4)); await page.waitForTimeout(9000); await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  console.log(await page.evaluate(() => { const g = window.__cb.game.getState().game; return JSON.stringify({ t: g.clock.t, money: g.money, rental: g.rental }); }));
  await page.screenshot({ path: `${out}/zz-before-people.png` });
  await page.getByText('People', { exact: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(500);
  const tabs = await page.locator('[data-drawer] button').allInnerTexts(); console.log('drawer buttons', JSON.stringify(tabs.slice(0, 20)));
  const home = page.locator('[data-drawer]').getByRole('button', { name: /^(Home|Housing|Beds)/ }).first(); if (await home.count()) { await home.click(); await page.waitForTimeout(500); }
  await shot('03-week1-rental-people');
  // 4. the ritual photo prompt: a calm table at dusk (18:00), a streak of four dinners
  await page.mouse.move(700, 700);
  await page.evaluate(() => window.__cb.game.setState(s => ({ game: { ...s.game, clock: { ...s.game.clock, t: Math.floor(s.game.clock.t) + 0.5 }, stock: { ...s.game.stock, staples: 300, canned: 200 }, rituals: { calm: 1, hourMark: -1, level: 1, today: {}, score: {}, day: -1, told: [], storyYear: -1, storyCount: 0, breaks: 0, streak: 4 } } })));
  await page.getByRole('button', { name: 'OK', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.locator('[data-drawer]').getByRole('button', { name: 'People', exact: true }).first().click().catch(() => {}); await page.mouse.move(700, 700); await page.waitForTimeout(800);
  console.log('ritual-photo', await page.getByTestId('ritual-photo').count());
  await shot('04-ritual-photo-prompt');
  // 5. the Defense row of the checklist: the Build drawer's chips and the fence button
  await page.getByTestId('bar-build').click(); await page.mouse.move(700, 700); await page.waitForTimeout(400);
  await page.locator('[data-drawer]').getByRole('button', { name: /Defense/ }).first().hover(); await page.waitForTimeout(600);
  await shot('05-build-defense-row');
} finally { await browser.close(); vite.kill(); }
