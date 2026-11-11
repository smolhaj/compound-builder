// FLOAT check: plays a real game's raid through the real app and, when the battle has ladders, pins the camera to a ladder (a defender's up the fighting step, a raider's up the wall) so the climb and the platform can be seen; also grabs the interior. (Original header: LIVE cutscene audit (cutscene realism): plays real games through the real app (store -> stageRaid -> Watch -> CutscenePlayer.prepare -> BattleRenderer) and, on every pumped frame, checks where each person actually IS against the live world's own walk collision (walkBlocked) and the scene's doors / breaches. Also grabs frames at the beats (--shots) and reports renderer.info.
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
  const info = await page.evaluate(async ([hour0, scan, wantDay, KIND, SIZE, TEMPER]) => {
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
    let ed = 0;
    const { stageRaid } = await import('/src/sim/raidCutscene.ts');
    const mk = d => ({ id: 'e9', kind: KIND, day: d, title: 'An armed crew', dossier: ["10 of them, organized, rifles. They've been working the farms east of town.", 'They know what they want, and they think you have it.'], size: SIZE, armed: true, strength: 120, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade'], temper: TEMPER });
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
    }
    if (scan) return { cands };
    g.gate.pending = mk(ed);
    G.getState().load(g);
    return { day: ed };
  }, [hour0, scan, wantDay, opt('--kind', 'gang'), Number(opt('--crewsize', 10)), opt('--temper', 'hard')]);
  console.log(JSON.stringify(info), new Date().toISOString());
  if (scan) { await browser.close(); vite.kill(); process.exit(0); }
  await frames(10); console.log('frames ok', new Date().toISOString());
  await page.waitForTimeout(3500);
  console.log('click defend');
  await page.getByRole('button', { name: /^Defend/ }).click();
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
  let p = 0, shots = 0;
  const shotLog = [];
  const maxPer = Number(opt('--per', 10));
  while (shots < Number(opt('--shots', 60)) && p < 12 * FPS * 60) {
    const st = await page.evaluate(async ([FPS]) => {
      const cb = window.__cb, gs = cb.game.getState(); cb.qa.skipDraw = true; window.__pump(1000 / FPS);
      const b = cb.battle, c = gs.cutscene;
      if (!b?.playing) return { phase: c?.phase, offer: c?.offer ?? null, bt: null };
      const ev = b.battle.events, acts = b.actors();
      const homes = acts.filter(u => u.side === 'home' && !u.dead);
      const C = { x: homes.reduce((s, u) => s + u.x, 0) / Math.max(1, homes.length), z: homes.reduce((s, u) => s + u.z, 0) / Math.max(1, homes.length) };
      const up = acts.filter(u => !u.dead && !u.gone && u.y > 0.12 && u.post !== 'tower' && u.post !== 'building').sort((a, c2) => c2.y - a.y);
      const kick = ev.find(e => e.kind === 'house_door' && e.action === 'kick' && e.ok), clear = ev.find(e => e.kind === 'say' && e.ctx === 'room_clear'), stack = ev.find(e => e.kind === 'say' && e.ctx === 'stack_door');
      const sh = cb.player._dir?.shot; const dd = b.battle?.invasion?.house?.door; const allR = dd ? [...b._units.entries()].filter(([, u]) => u.def.side === 'raider').map(([id, u]) => id + ':' + (+(u.x - dd.x).toFixed(1)) + ',' + (+(u.z - dd.z).toFixed(1)) + (u.dead ? 'D' : '') + (u.gone ? 'G' : '') + (u.hidden ? 'H' : '')) : []; const near = dd ? [...b._units.values()].filter(u => !u.dead && !u.gone && Math.hypot(u.x - dd.x, u.z - dd.z) < 3.5).map(u => ({ id: u.id, s: u.def.side, dx: +(u.x - dd.x).toFixed(2), dz: +(u.z - dd.z).toFixed(2), y: +u.y.toFixed(2), hid: !!u.hidden })) : []; return { allR, near, dbg: sh ? { eye: sh.eye, look: sh.look, fov: sh.fov, kind: sh.kind, hold: sh.hold, since: sh.since } : null, doors: cb.player._doors, win: b.battle?.invasion?.interior, door: b.battle?.invasion?.house?.door, phase: c?.phase, offer: c?.offer ?? null, bt: +b.time.toFixed(2), C, raiderUp: up.find(u => u.side === 'raider') ?? null, kickT: kick?.t ?? null, clearT: clear?.t ?? null, stackT: stack?.t ?? null, caption: b.lines?.slice(-1)[0]?.text ?? '' };
    }, [FPS]);
    p++;
    if (st.offer != null) await page.evaluate(() => window.__cb.game.getState().midStance(null));
    if (st.phase === 'aftermath') break;
    if (st.bt == null) continue;
    let tag = null;
    if (st.raiderUp && shotLog.filter(x => x.tag === 'raider').length < maxPer) {
      tag = 'raider';
      // outside the wall, 0.75 away from the climber on the side away from the house, a little to one side, level with the climb
      const u = st.raiderUp, dx = u.x - st.C.x, dz = u.z - st.C.z, l = Math.hypot(dx, dz) || 1, ox = dx / l, oz = dz / l;
      await page.evaluate(async ([u, ox, oz]) => {
        const g = window.__cb.world.groundAt;
        window.__force = { eye: { x: u.x + ox * 0.75 - oz * 0.3, y: g(u.x, u.z) + u.y * 0.8 + 0.1, z: u.z + oz * 0.75 + ox * 0.3 }, look: { x: u.x, y: g(u.x, u.z) + u.y * 0.7 + 0.1, z: u.z }, fov: 55 };
      }, [u, ox, oz]);
    } else if (!st.raiderUp) {
      for (const [name, a, b2] of [['stack', st.stackT, 3], ['kick', st.kickT, 4], ['clear', st.clearT, 4]]) {
        if (a != null && st.bt >= a - 1.5 && st.bt <= a + b2 && shotLog.filter(x => x.tag === name).length < maxPer) tag = name;
      }
      if (tag) await page.evaluate(() => { window.__force = null; });
    }
    if (tag) { const lastT = shotLog.filter(x => x.tag === tag).pop(); if (lastT && st.bt - lastT.bt < (tag === 'raider' ? 0.5 : 0.6)) tag = ''; }
    if (!tag) continue;
    await page.evaluate(() => { window.__cb.qa.skipDraw = false; window.__pump(10); });
    await page.evaluate(() => new Promise(r => setTimeout(r, 30)));
    if (!globalThis.__cdp) globalThis.__cdp = await page.context().newCDPSession(page);
    const shot = await globalThis.__cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    const file = `${tag}_${String(shots).padStart(2, '0')}.jpg`;
    writeFileSync(`${outDir}/${file}`, Buffer.from(shot.data, 'base64'));
    shotLog.push({ tag, file, bt: st.bt, caption: st.caption, ru: tag === 'raider' ? st.raiderUp : undefined, dbg: tag === 'kick' || tag === 'stack' || tag === 'clear' ? { allR: st.allR, near: st.near, dbg: st.dbg, doors: st.doors, win: st.win, door: st.door } : undefined });
    shots++;
  }
  writeFileSync(`${outDir}/shots.json`, JSON.stringify(shotLog, null, 1));
  console.log('SHOTS', shotLog.length, JSON.stringify(shotLog.map(x => x.file + '@' + x.bt)));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
