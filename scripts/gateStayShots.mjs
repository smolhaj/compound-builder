/**
 * A guard with nobody to go to asks to stay (decision card), is taken in, and stands the night watch (sim/richSinks.ts, sim/guards.ts), aerial and eye level.
 *   node scripts/gateStayShots.mjs --out shots/gatestay [--port 5348]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5348)), out = resolve(opt('--out', 'shots/gatestay'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR', m.text().slice(0, 200)); });
let n = 0;
const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(600); const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => {
    const G = window.__cb.game; G.getState().setSpeed(0); window.__cb.store.getState().setQuality('low');
    // hide the panels so nothing covers the view
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    g.money = 900000;
    g.structures.push({ id: 'qahome', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    G.setState({ game: g });
  });
  console.log('hire', await page.evaluate(() => { const G = window.__cb.game.getState(); return [G.hireGuard(), G.hireGuard(), window.__cb.game.getState().game.guards?.staff.length]; }));
  const look = (r, pitch, yaw, dx = 0, dz = 0, dy = 0.15) => page.evaluate(([r, pitch, yaw, dx, dz, dy]) => {
    const cb = window.__cb, gp = cb.world.access.gate, x = gp.x - 0.8 + dx, z = gp.z + dz;
    cb.cam.target.set(x, cb.world.groundAt(x, z) + dy, z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw;
  }, [r, pitch, yaw, dx, dz, dy]);
  await page.waitForTimeout(500);
  // the collapse: the guard with nobody to go to asks to stay. The card shot comes first (a pending card holds the sim, not the frame).
  await page.evaluate(async () => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const gd = await import('/src/sim/guards.ts');
    g.disaster.tracks = { ...g.disaster.tracks, banks: 0, law: 0 };
    for (const x of g.guards.staff) { x.alone = true; x.local = false; x.holds = 0; }
    for (let d = 0; d < 80 && !g.gate.pending; d++) gd.guardDay(g);
    G.setState({ game: g });
  });
  await page.waitForTimeout(1200);
  console.log('pending', await page.evaluate(() => window.__cb.game.getState().game.gate.pending?.kind));
  await shot('guard-asks-to-stay-card');
  await page.getByRole('button', { name: 'Take him in' }).click({ timeout: 15000 }).catch(e => console.log('click failed', e.message.slice(0, 80)));
  await page.waitForTimeout(800);
  console.log('guard on roster', await page.evaluate(() => window.__cb.game.getState().game.people.filter(p => p.guard).length));
  await shot('after-take-him-in');
  await page.evaluate(() => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    g.gate.card = null; g.clock.t = Math.floor(g.clock.t) + 23 / 24;
    const him = g.people.find(p => p.guard); const ps = him && g.personState.find(q => q.id === him.id); if (ps) ps.task = 'watch';
    G.setState({ game: g });
  });
  await page.getByRole('button', { name: /Hide panels/ }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const lookAt = (r, pitch, yaw, dy = 0.15) => page.evaluate(([r, pitch, yaw, dy]) => {
    const cb = window.__cb, g = cb.game.getState().game, him = g.people.find(p => p.guard);
    const pos = cb.world.family.positions().find(p => p.id === him?.id) ?? cb.world.family.positions()[0];
    cb.cam.target.set(pos.x, cb.world.groundAt(pos.x, pos.z) + dy, pos.z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw;
  }, [r, pitch, yaw, dy]);
  await lookAt(3.0, 0.9, 0.6); await shot('guard-aerial');
  await lookAt(0.9, 0.08, 0.6); await shot('guard-eye-level');
} finally { await browser.close(); vite.kill(); }
