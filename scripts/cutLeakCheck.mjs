// LEAK + COST check for the cutscene (cutscene realism): plays N staged invasions back to back through the real BattleRenderer (prepare: breach look, house assault, movement router), and reports renderer.info.memory / calls, JS heap after a GC, the prepare cost, and the slowest update step. Flat counts after the first scene = no leak.
//   node scripts/cutLeakCheck.mjs [--n 20] [--day 79]
// Adapted from the invasion movie: a night raid whose crew rams (or blows) its way through the wall, fights across the yard and into the house.
// The page's rAF is replaced by a manual pump (1/FPS s of cutscene time per frame), a JPEG per frame, then ffmpeg. Adapted from the day-movie
// script on claude/raid-movie-script (a separate file, so the two never conflict).
//   node scripts/invasionMovie.mjs --day 23 --hour 2.25 --out /tmp/claude-0/invasion/frames --mp4 /tmp/claude-0/invasion/invasion.mp4 [--max N] [--quality high] [--method ram|charge]
//   node scripts/invasionMovie.mjs --scan     lists encounter days whose assault breaks the line (res, deaths, scenes)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5971)), hour0 = Number(opt('--hour', 2.25)), maxF = Number(opt('--max', 100000));
const quality = opt('--quality', null), outDir = resolve(opt('--out', '/tmp/claude-0/movie/night'));
const FPS = Number(opt('--fps', 12));
const scan = false, wantDay = Number(opt('--day', 60));
// a frame is drawn only when it is captured (qa.skipDraw), so stretches can be skipped (--from) or time-lapsed (--sparse, outside the --dense windows) cheaply; --lowrender uses the on-demand mode instead (slower per frame)
const lowrender = args.includes('--lowrender'), sparse = Number(opt('--sparse', 3)), fromS = Number(opt('--from', 0));
const dr = (opt('--dense', '') || '').split(',').filter(Boolean).map(x => x.split(':').map(Number));
const afterSecs = Number(opt('--after', 4));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite exited ' + c))); });
const browser = await chromium.launch();
const log = [];
try {
  const page = await browser.newPage({ viewport: { width: Number(opt('--w', 960)), height: Number(opt('--h', 540)) }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.addInitScript(() => {
    const real = window.requestAnimationFrame.bind(window);
    window.__manual = false; window.__q = []; window.__fakeNow = 0;
    window.requestAnimationFrame = cb => { if (!window.__manual) return real(cb); window.__q.push(cb); return window.__q.length; };
    window.__pump = ms => { window.__fakeNow += ms; const q = window.__q; window.__q = []; for (const cb of q) cb(window.__fakeNow); };
  });
  await page.goto(`http://localhost:${port}/?seed=7${lowrender ? '&lowrender=1&looktier=medium' : ''}`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  if (lowrender) await page.evaluate(() => { window.__cb.qa.weather = true; });
  if (quality) await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  await page.evaluate(async () => { window.__breach = (await import('/src/sim/breach.ts')).breachOptions; });
  if (opt('--method', null)) await page.evaluate(async m => { (await import('/src/sim/breach.ts')).breachOptions.force = m; }, opt('--method', null));
  console.log('quality', await page.evaluate(() => window.__cb.store.getState().quality));
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  
  const N = Number(opt('--n', 20)), AUDIT = args.includes('--audit'), SHOTS = opt('--shots', null), PROBE = opt('--probe', null);
  const PROF = args.includes('--prof');
  let cdpP = null;
  if (PROF) { cdpP = await page.context().newCDPSession(page); await cdpP.send('Profiler.enable'); await cdpP.send('Profiler.setSamplingInterval', { interval: 2000 }); await cdpP.send('Profiler.start'); }
  const out = await page.evaluate(async ([hour0, N, wantDay, AUDIT, SHOTS, PROBE]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    for (const [k, dx, dz] of [['workshop', -5, -4], ['chicken_coop', 6, -4], ['barn', -6, 7], ['outhouse', 7, 6]]) { const q = cb.tool.findSpot(k, sp[0] + dx, sp[1] + dz, 0); if (q) G.getState().plan(k, q[0], q[1], 0); }
    const h = 12;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; });
    const g = structuredClone(G.getState().game);
    const SUB = 0.25 / 24, day = Math.floor(g.disaster.hitAt + 20);
    g.clock.t = Math.round((day - 0.25 + hour0 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 3; g.stock.dog = 1; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
    G.getState().load(g);
    const { stageRaid } = await import('/src/sim/raidCutscene.ts');
    const { decorateBreach } = await import('/src/sim/breach.ts');
    const { planHouseAssault } = await import('/src/sim/houseAssault.ts');
    const { routeScene, gatePortals: gatePortalsFn } = await import('/src/sim/cutLive.ts');
    const { stepSegments } = await import('/src/sim/standingSurfaces.ts');
    const { LineDirector } = await import('/src/sim/raidDialogue.ts');
    const { KIT, footprint } = await import('/src/game/buildkit/kit.ts');
    const { isFinished } = await import('/src/sim/construction.ts');
    const { isHome } = await import('/src/sim/blueprints.ts');
    const mk = d => ({ id: 'e9', kind: 'gang', day: d, title: 'An armed crew', dossier: [], size: 12, armed: true, strength: 120, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade'], temper: 'savage' });
    const solid = (x, z) => cb.world.walkBlocked(x, z, 0.04);
    const home = g.structures.find(x => isFinished(x) && isHome(x.kind) && KIT[x.kind]);
    if (PROBE) {
      const [px, pz] = PROBE.split(',').map(Number), col = [];
      for (let z = pz - 0.5; z <= pz + 0.5; z += 0.02) col.push([+z.toFixed(2), cb.world.walkBlocked(px, z, 0.012) ? 'B' : '.', cb.world.walkBlocked(px, z, 0.04) ? 'B' : '.']);
      const runs = g.perimeter.map(r => ({ kind: r.kind, pts: r.pts.map(q => q.map(v => +v.toFixed(2))), gates: r.gates }));
      return { probe: [px, pz], col: col.map(c => c.join('')).join(' '), runs };
    }
    const days = [];
    for (let d = wantDay; d < wantDay + 60 && days.length < N; d++) {
      const t = structuredClone(g); t.gate.pending = mk(d);
      const st = stageRaid(t, 'defend'); const last = st.battles[st.battles.length - 1];
      if (last.events.some(e => e.kind === 'breach')) days.push({ d, last });
    }
    const gc = () => new Promise(r => setTimeout(r, 50));
    const info = () => { const i = cb.ws.renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? null }; };
    const { navStats, blockedAt } = await import('/src/sim/cutNav.ts'); const { navFor } = await import('/src/sim/cutLive.ts');
    const rows = [];
    const base = { ...info(), heap: Math.round(performance.memory.usedJSHeapSize / 1e6) };
    let slowest = 0;
    for (let k = 0; k < days.length; k++) {
      const { d, last } = days[k];
      const t0 = performance.now(); const ns0 = JSON.parse(JSON.stringify(navStats));
      const seed = g.seed * 131 + Math.round(last.duration * 7), dir = new LineDirector(seed);
      let b = decorateBreach(last, g.perimeter, { x: home.x, z: home.z }, seed, false, dir);
      const t1 = performance.now();
      b = planHouseAssault(b, { box: footprint(KIT[home.kind], home.x, home.z, home.rot, false), blocked: solid, seed, dir });
      const t2 = performance.now();
      const r = routeScene(b, solid, undefined, stepSegments(g.perimeter), gatePortalsFn ? gatePortalsFn(g.perimeter) : undefined);
      const prep = performance.now() - t0, split = { decorate: Math.round(t1 - t0), house: Math.round(t2 - t1), route: Math.round(performance.now() - t2) };
      cb.battle.play(r.battle);
      // CLIP AUDIT (--audit): where each person actually IS each step of the real renderer, against the world's own walk collision (radius 0.012, thinner than the router's 0.04)
      // and the scene's own doors and breaches; a step that goes from open ground into something solid is a clip
      const nav = AUDIT ? navFor(r.battle, (x, z) => cb.world.walkBlocked(x, z, 0.012)) : null, prevPos = new Map(), clips = [];
      let steps = 0, maxStep = 0, drawn = null, shotDone = false;
      // BREACH SHOTS (--shots): at 1.5 s after the wall falls, three eye-level frames (outside the breach, from inside the yard, along the wall) and one aerial
      const ev0 = r.battle.events.find(e => e.kind === 'gap') ?? r.battle.events.find(e => e.kind === 'breach');
      const takeShots = () => {
        const S = { x: ev0.x, z: ev0.z }, out0 = r.battle.invasion?.breach ? { x: r.battle.invasion.breach.ox, z: r.battle.invasion.breach.oz } : { x: S.x - home.x, z: S.z - home.z };
        const ol = Math.hypot(out0.x, out0.z) || 1, O = { x: out0.x / ol, z: out0.z / ol }, P = { x: -O.z, z: O.x };
        const cam = cb.ws.camera, shots = [];
        const view = (name, pos, look, fov, eye) => {
          let q = { ...pos };
          for (let i = 0; i < 8 && cb.world.walkBlocked(q.x, q.z, 0.12); i++) { q = { x: q.x + O.x * 0.4 * (pos.far ? 1 : -1), z: q.z + O.z * 0.4 * (pos.far ? 1 : -1) }; }
          const gy = cb.world.groundAt(q.x, q.z);
          cam.position.set(q.x, gy + eye, q.z); cam.fov = fov; cam.near = 0.02; cam.updateProjectionMatrix();
          cam.lookAt(look.x, cb.world.groundAt(look.x, look.z) + (eye > 1 ? 0.1 : 0.22), look.z); cam.updateMatrixWorld(true);
          cb.qa.skipDraw = false; cb.ws.renderFrame(); cb.qa.skipDraw = true;
          shots.push({ name, url: cb.ws.renderer.domElement.toDataURL('image/jpeg', 0.9), cam: [+q.x.toFixed(2), +(gy + eye).toFixed(2), +q.z.toFixed(2)] });
        };
        view('eye_outside', { x: S.x + O.x * 1.3, z: S.z + O.z * 1.3, far: true }, S, 62, 0.3);
        view('eye_inside', { x: S.x - O.x * 1.4, z: S.z - O.z * 1.4 }, { x: S.x + O.x * 0.6, z: S.z + O.z * 0.6 }, 62, 0.3);
        view('eye_side', { x: S.x + P.x * 1.6 + O.x * 0.5, z: S.z + P.z * 1.6 + O.z * 0.5, far: true }, S, 62, 0.3);
        view('aerial', { x: S.x + O.x * 3.2, z: S.z + O.z * 3.2, far: true }, S, 55, 5.5);
        return shots;
      };
      while (cb.battle.playing && steps < 4000) { const s0 = performance.now(); cb.battle.update(1 / 12); maxStep = Math.max(maxStep, performance.now() - s0); steps++;
        if (nav) for (const u of cb.battle.actors()) {
          if (u.dead || u.gone) { prevPos.delete(u.id); continue; }
          const p0 = prevPos.get(u.id); prevPos.set(u.id, { x: u.x, z: u.z }); if (!p0) continue;
          const dd = Math.hypot(u.x - p0.x, u.z - p0.z), nn = Math.max(1, Math.ceil(dd / 0.04)), tt = cb.battle.time; let was = blockedAt(nav, p0.x, p0.z, tt);
          for (let q = 1; q <= nn; q++) { const x = p0.x + (u.x - p0.x) * q / nn, z = p0.z + (u.z - p0.z) * q / nn, now = blockedAt(nav, x, z, tt); if (now && !was) { clips.push({ id: u.id, side: u.side, t: +tt.toFixed(2), x: +x.toFixed(2), z: +z.toFixed(2), y: +(u.y ?? 0).toFixed(2), tgt: [+(u.tx ?? 0).toFixed(2), +(u.tz ?? 0).toFixed(2)], from: [+p0.x.toFixed(2), +p0.z.toFixed(2)], to: [+u.x.toFixed(2), +u.z.toFixed(2)], carves: nav.carves.map(c => [c.x0, c.z0, c.x1, c.z1, c.from].map(v => +v.toFixed(2))) }); break; } was = now; }
        } if (SHOTS && ev0 && !shotDone && cb.battle.time >= ev0.t + 1.5) { shotDone = true; (window.__shots ??= []).push(...takeShots().map(sh => ({ ...sh, name: `d${d}_${sh.name}` }))); } if (!drawn && cb.battle.time > r.battle.duration * 0.6) { cb.qa.skipDraw = false; const f0 = performance.now(); cb.ws.renderFrame(); const ms = performance.now() - f0; const i = cb.ws.renderer.info.render; drawn = { ms: +ms.toFixed(1), calls: i.calls, triangles: i.triangles }; cb.qa.skipDraw = true; } if (cb.battle.time > r.battle.duration + 1) break; }
      slowest = Math.max(slowest, maxStep);
      cb.battle.stop();
      await gc();
      rows.push({ k, day: d, clips: clips.length, clipUnits: [...new Set(clips.map(c => c.id))].length, clipSample: clips.slice(0, 10), gap: r.battle.events.filter(e => e.kind === 'gap').map(e => [e.x, e.z, e.w, e.t]), prepMs: Math.round(prep), split, nav: { ...Object.fromEntries(['cores', 'direct', 'grids', 'expanded', 'skipped'].map(a => [a, navStats[a] - ns0[a]])), pad: Object.fromEntries([3, 8, 24].map(q => [q, [navStats.pad[q].tries - ns0.pad[q].tries, navStats.pad[q].ok - ns0.pad[q].ok, navStats.pad[q].expanded - ns0.pad[q].expanded]])) }, unrouted: r.unrouted, lost: (r.lost || []).slice(0, 4), ok: r.ok, steps, maxStepMs: +maxStep.toFixed(1), frame: drawn, heap: Math.round(performance.memory.usedJSHeapSize / 1e6), ...info(), props: cb.battle.props.live });
    }
    return { base, rows, slowestStepMs: +slowest.toFixed(1) };
  }, [hour0, N, wantDay, args.includes('--audit'), !!opt('--shots', null), opt('--probe', null)]);
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); const sh = await page.evaluate(() => window.__shots ?? []); for (const x of sh) writeFileSync(`${SHOTS}/${x.name}.jpg`, Buffer.from(x.url.split(',')[1], 'base64')); console.log('SHOTS', JSON.stringify(sh.map(x => [x.name, x.cam]))); }
  if (PROF) {
    const { profile } = await cdpP.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0)); });
    console.log('PROFILE (self ms)', JSON.stringify([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v / 1000)])));
  }
  console.log('LEAK', JSON.stringify(out));
  writeFileSync(`${outDir}/leak.json`, JSON.stringify(out, null, 1));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  console.log('heap after GC (MB)', await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
