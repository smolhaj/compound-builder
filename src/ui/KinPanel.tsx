/**
 * Family → Relatives: the extended family (sim/kin.ts). Who lives here and
 * whose they are, what the retirees bring in, who is waiting for a place of
 * their own, and who is still in town.
 */
import { useGameStore } from '../store/gameStore';
import { dayIndex } from '../sim/state';
import { fullName } from '../sim/family';
import { cachedPlan, SEPARATE_DWELLINGS } from '../sim/housing';
import { kinTitle, mindingElders, residents, retireeIncomePerDay } from '../sim/kin';
import { Note, Row, Section } from './hud/common';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

import { whereText } from './kinText';

export function KinPanel() {
  const game = useGameStore(s => s.game);
  const kin = game.kin;
  const rel = residents(game);
  const retire = retireeIncomePerDay(game);
  const banks = game.disaster.tracks.banks >= 0.5 && game.disaster.tracks.stores >= 0.5;
  if (!rel.length && !kin?.away.length && !kin?.waiting.length && retire === 0) return null;
  const day = dayIndex(game.clock.t);
  const own = rel.length > 0 && !rel.some(p => cachedPlan(game).sleepers.find(x => x.id === p.id)?.own) && !game.structures.some(s => s.finishedAt !== null && SEPARATE_DWELLINGS.has(s.kind));
  return (
    <Section title="Relatives">
      {rel.map(p => <Row key={p.id} label={<span>{p.first} <span style={{ opacity: 0.7 }}>({kinTitle(p, game.people)})</span></span>} value={<span style={{ fontSize: 11.5 }}>{whereText(game, p.id)}</span>} />)}
      {retire > 0 && <Row label="Retirees bring in" value={banks ? `${usd(retire * 30)} a month` : 'nothing: the banks are closed'} tone={banks ? 'good' : 'warn'} title="Social Security and pensions, paid while the banks work; it stops at the collapse" />}
      {mindingElders(game) > 0 && game.people.some(p => p.kid && p.age < 8) && <Note>The grandparents mind the little ones and take the lessons: the parents get their hours back.</Note>}
      {own && <Note tone="warn">They are sleeping in the main house or worse. A guest house, a cottage or Mom{'’'}s house (Build → Home & work) keeps the old happier.</Note>}
      {kin?.waiting.map(w => <Note key={w.ids.join()} tone="warn">{w.people.map(fullName).join(' and ')} wait for a place of their own: day {Math.max(0, day - w.since)} of {w.until - w.since}.</Note>)}
      {kin && kin.away.length > 0 && <Note>In town: {kin.away.map(p => `${p.first} (${kinTitle(p, game.people)})`).join(', ')}{kin.open ? '; they may ask to come.' : '.'}</Note>}
    </Section>
  );
}
