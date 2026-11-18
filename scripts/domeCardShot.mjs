// The dome placing card on a sloped lot: the site-work line (cu yd, retaining wall, dollars) and the "How the skirt works" card opened from it.
//   node scripts/domeCardShot.mjs <outDir> [tier=arcology] [cells=36] [port=5993]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], tier = process.argv[3] || 'arcology', cells = Number(process.argv[4] || 36), port = Number(process.argv[5] || 5993);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.75&layout=a&region=mountain_west&acres=40&lotseed=8&relief=8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  const shot = async (name) => { await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(400); await page.evaluate(() => window.__cb.qa.renderNow()); await page.screenshot({ path: `${out}/${name}.png` }); console.error(name); };
  const info = await page.evaluate(async ([tier, cells]) => {
    const cb = window.__cb, G = cb.game, c = cb.world.camp; G.getState().setSpeed(0); G.getState().setWelcome?.(false);
    G.setState(s => ({ game: { ...s.game, money: 200_000_000 } }));
    const sp = cb.tool.findSpot(`dome_${tier}_${cells}`, c.x - 6, c.z - 6, 0, 40) ?? [c.x - 6, c.z - 6];
    const cam = cb.cam; cam.target.set(sp[0], 0, sp[1]); cam.radius = tier === 'arcology' ? 60 : 30; cam.pitch = 0.9;
    cb.tool.setKind(`dome_${tier}`); G.getState().setDomeCells(tier, cells); cb.tool.hoverAt(sp[0], sp[1]);
    return { sp };
  }, [tier, cells]);
  await page.waitForTimeout(600);
  await shot('card-site-work');
  await page.click('[data-testid=dome-skirt-info]');
  await page.waitForTimeout(500);
  await shot('card-how-the-skirt-works');
  console.error(JSON.stringify(info), await page.evaluate(() => document.querySelector('[data-testid=dome-site-work]')?.textContent));
} finally { await browser.close(); vite.kill(); }
