/**
 * Drama QA for the raid cutscene (varied dialogue, the death, the wake, tracers stopping at walls). Based on cutsceneCameraShots.mjs.
 *   node scripts/dramaShots.mjs --lowrender 0.4 [--out /tmp/claude-0/drama] [--violence restrained]
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
const port = Number(opt('--port', 5978)), quality = opt('--quality', 'low');
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
    const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.log('shot', name);
    return f;
  };
  // 2. a raid with a death (and a raider left on the drive): the first encounter day whose staged cutscene has one
  const info = await page.evaluate(async (hour0) => {
    const cb = window.__cb, G = cb.game;
    const { stageRaid } = await import('/src/sim/raidCutscene.ts');
    const g = structuredClone(G.getState().game);
    const SUB = 0.25 / 24;
    const day = Math.floor(g.disaster.hitAt + 20);
    g.clock.t = Math.round((day - 0.25 + hour0 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 3; g.stock.dog = 1; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 4; }
    const mkf = (d, size, strength) => ({ id: 'e9', kind: 'gang', day: d, title: 'An armed crew', dossier: ['A crew, organized, rifles.', 'They know what they want.'], size, armed: true, strength, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade'], temper: 'hard' });
    let best = null, mk = null;
    for (const [size, strength] of [[9, 100], [7, 80], [6, 60], [5, 45]]) {
      for (let d = 1; d < 500 && !best; d++) {
        const gg = structuredClone(g); gg.gate.pending = mkf(d, size, strength);
        const st = stageRaid(gg, 'defend');
        if (st.drama) { const score = (st.drama.raider ? 2 : 0) + (st.drama.injured.length ? 1 : 0); if (!best || score > best.score) best = { d, score, size, strength }; if (score >= 3) break; }
      }
      if (best) break;
    }
    mk = d => mkf(d, best.size, best.strength);
    g.gate.pending = mk(best.d);
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
    G.getState().load(g);
    return best;
  }, hour0);
  console.log('encounter', JSON.stringify(info));
  await frames(10);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /^Defend/ }).click();
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await frames(2);
  const cs = await page.evaluate(() => {
    const c = window.__cb.game.getState().cutscene;
    const d = c.drama ?? null;
    return { scenes: c.plan.scenes.map(s => s.kind), wake: c.plan.scenes.map(s => s.wake ?? 0), lines: c.battles.flatMap((b, i) => b.events.filter(e => e.kind === 'say').map(e => `s${i} t=${e.t} ${e.who ?? '-'} [${e.ctx ?? ''}] ${e.text}`)) };
  });
  writeFileSync(`${outDir}/dialogue.txt`, cs.lines.join('\n'));
  console.log('scenes', cs.scenes.join(','), 'wake', cs.wake.join(','), 'lines', cs.lines.length);
  // 2a. the varied dialogue: the first scene's fight, two lines on screen
  await page.evaluate(() => window.__adv((v, bt) => v.seg === 'fight' && bt >= 8));
  await shot('01-dialogue-scene1');
  // a tracer that stops at the wall: step the assault until a round is stopped, then put the camera beside the impact (the renderer counts them)
  await page.evaluate(() => { window.__cb.battle.impacts = 0; });
  const found = await page.evaluate(() => window.__adv((v, bt) => (window.__cb.battle.impacts ?? 0) > 0 || bt > 60, 6000, 0.05));
  const hit = await page.evaluate(() => {
    const cb = window.__cb, im = cb.battle.lastImpact; if (!im) return null;
    const dx = im.from.x - im.x, dz = im.from.z - im.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
    const eye = { x: im.x + dx / l * 1.5 + px * 1.1, y: im.y + 0.45, z: im.z + dz / l * 1.5 + pz * 1.1 };
    cb.player.__pose = { eye, look: { x: im.x, y: im.y, z: im.z }, fov: 50 };
    return im;
  });
  console.log('impact', JSON.stringify(hit), found);
  if (hit) { await page.waitForTimeout(800); await shot('07-tracer-stops-at-wall'); }
  // skip to the last scene
  for (let guard = 0; guard < 400; guard++) {
    const r = await page.evaluate(() => { const g = window.__cb.game.getState(), v = g.cutscene && window.__cb.game.getState().cutscene; return { phase: g.cutscene?.phase, offer: g.cutscene?.offer ?? null, n: g.cutscene?.plan?.scenes.length }; });
    const sc = await page.evaluate(async () => (await import('/src/store/cutsceneStore.ts')).useCutsceneView.getState().view?.scene ?? 0);
    if (r.phase !== 'playing' || sc >= r.n - 1) break;
    if (r.offer != null) await page.evaluate(() => window.__cb.game.getState().midStance(null));
    else await page.evaluate(() => { window.__cb.player.skipScene(); window.__adv(() => false, 6); });
  }
  { const o = await page.evaluate(() => window.__cb.game.getState().cutscene?.offer ?? null); if (o != null) { await page.evaluate(() => window.__cb.game.getState().midStance(null)); await page.evaluate(() => window.__adv(() => false, 4)); } }
  await page.evaluate(() => window.__adv((v, bt) => v.seg === 'fight', 4000, 0.2));
  // the events of the last scene, in battle time
  const T = await page.evaluate(() => {
    const c = window.__cb.game.getState().cutscene, b = c.battles[c.plan.scenes.length - 1], ev = b.events;
    const first = (f) => ev.find(f)?.t;
    const fall = ev.find(e => e.kind === 'beat' && e.role === 'fall'), death = ev.find(e => e.kind === 'death' && e.unit === fall.unit);
    const vigil = ev.find(e => e.kind === 'beat' && e.role === 'vigil');
    const vigil2 = [...ev].reverse().find(e => e.kind === 'beat' && e.role === 'vigil');
    return { aim: first(e => e.kind === 'beat' && e.role === 'aim'), fall: fall.t, death: death.t, vigil: vigil.t, vigil2: vigil2.t,
      grief: first(e => e.kind === 'say' && e.ctx === 'grief'), tend: first(e => e.kind === 'beat' && e.role === 'tend'), carry: first(e => e.kind === 'beat' && e.role === 'carry'),
      prisoner: first(e => e.kind === 'say' && e.ctx === 'prisoner_reply'), prisonerBeat: first(e => e.kind === 'beat' && e.role === 'prisoner'), end: first(e => e.kind === 'end') };
  });
  console.log('times', JSON.stringify(T));
  // the gunfight's postures: step the assault until a figure is crouched behind something, leaning out, or flat on the ground, and look at each
  const snap = async (name, pred, maxBt) => {
    const ok = await page.evaluate(([src, maxBt]) => {
      const f = eval(src);
      return window.__adv((v, bt) => { const cb = window.__cb; for (const u of cb.battle._units.values()) if (!u.dead && f(u, cb.battle.time)) { window.__who = u.def.id; return true; } return bt >= maxBt; }, 20000, 0.1) && !!window.__who;
    }, [pred, maxBt]);
    if (!ok) { console.log('no', name); return; }
    await page.evaluate(() => {
      const cb = window.__cb, u = cb.battle._units.get(window.__who), g = cb.world.groundAt(u.x, u.z);
      const eye = { x: u.x + Math.sin(u.rot + 2.3) * 0.9, y: g + 0.3, z: u.z + Math.cos(u.rot + 2.3) * 0.9 };
      cb.player.__pose = { eye, look: { x: u.x, y: g + 0.12, z: u.z }, fov: 46 };
    });
    await page.waitForTimeout(800); await shot(name); await page.evaluate(() => { window.__who = null; });
  };
  await snap('12-crouched-behind-cover', '(u, t) => u.crouch && !u.lean && Math.hypot(u.tx - u.x, u.tz - u.z) < 0.05 && u.def.side === "raider"', T.aim - 4);
  await snap('13-leaning-out', '(u, t) => u.lean', T.aim - 4);
  await snap('14-prone-under-fire', '(u, t) => u.proneUntil > t', T.aim - 4);
  const at = async (t) => { await page.evaluate(t => window.__adv((v, bt) => (v.seg === 'fight' || v.seg === 'tail') && bt >= t - 3, 40000, 0.25), t); await page.evaluate(t => window.__adv((v, bt) => (v.seg === 'fight' || v.seg === 'tail') && bt >= t, 40000, 0.05), t); };
  const plan = [
    ['02-shooter-aims', T.aim + 0.3], ['03-the-hit', T.fall + 0.12], ['04-the-fall', T.fall + 0.85], ['05-down', T.death + 2.2],
    ['06-pool-spreading', T.vigil + 6], ['08-mourning', T.vigil2 + 2.4], ['09-tending-the-injured', T.tend != null ? T.tend + 3.5 : null],
    ['10-carrying-her-in', T.carry != null ? T.carry + 5 : null], ['11-the-raider-left-behind', T.prisoner != null ? T.prisoner + 0.8 : null], ['15-the-end', T.end - 1.2],
  ];
  for (const [name, t] of plan) { if (t == null) { console.log('skip', name); continue; } await at(t); await shot(name); }
  await page.evaluate(() => window.__cb.player.skipAll());
  await page.evaluate(() => window.__adv(() => false, 4));
  writeFileSync(`${outDir}/times.json`, JSON.stringify({ T, info }, null, 1));
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
