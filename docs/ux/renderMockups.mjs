// Renders docs/ux/layout*.html to PNG at 1512x860 (and 1280x720 scaled preview of A): node docs/ux/renderMockups.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const dir = new URL('.', import.meta.url).pathname;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1512, height: 860 } });
for (const n of ['Today', 'A', 'B', 'C']) { await p.goto('file://' + resolve(dir, `layout${n}.html`)); await p.screenshot({ path: resolve(dir, `layout${n}.png`) }); console.log('layout' + n + '.png'); }
await b.close();
