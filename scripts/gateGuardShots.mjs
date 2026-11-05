/**
 * The hardened gate house and the guards' cars at the drive (sim/richSinks.ts, sim/guards.ts), aerial and eye level.
 *   node scripts/gateGuardShots.mjs --out shots/gateguard [--port 5343]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5343)), out = resolve(opt('--out', 'shots/gateguard'));
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
    g.stock.gate_house = 1; g.money = 900000;
    g.structures.push({ id: 'qahome', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    G.setState({ game: g });
  });
  console.log('hire', await page.evaluate(() => { const G = window.__cb.game.getState(); return [G.hireGuard(), G.hireGuard(), window.__cb.game.getState().game.guards?.staff.length]; }));
  await page.getByRole('button', { name: /Hide panels/ }).click();
  const look = (r, pitch, yaw, dx = 0, dz = 0, dy = 0.15) => page.evaluate(([r, pitch, yaw, dx, dz, dy]) => {
    const cb = window.__cb, gp = cb.world.access.gate, x = gp.x - 0.8 + dx, z = gp.z + dz;
    cb.cam.target.set(x, cb.world.groundAt(x, z) + dy, z); cb.cam.radius = r; cb.cam.pitch = pitch; cb.cam.yaw = yaw;
  }, [r, pitch, yaw, dx, dz, dy]);
  await page.waitForTimeout(800);
  // a 0.28-tall stand-in for a person (the harness cannot move the family), beside the barrier, for scale
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
    const cb = window.__cb, gp = cb.world.access.gate;
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x3a5a8a }));
    body.position.y = 0.1; const head = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b090 })); head.position.y = 0.24;
    m.add(body, head); m.name = 'qa_person';
    const fr = cb.world._gateFrame; fr.add(m); m.position.set(-0.25, 0, 0.5);
  });
  await look(3.2, 0.95, 0.6); await page.waitForTimeout(600); await shot('aerial-gate-house');
  await look(1.6, 0.35, 0.9); await page.waitForTimeout(400); await shot('three-quarter-gate-house');
  await look(0.9, 0.08, -0.5, 0, 0.3, 0.14); await page.waitForTimeout(400); await shot('eye-level-gate-house');
  // no gate house: the guards' own cars park at the drive
  await page.evaluate(() => { const G = window.__cb.game, g = structuredClone(G.getState().game); g.stock.gate_house = 0; G.setState({ game: g }); });
  await page.waitForTimeout(800);
  await look(3.2, 0.95, 0.6); await page.waitForTimeout(600); await shot('aerial-guard-cars');
  await look(1.4, 0.2, 0.9); await page.waitForTimeout(400); await shot('eye-level-guard-cars');
  // the collapse comes; the guard with nobody to go to asks to stay (the decision card), is taken in, and takes the night watch
  await page.evaluate(async () => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const gd = await import('/src/sim/guards.ts');
    g.disaster.tracks = { ...g.disaster.tracks, banks: 0, law: 0 };
    for (const x of g.guards.staff) { x.alone = true; x.local = false; x.holds = 0; }
    for (let d = 0; d < 80 && !g.gate.pending; d++) gd.guardDay(g);
    G.setState({ game: g });
  });
  await page.getByRole('button', { name: /^Hide panels|Show panels/ }).first().click().catch(() => {});
  await page.waitForTimeout(800); await shot('guard-asks-to-stay-card');
  await page.evaluate(async () => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const en = await import('/src/sim/encounters.ts');
    en.resolve(g, 'take_in'); g.gate.pending = null; g.gate.card = null;
    g.clock.t = Math.floor(g.clock.t) + 23 / 24;
    const him = g.people[g.people.length - 1]; const ps = g.personState.find(q => q.id === him.id); if (ps) ps.task = 'watch';
    G.setState({ game: g });
  });
  await page.waitForTimeout(1500);
  await look(2.2, 0.4, 0.9); await shot('guard-at-his-post-aerial');
  await look(0.9, 0.08, 0.9, 0, 0.0, 0.14); await shot('guard-at-his-post-eye-level');
} finally { await browser.close(); vite.kill(); }
