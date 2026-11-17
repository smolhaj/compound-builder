/**
 * FL6: the live QA harness for the felt layer (docs/FELT_LAYER.md section 7). For every kind that can be triggered today (the Free build /
 * God Mode path, `triggerDisaster`), played in the real app at 1100 x 700 on the real sim, it saves under shots/felt/<kind>/ (gitignored):
 *   01-hit-open, 02-hit-mid, 03-hit-title   the hit moment (CSS cinematic, real time; the frames are lifted with renderNow)
 *   04-daycard                               the day it happened, with "What changed" and "Do first"
 *   05-decision                              the first felt decision card, HUD up
 *   06-goal                                  the signature goal card
 *   07-board, 08-radio                       the Compound board ("What's different" + heard) and the Rumors panel
 *   w1-eye, w1-aerial, m1-eye, m1-aerial     the world at week 1 and month 1, HUD hidden, no modal up (+ w1-night with --night)
 *   peace-eye, peace-aerial                  the same poses in peacetime (once, in shots/felt/_peace)
 * plus sheet.png (a contact sheet per kind), result.json (metrics and problems) and, at the end, a summary table.
 *
 *   flock /tmp/cb.lock node scripts/feltShots.mjs [--kinds a,b,c | --kinds all] [--quality low|medium|high] [--out shots/felt]
 *       [--port 5979] [--quick] [--night] [--gates] [--audit] [--min 4]
 * --quick: skip the month-1 pair and the click-through tests (about half the time).
 * --gates: also raise each order-package gate card (tollkeeper, posse, checkpoint, requisition, draft, informant ...) and the cyber Verify
 *          button, shoot them, and click every answer to see that something happens (a dead button is a problem).
 * --audit: exit 1 on any problem (page or console error, a modal over a world shot, week-1 eye AND aerial under --min percent from peacetime,
 *          a card clipped at 1100 x 700, a dead button, a radio claim that never resolves, a missing hit title).
 * Run a few kinds at a time (software GL is slow) and merge with `--summary` (reads every result.json under --out).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.includes(k);
const port = Number(opt('--port', 5979)), quality = opt('--quality', 'medium');
const W = 1100, H = 700;
const outRoot = resolve(opt('--out', 'shots/felt'));
const worldOnly = flag('--world'), quick = flag('--quick') || flag('--world'), night = flag('--night'), gates = flag('--gates'), audit = flag('--audit');
const minPct = Number(opt('--min', '4'));

/** The summary table over every result.json under outRoot. */
function summary() {
  const rows = [];
  for (const d of existsSync(outRoot) ? readdirSync(outRoot) : []) { const f = `${outRoot}/${d}/result.json`; if (existsSync(f)) rows.push(JSON.parse(readFileSync(f, 'utf8'))); }
  console.log('| kind | hit | daycard | decision | goal | board | radio resolves | week-1 eye % | week-1 aerial % | problems |');
  console.log('|---|:-:|:-:|:-:|:-:|:-:|---|--:|--:|--:|');
  for (const r of rows) console.log(`| ${r.kind} | ${r.hit ? 'y' : 'n'} | ${r.dayCard ? 'y' : 'n'} | ${r.decision ? 'y' : 'n'} | ${r.goal ? 'y' : 'n'} | ${r.board ? 'y' : 'n'} | ${r.scout ? `${r.scout.confirmed}c ${r.scout.false}f ${r.scout.open}o` : '-'} | ${r.diff?.w1_eye ?? '-'} | ${r.diff?.w1_aerial ?? '-'} | ${r.problems.length} |`);
  return rows;
}
if (flag('--summary')) { const rows = summary(); for (const r of rows) for (const p of r.problems) console.log(`${r.kind}: ${p}`); process.exit(0); }

