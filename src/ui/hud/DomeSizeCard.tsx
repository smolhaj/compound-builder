/**
 * The dome's placing card (the diameter handle): while a dome is armed, a small card low on the left of the screen sets how wide it is (a slider, + and - buttons, or the
 * keys and Shift+wheel on the map), says what the circle under the cursor would sit on, straddle and clear, and keeps the bill live: price, permit, work,
 * air, climate. Layout A and classic both mount it. The size is the tier's own range (sim/dome/tiers.ts); everything priced here is the same pure model
 * the build bill uses.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../store/gameStore';
import { SkirtSection } from '../DomeSkirtCutaway';
import { useWorldStore } from '../../store/worldStore';
import { TIER, kindOfCells, shellFt, tierOfKind } from '../../sim/dome/tiers';
import { hasYard, yardBill } from '../../sim/dome/plantYard';
import { CREW_RATE, billUsd } from '../../sim/dome/cost';
import { portBill, portWords } from '../../sim/dome/vehiclePort';
import { earthwork } from '../../sim/dome/pricing';
import { billFor, adviceCtx, type CatalogEntry } from '../../sim/buildCatalog';
import { KIT } from '../../game/buildkit/kit';
import { T, tv } from './tokens';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function DomeSizeCard() {
  const tool = useGameStore(g => g.tool), cells = useGameStore(g => g.domeCells), site = useGameStore(g => g.domeSite), game = useGameStore(g => g.game), setCells = useGameStore(g => g.setDomeCells);
  const scale = useWorldStore(w => w.uiScale), hidden = useWorldStore(w => w.hudHidden);
  const tier = tool ? tierOfKind(tool) : null;
  const [skirtOpen, setSkirtOpen] = useState(false);
  useEffect(() => { if (!skirtOpen) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setSkirtOpen(false); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [skirtOpen]);
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
    {hasYard(tier) && <div data-testid="dome-yard-line" style={{ color: tv.color('dim') }}>Includes the hardened plant yard outside ({usd(billUsd(yardBill(tier, shellFt(tier, c) / 40).bill))} of wall, service airlock, passage and sleeves): chillers and the substation need open air, so they stand behind a concrete wall with no gate, reached only through an airlock and a sealed passage from inside. The air and water plant, battery and control room are built inside the {tier === 'arcology' ? 'armored band' : 'shell'}.</div>}
    {tier !== 'earthen' && (() => { const r = shellFt(tier, c) / 40, pb = portBill(tier, r); return <div data-testid="dome-port-line" style={{ color: tv.color('dim') }}>Includes {usd(billUsd(pb.bill) + Math.round(pb.hours * CREW_RATE / 100) * 100)} for the vehicle sally port on the side facing your road: {portWords(tier, r).replace('Vehicle sally port: ', '')}.</div>; })()}
    {tier === 'earthen' && <div data-testid="dome-port-line" style={{ color: tv.color('dim') }}>{portWords(tier, 1)}.</div>}
    {site?.footLine && <div data-testid="dome-foot-line" style={{ color: tv.color('text') }}>{site.footLine}</div>}
    {tier !== 'earthen' && (() => { const ew = earthwork(tier, c); return <div data-testid="dome-earthwork-line" style={{ color: tv.color('dim') }}>Includes {usd(ew.usd)} of earthwork under the dome: {ew.lines.map(l => `${l.label.split(':')[0].toLowerCase()} ${usd(l.usd)}`).join(', ')}. The crater is {ew.pitCy.toLocaleString('en-US')} cu yd.</div>; })()}
    {site?.workLine && <div data-testid="dome-site-work" style={{ color: tv.color('text') }}>{site.workLine}</div>}
    {facts.map(f => <div key={f} style={{ color: tv.color('dim') }}>{f}</div>)}
    {bill.needs.map(n => <div key={n} style={{ color: tv.color('warn') }}>{T.glyph.warn} {n}</div>)}
    <div style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>+ and - or Shift+wheel: diameter. Click places it, R turns it, Esc cancels.</div>
    {t.skirtFt >= 20 && <button type="button" data-testid="dome-skirt-info" style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left', padding: '4px 8px', borderRadius: tv.radius('control'), border: `1px solid ${T.color.lineStrong}`, background: tv.color('control'), color: tv.color('text') }} onMouseDown={e => e.preventDefault()} onClick={() => setSkirtOpen(o => !o)}>{skirtOpen ? 'Close: ' : ''}How the {t.skirtFt} ft skirt stops a tunnel</button>}
    {skirtOpen && createPortal(<div data-testid="dome-skirt-card" role="dialog" aria-label="How the buried skirt works" onClick={() => setSkirtOpen(false)} style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(1500px, 94vw)', zIndex: 30, borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 60px rgba(0,0,0,0.6)', cursor: 'pointer' }}><SkirtSection standalone={false} /></div>, document.body)}
  </div>;
}

function Row({ l, v, strong = false }: { l: string; v: string; strong?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: strong ? T.weight.semi : T.weight.regular }}><span style={{ color: strong ? tv.color('text') : tv.color('dim') }}>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>;
}
