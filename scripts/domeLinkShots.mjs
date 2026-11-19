// Dome link shots (docs/ux/dome-links), HIGH quality: two or three domes joined by an above-ground walkway, an underground tunnel, or both.
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
    const domes = { glass: put('dome_glass', c.x - 9, c.z - 2, 14), geo: put('dome_geodesic', c.x + 6, c.z - 1, 14), earth: put('dome_earthen', c.x + 6, c.z + 15, 12) };
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 99; st.done = 0; st.finishedAt = 0; st.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    const live = await import('/src/sim/dome/live.ts');
    G.setState(s => { const g = structuredClone(s.game);
      for (const [k, d] of Object.entries(domes)) { if (!d) continue; const ref = live.domeOf(g, d.id); if (!ref) continue; const o = live.ownState(g, ref); o.filtering = 'advanced'; o.loop = k === 'earth' ? 'none' : 'recycle'; g.utilities.fittings.push({ building: d.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 }); }
      return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    return { domes, camp: [c.x, c.z] };
  });
  lap(JSON.stringify(info));
  if (!info.domes.glass || !info.domes.geo) throw new Error('missing domes');
  const LK = '/src/sim/dome/links.ts';
  const order = (a, b, kind, depth) => page.evaluate(async ([a, b, kind, depth, LK]) => {
    const m = await import(LK), G = window.__cb.game; let why = null;
    G.setState(s => { const g = structuredClone(s.game); why = m.orderLink(g, a, b, kind, depth); return { game: g }; });
    return why;
  }, [a, b, kind, depth, LK]);
  const finishAll = () => page.evaluate(() => { const G = window.__cb.game; G.setState(s => { const g = structuredClone(s.game); for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; }); });
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const poseRaw = (e, l, fov = 60) => page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [e, l, fov]);
  const pose = async (e, l, fov = 55) => poseRaw([e[0], (await gd(e[0], e[2])) + e[1], e[2]], [l[0], (await gd(l[0], l[2])) + l[1], l[2]], fov);
  const person = async (x, z) => page.evaluate(async ([x, z]) => { const m = await import('/src/game/HomesteadWorld.ts'); window.__cb.ws.scene.add(m.scaleFigure(x, z, window.__cb.world.groundAt(x, z))); }, [x, z]);
  await set(`const s = cb.store.getState(); s.setTimeOfDay(16.6); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  const Gl = info.domes.glass, Ge = info.domes.geo, Ea = info.domes.earth;
  const mid = [(Gl.x + Ge.x) / 2, (Gl.z + Ge.z) / 2], gm = await gd(mid[0], mid[1]);
  console.error('order walkway:', await order(Gl.id, Ge.id, 'walkway'));
  await finishAll(); await frames(4);
  const dir = [Ge.x - Gl.x, Ge.z - Gl.z], len = Math.hypot(...dir), u = [dir[0] / len, dir[1] / len], side = [-u[1], u[0]];
  if (want('walkway')) { await pose([mid[0] + side[0] * 1, gm + 9, mid[1] + side[1] * 19], [mid[0], gm + 0.5, mid[1]], 50); await shot('hero-aerial-walkway-between-domes'); await pose([mid[0] - u[0] * 12 + side[0] * 6, gm + 2.0, mid[1] - u[1] * 12 + side[1] * 6], [mid[0], gm + 0.7, mid[1]], 55); await shot('walkway-side-view'); }
  if (want('eye')) {
    // the walkway's real center line (its two door points), the deck 1.6 ft up, 6.5 ft wide, 8.5 ft inside: a person walks it, the camera looks along it
    const wl = await page.evaluate(async () => { const g = window.__cb.game.getState().game, l = g.domeLinks.find(x => x.kind === 'walkway'); return { a: [l.ends[0].x, l.ends[0].z], b: [l.ends[1].x, l.ends[1].z] }; });
    const d2 = [wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]], L2 = Math.hypot(...d2), uu = [d2[0] / L2, d2[1] / L2], ss = [-uu[1], uu[0]], m2 = [(wl.a[0] + wl.b[0]) / 2, (wl.a[1] + wl.b[1]) / 2], g2 = await gd(m2[0], m2[1]), DECK = 0.085;
    const personAt = async (x, z, dy) => page.evaluate(async ([x, z, dy]) => { const m = await import('/src/game/HomesteadWorld.ts'); window.__cb.ws.scene.add(m.scaleFigure(x, z, window.__cb.world.groundAt(x, z) + dy)); }, [x, z, dy]);
    await personAt(m2[0] + uu[0] * 1.1, m2[1] + uu[1] * 1.1, DECK); await personAt(m2[0] + uu[0] * 2.4, m2[1] + uu[1] * 2.4, DECK);
    await poseRaw([m2[0] - uu[0] * 1.9, g2 + DECK + 0.24, m2[1] - uu[1] * 1.9], [m2[0] + uu[0] * 5, g2 + DECK + 0.2, m2[1] + uu[1] * 5], 66); await shot('eye-person-walking-through-walkway');
    await personAt(m2[0] - ss[0] * 1.5, m2[1] - ss[1] * 1.5, 0);
    await poseRaw([m2[0] - ss[0] * 4.0 - uu[0] * 1.6, g2 + 0.42, m2[1] - ss[1] * 4.0 - uu[1] * 1.6], [m2[0] + uu[0] * 0.4, g2 + 0.3, m2[1] + uu[1] * 0.4], 60); await shot('eye-outside-walkway-with-person');
  }
  console.error('order tunnel:', await order(Gl.id, Ge.id, 'tunnel')); if (Ea) console.error('order earth tunnel:', await order(Ge.id, Ea.id, 'tunnel', 4));
  await finishAll(); await frames(4);
  // walkers: the route from inside the glass dome to inside the geodesic dome goes through a link (door tags and deck points), not across the open ground
  console.error('ROUTE', JSON.stringify(await page.evaluate(([a, b]) => { const w = window.__cb.world, r = w._walkVia(a.x - 1, a.z + 1, b.x + 1, b.z + 1); return { points: r.length, doors: r.filter(p => p[3] !== undefined).length, deck: r.filter(p => p[2] !== undefined).length, minY: Math.min(...r.filter(p => p[2] !== undefined).map(p => p[2])) , groundY: w.groundAt(a.x, a.z) }; }, [Gl, Ge])));
  if (want('both')) { await pose([mid[0] + side[0] * 2, gm + 10, mid[1] + side[1] * 28], [mid[0] + 2, gm + 0.5, mid[1] + 6], 56); await shot('hero-aerial-both-links-three-domes'); }
  if (want('under')) { await set(`cb.world.setUnderground(true)`); await frames(2); await pose([mid[0] + side[0] * 2 - u[0] * 4, 5.5, mid[1] + side[1] * 2 - u[1] * 4], [mid[0] + u[0] * 2, -0.3, mid[1] + u[1] * 2], 58); await shot('underground-view-tunnel-and-sleeves'); await set(`cb.world.setUnderground(false)`); }
  if (want('cut')) { await set(`cb.store.getState().setBuildingView('cutaway')`); await frames(3); await pose([mid[0] + side[0] * 2 - u[0] * 5, 4.5, mid[1] + side[1] * 2 - u[1] * 5], [mid[0] + u[0] * 2, 0.2, mid[1] + u[1] * 2], 58); await shot('cutaway-both-links'); await set(`cb.store.getState().setBuildingView('xray')`); await frames(3); await shot('xray-both-links'); await set(`cb.store.getState().setBuildingView('full')`); }
  if (want('airlock')) {
    const al = await page.evaluate(async ([id]) => { const sd = await import('/src/sim/dome/standing.ts'), g = window.__cb.game.getState().game, d = sd.domesOf(g).find(x => x.id === id); const a = d.airlocks.find(x => x.role === 'link'); return a ? { x: a.x, z: a.z, inX: a.inX, inZ: a.inZ, outX: a.outX, outZ: a.outZ } : null; }, [Gl.id]);
    if (al) { const dx = al.x - Gl.x, dz = al.z - Gl.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      await pose([al.inX - ux * 2.2, 0.42, al.inZ - uz * 2.2], [al.x + ux * 0.6, 0.3, al.z + uz * 0.6], 64); await shot('interior-link-airlock'); }
  }
  if (want('dusk')) { await set(`cb.store.getState().setTimeOfDay(19.9)`); await pose([mid[0] + side[0] * 2, gm + 9, mid[1] + side[1] * 28], [mid[0] + 2, gm + 0.5, mid[1] + 6], 52); await shot('dusk-linked-domes'); await set(`cb.store.getState().setTimeOfDay(16.6)`); }
  if (want('panel')) {
    await set(`cb.store.getState().setHudHidden?.(false)`);
    await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
    await page.evaluate(() => window.__cb.game.getState().focusHud({ right: 'utilities' })); await page.waitForTimeout(500);
    const b = page.getByTestId('page-chip-dome'); if (await b.count()) await b.click();
    await page.mouse.move(700, 400); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-testid=dome-link-card]')?.scrollIntoView({ block: 'end' })); await page.waitForTimeout(400);
    await shot('dome-panel-link-card');
    await page.evaluate(() => document.querySelector('[data-testid=dome-link-list]')?.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400);
    await shot('dome-panel-link-list');
  }
  await page.close();
} finally { await browser.close(); vite.kill(); }
