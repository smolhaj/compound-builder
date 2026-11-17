/**
 * The Build tab. Everything you could build, with guidance for a first
 * time: anything you cannot use yet is greyed with a short reason, the next
 * sensible piece is highlighted, and the bunker says what it needs right
 * now. Nothing is hidden (sim/guidance.ts decides; this draws).
 */
import { Fragment, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { orderProblem } from '../../sim/economy';
import { housingSummary } from '../../sim/housing';
import { BLUEPRINTS, totalBill, totalHours } from '../../sim/blueprints';
import { MATERIALS, billText, type MaterialId } from '../../sim/materials';
import { orderCost } from '../../sim/economy';
import { CREW_RATE } from '../../sim/crews';
import { useRunAct } from './useRunAct';
import { drillExtra } from '../../sim/site';
import { FT_PER_M } from '../../sim/units';
import { countyWorks, needsPermit, permitFee } from '../../sim/paperwork';
import { BUNKER_ORDER, GATEHOUSE_ORDER, KIT, POD_ORDER, RIG_ORDER, TERRACE_ORDER, TOWER_ORDER, UTILITY_ORDER } from '../../game/buildkit/kit';
import { PERIMETER, UTILITY_LINES, runBill, runHours, type PerimeterKind } from '../../sim/perimeter';
import { fosterNote } from '../../sim/orphans';
import { runOver } from '../../sim/wipe';
import { bunkerChecklist, buildAdvice, longTerm, suggestions, perimeterNote, perimeterOff, perimeterTiers, upgradeChain } from '../../sim/guidance';
import { inFirstHour } from '../../sim/tabReveal';
import { Clamp, Group, Hint, Item, Note, Tick } from './common';
import { btn, card, DIM, FS, miniBtn, TONE, usd } from './style';
import { OP_COVERED, operational } from '../../sim/operational';
import { firstHour } from '../../sim/firstHour';
import { GoalsCard } from '../feel/GoalsCard';
import { feltChain } from '../../sim/felt/goalLib';
import { useFeelStore } from '../../store/feelStore';
import { StarterCompound } from './StarterCompound';
import { starterWanted } from '../../sim/starterCompound';
import { WallProperty } from './WallProperty';
import { FortifyRing } from './FortifyRing';
import { PathsPanel } from './PathsPanel';
import { lengthText } from '../../sim/units';
import { HousingStyleCards } from './HousingStyles';

/** The build menu's groups (kit pieces by what they are for). */
/** Suggestions the operational checklist already shows as its own lines. */

const BUILD_GROUPS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['home', 'Home & work', ['timber_cabin', 'log_house', 'cottage', 'guest_house', 'moms_house', 'modular_home', 'stilted_house', 'cabin_village', 'outhouse', 'workshop', 'forge', 'metal_garage', 'barn', 'equipment_yard', 'helipad', 'boat_dock', 'marina', ...TERRACE_ORDER]],
  ['food', 'Food', ['garden', 'greenhouse', 'polytunnel', 'high_tunnel', 'greenhouse_heated', 'aquaponics', 'orchard', 'orchard_grove', 'orchard_terraced', 'field', 'chicken_coop', 'sheep_barn', 'pond', 'root_cellar', 'wood_oven', 'apiary', 'sugar_shack', 'barnyard']],
  ['water', 'Water & power', UTILITY_ORDER],
  ['defense', 'Watch towers & gatehouse', [...TOWER_ORDER, ...POD_ORDER, ...GATEHOUSE_ORDER]],
];

const toBuy = (bill: Partial<Record<MaterialId, number>>) => Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
const ownNeeds = (kind: string) => billText(Object.fromEntries(Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price === null)));
const costOf = (kind: string) => orderCost(toBuy(totalBill(BLUEPRINTS[kind])));

/** While the first-hour goals card is up, a Next-steps card shows only at or above this urgency. */
const GUIDED_URGENT = 90;

