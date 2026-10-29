// Repeatable performance probe: a late-game compound at Low / Medium / High, day / night / snow / rain.
//
//   flock <lock> node scripts/perfProbe.mjs [--out perf.json] [--port 5961] [--tiers low,medium,high] [--conds day,night,snow,rain]
//                                           [--frames 24] [--warm 4] [--w 640] [--h 400] [--scene full|bare] [--shots dir]
//
// The scene (built through the real store actions, no saved-state changes): the fortress ring (container wall, wall-top deck, gatehouse
// garage, five towers), heated greenhouse, orchard grove, 20 kW solar farm + battery, pond, reservoir, sheep barn, equipment yard, guest
// house + Mom's house, the family houses and barns, a 7-vehicle fleet, 12 people, 4 dogs, the land's wildlife, footpaths laid, and the
// lived-in props, aged three years.
//
// Software GL is slow, so the numbers that carry weight are CPU-side: per-frame JS time (the update loop split by section, and the
// renderer's submit time), draw calls / triangles from renderer.info (accumulated over every pass of the frame, then a single main
// pass and a single shadow pass on their own), geometry / texture / program counts, JS heap and allocation per frame. The loop is
// NOT `?lowrender`: it renders every frame (worst case), at a small viewport so swiftshader keeps up.
// GPU time cannot be measured here; compare the relative numbers between runs.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = opt('--out', 'perf.json'), port = Number(opt('--port', 5961));
const tiers = opt('--tiers', 'low,medium,high').split(','), conds = opt('--conds', 'day,night,snow,rain').split(',');
const FRAMES = Number(opt('--frames', 24)), WARM = Number(opt('--warm', 4)), W = Number(opt('--w', 640)), H = Number(opt('--h', 400));
const scene = opt('--scene', 'full'), shotDir = opt('--shots', null), censusOnly = args.includes('--census-only'), noRender = args.includes('--norender'), profile = args.includes('--profile');
mkdirSync(dirname(outFile) || '.', { recursive: true }); if (shotDir) mkdirSync(shotDir, { recursive: true });

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const result = { when: new Date().toISOString(), viewport: [W, H], frames: FRAMES, scene, runs: [] };
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${port}/?clean${noRender ? '&lowrender' : ''}&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa);
  const frames = n => page.evaluate(n => new Promise(ok => { const f0 = window.__cb.qa.frames; const w = () => (window.__cb.qa.frames >= f0 + n ? ok() : setTimeout(w, 30)); w(); }), n);
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  await frames(2); lap('loaded');

  // ── the scene ──
  const built = await page.evaluate(async ([kind]) => {
    const cb = window.__cb, G = cb.game, W = await import('/src/store/worldStore.ts');
    G.getState().setSpeed(0);
    const geo = W.useWorldStore.getState().siteGeo ?? {};
    if (kind === 'full') {
      G.getState().fortifyRing(geo, { towers: 5, towerKind: 'watchtower_wood', passage: false });
    }
    const c = cb.world.camp;
    const P = await import('/src/sim/pets.ts');
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      for (const st of g.structures) if (st.kind === 'gate_garage' || st.kind.startsWith('watchtower')) { st.stage = 5; st.supplied = false; st.finishedAt = 0; st.permit = 'ok'; }
      if (kind === 'full') {
        const B = [
          ['farmhouse', -3, -4, 0], ['cottage', 4.5, -4.5, 0], ['workshop', 7, 4.5, 3], ['barn', -8.5, -7.5, 0], ['chicken_coop', -8, -1.5, 1], ['garden', -3.5, -9, 0],
          ['greenhouse', 1.5, -9, 0], ['outhouse', 8, -2, 3], ['well_hand', 0.5, 4.5, 0], ['generator_shed', 3.5, 5.5, 0], ['solar_array', -2, 8, 0], ['orchard', 5, -10.5, 0], ['field', -9, 3, 0],
          ['greenhouse_heated', 13.5, -8, 0], ['orchard_grove', -13, -12, 0], ['solar_farm', 13, 8, 0], ['battery_bank', 14.8, 8.6, 0], ['pond', -13, 9, 0], ['reservoir', -4, 13, 0],
          ['sheep_barn', -14, -2.5, 0], ['equipment_yard', 12.5, 0.5, 3], ['guest_house', 10.5, -3.5, 0], ['moms_house', 1, 12.5, 2],
        ];
        for (const [k, dx, dz, rot] of B) g.structures.push({ id: 'cb' + k + dx, kind: k, x: c.x + dx, z: c.z + dz + 5, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 });
        g.vehicles = ['pickup', 'suv', 'suv', 'motorhome', 'tractor', 'atv', 'trailer'].map((kd, i) => ({ id: 'pv' + i, kind: kd, mileage: 40000, condition: 0.9, fuel: 40, oilAt: 39000, serviceAt: 39500 }));
        g.stock.goat = 3; g.stock.sheep = 30; g.stock.hay = 40; g.stock.fieldstone = 99; g.stock.lumber = 99; g.stock.concrete = 99;
      }
      // twelve people
      while (g.people.length < 12) { const i = g.people.length, p = structuredClone(g.people[i % 4]); p.id = 'px' + i; p.name = 'Extra ' + i; g.people.push(p); const ps = structuredClone(g.personState[i % 4]); ps.id = p.id; g.personState.push(ps); }
      g.utilities.lit = ['x'];
      g.clock.t = 3 * 365 + 120.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      return { game: g };
    });
    // four dogs
    G.setState(s => { const g = structuredClone(s.game); for (let i = 0; i < 4; i++) P.adoptDog(g); return { game: g }; });
    return { camp: c, people: G.getState().game.people.length, structures: G.getState().game.structures.length, dogs: G.getState().game.dogs?.length, vehicles: G.getState().game.vehicles?.length };
  }, [scene]);
  lap('built ' + JSON.stringify(built));
  await frames(6);
  // footpaths laid on the busiest walks (every kind), like a played-in compound
  await page.evaluate(() => {
    const cb = window.__cb, net = cb.world.paths.network, G = cb.game, kinds = ['gravel', 'stones', 'boards', 'paved'];
    net.edges.filter(e => !e.hidden).sort((a, b) => b.trips - a.trips).slice(0, 14).forEach((e, i) => { let k = kinds[i % 4]; if (k === 'paved' && !e.can.paved) k = 'gravel'; G.getState().layPaths([{ a: e.a, b: e.b, lenM: e.lenM }], k); });
  });
  await frames(6);

  // ── instrumentation ──
  await page.evaluate(() => {
    const cb = window.__cb, ws = cb.ws, world = cb.world;
    const P = window.__perf = { acc: Object.create(null), cnt: Object.create(null), samples: [], on: false };
    const wrap = (obj, name, label) => { const f = obj[name]; if (typeof f !== 'function' || f.__w) return; const w = function (...a) { if (!P.on) return f.apply(this, a); const t = performance.now(); try { return f.apply(this, a); } finally { P.acc[label] = (P.acc[label] || 0) + performance.now() - t; P.cnt[label] = (P.cnt[label] || 0) + 1; } }; w.__w = true; obj[name] = w; };
    for (const n of ['updatePeople', 'updateWildlife', 'updateFleet', 'updateDeliveries', 'updateAtmosphere', 'tick', 'syncPerimeter', 'syncProgress', 'syncFood', 'syncTents', 'syncForestry', 'syncServices', 'syncStructures']) wrap(world, n, 'world.' + n);
    for (const n of ['tick', 'updateDayNight', 'renderFrame', 'setWeather', 'setShadowFocus']) wrap(ws, n, 'ws.' + n);
    wrap(cb.weather, 'update', 'weather.update'); wrap(cb.cam, 'step', 'cam.step'); wrap(cb.sight, 'update', 'sight.update');
    for (const n of ['family', 'dogs', 'fleet', 'wildlife', 'paths', 'lived', 'atmos']) if (world[n]) wrap(world[n], 'update', 'sub.' + n + '.update');
    const G = cb.game, st = G.getState(), tk = st.tick;
    const w2 = (...a) => { if (!P.on) return tk(...a); const t = performance.now(); try { return tk(...a); } finally { P.acc['sim.tick'] = (P.acc['sim.tick'] || 0) + performance.now() - t; P.cnt['sim.tick'] = (P.cnt['sim.tick'] || 0) + 1; } };
    G.setState({ tick: w2 });
    ws.renderer.info.autoReset = false;
    // per-frame sampler (runs after the game's own frame callback)
    let lastF = cb.qa.frames, lastHeap = performance.memory?.usedJSHeapSize ?? 0;
    const poll = () => {
      requestAnimationFrame(poll);
      if (!P.on || cb.qa.frames === lastF) return;
      lastF = cb.qa.frames;
      const info = ws.renderer.info, heap = performance.memory?.usedJSHeapSize ?? 0;
      P.samples.push({ frameMs: cb.qa.frameMs, calls: info.render.calls, tris: info.render.triangles, alloc: Math.max(0, heap - lastHeap), programs: info.programs?.length ?? 0, geos: info.memory.geometries, texs: info.memory.textures });
      lastHeap = heap; info.reset();
    };
    requestAnimationFrame(poll);
    // scene census: visible draw-call proxies and triangles per top-level group, shadow casters, lights, auto-updating matrices
    window.__census = () => {
      const scene = ws.scene, out = { groups: [], layers: {}, mats: {}, lights: [], totals: {} };
      let meshes = 0, inst = 0, casters = 0, autoMat = 0, objs = 0, tris = 0;
      const triOf = m => { const g = m.geometry; const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0); const dr = g.drawRange; const c = Math.min(n, dr.count === Infinity ? n : dr.count); return Math.floor(c / 3) * (m.isInstancedMesh ? m.count : 1); };
      const vis = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const bump = (tbl, k, calls, t, cast) => { const e = tbl[k] ??= { calls: 0, tris: 0, casters: 0 }; e.calls += calls; e.tris += t; e.casters += cast; };
      for (const top of scene.children) {
        let calls = 0, t = 0, mc = 0, ic = 0, cast = 0, am = 0, ob = 0, first = null;
        top.traverse(o => {
          ob++; if (o.matrixAutoUpdate && !o.isScene) am++;
          if (o.isLight) out.lights.push({ type: o.type, shadow: !!o.castShadow, name: o.name || top.name || top.type, vis: vis(o) });
          if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && vis(o)) {
            const mat = o.material, nm = Array.isArray(mat) ? mat.length : 1; calls += nm; first ??= o;
            let tt = 0; if (o.isMesh) { mc++; if (o.isInstancedMesh) ic++; tt = triOf(o); t += tt; if (o.castShadow) cast++; }
            const mname = (Array.isArray(mat) ? mat[0] : mat)?.name || (Array.isArray(mat) ? mat[0] : mat)?.type || '?';
            if (top.userData.type === 'building') bump(out.layers, o.userData.layer ?? '?', nm, tt, o.castShadow ? 1 : 0);
            bump(out.mats, mname, nm, tt, o.castShadow ? 1 : 0);
          }
        });
        const label = top.userData.type === 'building' ? 'bld:' + (top.userData.buildingId ?? '') : (top.name || (first ? first.constructor.name + ':' + ((Array.isArray(first.material) ? first.material[0] : first.material)?.name || first.geometry?.type) : top.type));
        out.groups.push({ label, type: top.type, children: top.children.length, calls, tris: t, meshes: mc, instanced: ic, casters: cast, autoMat: am, objs: ob });
        meshes += mc; inst += ic; casters += cast; autoMat += am; objs += ob; tris += t;
      }
      out.groups.sort((a, b) => b.calls - a.calls);
      out.totals = { meshes, instanced: inst, casters, autoMatrixObjects: autoMat, objects: objs, trisAll: tris };
      return out;
    };
  });
  const stats = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { mean: a.reduce((x, y) => x + y, 0) / a.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] }; };
  if (noRender) {
    // update loop only (`?lowrender`: nothing is drawn): the JS cost of a frame without the software-GL stalls
    for (const cond of conds) {
      await page.evaluate(([cond]) => {
        const st = window.__cb.store.getState(); window.__cb.game.getState().setSpeed(1);
        const C = { day: [11, 'summer', 'clear'], night: [23, 'summer', 'clear'], snow: [11, 'winter', 'snow'], rain: [14, 'summer', 'rain'] }[cond];
        st.setTimeOfDay(C[0]); st.setSeasonMode(C[1]); st.setWeatherMode(C[2]);
        const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34;
      }, [cond]);
      await frames(30);
      const r = await page.evaluate(async ([N]) => {
        const P = window.__perf, cb = window.__cb; P.acc = Object.create(null); P.cnt = Object.create(null); P.samples = []; P.on = true;
        const f0 = cb.qa.frames; await new Promise(ok => { const w = () => (cb.qa.frames >= f0 + N ? ok() : setTimeout(w, 50)); w(); }); P.on = false;
        const nf = Math.max(1, cb.qa.frames - f0), sec = {}; for (const k in P.acc) sec[k] = P.acc[k] / nf;
        return { samples: P.samples, sections: sec };
      }, [FRAMES * 5]);
      const sm = r.samples;
      const run = { tier: 'update-only', cond, view: 'aerial', frameMs: stats(sm.map(x => x.frameMs)), allocKBPerFrame: sm.reduce((a, x) => a + x.alloc, 0) / Math.max(1, sm.length) / 1024, sectionsMsPerFrame: r.sections };
      result.runs.push(run);
      lap(`update-only/${cond}: frame ${run.frameMs.mean.toFixed(2)} ms (p95 ${run.frameMs.p95.toFixed(2)}), alloc ${run.allocKBPerFrame.toFixed(0)} KB/frame`);
    }
    writeFileSync(outFile, JSON.stringify(result, null, 1)); await browser.close(); vite.kill(); process.exit(0);
  }
  if (profile) {
    // CPU + allocation sampling profile of the frame loop (Chrome DevTools protocol): top self-time functions and top allocation sites
    const cdp = await page.context().newCDPSession(page);
    const ptier = tiers[0], pcond = conds[0];
    await page.evaluate(q => window.__cb.store.getState().setQuality(q), ptier);
    await page.evaluate(([cond]) => { const st = window.__cb.store.getState(); window.__cb.game.getState().setSpeed(1); const C = { day: [11, 'summer', 'clear'], night: [23, 'summer', 'clear'], snow: [11, 'winter', 'snow'], rain: [14, 'summer', 'rain'] }[cond]; st.setTimeOfDay(C[0]); st.setSeasonMode(C[1]); st.setWeatherMode(C[2]); const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34; }, [pcond]);
    await frames(8);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 });
    await cdp.send('Profiler.start');
    await frames(FRAMES * 2);
    const { profile: cpu } = await cdp.send('Profiler.stop');
    const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
    const self = new Map(); const dt = cpu.timeDeltas; const byId = new Map(cpu.nodes.map(n => [n.id, n]));
    cpu.samples.forEach((id, i) => { const n = byId.get(id), cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/(src|node_modules)\//, '$1/')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => ({ fn: k, ms: v / 1000 / (FRAMES * 2), pct: 100 * v / total }));
    const alloc = new Map(); const walk = (n, ) => { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/(src|node_modules)\//, '$1/')}:${cf.lineNumber + 1}`; const own = n.selfSize || 0; if (own) alloc.set(k, (alloc.get(k) || 0) + own); n.children.forEach(walk); }; walk(heap.head);
    const atop = [...alloc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => ({ fn: k, kbPerFrame: v / 1024 / (FRAMES * 2) }));
    result.profile = { tier: ptier, cond: pcond, frames: FRAMES * 2, cpuTop: top, allocTop: atop };
    writeFileSync(outFile, JSON.stringify(result, null, 1)); await browser.close(); vite.kill(); process.exit(0);
  }
  if (censusOnly) {
    for (const tier of tiers) {
      await page.evaluate(q => window.__cb.store.getState().setQuality(q), tier); await frames(4);
      await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34; });
      await frames(4);
      result.runs.push({ tier, census: await page.evaluate(() => window.__census()) });
    }
    writeFileSync(outFile, JSON.stringify(result, null, 1)); await browser.close(); vite.kill(); process.exit(0);
  }


  for (const tier of tiers) {
    await page.evaluate(q => window.__cb.store.getState().setQuality(q), tier);
    await frames(3);
    for (const cond of conds) {
      await page.evaluate(([cond]) => {
        const st = window.__cb.store.getState(), G = window.__cb.game.getState();
        G.setSpeed(1);
        const C = { day: [11, 'summer', 'clear'], night: [23, 'summer', 'clear'], snow: [11, 'winter', 'snow'], rain: [14, 'summer', 'rain'] }[cond];
        st.setTimeOfDay(C[0]); st.setSeasonMode(C[1]); st.setWeatherMode(C[2]);
      }, [cond]);
      await frames(WARM + 4);
      for (const view of ['aerial', 'eye']) {
        await page.evaluate(view => {
          const cb = window.__cb, c = cb.world.camp, gr = cb.world.groundAt;
          if (view === 'aerial') { cb.qa.pose = null; cb.cam.target.set(c.x, 0, c.z + 4); cb.cam.yaw = 0.4; cb.cam.pitch = 0.75; cb.cam.radius = 34; }
          else { const x = c.x + 3.0, z = c.z + 11.5; cb.qa.pose = { x, y: gr(x, z) + 0.27, z, lx: c.x - 2, ly: gr(c.x - 2, c.z + 4) + 0.3, lz: c.z + 4, fov: 62 }; }
        }, view);
        await frames(WARM);
        const r = await page.evaluate(async ([N]) => {
          const P = window.__perf, cb = window.__cb;
          P.acc = Object.create(null); P.cnt = Object.create(null); P.samples = [];
          cb.ws.renderer.info.reset(); P.on = true;
          const f0 = cb.qa.frames;
          await new Promise(ok => { const w = () => (cb.qa.frames >= f0 + N ? ok() : setTimeout(w, 30)); w(); });
          P.on = false;
          const nf = Math.max(1, cb.qa.frames - f0);
          const sec = {}; for (const k in P.acc) sec[k] = P.acc[k] / nf;
          const info = cb.ws.renderer.info;
          // one main pass on its own (no shadow update) and one shadow pass: what the scene costs a single time
          const rd = cb.ws.renderer, sm = rd.shadowMap, wasAuto = sm.autoUpdate, wasNeed = sm.needsUpdate;
          const passes = {};
          sm.autoUpdate = false; sm.needsUpdate = false; info.reset();
          const tm = performance.now(); rd.render(cb.ws.scene, cb.ws.camera); passes.main = { calls: info.render.calls, tris: info.render.triangles, ms: performance.now() - tm };
          if (sm.enabled) { sm.needsUpdate = true; info.reset(); const ts = performance.now(); rd.render(cb.ws.scene, cb.ws.camera); passes.withShadow = { calls: info.render.calls, tris: info.render.triangles, ms: performance.now() - ts }; passes.shadowCalls = passes.withShadow.calls - passes.main.calls; passes.shadowTris = passes.withShadow.tris - passes.main.tris; }
          sm.autoUpdate = wasAuto; sm.needsUpdate = wasNeed; info.reset();
          const heap = performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null;
          return {
            samples: P.samples, sections: sec, counts: P.cnt, passes, heap,
            memory: { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? null },
          };
        }, [FRAMES]);
        const sm = r.samples;
        const run = {
          tier, cond, view,
          frameMs: stats(sm.map(s => s.frameMs)), callsPerFrame: stats(sm.map(s => s.calls)), trisPerFrame: stats(sm.map(s => s.tris)),
          allocKBPerFrame: sm.length ? sm.reduce((a, s) => a + s.alloc, 0) / sm.length / 1024 : null,
          newProgramsInWindow: sm.length ? sm[sm.length - 1].programs - sm[0].programs : 0, newGeosInWindow: sm.length ? sm[sm.length - 1].geos - sm[0].geos : 0, newTexturesInWindow: sm.length ? sm[sm.length - 1].texs - sm[0].texs : 0,
          sectionsMsPerFrame: r.sections, passes: r.passes, memory: r.memory, heapMB: r.heap ? r.heap.used / 1048576 : null,
        };
        run.updateMs = run.frameMs && r.sections['ws.renderFrame'] != null ? run.frameMs.mean - r.sections['ws.renderFrame'] : null;
        if (view === 'aerial' && cond === 'day') run.census = await page.evaluate(() => window.__census());
        result.runs.push(run);
        lap(`${tier}/${cond}/${view}: frame ${run.frameMs.mean.toFixed(1)} ms (p95 ${run.frameMs.p95.toFixed(1)}, newprog ${run.newProgramsInWindow}) (render ${(r.sections['ws.renderFrame'] ?? 0).toFixed(1)}), calls ${Math.round(run.callsPerFrame.mean)}, tris ${Math.round(run.trisPerFrame.mean)}, main ${r.passes.main.calls}/${r.passes.main.tris}, geo ${r.memory.geometries} tex ${r.memory.textures} prog ${r.memory.programs}, heap ${run.heapMB?.toFixed(0)} MB`);
        if (shotDir && (cond === 'day' || cond === 'night' || cond === 'snow')) { await page.screenshot({ path: `${shotDir}/${tier}-${cond}-${view}.png` }); }
        writeFileSync(outFile, JSON.stringify(result, null, 1));
      }
    }
  }
  writeFileSync(outFile, JSON.stringify(result, null, 1));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
