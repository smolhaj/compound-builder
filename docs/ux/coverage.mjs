// Screen coverage of the mockups: node docs/ux/coverage.mjs  (area under .p panels and the ticker, on an 8 px grid)
import { createRequire } from 'node:module'; import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const dir = new URL('.', import.meta.url).pathname, b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1512, height: 860 } });
for (const n of ['Today', 'OptA', 'OptB', 'OptC', 'A-closed', 'A']) {
  await p.goto('file://' + resolve(dir, `layout${n}.html`));
  const r = await p.evaluate(() => { const c = 8, W = 1512, H = 860, g = new Uint8Array(W / c * Math.ceil(H / c)); const cols = W / c;
    for (const e of document.querySelectorAll('.p,.ticker')) { if (e.classList.contains('hov') || e.classList.contains('trans') || e.closest('.hov')) continue; const q = e.getBoundingClientRect(); for (let y = Math.floor(q.top / c); y < Math.ceil(q.bottom / c); y++) for (let x = Math.floor(q.left / c); x < Math.ceil(q.right / c); x++) if (y >= 0 && x >= 0 && x < cols) g[y * cols + x] = 1; }
    let t = 0; for (const v of g) t += v; let mid = 0, mn = 0; for (let y = 0; y < g.length / cols; y++) for (let x = Math.floor(cols * .25); x < Math.floor(cols * .75); x++) { mn++; mid += g[y * cols + x]; }
    return { covered: +(100 * t / g.length).toFixed(1), center: +(100 * mid / mn).toFixed(1), buttons: document.querySelectorAll('.btn,.chip').length }; });
  console.log(n, JSON.stringify(r));
}
await b.close();
