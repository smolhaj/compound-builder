/** The dome's plant on the Dome page: each unit, where it stands (inside the shell, in the service gallery, in the walled yard), its condition, whether a second unit backs it up, what it does when it is out and what the repair costs. (sim/dome/plantUnits.ts) */
import { useGameStore } from '../../store/gameStore';
import { Note, Row, Section } from './common';
import { useDomeAct } from './domeAct';
import { DIM, TONE, btn, usd } from './style';
import { PLACE_NAME, SPAREABLE, repairSpec, stepLine, type PlantCond } from '../../sim/dome/plantUnits';
import { buySpare, rushPlantJob, sparesProblem, spareBill, type DomeView } from '../../sim/dome/live';
import { fxOf, jobOf, jobReady, rushQuote, unitsOf } from '../../sim/dome/plantLive';
import { hasYard, yardGeometry, yardBill } from '../../sim/dome/plantYard';
import { yardCover } from '../../sim/dome/plantStrike';
import { billUsd } from '../../sim/dome/cost';
import { MATERIALS } from '../../sim/materials';
import { dayIndex } from '../../sim/state';
import { pluralize } from '../../sim/words';
import { towersBuilt } from '../../sim/towers';
import { onDuty } from '../../sim/guards';

const COND: Record<PlantCond, { word: string; tone: 'good' | 'warn' | 'bad' }> = { ok: { word: 'whole', tone: 'good' }, damaged: { word: 'damaged, half capacity', tone: 'warn' }, down: { word: 'out', tone: 'bad' } };
const POWER = { grid: 'on the compound\'s power', derated: 'derated: one transformer out', battery: 'on batteries', dark: 'dark' } as const;

