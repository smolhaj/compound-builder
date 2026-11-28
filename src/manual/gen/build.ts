import { CATS, billFor, catalogEntries, type CatalogEntry } from '../../sim/buildCatalog';
import { table } from '../md';
import { baseline, usd } from './common';

const hoursText = (h: number): string => (h >= 16 ? `${Math.round(h / 8).toLocaleString('en-US')} work days` : `${Math.max(1, Math.round(h))} hours`);

/** The Build menu, by category: what each piece costs the family to build itself and with a hired crew, how long it takes, what it gives. */
export function buildKit(): string {
  const s = baseline(), all = catalogEntries();
  const out: string[] = [];
  for (const cat of CATS) {
    const es = all.filter(e => e.cat === cat.id);
    if (!es.length) continue;
    out.push(`### ${cat.label}`, '', table(['Piece', 'Cash, family builds', 'Cash, with a crew', 'Work', 'What it gives'], es.map((e: CatalogEntry) => {
      const b = billFor(s, e);
      return [e.run ? `${e.name} (per 100 ft)` : e.name, usd(b.ownerUsd), usd(b.crewUsd), hoursText(b.hours), b.gives];
    })), '');
  }
  return out.join('\n').trim();
}

/** The four dome tiers and what each one stands up to, from the same facts the Build card shows. */
export function domeTiers(): string {
  const s = baseline();
  const rows = catalogEntries().filter(e => e.cat === 'enclosure').map(e => {
    const b = billFor(s, e);
    return `### ${e.name}\n\n${b.gives}\n\n${b.facts.map(f => `- ${f}`).join('\n')}\n\n- Cash, family builds: ${usd(b.ownerUsd)}`;
  });
  return rows.join('\n\n');
}
