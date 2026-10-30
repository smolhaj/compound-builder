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
import { drillExtra } from '../../sim/site';
import { countyWorks, needsPermit, permitFee } from '../../sim/paperwork';
import { BUNKER_ORDER, GATEHOUSE_ORDER, KIT, TOWER_ORDER, UTILITY_ORDER } from '../../game/buildkit/kit';
import { PERIMETER, UTILITY_LINES, runBill, runHours, type PerimeterKind } from '../../sim/perimeter';
import { bunkerChecklist, buildAdvice, longTerm, suggestions, type SuggestionAct, perimeterNote, perimeterOff, perimeterTiers, upgradeChain } from '../../sim/guidance';
import { hireCaretaker, openMoveIn, setBelt } from '../../sim/weekender';
import { Group, Item, Note } from './common';
import { btn, DIM, usd } from './style';
import { WallProperty } from './WallProperty';
import { FortifyRing } from './FortifyRing';
import { PathsPanel } from './PathsPanel';
import { takeRestDay } from '../../sim/mind';
import { enroll, setDrills } from '../../sim/courses';
import { setQuarantine } from '../../sim/medical';
import { callGathering } from '../../sim/gatherings';
import { HousingStyleCards } from './HousingStyles';

/** The build menu's groups (kit pieces by what they are for). */
const BUILD_GROUPS: Array<[string, string, readonly string[]]> = [
  ['home', 'Home & work', ['timber_cabin', 'log_house', 'cottage', 'guest_house', 'moms_house', 'outhouse', 'workshop', 'metal_garage', 'barn', 'equipment_yard']],
  ['food', 'Food', ['garden', 'greenhouse', 'greenhouse_heated', 'orchard', 'orchard_grove', 'field', 'chicken_coop', 'sheep_barn', 'pond', 'root_cellar', 'wood_oven', 'apiary', 'sugar_shack', 'barnyard']],
  ['water', 'Water & power', UTILITY_ORDER],
  ['defense', 'Watch towers & gatehouse', [...TOWER_ORDER, ...GATEHOUSE_ORDER]],
];

const toBuy = (bill: Partial<Record<MaterialId, number>>) => Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
const ownNeeds = (kind: string) => billText(Object.fromEntries(Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price === null)));
const costOf = (kind: string) => orderCost(toBuy(totalBill(BLUEPRINTS[kind])));

