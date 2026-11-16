/**
 * The felt feed and radio in the real app (FL3): for each kind, play the sim a few days past the hit with a shortwave set, then open the
 * Compound Board (the "What's different" card and "Heard lately") with the ticker along the bottom.
 *   flock /tmp/cb.lock node scripts/feltFeedShots.mjs [--kinds mega_quake,wildfire,cyberattack] [--day 4] [--port 5973] [--out shots/felt-feed]
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
const port = Number(opt('--port', 5973)), day = Number(opt('--day', 4));
const kinds = opt('--kinds', 'mega_quake,wildfire,cyberattack').split(',');
const outDir = resolve(opt('--out', 'shots/felt-feed'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const kind of kinds) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(240000);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
    await page.waitForFunction(() => window.__cb?.qa?.lowrender);
    await page.evaluate(() => { window.__cb.store.getState().setQuality('low'); window.__cb.game.getState().setSpeed(0); });
    const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
    // the real sim: trigger the kind with no warning, hand the family a shortwave set, and run the days
    const info = await page.evaluate(async ([kind, day]) => {
      const { triggerDisaster } = await import('/src/sim/disaster.ts');
      const { step } = await import('/src/sim/engine.ts');
      const { feltFeed } = await import('/src/sim/felt/feed.ts');
      const { feltSpec } = await import('/src/sim/felt/registry.ts');
      const { sendScout } = await import('/src/sim/rumors.ts');
      const { fxCtxFor } = await import('/src/sim/disasterFx.ts');
      const G = window.__cb.game;
      let g = structuredClone(G.getState().game);
      g.disaster.mode = 'god'; g.disaster.phase = 'peace';
      triggerDisaster(g.disaster, g.clock.t, kind, g.seed, 0);
      g.stock.sw_radio = 1; g.gate.pending = null; g.gate.incoming = null;
      for (const st of g.structures) { st.stage = 99; st.finishedAt = g.clock.t; }
      let n = 0;
      while ((g.clock.t - g.disaster.hitAt < day || (g.radio?.heard ?? []).length < 4) && n++ < 400) { g.gate.pending = null; g.gate.incoming = null; g = step(g, 0.25); if (g.clock.t - g.disaster.hitAt > 25) break; }
      // send a clear-eyed scout to check the first thing heard, so one line shows its verdict
      for (const p of g.people) p.skills.hunter = 20;
      const first = g.radio?.heard?.find(h => h.claim);
      if (first && !sendScout(g, first.id, g.people.find(p => p.age >= 16).id)) { g = step(g, 1.5); }
      // the feed as the day sees it: today's look against the world before the hit (it is rebuilt here, so the card shows the whole change)
      delete g.disaster.fx.feltFeed;
      feltFeed(g, fxCtxFor(g, 3), feltSpec(kind));
      g.clock.speed = 0;
      G.setState({ game: g, resumeTo: null, dayCard: null, cutscene: null });
      return { day: g.clock.t - g.disaster.hitAt, heard: (g.radio?.heard ?? []).map(h => h.text), news: g.disaster.news.slice(-3).map(x => x.text), feed: g.disaster.fx?.feltFeed?.lines?.map(l => l.text) };
    }, [kind, day]);
    console.log(kind, JSON.stringify(info, null, 1));
    await frames(3);
    await page.evaluate(() => { window.__cb.store.setState({ hudHidden: false }); });
    if (!(await page.getByRole('dialog', { name: 'Compound board' }).count())) await page.getByRole('button', { name: /^Board/ }).first().click();
    await frames(3);
    const f = `${outDir}/${kind}-board.png`; await page.screenshot({ path: f }); console.log(f);
    await page.close();
  }
} finally { await browser.close(); vite.kill(); }
