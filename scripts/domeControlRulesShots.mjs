// Arcology control block RULES shots: the block at several port angles (the dome's own frame, degrees; the formerly failing ones included), the placement rejection message,
// a struck block (smoke and flames), and the plant panel with the lockdown refusal. HIGH quality.
//   PORTS=4,79,94,139,304 flock /tmp/cb.lock node scripts/domeControlRulesShots.mjs <outDir> [vitePort]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5996);
const PORTS = (process.env.PORTS || '4,79,94,139,304').split(',').map(Number), KIND = 'dome_arcology';
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  for (const [i, deg] of PORTS.entries()) {
    const PFX = `port${String(deg).padStart(3, '0')}-`, first = i === 0;
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.setDefaultTimeout(900000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=mountain_west&acres=40&relief=0&lotseed=8`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
    await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
    const frames = async (n = 1) => { for (let k = 0; k < n; k++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
    const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${PFX}${name}.png` }); lap(PFX + name); };
    const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
    const info = await page.evaluate(async ([KIND, deg]) => {
      const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
      G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
      const y = w.access.yard;
      const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, 0, 14);
      if (!sp) return null;
      G.getState().plan(KIND, sp[0], sp[1], 0);
      const st = G.getState().game.structures.at(-1);
      G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; if (q.id === st.id) { q.portAngle = deg * Math.PI / 180; q.id = st.id + 'p'; } } return { game: g }; });   // (a new id: the world rebuilds the dome at the stamped angle, as a dome planned there would be)
      { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const ref = live.domeOf(g, st.id); if (ref) { const o = live.ownState(g, ref); o.dust = 0; o.co2ppm = 500; } return { game: g }; }); }
      cb.store.getState().setHudHidden?.(true);
      return { id: st.id + 'p', x: st.x, z: st.z };
    }, [KIND, deg]);
    if (!info) { console.error('no spot'); await page.close(); continue; }
    await frames(4);
    await set(`const s = cb.store.getState(); s.setTimeOfDay(15.5); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
    const cbp = await page.evaluate(id => { const w = window.__cb.world; const c = w._interiorCache.get(id)?.plan.control; return c ? { cx: c.cx, cz: c.cz, angle: c.angle, between: c.between, w: c.w, yardDoor: c.yardDoor, gateDoor: c.gateDoor } : null; }, info.id);
    if (!cbp) { console.error('no control block plan'); await page.close(); continue; }
    lap(JSON.stringify({ deg, ...cbp }));
    const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
    const pose = async (e, l, fov = 58) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
    const y0 = await gd(info.x, info.z), R = 9, bx = info.x + cbp.cx, bz = info.z + cbp.cz, yd = [info.x + cbp.yardDoor[0], info.z + cbp.yardDoor[1]], ga = [info.x + cbp.gateDoor[0], info.z + cbp.gateDoor[1]];
    // 1 every port: from inside, over the floor toward the block (its yard-side wing, the entrance and the footpaths in view)
    { const k = 0.3, e = [info.x + cbp.cx * k, y0 + 0.5, info.z + cbp.cz * k]; await pose(e, [bx, y0 + 0.3, bz], 66); await shot('inside-toward-block'); }
    // 1b close in front of the block (3 units out), eye level
    { const d = Math.hypot(cbp.cx, cbp.cz), k = (d - 3.4) / d, e = [info.x + cbp.cx * k, y0 + 0.3, info.z + cbp.cz * k]; await pose(e, [bx, y0 + 0.28, bz], 62); await shot('close-front-of-block'); }
    // 2 a high oblique from the middle of the floor, the block and both airlocks together
    { const k = 0.1, e = [info.x + cbp.cx * k, y0 + 3.2, info.z + cbp.cz * k]; await pose(e, [bx * 0.6 + info.x * 0.4, y0 + 0.2, bz * 0.6 + info.z * 0.4], 70); await shot('oblique-block-and-airlocks'); }
    if (first) {
      // 3 the placement rejection: an outhouse ghost on the block, then on the entrance path (the message shows top left with the HUD hidden)
      await set(`cb.store.getState().setHudHidden?.(false)`);
      await pose([bx - (bx - info.x) * 0.5, y0 + 2.6, bz - (bz - info.z) * 0.5], [bx, y0, bz], 66);
      await page.evaluate(([x, z]) => { const cb = window.__cb; cb.tool.setKind('outhouse'); cb.tool.hoverAt(x, z); }, [bx, bz]);
      await shot('reject-on-block');
      const mid = [(yd[0] + bx) / 2, (yd[1] + bz) / 2];
      await page.evaluate(([x, z]) => { window.__cb.tool.hoverAt(x, z); }, [(ga[0] * 0.55 + bx * 0.45), (ga[1] * 0.55 + bz * 0.45)]);
      await shot('reject-on-path'); void mid;
      await page.evaluate(([x, z]) => { window.__cb.tool.hoverAt(x, z); }, [info.x, info.z]);
      await shot('allowed-open-floor');
      await page.evaluate(() => window.__cb.tool.setKind(null));
      // 4 a struck block: down, burning and smoking at its place; the lockdown is refused
      const msg = await page.evaluate(async id => {
        const live = await import('/src/sim/dome/live.ts'), pl = await import('/src/sim/dome/plantLive.ts'), cb = window.__cb;
        let m = null;
        cb.game.setState(s => { const g = structuredClone(s.game); const ref = live.domeOf(g, id), st = live.stateOf(g, ref); pl.damagePlant(g, ref, st, 'control', 'down', 'raid'); m = live.setLockdown(g, true, id); return { game: g }; });
        return m;
      }, info.id);
      lap('lockdown refusal: ' + msg);
      await set(`cb.store.getState().setHudHidden?.(true)`);
      await frames(4);
      await pose([info.x + cbp.cx * 0.3, y0 + 0.5, info.z + cbp.cz * 0.3], [bx, y0 + 0.3, bz], 66); await shot('struck-block-burning');
      await pose([info.x + cbp.cx * 0.1, y0 + 3.2, info.z + cbp.cz * 0.1], [bx * 0.6 + info.x * 0.4, y0 + 0.2, bz * 0.6 + info.z * 0.4], 70); await shot('struck-block-oblique');
      // 5 the plant panel with the block's row and the refusal (HUD visible)
      await set(`cb.store.getState().setHudHidden?.(false)`);
      await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
      const chip = page.getByTestId('page-chip-dome'); if (await chip.count()) await chip.click();
      await page.waitForTimeout(500);
      await page.evaluate(() => (document.querySelector('[data-testid=plant-unit-control]') || document.querySelector('[data-testid=plant-units]'))?.scrollIntoView({ block: 'center' })); await page.waitForTimeout(500);
      await page.mouse.move(700, 300);
      await page.screenshot({ path: `${out}/${PFX}plant-panel-control-down.png` }); lap('panel');
    }
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
