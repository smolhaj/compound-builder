// Measures the real width of every top-bar chip in the layout-A mockup (full and compact) and prints the budget table for topBarPlan.mjs: node docs/ux/measureChips.mjs
import { createRequire } from 'node:module'; import { VAL } from './buildLayoutA.mjs'; import { CSS, SCENE } from './buildMockups.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1512, height: 860 } });
const row = c => `<div style="display:flex;gap:6px;position:absolute;top:10px;left:10px;white-space:nowrap">${Object.entries(VAL).map(([k, f]) => `<span data-id="${k}" style="display:inline-flex">${f(c)}</span>`).join('')}</div>`;
const out = {};
for (const c of [false, true]) { await p.setContent(`<style>${CSS}</style>${row(c)}`); const w = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-id]')].map(e => [e.dataset.id, Math.round(e.getBoundingClientRect().width)]))); for (const [k, v] of Object.entries(w)) (out[k] ??= {})[c ? 'compact' : 'full'] = v; }
await p.setContent(`<style>${CSS}</style><div style="position:absolute;top:10px;left:10px;display:flex;gap:6px"><span id="d" style="font-weight:600;padding:0 4px">Apr 15 · 09:42</span><span class="btn" id="m" style="padding:0 8px">≡</span><span class="btn" style="padding:0 6px;min-width:30px" id="s">▶▶▶</span></div>`);
console.log(JSON.stringify(out), JSON.stringify(await p.evaluate(() => ({ date: document.getElementById('d').getBoundingClientRect().width, menu: document.getElementById('m').getBoundingClientRect().width, speedBtn: document.getElementById('s').getBoundingClientRect().width }))));
await b.close();
