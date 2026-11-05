/**
 * Start-matrix sweep: every region x lot kind x disaster x difficulty x lifestyle x family x mode x graphics, through the real charter.
 *   node scripts/playQa.mjs sweep <outDir> [port]      env: SWEEP_FROM=0 SWEEP_TO=99 SWEEP_ONLY=<label substring> SWEEP_DAYS=60 SWEEP_HIT=1
 * For each start: charter by its buttons -> starter compound or by-hand stakes -> ~SWEEP_DAYS game days -> every tab / window / overlay / camera
 * mode once, then three viewports (1280x800, 1024x640, 390x844). Records console errors + warnings, page errors, unhandled rejections, bad text
 * (NaN / undefined / [object ...] / 'null'), horizontal overflow, panels off screen, a modal over the view, slow ticks / frames, structures in
 * water or under the ground, and the camera under the ground. Writes <outDir>/results.jsonl (one line per start), sweep.md and shots.
 * Reuses the playQa.mjs harness (st, shot, run, handleGate, note).
 */
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

const REGIONS = [['mountain_west', 'Mountain West'], ['appalachia', 'Appalachia'], ['desert', 'Desert Southwest'], ['north_woods', 'North Woods'], ['plains', 'Great Plains'], ['pnw', 'Pacific Northwest'], ['upper_midwest', 'Upper Midwest'], ['new_england', 'New England'], ['ozarks', 'Ozarks'], ['hill_country', 'Texas Hill Country'], ['rust_belt', 'Rust Belt edge']];
const RN = Object.fromEntries(REGIONS);
const KINDS = ['grid_down', 'nuclear', 'lawless', 'financial', 'drought', 'pandemic', 'solar_flare', 'wildfire', 'ash_winter', 'cyberattack', 'zombies', 'invasion', 'civil_war', 'bioweapon', 'asteroid', 'unknown'];
// (region, lot kind) targets: every lot kind that can be rolled, each region once with its ordinary ground, and a second look at the plain regions with a water / timber wish
const LOTS = [
  ['mountain_west', 'ridge'], ['mountain_west', 'hillside'], ['mountain_west', 'bench'], ['mountain_west', 'gorge'], ['mountain_west', 'mesa'], ['mountain_west', 'saddle'], ['mountain_west', 'bluff'], ['mountain_west', 'island'],
  ['appalachia', 'ridge'], ['appalachia', 'hillside'], ['appalachia', 'gorge'], ['appalachia', 'bench'],
  ['pnw', 'island'], ['pnw', 'bluff'], ['pnw', 'bench'], ['pnw', 'gorge'],
  ['north_woods', 'bluff'], ['north_woods', 'island'],
  ...REGIONS.map(([id]) => [id, 'flat']).filter(([id]) => true),
  ...['desert', 'plains', 'upper_midwest', 'new_england', 'ozarks', 'hill_country', 'rust_belt'].map(id => [id, 'flat2']),
];
const LIFE = ['fulltime', 'independent', 'weekend'], LIFE_NAME = { fulltime: /Full-time/, independent: /Financially independent/, weekend: /Weekend getaway/ };
const DIFF = ['Standard', 'Cozy', 'Hardcore'];
const MODE = ['Surprise', 'Scenario', 'Scenario', 'Free build', 'Scenario', 'God Mode', 'Surprise'];
const QUAL = ['low', 'medium', 'high', 'medium', 'low'];
const ACRES = [40, 20, 80, 5, 40, 20, 'any'];
export const CONFIGS = LOTS.map(([region, lot], i) => {
  const mode = MODE[i % MODE.length];
  return {
    i, region, lot, label: `${String(i).padStart(2, '0')}-${region}-${lot}`, seed: 7 + i * 3,
    life: LIFE[(i + Math.floor(i / 3)) % 3], diff: DIFF[(i * 2 + 1) % 3], mode, kind: mode === 'Scenario' ? KINDS[(i * 5) % KINDS.length] : null, peace: ['18 months', '3 years', '5 years'][i % 3],
    reroll: i % 4, kin: [0, 2, 1, 3, 0][i % 5], starter: i % 2 === 0, quality: QUAL[i % QUAL.length], acres: ACRES[i % ACRES.length],
    wish: lot === 'flat2' ? [['Water', ['Creek', 'Dry (cheaper)', 'Spring'][i % 3]], ['Timber', ['Heavy', 'Open', 'Some'][i % 3]]] : [], townPlan: i % 2 ? 'Sell it and rent' : 'Keep the house',
  };
});

