// Renders the skirt cutaway components (src/ui/DomeSkirtCutaway.tsx) to static SVG files and a 1920x1080 PNG each.
//   node scripts/buildSkirtCutaway.mjs [outDir=docs/ux/dome-mock]
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from "node:path";
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2] || 'docs/ux/dome-mock';
mkdirSync(out, { recursive: true });
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = await vite.ssrLoadModule('/src/ui/DomeSkirtCutaway.tsx');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const jobs = [['skirt-cutaway', mod.SkirtSection], ['skirt-plan', mod.SkirtPlan]];
const files = [];
for (const [name, C] of jobs) {
  let svg = renderToStaticMarkup(React.createElement(C, {}));
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  writeFileSync(`${out}/${name}.svg`, '<?xml version="1.0" encoding="UTF-8"?>\n' + svg); files.push(name);
}
await vite.close();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const n of files) { await p.goto(`file://${resolve(out)}/${n}.svg`); await p.screenshot({ path: `${out}/${n}.png` }); console.log(n); }
await b.close();
