// The pricing follow-ups through the real HUD: the New Game rich starts (real dome prices), the placing card's permit line, the Dome panel running cost
// (paid up, then behind), and the Shop's replacement-panel goods (a repair is billed by the 100 sq ft).
//   flock /tmp/cb.lock node scripts/pricingFollowupShots.mjs <outDir> [port=5994]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const out = process.argv[2] || 'shots/pricing2', port = Number(process.argv[3] || 5994), only = process.argv[4] || '';   // only='dome' skips the New Game and placing-card frames
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  if (only !== 'dome') {
  // 1. the New Game card
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.getByRole('button', { name: /2\. /, exact: false }).first().click();
  await page.getByTestId('rich-starts').scrollIntoViewIfNeeded();
  await page.getByTestId('rich-start-founder').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/01-new-game-founder.png` }); console.error('01');
  await page.getByTestId('rich-start-magnate').click();
  await page.getByTestId('rich-starts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/02-new-game-magnate.png` }); console.error('02');
  }
  // 2. in a game: the placing card
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.75&layout=a&region=mountain_west&acres=40&lotseed=8&relief=8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); await page.evaluate(() => window.__cb.qa.renderNow()); await page.screenshot({ path: `${out}/${name}.png` }); console.error(name); };
  const info = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0); G.getState().setWelcome?.(false);
    G.setState(s => ({ game: { ...s.game, money: 200_000_000 } }));
    const sp = cb.tool.findSpot('dome_glass_15', c.x - 6, c.z - 6, 0, 40) ?? [c.x - 6, c.z - 6];
    const cam = cb.cam; cam.target.set(sp[0], 0, sp[1]); cam.radius = 30; cam.pitch = 0.9;
    cb.tool.setKind('dome_glass'); G.getState().setDomeCells('glass', 15); cb.tool.hoverAt(sp[0], sp[1]);
    return { sp };
  });
  await page.waitForTimeout(600);
  if (only !== 'dome') {
  await shot('03-placing-card-glass-150');
  console.error(await page.evaluate(() => document.querySelector('[data-testid=dome-size-card]')?.textContent));
  await page.evaluate(() => { const G = window.__cb.game; G.getState().setDomeCells('glass', 24); window.__cb.tool.hoverAt(...[window.__cb.world.camp.x - 6, window.__cb.world.camp.z - 6]); });
  await page.waitForTimeout(400);
  await shot('04-placing-card-glass-240');
  }
  // 3. a finished glass dome and the Dome panel
  await page.evaluate(() => { window.__cb.tool.setKind(null); });
  const dome = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('dome_glass_15', c.x - 1, c.z - 1, 0, 40); if (!sp) return null;
    G.getState().plan('dome_glass_15', sp[0], sp[1], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } const d = g.structures.at(-1); g.utilities.fittings.push({ building: d.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 }); return { game: g }; });
    return { x: sp[0], z: sp[1] };
  });
  console.error('dome', JSON.stringify(dome));
  await page.evaluate(([x, z]) => { const cam = window.__cb.cam; cam.target.set(x, 0, z); cam.radius = 30; cam.pitch = 0.8; window.__cb.game.getState().focusHud({ right: 'utilities' }); }, [dome.x, dome.z]);
  await page.waitForTimeout(500);
  const chip = page.getByTestId('page-chip-dome'); if (await chip.count()) await chip.click();
  await page.mouse.move(700, 450); await page.waitForTimeout(400);
  await shot('05-dome-panel-running-cost');
  console.error(await page.evaluate(() => document.querySelector('[data-testid=dome-running-cost]')?.textContent));
  // behind on upkeep: 20 days owed and little cash
  await page.evaluate(async () => { const L = await import('/src/sim/dome/live.ts'); window.__cb.game.setState(s => { const g = structuredClone(s.game); g.money = 40_000; const id = g.structures.at(-1).id; (g.domes ??= {}); const st = g.domes[id] ?? g.dome ?? L.newDomeState(); st.id = id; st.upkeepOwed = Math.round(20 * 823_000 / 365); g.domes[id] = st; g.dome = st; return { game: g }; }); });
  await page.waitForTimeout(500);
  await shot('06-dome-panel-behind');
  console.error(await page.evaluate(() => document.querySelector('[data-testid=dome-running-cost]')?.textContent));
  // 4. the Shop's replacement panels
  await page.evaluate(() => { window.__cb.game.getState().openShop(true, 'enclosure'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/07-shop-replacement-panels.png` }); console.error('07');
} finally { await browser.close(); vite.kill(); }
