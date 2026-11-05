// Insider threat UI: the Security staff section (loyalty, vet state, wage, Vet buttons) and the dismissal card. HUD visible, ?lowrender.
//   node scripts/insiderShots.mjs <outDir> [port=5944]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2] || 'shots/insider', port = Number(process.argv[3] || 5944);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.4`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
  const shot = async name => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };
  await page.evaluate(() => {
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    g.money = 900000;
    g.structures.push({ id: 'qahome', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    G.setState({ game: g });
  });
  await page.evaluate(() => { const G = window.__cb.game.getState(); G.hireGuard(); G.hireGuard(); G.hireGuard(); });
  await page.evaluate(() => window.__cb.game.setState(s => {
    const g = structuredClone(s.game), st = g.guards.staff;
    st[0].vet = 'cleared'; st[0].loyalty = 78;
    st[1].vet = 'pending'; st[1].vetDue = g.clock.t + 3; st[1].loyalty = 52;
    st[2].loyalty = 31; g.guards.wage = 'low';
    return { game: g };
  }));
  await page.getByText('Defense', { exact: true }).last().click();
  await page.waitForTimeout(500);
  await shot('00-defense-tab');
  const el = page.getByText('Security staff').first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('01-security-staff');
  // the dismissal card
  await page.evaluate(() => window.__cb.game.setState(s => {
    const g = structuredClone(s.game), x = g.guards.staff[2];
    g.gate.pending = { id: 'qa', kind: 'insider', day: 1, title: `${x.name} is working for someone else`, dossier: ['The background check on ' + x.name + ' came back: money in his accounts that should not be there, and calls to a number that belongs to a crew.', 'He has the run of the place: the posts, the hours of the watch, the gate. Whatever he has told them, he can tell them more.', 'Wall strength does not help against a man who can open the gate himself.'], size: 1, armed: false, strength: 0, suspect: { kind: 'guard', id: x.id, name: x.name }, stances: ['dismiss', 'ignore'] };
    return { game: g };
  }));
  await page.waitForTimeout(500);
  await shot('02-dismissal-card');
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.gate.pending = null; return { game: g }; }));
  // joiners: two newcomers, one with a check under way
  await page.evaluate(async () => {
    const nc = await import('/src/sim/newcomers.ts'), ins = await import('/src/sim/insider.ts');
    const G = window.__cb.game, g = structuredClone(G.getState().game);
    const mk = (id, first, age) => ({ id, first, last: 'Vance', age, kid: false, body: 'm', skills: { builder: 2, gardener: 3, medic: 1, mechanic: 4, hunter: 2, negotiator: 1, teacher: 0, radio: 0 }, shirt: 0x556b3a });
    nc.admitNewcomers(g, [mk('qa1', 'Joel', 34)], { kind: 'stranger' });
    nc.admitNewcomers(g, [mk('qa2', 'Mina', 29)], { kind: 'stranger' });
    ins.startVetBond(g, 'qa2');
    G.setState({ game: g });
  });
  await page.getByText('Family', { exact: true }).last().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Vet · \$300/ }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('03-newcomers-vet');
  // phone width
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Show panels/ }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Family', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Vet · \$300/ }).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await shot('04-newcomers-vet-phone');
  await page.getByText('Defense', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByText('Security staff').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot('05-security-staff-phone');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
