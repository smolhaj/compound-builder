import { useState, type CSSProperties, type ReactNode } from 'react';
import { useWorldStore, type BuildingView, type CameraMode } from '../store/worldStore';
import { useGameStore } from '../store/gameStore';
import type { Quality } from '../engine/world/WorldScene';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import { WEATHER_MODES, type WeatherMode } from '../engine/world/weather/weatherState';
import { calendarOf, hourOf, type Speed } from '../sim/state';
import { fullName } from '../sim/family';
import { MATERIALS, MATERIAL_IDS, emptyStock, type MaterialId } from '../sim/materials';
import { onOrder, orderCost, orderProblem } from '../sim/economy';
import { blockedReason, isFinished, planProblem, progress } from '../sim/construction';
import { drillExtra } from '../sim/site';
import { REGIONS } from '../sim/regions';
import { CREW_RATE, CREW_SIZE, crewProblem, crewQuote } from '../sim/crews';
import { keeping, KEPT } from '../sim/shelf';
import { CONDITION, pharmacyOpen } from '../sim/body';
import { netWorth } from '../sim/finance';
import { chimneyState, greenRicks, SEASON_DAYS, SWEEP_USD } from '../sim/upkeep';
import { countyWorks, needsPermit, permitFee, premium, yearlyTax } from '../sim/paperwork';
import { DRIVE_PER_FT, driveQuote, fixBill, fixBlocked, fixDef, hookupProblem, pendingFixes, POLE_PER_FT, powerQuote } from '../sim/improvements';
import { BLUEPRINTS, totalBill, totalHours } from '../sim/blueprints';
import { BUNKER_ORDER, KIT, UTILITY_ORDER } from '../game/buildkit/kit';
import { FIT, fitProblem, plant, serviceOf, FUEL_UNIT_L, UTILITY, SPARE_FOR } from '../sim/utilities';
import { bestShelter, doseRate, isNuclear, SHELTER_DAYS } from '../sim/nuclear';
import { DISASTERS, TRACKS, TRACK_NAME, type DisasterKind } from '../sim/disaster';
import { prices } from '../sim/economy';
import { LIVING_PER_DAY } from '../sim/engine';
import { daysOfFood, KCAL, NEED_ADULT, NEED_KID } from '../sim/needs';
import { NEIGHBOR_BLURB } from '../sim/encounters';
import { acresOf, buyProblem, LAND_NAME, priceOf } from '../sim/land';
import { HARDEN, HARDEN_IDS, type TierDef, hardenCost, hardenProblem, isBunkerRoom, protectionOf, tierOf } from '../sim/hardening';
import { PERIMETER, PERIMETER_ORDER, UTILITY_LINES, runBill, runHours, runFinished, runProgress, runBlocked, runGrowth } from '../sim/perimeter';

const QUALITIES: Quality[] = ['high', 'medium', 'low'];
const SIGHTS: Array<['off' | 'road' | 'ridge' | 'night' | 'viewshed', string, string]> = [
  ['off', 'Off', 'No sightline overlay'], ['road', 'Road', 'How exposed each spot is to people on the county road'], ['ridge', 'Ridge', 'Seen from the high ground to the west'],
  ['night', 'Night', 'Where your lit windows give you away after dark'], ['viewshed', 'View from…', 'Click a spot to see what can be seen from there (Shift-click: from a 10 m tower)']];
const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];
const VIEWS: Array<[BuildingView, string, string]> = [['full', 'Walls', 'Whole buildings'], ['cutaway', 'Cutaway', 'Walls cut at waist height, roof and loft off (V)'], ['xray', 'X-ray', 'See-through walls and roof (V)']];
const SPEEDS: Array<[Speed, string]> = [[0, '❚❚'], [1, '▶'], [2, '▶▶'], [3, '▶▶▶'], [4, '⏩']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const TASK_TEXT: Record<string, string> = { build: 'Building', forestry: 'In the woods', chores: 'Chores', sleep: 'Asleep', school: 'School', leisure: 'Free time', idle: 'Idle', job: 'At work in town', gone: 'Died', shelter: 'Sheltering' };

function dateLabel(doy: number): string {
  let m = 11;
  while (m > 0 && doy <= MONTH_START[m]) m--;
  return `${MONTHS[m]} ${doy - MONTH_START[m]}`;
}
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const panel: CSSProperties = { background: 'rgba(20,22,18,0.78)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: '#eee' };
const btn = (on = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 12.5 });
const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginBottom: 10 }}><div style={h3}>{title}</div>{children}</div>;
}

const DIM = 'rgba(238,238,238,0.6)', LINE = 'rgba(255,255,255,0.08)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
type Tone = keyof typeof TONE;

/** A label on the left, its value on the right. */
function Row({ label, value, tone, title }: { label: ReactNode; value: ReactNode; tone?: Tone; title?: string }) {
  return <div title={title} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
    <span style={{ color: DIM }}>{label}</span>
    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tone ? TONE[tone] : undefined }}>{value}</span>
  </div>;
}

