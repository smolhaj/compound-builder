// Dome bunker cards (docs/ux/dome-bunker): the placing card (with the dome, and after it), the Dome page section, the Projects row, and the Cutaway window.
//   node scripts/domeBunkerCards.mjs <outDir> [tier=glass] [port=5994]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'glass', port = Number(process.argv[4] || 5994), cells = tier === 'arcology' ? 36 : tier === 'glass' ? 15 : 7;
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.75&layout=a&region=mountain_west&acres=20&lotseed=8&relief=2`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const shot = async (name) => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); await page.evaluate(() => window.__cb.qa.renderNow()); await page.screenshot({ path: `${out}/${tier}-${name}.png` }); console.error(name); };
  const info = await page.evaluate(async ([tier, cells]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0); G.getState().setWelcome?.(false);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const kind = `dome_${tier}_${cells}`, sp = cb.tool.findSpot(kind, c.x - 4, c.z - 4, 0, 40) ?? [c.x - 4, c.z - 4];
    G.getState().plan(kind, sp[0], sp[1], 0);
    const dome = G.getState().game.structures.at(-1), bk = await import('/src/sim/dome/bunkerLive.ts');
    const hx = Math.round(sp[0] * 4) / 4 - 1.5, hz = Math.round(sp[1] * 4) / 4 - 1.25;
    const pieces = [['bunker_hatch', hx, hz], ['bunker_dorm', hx + 0.75, hz + 0.25], ['bunker_galley', hx + 1.75, hz + 0.25]];
    for (const [k, x, z] of pieces) {
      G.getState().plan(k, x, z, 0);
      const st = G.getState().game.structures.at(-1);
      G.setState(s => { const g = structuredClone(s.game), p = g.structures.find(q => q.id === st.id); bk.stampUnderDome(g, p, { dome: dome.id, floorFt: 17 }, true); return { game: g }; });
    }
    return { dome: dome.id, x: dome.x, z: dome.z, hx, hz, ids: G.getState().game.structures.filter(s => s.underDome).map(s => s.id) };
  }, [tier, cells]);
  const setP = (P, pp, fin) => page.evaluate(async ([d, ids, P, pp, fin]) => {
    const cb = window.__cb, con = await import('/src/sim/construction.ts');
    cb.game.setState(s => { const g = structuredClone(s.game);
      const apply = (st, f) => { const bp = con.blueprintOf(st).stages, total = bp.reduce((a, x) => a + x.hours, 0);
        if (f >= 1) { st.stage = bp.length; st.done = 0; st.finishedAt = 0; } else { let left = f * total, i = 0; while (i < bp.length - 1 && left >= bp[i].hours) { left -= bp[i].hours; i++; } st.stage = i; st.done = left; st.finishedAt = undefined; } st.supplied = true; };
      apply(g.structures.find(x => x.id === d), P); for (const id of ids) apply(g.structures.find(x => x.id === id), fin ? 1 : pp);
      return { game: g }; });
    cb.world.syncProgress(cb.game.getState().game.structures);
  }, [info.dome, info.ids, P, pp, fin]);
  const hover = async (kind, x, z) => { await page.evaluate(async ([kind, x, z]) => { const cb = window.__cb; const sp = [x, z]; cb.cam.target.set(sp[0], 0, sp[1]); cb.cam.radius = 26; cb.cam.pitch = 0.95; cb.tool.setKind(kind); cb.tool.hoverAt(sp[0], sp[1]); }, [kind, x, z]); await page.waitForTimeout(700); };
  const ok = () => page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 2500 }).catch(() => {});
  await ok();
  // 1 with the dome: the crater open (the dome's dig stage), a room to add beside the others
  await setP(0.4, 0.2, false);
  await hover('bunker_galley', info.hx + 1.75, info.hz + 1.25); await shot('placing-card-with-dome');
  // 2 Projects row: the dome selected
  await page.evaluate(id => { const s = window.__cb.game.getState(); s.select?.(id); }, info.dome);
  await page.getByRole('button', { name: /Projects/ }).first().click({ timeout: 6000 }).catch(e => console.error('no Projects button'));
  await page.waitForTimeout(600); await shot('projects-bunker-shell');
  // 3 after the dome: the crater closed
  await setP(1, 1, true);
  await page.evaluate(() => { window.__cb.game.getState().select?.(null); window.__cb.tool.setKind(null); });
  await hover('bunker_stores', info.hx + 0.75, info.hz + 1.25); await shot('placing-card-after-dome');
  await page.evaluate(() => window.__cb.tool.setKind(null)); await page.waitForTimeout(300);
  // 4 the Dome page
  await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
  const chip = page.getByTestId('page-chip-dome'); if (await chip.count()) await chip.click();
  await page.mouse.move(700, 400); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-testid=dome-bunker-rows]')?.scrollIntoView({ block: 'center' })); await page.waitForTimeout(500);
  await shot('dome-panel-bunker');
  // 5 the Cutaway window (diagnostic: the covered rooms and the pits)
  await page.evaluate(() => window.__cb.store.getState().setHudHidden?.(true));
  const diag = await page.evaluate(([x, z]) => { const cb = window.__cb; cb.store.getState().setBuildingView('cutaway'); const w = cb.world; return { covered: w._coveredIds.size, pits: w.parcel.pits.length, view: w._view }; }, [info.x, info.z]);
  console.error('DIAG', JSON.stringify(diag));
  await page.evaluate(([x, z]) => { const cb = window.__cb; cb.cam.target.set(x - 1, 0, z); cb.cam.radius = 14; cb.cam.pitch = 1.0; }, [info.x, info.z]);
  await page.waitForTimeout(500); await shot('cutaway-window');
  await page.close();
} finally { await browser.close(); vite.kill(); }
