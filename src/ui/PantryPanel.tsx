/**
 * Supplies → Pantry: the stores item by item (sim/pantry.ts), how many days
 * of each, what's close to its date, what the family is eating and what
 * the diet is doing to them.
 */
import type { ReactNode } from 'react';
import type { GameState } from '../sim/state';
import { dietEffects, eatingLine, FOOD, pantryRows, type FoodItemId, type PantryRow } from '../sim/pantry';
import { needOf } from '../sim/needs';

const DIM = 'rgba(238,238,238,0.6)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
const h3 = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 } as const;

/** The unit a row is counted in. */
/** Units of the food put up on the place. */
const HOME_WORD: Partial<Record<FoodItemId, string>> = { home_canned_meat: 'case', dried_produce: 'jar', cured_pork: 'ham', cellar_roots: 'bushel', cheese: 'wheel', butter: 'lb', lard: 'crock', maple_syrup: 'gal' };
function unitWord(id: FoodItemId, n: number): string {
  const it = FOOD[id], one = Math.abs(n - 1) < 0.05;
  if (HOME_WORD[id]) return one || HOME_WORD[id] === 'lb' || HOME_WORD[id] === 'gal' ? HOME_WORD[id]! : HOME_WORD[id] + 's';
  const w = id === 'home_canned' ? 'case' : id === 'honey' || id === 'oil' ? 'jug' : it.prop === 'bucket' ? 'bucket' : it.prop === 'can10' ? (id === 'coffee' ? 'can' : '#10 can') : it.prop === 'sack' || it.prop === 'bag' ? (id === 'smoked_meat' ? 'bundle' : 'bag') : it.prop === 'pack' ? 'box' : 'case';
  return one ? w : w + (w.endsWith('s') ? 'es' : 's');
}
const amount = (r: PantryRow) => `${r.units >= 10 ? Math.round(r.units) : r.units >= 1 ? r.units.toFixed(1).replace(/\.0$/, '') : r.units.toFixed(2)} ${unitWord(r.id, r.units)}`;
const span = (d: number) => !isFinite(d) ? '—' : d >= 365 ? `${(d / 365).toFixed(d >= 3650 ? 0 : 1)} yr` : d >= 60 ? `${Math.round(d / 30)} mo` : `${Math.max(0, Math.round(d))} d`;

export function PantryPanel({ game }: { game: GameState }): ReactNode {
  const need = game.people.reduce((a, p, i) => a + (game.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);
  const rows = pantryRows(game, need);
  const fromStores = game.food?.fromStores ?? true;
  const diet = dietEffects(game, fromStores);
  const soon = rows.filter(r => r.tone !== 'good');
  return <div style={{ marginBottom: 10 }}>
    <div style={h3}>Pantry</div>
    <div style={{ fontSize: 11.5, lineHeight: 1.35, margin: '0 0 4px' }}><span style={{ color: DIM }}>What we're eating:</span> {eatingLine(game)}</div>
    {rows.length === 0 && <div style={{ fontSize: 11.5, color: DIM }}>Nothing put by. Buy food in the shop (Food tab).</div>}
    {rows.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', columnGap: 8, rowGap: 1, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: DIM }}>item</span><span style={{ color: DIM, textAlign: 'right' }}>have</span><span style={{ color: DIM, textAlign: 'right' }}>days</span><span style={{ color: DIM, textAlign: 'right' }}>keeps</span>
      {rows.map(r => <PantryLine key={r.id} r={r} />)}
    </div>}
    {soon.length > 0 && <div style={{ fontSize: 11.5, margin: '3px 0', color: TONE[soon.some(r => r.tone === 'bad') ? 'bad' : 'warn'] }}>
      {soon.slice(0, 3).map(r => `${FOOD[r.id].name.split(',')[0]} ${r.left <= 0 ? `is past its date (worth ${Math.round(r.value * 100)} %)` : `has ${span(r.left)} left`}`).join('; ')}. {game.disaster.tracks.stores >= 0.5 ? 'Long-expired food gets thrown out and bought fresh while the stores sell; rotating keeps it young.' : 'Old food is still food: it gives less, and now and then makes someone sick.'}</div>}
    {(() => { const old = rows.filter(r => r.left <= 0 && FOOD[r.id].kcal > 0); return old.length > 0 && <div style={{ fontSize: 11.5, color: DIM }}>Past date: {Math.round(old.reduce((a, r) => a + r.kcal, 0) / 1000)}k kcal, worth about {Math.round(old.reduce((a, r) => a + r.kcal * r.value, 0) / 1000)}k.</div>; })()}
    {diet.notes.map((n, i) => <div key={i} style={{ fontSize: 11.5, lineHeight: 1.35, margin: '2px 0', color: n.tone === 'good' ? DIM : TONE[n.tone] }}>{n.text}</div>)}
  </div>;
}

function PantryLine({ r }: { r: PantryRow }) {
  const it = FOOD[r.id];
  return <>
    <span title={it.unit} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name.split(',')[0]}</span>
    <span style={{ textAlign: 'right' }}>{amount(r)}</span>
    <span style={{ textAlign: 'right', color: DIM }}>{it.kcal > 0 ? (r.days >= 1 ? Math.round(r.days) : '<1') : r.days < 1e5 ? Math.round(r.days) : '—'}</span>
    <span style={{ textAlign: 'right', color: TONE[r.tone] }} title={r.left <= 0 ? 'Past its best-by date: still edible, worth less, a small risk of food poisoning' : undefined}>{r.left <= 0 ? `${span(-r.left)} over · ${Math.round(r.value * 100)} %` : span(r.left)}</span>
  </>;
}
