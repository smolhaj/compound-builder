/**
 * The physical shocks on the HUD (WP6): peacetime cover and retrofits (earthquake rider, flood policy, bolting the sill, bracing the roof),
 * and, once a quake, flood, ash fall or impact is on its way, the signature goal chain, gauge chips and open decision cards
 * (sim/physicalFelt.ts). Draws nothing when there is nothing to show. A felt layer can restyle it; the data is pure.
 */
import { useGameStore } from '../store/gameStore';
import type { GameState } from '../sim/state';
import { isFinished } from '../sim/construction';
import { isHome } from '../sim/blueprints';
import { buyRetrofit, buyRider, buyStraps, hasRider, physicalOf, repairMarket, retrofitsOf, riderQuote, RETROFIT, STRAPS_USD, type RetrofitId } from '../sim/physical';
import { cardsFor, gauges, goalChain, resolveCard } from '../sim/physicalFelt';
import { Note, Row, Section } from './hud/common';
import { btn } from './hud/style';

const usd = (n: number) => '$' + n.toLocaleString('en-US');
const act = (fn: (g: GameState) => string | null | void): void => useGameStore.setState(st => { const g = structuredClone(st.game); fn(g); return { game: g }; });

export function PhysicalPanel({ game }: { game: GameState }) {
  const P = physicalOf(game), homes = game.structures.filter(x => isFinished(x) && isHome(x.kind));
  const chain = goalChain(game), chips = gauges(game), cards = cardsFor(game), market = repairMarket(game);
  const live = !!game.disaster.kind && (game.disaster.phase !== 'peace' || game.clock.t >= game.disaster.hitAt);
  return <>
    {(chain || chips.length > 0 || cards.length > 0) && live && <Section title={chain?.title ?? 'The emergency'}>
      {chips.map(c => <Note key={c}>{c}</Note>)}
      {chain?.steps.map(g => <Row key={g.id} label={<span title={g.hint}>{g.done ? '✓' : '○'} {g.label}</span>} value="" />)}
      {cards.map(c => <div key={c.id} data-testid={`card-${c.id}`} style={{ margin: '6px 0', padding: 6, border: '1px solid #6a5a38', borderRadius: 4 }}>
        <div style={{ fontWeight: 600 }}>{c.title}</div>
        <Note>{c.body}</Note>
        {c.choices.map(ch => <button key={ch.id} style={{ ...btn(), display: 'block', width: '100%', textAlign: 'left', marginTop: 3 }} onClick={() => act(g => { resolveCard(g, c.id, ch.id); })}>{ch.label}{ch.usd ? ` (${usd(ch.usd)})` : ''}</button>)}
      </div>)}
      {market.why && <Note tone="warn">{market.why}.</Note>}
    </Section>}
    {homes.length > 0 && <Section title="Cover against quake, flood and ash">
      {(['quake', 'flood'] as const).map(k => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
        <span>{k === 'quake' ? 'Earthquake rider' : 'Flood policy'}: {hasRider(game, k) ? 'in force' : `${usd(riderQuote(game, k))}/yr`}</span>
        <button style={btn()} disabled={hasRider(game, k)} title={k === 'quake' ? 'Ordinary insurance excludes earthquake; this pays state 2 and 3 less a 15% deductible' : 'Ordinary insurance excludes flood; pays after a 30-day wait, up to $250,000, less 10%'} onClick={() => act(g => { buyRider(g, k); })}>{hasRider(game, k) ? 'Covered' : 'Buy'}</button>
      </div>)}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
        <span>Strap the tanks, lip the shelves</span>
        <button style={btn()} disabled={!!P.straps} onClick={() => act(g => { buyStraps(g); })}>{P.straps ? 'Done' : usd(STRAPS_USD)}</button>
      </div>
      {homes.slice(0, 3).map(h => (['sill', 'rafters', 'anchor'] as RetrofitId[]).map(r => <div key={h.id + r} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
        <span title={RETROFIT[r].does}>{h.kind.replace(/_/g, ' ')}: {RETROFIT[r].name.split(' and ')[0].toLowerCase()}</span>
        <button style={btn()} disabled={retrofitsOf(game, h.id).includes(r)} onClick={() => act(g => { const st = g.structures.find(x => x.id === h.id); if (st) buyRetrofit(g, st, r); })}>{retrofitsOf(game, h.id).includes(r) ? 'Done' : usd(RETROFIT[r].usd(h.kind))}</button>
      </div>))}
    </Section>}
  </>;
}
