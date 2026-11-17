// Renders docs/ux/layoutA-*.html (and layoutA.html) to PNG at their design size: node docs/ux/renderLayoutA.mjs
import { createRequire } from 'node:module'; import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const dir = new URL('.', import.meta.url).pathname, b = await chromium.launch();
const sizes = { 'layoutA': [1512, 860], 'layoutA-closed': [1512, 860], 'layoutA-build': [1512, 860], 'layoutA-crisis': [1512, 860], 'layoutA-1280': [1280, 720], 'layoutA-1100': [1100, 700] };
for (const [n, [w, h]] of Object.entries(sizes)) { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto('file://' + resolve(dir, n + '.html')); const ov = await p.evaluate(() => ({ h: document.documentElement.scrollWidth > innerWidth, off: [...document.querySelectorAll('.p')].filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length })); await p.screenshot({ path: resolve(dir, n + '.png') }); console.log(n, w + 'x' + h, JSON.stringify(ov)); await p.close(); }
await b.close();
