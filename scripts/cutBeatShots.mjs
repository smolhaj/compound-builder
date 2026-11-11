// BEAT shots: plays a real raid and pins the camera to named beats (--beats flag,panic,limp,sling,crawl,flare,fire,smoke,dog,...) so each can be seen in the live path. (Original header: FLOAT check: plays a real game's raid through the real app and, when the battle has ladders, pins the camera to a ladder (a defender's up the fighting step, a raider's up the wall) so the climb and the platform can be seen; also grabs the interior. (Original header: LIVE cutscene audit (cutscene realism): plays real games through the real app (store -> stageRaid -> Watch -> CutscenePlayer.prepare -> BattleRenderer) and, on every pumped frame, checks where each person actually IS against the live world's own walk collision (walkBlocked) and the scene's doors / breaches. Also grabs frames at the beats (--shots) and reports renderer.info.
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
const OPT_DOG = process.argv.includes('--dog'), OPT_TOWER = process.argv.includes('--tower');
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5971)), hour0 = Number(opt('--hour', 2.25)), maxF = Number(opt('--max', 100000));
const quality = opt('--quality', null), outDir = resolve(opt('--out', '/tmp/claude-0/movie/night'));
const FPS = Number(opt('--fps', 12));
const scan = args.includes('--scan'), wantDay = Number(opt('--day', 0));
// a frame is drawn only when it is captured (qa.skipDraw), so stretches can be skipped (--from) or time-lapsed (--sparse, outside the --dense windows) cheaply; --lowrender uses the on-demand mode instead (slower per frame)
const lowrender = args.includes('--lowrender'), sparse = Number(opt('--sparse', 3)), fromS = Number(opt('--from', 0));
const dr = (opt('--dense', '') || '').split(',').filter(Boolean).map(x => x.split(':').map(Number));
const afterSecs = Number(opt('--after', 4));
// --dbt a:b captures every pump while the BATTLE clock is between a and b seconds (the beat you want to see: a door kicked, a room cleared)
const dbts = (opt('--dbt', '') || '').split(',').filter(Boolean).map(x => x.split(':').map(Number));
let prevBt = null;
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
  const info = await page.evaluate(async ([hour0, scan, wantDay, KIND, SIZE, TEMPER, STANCE, OPT_DOG, OPT_TOWER, WANT_WAKE]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { planSiege } = await import('/src/sim/siege.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    for (const [k, dx, dz] of [['workshop', -5, -4], ['chicken_coop', 6, -4], ['barn', -6, 7], ['outhouse', 7, 6]]) { const q = cb.tool.findSpot(k, sp[0] + dx, sp[1] + dz, 0); if (q) G.getState().plan(k, q[0], q[1], 0); }
    const h = 12;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; });
    const g = structuredClone(G.getState().game);
    const SUB = 0.25 / 24;
    const day = Math.floor(g.disaster.hitAt + 20);
    g.clock.t = Math.round((day - 0.25 + hour0 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 3; g.stock.dog = 1; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
    if (OPT_DOG) { const { adoptDog } = await import('/src/sim/pets.ts'); adoptDog(g, { ageYears: 3, training: 60, guard: true }); }
    if (OPT_TOWER) { for (const [i, [tx, tz]] of [[-4, 10], [4, 10]].entries()) g.structures.push({ id: 'tw' + i, kind: 'watchtower_flood', x: sp[0] + tx, z: sp[1] + tz, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }); g.utilities.lit = ['house']; }
    let ed = 0;
    const { stageRaid } = await import('/src/sim/raidCutscene.ts');
    const mk = d => ({ id: 'e9', kind: KIND, day: d, title: 'An armed crew', dossier: ["10 of them, organized, rifles. They've been working the farms east of town.", 'They know what they want, and they think you have it.'], size: SIZE, armed: true, strength: 120, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade', 'flag_pay', 'flag_pass', 'flag_bluff', 'flag_shoot'], ...(STANCE.startsWith('flag_') ? { opener: { kind: 'demand' } } : {}), temper: TEMPER });
    const cands = [];
    if (wantDay) ed = wantDay;
    for (let d = 1; d < (scan ? 90 : 400) && !ed; d++) {
      const t = structuredClone(g); t.gate.pending = mk(d);
      const st = stageRaid(t, 'defend');
      const last = st.battles[st.battles.length - 1];
      const br = last.events.find(e => e.kind === 'breach');
      const res = last.events.find(e => e.kind === 'end')?.result;
      const deaths = last.events.filter(e => e.kind === 'death').length;
      const hw = br ? last.events.filter(e => (e.kind === 'wound' || e.kind === 'death') && e.t >= br.t - 2 && e.unit.startsWith('h_') && !e.stopped).length : 0;
      if (scan) { if (br) cands.push({ d, res, dur: last.duration, deaths, hw, scenes: st.plan.scenes.length, br: br.t }); continue; }
      if (wantDay) { if (d === wantDay) ed = d; continue; }
      if (WANT_WAKE) { if (st.drama) ed = d; continue; }
    }
    if (scan) return { cands };
    g.gate.pending = mk(ed);
    G.getState().load(g);
    return { day: ed };
  }, [hour0, scan, wantDay, opt('--kind', 'gang'), Number(opt('--crewsize', 10)), opt('--temper', 'hard'), opt('--stance', 'defend'), OPT_DOG, OPT_TOWER, process.argv.includes('--needwake')]);
  console.log(JSON.stringify(info), new Date().toISOString());
  if (scan) { await browser.close(); vite.kill(); process.exit(0); }
  await frames(10); console.log('frames ok', new Date().toISOString());
  await page.waitForTimeout(3500);
  console.log('click defend');
  const LABEL = { defend: /^Defend/, flag_pay: /^Pay what they ask/, flag_pass: /^Let them pass/, flag_bluff: /^Bluff/, flag_shoot: /^Shoot the envoy/ };
  await page.getByRole('button', { name: LABEL[opt('--stance', 'defend')] }).click();
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await frames(3);
  const q0 = await page.evaluate(() => window.__cb.store.getState().quality);
  await page.evaluate(async () => {
    const { navFor } = await import('/src/sim/cutLive.ts'); const { blockedAt } = await import('/src/sim/cutNav.ts');
    const cb = window.__cb; const A = window.__A = { clips: [], steps: 0, last: new Map(), nav: null, battle: null, maxStep: 0, frames: 0, info: [] };
    window.__audit = async () => {
      const b = cb.battle; if (!b?.playing) return;
      if (A.battle !== b.battle) { A.battle = b.battle; A.nav = navFor(b.battle, (x, z) => cb.world.walkBlocked(x, z, 0.012)); A.last = new Map(); }
      A.frames++;
      const t = b.time;
      for (const u of b.actors()) {
        if (u.dead || u.gone) { A.last.delete(u.id); continue; }
        const p = A.last.get(u.id); A.last.set(u.id, { x: u.x, z: u.z });
        if (!p) continue;
        const d = Math.hypot(u.x - p.x, u.z - p.z); A.maxStep = Math.max(A.maxStep, d); A.steps++;
        const n = Math.max(1, Math.ceil(d / 0.04)); let was = blockedAt(A.nav, p.x, p.z, t);
        for (let i = 1; i <= n; i++) { const x = p.x + (u.x - p.x) * i / n, z = p.z + (u.z - p.z) * i / n, now = blockedAt(A.nav, x, z, t); if (now && !was && A.clips.length < 60) { A.clips.push({ id: u.id, t: +t.toFixed(2), x: +x.toFixed(2), z: +z.toFixed(2), side: u.side }); break; } was = now; }
      }
    };
  });
  await page.evaluate(() => { window.__manual = true; });
  await frames(0).catch(() => {});
  // wait for the in-flight real rAF callback to re-queue itself
  await page.waitForFunction(() => window.__q.length > 0, null, { polling: 100 });
  await page.evaluate(() => { window.__fakeNow = performance.now(); window.__pump(16); window.__pump(16); });
  const plan = await page.evaluate(() => window.__cb.game.getState().cutscene.plan.scenes.map(sc => sc.kind));
  console.log('plan', JSON.stringify(await page.evaluate(() => window.__cb.game.getState().cutscene.plan.scenes.map(sc => [sc.kind, sc.gap, sc.lead, sc.fight, sc.tail])))); console.log('scenes', plan.join(','), 'totalReal', await page.evaluate(() => window.__cb.game.getState().cutscene.plan.totalReal));

  await page.evaluate(() => {
    const cb = window.__cb, orig = cb.player.update.bind(cb.player);
    window.__force = null;
    cb.player.update = dt => { const r = orig(dt); const f = window.__force; return r && f ? { ...r, eye: f.eye, look: f.look, fov: f.fov } : r; };
  });
  const beats = (opt('--beats', 'flag,panic,sling,crawl,limp,flare,fire') || '').split(',');
  let p = 0, shots = 0;
  const shotLog = [], per = Number(opt('--per', 4));
  while (shots < Number(opt('--shots', 60)) && p < 12 * FPS * 60) {
    const st = await page.evaluate(async ([FPS, beats]) => {
      const cb = window.__cb, gs = cb.game.getState(); cb.qa.skipDraw = true; window.__pump(1000 / FPS);
      const b = cb.battle, c = gs.cutscene;
      if (!b?.playing) return { phase: c?.phase, offer: c?.offer ?? null, bt: null, dbg: b ? { dur: b.battle?.duration, time: b.time, hold: b.hold, seg: c?.segment ?? c?.seg ?? null, ev: b.battle?.events?.length, last: b.battle?.events?.slice(-2).map(e => e.kind + '@' + e.t) } : 'nob' };
      const ev = b.battle.events, U = b._units, t = b.time, found = {};
      const pos = id => { const u = U.get(id); return u && !u.dead ? { x: u.x, z: u.z, y: u.y } : null; };
      if (beats.includes('flag')) for (const e of ev) if (e.kind === 'flag' && t >= e.t + 3 && t <= e.t + 12) { const q = pos(e.unit); if (q) { found.flag = { ...q, key: e.unit }; const m = b.props?._flagMesh; window.__flagInfo = m ? { count: m.count, vis: m.visible, verts: m.geometry.attributes.position.count, side: m.material.side, layers: m.layers.mask, parent: !!m.parent } : null; } }
      for (const [k, f] of [['panic', u => u.frozenUntil != null], ['sling', u => u.sling && !u.dead], ['crawl', u => u.crawl && !u.dead], ['limp', u => u.limp && !u.crawl && !u.dead]]) if (beats.includes(k)) for (const u of U.values()) if (f(u) && !u.def.machine) { found[k] = { x: u.x, z: u.z, y: u.y, key: u.def.id }; break; }
      if (beats.includes('answer')) { const fe = ev.find(e => e.kind === 'flag'); if (fe && t >= fe.t + 8 && t <= fe.t + 16) { const u = U.get(fe.unit); if (u) found.answer = { x: u.x, z: u.z, y: u.y, key: 'answer' }; } }
      if (beats.includes('dog')) for (const e of ev) if (e.kind === 'alarm' && e.what === 'dog' && t >= e.t + 2 && t <= e.t + 14) { const d = b.props?._dog; if (d) found.dog = { x: d.x, z: d.z, y: 0, key: 'dog' }; }
      if (beats.includes('lights') && b._lightsSparked && b._floods?.length) { const f = b._floods[0].position; found.lights = { x: f.x, z: f.z, y: 0, key: 'lights' }; }
      if (beats.includes('scout')) for (const e of ev) if (e.kind === 'scout' && t >= e.t + 1 && t <= e.t + 10) { const q = pos(e.units[0]); if (q) found.scout = { ...q, key: 'scout' }; }
      if (beats.includes('wake')) for (const e of ev) if (e.kind === 'say' && e.ctx === 'aftermath' && t >= e.t + 0.8 && t <= e.t + 3) found.wake = { x: 0, z: 0, y: 0, key: e.text.slice(0, 24) };
      if (beats.includes('flare')) for (const e of ev) if (e.kind === 'flare' && t >= e.t + 1 && t <= e.t + e.secs - 1) found.flare = { x: e.x, z: e.z, y: 0, key: 'flare' + e.t };
      if (beats.includes('fire')) for (const e of ev) if (e.kind === 'fire' && t >= e.t + 4 && t <= e.t + 25) found.fire = { x: e.x, z: e.z, y: 0, key: 'fire' + e.structure };
      return { phase: c?.phase, offer: c?.offer ?? null, bt: +t.toFixed(2), found, kinds: [...new Set(ev.map(e => e.kind + (e.what ? ':' + e.what : '')))], lt: ev.filter(e => e.kind === 'lights' || e.kind === 'breach').map(e => e.kind + '@' + e.t),  dog: !!b.props?._dog, floods: b._floods?.length ?? 0, sp: b._lightsSparked, fo: b._floodsOutAt, tm: b.time, ln: b.lightNight, bn: b.battle?.night, caption: b.lines?.slice(-1)[0]?.text ?? '' };
    }, [FPS, beats]);
    p++;
    if (st.offer != null) await page.evaluate(() => window.__cb.game.getState().midStance(null));
    if (p % 25 === 0) console.log('t', p, st.phase, st.bt, JSON.stringify(Object.keys(st.found ?? {})), JSON.stringify(st.dbg ?? ''));
    if (st.phase === 'aftermath') { console.log('BREAK aftermath', p, st.bt); break; }
    if (st.bt == null) continue;
    for (const k of st.kinds ?? []) (globalThis.__kinds ??= new Set()).add(k); if (st.dog) globalThis.__dog = true; globalThis.__floods = Math.max(globalThis.__floods ?? 0, st.floods ?? 0); if (st.sp) globalThis.__sp = true; if (st.lt?.length && globalThis.__lt !== st.lt.join()) { globalThis.__lt = st.lt.join(); console.log('LT', st.bt, JSON.stringify(st.lt)); } if (st.bt >= 67 && !globalThis.__fo) { globalThis.__fo = 1; console.log('FLOODOUT', JSON.stringify({ fo: st.fo, tm: st.bt, ln: st.ln, bn: st.bn })); }
    let did = false;
    for (const [kind, q] of Object.entries(st.found)) {
      const key = kind + ':' + q.key;
      if (shotLog.filter(x => x.key === key).length >= per) continue;
      { const last = shotLog.filter(x => x.key === key).pop(); if (last && st.bt - last.bt < 1.2) continue; }   // spread the frames over the beat
      await page.evaluate(async ([kind, q]) => {
        const g = window.__cb.world.groundAt;
        if (kind === 'wake') { window.__force = null; window.__cb.qa.skipDraw = false; window.__pump(10); return; }
        const wide = kind === 'flare' || kind === 'fire' || kind === 'answer' || kind === 'lights';
        const d = wide ? 2.2 : kind === 'flag' ? 1.1 : (kind === 'panic' || kind === 'sling') ? 1.3 : 0.8;
        window.__force = { eye: { x: q.x + d * 0.8, y: g(q.x, q.z) + (wide ? 0.9 : kind === 'flag' ? 0.42 : (kind === 'panic' || kind === 'sling') ? 0.75 : 0.28), z: q.z - d * 0.6 }, look: { x: q.x, y: g(q.x, q.z) + (wide ? 0.35 : kind === 'flag' ? q.y + 0.3 : q.y + 0.12), z: q.z }, fov: wide ? 62 : 50 };
        window.__cb.qa.skipDraw = false; window.__pump(10);
      }, [kind, q]);
      await page.evaluate(() => new Promise(r => setTimeout(r, 30)));
      if (!globalThis.__cdp) globalThis.__cdp = await page.context().newCDPSession(page);
      const shot = await globalThis.__cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
      const file = `${kind}_${String(shots).padStart(2, '0')}.jpg`;
      writeFileSync(`${outDir}/${file}`, Buffer.from(shot.data, 'base64'));
      shotLog.push({ key, kind, file, bt: st.bt, caption: st.caption, flagInfo: kind === 'flag' ? await page.evaluate(() => window.__flagInfo) : undefined });
      shots++; did = true; break;
    }
    void did;
  }
  writeFileSync(`${outDir}/shots.json`, JSON.stringify(shotLog, null, 1));
  console.log('KINDS', [...(globalThis.__kinds ?? [])].join(','), 'dog', !!globalThis.__dog, 'floods', globalThis.__floods, 'sparked', !!globalThis.__sp);
  console.log('SHOTS', shotLog.length, JSON.stringify(shotLog.map(x => x.file + '@' + x.bt)));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
