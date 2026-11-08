/** Defense tab: the gate and the drive (intercom and camera, caged motor, double gate), and what they do to the ambush when a vehicle comes home. (sim/gateSecurity.ts; docs/sa_home_security.md) */
import { useGameStore } from '../../store/gameStore';
import { MATERIALS } from '../../sim/materials';
import { GATE_GOODS, GATE_SEC, arrivalAmbushP, fitGateProblem, gateLines, gatePosture, type GateGood } from '../../sim/gateSecurity';
import { Group, Hint, Note, Row } from './common';
import { DIM, btn, usd } from './style';

const WHAT: Record<GateGood, string> = {
  bollards: 'Steel bollards in concrete across the gate and the approach: a ram truck is stopped or slowed (the gate: 70% of a ram turned, the wall: 40%). A charge ignores them.',
  gate_intercom: `Intercom and camera at the gate post (needs power): +${GATE_SEC.INTERCOM.detection} warning, calmer talks, you see the drive before it opens.`,
  gate_motor: `Caged, anti-lift motor: +${GATE_SEC.MOTOR.barrier} wall strength at the gate; with power it holds the gate open for less time. No power: opened by hand.`,
  sally_gate: `A second gate and side walls: the outer gate shuts before the inner opens, so a vehicle is never exposed to the road with the gate open (+${GATE_SEC.SALLY.barrier} wall strength, arrival ambushes x${GATE_SEC.SALLY.ambush}).`,
};

export function GateSecurityPanel() {
  const game = useGameStore(s => s.game);
  const money = useGameStore(s => s.money);
  const post = gatePosture(game), lines = gateLines(game);
  const risk = arrivalAmbushP(game, { carried: 300, armed: false }), bare = arrivalAmbushP({ ...game, stock: { ...game.stock, gate_intercom: 0, gate_motor: 0, sally_gate: 0, gate_house: 0 } }, { carried: 300, armed: false });
  return <Group id="def-gate" title="The gate and the drive" defaultOpen={false}>
    <Hint more="Hijackings and ambushes happen at the drive, when a vehicle arrives or leaves and the gate is open. The answers are an intercom with a camera, a caged motor that cannot be lifted off, a guard, and a double gate so a vehicle is never exposed to the road while the outer gate is open. Every piece only ever helps. The camera and the motor need power; the double gate and the cage do not.">Coming home by vehicle is the dangerous minute.</Hint>
    {GATE_GOODS.map(g => {
      const have = (game.stock[g] ?? 0) >= 1, price = MATERIALS[g].price ?? 0, why = fitGateProblem(game, g, price);
      return <div key={g} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Row label={MATERIALS[g].name} value={have ? 'fitted' : usd(price)} tone={have ? 'good' : undefined} title={WHAT[g]} />
        <div style={{ fontSize: 11, color: DIM }}>{WHAT[g]}</div>
        {!have && <button style={{ ...btn(), width: '100%', marginTop: 3, opacity: why ? 0.55 : 1 }} disabled={!!why} title={why ?? WHAT[g]} onClick={() => { const w = money(s => { const e = fitGateProblem(s, g, price); if (e) return e; s.money -= price; s.stock[g] = (s.stock[g] ?? 0) + 1; return null; }); if (w) alert(w); }}>Fit {MATERIALS[g].name.toLowerCase()} · {usd(price)}{why ? ` · ${why}` : ''}</button>}
      </div>;
    })}
    {lines.map(l => <Note key={l}>{l}</Note>)}
    <Row label="Ambush on a vehicle coming home" value={`${(risk * 100).toFixed(1)}% a trip${bare > risk ? ` (bare gate ${(bare * 100).toFixed(1)}%)` : ''}`} tone={risk < bare ? 'good' : undefined} title="With a good haul, nobody armed, at today's law and today's gate" />
    {post.ambushK < 1 && <Note tone="good">The gate kit stops {Math.round((1 - post.ambushK) * 100)}% of the ambushes a bare gate would take.</Note>}
  </Group>;
}
