// The dome entry movie: a floating camera, deterministic frames, an mp4 if ffmpeg exists. Two parts:
//   entry  Part A. A person on foot and a truck come in from the county road: the truck through the dome's vehicle sally port, the person through
//          the nearest personnel airlock. The camera is a smooth Catmull-Rom flight (qa.pose, never inside geometry, no UI), one frame per step.
//   raid   Part B. Raiders try the shell, the airlock, the sally port (and the skirt, if a crew is staged) and fail, with the dialogue, frustration and
//          aftermath beats. Plain delegation to scripts/domeRaidMovie.mjs (its manual pump, cutscene director and ffconcat plumbing), key frames kept.
//   join   Part C. ffmpeg: every sequence directory under --root joined into one mp4 (parts in name order).
// Always under the render lock, in the foreground:
//   flock /tmp/cb.lock node scripts/domeEntryMovie.mjs entry --kind dome_glass --night 0 --out /tmp/claude-0/dome-movie/entryA [--fps 8] [--secs 36] [--w 960 --h 540]
//   flock /tmp/cb.lock node scripts/domeEntryMovie.mjs raid --dome glass --hour 14 --out /tmp/claude-0/dome-movie/raidA [--day 30 --from 108 --sparse 12 --max 60]
//   node scripts/domeEntryMovie.mjs join --root /tmp/claude-0/dome-movie --mp4 docs/ux/dome-movie/dome-movie.mp4
// Key frames: --keys N copies N evenly spaced frames of the sequence, with the camera/actor log beside them, to --keysOut.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2), mode = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt('--fps', 8));

const encode = (listFile, mp4, inputFps) => new Promise((ok, fail) => spawn('ffmpeg', ['-y', '-loglevel', 'error', ...(listFile.endsWith('.txt') ? ['-f', 'concat', '-safe', '0'] : []), ...(inputFps ? ['-framerate', String(inputFps)] : []), '-i', listFile, '-r', '24', '-vf', 'fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '28', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' }).on('exit', c => (c === 0 ? ok() : fail(new Error('ffmpeg ' + c)))));

if (mode === 'join') {
  const root = resolve(opt('--root', '/tmp/claude-0/dome-movie')), mp4 = resolve(opt('--mp4', 'dome-movie.mp4'));
  const dirs = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(`${root}/${d.name}/frames.txt`)).map(d => d.name).sort();
  const parts = [];
  for (const d of dirs) {
    // each part's list refers to its own frames: prefix with the directory so one concat list holds them all
    const lines = readFileSync(`${root}/${d}/frames.txt`, 'utf8').split('\n').filter(Boolean).map(l => l.startsWith('file ') ? `file '${root}/${d}/${l.slice(6, -1)}'` : l);
    parts.push(...lines);
  }
  const list = `${root}/all.txt`; writeFileSync(list, parts.join('\n') + '\n');
  await encode(list, mp4); console.log('wrote', mp4, dirs.join(','));
  process.exit(0);
}

