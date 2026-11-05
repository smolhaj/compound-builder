// HUD layout + guards check: node scripts/hudLayoutShots.mjs <outDir> [port]. Top bar never under a panel at 1280x800, 1024x640, 420x800;
// the stake spend ask at $0; an off-lot wall plan refused. Prints PASS/FAIL lines; screenshots in <outDir>.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2] ?? 'shots/hudlayout', port = Number(process.argv[3] ?? 5985);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const say = (ok, m) => console.log((ok ? 'PASS ' : 'FAIL ') + m);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => console.log('PAGEERROR ' + e.message.slice(0, 200)));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.9`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => { const G = window.__cb.game; G.getState().setSpeed(0); const g = structuredClone(G.getState().game); g.fin.debt = { ...(g.fin.debt ?? {}), owed: 4300, stage: 'card', missed: 0, statementDay: 30 }; G.setState({ game: g }); });
  const rects = () => page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
    const fixed = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).position === 'fixed' && d.parentElement === document.querySelector('#root')?.firstElementChild?.parentElement || getComputedStyle(d).position === 'fixed');
    const bar = [...document.querySelectorAll('div')].find(d => /Shop & money/.test(d.innerText ?? '') && getComputedStyle(d).position === 'fixed' && d.querySelector('button') && /Save/.test(d.innerText));
    const panels = fixed.filter(d => d !== bar && /^(Build|Family)/.test((d.innerText ?? '').trim()) && !d.contains(bar));
    return { bar: bar ? vis(bar) : null, panels: panels.map(vis).filter(Boolean), vw: innerWidth };
  });
  const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  for (const [w, h] of [[1280, 800], [1024, 640], [420, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__cb.qa.renderNow());
    const R = await rects();
    const overlaps = [];
    if (!R.bar) overlaps.push('no top bar found');
    else {
      if (R.bar.l < -1 || R.bar.r > R.vw + 1) overlaps.push(`bar off screen ${Math.round(R.bar.l)}..${Math.round(R.bar.r)}`);
      for (const p of R.panels) if (hit(R.bar, p)) overlaps.push('bar under a panel');
      for (let i = 0; i < R.panels.length; i++) for (let j = i + 1; j < R.panels.length; j++) if (hit(R.panels[i], R.panels[j])) overlaps.push('panels overlap each other');
    }
    await page.screenshot({ path: `${out}/layout-${w}x${h}.png` });
    say(!overlaps.length, `${w}x${h}: ${R.panels.length} panel(s) shown, bar ${R.bar ? Math.round(R.bar.r - R.bar.l) + 'x' + Math.round(R.bar.b - R.bar.t) : '?'} ${overlaps.join('; ')}`);
  }
  // the stake spend ask at $0
  await page.setViewportSize({ width: 1280, height: 800 });
  const r1 = await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    const g = structuredClone(G.getState().game); g.money = 0; g.paper.permits = true; G.setState({ game: g });
    const n0 = G.getState().game.structures.length;
    const sp = cb.tool.findSpot('timber_cabin', c.x, c.z + 3, 0);
    cb.tool.setKind('timber_cabin'); cb.tool.hoverAt(sp[0], sp[1], 0);
    return { n0, sp };
  });
  void r1;
  const asked = await page.evaluate(() => {
    const cb = window.__cb, G = cb.game;
    cb.tool._place?.(false);
    const s = G.getState();
    return { ask: s.spendAsk, n: s.game.structures.length, money: s.game.money };
  });
  say(!!asked.ask && asked.money === 0, 'stake at $0 asks first ' + JSON.stringify(asked.ask));
  await page.evaluate(() => window.__cb.qa.renderNow());
  await page.screenshot({ path: `${out}/spend-ask.png` });
  await page.getByRole('button', { name: 'Keep a reserve' }).click();
  const after = await page.evaluate(() => ({ ask: window.__cb.game.getState().spendAsk, money: window.__cb.game.getState().game.money }));
  say(!after.ask && after.money === 0, 'Keep a reserve declines; money still $0 (' + after.money + ')');
  // off-lot wall
  const wall = await page.evaluate(() => {
    const G = window.__cb.game, c = window.__cb.world.camp; const n0 = G.getState().game.perimeter.length;
    G.getState().planRun('stone_wall', [[c.x, c.z], [c.x + 400, c.z]], [], 0);
    return { n0, n1: G.getState().game.perimeter.length };
  });
  say(wall.n0 === wall.n1, `2.4 km wall plan refused (${wall.n0} -> ${wall.n1} runs)`);
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
