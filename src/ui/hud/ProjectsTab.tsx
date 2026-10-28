/** The Projects tab: what is under way, how long it will take and why it is slow, crews, fittings, hardening, lines, woods. */
import { useGameStore } from '../../store/gameStore';
import { BLUEPRINTS } from '../../sim/blueprints';
import { billText, type MaterialId } from '../../sim/materials';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { ToolNeedsNote } from '../ToolsPanel';
import { blockedReason, holdReason, isFinished, progress } from '../../sim/construction';
import { CREW_RATE, CREW_SIZE, crewProblem, crewQuote } from '../../sim/crews';
import { fixBill, fixBlocked, fixDef, pendingFixes } from '../../sim/improvements';
import { KIT } from '../../game/buildkit/kit';
import { FIT, FUEL_UNIT_L, fitProblem, plant, serviceOf, UTILITY, SPARE_FOR } from '../../sim/utilities';
import { HARDEN, HARDEN_IDS, type TierDef, hardenCost, hardenProblem, isBunkerRoom, protectionOf, tierOf } from '../../sim/hardening';
import { PERIMETER, runBlocked, runFinished, runGrowth, runProgress } from '../../sim/perimeter';
import { eta, paceOf, slowHint, totalHoursLeft, weeksFor, weeksUntil } from '../../sim/pace';
import { hookupsFor, fitRows, needsHookup } from '../../sim/hookups';
import { projectRows } from '../../sim/priority';
import { litersText } from '../../sim/format';
import { Note, Row, Section } from './common';
import { TONE, DIM, LINE, btn, usd } from './style';

