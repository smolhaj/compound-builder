// The invasion movie: a night raid whose crew rams (or blows) its way through the wall, fights across the yard and into the house.
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
  const info = await page.evaluate(async ([hour0, scan, wantDay]) => {
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
    const mk = d => ({ id: 'e9', kind: 'gang', day: d, title: 'An armed crew', dossier: ["10 of them, organized, rifles. They've been working the farms east of town.", 'They know what they want, and they think you have it.'], size: 10, armed: true, strength: 120, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade'], temper: 'hard' });
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
  }, [hour0, scan, wantDay]);
  console.log(JSON.stringify(info), new Date().toISOString());
  if (scan) { await browser.close(); vite.kill(); process.exit(0); }
  await frames(10); console.log('frames ok', new Date().toISOString());
  await page.waitForTimeout(3500);
  console.log('click defend');
  await page.getByRole('button', { name: /^Defend/ }).click();
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await frames(3);
  const q0 = await page.evaluate(() => window.__cb.store.getState().quality);
  await page.evaluate(() => { window.__manual = true; });
  await frames(0).catch(() => {});
  // wait for the in-flight real rAF callback to re-queue itself
  await page.waitForFunction(() => window.__q.length > 0, null, { polling: 100 });
  await page.evaluate(() => { window.__fakeNow = performance.now(); window.__pump(16); window.__pump(16); });
  const plan = await page.evaluate(() => window.__cb.game.getState().cutscene.plan.scenes.map(sc => sc.kind));
  console.log('plan', JSON.stringify(await page.evaluate(() => window.__cb.game.getState().cutscene.plan.scenes.map(sc => [sc.kind, sc.gap, sc.lead, sc.fight, sc.tail])))); console.log('scenes', plan.join(','), 'totalReal', await page.evaluate(() => window.__cb.game.getState().cutscene.plan.totalReal));
  let n = 0, p = 0, lastCap = -1, tAfter = 0, offerHold = 0;
  const t0 = Date.now();
  const caps = [], tl = [];   // { file, pumps }: how many pumps (1/FPS s each) the frame stands for
  while (n < maxF) {
    // dense windows are captured every pump; the rest every `sparse`-th (a time-lapse); before --from nothing is drawn at all
    const secs = p / FPS;
    const dense = dr.length > 0 && dr.some(([a, b]) => secs >= a && secs < b);
    const grab = secs >= fromS && (dense || p % sparse === 0);
    const st = await page.evaluate(async ([q0, FPS, grab, lowrender]) => {
      const cb = window.__cb, gs = cb.game.getState();
      cb.qa.skipDraw = !grab;   // (normal drawing, but a frame nobody captures is not drawn: skipping ahead and time-lapse cost almost nothing)
      const drawn = lowrender && grab ? cb.qa.renderFull('medium') : null;
      window.__pump(1000 / FPS);
      if (drawn) await drawn;
      const w = cb.store.getState(); if (w.quality !== q0) w.setQuality(q0); w.setPerfNotice(null);
      const c = gs.cutscene;
      const b = cb.battle;
      const note = window.__breach?.note;
      return { note, phase: c?.phase, offer: c?.offer ?? null, bt: b?.playing ? +b.time.toFixed(2) : null, ev: b?.playing ? b.battle.events.filter(e => ['ram', 'charge', 'gap', 'breach', 'end', 'down'].includes(e.kind)).map(e => e.kind + '@' + e.t) : null };
    }, [q0, FPS, grab, lowrender]);
    p++;
    if (st.bt != null && Math.round(st.bt * 10) % 50 === 0) tl.push(`p${p} t${(p / FPS).toFixed(1)} bt${st.bt}`);
    if (st.ev && st.bt < 0.5 && st.note) console.log('breach note:', st.note);
    if (st.ev && st.bt < 0.5 && tl.evAt !== st.ev.join()) { tl.evAt = st.ev.join(); console.log('events', st.ev.join(' ')); }
    if (grab) {
      const meta = await page.evaluate(async () => {
        const { useCutsceneView } = await import('/src/store/cutsceneStore.ts');
        const v = useCutsceneView.getState().view, a = window.__cb.player.audit(), b = window.__cb.battle;
        return { label: v?.sceneLabel, scene: v?.scene, seg: v?.seg, hour: v?.hour, inside: a?.inside, near: a?.nearest, kind: a?.kind, fb: a?.fallbacks, bt: b?.playing ? +b.time.toFixed(2) : null };
      });
      // let React flush the overlay
      await page.evaluate(() => new Promise(r => setTimeout(r, 30)));
      if (!globalThis.__cdp) globalThis.__cdp = await page.context().newCDPSession(page);
      const shot = await globalThis.__cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      const file = `f${String(n).padStart(5, '0')}.jpg`;
      writeFileSync(`${outDir}/${file}`, Buffer.from(shot.data, 'base64'));
      if (caps.length) caps[caps.length - 1].pumps = p - 1 - lastCap;
      caps.push({ file, pumps: 1 }); lastCap = p - 1;
      log.push({ n, p, t: +(secs).toFixed(2), phase: st.phase, offer: st.offer, ...meta });
      n++;
      if (n % 50 === 0) console.log(`frame ${n} (${(p / FPS).toFixed(1)}s) ${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame phase=${st.phase} scene=${meta.label} seg=${meta.seg}`);
    }
    if (st.offer != null) { offerHold++; if (offerHold >= 3 * FPS) { await page.evaluate(() => window.__cb.game.getState().midStance(null)); offerHold = 0; } }
    else offerHold = 0;
    if (st.phase === 'aftermath') { tAfter++; if (tAfter >= afterSecs * FPS) break; }
    else if (st.phase !== 'playing' && st.phase !== 'prompt') { console.log('phase', st.phase); if (++tAfter > 2 * FPS) break; }
  }
  if (!caps.length) { console.log('no frames captured'); process.exit(0); }
  if (caps.length) caps[caps.length - 1].pumps = Math.max(1, p - lastCap);
  writeFileSync(`${outDir}/log.json`, JSON.stringify(log));
  writeFileSync(`${outDir}/timeline.txt`, tl.join('\n'));
  // each captured frame is held for the pumps it stands for (a time-lapse stretch shows fewer, longer frames): an ffconcat list
  writeFileSync(`${outDir}/frames.txt`, caps.map(c => `file '${c.file}'\nduration ${(c.pumps / FPS).toFixed(4)}`).join('\n') + `\nfile '${caps[caps.length - 1].file}'\n`);
  const mp4 = opt('--mp4', null);
  if (mp4) {
    // 24 fps H.264, crf 30, faststart
    await new Promise((ok, fail) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${outDir}/frames.txt`, '-r', '24', '-vf', 'fps=24', '-c:v', 'libx264', '-crf', '30', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' }).on('exit', c => (c === 0 ? ok() : fail(new Error('ffmpeg ' + c)))));
    console.log('wrote', mp4);
  }
  console.log('done frames', n, 'secs', (p / FPS).toFixed(1), 'wall min', ((Date.now() - t0) / 60000).toFixed(1));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
