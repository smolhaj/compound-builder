/** Defense tab: what goes on top of the walls (electric fence), the weak spots a climber uses, and the brush that grows against the wall. (sim/wallTops.ts; docs/sa_home_security.md) */
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { MATERIALS, type MaterialId } from '../../sim/materials';
import { orderCost } from '../../sim/economy';
import { PERIMETER, runFinished, wallLength } from '../../sim/perimeter';
import {
  WALL_TOP, brushOf, climbable, electricBill, electricCash, electricHours, electricProblem, liveMetres, topLive, trimHours, weakPenalty, weakSpots,
} from '../../sim/wallTops';
import { Group, Hint, Note, Row } from './common';
import { DIM, btn, usd } from './style';
import { pluralize } from '../../sim/words';
import { lengthText } from '../../sim/units';

export function WallTopsPanel() {
  const game = useGameStore(s => s.game);
  const weakView = useWorldStore(w => w.weakView), setWeakView = useWorldStore(w => w.setWeakView), wallTrees = useWorldStore(w => w.wallTrees);
  const E = WALL_TOP.ELECTRIC;
  const hosts = game.perimeter.filter(r => E.HOSTS.includes(r.kind) && runFinished(r) && !r.replaces);
  const trees = wallTrees?.() ?? [];
  const spots = weakSpots(game, trees);
  const treeSpots = spots.filter(s => s.kind === 'tree');
  const walls = game.perimeter.filter(climbable);
  const brushy = walls.filter(r => brushOf(r) >= 0.05);
  const live = liveMetres(game);
  return <Group id="def-walltop" title="Wall tops and weak spots" defaultOpen={false}>
    <Hint more={<>An electric fence on outriggers along the top of a wall shocks and slows a climber, and a cut or a climb raises the alarm (+{E.DETECT} warning at the gate). It needs power: the grid or your own supply. A sealed battery backup (${E.BACKUP_USD}) keeps it live for {pluralize(E.BACKUP_DAYS, 'day')} of outage; without it a power cut leaves only wires. It cannot share a run with razor wire. While the county works a certified installer fits it (${E.ENERGIZER_USD} plus a ${E.CERT_USD} certificate); on your own it risks the inspector. Yellow signs go on every post and put off opportunists, never an organized crew.</>}>Live wire on the wall top; weak spots let a climber go around.</Hint>
    {hosts.length === 0 && <Note>No finished wall or fence that can take outriggers yet.</Note>}
    {hosts.slice(0, 8).map(r => {
      const len = wallLength(r), why = electricProblem(game, r, false);
      const price = orderCost(Object.entries(electricBill(len)).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));
      const on = topLive(game, r);
      return <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', flexWrap: 'wrap' }}>
        <span style={{ flex: 1 }}>{PERIMETER[r.kind].name} <span style={{ color: DIM }}>({lengthText(len * 6)}{r.razor ? ', razor' : ''}{r.electric ? (on ? ', live' : ', DARK') : ''}{r.electric && r.noCert ? ', no certificate' : ''}{brushOf(r) >= 0.5 ? ', overgrown' : ''})</span></span>
        {!r.electric && <button style={btn(false)} disabled={!!why} title={why ?? `${Math.round(electricHours(len))} h of work; about ${usd(price)} of wire, cable and hardware plus ${usd(electricCash(game, false))} for the energizer${electricCash(game, false) > E.ENERGIZER_USD ? ' and the certificate' : ''}`} onClick={() => { const w = useGameStore.getState().addElectric(r.id, false); if (w) alert(w); }}>{why ? 'Not yet' : 'Fit electric fence'}</button>}
        {!r.electric && !why && <button style={btn(false)} title={`The same with a sealed battery: ${usd(electricCash(game, true))} for the installer and the battery`} onClick={() => { const w = useGameStore.getState().addElectric(r.id, true); if (w) alert(w); }}>With battery</button>}
        {r.electric && !r.backup && <button style={btn(false)} title={`A sealed battery for ${usd(E.BACKUP_USD)}: keeps it live for ${pluralize(E.BACKUP_DAYS, 'day')} of outage`} onClick={() => { const w = useGameStore.getState().addFenceBackup(r.id); if (w) alert(w); }}>Add battery</button>}
        {r.electric && r.backup && <span style={{ color: DIM }}>battery backup</span>}
      </div>;
    })}
    {live > 0 ? <Row label="Live electric fence" value={`${lengthText(live)}`} tone="good" title="At 100 ft or more it is an alarm too" /> : game.perimeter.some(r => r.electric) && <Note tone="warn">The electric fence is dark: no power and no battery. It is only wires on the wall.</Note>}
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
      <span style={{ flex: 1 }}>Weak spots <span style={{ color: DIM }}>({spots.length}: {spots.filter(s => s.kind === 'building').length} buildings, {treeSpots.length} trees, {spots.filter(s => s.kind === 'brush').length} brush)</span></span>
      <button style={btn(weakView)} title="Mark every place a climber can bypass a wall: red = a building to step from, orange = a tree over the wall, green = brush" onClick={() => setWeakView(!weakView)}>{weakView ? 'Hide overlay' : 'Show overlay'}</button>
    </div>
    {walls.slice(0, 8).map(r => {
      const p = weakPenalty(game, r);
      return p > 0 ? <Row key={r.id} label={`${PERIMETER[r.kind].name} (${lengthText(wallLength(r) * 6)})`} value={`−${Math.round(p * 100)} points`} tone="warn" title="What the weak spots cost what this wall stops" /> : null;
    })}
    {treeSpots.length > 0 && <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
      <span style={{ flex: 1, color: DIM }}>{treeSpots.length} tree{treeSpots.length > 1 ? 's' : ''} reach over a wall</span>
      <button style={btn(false)} title="Mark them for felling: the family cuts them in work hours" onClick={() => { const ids = new Set(treeSpots.map(s => s.id)); const t = trees.filter(x => ids.has(x.id)).map(x => ({ tree: { id: x.id, x: x.x, z: x.z, kind: x.kind, scale: x.scale }, haulDist: x.haulDist })); useGameStore.getState().markTrees(t); }}>Mark for felling</button>
    </div>}
    {brushy.length > 0 && <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
      <span style={{ flex: 1, color: DIM }}>Brush along {brushy.length} wall{brushy.length > 1 ? 's' : ''} (about {brushy.reduce((a, r) => a + trimHours(r), 0)} h to cut back){brushy.some(r => brushOf(r) >= 0.5) ? ': shading the cameras' : ''}</span>
      <button style={btn(false)} onClick={() => { const w = useGameStore.getState().trimBrush(null); if (w) alert(w); }}>Cut back brush</button>
    </div>}
    {spots.length === 0 && walls.length > 0 && <Note>No weak spots: nothing stands within a step of a wall.</Note>}
  </Group>;
}