export function ProjectsTab() {
  const g = useGameStore();
  const game = g.game;
  const sel = game.structures.find(s => s.id === g.selected) ?? game.structures.find(s => !isFinished(s)) ?? null;
  const pace = paceOf(game), left = totalHoursLeft(game), weeks = weeksFor(left, pace);
  const selWeeks = sel && !isFinished(sel) ? weeksUntil(game, sel.id, pace) : null;
  const hint = left > 0 ? slowHint(game, weeks, pace) : null;
  const rows = projectRows(game), todo = needsHookup(game);
  return <>
    {left > 0 && <Section title="Pace">
      <Row label="Work left" value={`${Math.round(left).toLocaleString('en-US')} h`} />
      <Row label="At the family's pace" value={eta(weeks)} tone={weeks !== null && weeks > 26 ? 'warn' : undefined} title={`${Math.round(pace.perWeek)} effective hours of building a week`} />
      {selWeeks !== null && sel && <Row label={`${KIT[sel.kind].name} done in`} value={eta(selWeeks)} title="Counting what the family finishes first, in the order of the list" />}
      {hint && <Note tone="warn">{hint}</Note>}
    </Section>}
      {rows.length > 1 && <Section title="Under way, in the order the family works">
        {rows.slice(0, 8).map((r, i) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ flex: 1, cursor: r.kind === 'building' ? 'pointer' : 'default' }} title={r.blocked ?? undefined} onClick={() => r.kind === 'building' && g.select(r.id)}>
            {i === 0 && r.first ? '★ ' : ''}{r.kind === 'building' ? (KIT[r.name]?.name ?? r.name) : r.name} <span style={{ color: DIM, fontSize: 11 }}>{Math.round(r.pct * 100)} % · {Math.round(r.hours).toLocaleString('en-US')} h</span>
            {r.blocked && <div style={{ fontSize: 10.5, color: TONE.warn }}>{r.blocked}</div>}
          </span>
          {!(i === 0) && <button style={btn()} title="Put this ahead of everything else (the family still works on something else while it waits for materials)" onClick={() => g.setFocus(r.id)}>Work on this first</button>}
          {i === 0 && r.first && <button style={btn()} onClick={() => g.setFocus(null)}>Clear</button>}
        </div>)}
        {rows.length > 8 && <Note>…and {rows.length - 8} more.</Note>}
      </Section>}
      {todo.length > 0 && <Section title="Finished, but not working yet">
        {todo.slice(0, 6).map((t, i) => <div key={t.id + t.kind + i} style={{ padding: '3px 0', borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span><b>{KIT[t.name]?.name ?? t.name}</b>: <span style={{ color: TONE.warn }}>{t.text}</span></span>
            <button style={btn()} onClick={() => g.select(t.id)}>Open</button>
          </div>
          <div style={{ fontSize: 11, color: DIM }}>{t.todo}</div>
          {t.tool && <button style={{ ...btn(), marginTop: 2 }} onClick={() => g.setTool(t.tool)}>Draw the line</button>}
        </div>)}
        {todo.length > 6 && <Note>…and {todo.length - 6} more.</Note>}
      </Section>}
      {!sel && !rows.length && !game.forestry.jobs.length && !todo.length && <Note>Nothing under way. Stake something out from the Build tab.</Note>}
      {sel && (
        <Section title={KIT[sel.kind].name}>
          <Row label="Stage" value={sel.pre ? 'Came with the land' : isFinished(sel) ? 'Finished' : BLUEPRINTS[sel.kind].stages[sel.stage].name} />
          {(sel.fixes ?? []).length > 0 && <>
            {(sel.fixes ?? []).map(f => <div key={f.part} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
              <span style={{ color: DIM }} title={billText(fixBill(f))}>{fixDef(f).name} <span style={{ fontSize: 11 }}>({f.cond}, {f.hours} h)</span></span>
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
          {!isFinished(sel) && <Note tone={holdReason(game, sel) ? 'warn' : undefined}>{holdReason(game, sel) ?? `${Math.round(progress(sel) * 100)} % done`}</Note>}
          <ToolNeedsNote game={game} st={sel} />
          {(!isFinished(sel) || pendingFixes(sel).length > 0) && (() => {
            const crew = game.crews.find(c => c.target === sel.id), q = crewQuote(sel), why = crewProblem(game, sel);
            return crew
              ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ color: DIM }}>Crew of {CREW_SIZE} on it · ${Math.round(crew.paid).toLocaleString('en-US')} so far</span>
                  <button style={btn()} onClick={() => g.dismiss(crew.id)}>Send home</button>
                </div>
              : <>
                {!why && !isFinished(sel) && blockedReason(game, sel) && <Note tone="warn">The materials are not on site yet ({blockedReason(game, sel)!.replace(/^Waiting for /, 'still need ')}). A crew hired now stands idle (and bills nothing) until they arrive: order them first.</Note>}
                <button style={{ ...btn(), width: '100%', marginTop: 4 }} disabled={!!why} title={why ?? `${CREW_SIZE} workers at $${CREW_RATE}/h, weekdays 8 to 5; you still buy the materials`} onClick={() => g.hire(sel.id)}>
                  Hire a crew{!why && !isFinished(sel) && blockedReason(game, sel) ? ' anyway' : ''}: ~{usd(q.usd)}, about {q.weeks} week{q.weeks > 1 ? 's' : ''}
                </button>
              </>;
          })()}
          {(!isFinished(sel) || pendingFixes(sel).length > 0) && !game.crews.some(c => c.target === sel.id) && game.money < crewQuote(sel).usd && !crewProblem(game, sel) && (() => {
            const wk = Math.floor(game.money / (CREW_RATE * CREW_SIZE * 45));
            return <Note tone="warn">Money for about {wk} week{wk === 1 ? '' : 's'} of a crew; they go home when it runs out.</Note>;
          })()}
          {isFinished(sel) && (() => {
            const p = plant(game), sv = serviceOf(game, p, sel.id);
            const job = (k: 'plumb' | 'wire') => game.utilities.fittings.find(f => f.building === sel.id && f.kind === k);
            const show = fitRows(sel.kind, sv.wired || !!job('wire'), sv.plumbed || !!job('plumb'));
            const hooks = hookupsFor(game, sel, p).filter(h => h.state !== 'done');
            const row = (k: 'plumb' | 'wire', label: string, on: boolean) => {
              const j = job(k), why = fitProblem(game, p, sel, k);
              const h = hooks.find(x => x.kind === k);
              return <div style={{ marginTop: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: DIM }}>{label}</span>
                  {j || on ? <span style={{ color: on || j!.finishedAt ? TONE.good : undefined }}>{on ? 'working' : j!.finishedAt ? 'fitted, but not connected' : `${Math.round((j!.done / j!.hours) * 100)} %`}</span>
                    : <button style={btn(!why)} disabled={!!why} title={why ?? `${FIT[k].hours} h · ${billText(FIT[k].materials)}`} onClick={() => g.fit(sel.id, k)}>{k === 'plumb' ? 'Plumb it' : 'Wire it'}</button>}
                </div>
                {/* a greyed button always says why, in text: a tooltip is not enough */}
                {!j && !on && h && <div style={{ fontSize: 11, color: h.state === 'ready' ? TONE.warn : TONE.bad, marginTop: 1 }}>{h.text}. {h.todo}</div>}
                {!j && !on && !h && why && <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>{why}</div>}
              </div>;
            };
            return <>
              {show.plumb && row('plumb', 'Running water', sv.plumbed)}
              {show.wire && row('wire', 'Electric', sv.wired)}
              {hooks.filter(h => h.kind !== 'wire' && h.kind !== 'plumb').map(h => <div key={h.kind} style={{ marginTop: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><span style={{ color: DIM }}>{h.label}</span><span style={{ color: TONE.bad }}>{h.text}</span></div>
                <div style={{ fontSize: 11, color: DIM }}>{h.todo}</div>
                {h.tool && <button style={{ ...btn(), marginTop: 2 }} onClick={() => g.setTool(h.tool)}>Draw the line</button>}
              </div>)}
              {sel.kind === 'battery_shed' && <Row label="Charge" value={`${Math.round(game.utilities.report.batteryPct * 100)} %`} title="Yesterday's battery state of charge" />}
              {sel.kind === 'generator_shed' && <Row label="Fuel on hand" value={litersText(game.stock.fuel * FUEL_UNIT_L)} />}
              {sel.kind.startsWith('bunker_') && <Note>{game.structures.some(x => x.kind === 'bunker_plant' && isFinished(x)) ? 'The plant room supplies air, power and water to the bunker: no cable or pipe to run.' : 'The bunker\'s air, power and water come from the plant room: build it (Build, Underground).'}</Note>}
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
