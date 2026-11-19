// Dome page in a climate disaster (docs/design/climate_disasters.md PRs 4 and 5): heat year 3, ice age year 3, a damaged plant.
//   node scripts/climatePlantShots.mjs <outDir> [port=5997]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5997);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const sc of [
    { name: 'heat-year3', kind: 'runaway_heat', variant: 'humid_furnace', region: 'hill_country', years: 3.6, doy: 196, hour: 15.2, tier: 'glass', cells: 15, damage: false },
    { name: 'ice-year3', kind: 'ice_age', variant: 'dimmed_sun', region: 'north_woods', years: 3, doy: 20, hour: 14, tier: 'glass', cells: 15, damage: false, dark: true },
    { name: 'ice-year3-powered', kind: 'ice_age', variant: 'dimmed_sun', region: 'north_woods', years: 3, doy: 20, hour: 14, tier: 'glass', cells: 15, damage: false },
    { name: 'damaged-plant', kind: 'runaway_heat', variant: 'humid_furnace', region: 'hill_country', years: 3.6, doy: 196, hour: 15.2, tier: 'glass', cells: 15, damage: true },
  ].filter(sc => !process.env.ONLY || process.env.ONLY.split(',').includes(sc.name))) {
    const page = await browser.newPage({ viewport: { width: 1512, height: 940 } });
    page.setDefaultTimeout(900000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.5&layout=a&region=${sc.region}&acres=20&lotseed=8&relief=2`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
    const info = await page.evaluate(async sc => {
      const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0); G.getState().setWelcome?.(false);
      G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
      const kind = `dome_${sc.tier}_${sc.cells}`, sp = cb.tool.findSpot(kind, c.x - 4, c.z - 4, 0, 40) ?? [c.x - 4, c.z - 4];
      G.getState().plan(kind, sp[0], sp[1], 0);
      const dome = G.getState().game.structures.at(-1);
      if (!sc.dark) G.getState().plan('solar_array', sp[0] + 14, sp[1], 0);
      const st = await import('/src/sim/state.ts'), live = await import('/src/sim/dome/live.ts'), pl = await import('/src/sim/dome/plantLive.ts');
      G.setState(s => {
        const g = structuredClone(s.game);
        for (const x of g.structures) { x.stage = 99; x.done = 0; x.finishedAt = 0; x.supplied = true; }
        if (!sc.dark) g.utilities.fittings.push({ building: dome.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
        const ng = st.newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: sc.kind, variant: sc.variant, difficulty: 'standard' });
        g.disaster = ng.disaster; g.site.region = sc.region;
        g.clock.t = g.disaster.hitAt + 365 * sc.years; g.clock.t = Math.floor(g.clock.t) + sc.hour / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
        g.clock.startDoy = (((sc.doy - st.dayIndex(g.clock.t)) % 365) + 365) % 365 || 365;
        const d = live.domeOf(g);
        const ds = live.ownState(g, d); ds.filtering = 'closed'; ds.mode = 'temperate';
        if (sc.damage) pl.damagePlant(g, d, ds, 'chiller', 'damaged', 'heat');
        for (let i = 0; i < 12; i++) { g.clock.t += 0.25 / 24; live.stepDome(g, 0.25 / 24); }
        return { game: g };
      });
      cb.store.getState().setHudHidden?.(false);
      return { dome: dome.id };
    }, sc);
    await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 2500 }).catch(() => {});
    await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
    const chip = page.getByTestId('page-chip-dome'); if (await chip.count()) await chip.click();
    await page.mouse.move(700, 400); await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelector('[data-testid=dome-climate]')?.scrollIntoView({ block: 'start' }); let p = document.querySelector('[data-testid=dome-climate]')?.parentElement; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop -= 70; }); await page.waitForTimeout(500);
    await page.evaluate(() => window.__cb.qa.renderNow());
    console.error(sc.name, await page.evaluate(() => document.querySelector('[data-testid=dome-climate]')?.innerText.slice(0, 700)));
    await page.screenshot({ path: `${out}/${sc.name}.png` });
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
