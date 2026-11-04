/**
 * Family → Quarters: which household sleeps in which building (sim/quarters.ts).
 * The game assigns by beds, ages and need; "Move to" overrides it, "Auto" gives
 * it back. Two building roles (a sick bay, the guards' quarters) sit in a fold.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { HOME_BEDS } from '../sim/blueprints';
import { isFinished } from '../sim/construction';
import { cachedPlan, quartersFx } from '../sim/housing';
import { householdsOf, livingPeople, moveHousehold, residentsOfStructure, ROLE_HINT, ROLE_NAME, setRole, summaryLine, type QuartersRole } from '../sim/quarters';
import { KIT } from '../game/buildkit/kit';
import { Group, Hint, Note } from './hud/common';
import { DIM } from './hud/style';

const sel: CSSProperties = { background: '#3a3d34', color: '#eee', border: 0, borderRadius: 6, fontSize: 12, padding: '2px 4px', maxWidth: 150 };

export function QuartersPanel() {
  const g = useGameStore();
  const game = g.game;
  const people = livingPeople(game);
  if (people.length === 0) return null;
  const homes = game.structures.filter(st => isFinished(st) && !st.unplaced && HOME_BEDS[st.kind] > 0);
  const nameOf = (id: string) => { const st = game.structures.find(x => x.id === id); return st ? (KIT[st.kind]?.name ?? st.kind) : 'somewhere'; };
  // two buildings of one kind: number them
  const label = (id: string) => { const st = game.structures.find(x => x.id === id); if (!st) return 'somewhere'; const same = homes.filter(h => h.kind === st.kind); return same.length > 1 ? `${nameOf(id)} ${same.indexOf(st) + 1}` : nameOf(id); };
  const plan = cachedPlan(game);
  const hh = householdsOf(people);
  const where = (ids: string[]) => {
    const w = new Map<string, number>();
    for (const sl of plan.sleepers) if (ids.includes(sl.id)) { const k = sl.spot.where && sl.spot.kind !== 'tent' ? label(sl.spot.where) : sl.spot.kind === 'tent' ? 'a tent' : 'no roof'; w.set(k, (w.get(k) ?? 0) + 1); }
    return [...w.entries()].map(([k, n]) => (w.size > 1 ? `${n} in ${k}` : k)).join(', ');
  };
  const fx = quartersFx(game, plan);
  const line = summaryLine(fx);
  const roles = game.quarters?.roles ?? {};
  const roleSel = (role: QuartersRole) => {
    const cur = Object.entries(roles).find(([, r]) => r === role)?.[0] ?? '';
    return <label style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', fontSize: 11.5, margin: '3px 0' }} title={ROLE_HINT[role]}>
      <span style={{ color: DIM }}>{ROLE_NAME[role]}</span>
      <select style={sel} value={cur} onChange={e => g.money(d => { setRole(d, e.target.value || cur, e.target.value ? role : null); return null; })}>
        <option value="">none</option>
        {homes.map(h => <option key={h.id} value={h.id}>{label(h.id)}</option>)}
      </select>
    </label>;
  };
  const moves = Object.fromEntries(homes.map(h => [h.kind, HOME_BEDS[h.kind]]));
  return (
    <Group id="quarters" title="Quarters" extra={line ? `${fx.size} short of privacy` : `${hh.length} ${hh.length === 1 ? 'household' : 'households'}`} defaultOpen={false}>
      <div data-testid="quarters">
        {hh.map(h => {
          const ids = h.members.map(m => m.id);
          const chosen = h.members.every(m => m.home && homes.some(x => x.id === m.home)) ? h.members[0].home! : '';
          return <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 11.5, margin: '3px 0' }}>
            <span style={{ minWidth: 0 }} title={`${h.members.map(m => m.first).join(', ')}: ${where(ids)}${chosen ? ' (placed by you)' : ' (assigned by the game)'}`}>
              <span>{h.name}</span> <span style={{ color: DIM }}>{where(ids)}</span>
            </span>
            <select style={sel} value={chosen} aria-label={`Move ${h.name}`} onChange={e => g.money(d => moveHousehold(d, h.id, e.target.value || null, moves))}>
              <option value="">Auto</option>
              {homes.map(x => <option key={x.id} value={x.id}>Move to {label(x.id)} ({HOME_BEDS[x.kind]} beds)</option>)}
            </select>
          </div>;
        })}
        {line && <Hint tone="warn" more="Sharing a room or a roof with another household, or more people than beds, costs a little morale and sleep (capped). Give each household its own building to end it.">{line}</Hint>}
        {homes.length > 0 && <div style={{ marginTop: 4 }}>{roleSel('sickbay')}{roleSel('guards')}</div>}
        {homes.length === 0 && <Note>No finished home yet.</Note>}
      </div>
    </Group>
  );
}

/** The building drawer: who sleeps here tonight. */
export function ResidentsLine({ id }: { id: string }) {
  const game = useGameStore(s => s.game);
  if (!(HOME_BEDS[game.structures.find(x => x.id === id)?.kind ?? ''] > 0)) return null;
  const plan = cachedPlan(game);
  const list = residentsOfStructure(livingPeople(game), plan.sleepers.map(x => ({ id: x.id, where: x.spot.where, kind: x.spot.kind })), id);
  const role = game.quarters?.roles[id];
  return <div style={{ fontSize: 11.5, color: DIM, margin: '3px 0' }} title={role ? ROLE_HINT[role] : undefined} data-testid="residents">
    {role ? `${ROLE_NAME[role]} · ` : ''}{list.length ? `Lives here: ${list.join('; ')}` : 'Nobody sleeps here tonight.'}
  </div>;
}
