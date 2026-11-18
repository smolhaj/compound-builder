/**
 * The dome's placing card (the diameter handle): while a dome is armed, a small card low on the left of the screen sets how wide it is (a slider, + and - buttons, or the
 * keys and Shift+wheel on the map), says what the circle under the cursor would sit on, straddle and clear, and keeps the bill live: price, permit, work,
 * air, climate. Layout A and classic both mount it. The size is the tier's own range (sim/dome/tiers.ts); everything priced here is the same pure model
 * the build bill uses.
 */
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { TIER, kindOfCells, shellFt, tierOfKind } from '../../sim/dome/tiers';
import { billFor, adviceCtx, type CatalogEntry } from '../../sim/buildCatalog';
import { KIT } from '../../game/buildkit/kit';
import { T, tv } from './tokens';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function DomeSizeCard() {
  const tool = useGameStore(g => g.tool), cells = useGameStore(g => g.domeCells), site = useGameStore(g => g.domeSite), game = useGameStore(g => g.game), setCells = useGameStore(g => g.setDomeCells);
  const scale = useWorldStore(w => w.uiScale), hidden = useWorldStore(w => w.hudHidden);
  const tier = tool ? tierOfKind(tool) : null;
  if (!tier || !tool || hidden) return null;
  const t = TIER[tier], c = cells[tier] ?? t.cells, kind = kindOfCells(tier, c), d = Math.round(shellFt(tier, c));
  const entry: CatalogEntry = { key: kind, tool: kind, name: `${t.name}, ${d} ft`, cat: 'enclosure', run: false, blurb: KIT[kind].blurb };
  const bill = billFor(game, entry, adviceCtx(game));
  const facts = bill.facts.filter(f => /^Climate|^Sealed|across/.test(f));
  const btn = { cursor: 'pointer', font: 'inherit', width: 28, height: 26, borderRadius: tv.radius('control'), border: `1px solid ${T.color.lineStrong}`, background: tv.color('control'), color: tv.color('text') } as const;
  const bad = site && !site.ok;
  return <div data-testid="dome-size-card" role="group" aria-label="Dome size" style={{ position: 'fixed', left: 12, bottom: 78 * scale, transform: `scale(${scale})`, transformOrigin: 'bottom left', zIndex: 17, width: 380,
    boxSizing: 'border-box', padding: T.space[3], background: 'rgba(20,22,18,0.95)', color: tv.color('text'), border: `1px solid ${bad ? tv.color('warn') : T.color.lineStrong}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2),
    fontFamily: tv.font('family'), fontSize: tv.font('sm'), lineHeight: T.lineHeight.body, display: 'flex', flexDirection: 'column', gap: T.space[2] }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>{t.name}</span>
      <span data-testid="dome-diameter" style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi, fontVariantNumeric: 'tabular-nums' }}>{d} ft across</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" aria-label="Narrower" title="Narrower (-)" disabled={c <= t.minCells} style={btn} onMouseDown={e => e.preventDefault()} onClick={() => setCells(tier, c - 1)}>-</button>
      <input data-testid="dome-slider" type="range" aria-label="Dome diameter" min={t.minCells} max={t.maxCells} step={1} value={c} onChange={e => setCells(tier, Number(e.target.value))} style={{ flex: 1, minWidth: 0, accentColor: '#d8c9a0' }} />
      <button type="button" aria-label="Wider" title="Wider (+)" disabled={c >= t.maxCells} style={btn} onMouseDown={e => e.preventDefault()} onClick={() => setCells(tier, c + 1)}>+</button>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', color: tv.color('dim'), fontSize: tv.font('fine') }}><span>{Math.round(shellFt(tier, t.minCells))} ft</span><span>{c === t.cells ? 'the usual size' : `${c > t.cells ? '+' : '-'}${Math.abs(c - t.cells) * 10} ft from the usual`}</span><span>{Math.round(shellFt(tier, t.maxCells))} ft</span></div>
    <div data-testid="dome-site" style={{ color: bad ? tv.color('warn') : tv.color('text') }}>{site ? (bad ? `${T.glyph.warn} ` : '') + site.summary : 'Move the pointer over your land.'}</div>
    <div style={{ borderTop: `1px solid ${T.color.line}`, paddingTop: T.space[2], display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Row l="Family builds it" v={usd(bill.ownerUsd)} strong />
      <Row l={`Hired crew (wages ${usd(bill.crewLaborUsd)})`} v={usd(bill.crewUsd)} />
      <Row l="Work" v={`${Math.round(bill.hours).toLocaleString('en-US')} h, a crew about ${bill.crewWeeks} ${bill.crewWeeks === 1 ? 'week' : 'weeks'}`} />
      {bill.other.filter(o => /permit/i.test(o.label)).map(o => <Row key={o.label} l="County permit" v={usd(o.usd)} />)}
    </div>
    {facts.map(f => <div key={f} style={{ color: tv.color('dim') }}>{f}</div>)}
    {bill.needs.map(n => <div key={n} style={{ color: tv.color('warn') }}>{T.glyph.warn} {n}</div>)}
    <div style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>+ and - or Shift+wheel: diameter. Click places it, R turns it, Esc cancels.</div>
  </div>;
}

function Row({ l, v, strong = false }: { l: string; v: string; strong?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: strong ? T.weight.semi : T.weight.regular }}><span style={{ color: strong ? tv.color('text') : tv.color('dim') }}>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>;
}