if (mode === 'raid') {
  // Part B: the dome raid movie, with its own frames.txt (ffconcat) and log.json; key frames are picked afterwards by `keys`
  const pass = args.slice(1).filter((a, i, l) => !['--keys', '--keysOut'].includes(a) && !['--keys', '--keysOut'].includes(l[i - 1]));
  const r = spawnSync('node', ['scripts/domeRaidMovie.mjs', '--lowrender', '--quality', 'high', ...pass], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (mode === 'keys') {
  // copy N evenly spaced frames of a sequence directory: keys <dir> <N> <outDir> <prefix>
  const [dir, n, out, prefix] = [resolve(args[1]), Number(args[2]), resolve(args[3]), args[4] ?? 'k'];
  mkdirSync(out, { recursive: true });
  const fs = readdirSync(dir).filter(f => /^f\d+\.(jpg|png)$/.test(f)).sort();
  for (let i = 0; i < n; i++) { const f = fs[Math.round((i + 0.5) * fs.length / n - 0.5)]; copyFileSync(`${dir}/${f}`, `${out}/${prefix}${String(i + 1).padStart(2, '0')}-${f}`); console.log(f); }
  process.exit(0);
}

if (mode !== 'entry') { console.error('usage: domeEntryMovie.mjs entry|raid|keys|join ...'); process.exit(2); }

// ───────────── Part A: entry ─────────────
const port = Number(opt('--port', 5973)), outDir = resolve(opt('--out', '/tmp/claude-0/dome-movie/entry')), KIND = opt('--kind', 'dome_glass'), ROT = Number(opt('--rot', 1));
const NIGHT = Number(opt('--night', 0)) === 1, SECS = Number(opt('--secs', 36)), W = Number(opt('--w', 960)), H = Number(opt('--h', 540)), PR = opt('--pr', '0.9');
const probe = args.includes('--probe'), stills = (opt('--stills', '') || '').split(',').filter(Boolean).map(Number);   // --stills 0.1,0.5: fractions of the film to render only
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=${PR}&region=${opt('--region', 'mountain_west')}&acres=40&relief=0&lotseed=${opt('--lotseed', 8)}`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const info = await page.evaluate(async ([KIND, ROT, NIGHT]) => {
    const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const y = w.access.yard;
    const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, ROT, 14);
    if (!sp) return null;
    G.getState().plan(KIND, sp[0], sp[1], ROT);
    const st = G.getState().game.structures.at(-1);
    G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; } g.utilities.lit = ['x']; return { game: g }; });
    cb.store.getState().setHudHidden?.(true);
    const s = cb.store.getState(); s.setTimeOfDay(NIGHT ? 21.5 : 15.0); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');
    return { id: st.id, x: st.x, z: st.z };
  }, [KIND, ROT, NIGHT]);
  if (!info) throw new Error('no spot for ' + KIND);
  const frames = async (n = 2) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(200); };
  await frames(4);
  // the road re-plans to the port and the truck's tail (through the gate to the lane) is laid on the world's next idle ticks: wait for it (a held truck would ignore it)
  for (let k = 0; k < 60; k++) { if (await page.evaluate(() => window.__cb.world.truck.tail.length > 0)) break; await frames(2); }
  lap('truck tail points: ' + await page.evaluate(() => window.__cb.world.truck.tail.length));
  // the scene's geometry: the dome, its vehicle port and personnel airlocks, the truck's way in sampled by distance (the truck is held at each distance in turn)
  const geo = await page.evaluate(async id => {
    const cb = window.__cb, w = cb.world, s = await import('/src/sim/dome/standing.ts');
    const d = s.domesOf(cb.game.getState().game).find(x => x.id === id);
    const v = d.airlocks.find(l => l.role === 'vehicle'), people = d.airlocks.filter(l => l.role !== 'link' && l.role !== 'vehicle');
    const L = w.truck.inLength, pts = [], n = Math.ceil(L / 0.25);
    w.truck.qaHold([{ material: 'lumber', qty: 6 }], 0);
    for (let i = 0; i <= n; i++) { w.truck.qaHold([{ material: 'lumber', qty: 6 }], Math.min(L, i * L / n)); const a = w.truck.at; if (a) pts.push([i * L / n, a[0], a[1]]); }
    return { r: d.r, x: d.x, z: d.z, tier: d.tier, v: v ? { angle: v.angle, x: v.x, z: v.z, inX: v.inX, inZ: v.inZ, dw: v.dw, len: v.len ?? 0.3 } : null, people: people.map(p => ({ angle: p.angle, x: p.x, z: p.z, outX: p.outX, outZ: p.outZ, inX: p.inX, inZ: p.inZ })), L, pts };
  }, info.id);
  lap(`dome r=${geo.r.toFixed(2)} tier=${geo.tier} port=${geo.v ? 'yes' : 'NONE'} people locks=${geo.people.length} truck way=${geo.L.toFixed(1)} units, ${geo.pts.length} pts`);
  if (probe) { console.log(JSON.stringify({ ...geo, pts: geo.pts.filter((_, i) => i % 8 === 0) })); }
  { const e = geo.pts.at(-1), dd = Math.hypot(e[1] - geo.x, e[2] - geo.z); lap(`truck way ends ${dd.toFixed(1)} units from the dome centre (r ${geo.r.toFixed(1)})`); if (dd > geo.r) throw new Error('the truck way does not reach the dome: the road is not planned to the port'); }
  if (!geo.v) throw new Error('the dome has no vehicle sally port (is the road branch merged?)');
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);

  // ── geometry helpers (plain JS, all in world units; 1 unit = 20 ft here, a person 0.28) ──
  const u = [Math.sin(geo.v.angle), Math.cos(geo.v.angle)], n = [u[1], -u[0]], R = geo.r, S = Math.max(1, R / 3.7);
  const E = (rho, lam) => [geo.x + u[0] * rho + n[0] * lam, geo.z + u[1] * rho + n[1] * lam];
  const gateD = (() => { let b = 1e9, bd = 0; for (const [d, x, z] of geo.pts) { const e = Math.hypot(x - (geo.x + u[0] * (R + 0.2)), z - (geo.z + u[1] * (R + 0.2))); if (e < b) { b = e; bd = d; } } return bd; })();
  const pathAt = d => { const p = geo.pts; if (d <= 0) return p[0].slice(1); for (let i = 1; i < p.length; i++) if (p[i][0] >= d) { const t = (d - p[i - 1][0]) / (p[i][0] - p[i - 1][0] || 1); return [p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t, p[i - 1][2] + (p[i][2] - p[i - 1][2]) * t]; } return p.at(-1).slice(1); };
  // the person's way: along the road's shoulder (offset from the truck's way) to the apron, round the shell outside it to the nearest personnel airlock, in
  const lock = [...geo.people].sort((a, b) => Math.abs(Math.atan2(Math.sin(a.angle - geo.v.angle), Math.cos(a.angle - geo.v.angle))) - Math.abs(Math.atan2(Math.sin(b.angle - geo.v.angle), Math.cos(b.angle - geo.v.angle))))[0];
  const walk = [];
  const dStart = Math.max(0, gateD - 9 * S);
  for (let d = dStart; d < gateD - 1.6 * S; d += 0.4) { const [x, z] = pathAt(d), [x2, z2] = pathAt(d + 0.4), dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1; walk.push([x + dz / l * 0.34 * S, z - dx / l * 0.34 * S]); }
  { // an arc round the shell at R + 0.7, from the port's side to the airlock's, the short way
    const a0 = geo.v.angle, a1 = lock.angle, da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), k = Math.max(2, Math.ceil(Math.abs(da) * (R + 0.7) / 0.4));
    const last = walk.at(-1);
    walk.push([last[0], last[1]]);
    for (let i = 1; i <= k; i++) { const a = a0 + da * i / k; walk.push([geo.x + Math.sin(a) * (R + 0.7 * S), geo.z + Math.cos(a) * (R + 0.7 * S)]); }
    walk.push([lock.outX, lock.outZ], [lock.x, lock.z], [lock.inX, lock.inZ], [lock.inX - Math.sin(lock.angle) * 0.7, lock.inZ - Math.cos(lock.angle) * 0.7]);
  }
  const wl = walk.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - walk[i - 1][0], p[1] - walk[i - 1][1]) : 0), 0);
  const walkAt = d => { let a = 0; for (let i = 1; i < walk.length; i++) { const l = Math.hypot(walk[i][0] - walk[i - 1][0], walk[i][1] - walk[i - 1][1]); if (a + l >= d) { const t = (d - a) / (l || 1); return [walk[i - 1][0] + (walk[i][0] - walk[i - 1][0]) * t, walk[i - 1][1] + (walk[i][1] - walk[i - 1][1]) * t]; } a += l; } return walk.at(-1); };
  lap(`person path ${wl.toFixed(1)} units, ${walk.length} pts; gate at truck d=${gateD.toFixed(1)} of ${geo.L.toFixed(1)}; personnel lock at ${(lock.angle * 180 / Math.PI).toFixed(0)} deg (port ${(geo.v.angle * 180 / Math.PI).toFixed(0)})`);

  // ── the actors on the clock t (seconds of film): the truck waits at the outer gate while the lock cycles; the person walks all the while ──
  const T_TRUCK0 = 2.0, TRUCK_V = (gateD - Math.max(0, gateD - 14 * S)) / 9, HOLD = 4.0, tGate = T_TRUCK0 + 9, tOn = tGate + HOLD;
  const truckD = t => { const d0 = Math.max(0, gateD - 14 * S); if (t < T_TRUCK0) return d0; if (t < tGate) return d0 + (t - T_TRUCK0) * TRUCK_V; if (t < tOn) return gateD; return Math.min(geo.L, gateD + (t - tOn) * TRUCK_V * 0.6); };
  const personD = t => Math.max(0, Math.min(wl, (t - 0.5) * wl / (SECS * 0.82)));
  // the camera: a Catmull-Rom flight through waypoints [t, eye(rho, lam, h), look(rho, lam, h)], port frame coordinates; 'T' / 'P' look at the truck / person
  const WP = [
    // the county road end: high and wide, the person and truck both in the frame
    [0.0, [R + 15 * S, -9 * S, 7.5 * S], ['P', 0.15]],
    [5.0, [R + 11 * S, -6 * S, 4.2 * S], ['P', 0.12]],
    [11.0, [R + 8 * S, 3.4 * S, 1.5 * S], ['T', 0.22]],
    [17.0, [R + 5.5 * S, -2.4 * S, 0.8 * S], ['T', 0.22]],
    // beside the truck as it waits at the outer gate, then the person at the personnel lock
    [23.0, [R + 3.2 * S, 2.7 * S, 0.9 * S], ['G', 0.25]],
    [29.0, [R * 0.95, 2.4 * S, 1.8 * S], ['T', 0.2]],
    [SECS, [R * 0.15, 0.5 * S, 3.4 * S], ['G2', 0.2]],
  ];
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const eyeAt = t => {
    let i = WP.findIndex(w => w[0] > t); if (i < 0) i = WP.length - 1; if (i === 0) i = 1;
    const a = WP[i - 1], b = WP[i], p0 = WP[Math.max(0, i - 2)], p3 = WP[Math.min(WP.length - 1, i + 1)], k = (t - a[0]) / (b[0] - a[0] || 1), kk = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    return [0, 1, 2].map(j => cr(p0[1][j], a[1][j], b[1][j], p3[1][j], Math.max(0, Math.min(1, kk))));
  };
  const stateAt = async t => {
    const td = truckD(t), pd = personD(t);
    const eyeP = eyeAt(t); const ew = E(eyeP[0], eyeP[1]);
    return { t, td, pd, eye: [ew[0], eyeP[2], ew[1]] };
  };
  // ── render: per frame set the actors and the pose, one full-quality draw ──
  await page.evaluate(async () => { const m = await import('/src/game/HomesteadWorld.ts'); const f = m.scaleFigure(0, 0, 0); f.name = '__walker'; window.__cb.ws.scene.add(f); });
  await page.evaluate(() => window.__cb.world.truck.qaHold([{ material: 'lumber', qty: 6 }], 0));
  const log = [], nF = Math.round(SECS * FPS), caps = [];
  const only = stills.length ? new Set(stills.map(f => Math.round(f * (nF - 1)))) : null;
  for (let i = 0; i < nF; i++) {
    if (only && !only.has(i)) continue;
    const t = i / FPS, st = await stateAt(t);
    const [wx, wz] = walkAt(st.pd), [wx2, wz2] = walkAt(Math.min(wl, st.pd + 0.05)), wy = await gd(wx, wz);
    const pos = pathAt(st.td), pos2 = pathAt(Math.min(geo.L, st.td + 0.3));
    // the look target: the truck, the person, the gate, or the lane inside
    const lookOf = async () => {
      const wp = WP.findLast(w => w[0] <= t) ?? WP[0], tag = wp[2][0];
      if (tag === 'T') return [pos[0], pos[1]]; if (tag === 'P') return [wx, wz];
      if (tag === 'G') return E(R + 0.4, 0); return E(R - 2.5 * S, 0);
    };
    const [lx, lz] = await lookOf();
    // blend the look between waypoint targets (a slow turn, not a cut): previous target to this one over 2 s
    const prev = WP.findLast(w => w[0] <= t - 2) ?? WP[0], cur = WP.findLast(w => w[0] <= t) ?? WP[0];
    let tx = lx, tz = lz;
    if (prev !== cur) {
      const f = Math.min(1, (t - cur[0]) / 2), tgt = tag => tag === 'T' ? [pos[0], pos[1]] : tag === 'P' ? [wx, wz] : tag === 'G' ? E(R + 0.4, 0) : E(R - 2.5 * S, 0), a = tgt(prev[2][0]), s = f * f * (3 - 2 * f);
      tx = a[0] + (lx - a[0]) * s; tz = a[1] + (lz - a[1]) * s;
    }
    const ly = (await gd(tx, tz)) + (WP.findLast(w => w[0] <= t)?.[2][1] ?? 0.2) * S;
    let ey = (await gd(st.eye[0], st.eye[2])) + st.eye[1];
    // the camera never goes under the ground or inside the shell skin: lift to clear the ground, and when it is within a skin's width of the shell and not at the port, nudge it out
    ey = Math.max(ey, (await gd(st.eye[0], st.eye[2])) + 0.35);
    await page.evaluate(([wx, wz, wy, hdg, tx, tz, tp, trot, eye, ey, look, ly, fov]) => {
      const cb = window.__cb, f = cb.ws.scene.getObjectByName('__walker');
      f.position.set(wx, wy, wz); f.rotation.y = hdg; f.position.y += Math.abs(Math.sin(wx * 40 + wz * 40)) * 0.012;
      cb.world.truck.qaHold([{ material: 'lumber', qty: 6 }], tp);
      cb.qa.pose = { x: eye[0], y: ey, z: eye[1], lx: look[0], ly, lz: look[1], fov };
    }, [wx, wz, wy, Math.atan2(wx2 - wx, wz2 - wz), pos[0], pos[1], st.td, 0, [st.eye[0], st.eye[2]], ey, [tx, tz], ly, 58]);
    await frames(1);
    await page.evaluate(() => window.__cb.qa.renderFull('high'));
    const file = `f${String(i).padStart(5, '0')}.jpg`;
    await page.screenshot({ path: `${outDir}/${file}`, type: 'jpeg', quality: 88 });
    caps.push(file);
    log.push({ i, t: +t.toFixed(2), truckD: +st.td.toFixed(2), personD: +st.pd.toFixed(2), eye: [+st.eye[0].toFixed(2), +ey.toFixed(2), +st.eye[2].toFixed(2)], look: [+tx.toFixed(2), +ly.toFixed(2), +tz.toFixed(2)] });
    if (i % 10 === 0) lap(`frame ${i}/${nF} t=${t.toFixed(1)}`);
  }
  writeFileSync(`${outDir}/log.json`, JSON.stringify(log));
  writeFileSync(`${outDir}/frames.txt`, caps.map(f => `file '${f}'\nduration ${(1 / FPS).toFixed(4)}`).join('\n') + `\nfile '${caps.at(-1)}'\n`);
  const mp4 = opt('--mp4', null);
  if (mp4 && !only) { await encode(`${outDir}/frames.txt`, resolve(mp4)); console.log('wrote', mp4); }
  console.log('done frames', caps.length);
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
