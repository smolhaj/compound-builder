// Deterministic raid-cutscene movie: the page's rAF is replaced by a manual pump (1/24 s of cutscene time per frame), a JPEG per frame.
//   node scripts/raidMovie.mjs --hour 2.25 --out /tmp/claude-0/movie/night [--max N] [--quality high] [--day N] [--fps 10] [--mp4 night.mp4]
//   --day N stages that encounter day (default: the first day whose siege has 4+ scenes with fires); --mp4 encodes 24 fps H.264 (crf 30, faststart) at the end
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
const afterSecs = Number(opt('--after', 4)), wantDay = Number(opt('--day', 0));
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
  await page.goto(`http://localhost:${port}/?seed=7`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  if (quality) await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  console.log('quality', await page.evaluate(() => window.__cb.store.getState().quality));
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };
  const info = await page.evaluate(async ([hour0, wantDay]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const { planSiege } = await import('/src/sim/siege.ts');
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
    G.setState(s => { const g = structuredClone(s.game); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } return { game: g }; });
    const g = structuredClone(G.getState().game);
    const SUB = 0.25 / 24;
    const day = Math.floor(g.disaster.hitAt + 20);
    g.clock.t = Math.round((day - 0.25 + hour0 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.meds = 3; g.stock.sandbags = 3; g.stock.dog = 1; g.armory.ammo['556'] = 2000;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
    let ed = wantDay;
    for (let d = 1; d < 3000 && !ed; d++) {
      const p = planSiege({ kind: 'gang', size: 10, temper: 'hard', hour: hour0, seed: g.seed * 131 + d * 7 + 1, fought: true, fightSeconds: 90 });
      if (p.scenes.length >= 4 && p.scenes.some(sc => sc.kind === 'fires')) { ed = d; break; }
    }
    g.gate.pending = { id: 'e9', kind: 'gang', day: ed, title: 'An armed crew', dossier: ["10 of them, organized, rifles. They've been working the farms east of town.", 'They know what they want, and they think you have it.'], size: 10, armed: true, strength: 120, wants: { canned: 8, fuel: 4 }, stances: ['hide', 'parley', 'defend', 'trade'], temper: 'hard' };
    G.getState().load(g);
    return { day: ed };
  }, [hour0, wantDay]);
  console.log(JSON.stringify(info));
  await frames(10);
  await page.waitForTimeout(3500);
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
  console.log('scenes', plan.join(','), 'totalReal', await page.evaluate(() => window.__cb.game.getState().cutscene.plan.totalReal));
  let n = 0, tAfter = 0, offerHold = 0, lastSceneLabel = '';
  const t0 = Date.now();
  while (n < maxF) {
    const st = await page.evaluate(([q0, FPS]) => {
      const cb = window.__cb, gs = cb.game.getState();
      window.__pump(1000 / FPS);
      const w = cb.store.getState(); if (w.quality !== q0) w.setQuality(q0); w.setPerfNotice(null);
      const c = gs.cutscene;
      return { phase: c?.phase, offer: c?.offer ?? null, game: cb.game.getState().cutscene?.phase };
    }, [q0, FPS]);
    const meta = await page.evaluate(async () => {
      const { useCutsceneView } = await import('/src/store/cutsceneStore.ts');
      const v = useCutsceneView.getState().view, a = window.__cb.player.audit();
      return { label: v?.sceneLabel, scene: v?.scene, seg: v?.seg, hour: v?.hour, inside: a?.inside, near: a?.nearest, kind: a?.kind, fb: a?.fallbacks };
    });
    // let React flush the overlay
    await page.evaluate(() => new Promise(r => setTimeout(r, 30)));
    if (!globalThis.__cdp) globalThis.__cdp = await page.context().newCDPSession(page);
    const shot = await globalThis.__cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${outDir}/f${String(n).padStart(5, '0')}.jpg`, Buffer.from(shot.data, 'base64'));
        log.push({ n, t: +(n / FPS).toFixed(2), phase: st.phase, offer: st.offer, ...meta });
    n++;
    if (n % 50 === 0) console.log(`frame ${n} (${(n / FPS).toFixed(1)}s) ${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame phase=${st.phase} scene=${meta.label} seg=${meta.seg}`);
    if (st.offer != null) { offerHold++; if (offerHold >= 3 * FPS) { await page.evaluate(() => window.__cb.game.getState().midStance(null)); offerHold = 0; } }
    else offerHold = 0;
    if (st.phase === 'aftermath') { tAfter++; if (tAfter >= afterSecs * FPS) break; }
    else if (st.phase !== 'playing' && st.phase !== 'prompt') { console.log('phase', st.phase); if (++tAfter > 2 * FPS) break; }
  }
  writeFileSync(`${outDir}/log.json`, JSON.stringify(log));
  const mp4 = opt('--mp4', null);
  if (mp4) {
    await new Promise((ok, fail) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${outDir}/f%05d.jpg`, '-r', '24', '-c:v', 'libx264', '-crf', '30', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' }).on('exit', c => (c === 0 ? ok() : fail(new Error('ffmpeg ' + c)))));
    console.log('wrote', mp4);
  }
  console.log('done frames', n, 'secs', (n / FPS).toFixed(1), 'wall min', ((Date.now() - t0) / 60000).toFixed(1));
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
