/** The Projects tab: what is under way, how long it will take and why it is slow, crews, fittings, hardening, lines, woods. */
import { useGameStore } from '../../store/gameStore';
import { BLUEPRINTS } from '../../sim/blueprints';
import { MATERIALS, type MaterialId } from '../../sim/materials';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { blockedReason, isFinished, progress } from '../../sim/construction';
import { CREW_RATE, CREW_SIZE, crewProblem, crewQuote } from '../../sim/crews';
import { fixBill, fixBlocked, fixDef, pendingFixes } from '../../sim/improvements';
import { KIT } from '../../game/buildkit/kit';
import { FIT, fitProblem, plant, serviceOf, UTILITY, SPARE_FOR } from '../../sim/utilities';
import { HARDEN, HARDEN_IDS, type TierDef, hardenCost, hardenProblem, isBunkerRoom, protectionOf, tierOf } from '../../sim/hardening';
import { PERIMETER, runBlocked, runFinished, runGrowth, runProgress } from '../../sim/perimeter';
import { eta, paceOf, slowHint, totalHoursLeft, weeksFor, weeksUntil } from '../../sim/pace';
import { Note, Row, Section } from './common';
import { TONE, DIM, LINE, btn, usd } from './style';

export function ProjectsTab() {
  const g = useGameStore();
  const game = g.game;
  const sel = game.structures.find(s => s.id === g.selected) ?? game.structures.find(s => !isFinished(s)) ?? null;
  const pace = paceOf(game), left = totalHoursLeft(game), weeks = weeksFor(left, pace);
  const selWeeks = sel && !isFinished(sel) ? weeksUntil(game, sel.id, pace) : null;
  const hint = left > 0 ? slowHint(game, weeks, pace) : null;
  return <>
    {left > 0 && <Section title="Pace">
      <Row label="Work left" value={`${Math.round(left).toLocaleString('en-US')} h`} />
      <Row label="At the family's pace" value={eta(weeks)} tone={weeks !== null && weeks > 26 ? 'warn' : undefined} title={`${Math.round(pace.perWeek)} effective hours of building a week`} />
      {selWeeks !== null && sel && <Row label={`${KIT[sel.kind].name} done in`} value={eta(selWeeks)} title="Counting what the family finishes first, in the order of the list" />}
      {hint && <Note tone="warn">{hint}</Note>}
    </Section>}
      {!sel && !game.perimeter.some(r => !runFinished(r)) && !game.forestry.jobs.length && <Note>Nothing under way. Stake something out from the Build tab.</Note>}
      {sel && (
        <Section title={KIT[sel.kind].name}>
          <Row label="Stage" value={sel.pre ? 'Came with the land' : isFinished(sel) ? 'Finished' : BLUEPRINTS[sel.kind].stages[sel.stage].name} />
          {(sel.fixes ?? []).length > 0 && <>
            {(sel.fixes ?? []).map(f => <div key={f.part} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
              <span style={{ color: DIM }} title={Object.entries(fixBill(f)).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ')}>{fixDef(f).name} <span style={{ fontSize: 11 }}>({f.cond}, {f.hours} h)</span></span>
              <span style={{ color: f.done >= f.hours ? TONE.good : f.done > 0 ? '#eee' : f.cond === 'poor' ? TONE.bad : TONE.warn }}>{f.done >= f.hours ? 'done' : f.done > 0 ? `${Math.round(f.done / f.hours * 100)} %` : fixBlocked(game, f) ? 'needs materials' : 'next up'}</span>
            </div>)}
            {pendingFixes(sel).some(f => fixBlocked(game, f)) && (() => {
              const need: Partial<Record<MaterialId, number>> = {};
              for (const f of pendingFixes(sel)) if (!f.supplied) for (const [m, q] of Object.entries(fixBill(f)) as Array<[MaterialId, number]>) need[m] = (need[m] ?? 0) + q;
              const lines = (Object.entries(need) as Array<[MaterialId, number]>).map(([material, q]) => ({ material, qty: Math.max(0, q - game.stock[material]) })).filter(l => l.qty > 0);
              return lines.length > 0 && <button style={{ ...btn(), width: '100%', marginTop: 4 }} disabled={!!orderProblem(game, lines)} onClick={() => g.order(lines)}>Order the repair materials: {usd(orderCost(lines, prices(game)))}</button>;
            })()}
            {pendingFixes(sel).some(f => f.part === 'roof') && <Note tone="warn">The roof leaks: the stove burns more to keep the house warm.</Note>}
            {pendingFixes(sel).some(f => f.cond === 'poor' && (f.part === 'wiring' || f.part === 'plumbing')) && <Note tone="warn">Unsafe {pendingFixes(sel).filter(f => f.cond === 'poor' && f.part !== 'roof' && f.part !== 'septic').map(f => f.part).join(' and ')}: shut off until it's redone.</Note>}
          </>}
          <div style={{ height: 6, background: '#333', borderRadius: 3, margin: '4px 0' }}>
            <div style={{ width: `${progress(sel) * 100}%`, height: '100%', background: '#c9b27a', borderRadius: 3 }} />
          </div>
          {!isFinished(sel) && <Note tone={blockedReason(game, sel) ? 'warn' : undefined}>{blockedReason(game, sel) ?? `${Math.round(progress(sel) * 100)} % done`}</Note>}
          {(!isFinished(sel) || pendingFixes(sel).length > 0) && (() => {
            const crew = game.crews.find(c => c.target === sel.id), q = crewQuote(sel), why = crewProblem(game, sel);
            return crew
              ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ color: DIM }}>Crew of {CREW_SIZE} on it · ${Math.round(crew.paid).toLocaleString('en-US')} so far</span>
                  <button style={btn()} onClick={() => g.dismiss(crew.id)}>Send home</button>
                </div>
              : <button style={{ ...btn(), width: '100%', marginTop: 4 }} disabled={!!why} title={why ?? `${CREW_SIZE} workers at $${CREW_RATE}/h, weekdays 8 to 5; you still buy the materials`} onClick={() => g.hire(sel.id)}>
                  Hire a crew: ~{usd(q.usd)}, about {q.weeks} week{q.weeks > 1 ? 's' : ''}
                </button>;
          })()}
          {(!isFinished(sel) || pendingFixes(sel).length > 0) && !game.crews.some(c => c.target === sel.id) && game.money < crewQuote(sel).usd && !crewProblem(game, sel) && (() => {
            const wk = Math.floor(game.money / (CREW_RATE * CREW_SIZE * 45));
            return <Note tone="warn">Money for about {wk} week{wk === 1 ? '' : 's'} of a crew; they go home when it runs out.</Note>;
          })()}
          {isFinished(sel) && (() => {
            const p = plant(game), sv = serviceOf(game, p, sel.id);
            const job = (k: 'plumb' | 'wire') => game.utilities.fittings.find(f => f.building === sel.id && f.kind === k);
            const row = (k: 'plumb' | 'wire', label: string, on: boolean) => {
              const j = job(k), why = fitProblem(game, p, sel, k);
              return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ color: DIM }}>{label}</span>
                {j || on ? <span>{on ? 'yes' : j!.finishedAt ? 'yes' : `${Math.round((j!.done / j!.hours) * 100)} %`}</span>
                  : <button style={btn()} disabled={!!why} title={why ?? `${FIT[k].hours} h · ${Object.entries(FIT[k].materials).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ')}`} onClick={() => g.fit(sel.id, k)}>{k === 'plumb' ? 'Plumb it' : 'Wire it'}</button>}
              </div>;
            };
            return <>
              {row('plumb', 'Running water', sv.plumbed)}
              {row('wire', 'Electric', sv.wired)}
              {(sv.wired || UTILITY[sel.kind]?.water?.needsPower) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                <span style={{ color: DIM }}>Breaker: {game.utilities.off.includes(sel.id) ? 'off' : game.utilities.lit.includes(sel.id) ? 'on' : 'on, no power'}</span>
                <button style={btn()} onClick={() => g.setBreaker(sel.id, game.utilities.off.includes(sel.id))}>{game.utilities.off.includes(sel.id) ? 'Switch on' : 'Switch off'}</button>
              </div>}
              {game.utilities.fried.includes(sel.id) && <button style={{ ...btn(true), marginTop: 3 }} title={`Fried by the EMP: needs a spare ${SPARE_FOR[sel.kind]} and a hardware kit`} onClick={() => g.fixFried(sel.id)}>Replace the fried {SPARE_FOR[sel.kind]} ({game.stock[SPARE_FOR[sel.kind]] >= 1 ? 'spare on hand' : 'no spare'})</button>}
              {game.utilities.broken.includes(sel.id) && <button style={{ ...btn(true), marginTop: 3 }} onClick={() => g.repairPump(sel.id)}>Repair the pump (1 hardware kit)</button>}
            </>;
          })()}
        </Section>
      )}
      {sel && isBunkerRoom(sel.kind) && isFinished(sel) && (
        <Section title="Hardening">
          {(() => {
            const p = protectionOf(sel);
            return <>
              <Row label="Fallout (PF)" value={p.pf.toLocaleString('en-US')} />
              <Row label="EMP survival" value={`${Math.round(p.empSurvive * 100)} %`} />
              <Row label="Air" value={p.filter === 'none' ? 'unfiltered' : p.filter === 'dust' ? 'dust filtered' : p.filter === 'gas' ? 'gas-tight' : 'overpressure'} />
              <Row label="Blast" value={`${p.psi} psi`} />
            </>;
          })()}
          {HARDEN_IDS.map(id => {
            const t = tierOf(sel, id), job = game.hardenJobs.find(j => j.building === sel.id && j.upgrade === id && j.finishedAt === null);
            const next = t < 3 ? (HARDEN[id].tiers as readonly TierDef[])[t] : null, why = hardenProblem(game, sel, id);
            const cost = next ? hardenCost(sel.kind, id, (t + 1) as 1 | 2 | 3) : null;
            const buy = cost ? Object.entries(cost.materials).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })) : [];
            return <div key={id} style={{ marginTop: 6, paddingTop: 4, borderTop: `1px solid ${LINE}` }}>
              <Row label={HARDEN[id].name} value={`${t ? HARDEN[id].tiers[t - 1].name : 'none'}${job ? ` → ${Math.round((job.done / job.hours) * 100)} %` : ''}`} />
              {next && !job && <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                <button style={btn()} disabled={!!why} title={`${next.blurb} · ${cost!.hours} h`} onClick={() => g.harden(sel.id, id)}>{next.name} ~{usd(orderCost(buy))}</button>
                <button style={btn()} disabled={!!why} title="Order this tier for every room of the bunker" onClick={() => g.harden(sel.id, id, true)}>Whole bunker</button>
              </div>}
            </div>;
          })}
        </Section>
      )}
      {game.perimeter.some(r => !runFinished(r) || runGrowth(r, game.clock.t) < 1) && (
        <Section title="Lines going in">
          {game.perimeter.filter(r => !runFinished(r) || runGrowth(r, game.clock.t) < 1).slice(0, 6).map(r => (
            <Row key={r.id} label={PERIMETER[r.kind].name} value={runFinished(r) ? `growing ${Math.round(runGrowth(r, game.clock.t) * 100)} %` : runBlocked(game, r) ?? `${Math.round(runProgress(r) * 100)} %`} />))}
        </Section>
      )}
      {game.forestry.jobs.length > 0 && (
        <Section title="Woods">
          {(['marked', 'felled', 'bucked'] as const).map(st => {
            const n = game.forestry.jobs.filter(j => j.stage === st).length;
            return n ? <Row key={st} label={st === 'marked' ? 'Marked to fell' : st === 'felled' ? 'Down, to buck' : 'Bucked, to skid'} value={n} /> : null;
          })}
        </Section>
      )}

  </>;
}