const BAD = /\bNaN\b|\bundefined\b|\[object|Infinity|\$-?NaN|\bnull\b/;
const SUBSET = (process.env.SWEEP_SET ?? '0,1,2,3,4,5,6,7,9,11,12,13,15,16,17,19,20,21,22,23,25,26,28,29').split(',').map(Number);
const FULL = new Set((process.env.SWEEP_FULL ?? '0,6,12,20,26').split(',').map(Number));
const VIEWPORTS = [[1280, 800], [1024, 640], [390, 844]];

export async function play(A) {
  const { browser, port, page: page0, note, out } = A;
  const only = process.env.SWEEP_ONLY, from = Number(process.env.SWEEP_FROM ?? 0), to = Number(process.env.SWEEP_TO ?? 999), days = Number(process.env.SWEEP_DAYS ?? 60);
  const doneFile = `${out}/results.jsonl`;
  const done = new Set(existsSync(doneFile) ? readFileSync(doneFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).label) : []);
  await page0.close();
  for (const cfg of CONFIGS) {
    if (!SUBSET.includes(cfg.i) || cfg.i < from || cfg.i > to || (only && !cfg.label.includes(only)) || done.has(cfg.label)) continue;
    const res = { label: cfg.label, cfg, issues: [], warns: [], facts: {} };
    const t0 = Date.now();
    try { await oneStart(cfg, res); } catch (e) { res.issues.push('SWEEP CRASH: ' + String(e.stack ?? e).slice(0, 500)); }
    res.secs = Math.round((Date.now() - t0) / 1000);
    appendFileSync(doneFile, JSON.stringify(res) + '\n');
    note(`DONE ${cfg.label} ${res.secs}s issues=${res.issues.length} warns=${res.warns.length} ${JSON.stringify(res.facts)}`);
  }

  async function oneStart(cfg, res) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const seen = new Set();
    const bug = (kind, s) => { const k = kind + s.slice(0, 120); if (seen.has(k)) return; seen.add(k); (kind === 'warn' ? res.warns : res.issues).push((kind === 'warn' ? '' : kind + ': ') + s.slice(0, 400)); note(`[${cfg.label}] ${kind}: ${s.slice(0, 200)}`); };
    await page.addInitScript(() => { try { localStorage.setItem('cb.unlocked', '1'); } catch {} window.__rej = []; window.addEventListener('unhandledrejection', e => window.__rej.push(String(e.reason?.stack ?? e.reason).slice(0, 300))); });
    page.on('pageerror', e => bug('PAGEERROR', e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'error') { if (!/Failed to load resource.*(favicon|404)/.test(t)) bug('console error', t); }
      else if (m.type() === 'warning' && !/GPU stall|ReadPixels|swiftshader|Automatic fallback|WebGL/i.test(t)) bug('warn', t);
    });
    const shotTo = async (name, full = false) => {
      await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full).catch(() => {});
      const f = `${out}/${cfg.label}-${name}.png`;
      try { await page.screenshot({ path: f, timeout: 120000 }); } catch (e) { bug('shot failed', name + ' ' + e.message.slice(0, 80)); }
      return f;
    };
    const scan = async tag => {
      const t = await page.evaluate(() => document.body.innerText);
      const m = t.match(new RegExp('.{0,50}(' + BAD.source + ').{0,50}'));
      if (m) bug('bad text', `at ${tag}: "${m[0].replace(/\n/g, ' ')}"`);
      const rej = await page.evaluate(() => window.__rej.splice(0));
      for (const r of rej) bug('unhandled rejection', `at ${tag}: ${r}`);
    };
    const click = async (name, opts = {}) => { const b = page.getByRole('button', { name, exact: opts.exact ?? false }).first(); if (await b.count()) { await b.click({ timeout: 4000 }).catch(() => {}); return true; } return false; };
    const state = () => page.evaluate(() => { const g = window.__cb.game.getState().game; return { day: Math.floor(g.clock.t), money: Math.round(g.money), built: g.structures.filter(s => s.finishedAt !== null).length, planned: g.structures.length, alive: g.personState.filter(p => p.needs.died == null).length, total: g.personState.length, pending: !!g.gate.pending, hit: g.disaster.hitAt ?? null, ending: !!g.ending, speed: g.clock.speed }; });

    const T0 = Date.now(); const stage = n => note(`[${cfg.label}] +${Math.round((Date.now() - T0) / 1000)}s ${n}`);
    // ---- the charter
    await page.goto(`http://localhost:${port}/?new&lowrender&seed=${cfg.seed}`);
    await page.getByText('1. Region').waitFor({ timeout: 90000 });
    await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 90000 });
    await page.getByRole('button', { name: new RegExp(RN[cfg.region]) }).first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: LIFE_NAME[cfg.life] }).first().click();
    if (cfg.life === 'weekend') await click(cfg.townPlan, { exact: true });
    if (cfg.acres !== 'any') await click(cfg.acres === 5 ? '5 acres' : String(cfg.acres), { exact: true });
    for (const [, chip] of cfg.wish) await click(chip, { exact: true });
    await page.waitForTimeout(300);
    // find a listing with the wanted ground (batch / index in the same stream the card list uses), then page to it
    const want = await page.evaluate(async ({ region, lot, acres, wish }) => {
      const site = await import('/src/sim/site.ts'); const seed = window.__cb.store.getState().seed;
      const w = { ...site.ANY_WISH, acres };
      for (const [k, v] of wish) { if (k === 'Water') w.water = v.startsWith('Creek') ? 'creek' : v.startsWith('Dry') ? 'dry' : 'spring'; if (k === 'Timber') w.timber = v.toLowerCase(); }
      for (let b = 0; b < 40; b++) { const ls = site.listings(seed + b * 1013, region, w, 6, 1e9); const i = ls.findIndex(l => lot.startsWith('flat') ? !l.lot : l.lot?.kind === lot); if (i >= 0) return { b, i, kind: ls[i].lot?.kind ?? 'flat', creek: ls[i].creek }; }
      return null;
    }, { region: cfg.region, lot: cfg.lot, acres: cfg.acres, wish: cfg.wish });
    if (!want) { bug('setup', `no ${cfg.lot} listing found in ${cfg.region} within 40 batches`); }
    for (let b = 0; b < (want?.b ?? 0); b++) { await click('More listings', { exact: true }); }
    const cards = page.locator('button', { hasText: /acres/ }).filter({ hasText: /Leaves \$|Over budget/ });
    const nc = await cards.count();
    if (!nc) { bug('setup', 'no listing cards'); return; }
    await cards.nth(Math.min(want?.i ?? 0, nc - 1)).click();
    await scan('land step');
    await page.screenshot({ path: `${out}/${cfg.label}-w-land.png` });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    for (let i = 0; i < cfg.reroll; i++) await click('Reroll family', { exact: true });
    if (cfg.reroll) await click('Shuffle jobs', { exact: true });
    const kinBtns = page.locator('button').filter({ hasText: /in town/ });
    for (let i = 0; i < cfg.kin; i++) { if (await kinBtns.count()) await kinBtns.first().click().catch(() => {}); }
    await click(/^▸ \d+ sources/);
    await click(new RegExp('^' + cfg.mode));
    if (cfg.mode === 'Scenario') { await page.locator('select').filter({ has: page.locator('option', { hasText: 'Grid-down' }) }).first().selectOption(cfg.kind).catch(e => bug('setup', 'select disaster ' + cfg.kind + ' ' + e.message.slice(0, 80))); await click(cfg.peace, { exact: true }); }
    await click(cfg.diff, { exact: true });
    await scan('family step');
    await page.screenshot({ path: `${out}/${cfg.label}-w-family.png` });
    await page.getByRole('button', { name: 'Buy it and start' }).click();
    await page.waitForFunction(() => !window.__cb.game.getState().setupOpen, null, { timeout: 90000 });
    await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
    await page.waitForTimeout(800);
    res.facts = await page.evaluate(() => { const g = window.__cb.game.getState().game, s = g.site; return { region: s.region, lot: s.lot?.kind ?? 'flat', creek: !!s.creek, acres: s.acres, mode: g.mode, diff: g.difficulty, kind: g.disaster.kind, people: g.people.length, money: Math.round(g.money), hit: g.disaster.hitAt ?? null }; });
    if (res.facts.region !== cfg.region) bug('setup', `region ${res.facts.region} != ${cfg.region}`);
    if (cfg.lot !== 'flat' && cfg.lot !== 'flat2' && res.facts.lot !== cfg.lot) bug('setup', `lot ${res.facts.lot} != wanted ${cfg.lot}`);
    await scan('game start');

    stage('charter done');
    // ---- quality
    await page.locator('select[title^="Graphics quality"]').selectOption(cfg.quality).catch(() => bug('setup', 'quality select'));
    const frame = async () => { await page.evaluate(async () => { for (let i = 0; i < 3; i++) await window.__cb.qa.renderNow(); }); };
    await frame();
    const bare = async on => page.evaluate(o => window.__cb.store.getState().setHudHidden(o), on);
    const aerial = async name => {
      await bare(true);
      await page.evaluate(() => { const { cam, world } = window.__cb; cam.target.set(world.camp.x, 0, world.camp.z); cam.radius = 70; cam.pitch = 0.95; cam.yaw = 0.5; window.__cb.store.getState().setTimeOfDay(11); });
      await frame(); const f = await shotTo(name); await bare(false); return f;
    };
    await aerial('0-start-aerial');

    stage('aerial shot');
    // ---- first Next steps: starter compound or by hand
    await click(/^Build$/, { exact: false });
    if (cfg.starter) {
      const ok = await click('Lay out a starter compound');
      if (ok) { await page.waitForTimeout(400); await scan('starter preview'); await shotTo('1-starter-preview'); await click('Place all', { exact: true }); await page.waitForTimeout(300); }
      else bug('flow', 'no "Lay out a starter compound" button on the Build tab');
    } else {
      const placed = await page.evaluate(list => {
        const cb = window.__cb, c = cb.world.camp, G = cb.game, r = [];
        for (const [k, dx, dz] of list) {
          let ok = false;
          for (const [ox, oz] of [[0, 0], [-4, 0], [0, 4], [-4, 4], [-8, 0], [0, -4], [4, 4], [6, -6], [-6, -6], [10, 4], [-10, 8], [12, -2]]) {
            const sp = cb.tool.findSpot(k, c.x + dx + ox, c.z + dz + oz, 0); if (!sp) continue;
            const before = G.getState().game.structures.length; cb.tool.setKind(k); cb.tool.hoverAt(sp[0], sp[1], 0); cb.tool.placeHere(); cb.tool.setKind(null);
            if (G.getState().game.structures.length > before) { ok = true; break; }
          }
          r.push(k + (ok ? '' : ' FAILED'));
        }
        return r;
      }, [['timber_cabin', 0, 3], ['garden', -5, 6], ['outhouse', -4, -3]]);
      note(`[${cfg.label}] stake ${placed.join(', ')}`);
      if (placed.every(p => p.includes('FAILED'))) bug('flow', 'by-hand stake: nothing could be placed: ' + placed.join(', '));
    }
    await page.getByText('Supplies', { exact: true }).first().click().catch(() => {});
    const ob = page.getByRole('button', { name: /Order what the plans need/ }); if (await ob.count() && await ob.first().isEnabled()) await ob.first().click().catch(() => {});
    // crews
    const ids = await page.evaluate(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => s.id));
    for (const id of ids.slice(0, 3)) { await page.evaluate(i => window.__cb.game.getState().select(i), id); const b = page.getByRole('button', { name: /Hire a crew/ }); if (await b.count() && await b.first().isEnabled()) await b.first().click().catch(() => {}); }
    await page.evaluate(() => window.__cb.game.getState().select(null)).catch(() => {});

    stage('starter/stake/crews');
    // ---- let days run (the sim's own tick, gates answered), timing it
    const slow = [];
    let target = days;
    const advanceTo = async (d, stepDays = 5) => {
      for (let it = 0; it < 400; it++) {
        let s = await state();
        if (s.day >= d || s.ending) return s;
        if (s.pending) { await gate(); s = await state(); }
        const ms = await page.evaluate(n => { const a = performance.now(); window.__cb.game.getState().advance(n); return performance.now() - a; }, stepDays);
        if (ms > 600) slow.push(Math.round(ms));
      }
      return state();
    };
    const gate = async () => {
      for (let i = 0; i < 60; i++) {
        const c = await page.evaluate(() => { const gs = window.__cb.game.getState(), g = gs.game; return { p: !!g.gate.pending, cs: gs.cutscene?.phase ?? null, a: !!g.gate.aftermath, c: !!g.gate.card }; });
        if (!c.p && !c.cs && !c.a && !c.c) return;
        const stance = [/^Open the house/, /^Hide/, /^Parley/, /^Trade/, /^Warn off/, /^Take them in/, /^Turn them away/, /^Defend/];
        let hit = false;
        if (c.cs === 'playing') { hit = await click(/^Skip( scene| all)?$/) || await click(/^(Continue|Stay the course)/); }
        else if (c.cs === 'aftermath') hit = await click(/Pick up the pieces|See to the drive/);
        else if (c.a) hit = await click(/Treat|Bury|Leave/);
        else if (c.c) hit = await click(/Carry on/);
        else { for (const r of stance) if (await click(r)) { hit = true; break; } if (hit) await click(/^Watch$/); }
        if (!hit) await click(/^(Continue|OK|Close|Okay|Got it)/);
        await page.waitForTimeout(250);
      }
      bug('flow', 'gate did not clear in 60 tries');
    };
    await advanceTo(Math.min(30, target));
    await scan('day 30');
    // quick order / crew refresh then the rest
    if (await page.getByRole('button', { name: /Order what the plans need/ }).count()) await page.getByRole('button', { name: /Order what the plans need/ }).first().click().catch(() => {});
    await advanceTo(target);
    const s1 = await state(); res.facts.day = s1.day; res.facts.built = `${s1.built}/${s1.planned}`; res.facts.alive = `${s1.alive}/${s1.total}`;
    if (s1.day < target - 6 && !s1.ending) bug('stuck', `clock stopped at day ${s1.day} of ${target} (speed ${s1.speed}, pending ${s1.pending})`);
    if (slow.length) bug('perf', `advance(5 days) took ${slow.join(', ')} ms`);
    stage('days advanced');
    // a real-time stretch through the store tick (what the game loop runs)
    const rt = await page.evaluate(async () => { const G = window.__cb.game; G.getState().setSpeed(3); let slowT = 0, mx = 0, n = 0; for (let i = 0; i < 80; i++) { const a = performance.now(); G.getState().tick(0.25); const d = performance.now() - a; mx = Math.max(mx, d); if (d > 120) slowT++; n++; if (G.getState().game.clock.speed === 0 || G.getState().cutscene) break; } G.getState().setSpeed(0); return { n, slowT, mx: Math.round(mx) }; });
    res.facts.tickMax = rt.mx; if (rt.mx > 400) bug('perf', `store tick spiked ${rt.mx} ms (${rt.slowT} over 120 ms of ${rt.n})`);
    await gate();
    await page.evaluate(() => window.__cb.game.getState().setSpeed(0));

    stage('realtime');
    // ---- geometry sanity from the data
    const geo = await page.evaluate(async () => {
      const cb = window.__cb, g = cb.game.getState().game, lots = await import('/src/sim/lots.ts'), out = { water: [], under: [], nan: [] };
      const gy = (x, z) => cb.cam.groundAt(x, z);
      for (const s of g.structures) {
        if (s.unplaced) continue;
        if (![s.x, s.z].every(Number.isFinite)) { out.nan.push(s.kind); continue; }
        const y = gy(s.x, s.z); if (!Number.isFinite(y)) { out.nan.push(s.kind + ' ground'); continue; }
        if (y < (lots.LAKE_Y ?? -99) - 0.05) out.water.push(`${s.kind}@${s.x.toFixed(0)},${s.z.toFixed(0)} y=${y.toFixed(2)}`);
      }
      const p = cb.cam.camera?.position ?? cb.ws?.camera?.position; if (p) { const y = gy(p.x, p.z); if (p.y < y - 0.01) out.under.push(`camera ${p.y.toFixed(2)} < ground ${y.toFixed(2)}`); }
      return out;
    });
    if (geo.water.length) bug('geometry', 'structures standing in the lake: ' + geo.water.slice(0, 4).join('; '));
    if (geo.nan.length) bug('geometry', 'non-finite positions: ' + geo.nan.join(','));
    if (geo.under.length) bug('geometry', geo.under.join(';'));

    stage('geometry');
    // ---- every tab / window / overlay / camera mode
    const press = async (name, opt = {}) => {
      const b = page.getByRole('button', { name, exact: opt.exact ?? true }).first();
      if (!(await b.count())) { bug('ui', `button not found: ${name}`); return false; }
      const t = Date.now();
      await b.click({ timeout: 5000 }).catch(e => bug('ui', `click ${name}: ${e.message.slice(0, 80)}`));
      await page.waitForTimeout(150); await scan(String(name)); if (!/^Shop/.test(String(name))) await modalCover(String(name));
      if (Date.now() - t > 4000) note(`[${cfg.label}] slow click ${name}: ${Date.now() - t} ms`);
      return true;
    };
    const modalCover = async tag => {
      const r = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight, out = [];
        for (const e of document.body.querySelectorAll('div,section,aside')) {
          const cs = getComputedStyle(e); if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
          const b = e.getBoundingClientRect(); if (b.width * b.height < 0.45 * W * H || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
          if (e.querySelector('canvas') || e.tagName === 'CANVAS' || cs.pointerEvents === 'none') continue;
          out.push(`${e.tagName} ${Math.round(b.width)}x${Math.round(b.height)} "${(e.innerText || '').slice(0, 40).replace(/\n/g, ' ')}"`);
        }
        return out.slice(0, 2);
      });
      if (r.length) bug('modal over view', `after ${tag}: ${r.join(' | ')}`);
    };
    const full = FULL.has(cfg.i);
    const closeShop = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
    for (const t of ['Build', 'Projects', 'Log']) await press(t);
    await press('Build');
    for (const t of ['Family', 'Supplies', 'Utilities', 'Land', 'Defense', 'Outside', 'Years']) await press(t);
    await press('Family');
    for (const t of ['Stores', 'Farm']) { const b = page.getByText(t, { exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await scan('supplies ' + t); } }
    if (full) {
    if (await press('Shop & money', { exact: false })) { await shotTo('2-shop'); await closeShop(); }
    if (await press('Save', { exact: true })) { await shotTo('3-save-menu'); await press('Save', { exact: true }); if (await page.getByText(/Export save/).count()) { await page.keyboard.press('Escape'); await page.mouse.click(640, 300); } }
    await press('Blueprint'); await shotTo('4-blueprint'); await press('Blueprint');
    await press('Photo'); await shotTo('5-photo'); await press('Photo');
    stage('tabs+shop+save+bp+photo');
    for (const t of ['Fire', 'Sun', 'Water', 'Lanes', 'High ground']) { if (await press(t)) { if (cfg.i % 5 === ['Fire', 'Sun', 'Water', 'Lanes', 'High ground'].indexOf(t)) { await frame(); await shotTo(`6-terrain-${t.replace(' ', '')}`); } } }
    await press('Off');
    for (const t of ['Road', 'Ridge', 'Night']) await press(t);
    if (await press('View from…')) { await page.mouse.click(640, 400); await page.waitForTimeout(250); await scan('viewshed click'); await shotTo('7-viewshed'); }
    await press('Off'); await page.getByRole('button', { name: 'Off', exact: true }).nth(1).click().catch(() => {});
    for (const t of ['Walls', 'Cutaway', 'X-ray']) await press(t);
    await press('Walls');
    await press('FPS'); await scan('fps'); const perf = await page.getByTestId('perf-readout').innerText().catch(() => ''); if (perf) res.facts.perf = perf.slice(0, 60); await press('FPS');
    stage('terrain+sight+views');
    for (const [mode, label] of [['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']]) {
      await press(label); await page.waitForTimeout(700);
      const inside = await page.evaluate(() => { const cb = window.__cb, p = cb.ws.camera.position, y = cb.cam.groundAt(p.x, p.z); return Number.isFinite(p.x + p.y + p.z) ? (p.y < y - 0.02 ? `camera under ground (${p.y.toFixed(2)} < ${y.toFixed(2)})` : null) : 'camera position not finite'; });
      if (inside) bug('camera', `${label}: ${inside}`);
      await scan(label + ' mode'); await modalCover(label + ' mode'); await shotTo(`8-${mode}`);
    }
    await press('Diorama');

    stage('cameras');
    }

    // ---- eye level with a person, and from above
    await page.evaluate(() => { const { cam, world } = window.__cb; const ps = world.family.positions(); const el = ps.find(p => world.family.shown?.has(p.id)) ?? ps[0]; if (!el) return; const [ex, ez] = world.openSpotNear(el.x + 1.9, el.z, 0.6); cam.placeEye(ex, ez, el.x, el.z, 0.34); });
    await bare(true); await frame();
    const eye = await page.evaluate(() => { const cb = window.__cb, p = cb.ws.camera.position; return { n: cb.world.family.positions().length, under: p.y < cb.cam.groundAt(p.x, p.z) - 0.02 }; });
    if (!eye.n) bug('people', 'no people drawn at eye level'); if (eye.under) bug('camera', 'eye-level camera under the ground');
    await shotTo('9-eye-level'); await bare(false);
    await aerial('9-aerial-day' + days); await page.evaluate(() => window.__cb.store.getState().setPhoto(false));

    stage('eye+aerial');
    // ---- three viewports: overflow, panels off screen, clipped text, modal over the view
    for (const [w, h] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500); await frame();
      const lay = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight, off = [], clip = [];
        const de = document.documentElement;
        for (const e of document.body.querySelectorAll('button,select,input,h1,h2,h3,[role=tab]')) {
          const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          let p = e, scrolls = false; while ((p = p.parentElement)) { const o = getComputedStyle(p); if (/(auto|scroll)/.test(o.overflowX + o.overflowY) && p.scrollHeight > p.clientHeight) { scrolls = true; break; } }
          if (b.right > W + 2 || b.left < -2) off.push(`${e.tagName} "${(e.innerText || e.title || '').slice(0, 24)}" x ${Math.round(b.left)}..${Math.round(b.right)}`);
          else if (!scrolls && b.bottom > H + 2) off.push(`${e.tagName} "${(e.innerText || e.title || '').slice(0, 24)}" below the fold ${Math.round(b.bottom)}>${H}`);
        }
        return { sw: de.scrollWidth, sh: de.scrollHeight, W, H, off: off.slice(0, 6), nOff: off.length };
      });
      if (lay.sw > lay.W + 1) bug('layout', `${w}x${h}: horizontal overflow, scrollWidth ${lay.sw} > ${lay.W}`);
      if (lay.nOff) bug('layout', `${w}x${h}: ${lay.nOff} controls off screen, e.g. ${lay.off.join('; ')}`);
      await modalCover(`${w}x${h}`);
      if (w !== 1280 && (full || w === 390)) await shotTo(`v-${w}x${h}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    stage('viewports');
    // ---- scenario starts: run through the hit so the disaster itself is exercised (short peace only)
    if (cfg.mode === 'Scenario' && process.env.SWEEP_HIT !== '0') {
      const s = await state(); const hit = s.hit;
      if (hit != null && hit < 760) {
        const t1 = Date.now();
        await advanceTo(hit + 12, 3); await gate();
        await advanceTo(hit + 40, 3); await gate();
        const s2 = await state(); res.facts.afterHit = `day ${s2.day} alive ${s2.alive}/${s2.total} ending=${s2.ending} (${Math.round((Date.now() - t1) / 1000)}s)`;
        await scan('after the hit'); await aerial('a-after-hit');
        if (s2.day < hit + 30 && !s2.ending) bug('stuck', `stalled at day ${s2.day} after the hit on day ${hit}`);
      } else res.facts.afterHit = `hit day ${hit} (too far to run)`;
    }
    await ctx.close();
  }
}
