/**
 * Camera QA for the raid cutscene: plays a night siege (probing the line, a fire scene, the assault) in the real app and grabs a frame
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
const port = Number(opt('--port', 5962)), quality = opt('--quality', 'low');
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
const outDir = resolve(opt('--out', 'shots/cutscene-cameras'));
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
  const stance = opt('--stance', 'Defend');   // Defend = the siege; Hide / Parley = one scene at the gate
  const single = stance !== 'Defend', mode = 'siege';

  const info = await page.evaluate(async ([single, mode, hour0, doy0, crew, wantStyle]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { planSiege } = await import('/src/sim/siege.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      return { game: g };
    });
    window.__camBefore = { x: cb.cam.target.x, z: cb.cam.target.z, radius: cb.cam.radius, pitch: cb.cam.pitch, yaw: cb.cam.yaw };
    const g = structuredClone(G.getState().game);
    const SUB = 0.25 / 24;
    const day = Math.floor(g.disaster.hitAt + 20);
    g.clock.t = Math.round((day - 0.25 + hour0 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
    if (doy0) { const { calendarOf } = await import('/src/sim/state.ts'); g.clock.startDoy = 1; const base = calendarOf(g.clock).doy; g.clock.startDoy = ((Number(doy0) - base) % 365 + 365) % 365 + 1; }
    if (mode !== 'breakin') g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 3; g.stock.dog = 1; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
    // an encounter day whose plan is a siege (or a single scene)
    let ed = 0;
    for (let d = 1; d < 3000; d++) {
      const p = planSiege({ kind: crew.kind, size: crew.size, temper: crew.temper, armed: crew.armed, hour: hour0, seed: g.seed * 131 + d * 7 + 1, fought: !single, fightSeconds: single ? null : 90 });
      const night = hour0 < 6 || hour0 >= 20;
      if (wantStyle && p.style !== wantStyle) continue;
      if (single ? p.scenes.length === 1 : night ? (p.scenes.length >= 4 && p.scenes.some(sc => sc.kind === 'fires')) : p.scenes.length >= 2) { ed = d; break; }
    }
    g.gate.pending = mode === 'breakin' ? { id: 'e9', kind: 'break_in', day: 5, title: 'Someone is in the house', dossier: ['Two in the morning. The dog is going crazy downstairs.', '2 people, by the voices; no gun that you can see.'], size: 2, armed: false, strength: 10, wants: {}, stances: ['call_911', 'shout', 'confront'] } : { id: 'e9', kind: crew.kind, day: ed, title: 'An armed crew', dossier: [`${crew.size} of them, organized.`, 'They know what they want, and they think you have it.'], size: crew.size, armed: crew.armed, strength: crew.size * 12, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade'], temper: crew.temper };
    // stepping the player and the renderer by hand (a software GL frame takes seconds)
    const { useBattleStore } = await import('/src/store/battleStore.ts');
    const { useCutsceneView } = await import('/src/store/cutsceneStore.ts');
    window.__adv = (match, maxSteps = 6000, dt = 0.1) => {
      for (let i = 0; i < maxSteps; i++) {
        const v = useCutsceneView.getState().view;
        if (v && match(v, cb.battle.time)) return true;
        if (cb.player.__orig) cb.player.__pose = cb.player.__orig(dt); else cb.player.update(dt);
        const bs = useBattleStore.getState();
        if (bs.battle && bs.battle !== cb.battle.battle) cb.battle.play(bs.battle);
        else if (!bs.battle && cb.battle.playing) cb.battle.stop();
        if (cb.battle.playing) { (cb.battle.__orig ?? cb.battle.update.bind(cb.battle))(dt); bs.setProgress(cb.battle.time, cb.battle.lines); }
        if (!cb.player.active) return false;
      }
      return false;
    };
    G.getState().load(g);
    return { day: ed, scenes: planSiege({ kind: crew.kind, size: crew.size, temper: crew.temper, armed: crew.armed, hour: hour0, seed: g.seed * 131 + ed * 7 + 1, fought: !single, fightSeconds: single ? null : 90 }).scenes.length };
  }, [single, mode, hour0, doy0, crew, wantStyle]);
  console.log(JSON.stringify(info));
  await frames(10);
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: new RegExp(`^${stance}`) }).click();
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await frames(2);
  // step the player and the renderer by hand (a software GL frame takes seconds): `secs` of playback
  await page.evaluate(async () => {
    const cb = window.__cb;
    const { useBattleStore } = await import('/src/store/battleStore.ts');
    const { useCutsceneView } = await import('/src/store/cutsceneStore.ts');
    window.__step = (secs, dt = 0.1) => {
      for (let i = 0; i < Math.round(secs / dt); i++) {
        if (cb.player.__orig) cb.player.__pose = cb.player.__orig(dt); else cb.player.update(dt);
        const bs = useBattleStore.getState();
        if (bs.battle && bs.battle !== cb.battle.battle) cb.battle.play(bs.battle);
        else if (!bs.battle && cb.battle.playing) cb.battle.stop();
        if (cb.battle.playing) { (cb.battle.__orig ?? cb.battle.update.bind(cb.battle))(dt); bs.setProgress(cb.battle.time, cb.battle.lines); }
        if (!cb.player.active) return false;
      }
      return true;
    };
    let lightLabel = () => null;
    try { ({ lightLabel } = await import('/src/game/battle/lightLabel.ts')); } catch { /* (an older tree without the label helper) */ }
    window.__look = () => {
      const g = cb.game.getState(), v = useCutsceneView.getState().view, a = cb.player.audit();
      return { shown: document.querySelector('[data-light]')?.getAttribute('data-light') ?? null, expected: v ? lightLabel(v.hour) : null, phase: g.cutscene?.phase, offer: g.cutscene?.offer ?? null, view: v && { scene: v.scene, scenes: v.scenes, label: v.sceneLabel, seg: v.seg, hour: v.hour, game: Math.round(v.game) }, audit: a };
    };
  });
  const clock = h => { const m = Math.round(((h % 24) + 24) % 24 * 60) % 1440; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  let n = 0;
  const judge = (r) => {
    const a = r.audit, why = [];
    if (!a) return why;
    if (a.inside) why.push(`camera inside a ${a.inside}`);
    if (a.nearest < 0.3 && a.aboveGround < 1.4) why.push(`camera ${a.nearest} from a solid`);
    if (a.ahead < 0.6) why.push(`solid ${a.ahead} dead ahead`);
    if (a.live > 0 && a.visible === 0 && r.view?.seg !== 'gap') why.push(`no actor visible (${a.live} live, ${a.inPicture} in picture)`);
    if (r.shown && r.expected && r.shown !== r.expected) why.push(`overlay says ${r.shown} but the sky is ${r.expected}`);
    // the framing: by day the crew must be in the lead-in picture, and drawn big enough to read
    if (r.expected && r.expected !== 'Night' && r.view?.seg === 'lead' && a.live > 0 && a.raiderPx < MIN_RAIDER_PX) why.push(`crew too small or out of frame by day (${a.raiderPx} px, need ${MIN_RAIDER_PX})`);
    if (a.fallbacks > 0) why.push(`${a.fallbacks} fallback cuts: ${(a.fallbackLog ?? []).join(' | ')}`);
    return why;
  };
  // the scenes worth a look: the first probe, the first fire scene, the assault. Earlier scenes are skipped past (Skip scene), the card between them answered.
  const plan = await page.evaluate(() => window.__cb.game.getState().cutscene.plan.scenes.map(sc => sc.kind));
  const targets = [plan.indexOf('probe'), plan.indexOf('fires'), plan.length - 1].filter((v, i, a) => v >= 0 && a.indexOf(v) === i && (!only || (only === 'assault' ? v === plan.length - 1 : plan[v] === only)));
  console.log('scenes', plan.join(','), 'targets', targets.join(','));
  const perScene = Math.max(3, Math.floor(maxShots / targets.length));
  for (const target of targets) {
    for (let guard = 0; guard < 400; guard++) {
      const r = await page.evaluate(() => window.__look());
      if (r.phase !== 'playing' || (r.view && r.view.scene >= target && r.offer == null)) break;
      if (r.offer != null) await page.evaluate(() => window.__cb.game.getState().midStance(null));
      else if (r.view && r.view.scene < target) await page.evaluate(() => { window.__cb.player.skipScene(); window.__step(0.3); });
      else await page.evaluate(() => window.__step(0.3));
    }
    // a scene's lead-in (the gap card first) to the fight: step until its own lead begins
    for (let guard = 0; guard < 200; guard++) {
      const r = await page.evaluate(() => window.__look());
      if (r.phase !== 'playing' || (r.view && r.view.seg !== 'gap')) break;
      await page.evaluate(() => window.__step(0.5));
    }
    for (let k = 0; k < perScene && n < maxShots; k++) {
      let r = await page.evaluate(() => window.__look());
      if (r.phase !== 'playing') break;
      if (r.offer != null) {
        await page.evaluate(() => window.__cb.store.getState().setPerfNotice(null));
        await frames(3);
        const f = `${outDir}/${String(++n).padStart(2, '0')}-offer.png`; await page.screenshot({ path: f });
        rows.push({ file: f, ...r, clock: r.view && clock(r.view.hour), why: judge(r) });
        await page.evaluate(() => window.__cb.game.getState().midStance(null));
        continue;
      }
      const alive = await page.evaluate(s => window.__step(s), k === 0 ? 1.5 : every);
      await page.evaluate(() => window.__cb.store.getState().setPerfNotice(null));   // (a slow software renderer pops the step-down notice over the frame)
      await frames(3);
      r = await page.evaluate(() => window.__look());
      const f = `${outDir}/${String(++n).padStart(2, '0')}-s${r.view?.scene ?? 'x'}-${r.view?.seg ?? 'x'}-${r.audit?.kind ?? 'none'}.png`;
      await page.screenshot({ path: f });
      const row = { file: f, ...r, clock: r.view && clock(r.view.hour), why: judge(r) };
      rows.push(row);
      if (row.why.length) bad++;
      console.log(n, row.view?.label, row.view?.seg, row.clock, row.audit && `${row.audit.kind} inside=${row.audit.inside} near=${row.audit.nearest} ahead=${row.audit.ahead} actors ${row.audit.visible}/${row.audit.inPicture}/${row.audit.live}`, row.why.join('; '));
      if (!alive) break;
    }
  }
  // the clock across the end: what the overlay read last, what the report card says, what the game clock reads after
  await page.evaluate(() => window.__cb.player.skipAll());
  await page.evaluate(() => window.__step(0.2));
  await page.waitForFunction(() => window.__cb.game.getState().cutscene?.phase === 'aftermath', null, { polling: 300 });
  await frames(6);
  const end = await page.evaluate(() => { const g = window.__cb.game.getState(), c = g.cutscene; return { reportHour: (c.hour + c.plan.totalGame / 3600) % 24, startHour: c.plan.startHour, totalGameMin: c.plan.totalGame / 60, clockHour: ((g.game.clock.t * 24) % 24 + 24) % 24 }; });
  await page.screenshot({ path: `${outDir}/${String(++n).padStart(2, '0')}-aftermath.png` });
  // the report is up: the camera has already glided back to where the player left it (it used to stay at the fence corner)
  await page.waitForFunction(() => !window.__cb.cam.gliding, null, { polling: 300 });
  await page.waitForTimeout(2500);
  await frames(3);
  await page.screenshot({ path: `${outDir}/${String(++n).padStart(2, '0')}-aftermath-restored.png` });
  await page.getByRole('button', { name: /Check the drive|See to the drive|Pick up the pieces/ }).click();
  await frames(8);
  await page.waitForFunction(() => !window.__cb.cam.gliding, null, { polling: 300 });
  await page.waitForTimeout(2500);
  await frames(2);
  const back = await page.evaluate(() => { const c = window.__cb.cam, b = window.__camBefore; return { dTarget: Math.hypot(c.target.x - b.x, c.target.z - b.z), dRadius: Math.abs(c.radius - b.radius), dPitch: Math.abs(c.pitch - b.pitch), dYaw: Math.abs(Math.atan2(Math.sin(c.yaw - b.yaw), Math.cos(c.yaw - b.yaw))) }; });
  await page.screenshot({ path: `${outDir}/${String(++n).padStart(2, '0')}-control-returns.png` });
  console.log('camera after the raid vs before', JSON.stringify(back));
  if (back.dTarget > 1 || back.dRadius > 1 || back.dPitch > 0.05 || back.dYaw > 0.05) { console.log('CAMERA NOT RESTORED'); bad++; }
  console.log('end', JSON.stringify(end), 'report', clock(end.reportHour), 'game clock', clock(end.clockHour));
  // the clock never runs backwards across the frames, and the report card reads where the last frame left off
  const hrs = rows.filter(r => r.view).map(r => r.view.hour);
  for (let i = 1; i < hrs.length; i++) if (hrs[i] + 1e-9 < hrs[i - 1]) { console.log(`CLOCK BACKWARDS: ${clock(hrs[i - 1])} then ${clock(hrs[i])}`); bad++; }
  writeFileSync(`${outDir}/audit.json`, JSON.stringify({ rows, end }, null, 1));
  console.log(`${rows.length} frames, ${bad} bad`);
  if (bad) process.exitCode = 1;
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