/** A note line (a warning or a hint), colored by tone. */
function Note({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <div style={{ fontSize: 11.5, lineHeight: 1.35, margin: '3px 0', color: tone ? TONE[tone] : DIM }}>{children}</div>;
}

/** Tabs across the top of a panel; a dot marks a tab that wants attention. */
function Tabs<T extends string>({ tabs, value, set }: { tabs: Array<[T, string, Tone?]>; value: T; set: (t: T) => void }) {
  return <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${LINE}`, margin: '-2px -2px 8px', flexWrap: 'wrap' }}>
    {tabs.map(([id, label, alert]) => (
      <button key={id} onClick={() => set(id)} style={{ flex: '1 0 auto', padding: '5px 6px', border: 0, borderBottom: `2px solid ${value === id ? '#d8c9a0' : 'transparent'}`, background: 'transparent', color: value === id ? '#fff' : DIM, cursor: 'pointer', fontSize: 12, fontWeight: value === id ? 600 : 400 }}>
        {label}{alert && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: TONE[alert], marginLeft: 4, verticalAlign: 'middle' }} />}
      </button>
    ))}
  </div>;
}

/** A group of build items that folds away (remembered per browser). */
function Group({ id, title, extra, children }: { id: string; title: string; extra?: string; children: ReactNode }) {
  const key = `cb.fold.${id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== '0'; } catch { return true; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1'); } catch { /* storage blocked */ } };
  return <div style={{ marginBottom: 4 }}>
    <button onClick={toggle} style={{ ...h3, display: 'flex', width: '100%', justifyContent: 'space-between', background: 'transparent', border: 0, color: '#eee', cursor: 'pointer', padding: '5px 2px', margin: 0 }}>
      <span>{open ? '▾' : '▸'} {title}</span>{extra && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{extra}</span>}
    </button>
    {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>}
  </div>;
}

/** One thing to build: the name and cost on a line, the time and notes under it. */
function Item({ name, cost, sub, on, off, title, click }: { name: string; cost: string; sub?: string; on: boolean; off?: string | null; title?: string; click: () => void }) {
  return <button disabled={!!off} title={off ?? title} onClick={click} style={{ textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 0, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1, background: on ? '#d8c9a0' : 'rgba(255,255,255,0.05)', color: on ? '#1c1d18' : '#eee' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><span>{name}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{cost}</span></div>
    {sub && <div style={{ fontSize: 11, opacity: 0.65 }}>{off ? off : sub}</div>}
  </button>;
}

/** The build menu's groups (kit pieces by what they are for). */
const BUILD_GROUPS: Array<[string, string, readonly string[]]> = [
  ['home', 'Home & work', ['timber_cabin', 'log_house', 'outhouse', 'workshop', 'barn']],
  ['food', 'Food', ['garden', 'field', 'chicken_coop', 'root_cellar']],
  ['water', 'Water & power', UTILITY_ORDER],
];

/** Free build: start any disaster when you are ready. */
function FreeBuild() {
  const g = useGameStore();
  const [kind, setKind] = useState<DisasterKind>('grid_down');
  const [warn, setWarn] = useState(14);
  return <Section title="Free build">
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={kind} onChange={e => setKind(e.target.value as DisasterKind)}>
        {(Object.keys(DISASTERS) as DisasterKind[]).map(k => <option key={k} value={k}>{DISASTERS[k]!.name}</option>)}
      </select>
      <select value={warn} onChange={e => setWarn(+e.target.value)} title="Warning signs before it hits">
        <option value={0}>no warning</option><option value={7}>a week's warning</option><option value={14}>two weeks'</option><option value={45}>six weeks'</option>
      </select>
      <button style={btn(true)} onClick={() => g.trigger(kind, warn)}>Trigger</button>
    </div>
  </Section>;
}

/** Game HUD. Hidden with ?clean (QA shots). */
export function Hud() {
  const w = useWorldStore();
  const g = useGameStore();
  const [qty, setQty] = useState<Record<MaterialId, number>>(emptyStock());
  const [leftTab, setLeftTab] = useState<'build' | 'projects' | 'log'>('build');
  const [rightTab, setRightTab] = useState<'family' | 'supplies' | 'utilities' | 'land' | 'outside'>('family');
  // picking a building on the map opens its project card
  const [lastSel, setLastSel] = useState<string | null>(null);
  if (g.selected !== lastSel) { setLastSel(g.selected); if (g.selected) setLeftTab('projects'); }
  if (new URLSearchParams(location.search).has('clean')) return null;
  const game = g.game;
  const cal = calendarOf(game.clock);
  const pending = onOrder(game);
  const lines = MATERIAL_IDS.filter(m => qty[m] > 0).map(m => ({ material: m, qty: qty[m] }));
  const problem = lines.length ? orderProblem(game, lines) : null;
  // what the plans still need beyond stock + orders
  const need: Partial<Record<MaterialId, number>> = {};
  for (const st of game.structures) {
    if (isFinished(st)) continue;
    const bp = BLUEPRINTS[st.kind];
    bp.stages.forEach((sg, i) => {
      if (i < st.stage || (i === st.stage && st.supplied)) return;
      for (const [k, n] of Object.entries(sg.materials) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n;
    });
  }
  for (const j of game.hardenJobs) {
    const st = game.structures.find(x => x.id === j.building);
    if (j.finishedAt !== null || j.supplied || !st) continue;
    for (const [k, n] of Object.entries(hardenCost(st.kind, j.upgrade, j.tier).materials) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n;
  }
  for (const k of MATERIAL_IDS) need[k] = Math.max(0, (need[k] ?? 0) - game.stock[k] - (pending[k] ?? 0));
  const needLines = MATERIAL_IDS.filter(k => (need[k] ?? 0) > 0 && MATERIALS[k].price !== null).map(k => ({ material: k, qty: need[k]! }));
  const sel = game.structures.find(s => s.id === g.selected) ?? game.structures.find(s => !isFinished(s)) ?? null;
  const costOf = (kind: string) => orderCost(Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));
  const shelters = game.structures.filter(isFinished).reduce((a, s) => a + (KIT[s.kind].shelters ?? 0), 0);
  // a dot on a tab that wants attention
  const warned = !!game.disaster.kind && game.clock.t >= game.disaster.warnAt;
  const daysFood = daysOfFood(game);
  const foodAlert: Tone | undefined = !game.food.fromStores && game.food.ateKcal < game.food.needKcal * 0.95 ? 'bad' : warned && (game.food.fromStores ? daysFood < 180 : daysFood < 30) ? 'warn' : undefined;
  const utilAlert: Tone | undefined = game.utilities.report.shortL > 0 ? 'bad' : game.utilities.hauling || game.utilities.report.shortKwh > 0.5 ? 'warn' : undefined;
  const outsideAlert: Tone | undefined = game.clock.t >= game.disaster.hitAt && game.disaster.kind ? 'bad' : warned ? 'warn' : undefined;
  const familyAlert: Tone | undefined = game.personState.some(ps => ps.needs.died == null && (ps.needs.health < 40 || ps.needs.hurt.length > 0)) ? 'bad' : game.personState.some(ps => ps.needs.died == null && ps.needs.hunger > 5000) ? 'warn' : undefined;
  const projectsAlert: Tone | undefined = game.structures.some(st => !isFinished(st) && blockedReason(game, st)) ? 'warn' : undefined;
  const ownNeeds = (kind: string) => Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price === null).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ');

  return (
    <>
      {/* Top bar: date, time, money, speed */}
      <div style={{ ...panel, position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13.5 }}>
        <span>{dateLabel(cal.doy)}, {cal.year}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(hourOf(game.clock.t))}</span>
        <span style={{ fontWeight: 600, color: '#cfe0a8' }} title={`Checking. Net worth ${usd(netWorth(game))}`}>{usd(game.money)}</span>
        <button style={btn()} title="Town, the catalog, your accounts, gold and silver" onClick={() => g.openShop(true)}>Shop & money</button>
        <button style={btn()} title="New game" onClick={() => g.openSetup(true, true)}>New</button>
        <span style={{ display: 'flex', gap: 3 }}>
          {SPEEDS.map(([s, label]) => <button key={s} style={btn(game.clock.speed === s)} onClick={() => g.setSpeed(s)}>{label}</button>)}
        </span>
      </div>

      {/* Left: build menu (groups) · projects under way · the log */}
      <div style={{ ...panel, position: 'fixed', left: 10, top: 10, width: 244, maxHeight: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
        <Tabs tabs={[['build', 'Build'], ['projects', 'Projects', projectsAlert], ['log', 'Log']]} value={leftTab} set={setLeftTab} />
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
          {leftTab === 'build' && <>
            {BUILD_GROUPS.map(([gid, title, kinds]) => (
              <Group key={gid} id={gid} title={title}>
                {kinds.map(kind => {
                  const own = ownNeeds(kind), no = planProblem(game, kind), extra = kind === 'well_drilled' ? drillExtra(game.site) : 0;
                  return <Item key={kind} name={KIT[kind].name} cost={`~${usd(costOf(kind) + extra)}`} sub={`${totalHours(BLUEPRINTS[kind])} h${own ? ` · + ${own}` : ''}${kind === 'well_drilled' ? ` · water at ${game.site.gwDepth} m` : ''}${needsPermit(kind) && game.paper.permits && countyWorks(game) ? ` · permit ${usd(permitFee(game, kind))}` : ''}`}
                    on={g.tool === kind} off={no} title={KIT[kind].blurb} click={() => g.setTool(g.tool === kind ? null : kind)} />;
                })}
              </Group>
            ))}
            <Group id="lines" title="Pipes & cables">
              {UTILITY_LINES.map(kind => {
                const len = 100 / 6, buy = Object.entries(runBill(kind, len)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })), tool = `fence:${kind}`;
                return <Item key={kind} name={PERIMETER[kind].name} cost={`~${usd(orderCost(buy))}`} sub={`per 100 m · ${Math.round(runHours(kind, len))} h`} on={g.tool === tool} title={PERIMETER[kind].blurb} click={() => g.setTool(g.tool === tool ? null : tool)} />;
              })}
            </Group>
            <Group id="under" title="Underground" extra={shelters > 0 ? `shelters ${shelters}` : undefined}>
              {BUNKER_ORDER.map(kind => {
                const own = ownNeeds(kind);
                return <Item key={kind} name={KIT[kind].name} cost={`~${usd(costOf(kind))}`} sub={`${totalHours(BLUEPRINTS[kind])} h${own ? ` · + ${own}` : ''}${needsPermit(kind) && game.paper.permits && countyWorks(game) ? ` · permit ${usd(permitFee(game, kind))}` : ''}`} on={g.tool === kind} title={KIT[kind].blurb} click={() => g.setTool(g.tool === kind ? null : kind)} />;
              })}
              {(() => {
                const kind = 'escape_tunnel' as const, len = 50 / 6, tool = `fence:${kind}`;
                const buy = Object.entries(runBill(kind, len)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
                return <Item name={PERIMETER[kind].name} cost={`~${usd(orderCost(buy))}`} sub={`per 50 m · ${Math.round(runHours(kind, len))} h · opens only from inside`} on={g.tool === tool} title={PERIMETER[kind].blurb} click={() => g.setTool(g.tool === tool ? null : tool)} />;
              })()}
            </Group>
            <Group id="perimeter" title="Perimeter">
              {PERIMETER_ORDER.map(kind => {
                const len = 100 / 6, bill = runBill(kind, len);
                const buy = Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
                const own = Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price === null).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ');
                const tool = `fence:${kind}`;
                return <Item key={kind} name={PERIMETER[kind].name} cost={buy.length ? `~${usd(orderCost(buy))}` : '—'} sub={`per 100 m · ${Math.round(runHours(kind, len))} h${own ? ` · + ${own}` : ''}`} on={g.tool === tool} title={PERIMETER[kind].blurb} click={() => g.setTool(g.tool === tool ? null : tool)} />;
              })}
            </Group>
            <Group id="woods" title="Woods">
              <Item name="Mark trees to fell" cost="" sub="logs for building, firewood for the stove" on={g.tool === 'fell'} click={() => g.setTool(g.tool === 'fell' ? null : 'fell')} />
            </Group>
          </>}

          {leftTab === 'projects' && <>
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
          </>}

          {leftTab === 'log' && game.log.slice(-14).reverse().map((e, i) => <div key={i} style={{ padding: '3px 0', borderBottom: `1px solid ${LINE}`, opacity: 1 - i * 0.04 }}>{e.text}</div>)}
        </div>
        {g.tool && <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}>
          <Note tone={g.toolProblem ? 'warn' : undefined}>{g.toolProblem ?? (g.tool === 'fell' ? 'Point at a tree · click marks or unmarks · Esc stops' : g.tool.startsWith('fence:') ? 'Click corners · Shift-click the line for a gate · Enter lays it out · Backspace undoes · Esc cancels' : 'Click to stake it out · R rotates · Esc cancels')}</Note>
        </div>}
      </div>

      {/* Right: the family, supplies, water & power, land, the outside world */}
      <div style={{ ...panel, position: 'fixed', right: 10, top: 10, width: 268, maxHeight: 'calc(100vh - 90px)', display: 'flex', flexDirection: 'column' }}>
        <Tabs tabs={[['family', 'Family', familyAlert], ['supplies', 'Supplies', foodAlert], ['utilities', 'Utilities', utilAlert], ['land', 'Land'], ['outside', 'Outside', outsideAlert]]} value={rightTab} set={setRightTab} />
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
          {rightTab === 'family' && <>
            {game.people.map((p, i) => {
              const st = game.personState[i], n = st?.needs;
              const bar = (v: number, c: string, t: string) => <div title={t} style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${Math.max(0, v)}%`, height: '100%', background: c, borderRadius: 2 }} /></div>;
              const notes = n ? [n.hunger > 5000 ? 'hungry' : '', ...n.hurt.map(h => h.what), n.dose > 0.05 ? `${n.dose.toFixed(2)} Sv` : ''].filter(Boolean).join(', ') : '';
              return <div key={p.id} style={{ padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#' + p.shirt.toString(16).padStart(6, '0'), marginRight: 6 }} />{fullName(p)}, {p.age}</span>
                  <span style={{ color: DIM }}>{n?.died != null ? 'Died' : TASK_TEXT[st?.task ?? 'idle']}</span>
                </div>
                {n && n.died == null && <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: DIM, width: 34 }}>health</span>{bar(n.health, n.health > 60 ? '#9cc070' : n.health > 30 ? '#e0b050' : '#e06a50', `Health ${Math.round(n.health)}`)}
                  <span style={{ color: DIM, width: 36 }}>morale</span>{bar(n.morale, '#7aa0d0', `Morale ${Math.round(n.morale)}`)}
                </div>}
                {notes && <Note tone="warn">{notes}</Note>}
                {n && n.died == null && (p.conditions?.length ?? 0) > 0 && (() => {
                  const days = Math.floor(game.body.rx[p.id] ?? 30);
                  return <div style={{ fontSize: 11, color: days < 14 ? TONE.bad : days < 45 ? TONE.warn : DIM, marginTop: 2 }}>{p.conditions!.map(c => CONDITION[c].name).join(', ')}: {days > 0 ? `${days} days of ${p.conditions!.map(c => CONDITION[c].rx).join(' and ')}` : 'out of medicine'}</div>;
                })()}
              </div>;
            })}
            {game.people.some(p => p.conditions?.length) && <Section title="Medicine & household">
              {pharmacyOpen(game) ? <button style={{ ...btn(), width: '100%' }} title="Fill everyone's prescriptions three months past the month in hand (as far ahead as insurance covers)" onClick={() => g.stockUpRx()}>Fill prescriptions 90 days ahead</button>
                : <Note tone="warn">The pharmacy is shut: what's on hand is all there is.</Note>}
              <Row label="Hygiene supplies" value={game.disaster.tracks.stores >= 0.5 ? `bought with groceries · ${Math.floor(game.stock.hygiene)} put by` : `${Math.floor(game.stock.hygiene)} person-months left`} />
            </Section>}
            <Section title="Work and money">
              {game.disaster.tracks.banks > 0.5 && game.disaster.tracks.stores > 0.5 && <Row label="Household costs" value={`$${LIVING_PER_DAY}/day`} />}
              {game.people.filter(p => p.job).map(p => {
                const st = game.personState.find(x => x.id === p.id);
                const over = game.disaster.phase === 'impact' || game.disaster.phase === 'survival' || game.disaster.phase === 'over';
                return <div key={'job' + p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span><span style={{ color: DIM }}>{p.first}:</span> {over ? <s>{p.job!.title}</s> : st?.employed ? `${p.job!.title}, $${p.job!.wage}/day` : 'quit the job'}</span>
                  {!over && <button style={btn()} onClick={() => g.setEmployed(p.id, !st?.employed)}>{st?.employed ? 'Quit' : 'Go back'}</button>}
                </div>;
              })}
            </Section>
          </>}

          {rightTab === 'supplies' && <>
            <Section title="Keeping">
              {KEPT.filter(k => game.stock[k] > 0.05).map(k => {
                const kp = keeping(game, k), yrs = (d: number) => d >= 365 ? `${(d / 365).toFixed(1)} yr` : `${Math.round(d / 30)} mo`;
                return <Row key={k} label={MATERIALS[k].name} value={<span style={{ color: TONE[kp.tone === 'good' ? 'good' : kp.tone] }}>{yrs(kp.age)} old / keeps {yrs(kp.life)}</span>} />;
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ color: DIM }}>Rotate the pantry: {game.shelf.rotate ? 'yes' : 'no'}</span>
                <button style={btn()} title="Eat what you store: the oldest comes off the shelf, the grocery run replaces it (keeps the stores young while town is open)" onClick={() => g.setRotate(!game.shelf.rotate)}>{game.shelf.rotate ? 'Stop' : 'Rotate'}</button>
              </div>
              <Row label="Mouse traps" value={game.shelf.traps > 0 ? `set (${game.shelf.traps} days)` : game.stock.traps >= 1 ? 'a box in the shed' : <span style={{ color: TONE.warn }}>none: mice in the stores</span>} />
              {game.stock.fuel > 0 && game.stock.stabilizer < Math.ceil(game.stock.fuel / 10) && <Note tone="warn">The gas has no stabilizer: it goes stale in about six months.</Note>}
            </Section>
            <Section title="Food">
              {(() => {
                const f = game.food, d = daysOfFood(game);
                const warned = !!game.disaster.kind && game.clock.t >= game.disaster.warnAt;
                const short = warned && (f.fromStores ? d < 180 : d < 30);
                const perDay = game.people.reduce((a, p, i) => a + (game.personState[i]?.needs.died == null ? (p.kid ? NEED_KID : NEED_ADULT) : 0), 0);
                const lines = [{ material: 'staples' as MaterialId, qty: Math.max(1, Math.ceil(90 * perDay / KCAL.staples)) }];
                const why = orderProblem(game, lines);
                return <>
                  <Row label="Put by" value={d === Infinity ? '—' : d >= 365 ? `${(d / 365).toFixed(1)} years` : `${Math.floor(d)} ${Math.floor(d) === 1 ? 'day' : 'days'}`} tone={short ? 'warn' : undefined} />
                  {f.producedKcal > 0 && <Row label="Grown yesterday" value={`${Math.round(f.producedKcal).toLocaleString('en-US')} kcal`} />}
                  {!f.fromStores && <Row label="Ate / needed" value={`${Math.round(f.ateKcal).toLocaleString('en-US')} / ${Math.round(f.needKcal).toLocaleString('en-US')}`} tone={f.ateKcal < f.needKcal * 0.95 ? 'bad' : undefined} />}
                  {f.fromStores && <Note>Groceries come from town for now. Stock canned food and bulk staples for when the stores close.</Note>}
                  {short && <>
                    <Note tone="warn">{f.fromStores ? 'The warning signs are out: if the stores close, this is all there is.' : 'The trucks are running: buy food while you can.'}</Note>
                    <button style={{ ...btn(!why), width: '100%' }} disabled={!!why} title={why ?? undefined} onClick={() => g.order(lines)}>Order three months of staples ({usd(orderCost(lines, prices(game)))})</button>
                  </>}
                </>;
              })()}
            </Section>
            <Section title="Stockpile">
              {MATERIAL_IDS.filter(m => game.stock[m] > 0 || (pending[m] ?? 0) > 0 || qty[m] > 0).length === 0 && <Note>Empty. Order below, or fell timber.</Note>}
              {MATERIAL_IDS.filter(m => game.stock[m] > 0 || (pending[m] ?? 0) > 0 || qty[m] > 0).map(m => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, padding: '1px 0' }}>
                  <span style={{ color: DIM, flex: 1 }}>{MATERIALS[m].name}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{Math.floor(game.stock[m] + 1e-6)}{pending[m] ? <span style={{ color: DIM }}> +{pending[m]}</span> : null}</span>
                  {MATERIALS[m].price !== null && <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
                    <button style={{ ...btn(), padding: '1px 6px' }} onClick={() => setQty({ ...qty, [m]: Math.max(0, qty[m] - 1) })}>−</button>
                    <span style={{ width: 18, textAlign: 'center', color: qty[m] ? '#fff' : DIM }}>{qty[m]}</span>
                    <button style={{ ...btn(), padding: '1px 6px' }} onClick={() => setQty({ ...qty, [m]: qty[m] + 1 })}>+</button>
                  </span>}
                </div>
              ))}
              <select value="" style={{ marginTop: 6, width: '100%' }} onChange={e => { const m = e.target.value as MaterialId; if (m) setQty({ ...qty, [m]: qty[m] + 1 }); }}>
                <option value="">Add to the order…</option>
                {MATERIAL_IDS.filter(m => MATERIALS[m].price !== null).map(m => <option key={m} value={m}>{MATERIALS[m].name} ({usd(MATERIALS[m].price!)} / {MATERIALS[m].unit})</option>)}
              </select>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {lines.length > 0 && <button style={btn(true)} disabled={!!problem} onClick={() => { if (g.order(lines)) setQty(emptyStock()); }}>
                  Order {usd(orderCost(lines, prices(game)))}{problem === 'cannot_afford' ? ' (too much)' : problem === 'no_deliveries' ? ' (no deliveries)' : ''}
                </button>}
                {needLines.length > 0 && <button style={btn()} disabled={!!orderProblem(game, needLines)} onClick={() => g.order(needLines)}>Order what the plans need ({usd(orderCost(needLines, prices(game)))})</button>}
              </div>
            </Section>
          </>}

          {rightTab === 'utilities' && (() => {
            const r = game.utilities.report, up = game.disaster.tracks.grid > 0.5;
            const gr = greenRicks(game), next = game.upkeep.green.length ? Math.max(0, Math.ceil(SEASON_DAYS - (game.clock.t - Math.min(...game.upkeep.green.map(x => x.at))))) : 0;
            const ch = chimneyState(game);
            return <>
              <Section title="Heat">
                <Row label="Firewood, seasoned" value={`${Math.floor(game.stock.firewood)} rick${Math.floor(game.stock.firewood) === 1 ? '' : 's'}`} />
                {gr > 0 && <Row label="Green, seasoning" value={`${Math.round(gr * 10) / 10} ricks · next ready in ${next} days`} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ color: DIM }}>Chimney: <span style={{ color: ch === 'dirty' ? TONE.bad : ch === 'building up' ? TONE.warn : TONE.good }}>{ch}</span></span>
                  {ch !== 'clean' && <button style={btn(ch === 'dirty')} title="Creosote builds up with every rick burned (green wood three times as fast); a dirty flue can catch fire" onClick={() => g.sweep()}>{game.disaster.tracks.stores >= 0.5 && game.disaster.tracks.banks >= 0.5 ? `Sweep it ($${SWEEP_USD})` : 'Sweep it ourselves'}</button>}
                </div>
                {game.stock.firewood < 1 && gr >= 1.5 && <Note tone="warn">Burning green wood: half again as much, and the flue fouls fast.</Note>}
              </Section>
              <Section title="Power (yesterday)">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span style={{ color: DIM }}>County grid</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {!game.utilities.grid ? 'off the grid' : up ? `${r.gridKwh.toFixed(1)} kWh · $${r.billUsd.toFixed(2)}` : <span style={{ color: TONE.bad }}>OUT</span>}
                    {(up || game.utilities.grid) && (game.site.improvements.power || game.utilities.grid) && <button style={btn()} title={game.utilities.grid ? 'Have the co-op pull the meter: no more bills, but only what you built runs the place' : 'Reconnect: $250'} onClick={() => g.setGrid(!game.utilities.grid)}>{game.utilities.grid ? 'Leave' : 'Rejoin'}</button>}
                  </span>
                </div>
                <Row label="Made / used" value={`${(r.solarKwh + r.genKwh).toFixed(1)} / ${r.drawKwh.toFixed(1)} kWh`} />
                <Row label="Batteries" value={`${Math.round(r.batteryPct * 100)} %`} />
                <Row label="Generator fuel" value={`${game.stock.fuel * FUEL_UNIT_L} L`} />
                {r.genKwh > 0.1 && <Note>The generator ran {Math.round(r.genKwh / 7 * 10) / 10} h: it carries about 1 km on a still night.</Note>}
                {r.shed.length > 0 && <Note tone="warn">Went without: {r.shed.map(id => KIT[game.structures.find(x => x.id === id)?.kind ?? '']?.name ?? '?').join(', ')}</Note>}
                {r.shortKwh > 0.5 && <Note tone="warn">Power ran short.</Note>}
              </Section>
              <Section title="Water (yesterday)">
                <Row label="In / used" value={`${Math.round(r.waterL)} / ${Math.round(r.useL)} L`} />
                <Row label="Stored" value={`${Math.round(r.storedL)} L`} />
                <Row label="Well depth here" value={`${game.site.gwDepth} m`} />
                {game.utilities.hauling && <Note tone="warn">{game.utilities.haulFar ? 'Hauling water a quarter mile from the creek on the neighbor\'s land: a well or cistern would end it.' : 'Hauling water from the creek by the bucket: a well or cistern would end it.'}</Note>}
                {r.shortL > 0 && <Note tone="bad">Water ran short.</Note>}
              </Section>
            </>;
          })()}

          {rightTab === 'land' && <>
            <Section title="The place">
              <Row label="Home place" value={`${game.site.acres} acres`} />
              <Row label="Region" value={REGIONS[game.site.region].name} />
              {(['power', 'drive'] as const).map(what => {
                const imp = game.site.improvements, have = what === 'power' ? imp.power : imp.drive, due = game.siteJobs[what];
                const q = what === 'power' ? powerQuote(imp) : driveQuote(imp), why = hookupProblem(game, what);
                const label = what === 'power' ? 'Power' : 'Drive';
                return have ? <Row key={what} label={label} value={what === 'power' ? 'On the grid' : 'Gravel'} />
                  : due !== null ? <Row key={what} label={label} value={`coming in ${Math.max(1, Math.ceil(due - game.clock.t))} days`} />
                  : <div key={what} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ color: DIM }}>{label}: <span style={{ color: TONE.warn }}>{what === 'power' ? `${imp.poleFt.toLocaleString('en-US')} ft to the pole` : `none (${imp.driveFt.toLocaleString('en-US')} ft)`}</span></span>
                      <button style={btn(!why)} disabled={!!why} title={why ?? (what === 'power' ? `The co-op runs the line ($${POLE_PER_FT}/ft + transformer), about ${Math.round(q.days / 7)} weeks` : `12 ft gravel and a culvert ($${DRIVE_PER_FT}/ft), about ${q.days} days`)} onClick={() => g.hookup(what)}>{usd(q.usd)}</button>
                    </div>;
              })}
              {(game.roadside ?? []).length > 0 && <Note tone="warn">{game.roadside.length} deliver{game.roadside.length > 1 ? 'ies' : 'y'} at the road: about {Math.round(game.roadside.reduce((a, r) => a + r.hours - r.done, 0))} h of carrying before building goes on.</Note>}
              {!game.site.improvements.power && !game.utilities.grid && <Note>No power at the place: run the line, or go solar or a generator.</Note>}
              {game.land.parcels.some(p => p.owner === 'you') && <Row label="Bought since" value={`${game.land.parcels.filter(p => p.owner === 'you').reduce((a, p) => a + acresOf(p.rect), 0)} acres`} />}
            </Section>
            <Section title="Paperwork">
              {countyWorks(game) ? <>
                <Row label="Property tax" value={`${usd(yearlyTax(game))}/yr`} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ color: DIM }}>Insurance: {game.paper.insured ? (premium(game) ? `${usd(premium(game))}/yr` : 'nothing to insure yet') : <span style={{ color: TONE.warn }}>none</span>}</span>
                  <button style={btn()} title={game.paper.insured ? 'Save the premium; a fire or a collapsed roof comes out of your pocket' : 'Buildings lost to fire or ash are paid out while the banks work'} onClick={() => g.setPaper('insured', !game.paper.insured)}>{game.paper.insured ? 'Drop' : 'Insure'}</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ color: DIM }}>Permits: {game.paper.permits ? 'pulled for new builds' : <span style={{ color: TONE.warn }}>building without</span>}</span>
                  <button style={btn()} title={game.paper.permits ? 'No fees or waits, but an inspector may notice: a fine, a stop-work order, the permit at double' : 'Fees and the county\'s review before work starts'} onClick={() => g.setPaper('permits', !game.paper.permits)}>{game.paper.permits ? 'Skip them' : 'Pull them'}</button>
                </div>
                {game.structures.some(x => x.permit === 'none' && !isFinished(x)) && <Note tone="warn">{game.structures.filter(x => x.permit === 'none' && !isFinished(x)).length} build{game.structures.filter(x => x.permit === 'none' && !isFinished(x)).length > 1 ? 's' : ''} going up without a permit.</Note>}
                {game.paper.fines > 0 && <Row label="Fines paid" value={usd(game.paper.fines)} />}
              </> : <Note>Nobody at the county now: no permits, no tax bills{game.paper.backTax > 0 ? ` (back taxes on the books: ${usd(game.paper.backTax)})` : ''}, and no insurer paying out.</Note>}
            </Section>
            <Section title="Land next door">
              {game.land.parcels.map(p => {
                const n = game.neighbors.find(x => x.id === p.owner), why = buyProblem(game, p);
                return <div key={p.id} style={{ padding: '4px 0', borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span>{p.name[4].toUpperCase() + p.name.slice(5)}</span>
                    {p.owner === 'you' ? <span style={{ color: TONE.good }}>yours</span>
                      : why === 'nobody sells land for cash now' ? <span style={{ color: DIM }}>no cash sales</span>
                      : <button style={btn(!why)} disabled={!!why} title={why ?? `Buy ${acresOf(p.rect)} acres`} onClick={() => g.buy(p.id)}>{usd(priceOf(game, p))}</button>}
                  </div>
                  <div style={{ fontSize: 11, color: DIM }}>{acresOf(p.rect)} acres of {LAND_NAME[p.kind]}{p.owner === 'you' ? '' : ` · ${n ? n.name : '?'}`}{p.forSale && p.owner !== 'you' ? <span style={{ color: TONE.warn }}> · for sale</span> : null}</div>
                </div>;
              })}
            </Section>
          </>}

          {rightTab === 'outside' && <>
            {game.disaster.mode === 'sandbox' && !game.disaster.kind && <FreeBuild />}
            {!(game.disaster.phase === 'warning' || (game.disaster.kind && game.clock.t >= game.disaster.warnAt)) && !(game.disaster.mode === 'sandbox' && !game.disaster.kind) && <Note>All quiet. Watch the news ticker, the prices and the neighbors.</Note>}
            {(game.disaster.phase === 'warning' || (game.disaster.kind && game.clock.t >= game.disaster.warnAt)) && (
              <Section title="Outside world">
                {game.disaster.tracks.deliveries <= 0.25 ? <Note tone="bad">No deliveries: the yard and the stores are shut</Note>
                  : prices(game) > 1.02 && <Note tone="warn">Prices up {Math.round((prices(game) - 1) * 100)} %</Note>}
                {isNuclear(game) && (() => {
                  const h = (game.clock.t - game.disaster.hitAt) * 24, rate = doseRate(game.disaster.variant, h) * 1000, [pf, where] = bestShelter(game);
                  return <>
                    <Row label="Outside" value={`${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} mSv/h`} tone={rate > 10 ? 'bad' : rate > 1 ? 'warn' : 'good'} />
                    {h < SHELTER_DAYS * 24 && <Row label="Sheltering" value={`${where} (PF ${Math.round(pf).toLocaleString('en-US')})`} />}
                    {h < SHELTER_DAYS * 24 && <Note>Out to work in {Math.ceil(SHELTER_DAYS - h / 24)} days (by then it's a hundredth of day one)</Note>}
                  </>;
                })()}
                {game.clock.t >= game.disaster.hitAt && TRACKS.map(k => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                    <span style={{ width: 110, color: DIM }}>{TRACK_NAME[k]}</span>
                    <div style={{ flex: 1, height: 5, background: '#333', borderRadius: 3 }}>
                      <div style={{ width: `${game.disaster.tracks[k] * 100}%`, height: '100%', borderRadius: 3, background: game.disaster.tracks[k] > 0.66 ? '#9cc070' : game.disaster.tracks[k] > 0.25 ? '#e0b050' : '#e06a50' }} />
                    </div>
                  </div>
                ))}
              </Section>
            )}
            {game.disaster.kind && game.clock.t >= game.disaster.warnAt && <Section title="Neighbors">
              {game.neighbors.map(n => (
                <Row key={n.id} title={NEIGHBOR_BLURB[n.kind]} label={<>{n.name[0].toUpperCase() + n.name.slice(1)}{n.radio ? ' · radio' : ''}</>}
                  value={n.status !== 'home' ? n.status : n.disposition > 50 ? 'allies' : n.disposition > 15 ? 'friendly' : n.disposition < -20 ? 'hostile' : 'wary'}
                  tone={n.disposition > 50 ? 'good' : n.disposition < -20 ? 'bad' : undefined} />))}
              {game.clock.t >= game.disaster.hitAt && <Note>Humanity {Math.round(game.gate.humanity)} · took in {game.gate.tookIn} · turned away {game.gate.turnedAway}</Note>}
            </Section>}
          </>}
        </div>
      </div>

      {/* Bottom right: cameras, building view */}
      <div style={{ ...panel, position: 'fixed', right: 10, bottom: 34, padding: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
        {VIEWS.map(([v, label, tip]) => <button key={v} title={tip} style={btn(w.buildingView === v)} onClick={() => w.setBuildingView(v)}>{label}</button>)}
        <button title="Underground: see-through ground, bunker rooms cut open (U)" style={btn(w.underground)} onClick={() => w.setUnderground(!w.underground)}>Underground</button>
        <span style={{ width: 1, height: 18, background: '#555', margin: '0 3px' }} />
        {CAMERAS.map(([m, label]) => <button key={m} style={btn(w.cameraMode === m)} onClick={() => w.setCameraMode(m)}>{label}</button>)}
      </div>
      {w.cameraMode !== 'diorama' && (
        <div style={{ ...panel, position: 'fixed', top: 54, left: '50%', transform: 'translateX(-50%)', fontSize: 12 }}>
          {w.cameraMode === 'walk' ? 'WASD to walk · drag or click to look · Shift to run · Esc to leave'
            : w.cameraMode === 'fly' ? 'WASD + Space / C to fly · wheel sets speed · Esc to leave'
            : 'Cinematic tour · Esc to leave'}
        </div>
      )}
      {w.tourCaption && (
        <div style={{ ...panel, position: 'fixed', left: '50%', bottom: 60, transform: 'translateX(-50%)', padding: '10px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{w.tourCaption.title}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{w.tourCaption.subtitle}</div>
        </div>
      )}

      {/* Bottom left: view (season / weather / quality / photo mode) */}
      <div style={{ ...panel, position: 'fixed', left: 10, bottom: 34, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 560 }}>
        <select value={w.seasonMode} onChange={e => w.setSeasonMode(e.target.value as SeasonMode)} title="Season look">
          {SEASON_MODES.map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={w.weatherMode} onChange={e => w.setWeatherMode(e.target.value as WeatherMode)} title="Weather">
          {WEATHER_MODES.map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={w.quality} onChange={e => w.setQuality(e.target.value as Quality)} title="Graphics quality">
          {QUALITIES.map(x => <option key={x}>{x}</option>)}
        </select>
        <span style={{ opacity: 0.7 }}>Sightlines</span>
        {SIGHTS.map(([m, label, tip]) => <button key={m} title={tip} style={btn(w.sightMode === m)} onClick={() => w.setSightMode(m)}>{label}</button>)}
        <button style={btn(w.photo)} onClick={() => w.setPhoto(!w.photo)}>Photo</button>
        {w.photo && <>
          <span>{clock(w.timeOfDay)}</span>
          <input type="range" min={0} max={24} step={0.05} value={w.timeOfDay} onChange={e => w.setTimeOfDay(+e.target.value)} />
          <span>{dateLabel(w.dayOfYear)}</span>
          <input type="range" min={1} max={365} step={1} value={w.dayOfYear} onChange={e => w.setDayOfYear(+e.target.value)} />
        </>}
      </div>
    </>
  );
}
