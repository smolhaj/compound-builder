// npm run manual: regenerate docs/MANUAL.md from the game's own data (src/manual). Uses Vite's module loader, like the other scripts.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../docs/MANUAL.md', import.meta.url));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildManual } = await server.ssrLoadModule('/src/manual/build.ts');
  const { markdown } = buildManual();
  writeFileSync(out, markdown);
  console.log(`wrote docs/MANUAL.md (${markdown.length.toLocaleString('en-US')} characters)`);
} finally { await server.close(); }