/** `toolsOnly` (layout A): the catalog, checklist and Next steps are in the Build drawer and the What-to-do card; this draws only what the catalog does not list (the run-over and held notes, rigs, long-term goals, tree marking, housing styles, footpaths, the wall and ring helpers, the bunker plan). */
export function BuildMenu({ showProjects = () => undefined, toolsOnly = false }: { showProjects?: () => void; toolsOnly?: boolean }) {
  const g = useGameStore();
  const { run, arm, note, guardNode } = useRunAct(showProjects);
  const markTrees = useWorldStore(w => w.markNearestTrees);
  const game = g.game;
  const shelters = game.structures.filter(s => s.finishedAt !== null).reduce((a, s) => a + (KIT[s.kind]?.shelters ?? 0), 0);
  const siteDrive = useWorldStore(w => w.siteGeo)?.drive;
  const ops = operational(game, siteDrive);
  const goalMem = useFeelStore(f => f.goalMem), closed = useFeelStore(f => f.goalsClosed);
  const baseFh = firstHour(game, siteDrive, goalMem);
  // a disaster's signature chain replaces the first-hour card from the warning (sim/felt/goals.ts); "Show first-hour goals" folds it back
  const [feltOff, setFeltOff] = useState<string | null>(null);
  const chainFh = feltChain(game);
  const feltUp = chainFh && feltOff !== game.disaster.kind ? chainFh : null;
  const fh = feltUp ?? baseFh;
  // the checklist covers shelter, water, power and food; the next steps are what else is pressing
  const guidedOpen = (feltUp ? true : closed === null) && !fh.complete && fh.goals.length > 0;
  // while the goals card is up it is the one list: only what cannot wait (a stuck project, a lost roof, logs) shows below it
  const sug = suggestions(game, 3, guidedOpen ? new Set([...OP_COVERED, 'house_crew', 'road_pile']) : OP_COVERED).filter(x => !guidedOpen || x.urgency >= GUIDED_URGENT || x.tone === 'alarm');
  const drive = useWorldStore(w => w.siteGeo)?.drive;
  const goals = longTerm(game, drive);
  const bunker = bunkerChecklist(game);
  const bunkerStarted = bunker.some(c => c.done || c.building);

  /** One kit piece as a menu item. */
  const kit = (kind: string) => {
    const a = buildAdvice(game, kind), own = ownNeeds(kind), extra = kind === 'well_drilled' ? drillExtra(game.site) : 0;
    const permit = needsPermit(kind) && game.paper.permits && countyWorks(game) ? ` · permit ${usd(permitFee(game, kind))}` : '';
    return <Item key={kind} flashKey={`kit:${kind}`} name={KIT[kind].name} cost={`~${usd(costOf(kind) + extra)}`}
      sub={`${totalHours(BLUEPRINTS[kind])} h · crew adds ~${usd(Math.round(totalHours(BLUEPRINTS[kind]) * CREW_RATE / 100) * 100)}${kind === 'well_drilled' ? ` · water at ${lengthText(game.site.gwDepth)}` : ''}${permit}`}
      on={g.tool === kind} off={a.off} next={a.next ? a.note : null} title={`${KIT[kind].blurb}${own ? ` Needs from your own land: ${own}.` : ''}`} click={() => arm(kind)} />;
  };

  const lineItem = (kind: PerimeterKind, per: number, unit: string) => {
    const len = per / 6, tool = `fence:${kind}`, off = perimeterOff(game, kind), note = perimeterNote(game, kind);
    const buy = toBuy(runBill(kind, len));
    const own = billText(Object.fromEntries(Object.entries(runBill(kind, len)).filter(([m]) => MATERIALS[m as MaterialId].price === null)));
    return <Item key={kind} name={PERIMETER[kind].name} cost={buy.length ? `~${usd(orderCost(buy))}` : '—'}
      sub={`per ${unit} · ${Math.round(runHours(kind, len))} h${note ? ` · ${note}` : ''}`}
      on={g.tool === tool} off={off} title={`${PERIMETER[kind].blurb}${own ? ` Needs from your own land: ${own}.` : ''}`} click={() => arm(tool)} />;
  };

  const chain = upgradeChain('split_rail').map(k => PERIMETER[k].name.replace(/ \(.*\)/, '').toLowerCase()).join(' → ');

  // every adult is gone and the children are fostered: say so in place of the checklist and the next steps (sim/orphans.ts)
  const foster = fosterNote(game);
  const over = runOver(game);
  if (over) return <div style={card(false)} data-testid="run-over">
    <div style={{ fontSize: FS.h, textTransform: 'uppercase', letterSpacing: 0.6, color: DIM, fontWeight: 600 }}>This run is over</div>
    <Note>No one is left on the place, so there is nothing more to build or order. Use the report card to load a save or start a new game.</Note>
  </div>;
  return <>
    {foster && !g.tool && <div style={card(true)}>
      <div style={{ fontSize: FS.h, textTransform: 'uppercase', letterSpacing: 0.6, color: DIM, fontWeight: 600 }}>The place is held</div>
      <Note tone="warn">{foster.text}</Note>
    </div>}
    {!toolsOnly && !g.tool && !foster && <div style={card(!fh.complete && (feltUp ? true : closed === null))}>
      <GoalsCard fh={fh} run={run} {...(feltUp ? { felt: { onClose: () => setFeltOff(game.disaster.kind) } } : {})} ticks={ops.map(o => <Tick key={o.id} done={o.done} label={o.label} line={o.line}
        act={o.act ? { label: o.act.label, run: () => run(o.act!.act), off: o.act.act.type === 'order' ? (orderProblem(g.game, o.act.act.lines) ? 'Cannot order that now' : null) : null } : undefined} />)}>
        {note && <Note>{note}</Note>}
        {guardNode}
        <StarterCompound wanted={starterWanted(game)} first={!game.structures.some(s => !s.unplaced)} guided={guidedOpen} />
      </GoalsCard>
    </div>}
    {!toolsOnly && sug.length > 0 && !g.tool && <div style={card()}>
      <div style={{ fontSize: FS.h, textTransform: 'uppercase', letterSpacing: 0.6, color: DIM, fontWeight: 600 }} title="Suggestions from what the place lacks; nothing is locked">Next steps</div>
      {sug.map(x => <div key={x.id} data-tone={x.tone} style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.06)', ...(x.tone === 'alarm' ? { borderLeft: `3px solid ${TONE.bad}`, paddingLeft: 6, background: 'rgba(160,40,30,0.18)', borderRadius: 4 } : {}) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <b style={x.tone === 'alarm' ? { color: TONE.bad } : undefined}>{x.title ?? KIT[x.kind].name}</b>
          {!x.acts && <button style={{ ...btn(true), ...miniBtn }} onClick={() => run({ type: 'stake', kind: x.kind })}>Stake it</button>}
        </div>
        <Clamp text={x.why} full={x.tone === 'alarm' || x.id === 'stalled' || x.id === 'logs'}>{x.why}</Clamp>
        {x.acts && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
          {x.acts.slice(0, 2).map(a => { const why = a.act.type === 'order' ? orderProblem(g.game, a.act.lines) : null; return <button key={a.label} style={{ ...btn(true), ...miniBtn, whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%', lineHeight: 1.2 }} disabled={!!why} title={why ? 'Cannot order that now (money, or nobody delivering)' : a.label} onClick={() => run(a.act)}>{a.label}</button>; })}
        </div>}
      </div>)}
    </div>}
    <Group id="longterm" title="Long-term goals" defaultOpen={inFirstHour(game) && !guidedOpen} extra={goals.map(x => `${x.steps.filter(y => y.done).length}/${x.steps.length}`).join(' · ')}>
      {goals.map(goal => {
        const done = goal.steps.filter(x => x.done).length;
        return <div key={goal.id} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 8px', marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{goal.title}</b><span style={{ color: done === goal.steps.length ? '#a8d080' : DIM }}>{done} of {goal.steps.length}</span></div>
          <div style={{ height: 3, background: '#333', borderRadius: 2, margin: '2px 0 3px' }}><div style={{ width: `${done / goal.steps.length * 100}%`, height: '100%', background: '#c9b27a', borderRadius: 2 }} /></div>
          {goal.steps.map(x => <div key={x.label} style={{ display: 'flex', gap: 6, fontSize: FS.small, opacity: x.done ? 0.6 : 1 }} title={x.detail}>
            <span style={{ width: 12, color: x.done ? '#a8d080' : DIM }}>{x.done ? '✓' : '·'}</span><span>{x.label}</span>
          </div>)}
          {goal.id === 'enclose' && <><WallProperty /><FortifyRing /></>}
        </div>;
      })}
    </Group>
    {(game.joiners?.waiting.length ?? 0) > 0 && !g.tool && <Group id="rigs" title="Park a joiner's rig" extra={`${game.joiners!.waiting.length} waiting`} defaultOpen>
      <Hint more="A newcomer's travel trailer or RV waits at the gate for a pad of your choosing. Place it within about 230 ft of the house and the wells and it hooks up to the water and power on its own.">Their rig is waiting for a pad.</Hint>
      {game.joiners!.waiting.map(w => <Fragment key={w.id}>{(RIG_ORDER.includes(w.kind) ? [w.kind] : []).map(k => <Item key={k} name={`${KIT[k].name} (theirs)`} cost="free" sub="arrives finished" on={g.tool === k} title={KIT[k].blurb} click={() => arm(k)} />)}</Fragment>)}
    </Group>}
    {(toolsOnly ? BUILD_GROUPS.filter(([gid]) => gid === 'home') : BUILD_GROUPS).map(([gid, title, kinds]) => (
      <Fragment key={gid}>
        <Group id={toolsOnly ? 'trees' : gid} title={toolsOnly ? 'Trees and logs' : title} extra={!toolsOnly && gid === 'home' ? housingSummary(game) : undefined} defaultOpen={!toolsOnly && gid !== 'defense'}>
          {gid === 'home' && <>
            <Item name="Mark trees to fell" cost="" sub="logs and firewood" title="Logs for building (pines and aspens), firewood for the stove (green wood seasons for about nine months)" on={g.tool === 'fell'} click={() => g.setTool(g.tool === 'fell' ? null : 'fell')} />
            <button style={{ ...btn(), width: '100%', marginBottom: 2 }} disabled={!markTrees} title="Marks the ten standing trees nearest the yard on your land" onClick={() => run({ type: 'markTrees', n: 10 })}>Mark the 10 nearest trees</button>
          </>}
          {!toolsOnly && kinds.map(kit)}
        </Group>
        {gid === 'home' && <Group id="housing" title="Housing styles" extra="by what is local" defaultOpen={false}>
          <Hint more="Each style is priced for this region: logs from your own timber, stone gathered or hauled, adobe only in dry country. The lodge needs a slope.">Styles are priced for this region.</Hint>
          <HousingStyleCards game={game} tool={g.tool} arm={arm} />
        </Group>}
      </Fragment>
    ))}
    <Group id="paths" title="Footpaths" defaultOpen={false}>
      <PathsPanel />
    </Group>
    {!toolsOnly && <Group id="lines" title="Advanced: pipes & cables" extra="far outposts" defaultOpen={false}>
      <Hint more="Buildings join the water and power lines on their own. Draw a line by hand only to reach a far outpost or to choose the route.">Hooked up automatically.</Hint>
      {UTILITY_LINES.map(kind => lineItem(kind, 100 / FT_PER_M, '100 ft'))}
    </Group>}
    <Group id="under" title={toolsOnly ? 'Bunker plan' : 'Underground'} extra={shelters > 0 ? `shelters ${shelters}` : undefined} defaultOpen={false}>
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', marginBottom: 3 }}>
        <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 0.6 }}>The bunker needs, in order</div>
        {bunker.map((c, i) => {
          const first = !c.done && bunker.findIndex(x => !x.done) === i;
          return <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '1px 0', opacity: c.done ? 0.6 : 1 }} title={c.detail}>
            <span style={{ width: 12, color: c.done ? '#a8d080' : first ? '#d8c9a0' : DIM }}>{c.done ? '✓' : first ? '▸' : '·'}</span>
            <span style={{ flex: 1, fontWeight: first ? 600 : 400 }}>{c.label}{c.building && <span style={{ color: '#e0b050', fontWeight: 400, fontSize: 11 }}> · being built</span>}</span>
            {first && <button style={{ ...btn(true), padding: '1px 6px', fontSize: 11 }} onClick={() => arm(c.kind)}>{KIT[c.kind].name}</button>}
          </div>;
        })}
        {!bunkerStarted && <Note>Start with a hatch or stairwell.</Note>}
      </div>
      {!toolsOnly && BUNKER_ORDER.map(kit)}
      {!toolsOnly && lineItem('escape_tunnel', 150 / FT_PER_M, '150 ft')}
      {!toolsOnly && lineItem('underground_passage', 150 / FT_PER_M, '150 ft')}
    </Group>
    <Group id="perimeter" title={toolsOnly ? 'Wall my property' : 'Perimeter'} defaultOpen={false}>
      <WallProperty />
      <FortifyRing />
      {!toolsOnly && <><Hint more={`Fences upgrade in place, tier to tier (Defense tab, Upgrade the walls): ${chain}.`}>Fences upgrade in place.</Hint>
      {perimeterTiers().map(t => <div key={t.id}>
        <div style={{ fontSize: 11, color: DIM, margin: '4px 2px 2px' }} title={t.hint}>{t.title} <span style={{ opacity: 0.7 }}>· {t.hint}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{t.kinds.map(k => lineItem(k, 100 / FT_PER_M, '100 ft'))}</div>
      </div>)}</>}
    </Group>
  </>;
}
