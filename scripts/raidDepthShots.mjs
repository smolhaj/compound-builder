/**
 * Raid depth in the real app: the negotiation card on the raid prompt, a settled talk, a lost fight's report and Next-steps card,
 * and the damage left standing in the world (a gap in the fence, a broken gate, a burned wreck, broken windows) from eye level and from above,
 * with the same views before the damage (before / after pairs).
 *   node scripts/raidDepthShots.mjs [--port 5973] [--quality medium] [--out shots/raid-depth] [--only talk|damage]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5973)), quality = opt('--quality', 'medium'), only = opt('--only', null);
const outDir = resolve(opt('--out', 'shots/raid-depth'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.4&looktier=medium`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 180000 });
  await page.evaluate(q => window.__cb.store.getState().setQuality(q), quality);
  // (lowrender: the page draws only on request, so a frame is a short wait for the game's own loop; `shot` draws one full frame)
  const frames = async () => { await page.waitForTimeout(500); };
  const shot = async (name, k = 4) => {
    await page.evaluate(() => window.__cb.store.getState().setPerfNotice(null));
    await frames(k); await page.evaluate(q => window.__cb.qa.renderFull(q), quality); const f = `${outDir}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f);
  };
  // the place: a cabin inside a palisade, finished, the collapse in progress
  await page.evaluate(async () => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z, 0);
    G.getState().plan('timber_cabin', sp[0], sp[1], 0);
    const h = 9;
    G.getState().planRun('log_palisade', [[sp[0] - h, sp[1] - h], [sp[0] + h, sp[1] - h], [sp[0] + h, sp[1] + h], [sp[0] - h, sp[1] + h], [sp[0] - h, sp[1] - h]], [], 0);
  });
  await frames(6);
  const prep = (hour, extra) => page.evaluate(async ([hour, extra]) => {
    const cb = window.__cb, G = cb.game;
    G.setState(s => {
      const g = structuredClone(s.game);
      for (const st of g.structures) { st.stage = 5; st.done = 0; st.finishedAt = 0; }
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      if (!g.disaster.kind) return { game: g };
      return { game: g };
    });
    const st = G.getState();
    if (!st.game.disaster.kind) st.trigger('grid_down', 0);
    G.setState(s => {
      const g = structuredClone(s.game);
      g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
      g.stock.canned = 30; g.stock.fuel = 10; g.stock.lumber = 30; g.stock.hardware = 30; g.armory.ammo['556'] = 2000;
      for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
      const SUB = 0.25 / 24, day = Math.floor(g.disaster.hitAt + 20);
      g.clock.t = Math.round((day - 0.25 + hour / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB); g.clock.speed = 0;
      g.gate.pending = null; g.gate.incoming = null; g.gate.next = 99999;
      if (extra?.noGuns) { g.armory.guns = []; g.armory.ammo['556'] = 0; }
      return { game: g };
    });
    return true;
  }, [hour, extra]);
  const dismiss = async () => { const ok = page.getByRole('button', { name: 'OK', exact: true }); if (await ok.count()) await ok.first().click(); };

  if (only !== 'damage') {
    // ── the talk ──
    await prep(14, {});
    await frames(6);
    const day = await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game;
      const { willing } = await import('/src/sim/negotiation.ts');
      const g = structuredClone(G.getState().game);
      let ed = 0;
      for (let d = 1; d < 400; d++) if (willing(g, { id: 'e9', kind: 'looters', day: d, size: 5, temper: 'desperate' })) { ed = d; break; }
      g.gate.pending = { id: 'e9', kind: 'looters', day: ed, title: 'Looters on the county road', dossier: ['5 men in a pickup, slowing at your drive.', 'Opportunists: they want easy food and fuel, not a fight.'], size: 5, armed: true, strength: 45, wants: { canned: 5, fuel: 2 }, stances: ['hide', 'warn', 'defend', 'parley'], temper: 'desperate' };
      G.getState().load(g);
      return ed;
    });
    console.log('encounter day', day);
    await frames(10); await page.waitForTimeout(3000); await dismiss();
    await shot('talk-01-prompt-with-card', 6);
    await page.getByTestId('talk-neg_toll').click();
    await shot('talk-02-toll-picked', 3);
    await page.getByRole('button', { name: 'Watch', exact: true }).click();
    await frames(3);
    await page.evaluate(() => window.__cb.player.skipAll());
    await page.waitForFunction(() => window.__cb.game.getState().cutscene?.phase === 'aftermath', null, { polling: 300 });
    await frames(8);
    await shot('talk-03-report', 4);
    await page.getByRole('button', { name: /Check the drive|See to the drive|Pick up the pieces/ }).click();
    await frames(4);

    // ── a lost fight: the report, the Next-steps card, the world ──
    await prep(2.25, { noGuns: true });
    await page.evaluate(async () => {
      const cb = window.__cb, G = cb.game;
      const g = structuredClone(G.getState().game);
      g.gate.pending = { id: 'e10', kind: 'gang', day: 6, title: 'An armed crew', dossier: ['14 of them, organized, rifles.'], size: 14, armed: true, strength: 170, wants: { canned: 8, fuel: 4 }, stances: ['defend'], temper: 'hard' };
      G.getState().load(g);
    });
    await frames(8); await page.waitForTimeout(3000); await dismiss();
    await shot('lost-01-prompt', 4);
    await page.getByRole('button', { name: 'Watch', exact: true }).click();
    await frames(3);
    await page.evaluate(() => window.__cb.player.skipAll());
    await page.waitForFunction(() => window.__cb.game.getState().cutscene?.phase === 'aftermath', null, { polling: 300 });
    await frames(8);
    await shot('lost-02-report', 4);
    await page.waitForFunction(() => !window.__cb.cam.gliding, null, { polling: 300 }); await page.waitForTimeout(2500);
    await shot('lost-03-aftermath-world', 4);
    await page.getByRole('button', { name: /Check the drive|See to the drive|Pick up the pieces/ }).click();
    await frames(6);
    const aft = page.getByRole('button', { name: /Leave|Bury/ }); if (await aft.count()) { await aft.first().click(); await frames(4); }
    await page.waitForTimeout(1500);
    await shot('lost-04-next-steps', 4);
    console.log(await page.evaluate(() => JSON.stringify({ damage: window.__cb.game.getState().game.raidDamage?.map(d => d.kind) ?? [], talks: window.__cb.game.getState().game.gate.talks })));
  }

  if (only !== 'talk') {
    // ── the damage in the world, before and after, eye level and from above ──
    await prep(14, {});
    await page.evaluate(() => { const G = window.__cb.game; G.setState(s => { const g = structuredClone(s.game); g.gate.pending = null; g.gate.card = null; g.gate.aftermath = null; g.raidDamage = []; for (const st of g.structures) st.fixes = []; return { game: g }; }); });
    await page.getByRole('button', { name: /Hide panels/ }).click().catch(() => {});
    await frames(6); await dismiss();
    const geo = await page.evaluate(() => {
      const g = window.__cb.game.getState().game, run = g.perimeter[0], h = g.structures[0];
      return { pts: run.pts, house: { x: h.x, z: h.z } };
    });
    const [p0, p1, p2] = geo.pts;
    const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const breach = mid(p0, p1, 0.35), gate = mid(p1, p2, 0.6);
    const pose = (eye, look, fov) => page.evaluate(([eye, look, fov]) => { const cb = window.__cb; cb.qa.pose = { x: eye[0], y: eye[1], z: eye[2], lx: look[0], ly: look[1], lz: look[2], fov }; }, [eye, look, fov]);
    const g0 = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
    const views = [];
    // from inside the yard (kept clear of brush) looking out at the break; and from above
    for (const [name, at] of [['fence-breach', breach], ['gate', gate]]) {
      const gy = await g0(at[0], at[1]);
      const dx = geo.house.x - at[0], dz = geo.house.z - at[1], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      const ey = await g0(at[0] + ux * 2.6, at[1] + uz * 2.6);
      views.push({ name: `${name}-eye`, eye: [at[0] + ux * 2.6, ey + 0.32, at[1] + uz * 2.6], look: [at[0], gy + 0.1, at[1]], fov: 55 });
      views.push({ name: `${name}-above`, eye: [at[0] + ux * 3.2, gy + 3.2, at[1] + uz * 3.2], look: [at[0], gy, at[1]], fov: 50 });
    }
    const hy = await g0(geo.house.x, geo.house.z);
    views.push({ name: 'house-windows-eye', eye: [geo.house.x + 1.9, hy + 0.25, geo.house.z + 2.6], look: [geo.house.x + 0.3, hy + 0.05, geo.house.z + 0.8], fov: 55 });
    const clean = async (tag) => { for (const v of views) { await pose(v.eye, v.look, v.fov); await shot(`dmg-${tag}-${v.name}`, 3); } };
    await clean('before');
    await page.evaluate(async ([breach, gate, house]) => {
      const G = window.__cb.game, { addBurnScar } = await import('/src/sim/raidDamage.ts');
      const { crackGlass } = await import('/src/sim/improvements.ts');
      G.setState(s => {
        const g = structuredClone(s.game), run = g.perimeter[0];
        g.raidDamage = [
          { id: 'dA', kind: 'breach', x: breach[0], z: breach[1], runId: run.id, day: 1, hours: 12, done: 0, supplied: true, bill: {}, what: 'the fence' },
          { id: 'dB', kind: 'gate', x: gate[0], z: gate[1], runId: run.id, day: 1, hours: 20, done: 0, supplied: true, bill: {}, what: 'the gate' },
        ];
        g.nextId += 5;
        addBurnScar(g, house.x - 4.5, house.z - 3.5, 'shed');
        crackGlass(g.structures[0], 'poor');
        return { game: g };
      });
    }, [breach, gate, geo.house]);
    await frames(4);
    await clean('after');
  }
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
