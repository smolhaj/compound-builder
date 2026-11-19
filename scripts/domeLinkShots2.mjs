// Dome link shots, sealed shell walkways (docs/ux/dome-links): arcology-to-glass and glass-to-glass walkways.
//   node scripts/domeLinkShots.mjs <outDir> [port] [only=comma,names]      PANEL=1 adds the Dome panel with the HUD.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5994), only = process.argv[4] ? process.argv[4].split(',') : null;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900), PR = process.env.PR || '0.9';
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const want = n => !only || only.includes(n);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7${process.env.PANEL ? '&layout=a' : '&clean'}&lowrender=${PR}&region=${process.env.REGION ?? 'mountain_west'}&acres=40&relief=0&lotseed=${process.env.LOTSEED ?? 8}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(250); };
  const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const info = await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const put = (kind, x, z, r = 4) => { const sp = cb.tool.findSpot(kind, x, z, 0, r); if (!sp) return null; G.getState().plan(kind, sp[0], sp[1], 0); return { id: G.getState().game.structures.at(-1).id, x: sp[0], z: sp[1], kind }; };
    const slope = (x0, z0, x1, z1) => { let m = 0; const n = 12; for (let k = 0; k < n; k++) { const a = cb.world.groundAt(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n), b = cb.world.groundAt(x0 + (x1 - x0) * (k + 1) / n, z0 + (z1 - z0) * (k + 1) / n); m = Math.max(m, Math.abs(b - a) / (Math.hypot(x1 - x0, z1 - z0) / n)); } return m; };
    const flat = (fromId, cx, cz) => { let best = null; for (let dx = 12; dx <= 19; dx += 1) for (let dz = -10; dz <= 10; dz += 2) for (const sx of [1, -1]) { const s = slope(cx, cz, cx + sx * dx, cz + dz); if (!best || s < best.s) best = { s, x: cx + sx * dx, z: cz + dz }; } return best; };
    const gb = put('dome_glass_18', c.x + 0, c.z + 1, 3), fa = flat(null, gb.x, gb.z), ga = put('dome_glass_18', fa.x, fa.z, 2);
    const fr = flat(null, gb.x, gb.z), arc = put('dome_arcology_30', gb.x + (fa.x > gb.x ? -17 : 17), gb.z, 3);
    const domes = { arc, gb, ga };
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    const live = await import('/src/sim/dome/live.ts');
    G.setState(s => { const g = structuredClone(s.game);
      for (const d of Object.values(domes)) { if (!d) continue; const ref = live.domeOf(g, d.id); if (!ref) continue; const o = live.ownState(g, ref); o.filtering = 'advanced'; o.loop = 'recycle'; g.utilities.fittings.push({ building: d.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 }); }
      return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    return { domes, camp: [c.x, c.z] };
  });
  lap(JSON.stringify(info));
  const { arc, gb, ga } = info.domes; if (!arc || !gb || !ga) throw new Error('missing domes');
  const LK = '/src/sim/dome/links.ts';
  const order = (a, b, kind) => page.evaluate(async ([a, b, kind, LK]) => { const m = await import(LK), G = window.__cb.game; let why = null; G.setState(s => { const g = structuredClone(s.game); why = m.orderLink(g, a, b, kind); return { game: g }; }); return why; }, [a, b, kind, LK]);
  const finishAll = () => page.evaluate(() => { const G = window.__cb.game; G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; }); });
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const poseRaw = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const pose = async (e, l, fov = 55) => poseRaw([e[0], (await gd(e[0], e[2])) + e[1], e[2]], [l[0], (await gd(l[0], l[2])) + l[1], l[2]], fov);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(16.6); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  console.error('arc-gb', await order(arc.id, gb.id, 'walkway')); if (!process.env.PANEL) console.error('gb-ga', await order(gb.id, ga.id, 'walkway'));
  await finishAll(); await frames(4);
  const geom = async (id1, id2) => page.evaluate(async ([a, b]) => { const g = window.__cb.game.getState().game, l = g.domeLinks.find(x => x.kind === 'walkway' && ((x.ends[0].id === a && x.ends[1].id === b) || (x.ends[0].id === b && x.ends[1].id === a))); return { a: [l.ends[0].x, l.ends[0].z], b: [l.ends[1].x, l.ends[1].z] }; }, [id1, id2]);
  const frame = g => { const d = [g.b[0] - g.a[0], g.b[1] - g.a[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L]; return { u, s: [-u[1], u[0]], m: [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2], L }; };
  const GG = process.env.PANEL ? null : frame(await geom(gb.id, ga.id)), AG = frame(await geom(arc.id, gb.id));
  const gmG = GG ? await gd(GG.m[0], GG.m[1]) : 0, gmA = await gd(AG.m[0], AG.m[1]);
  if (want('glass')) { await pose([GG.m[0] + GG.s[0] * 2, gmG + 7, GG.m[1] + GG.s[1] * 20], [GG.m[0], gmG + 0.6, GG.m[1]], 52); await shot('aerial-glass-to-glass-walkway'); }
  if (want('arc')) { await pose([AG.m[0] + AG.s[0] * 2, gmA + 9, AG.m[1] + AG.s[1] * 24], [AG.m[0], gmA + 0.8, AG.m[1]], 52); await shot('aerial-arcology-to-glass-walkway'); }
  if (want('eye')) {
    const DECK = 0.085, personAt = async (x, z, dy) => page.evaluate(async ([x, z, dy]) => { const m = await import('/src/game/HomesteadWorld.ts'); window.__cb.ws.scene.add(m.scaleFigure(x, z, window.__cb.world.groundAt(x, z) + dy)); }, [x, z, dy]);
    await personAt(GG.m[0] + GG.u[0] * 1.2, GG.m[1] + GG.u[1] * 1.2, DECK); await personAt(GG.m[0] + GG.u[0] * 2.6, GG.m[1] + GG.u[1] * 2.6, DECK);
    await poseRaw([GG.m[0] - GG.u[0] * 2.0, gmG + DECK + 0.24, GG.m[1] - GG.u[1] * 2.0], [GG.m[0] + GG.u[0] * 6, gmG + DECK + 0.2, GG.m[1] + GG.u[1] * 6], 66); await shot('eye-person-inside-glass-walkway');
    await personAt(AG.m[0] - AG.s[0] * 1.7, AG.m[1] - AG.s[1] * 1.7, 0);
    await poseRaw([AG.m[0] - AG.s[0] * 4.2 - AG.u[0] * 1.6, gmA + 0.42, AG.m[1] - AG.s[1] * 4.2 - AG.u[1] * 1.6], [AG.m[0] + AG.u[0] * 0.4, gmA + 0.4, AG.m[1] + AG.u[1] * 0.4], 60); await shot('eye-outside-arcology-walkway-with-person');
  }
  if (want('airlock')) {
    const al = await page.evaluate(async ([id, lk]) => { const sd = await import('/src/sim/dome/standing.ts'), g = window.__cb.game.getState().game, d = sd.domesOf(g).find(x => x.id === id); const a = d.airlocks.find(x => x.role === 'link'); return a ? { x: a.x, z: a.z, inX: a.inX, inZ: a.inZ, cx: d.x, cz: d.z } : null; }, [gb.id]);
    if (al) { const dx = al.x - al.cx, dz = al.z - al.cz, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      await pose([al.inX - ux * 1.8, 0.4, al.inZ - uz * 1.8], [al.x + ux * 0.8, 0.3, al.z + uz * 0.8], 64); await shot('interior-link-airlock-door'); }
  }
  if (want('panel')) {
    await set(`cb.store.getState().setHudHidden?.(false)`);
    await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
    await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
    const b = page.getByTestId('page-chip-dome'); if (await b.count()) await b.click();
    await page.mouse.move(700, 400); await page.waitForTimeout(400);
    await page.getByTestId(`dome-card-${gb.id}`).click().catch(() => {}); await page.waitForTimeout(300);
    await page.getByTestId('link-partner').selectOption(ga.id).catch(() => {}); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-testid=dome-link-list]')?.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400);
    await shot('dome-panel-sealed-walkway-links');
    await page.evaluate(() => document.querySelector('[data-testid=dome-link-card]')?.scrollIntoView({ block: 'end' })); await page.waitForTimeout(400);
    await shot('dome-panel-link-card-shell-and-price');
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