export function DomePlantSection({ v }: { v: DomeView }) {
  const game = useGameStore(s => s.game);
  const { act, note } = useDomeAct();
  const d = v.ref, st = v.st, id = d.st.id;
  const units = unitsOf(game, d, st);
  if (!units.length) return null;
  const fx = fxOf(game, d, st), yard = hasYard(d.tier) ? yardGeometry(d.tier, d.r, d.st.rot) : null;
  
  const day = dayIndex(game.clock.t);
  const towers = yard ? towersBuilt(game).filter(t => Math.hypot(t.st.x - (d.st.x + yard.center[0]), t.st.z - (d.st.z + yard.center[1])) <= t.def.post.reach).length : 0;
  return <Section title="Plant and defense">
    {note}
    <Row label="Power to the dome" value={`${POWER[fx.power]}${fx.rideH !== null ? `, about ${Math.max(1, Math.round(fx.rideH))} h left` : ''}`} tone={fx.power === 'grid' ? 'good' : fx.power === 'dark' ? 'bad' : 'warn'} title="A lost substation falls back to the dome's batteries (a closed ecology has a battery block), then the fans, lights and pumps stop." />
    <Row label="Climate plant / scrubbing / water loop" value={`${Math.round(fx.climate * 100)} / ${Math.round(fx.scrub * 100)} / ${Math.round(fx.water * 100)} percent`} tone={fx.whole ? 'good' : 'warn'} title="What the plant as it stands lets the dome do. Every loss is a step down, never a switch." />
    <div data-testid="plant-units" style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
      {units.map(u => {
        const job = jobOf(game, id, u.id), c = COND[u.cond], line = stepLine(u.kind, u.cond), q = job ? rushQuote(d, st, job) : null;
        const spec = job && job.cond ? repairSpec(d.tier, d.cells, u.kind, job.cond) : null;
        const wait = job ? Math.max(0, (job.readyDay ?? 0) - day) : 0;
        const bank = SPAREABLE.includes(u.kind) && !u.spare;
        const has = st.spares?.includes(u.kind);
        const why = bank && !has ? sparesProblem(game, u.kind, id) : null, cost = bank ? spareBill(game, u.kind, id) : null;
        return <div key={u.id} data-testid={`plant-unit-${u.id}`} style={{ borderLeft: `3px solid ${TONE[c.tone]}`, paddingLeft: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{u.name}</b><span style={{ color: TONE[c.tone] }}>{c.word}</span></div>
          <div style={{ fontSize: 11.5, color: DIM }}>{PLACE_NAME[u.place][0].toUpperCase() + PLACE_NAME[u.place].slice(1)}{bank ? (has ? ' · second unit fitted (N+1)' : ' · no second unit') : ''}</div>
          {line && <div style={{ fontSize: 11.5, color: TONE[c.tone] }}>{line}</div>}
          {job && spec && <div style={{ fontSize: 11.5, color: DIM }}>
            Repair: {Object.entries(job.bill).map(([m, n]) => `${n} ${MATERIALS[m as keyof typeof MATERIALS]?.name.toLowerCase() ?? m}`).join(', ')}; {spec.hours} h of work{job.supplied || jobReady(game, job) ? '' : ' (parts missing)'}; {wait > 0 ? `parts on order, about ${pluralize(wait, 'day')}` : jobReady(game, job) ? `${Math.max(0, Math.round(job.hours - job.done))} h to go` : 'waiting on the parts'}.
            {q !== null && <> <button data-testid={`plant-rush-${u.id}`} style={{ ...btn(), padding: '1px 7px', marginLeft: 4 }} title="A contractor brings the parts and a crew and finishes it now, at a premium." onClick={() => act(x => rushPlantJob(x, job.id, id))}>Rush a contractor · {usd(q)}</button></>}
          </div>}
          {bank && !has && cost !== null && <button data-testid={`plant-spare-${u.kind}`} style={{ ...btn(), marginTop: 3, opacity: why ? 0.55 : 1 }} disabled={!!why} title="A second unit of the same kind in the same bay or pad: while one is out, the other carries the dome." onClick={() => act(x => buySpare(x, u.kind, id))}>Add a second {u.kind === 'air' ? 'scrubber bank' : u.kind} · {usd(cost)}{why && !/needs/.test(why) ? ` · ${why}` : ''}</button>}
        </div>;
      })}
    </div>
    {d.tier === 'arcology' && <Note>The control block runs the dome's doors and airlocks, power transfer, water, climate and security from one armored building inside the shell. It can only be hit if a crew gets through the shell or forces an airlock. Struck, the plant falls back to local controls (derated power, less climate and water, half the yard's camera cover); if it is out, the dome cannot be sealed from the Operations Room until it is repaired. Nothing may be built on it or on its service paths.</Note>}
    {d.tier !== 'earthen' && <Note>The control room, the pumps and the pipe runs stand inside the shell with the units above and are never exposed. Pipes and cables run underground, inside the buried footing, and cross it only in sealed sleeves; the underground view (U) shows them.</Note>}
    {yard
      ? <div data-testid="plant-yard" style={{ marginTop: 6 }}>
        <Row label="Hardened yard" value={`concrete wall, reached only through an airlock from inside · ${usd(billUsd(yardBill(d.tier, d.r).bill))} built with the dome`} title="Chillers, the cooling tower and the substation need open air. They stand outside behind a poured-concrete wall with no gate: the only way in is a service airlock and a sealed passage from inside the shell (so the crew can work on them when the dome is sealed). A camera mast and a pad for a tower stand at the corner. Raiders must breach the wall or force an airlock to touch them." />
        <Row label="Watching the yard" value={`${pluralize(towers, 'tower')} in reach, ${pluralize(onDuty(game).length, 'guard')} on duty`} tone={towers + onDuty(game).length > 0 ? 'good' : 'warn'} title={`Towers and guards on duty put a crew off and lower its odds at the wall (cover ${Math.round(yardCover(game, yard, d.st.x, d.st.z) * 100)} percent).`} />
      </div>
      : <Note>A {d.tier} dome's plant is packaged inside the shell; there is no yard outside to defend.</Note>}
    {units.some(u => u.cond !== 'ok') && <Note tone="warn">Repairs are worked by the family like any other job on the place, or a contractor can finish them now. The parts are a special order.</Note>}
  </Section>;
}
