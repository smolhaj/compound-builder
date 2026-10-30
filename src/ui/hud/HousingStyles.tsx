/**
 * The Build tab's "Housing styles" group: the lodge, the stone house, the timber-frame house, the container house and the adobe
 * house, each a card with a drawn preview, what it costs (from the one materials table, priced for the region), how long it takes,
 * the region note (what is local here, what is hauled in, what the land rules out) and what the style does to the systems
 * (sim/housingStyles.ts). Greyed with the reason where this land does not suit it; nothing is hidden.
 */
import type { CSSProperties, ReactNode } from 'react';
import { BLUEPRINTS, totalBill, totalHours } from '../../sim/blueprints';
import { MATERIALS, billText, type MaterialId } from '../../sim/materials';
import { orderCost } from '../../sim/economy';
import { REGIONS } from '../../sim/regions';
import { fitOf, STYLE_ORDER, styledBlueprint, styleFacts, styleOf } from '../../sim/housingStyles';
import { permitFee, needsPermit, countyWorks } from '../../sim/paperwork';
import { buildAdvice } from '../../sim/guidance';
import type { GameState } from '../../sim/state';
import { KIT } from '../../game/buildkit/kit';
import { DIM, usd } from './style';

/** Elevation sketches: a few shapes each, drawn from the real materials' colours. */
export function StylePreview({ kind, w = 84, h = 56 }: { kind: string; w?: number; h?: number }) {
  const sky = <rect width="100" height="64" fill="#9ec6dc" />;
  const ground = <rect y="54" width="100" height="10" fill="#6f7a4a" />;
  let art: ReactNode;
  switch (styleOf(kind)?.base) {
    case 'lodge_plinth':
    case 'lodge':
      art = <>
        <rect x="14" y="43" width="72" height="11" fill="#7d786c" />
        {[18, 30, 42, 54, 66, 78].map(x => <rect key={x} x={x} y="40" width="4" height="14" fill="#9b958a" />)}
        <rect x="10" y="38" width="80" height="3" fill="#6a4a32" />
        <rect x="18" y="21" width="64" height="17" fill="#8a6240" />
        {[24, 27, 30, 33, 36].map(y => <line key={y} x1="18" x2="82" y1={y} y2={y} stroke="#5a3f28" strokeWidth="0.6" />)}
        <polygon points="14,21 50,3 86,21" fill="#34573f" />
        <polygon points="36,20 50,9 64,20" fill="#bcd8e6" />
        <rect x="70" y="3" width="6" height="19" fill="#8b857a" />
        <rect x="46" y="28" width="8" height="10" fill="#4a3322" />
        <rect x="24" y="27" width="8" height="7" fill="#c6dde8" /><rect x="68" y="27" width="8" height="7" fill="#c6dde8" />
        {kind === 'lodge_solar' && [0, 1, 2, 3, 4].map(i => <rect key={i} x={55 + i * 5.6} y="10" width="5" height="4" fill="#243a66" stroke="#9aa6b8" strokeWidth="0.4" />)}
      </>;
      break;
    case 'stone_house':
      art = <>
        <rect x="20" y="22" width="60" height="32" fill="#8b8579" />
        {Array.from({ length: 36 }, (_, i) => <ellipse key={i} cx={25 + (i % 9) * 6.4 + ((i / 9 | 0) % 2) * 3} cy={26 + (i / 9 | 0) * 7} rx="3.1" ry="2.6" fill={i % 3 ? '#a49c8a' : '#6f6a60'} />)}
        <polygon points="16,22 50,5 84,22" fill="#5d6269" />
        <rect x="28" y="26" width="9" height="8" fill="#cfe0e8" /><rect x="63" y="26" width="9" height="8" fill="#cfe0e8" />
        <rect x="25" y="26" width="3" height="8" fill="#3f5f3a" /><rect x="37" y="26" width="3" height="8" fill="#3f5f3a" />
        <rect x="60" y="26" width="3" height="8" fill="#3f5f3a" /><rect x="72" y="26" width="3" height="8" fill="#3f5f3a" />
        <rect x="45" y="38" width="10" height="16" fill="#4a3322" />
        <rect x="68" y="6" width="6" height="14" fill="#7a7468" />
      </>;
      break;
    case 'timber_frame':
      art = <>
        <rect x="20" y="20" width="60" height="34" fill="#e6dfca" />
        <polygon points="16,20 50,3 84,20" fill="#34573f" />
        <polygon points="34,19 50,7 66,19" fill="#bcd8e6" />
        {[20, 35, 50, 65, 80].map(x => <rect key={x} x={x - 1} y="20" width="2.4" height="34" fill="#4b3a2c" />)}
        <rect x="20" y="36" width="60" height="2" fill="#4b3a2c" /><rect x="20" y="20" width="60" height="2" fill="#4b3a2c" />
        {[28, 58].map(x => <polygon key={x} points={`${x},21 ${x + 7},21 ${x},28`} fill="#4b3a2c" />)}
        <rect x="23" y="24" width="10" height="26" fill="#cfe0e8" /><rect x="67" y="24" width="10" height="26" fill="#cfe0e8" />
        <rect x="45" y="38" width="10" height="16" fill="#4a3322" />
      </>;
      break;
    case 'container_house':
      art = <>
        <rect x="18" y="38" width="30" height="16" fill="#4f78a8" /><rect x="48" y="38" width="30" height="16" fill="#4f78a8" />
        <rect x="48" y="20" width="30" height="18" fill="#b0623a" />
        {[22, 28, 34, 40, 52, 58, 64, 70].map(x => <line key={x} x1={x} x2={x} y1="21" y2="53" stroke="#00000033" strokeWidth="0.8" />)}
        <rect x="52" y="24" width="22" height="9" fill="#bcd8e6" /><rect x="24" y="42" width="18" height="8" fill="#bcd8e6" /><rect x="54" y="42" width="18" height="8" fill="#bcd8e6" />
        <rect x="16" y="35" width="32" height="3" fill="#6a6f74" />
        <line x1="18" x2="18" y1="28" y2="35" stroke="#40454a" strokeWidth="1" /><line x1="48" x2="48" y1="28" y2="35" stroke="#40454a" strokeWidth="1" />
        <line x1="18" x2="48" y1="28" y2="28" stroke="#40454a" strokeWidth="1" />
        <rect x="10" y="50" width="10" height="4" fill="#6d6150" />
      </>;
      break;
    default:
      art = <>
        <rect x="16" y="24" width="68" height="30" fill="#c7a984" />
        <rect x="14" y="19" width="72" height="6" fill="#bd9d78" />
        {[20, 26, 32, 38, 44, 50, 56, 62, 68, 74, 80].map(x => <circle key={x} cx={x} cy="26.5" r="1.4" fill="#5a3f28" />)}
        <rect x="16" y="29" width="68" height="3" fill="#6a4a32" />
        {[18, 30, 70, 82].map(x => <rect key={x} x={x - 1} y="31" width="2.4" height="23" fill="#7a5a3a" />)}
        <rect x="22" y="38" width="10" height="9" fill="#cfe0e8" /><rect x="66" y="38" width="10" height="9" fill="#cfe0e8" />
        <rect x="45" y="38" width="9" height="16" fill="#4a3322" />
        <rect x="9" y="24" width="7" height="30" fill="#b4936f" /><rect x="84" y="24" width="7" height="30" fill="#b4936f" />
        <rect x="21" y="10" width="7" height="10" fill="#bd9d78" />
      </>;
  }
  return <svg viewBox="0 0 100 64" width={w} height={h} style={{ borderRadius: 4, flex: 'none', display: 'block' }} aria-hidden>{sky}{ground}{art}</svg>;
}