export function BuildMenu({ showProjects = () => undefined }: { showProjects?: () => void }) {
  const g = useGameStore();
  const markTrees = useWorldStore(w => w.markNearestTrees);
  const [note, setNote] = useState<string | null>(null);
  const game = g.game;
  const shelters = game.structures.filter(s => s.finishedAt !== null).reduce((a, s) => a + (KIT[s.kind]?.shelters ?? 0), 0);
  const arm = (tool: string) => g.setTool(g.tool === tool ? null : tool);
  const sug = suggestions(game);
  const drive = useWorldStore(w => w.siteGeo)?.drive;
  const goals = longTerm(game, drive);
  const bunker = bunkerChecklist(game);
  const bunkerStarted = bunker.some(c => c.done || c.building);

  /** A suggestion's one-click action. */
  const run = (a: SuggestionAct) => {
    setNote(null);
    if (a.type === 'stake') arm(a.kind);
    else if (a.type === 'tool') g.setTool(a.tool);
    else if (a.type === 'order') { if (!g.order(a.lines)) setNote('Could not place that order.'); }
    else if (a.type === 'markTrees') { const n = markTrees?.(a.n) ?? 0; setNote(n ? `Marked ${n} trees: the family fells them in work hours.` : 'No more trees to mark near the yard.'); }
    else if (a.type === 'caretaker') { const why = g.money(d => hireCaretaker(d, a.kind)); if (why) setNote(`Could not arrange that: ${why}.`); }
    else if (a.type === 'belt') { const why = g.daily(d => setBelt(d, a.on)); if (why) setNote(why[0].toUpperCase() + why.slice(1) + '.'); }
    else if (a.type === 'crew') { const why = g.hire(a.id); if (why) setNote(`Could not hire them: ${why}.`); }
    else if (a.type === 'open') g.focusHud({ right: a.right, ...(a.supplies ? { supplies: a.supplies } : {}) });
    else if (a.type === 'restDay') { const why = g.daily(d => takeRestDay(d)); if (why) setNote(why); }
    else if (a.type === 'quarantine') { const why = g.daily(d => setQuarantine(d, a.on)); if (why) setNote(why); }
    else if (a.type === 'rx') g.stockUpRx();
    else if (a.type === 'terrain') useWorldStore.getState().setTerrainMode(a.mode);
    else if (a.type === 'enroll') { const why = g.money(d => enroll(d, a.course, a.pid, a.mode, a.teacher)); if (why) setNote(`Could not sign up: ${why}.`); }
    else if (a.type === 'drills') g.daily(d => { setDrills(d, a.perWeek); return null; });
    else if (a.type === 'terraces') { const why = g.stakeTerraces(a.tiers); setNote(why ? `Cannot stake the terraces: ${why}.` : `Staked ${a.tiers.length} terraced garden beds down the slope: each is cut into the hill on its own flat pad and walled in dry-stack stone as its foundation goes in (Projects).`); }
    else if (a.type === 'drain') { const why = g.planSpan('drain_channel', a.a, a.b); setNote(why ? `Cannot lay it there: ${why}.` : 'Planned the drainage channel above the building: the family digs it as the materials come in (Projects).'); }
    else if (a.type === 'span') { const k = a.kind ?? 'tunnel_bridge', why = g.planSpan(k, a.a, a.b); setNote(why ? `Cannot lay it there: ${why}.` : k === 'rock_tunnel' ? 'Planned the rock tunnel: the family drives it as the materials and the excavator come in (Projects).' : 'Planned the tunnel-bridge across the gorge: the family builds it as the materials come in (Projects).'); }
    else if (a.type === 'gather') { const why = g.daily(d => callGathering(d, a.kind)); if (why) setNote(why); }
    else if (a.type === 'moveIn') { const why = g.money(d => openMoveIn(d)); if (why) setNote(why[0].toUpperCase() + why.slice(1) + '.'); }
    else { g.select(a.id); showProjects(); }
  };

  /** One kit piece as a menu item. */
  const kit = (kind: string) => {
    const a = buildAdvice(game, kind), own = ownNeeds(kind), extra = kind === 'well_drilled' ? drillExtra(game.site) : 0;
    const permit = needsPermit(kind) && game.paper.permits && countyWorks(game) ? ` · permit ${usd(permitFee(game, kind))}` : '';
    return <Item key={kind} name={KIT[kind].name} cost={`~${usd(costOf(kind) + extra)}`}
      sub={`${totalHours(BLUEPRINTS[kind])} h${own ? ` · + ${own}` : ''}${kind === 'well_drilled' ? ` · water at ${game.site.gwDepth} m` : ''}${permit}`}
      on={g.tool === kind} off={a.off} next={a.next ? a.note : null} title={KIT[kind].blurb} click={() => arm(kind)} />;
  };

  const lineItem = (kind: PerimeterKind, per: number, unit: string) => {
    const len = per / 6, tool = `fence:${kind}`, off = perimeterOff(game, kind), note = perimeterNote(game, kind);
    const buy = toBuy(runBill(kind, len));
    const own = billText(Object.fromEntries(Object.entries(runBill(kind, len)).filter(([m]) => MATERIALS[m as MaterialId].price === null)));
    return <Item key={kind} name={PERIMETER[kind].name} cost={buy.length ? `~${usd(orderCost(buy))}` : '—'}
      sub={`per ${unit} · ${Math.round(runHours(kind, len))} h${own ? ` · + ${own}` : ''}${note ? ` · ${note}` : ''}`}
      on={g.tool === tool} off={off} title={PERIMETER[kind].blurb} click={() => arm(tool)} />;
  };

  const chain = upgradeChain('split_rail').map(k => PERIMETER[k].name.replace(/ \(.*\)/, '').toLowerCase()).join(' → ');

  return <>
    {sug.length > 0 && !g.tool && <div style={{ border: '1px solid #d8c9a0', borderRadius: 8, padding: '6px 8px', marginBottom: 8, background: 'rgba(216,201,160,0.08)' }}>
      <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 0.6 }}>Most pressing now <span style={{ textTransform: 'none', letterSpacing: 0 }}>· suggestions, nothing is locked</span></div>
      {sug.map(x => <div key={x.id} style={{ padding: '3px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span><b>{x.title ?? KIT[x.kind].name}</b><span style={{ color: DIM }}>: {x.why}</span></span>
          {!x.acts && <button style={btn(true)} onClick={() => run({ type: 'stake', kind: x.kind })}>Stake it</button>}
        </div>
        {x.acts && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
          {x.acts.map(a => { const why = a.act.type === 'order' ? orderProblem(g.game, a.act.lines) : null; return <button key={a.label} style={btn(true)} disabled={!!why} title={why ? 'Cannot order that now (money, or nobody delivering)' : undefined} onClick={() => run(a.act)}>{a.label}</button>; })}
        </div>}
      </div>)}
      {note && <Note>{note}</Note>}
    </div>}
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 8px', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 0.6 }}>Long-term <span style={{ textTransform: 'none', letterSpacing: 0 }}>· where a prepper place ends up</span></div>
      {goals.map(goal => {
        const done = goal.steps.filter(x => x.done).length;
        return <div key={goal.id} style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{goal.title}</b><span style={{ color: done === goal.steps.length ? '#a8d080' : DIM }}>{done} of {goal.steps.length}</span></div>
          <div style={{ height: 3, background: '#333', borderRadius: 2, margin: '2px 0 3px' }}><div style={{ width: `${done / goal.steps.length * 100}%`, height: '100%', background: '#c9b27a', borderRadius: 2 }} /></div>
          {goal.steps.map(x => <div key={x.label} style={{ display: 'flex', gap: 6, fontSize: 11.5, opacity: x.done ? 0.6 : 1 }} title={x.detail}>
            <span style={{ width: 12, color: x.done ? '#a8d080' : DIM }}>{x.done ? '✓' : '·'}</span><span>{x.label}</span>
          </div>)}
          {goal.id === 'enclose' && <><WallProperty /><FortifyRing /></>}
        </div>;
      })}
    </div>
    {BUILD_GROUPS.map(([gid, title, kinds]) => (
      <Fragment key={gid}>
        <Group id={gid} title={title} extra={gid === 'home' ? housingSummary(game) : undefined}>
          {kinds.map(kit)}
        </Group>
        {gid === 'home' && <Group id="housing" title="Housing styles" extra="by what is local">
          <Note>Each style is priced for this region: logs from your own timber, stone gathered or hauled, adobe only in dry country. The lodge needs a slope.</Note>
          <HousingStyleCards game={game} tool={g.tool} arm={arm} />
        </Group>}
      </Fragment>
    ))}
    <Group id="paths" title="Footpaths">
      <PathsPanel />
    </Group>
    <Group id="lines" title="Pipes & cables">
      {UTILITY_LINES.map(kind => lineItem(kind, 100, '100 m'))}
    </Group>
    <Group id="under" title="Underground" extra={shelters > 0 ? `shelters ${shelters}` : undefined}>
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
        {!bunkerStarted && <Note>Start with a hatch or stairwell: every other room is added wall to wall from it.</Note>}
      </div>
      {BUNKER_ORDER.map(kit)}
      {lineItem('escape_tunnel', 50, '50 m')}
      {lineItem('underground_passage', 50, '50 m')}
    </Group>
    <Group id="perimeter" title="Perimeter">
      <WallProperty />
      <FortifyRing />
      <Note>Fences upgrade in place, tier to tier (Defense tab, Upgrade the walls): {chain}.</Note>
      {perimeterTiers().map(t => <div key={t.id}>
        <div style={{ fontSize: 11, color: DIM, margin: '4px 2px 2px' }} title={t.hint}>{t.title} <span style={{ opacity: 0.7 }}>· {t.hint}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{t.kinds.map(k => lineItem(k, 100, '100 m'))}</div>
      </div>)}
    </Group>
    <Group id="woods" title="Woods">
      <Item name="Mark trees to fell" cost="" sub="logs for building, firewood for the stove (green wood seasons for about nine months)" on={g.tool === 'fell'} click={() => g.setTool(g.tool === 'fell' ? null : 'fell')} />
      <button style={{ ...btn(), width: '100%', marginTop: 2 }} disabled={!markTrees} title="Marks the ten standing trees nearest the yard on your land" onClick={() => run({ type: 'markTrees', n: 10 })}>Mark the 10 nearest trees</button>
    </Group>
  </>;
}
