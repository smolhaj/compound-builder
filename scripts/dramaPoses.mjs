/**
 * Staged posture QA: forces deterministic scenes (cover, lean, prone, flank, tracer at a wall, tending, carry) through the real cutscene player.
 *   node scripts/dramaPoses.mjs --lowrender 0.4 [--out /tmp/claude-0/drama] [--violence restrained]
 * (original header:) plays a night siege (probing the line, a fire scene, the assault) in the real app and grabs a frame
 * every few seconds, auditing the camera each time against the buildings and walls (inside? how close? what is dead ahead?) and the
 * actors (how many in the picture, how many unblocked), and the framing: by day a lead-in frame must show a raider at least 16 px tall
 * (on a 720-line picture), and the overlay's light word (Night / Dawn / Day / Dusk) must match the sky at that hour. Writes PNGs and audit.json;
 * exits non-zero if any frame is bad.
 *   node scripts/cutsceneCameraShots.mjs [--lowrender 0.4] [--every 6] [--max 18] [--only probe|fires|assault] [--size 1280x720] [--port 5962] [--quality medium] [--out shots/cutscene-cameras]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5979)), quality = opt('--quality', 'low');
const every = Number(opt('--every', 6)), maxShots = Number(opt('--max', 18));
const hour0 = Number(opt('--hour', 2.25));   // the arrival hour: 2.25 is the dark of night, 5.75 is dawn, 14 is day
// --lowrender S: build the page with ?lowrender (drawn only on request) and draw each saved frame once at full size and quality (a software GL frame
// takes tens of seconds; the cutscene is stepped by hand, so nothing runs ahead between frames)
const lowrender = opt('--lowrender', null);
const doy0 = opt('--doy', null);   // the day of the year on the clock (e.g. 20 for deep winter; unset keeps the game's own date)
const MIN_RAIDER_PX = 16;
const only = opt('--only', null);
const wantStyle = opt('--style', null);   // crowd | crew | families | opportunists: pick an encounter day whose crew has that style
// the crew: --kind gang|looters|militia|patrol, --temper desperate|hard|savage, --crewsize N, --armed 0|1 (raider types: crowd = gang desperate size 10; families = looters desperate unarmed; opportunists = looters armed)
const crew = { kind: opt('--kind', 'gang'), temper: opt('--temper', 'hard'), size: Number(opt('--crewsize', 10)), armed: opt('--armed', '1') !== '0' };   // probe | fires | assault: just that scene (a shorter run)
const [vw, vh] = opt('--size', '1280x720').split('x').map(Number);
const outDir = resolve(opt('--out', '/tmp/claude-0/drama'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
// (--exe / --profile: a shared box may have other jobs that kill every Chromium by name; a differently named binary and profile dir are left alone)
const exe = opt('--exe', undefined), profile = opt('--profile', undefined);
const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'];
const browser = profile
  ? await chromium.launchPersistentContext(profile, { executablePath: exe, args: launchArgs, viewport: { width: vw, height: vh } })
  : await chromium.launch({ executablePath: exe, args: launchArgs });
const rows = [];
let bad = 0;
try {
  const page = profile ? (browser.pages()[0] ?? await browser.newPage()) : await browser.newPage({ viewport: { width: vw, height: vh } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7${lowrender ? `&lowrender=${lowrender}&looktier=${quality === 'low' ? 'medium' : quality}` : ''}`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  if (args.includes('--nocover')) await page.evaluate(() => { window.__cb.qa.noCover = true; });   // (QA: leave ground cover out of the camera obstacles, to see what it changes)
  if (lowrender && doy0) await page.evaluate(() => { window.__cb.qa.weather = true; });   // (winter: let the snow layer run)
  if (lowrender) await page.evaluate(() => {
    // the page's own frame loop must not advance the cutscene or the fight: only the harness steps do (the loop gets the last pose back)
    const cb = window.__cb;
    cb.player.__orig = cb.player.update.bind(cb.player); cb.player.__pose = null; cb.player.update = () => cb.player.__pose;
    cb.battle.__orig = cb.battle.update.bind(cb.battle); cb.battle.update = () => {};
  });
  const frames = async (k) => {
    if (lowrender) {
      // (the markers and rings grow with the distance to the camera: put the camera where the last step left it and redraw them before the frame)
      await page.evaluate(() => { const cb = window.__cb, p = cb.player.__pose; if (p && cb.battle.playing) { cb.ws.camera.position.set(p.eye.x, p.eye.y, p.eye.z); cb.battle.viewer = cb.ws.camera.position; cb.battle.__orig(0.0001); } });
      await page.evaluate(q => window.__cb.qa.renderFull(q), quality === 'low' ? 'medium' : quality);
      return;
    }
    const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 });
  };

  if (opt('--violence', null)) await page.evaluate(v => localStorage.setItem('cb.violence', v), opt('--violence'));

  const shot = async (name) => {
    await page.evaluate(() => window.__cb.store.getState().setPerfNotice(null));
    await frames(3);
    await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name);
  };
  // the world: a cabin, a palisade round it, a hand well outside the north wall
  await page.evaluate(async () => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    const w = cb.tool.findSpot('well_hand', sp[0] - 3, sp[1] + 13, 0);
    G.getState().plan('well_hand', w[0], w[1], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } g.clock.t = Math.floor(g.disaster.hitAt + 20) - 0.25 + 2.25 / 24; g.clock.speed = 0; g.disaster.tracks = { ...g.disaster.tracks, law: 0 }; return { game: g }; });
    window.__sp = sp; window.__well = w;
    const { useBattleStore } = await import('/src/store/battleStore.ts');
    const { useCutsceneView } = await import('/src/store/cutsceneStore.ts');
    window.__adv = (match, maxSteps = 20000, dt = 0.1) => {
      for (let i = 0; i < maxSteps; i++) {
        const v = useCutsceneView.getState().view;
        if (v && match(v, cb.battle.time)) return true;
        cb.player.__pose = cb.player.__orig(dt);
        const bs = useBattleStore.getState();
        if (bs.battle && bs.battle !== cb.battle.battle) cb.battle.play(bs.battle);
        else if (!bs.battle && cb.battle.playing) cb.battle.stop();
        if (cb.battle.playing) { cb.battle.__orig(dt); bs.setProgress(cb.battle.time, cb.battle.lines); }
        if (!cb.player.active) return false;
      }
      return false;
    };
    // stage a battle as a one-scene cutscene (a dev hook: the real player, director and renderer run it)
    window.__stage = async (battle) => {
      const { finishPlan } = await import('/src/sim/siege.ts');
      const g = structuredClone(G.getState().game);
      const plan = finishPlan('gang', 2.25, [{ index: 0, kind: 'assault', label: 'The assault', gap: 0, lead: 0, fight: battle.duration, tail: 4, style: 'crew', tactic: 'rushing' }], 'crew');
      const report = { title: 'x', text: 'x', tone: 'mixed', killed: [], wounded: [], taken: [], lost: [], raidersWounded: 0, raidersDead: 0, damage: [], rounds: 0, lines: [], aftermath: false };
      G.setState({ cutscene: { phase: 'playing', hour: 2.25, narration: '', stance: 'defend', plan, battles: [battle], staged: g, report, t0: g.clock.t, offer: null, changed: false } });
    };
  });
  await frames(6);
  const people = await page.evaluate(() => window.__cb.game.getState().game.people.map(p => p.id));
  // scene A: cover, lean, prone, duck, a flank, a round stopped by the wall, a man hit and carried out
  const A = await page.evaluate(async (people) => {
    const [sx, sz] = window.__sp, [wx, wz] = window.__well;
    const { dragTheWounded } = await import('/src/sim/fightPoses.ts');
    const lc = window.__cb.world.lowCover;
    const clear = (x, z) => lc.every(c => Math.hypot(c.x - x, c.z - z) > c.r + 1.3);
    let kx = sx + 3.6, kz = sz + 3.0;
    search: for (let r = 0; r < 7; r += 0.6) for (let a = 0; a < 6.3; a += 0.5) { const x = sx + 3.6 + Math.cos(a) * r, z = sz + 3 + Math.sin(a) * r; if (clear(x, z) && Math.hypot(x - sx, z - sz) < 7) { kx = x; kz = z; break search; } }
    const U = (id, side, x, z, pid) => ({ id, side, x, z, post: 'open', ...(pid ? { personId: pid } : {}) });
    const units = [U('h0', 'home', sx - 1.5, sz + 7.6, people[0]), U('h1', 'home', sx + 1.5, sz + 6.8, people[1]), U('h2', 'home', sx + 2.4, sz + 6.4, people[2]), U('h3', 'home', sx - 2.2, sz + 2.6, people[3] ?? people[0]), U('h4', 'home', sx - 3.2, sz + 3.0, people[4] ?? people[1]), U('h5', 'home', kx, kz, people[0]), U('h6', 'home', kx + 0.45, kz, people[1]),
      U('r0', 'raider', wx + 0.2, wz + 1.0), U('r1', 'raider', sx - 14, sz + 20), U('r2', 'raider', sx + 5, sz + 17), U('r3', 'raider', sx + 6.5, sz + 18)];
    const ev = [];
    for (let k = 0; k < 14; k++) {
      const t = 1 + k * 0.7;
      ev.push({ t, kind: 'shot', from: 'r0', to: k % 2 ? 'h1' : 'h0', hit: false });
      ev.push({ t: t + 0.2, kind: 'shot', from: 'h0', to: 'r2', hit: false });
      ev.push({ t: t + 0.35, kind: 'shot', from: 'h1', to: 'r3', hit: k === 7 });
      if (k % 3 === 1) ev.push({ t: t + 0.4, kind: 'shot', from: 'r2', to: 'h2', hit: false });
    }
    ev.push({ t: 9, kind: 'wound', unit: 'h2', sev: 62, part: 'leg' });
    // a lighter wound elsewhere, tended where he kneels (not carried: under the drag threshold)
    ev.push({ t: 1.5, kind: 'wound', unit: 'h3', sev: 40, part: 'arm' }, { t: 3, kind: 'cover', unit: 'h3', x: sx - 2.2, z: sz + 2.6 }, { t: 4, kind: 'aid', unit: 'h3', by: 'h4', what: 'pressure' });
    // r1 flanks round the west side while the others fire
    ev.push({ t: 2, kind: 'move', unit: 'r1', x: sx - 16, z: sz + 12 }); ev.push({ t: 7, kind: 'move', unit: 'r1', x: sx - 14, z: sz + 2 }); ev.push({ t: 12, kind: 'move', unit: 'r1', x: sx - 13, z: sz - 8 });
    ev.push({ t: 0.5, kind: 'cover', unit: 'h5', x: kx, z: kz });   // (a control: kneeling with no cover logic involved)
    ev.push({ t: 24, kind: 'end', result: 'repelled' });
    ev.sort((a, c) => a.t - c.t);
    const b = dragTheWounded({ night: true, duration: 26, units, events: ev }, { x: sx, z: sz });
    await window.__stage(b);
    return b.events.filter(e => e.kind === 'lift' || e.kind === 'lower').map(e => `${e.kind}@${e.t}`);
  }, people);
  console.log('A', JSON.stringify(A));
  await frames(6);
  if (args.includes('--debug')) {
    for (let k = 0; k < 14; k++) {
      await page.evaluate(() => window.__adv(() => false, 10, 0.1));
      console.log(await page.evaluate(() => { const cb = window.__cb; return 't=' + cb.battle.time.toFixed(1) + ' ' + [...cb.battle._units.values()].map(u => `${u.def.id}:${u.crouch ? 'c' : ''}${u.lean ? 'L' : ''}${u.proneUntil > cb.battle.time ? 'P' : ''}${u.duckUntil > cb.battle.time ? 'D' : ''}`).join(' ') + ' boxes=' + cb.battle._coverBoxes().length + ' fire=' + cb.battle._fireBoxes().length; }));
    }
    await browser.close(); vite.kill(); process.exit(0);
  }
  const find = (src, maxBt) => page.evaluate(([src, maxBt]) => { const f = eval(src); window.__who = null; return window.__adv((v, bt) => { const cb = window.__cb; for (const u of cb.battle._units.values()) if (!u.dead && f(u, cb.battle.time)) { window.__who = u.def.id; return true; } return bt >= maxBt; }, 4000, 0.05) && !!window.__who; }, [src, maxBt]);
  const aim = (ang, d, h, fov = 46) => page.evaluate(([ang, d, h, fov]) => { const cb = window.__cb, u = cb.battle._units.get(window.__who), g = cb.world.groundAt(u.x, u.z); cb.player.__pose = { eye: { x: u.x + Math.sin(u.rot + ang) * d, y: g + h, z: u.z + Math.cos(u.rot + ang) * d }, look: { x: u.x + (window.__who === 'h5' ? 0.22 : 0), y: g + 0.1, z: u.z }, fov }; }, [ang, d, h, fov]);
  const snap = async (name, pred, maxBt, ang, d, h) => { if (!(await find(pred, maxBt))) { console.log('NOT FOUND', name); return; } await aim(ang, d, h); await page.waitForTimeout(700); await shot(name); };
  await snap('01-kneeling-behind-the-well', '(u) => u.def.id === "r0" && u.crouch && Math.hypot(u.tx - u.x, u.tz - u.z) < 0.012 && Math.hypot(u.x - window.__well[0], u.z - window.__well[1]) < 1.2', 12, -1.57, 0.9, 0.45);
  // the round stopped by the wall: the camera beside the last impact
  const imp = await page.evaluate(() => { const cb = window.__cb, im = cb.battle.lastImpact; if (!im) return null; const dx = im.from.x - im.x, dz = im.from.z - im.z, l = Math.hypot(dx, dz) || 1; cb.player.__pose = { eye: { x: im.x + dx / l * 0.4 - dz / l * 1.5, y: im.y + 0.3, z: im.z + dz / l * 0.4 + dx / l * 1.5 }, look: { x: im.x + dx / l * 0.6, y: im.y, z: im.z + dz / l * 0.6 }, fov: 62 }; return { impacts: cb.battle.impacts, at: im }; });
  console.log('impact', JSON.stringify(imp));
  // (a tracer lives 0.3 s: step until one is fresh, then freeze with the camera on it)
  for (let i = 0; i < 400; i++) { const n0 = await page.evaluate(() => window.__cb.battle.impacts); await page.evaluate(() => window.__adv(() => false, 1, 0.03)); const n1 = await page.evaluate(() => window.__cb.battle.impacts); if (n1 > n0) break; }
  await page.evaluate(() => { const cb = window.__cb, im = cb.battle.lastImpact; if (!im) return; const dx = im.from.x - im.x, dz = im.from.z - im.z, l = Math.hypot(dx, dz) || 1; cb.player.__pose = { eye: { x: im.x + dx / l * 0.4 - dz / l * 1.5, y: im.y + 0.3, z: im.z + dz / l * 0.4 + dx / l * 1.5 }, look: { x: im.x + dx / l * 0.6, y: im.y, z: im.z + dz / l * 0.6 }, fov: 62 }; });
  await page.waitForTimeout(700); await shot('06-tracer-stops-at-the-wall');
  await snap('00-kneel-beside-standing', '(u) => u.def.id === "h5" && u.crouch', 6, 3.1416, 1.4, 0.2);
  await snap('02-leaning-out-at-the-wall', '(u) => u.def.id === "h0" && u.lean', 14, 0.15, 0.9, 0.3);
  await snap('03-prone-under-fire', '(u, t) => u.def.side === "raider" && u.proneUntil > t', 14, 1.2, 0.8, 0.3);
  await snap('04-heads-down-suppressed', '(u, t) => u.duckUntil > t', 16, 0.4, 0.9, 0.45);
  await snap('08-tending-the-injured-bandaged', '(u, t) => u.def.id === "h3" && u.bandagedAt != null && t >= u.bandagedAt + 0.5', 12, 0.3, 1.0, 0.5);
  // a flank: the wide frame of the raider going round the west side
  if (await find('(u) => u.def.id === "r1" && Math.hypot(u.tx - u.x, u.tz - u.z) > 0.05 && u.z < window.__sp[1] + 6', 16)) {
    await page.evaluate(() => { const cb = window.__cb, sp = window.__sp, g = cb.world.groundAt(sp[0], sp[1]); const u = cb.battle._units.get('r1'); cb.player.__pose = { eye: { x: u.x - 3, y: g + 1.3, z: u.z + 4 }, look: { x: u.x + 1.5, y: g + 0.2, z: u.z - 1.5 }, fov: 50 }; });
    await page.waitForTimeout(700); await shot('05-a-raider-flanking');
  }
  // the carry: a man hit hard is lifted and carried back, close enough to read
  if (!(await find('(u) => u.carriedBy', 26))) console.log('NOT FOUND carry'); else { await page.evaluate(() => { const cb = window.__cb, u = cb.battle._units.get(window.__who), c = cb.battle._units.get(u.carriedBy), g = cb.world.groundAt(c.x, c.z); cb.player.__pose = { eye: { x: c.x + 0.55, y: g + 0.26, z: c.z + 0.55 }, look: { x: c.x, y: g + 0.15, z: c.z }, fov: 46 }; }); await page.waitForTimeout(700); await shot('07-carrying-a-wounded-man-out'); }
  writeFileSync(`${outDir}/log.json`, JSON.stringify({ A, imp }, null, 1));
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