const toBuy = (bill: Partial<Record<MaterialId, number>>) => Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
const ownNeeds = (bill: Partial<Record<MaterialId, number>>) => billText(Object.fromEntries(Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price === null)));

/** What one style costs on this land: the bill priced from the materials table, the hours, what has to come from your own woods. */
function styleQuote(game: GameState, kind: string): { cost: number; hours: number; own: string } {
  const fit = fitOf(game.site, kind);
  const bp = styledBlueprint(BLUEPRINTS[kind], fit.mat);
  const bill = totalBill(bp);
  return { cost: orderCost(toBuy(bill)), hours: totalHours(bp), own: ownNeeds(bill) };
}

const card = (on: boolean, off: boolean, next: boolean): CSSProperties => ({
  display: 'flex', gap: 8, textAlign: 'left', padding: '6px 8px', borderRadius: 6, cursor: off ? 'not-allowed' : 'pointer',
  border: next && !on ? '1px solid #d8c9a0' : '1px solid transparent', background: on ? '#d8c9a0' : next ? 'rgba(216,201,160,0.14)' : 'rgba(255,255,255,0.05)', color: on ? '#1c1d18' : '#eee',
});

export function HousingStyleCards({ game, tool, arm }: { game: GameState; tool: string | null; arm: (kind: string) => void }) {
  const cold = REGIONS[game.site.region].cold;
  return <>{STYLE_ORDER.map(kind => {
    const a = buildAdvice(game, kind), q = styleQuote(game, kind), fit = fitOf(game.site, kind), def = KIT[kind];
    const on = tool === kind, off = !!a.off;
    const permit = needsPermit(kind) && game.paper.permits && countyWorks(game) ? ` · permit ${usd(permitFee(game, kind))}` : '';
    return <button key={kind} disabled={off} title={a.off ?? def.blurb} onClick={() => arm(kind)} style={card(on, off, a.next)} data-testid={`style-${kind}`}>
      <div style={{ opacity: off ? 0.45 : 1 }}><StylePreview kind={kind} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, opacity: off ? 0.5 : 1 }}><b>{def.name}</b><span style={{ fontVariantNumeric: 'tabular-nums' }}>~{usd(q.cost)}</span></div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>{q.hours.toLocaleString('en-US')} h{q.own ? ` · + ${q.own}` : ''}{permit}</div>
        {off ? <div style={{ fontSize: 11, color: '#e8b070' }}>{a.off}</div> : <>
          <div style={{ fontSize: 11, color: on ? '#3a3d2c' : '#cfd8a8' }}>{fit.note}</div>
          <div style={{ fontSize: 10.5, opacity: 0.6, color: on ? undefined : DIM }}>{styleFacts(kind, cold).join(' · ')}</div>
          {a.next && !on && <div style={{ fontSize: 11, color: '#d8c9a0', fontWeight: 600 }}>▸ {a.note}</div>}
        </>}
      </div>
    </button>;
  })}</>;
}