mkdirSync(outRoot, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error(`vite exited ${c}`))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let problems = [];
const note = (kind, msg) => { problems.push(msg); console.error(`  PROBLEM ${kind}: ${msg}`); };
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => { problems.push('pageerror: ' + e.message.slice(0, 160)); console.error('pageerror:', e.message.slice(0, 160)); });
  page.on('console', c => { if (c.type() === 'error') { const t = c.text().slice(0, 160); if (!/Failed to load resource|WebGL|GPU stall|swiftshader/i.test(t)) { problems.push('console: ' + t); console.error('console error:', t); } } });
  await page.goto(`http://localhost:${port}/?seed=7&lowrender`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(q => { window.__cb.qa.weather = true; window.__cb.store.getState().setQuality(q); }, quality);
  const frames = async k => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(x => window.__cb.qa.frames >= x, f0 + k, { polling: 200 }); };

  // the kinds that can be triggered today: the Free build / God Mode list (felt/triggerMenu.ts)
  const triggerable = await page.evaluate(async () => (await import('/src/sim/felt/triggerMenu.ts')).triggerChoices().map(c => c.kind));
  const want = opt('--kinds', 'mega_quake,solar_flare,dam_flood');
  const kinds = want === 'all' ? triggerable : want.split(',');
  for (const k of kinds) if (!triggerable.includes(k)) { console.error(`${k} cannot be triggered yet (no DisasterDef); skipped`); }
  console.log('triggerable:', triggerable.join(' '));

  // a cabin to look at, then a pristine copy of the state to start every kind from
  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    window.__spot = sp;
  });
  await frames(4);
  await page.evaluate(() => { window.__pristine = structuredClone(window.__cb.game.getState().game); });

  // ---- in-page drivers over the real sim ----
  await page.evaluate(async () => {
    const [D, E, CA, FS, RU, FR, GL, CL] = await Promise.all([import('/src/sim/disaster.ts'), import('/src/sim/engine.ts'), import('/src/sim/felt/cards.ts'), import('/src/sim/felt/state.ts'), import('/src/sim/rumors.ts'), import('/src/sim/felt/registry.ts'), import('/src/sim/felt/goalLib.ts'), import('/src/sim/felt/claims.ts')]);
    const FSTORE = await import('/src/store/feltStore.ts');
    const G = window.__cb.game;
    const clear = g => { g.gate.pending = null; g.gate.incoming = null; g.gate.card = null; g.gate.aftermath = null; };
    window.__fx = {
      /** A fresh world from the pristine state with the kind set to hit in 0.02 days. */
      start(kind) {
        const g = structuredClone(window.__pristine);
        g.disaster.mode = 'god'; g.disaster.phase = 'peace'; g.disaster.fx = undefined; g.radio = undefined;
        D.triggerDisaster(g.disaster, g.clock.t, kind, g.seed, 14);
        g.disaster.fate = 'full';
        g.stock.sw_radio = 1;
        for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
        clear(g);
        g.clock.t = g.disaster.hitAt - 0.02; g.clock.speed = 0;
        window.__cb.store.setState({ hudHidden: false });
        G.setState({ game: g, dayCard: null, dayCardSeen: -1, resumeTo: null, cutscene: null });
        FSTORE.useFeltStore.setState({ hitShown: -1 });
        return { hitAt: g.disaster.hitAt, warnAt: g.disaster.warnAt, variant: g.disaster.variant ?? null };
      },
      /** Run the pure sim in 0.25-day steps to `day` after the hit. `untilCard`: stop when a felt card is pending. */
      run(day, untilCard = false) {
        let g = structuredClone(G.getState().game), n = 0;
        while (g.clock.t - g.disaster.hitAt < day && n++ < 4000) {
          clear(g);
          g = E.step(g, 0.25);
          if (g.ending && !g.ending.continued) break;
          if (untilCard && FS.feltOf(g)?.cards?.pending) break;
        }
        clear(g);
        G.setState({ game: g, dayCard: null, resumeTo: null, cutscene: null });
        return { day: +(g.clock.t - g.disaster.hitAt).toFixed(2), card: FS.feltOf(g)?.cards?.pending?.id ?? null, over: !!(g.ending && !g.ending.continued) };
      },
      /** Take the fallback of a waiting felt card (so no modal covers a world shot). */
      settle() {
        const g = structuredClone(G.getState().game), c = CA.pendingCard(g);
        if (c) { const o = CA.fallbackOf(g, c); CA.answerCard(g, c.id, o.id); }
        clear(g); G.setState({ game: g });
        return !!c;
      },
      noon() { const g = structuredClone(G.getState().game); const pc = CA.pendingCard(g); if (pc) CA.answerCard(g, pc.id, CA.fallbackOf(g, pc).id); clear(g); g.gate.next = 1e9; g.clock.t = Math.floor(g.clock.t) + 0.25; g.clock.speed = 0; G.setState({ game: g }); window.__cb.feltSync(true); },
      hour(h) { const g = structuredClone(G.getState().game); g.clock.t = Math.floor(g.clock.t) + 0.25 + (h - 12) / 24; g.clock.speed = 0; G.setState({ game: g }); window.__cb.feltSync(true); },
      /** Radio: send a scout to every open claim in turn, run two days, report how each line was settled. */
      scout() {
        let g = structuredClone(G.getState().game);
        for (const p of g.people) p.skills.hunter = Math.max(p.skills.hunter ?? 0, 30);
        const ids = (g.radio?.heard ?? []).filter(h => h.claim && h.status === 'open').map(h => h.id).slice(0, 8);
        const sent = [];
        for (const id of ids) {
          const who = g.people.find(p => p.age >= 16 && !g.radio?.scout);
          if (!who) break;
          const w = RU.sendScout(g, id, who.id);
          if (w) { sent.push({ id, why: String(w).slice(0, 60) }); continue; }
          sent.push({ id });
          clear(g); g = E.step(g, 1.5); clear(g); g = E.step(g, 0.5);
        }
        const heard = (g.radio?.heard ?? []);
        const rows = heard.map(h => ({ id: h.id, text: h.text, status: h.status, claim: !!h.claim, truth: h.truth }));
        clear(g);
        G.setState({ game: g, dayCard: null, resumeTo: null, cutscene: null });
        return { sent, rows };
      },
      /** The felt state for the report. */
      info() {
        const g = G.getState().game, f = FS.feltOf(g);
        const chain = GL.feltChain(g);
        return { day: +(g.clock.t - g.disaster.hitAt).toFixed(2), cards: f?.cards ?? null, goal: chain ? { heading: chain.heading, current: chain.current?.title, line: chain.current?.line, n: chain.goals.length, act: chain.current?.act?.label ?? null, off: chain.current?.act?.off ?? null } : null, feed: g.disaster.fx?.feltFeed?.lines?.map(l => l.text) ?? [], heard: (g.radio?.heard ?? []).map(h => ({ text: h.text, status: h.status, claim: !!h.claim })), news: g.disaster.news.slice(-3).map(n => n.text), money: Math.round(g.money) };
      },
    };
  });

  // a seekable clock for the hit moment (it reads performance.now): frozen at a chosen second after it mounted, so the frames are deterministic
  await page.evaluate(() => {
    const o = performance.now.bind(performance);
    window.__pn = null; window.__t0 = null; window.__po = o;
    performance.now = () => window.__pn ?? o();
    window.__cb.game.subscribe(s => { if (s.dayCard !== null && window.__t0 === null) window.__t0 = o(); });
  });
  const hitSeq = await page.evaluate(async () => { const m = await import('/src/sim/felt/hitMoment.ts'); const out = {}; for (const k of (await import('/src/sim/felt/triggerMenu.ts')).triggerChoices().map(c => c.kind)) { const h = m.hitFor(k); if (h) { out[k] = { total: m.duration(h), titleAt: null }; for (let t = 0; t <= m.duration(h); t += 0.05) if (m.at(h, t).title) { out[k].titleAt = +t.toFixed(2); break; } } } return out; });
  const seek = sec => page.evaluate(sec => { window.__pn = (window.__t0 ?? window.__po()) + sec * 1000 + 20; }, sec);
  const unfreeze = () => page.evaluate(() => { window.__pn = null; window.__t0 = null; });

  // ---- shooting helpers ----
  const cdp = await page.context().newCDPSession(page);
  const save = async (file, full) => {
    await page.evaluate(q => window.__cb.qa.renderFull ? null : null, quality);
    if (full) { await frames(2); await page.evaluate(q => window.__cb.qa.renderFull(q), quality); } else await page.evaluate(() => window.__cb.qa.renderNow());
    const r = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png' }), new Promise((_, no) => setTimeout(() => no(new Error('capture timeout')), 60000))]);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };
  const view = mode => page.evaluate(mode => {
    const cb = window.__cb, sp = window.__spot, gr = cb.world.groundAt;
    cb.store.setState({ hudHidden: true });
    if (mode === 'eye') { const x = sp[0] + 2, z = sp[1] + 7; cb.qa.pose = { x, y: gr(x, z) + 0.34, z, lx: sp[0] - 1, ly: gr(sp[0], sp[1]) + 0.9, lz: sp[1] - 8, fov: 66 }; }
    else if (mode === 'road') { // from the yard looking up the county road past the gate (where the felt marks stand)
      const x = sp[0] + 3, z = sp[1] + 6, tz = sp[1] - 4, tx = cb.world.county.x(tz) - 4;
      cb.qa.pose = { x, y: gr(x, z) + 0.8, z, lx: tx, ly: gr(tx, tz) + 0.2, lz: tz, fov: 66 };
    }
    else { cb.qa.pose = null; cb.cam.target.set(sp[0], gr(sp[0], sp[1]), sp[1]); cb.cam.radius = 30; cb.cam.pitch = 0.62; cb.cam.yaw = 0.7; }
  }, mode);
  /** The milestone popup ("First wave survived") is not a role=dialog; it counts as a modal over the view (reported once, then dismissed). */
  const milestone = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent ?? '').trim() === 'OK'); if (!b) return null; const t = b.closest('div')?.parentElement?.textContent?.slice(0, 40) ?? 'milestone'; b.click(); return t; });
  /** Camera not inside geometry: the eye pose is 2 and 7 units from the cabin spot; no structure may be within its footprint of it. */
  const insideGeometry = () => page.evaluate(() => {
    const cb = window.__cb, g = cb.game.getState().game, p = cb.qa.pose; if (!p) return null;
    const near = g.structures.filter(s => !s.unplaced && Math.hypot(s.x - p.x, s.z - p.z) < 1.4).map(s => s.kind);
    return near.length ? near : null;
  });
  const modalUp = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }).map(e => e.getAttribute('aria-label') ?? 'dialog'));
  /** Clipped text and out-of-view report for the dialog or card under `sel`. */
  const fit = sel => page.evaluate(([sel, W, H]) => {
    const root = document.querySelector(sel); if (!root) return null;
    const r = root.getBoundingClientRect();
    const scroller = [root, ...root.querySelectorAll('*')].find(e => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 2);
    const clipped = [];
    for (const e of root.querySelectorAll('*')) {
      const cs = getComputedStyle(e); if (cs.display === 'none') continue;
      if ((e.scrollWidth > e.clientWidth + 2 && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis')) && e.clientWidth > 0) clipped.push((e.textContent ?? '').slice(0, 40));
    }
    const btns = [...root.querySelectorAll('button')].map(b => { const br = b.getBoundingClientRect(); return { t: (b.textContent ?? '').slice(0, 24), off: br.bottom > H + 1 || br.top < -1 || br.right > W + 1, dis: b.disabled }; });
    const text = root.textContent ?? '';
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), scrolls: !!scroller, clipped: clipped.slice(0, 4), btnOff: btns.filter(b => b.off).map(b => b.t), nbtn: btns.length, dis: btns.filter(b => b.dis).map(b => b.t), bad: /undefined|NaN|\[object|\{\{|null\b/.test(text) ? (text.match(/.{0,24}(undefined|NaN|\[object|\{\{|null\b).{0,12}/) ?? [''])[0] : null, outOfView: r.top < -1 || r.bottom > H + 1 || r.left < -1 || r.right > W + 1 };
  }, [sel, W, H]);
  const diff = async (a, b) => {
    const pa = readFileSync(a).toString('base64'), pb = readFileSync(b).toString('base64');
    return page.evaluate(async ([pa, pb]) => {
      const load = async s => { const im = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(im.width, im.height); const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const [x, y] = await Promise.all([load(pa), load(pb)]);
      let sum = 0; for (let i = 0; i < x.length; i += 4) sum += (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2])) / 3;
      return sum / (x.length / 4) / 255 * 100;
    }, [pa, pb]);
  };
  const sheet = async (files, out, title) => {
    const imgs = files.map(f => readFileSync(f).toString('base64'));
    const url = await page.evaluate(async ([imgs, names, title]) => {
      const cols = 4, tw = 440, th = Math.round(440 * 700 / 1100), rows = Math.ceil(imgs.length / cols);
      const c = new OffscreenCanvas(cols * tw, rows * (th + 18) + 28), g = c.getContext('2d');
      g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#eee'; g.font = '16px sans-serif'; g.fillText(title, 6, 19);
      for (let i = 0; i < imgs.length; i++) {
        const im = await createImageBitmap(await (await fetch('data:image/png;base64,' + imgs[i])).blob());
        const x = (i % cols) * tw, y = 28 + Math.floor(i / cols) * (th + 18);
        g.drawImage(im, x, y + 16, tw, th); g.fillStyle = '#ccc'; g.font = '12px sans-serif'; g.fillText(names[i], x + 4, y + 12);
      }
      const b = await c.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, [imgs, files.map(f => f.split('/').pop().replace('.png', '')), title]);
    writeFileSync(out, Buffer.from(url, 'base64'));
  };

  // ---- peacetime baselines (the same poses, noon, no disaster) ----
  const peaceDir = `${outRoot}/_peace`; mkdirSync(peaceDir, { recursive: true });
  const peace = {};
  await page.evaluate(() => { const g = structuredClone(window.__pristine); for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; } g.disaster.kind = null; g.disaster.phase = 'peace'; g.clock.t = 30.25 + Math.floor(g.clock.t); g.clock.speed = 0; window.__cb.game.setState({ game: g, dayCard: null, resumeTo: null }); window.__cb.feltSync(true); });
  for (const v of ['eye', 'road', 'aerial']) { await view(v); peace[v] = await save(`${peaceDir}/peace-${v}.png`, true); }

  for (const kind of kinds.filter(k => triggerable.includes(k))) {
    problems = [];
    const dir = `${outRoot}/${kind}`; mkdirSync(dir, { recursive: true });
    console.log(`== ${kind}`);
    const R = { kind, hit: false, dayCard: false, decision: false, goal: false, board: false, scout: null, diff: {}, problems: [], notes: {}, quality };
    const files = [];
    const shoot = async (name, full = false) => { const f = await save(`${dir}/${name}.png`, full); files.push(f); return f; };
    const t0 = Date.now();
    try {
      await page.evaluate(() => { window.__cb.qa.pose = null; });
      const st = await page.evaluate(k => window.__fx.start(k), kind);
      R.notes.start = st;
      await frames(3);
      let r = null;
      if (!worldOnly) {
      // ---- the hit: let the real clock cross it ----
      await page.evaluate(() => window.__cb.game.getState().setSpeed(3));
      for (let n = 0; n < 60; n++) {
        if (await page.evaluate(() => window.__cb.game.getState().dayCard !== null)) break;
        await page.evaluate(() => { const G = window.__cb.game; G.setState(s => { const g = structuredClone(s.game); g.gate.pending = null; g.gate.incoming = null; g.clock.speed = 3; return { game: g, cutscene: null, resumeTo: null }; }); });
        await page.waitForTimeout(700);
      }
      const hitUp = await page.waitForSelector('[data-testid="hit-moment"]', { timeout: 8000 }).then(() => true).catch(() => false);
      R.hit = hitUp;
      if (hitUp) {
        const hs = hitSeq[kind];
        await seek(0.05); await page.waitForTimeout(250);
        const under = await page.evaluate(() => !!document.querySelector('[aria-label="The day it happened"]'));
        if (under) note(kind, 'the day card is mounted under the hit moment (it should wait for it)');
        await shoot('01-hit-open');
        await seek(hs ? Math.min(1.5, hs.total / 3) : 1.5); await page.waitForTimeout(250); await shoot('02-hit-mid');
        if (hs && hs.titleAt !== null) {
          await seek(hs.titleAt + 0.2); await page.waitForTimeout(250);
          const title = await page.$eval('[data-testid="hit-title"]', e => e.textContent).catch(() => null);
          if (title) { R.notes.hitTitle = title; await shoot('03-hit-title'); const f = await fit('[data-testid="hit-title"]'); if (f && (f.left < 0 || f.right > W)) note(kind, `the hit title runs out of the view (${f.left}..${f.right})`); }
          else note(kind, 'the hit moment never showed its title beat');
        } else note(kind, 'the hit sequence has no title beat');
        await unfreeze();
        await page.waitForSelector('[data-testid="hit-moment"]', { state: 'detached', timeout: 15000 }).catch(() => note(kind, 'the hit moment did not end in 15 s'));
      } else note(kind, 'no hit moment showed at the hit (missing hit beat)');
      // ---- the day card ----
      await page.waitForSelector('[aria-label="The day it happened"]', { timeout: 10000 }).then(() => { R.dayCard = true; }).catch(() => note(kind, 'no day card after the hit'));
      if (R.dayCard) {
        await page.waitForTimeout(300);
        await shoot('04-daycard');
        const f = await fit('[aria-label="The day it happened"] > div');
        R.notes.dayCardFit = f;
        if (f) {
          if (f.scrolls) note(kind, 'the day card needs scrolling at 1100 x 700 (its buttons may sit below the fold)');
          if (f.clipped.length) note(kind, `day card text clipped: ${f.clipped.join(' | ')}`);
          if (f.bad) note(kind, `day card shows a raw token: "${f.bad}"`);
          if (f.btnOff.length) note(kind, `day card buttons out of view: ${f.btnOff.join(', ')}`);
        }
        R.notes.doFirst = await page.evaluate(() => [...document.querySelectorAll('[data-testid="do-first"] li')].map(li => ({ t: (li.textContent ?? '').slice(0, 90), btn: !!li.querySelector('button'), dis: li.querySelector('button')?.disabled ?? null })));
        if (!R.notes.doFirst.length) note(kind, 'the day card has no "Do first" steps');
        for (const d of R.notes.doFirst) if (!d.btn) note(kind, `Do first step has no action button: ${d.t.slice(0, 50)}`); else if (d.dis) note(kind, `Do first button disabled: ${d.t.slice(0, 50)}`);
        await page.getByRole('button', { name: 'Face it' }).click({ timeout: 5000 }).catch(() => note(kind, '"Face it" could not be clicked'));
        await page.waitForTimeout(200);
      }
      await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
      // ---- day 1: the goal card ----
      r = await page.evaluate(() => window.__fx.run(1));
      await frames(2);
      await page.evaluate(() => window.__cb.store.setState({ hudHidden: false }));
      await page.getByRole('button', { name: 'Build', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForSelector('[data-testid="goals-card"]', { timeout: 4000 }).then(() => { R.goal = true; }).catch(() => note(kind, 'no signature goal card on day 1'));
      R.notes.goal = (await page.evaluate(() => window.__fx.info())).goal;
      if (R.goal) {
        await shoot('06-goal');
        const gf = await fit('[data-testid="goals-card"]'); R.notes.goalFit = gf;
        if (gf?.clipped.length) note(kind, `goal card text clipped: ${gf.clipped.join(' | ')}`);
        if (gf?.bad) note(kind, `goal card shows a raw token: "${gf.bad}"`);
        if (gf?.outOfView) note(kind, 'the goal card runs out of the 1100 x 700 view');
        if (R.notes.goal?.act === null && R.notes.goal?.current) note(kind, `goal step "${R.notes.goal.current}" has no Do-it button`);
      }
      // ---- the first felt decision card ----
      r = await page.evaluate(() => window.__fx.run(14, true));
      R.notes.cardAt = r;
      await page.waitForTimeout(400);
      const dlg = await page.evaluate(() => { const g = window.__cb.game.getState().game; return window.__fx.info().cards?.pending?.id ?? null; });
      if (dlg) {
        R.decision = true;
        await frames(2);
        await shoot('05-decision');
        const label = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map(e => e.getAttribute('aria-label')).filter(a => a && a !== 'Compound board' && a !== 'The hit'));
        R.notes.cardTitle = label[0] ?? null;
        const cf = label[0] ? await page.evaluate(([sel]) => { const e = [...document.querySelectorAll('[role="dialog"]')].find(x => x.getAttribute('aria-label') === sel); if (!e) return null; e.setAttribute('data-q', '1'); return true; }, [label[0]]) : null;
        const f2 = cf ? await fit('[data-q="1"]') : null;
        R.notes.cardFit = f2;
        if (f2) {
          if (f2.outOfView || f2.scrolls) note(kind, `the decision card does not fit 1100 x 700 (top ${f2.top}, bottom ${f2.bottom}${f2.scrolls ? ', scrolls' : ''})`);
          if (f2.clipped.length) note(kind, `decision card text clipped: ${f2.clipped.join(' | ')}`);
          if (f2.bad) note(kind, `decision card shows a raw token: "${f2.bad}"`);
        }
        if (!quick) {
          // click every option on a snapshot: each one must settle the card
          const nopt = f2 ? Math.max(0, f2.nbtn) : 0;
          for (let i = 0; i < nopt; i++) {
            await page.evaluate(() => { window.__snap = structuredClone(window.__cb.game.getState().game); });
            const res = await page.evaluate(i => { const e = document.querySelector('[data-q="1"]'); const b = e?.querySelectorAll('button')[i]; if (!b) return null; if (b.disabled) return { dis: true, t: (b.textContent ?? '').slice(0, 40) }; b.click(); return { dis: false, t: (b.textContent ?? '').slice(0, 40) }; }, i);
            await page.waitForTimeout(250);
            if (res && !res.dis) {
              const still = await page.evaluate(() => !!window.__fx.info().cards?.pending);
              if (still) note(kind, `decision option "${res.t}" did nothing (the card stayed up)`);
            }
            await page.evaluate(() => { window.__cb.game.setState({ game: structuredClone(window.__snap) }); });
            await page.waitForTimeout(150);
            await page.evaluate(sel => { const e = [...document.querySelectorAll('[role="dialog"]')].find(x => x.getAttribute('aria-label') === sel); if (e) e.setAttribute('data-q', '1'); }, label[0]);
          }
        }
        await page.evaluate(() => window.__fx.settle());
      } else note(kind, 'no felt decision card came up in the first 14 days');
      }
      // ---- week 1: the feed, the Board, the radio, the world ----
      r = await page.evaluate(() => window.__fx.run(7));
      R.notes.week1 = r;
      if (worldOnly) R.notes.worldOnly = true;
      await page.evaluate(() => { window.__fx.settle(); });
      await page.evaluate(() => window.__cb.store.setState({ hudHidden: false }));
      await page.getByRole('button', { name: /^Board/ }).first().click({ timeout: 5000 }).then(() => { R.board = true; }).catch(() => note(kind, 'the Board button could not be opened'));
      if (R.board) {
        await page.waitForSelector('[aria-label="Compound board"]', { timeout: 4000 }).catch(() => { R.board = false; note(kind, 'the Compound board did not open'); });
        if (R.board) {
          await frames(2);
          await shoot('07-board');
          const bf = await fit('[aria-label="Compound board"]'); R.notes.boardFit = bf;
          if (bf?.clipped.length) note(kind, `Board text clipped: ${bf.clipped.join(' | ')}`);
          if (bf?.bad) note(kind, `Board shows a raw token: "${bf.bad}"`);
          R.notes.feedHasCard = await page.evaluate(() => /different|nothing new/i.test(document.querySelector('[aria-label="Compound board"]')?.textContent ?? ''));
          if (!R.notes.feedHasCard) note(kind, 'the Board shows no "What\'s different" feed at day 7');
          await page.getByRole('button', { name: /^Board/ }).first().click().catch(() => {});
          await page.keyboard.press('Escape');
        }
      }
      // radio: the Rumors section lives on the Outside tab
      await page.getByRole('button', { name: /^Outside/i }).first().click({ timeout: 3000 }).catch(() => {});
      await frames(2);
      await shoot('08-radio');
      const info7 = await page.evaluate(() => window.__fx.info());
      R.notes.heard = info7.heard;
      if (info7.heard.length < 2) note(kind, `only ${info7.heard.length} radio line(s) heard in the first week`);
      const claims = info7.heard.filter(h => h.claim).length;
      if (!claims) note(kind, 'no heard radio line carries a checkable claim at day 7');
      // scouting: every open claim must settle to confirmed or false
      const sc = await page.evaluate(() => window.__fx.scout());
      const rows = sc.rows.filter(x => x.claim);
      R.scout = { sent: sc.sent.length, confirmed: rows.filter(x => x.status === 'confirmed').length, false: rows.filter(x => x.status === 'false').length, open: rows.filter(x => x.status === 'open').length, unclear: rows.filter(x => x.status === 'unclear').length, blocked: sc.sent.filter(x => x.why).map(x => x.why) };
      if (sc.sent.length && R.scout.confirmed + R.scout.false === 0) note(kind, `scouting resolved no claim to confirmed or false (${JSON.stringify(R.scout)})`);
      if (R.scout.open > 0 && sc.sent.length < sc.rows.filter(x => x.claim).length) R.notes.scoutUnsent = R.scout.open;
      for (const x of rows) if (x.status === 'confirmed' && x.truth === false) note(kind, `a scouted line was confirmed but is marked false: "${x.text.slice(0, 60)}"`); else if (x.status === 'false' && x.truth === true) note(kind, `a scouted line was marked false but is true: "${x.text.slice(0, 60)}"`);
      // the world at week 1 (HUD hidden, no modal)
      await page.evaluate(() => { window.__cb.store.setState({ hudHidden: true }); window.__fx.noon(); });
      for (const v of ['eye', 'road', 'aerial']) {
        await view(v);
        const bad = await insideGeometry(); if (v === 'eye' && bad) note(kind, `the eye-level camera is inside geometry (${bad.join(', ')})`);
        const ms = await milestone(); if (ms) { note(kind, `a milestone popup covered the week-1 ${v} view (${ms.trim()}); dismissed`); await page.waitForTimeout(300); }
        const m = await modalUp(); if (m.length) note(kind, `a modal covers the week-1 ${v} shot: ${m.join(', ')}`);
        const f = await shoot(`w1-${v}`, true);
        const pct = await diff(f, peace[v]); R.diff[`w1_${v}`] = +pct.toFixed(2);
      }
      if (night) { await page.evaluate(() => window.__fx.hour(23)); await view('aerial'); await shoot('w1-night-aerial', true); await view('eye'); await shoot('w1-night-eye', true); await page.evaluate(() => window.__fx.noon()); }
      const best = Math.max(R.diff.w1_eye, R.diff.w1_aerial);
      if (best < minPct) note(kind, `week-1 shots differ from peacetime by only ${R.diff.w1_eye}% (eye) and ${R.diff.w1_aerial}% (aerial); need ${minPct}% in one`);
      R.notes.marks = await page.evaluate(() => { const g = window.__cb.game.getState().game; const dm = g.disaster.fx?.physical?.damage ?? {}; return { ...window.__cb.feltWorld.stats, damageRecords: Object.keys(dm).length, damageLevels: Object.values(dm).map(d => d.level) }; });
      // ---- month 1 ----
      if (!quick) {
        await page.evaluate(() => window.__cb.store.setState({ hudHidden: false }));
        r = await page.evaluate(() => window.__fx.run(30));
        R.notes.month1 = r;
        await page.evaluate(() => { window.__fx.settle(); window.__cb.store.setState({ hudHidden: true }); window.__fx.noon(); });
        for (const v of ['eye', 'aerial']) {
          await view(v);
          const ms = await milestone(); if (ms) { note(kind, `a milestone popup covered the month-1 ${v} view (${ms.trim()}); dismissed`); await page.waitForTimeout(300); }
          const m = await modalUp(); if (m.length) note(kind, `a modal covers the month-1 ${v} shot: ${m.join(', ')}`);
          const f = await shoot(`m1-${v}`, true);
          R.diff[`m1_${v}`] = +(await diff(f, peace[v])).toFixed(2);
        }
        R.notes.marks30 = await page.evaluate(() => ({ ...window.__cb.feltWorld.stats }));
        R.notes.info30 = await page.evaluate(() => { const i = window.__fx.info(); return { goal: i.goal, cards: i.cards, feed: i.feed, news: i.news, money: i.money }; });
      }
      // ---- the order package gate cards and the cyber Verify button ----
      if (gates) {
        const ORDER = { lawless: ['tollkeeper', 'posse', 'watch_pact', 'salvage'], civil_war: ['checkpoint_stop', 'quota', 'draft_notice', 'informant', 'fugitive', 'partisan'], invasion: ['checkpoint_stop', 'quota', 'informant', 'lost_soldier', 'draft_notice'] }[kind] ?? [];
        R.notes.gates = [];
        for (const gk of ORDER) {
          await page.evaluate(() => window.__cb.store.setState({ hudHidden: false }));
          const made = await page.evaluate(async gk => {
            const OE = await import('/src/sim/orderEncounters.ts');
            const G = window.__cb.game, g = structuredClone(G.getState().game);
            g.gate.pending = null; g.gate.card = null; g.gate.incoming = null; g.clock.speed = 0;
            const e = OE.makeOrderCard(g, gk, () => 0.5, 'qa_' + gk, Math.floor(g.clock.t));
            if (!e) return null;
            g.gate.pending = e;
            window.__gateSnap = structuredClone(g);
            G.setState({ game: g, cutscene: null, dayCard: null, resumeTo: null });
            return { title: e.title, stances: e.stances };
          }, gk);
          if (!made) { R.notes.gates.push({ gk, made: false }); note(kind, `gate card ${gk} could not be made in this state`); continue; }
          await page.waitForTimeout(900);
          const gf = await page.evaluate(([W, H, title]) => { const e = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).position === 'fixed' && (d.textContent ?? '').includes(title) && d.querySelector('button')).pop(); if (!e) return null; const r = e.getBoundingClientRect(); const sc = [e, ...e.querySelectorAll('*')].find(x => getComputedStyle(x).overflowY === 'auto' && x.scrollHeight > x.clientHeight + 2); const bs = [...e.querySelectorAll('button')]; e.setAttribute('data-g', '1'); return { label: title, top: r.top, bottom: r.bottom, scrolls: !!sc, n: bs.length, off: bs.filter(b => b.getBoundingClientRect().bottom > H + 1).map(b => (b.textContent ?? '').slice(0, 20)), bad: /undefined|NaN|\[object|null\b/.test(e.textContent ?? '') }; }, [W, H, made.title]);
          const entry = { gk, made: true, title: made.title, ...gf };
          if (!gf) { note(kind, `gate card ${gk} drew no dialog`); R.notes.gates.push(entry); continue; }
          await shoot(`g-${gk}`);
          if (gf.scrolls || gf.bottom > H) note(kind, `gate card ${gk} does not fit 1100 x 700 (bottom ${Math.round(gf.bottom)}${gf.scrolls ? ', scrolls' : ''})`);
          if (gf.off.length) note(kind, `gate card ${gk} buttons below the fold: ${gf.off.join(', ')}`);
          if (gf.bad) note(kind, `gate card ${gk} shows a raw token`);
          if (!quick) {
            const dead = [];
            for (let i = 0; i < gf.n; i++) {
              const res = await page.evaluate(i => { const e = document.querySelector('[data-g="1"]'); const b = e?.querySelectorAll('button')[i]; if (!b) return null; if (b.disabled) return { dis: true, t: (b.textContent ?? '').slice(0, 36) }; const before = JSON.stringify(window.__cb.game.getState().game.gate) + window.__cb.game.getState().game.clock.t; b.click(); window.__before = before; return { dis: false, t: (b.textContent ?? '').slice(0, 36) }; }, i);
              await page.waitForTimeout(350);
              if (res && !res.dis) {
                const changed = await page.evaluate(() => { const s = window.__cb.game.getState(); return JSON.stringify(s.game.gate) + s.game.clock.t !== window.__before || s.cutscene !== null; });
                if (!changed) dead.push(res.t);
              }
              await page.evaluate(() => { window.__cb.game.setState({ game: structuredClone(window.__gateSnap), cutscene: null }); });
              await page.waitForTimeout(250);
              await page.evaluate(title => { const e = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).position === 'fixed' && (d.textContent ?? '').includes(title) && d.querySelector('button')).pop(); if (e) e.setAttribute('data-g', '1'); }, made.title);
            }
            entry.dead = dead;
            if (dead.length) note(kind, `gate card ${gk}: dead buttons (nothing changed): ${dead.join(', ')}`);
          }
          R.notes.gates.push(entry);
          await page.evaluate(() => { const g = structuredClone(window.__gateSnap); g.gate.pending = null; window.__cb.game.setState({ game: g, cutscene: null }); });
        }
        if (kind === 'cyberattack') {
          // the cyber Verify button: a rumor with a hidden truth, checked on the ham net
          await page.evaluate(() => { window.__cb.store.setState({ hudHidden: false }); });
          await page.getByRole('button', { name: /^Outside/i }).first().click({ timeout: 3000 }).catch(() => {});
          const v = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Verify on ham/.test(x.textContent ?? '')); return b ? { dis: b.disabled, title: b.title } : null; });
          R.notes.verify = v;
          if (!v) note(kind, 'cyber Verify: no "Verify on ham" button on the Rumors list (no open rumor at day 30, or the section is hidden)');
          else {
            const before = await page.evaluate(() => JSON.stringify(window.__cb.game.getState().game.radio?.heard?.map(h => h.status)));
            await shoot('g-verify');
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Verify on ham/.test(x.textContent ?? '')); b?.click(); });
            await page.waitForTimeout(500);
            const after = await page.evaluate(() => JSON.stringify(window.__cb.game.getState().game.radio?.heard?.map(h => h.status)));
            if (before === after) note(kind, 'cyber Verify: clicking "Verify on ham" changed no rumor status');
          }
        }
      }
    } catch (e) {
      note(kind, 'harness error: ' + String(e.message ?? e).slice(0, 200));
    }
    R.problems = [...new Set(problems)];
    R.seconds = Math.round((Date.now() - t0) / 1000);
    writeFileSync(`${dir}/result.json`, JSON.stringify(R, null, 1));
    const order = ['01-hit-open', '02-hit-mid', '03-hit-title', '04-daycard', '05-decision', '06-goal', '07-board', '08-radio', 'w1-eye', 'w1-aerial', 'm1-eye', 'm1-aerial'];
    const present = files.filter(f => existsSync(f)).sort((a, b) => { const na = a.split('/').pop().replace('.png', ''), nb = b.split('/').pop().replace('.png', ''); const ia = order.indexOf(na), ib = order.indexOf(nb); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || na.localeCompare(nb); });
    if (present.length) await sheet(present, `${dir}/sheet.png`, `${kind}  (${quality}, 1100x700)`);
    console.log(`   ${kind}: hit ${R.hit} card ${R.dayCard} decision ${R.decision} goal ${R.goal} board ${R.board} diff ${JSON.stringify(R.diff)} problems ${R.problems.length} (${R.seconds}s)`);
    if (R.problems.length && audit) exitCode = 1;
  }
} finally {
  await browser.close();
  vite.kill();
}
summary();
setTimeout(() => process.exit(exitCode), 200);
