/**
 * The Build tab. Everything you could build, with guidance for a first
 * time: anything you cannot use yet is greyed with a short reason, the next
 * sensible piece is highlighted, and the bunker says what it needs right
 * now. Nothing is hidden (sim/guidance.ts decides; this draws).
 */
import { useGameStore } from '../../store/gameStore';
import { BLUEPRINTS, homeBeds, totalBill, totalHours } from '../../sim/blueprints';
import { MATERIALS, type MaterialId } from '../../sim/materials';
import { orderCost } from '../../sim/economy';
import { drillExtra } from '../../sim/site';
import { countyWorks, needsPermit, permitFee } from '../../sim/paperwork';
import { BUNKER_ORDER, KIT, TOWER_ORDER, UTILITY_ORDER } from '../../game/buildkit/kit';
import { PERIMETER, UTILITY_LINES, runBill, runHours, type PerimeterKind } from '../../sim/perimeter';
import { bunkerChecklist, buildAdvice, nextStep, perimeterNote, perimeterOff, perimeterTiers, upgradeChain } from '../../sim/guidance';
import { Group, Item, Note } from './common';
import { btn, DIM, usd } from './style';
import { WallProperty } from './WallProperty';

/** The build menu's groups (kit pieces by what they are for). */
const BUILD_GROUPS: Array<[string, string, readonly string[]]> = [
  ['home', 'Home & work', ['timber_cabin', 'log_house', 'cottage', 'outhouse', 'workshop', 'metal_garage', 'barn']],
  ['food', 'Food', ['garden', 'greenhouse', 'orchard', 'field', 'chicken_coop', 'root_cellar']],
  ['water', 'Water & power', UTILITY_ORDER],
  ['defense', 'Watch towers', TOWER_ORDER],
];

const toBuy = (bill: Partial<Record<MaterialId, number>>) => Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
const ownNeeds = (kind: string) => Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price === null).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ');
const costOf = (kind: string) => orderCost(toBuy(totalBill(BLUEPRINTS[kind])));

export function BuildMenu() {
  const g = useGameStore();
  const game = g.game;
  const shelters = game.structures.filter(s => s.finishedAt !== null).reduce((a, s) => a + (KIT[s.kind]?.shelters ?? 0), 0);
  const arm = (tool: string) => g.setTool(g.tool === tool ? null : tool);
  const step = nextStep(game);
  const bunker = bunkerChecklist(game);
  const bunkerStarted = bunker.some(c => c.done);

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
    const own = Object.entries(runBill(kind, len)).filter(([m]) => MATERIALS[m as MaterialId].price === null).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ');
    return <Item key={kind} name={PERIMETER[kind].name} cost={buy.length ? `~${usd(orderCost(buy))}` : '—'}
      sub={`per ${unit} · ${Math.round(runHours(kind, len))} h${own ? ` · + ${own}` : ''}${note ? ` · ${note}` : ''}`}
      on={g.tool === tool} off={off} title={PERIMETER[kind].blurb} click={() => arm(tool)} />;
  };

  const chain = upgradeChain('split_rail').map(k => PERIMETER[k].name.replace(/ \(.*\)/, '').toLowerCase()).join(' → ');

  return <>
    {step && !g.tool && <div style={{ border: '1px solid #d8c9a0', borderRadius: 8, padding: '6px 8px', marginBottom: 8, background: 'rgba(216,201,160,0.08)' }}>
      <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 0.6 }}>Next step</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span><b>{KIT[step.kind].name}</b><span style={{ color: DIM }}>: {step.why}</span></span>
        <button style={btn(true)} onClick={() => arm(step.kind)}>Stake it</button>
      </div>
    </div>}
    {BUILD_GROUPS.map(([gid, title, kinds]) => (
      <Group key={gid} id={gid} title={title} extra={gid === 'home' ? `beds ${homeBeds(game)} · ${game.people.length} people` : undefined}>
        {kinds.map(kit)}
      </Group>
    ))}
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
            <span style={{ flex: 1, fontWeight: first ? 600 : 400 }}>{c.label}</span>
            {first && <button style={{ ...btn(true), padding: '1px 6px', fontSize: 11 }} onClick={() => arm(c.kind)}>{KIT[c.kind].name}</button>}
          </div>;
        })}
        {!bunkerStarted && <Note>Start with a hatch or stairwell: every other room is added wall to wall from it.</Note>}
      </div>
      {BUNKER_ORDER.map(kit)}
      {lineItem('escape_tunnel', 50, '50 m')}
    </Group>
    <Group id="perimeter" title="Perimeter">
      <WallProperty />
      <Note>Fences upgrade in place, tier to tier (Defense tab, Upgrade the walls): {chain}.</Note>
      {perimeterTiers().map(t => <div key={t.id}>
        <div style={{ fontSize: 11, color: DIM, margin: '4px 2px 2px' }} title={t.hint}>{t.title} <span style={{ opacity: 0.7 }}>· {t.hint}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{t.kinds.map(k => lineItem(k, 100, '100 m'))}</div>
      </div>)}
    </Group>
    <Group id="woods" title="Woods">
      <Item name="Mark trees to fell" cost="" sub="logs for building, firewood for the stove" on={g.tool === 'fell'} click={() => g.setTool(g.tool === 'fell' ? null : 'fell')} />
    </Group>
  </>;
}
