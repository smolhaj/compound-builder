/** The Defense tab's "Harden the house" section: the doors, window and safe-room chains, the next tier of each and what it costs (sim/houseHardening.ts). */
import { useGameStore } from '../../store/gameStore';
import { HARDEN_LAYERS, LAYERS, emberK, layerLine, layerTier, upgradeLayer, upgradeQuote } from '../../sim/houseHardening';
import { MATERIALS } from '../../sim/materials';
import { Note, Row, Section } from './common';
import { DIM, btn, usd } from './style';

export function HouseHardening() {
  const game = useGameStore(s => s.game);
  const money = useGameStore(s => s.money);
  return <Section title="Harden the house">
    {HARDEN_LAYERS.map(layer => {
      const L = LAYERS[layer], have = layerTier(game, layer), q = upgradeQuote(game, layer);
      return <div key={layer} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Row label={L.name} value={layerLine(game, layer)} tone={have === 0 ? undefined : have >= L.tiers.length ? 'good' : 'warn'} title={have ? L.tiers[have - 1].does : 'Nothing fitted yet'} />
        {have > 0 && <div style={{ fontSize: 11, color: DIM }}>{L.tiers[have - 1].does}</div>}
        {q ? <button style={{ ...btn(), width: '100%', marginTop: 3, textAlign: 'left', opacity: q.problem ? 0.55 : 1 }} disabled={!!q.problem}
          title={q.problem ?? q.to.does} onClick={() => { const w = money(g => upgradeLayer(g, layer)); if (w) alert(w); }}>
          {have ? 'Upgrade to' : 'Fit'} {MATERIALS[q.to.good].name.toLowerCase()} · {usd(q.cost)}{q.credit ? ` (after ${usd(q.credit)} trade-in)` : ''}{q.problem ? ` · ${q.problem}` : ''}
        </button> : <div style={{ fontSize: 11, color: DIM }}>Top of the chain.</div>}
      </div>;
    })}
    {emberK(game) < 1 && <Note tone="good">Shutters keep embers out of the house: a wildfire front takes fewer houses.</Note>}
    <Note>Fitted from the stores in a day. Doors and the safe room trade in at half price; shutters and panels go over what is there. The Shop's Defense shelf sells every tier by the piece.</Note>
  </Section>;
}
