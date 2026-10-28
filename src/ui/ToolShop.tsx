/**
 * The shop's Tools tab: new hand and power tools off the hardware store's shelves (sim/tools.ts).
 * Bought while the stores are open; after that, see Supplies → Tools (find, mend, make, trade).
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { buyTool, readKit, toolUse, SHOP_TOOLS, toolPrice, toolShopOpen, TOOLS, type ToolKind } from '../sim/tools';
import { ToolIcon } from './ToolIcon';

const C = { card: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.09)', gold: '#d8c9a0', dim: 'rgba(238,238,238,0.62)', bad: '#f0a080' };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const btn = (on = false, off = false): CSSProperties => ({ padding: '4px 10px', borderRadius: 6, border: `1px solid ${on ? C.gold : C.line}`, background: on ? 'rgba(216,201,160,0.18)' : 'rgba(255,255,255,0.06)', color: '#eee', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1, fontSize: 12.5 });

const GROUPS: Array<[string, ToolKind[]]> = [
  ['Hand tools', SHOP_TOOLS.filter(k => TOOLS[k].power === 'hand' && !TOOLS[k].honing)],
  ['Power tools', SHOP_TOOLS.filter(k => TOOLS[k].power !== 'hand')],
  ['Keeping an edge', SHOP_TOOLS.filter(k => TOOLS[k].honing)],
];

export function ToolShop({ onMsg }: { onMsg: (m: string | null) => void }) {
  const g = useGameStore(), game = g.game, open = toolShopOpen(game);
  const kit = readKit(game);
  const have = (k: ToolKind) => kit.items.filter(t => t.kind === k && t.cond > 0).length;
  return <>
    <div style={{ color: open ? C.dim : C.bad, marginBottom: 8, lineHeight: 1.4 }}>
      {open
        ? 'The hardware store: pick it up and pay at the counter. Hand tools are the baseline; power tools are 2 to 3.5 times faster but need electricity or gas. Tools wear with use: sharpen and mend them (Supplies → Tools).'
        : 'The stores are closed. Look for tools in the hardware stores and farm sheds (scavenging), at the crossroads market, or make do with stone and scrap (Supplies → Tools).'}
    </div>
    {GROUPS.map(([title, kinds]) => <div key={title}>
      <div style={{ fontWeight: 600, margin: '12px 0 4px' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {kinds.map(k => {
          const price = toolPrice(game, k) ?? 0, can = open && (game.disaster.tracks.banks > 0.25 ? game.money : game.fin.cash) >= price;
          return <div key={k} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, display: 'flex', gap: 10 }}>
            <ToolIcon kind={k} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b>{TOOLS[k].name}</b><span style={{ color: C.gold }}>{usd(price)}</span></div>
              <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.3, margin: '2px 0 2px' }}>{TOOLS[k].blurb}</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>{toolUse(k)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button style={btn(can, !can)} disabled={!can} onClick={() => onMsg(g.money(d => buyTool(d, k)))}>Buy</button>
                <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>have {have(k)}</span>
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>)}
  </>;
}
