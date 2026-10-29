import { useEffect, useState } from 'react';
import { stormOutage } from '../sim/weatherThreats';
import { PersonInsight, PeopleSection, MedicalSection } from './PeoplePanel';
import { DailySection } from './SchedulePanel';
import { DAILY_TASK_TEXT } from './dailyText';
import { useWorldStore, type BuildingView, type CameraMode } from '../store/worldStore';
import { useGameStore } from '../store/gameStore';
import type { Quality } from '../engine/world/WorldScene';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import { WEATHER_MODES, type WeatherMode } from '../engine/world/weather/weatherState';
import { DogsPanel } from './DogsPanel';
import { KinPanel } from './KinPanel';
import { NewcomersPanel } from './NewcomersPanel';
import { originLabel } from '../sim/newcomers';
import { WeekenderPanel } from './WeekenderPanel';
import { isAbsent, whereIs, WHERE_TEXT } from '../sim/weekender';
import { kinTitle } from '../sim/kin';
import { calendarOf, dayIndex, hourOf, type Speed } from '../sim/state';
import { BACKGROUND_NAME, backgroundOf, fullName } from '../sim/family';
import { MATERIALS, MATERIAL_IDS, qtyText, type MaterialId } from '../sim/materials';
import { onOrder, orderCost, orderProblem, prices } from '../sim/economy';
import { holdReason, isFinished } from '../sim/construction';
import { REGIONS } from '../sim/regions';
import { keeping, KEPT } from '../sim/shelf';
import { CONDITION, pharmacyOpen } from '../sim/body';
import { netWorth } from '../sim/finance';
import { campNeed, trialCamps } from '../sim/trial';
import { JUG_L, orderTanker } from '../sim/water';
import { FleetPanel } from './FleetPanel';
import { buyLicense, hasLicense, inSeason, lawful, TAG_USD, type License } from '../sim/wildfood';
import { chimneyState, greenRicks, SEASON_DAYS, SWEEP_USD } from '../sim/upkeep';
import { countyWorks, premium, yearlyTax } from '../sim/paperwork';
import { DRIVE_PER_FT, driveQuote, hookupProblem, POLE_PER_FT, powerQuote } from '../sim/improvements';
import { KIT } from '../game/buildkit/kit';
import { FUEL_UNIT_L, irrigationStore, storageCapacity } from '../sim/utilities';
import { litersText } from '../sim/format';
import { needsHookup } from '../sim/hookups';
import { HousingPanel } from './HousingPanel';
import { bestShelter, doseRate, isNuclear, SHELTER_DAYS } from '../sim/nuclear';
import { DISASTERS, TRACKS, TRACK_NAME, type DisasterKind } from '../sim/disaster';
import { livingPerDay } from '../sim/engine';
import { roman } from '../sim/eras';
import { canRigMines, rigMines } from '../sim/battle';
import { canJoin } from '../sim/aftermath';
import { MILESTONE_COUNT, MILESTONE_NAME } from '../sim/lineage';
import { daysOfFood, KCAL, needOf } from '../sim/needs';
import { barterPrices, moneyWorks, type Good } from '../sim/barter';
import { MarketSection, NeighborsSection, ScavengeSection } from './WorldPanels';
import { alliesFor, canGo, FAR_COLD, isAway, latestFarLead, latestLead, LEAD_COLD, LEAD_WARM, leadAge, openCaptives, raidProblem, rescueOdds, tripFuel, tripProblem } from '../sim/rescue';
import { EXPOSURE_NAME, exposure, raidPressure, topExposure } from '../sim/opsec';
import { acresOf, buyProblem, LAND_NAME, priceOf } from '../sim/land';
import { runFinished } from '../sim/perimeter';
import { plansNeed, plansNeedLines } from '../sim/guidance';
import { populations, predatorLine } from '../sim/wildlife';
import { PantryPanel } from './PantryPanel';
import { FarmTab } from './FarmTab';
import { farmAlert } from '../sim/farmPlan';
import { fmtKw, powerSummary } from '../sim/powerReport';
import { ToolsPanel } from './ToolsPanel';
import { Note, Row, Section, Tabs } from './hud/common';
import { DIM, LINE, TONE, btn, panel, usd, type Tone } from './hud/style';
import { BuildMenu } from './hud/BuildMenu';
import { ProjectsTab } from './hud/ProjectsTab';
import { DefenseTab } from './hud/DefenseTab';
import { defenseTabAlert } from './hud/defenseAlert';

const QUALITIES: Quality[] = ['high', 'medium', 'low'];
const SIGHTS: Array<['off' | 'road' | 'ridge' | 'night' | 'viewshed', string, string]> = [
  ['off', 'Off', 'No sightline overlay'], ['road', 'Road', 'How exposed each spot is to people on the county road'], ['ridge', 'Ridge', 'Seen from the high ground to the west'],
  ['night', 'Night', 'Where your lit windows give you away after dark'], ['viewshed', 'View from…', 'Click a spot to see what can be seen from there (Shift-click: from a 10 m tower)']];
const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];
const VIEWS: Array<[BuildingView, string, string]> = [['full', 'Walls', 'Whole buildings'], ['cutaway', 'Cutaway', 'Walls cut at waist height, roof and loft off (V)'], ['xray', 'X-ray', 'See-through walls and roof (V)']];
const SPEEDS: Array<[Speed, string]> = [[0, '❚❚'], [1, '▶'], [2, '▶▶'], [3, '▶▶▶'], [4, '⏩']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const TASK_TEXT: Record<string, string> = { build: 'Building', forestry: 'In the woods', chores: 'Chores', sleep: 'Asleep', school: 'School', leisure: 'Free time', idle: 'Idle', job: 'At work in town', gone: 'Died', shelter: 'Sheltering', away: 'Away from the place', town: 'At the town house', ...DAILY_TASK_TEXT };

function dateLabel(doy: number): string {
  let m = 11;
  while (m > 0 && doy <= MONTH_START[m]) m--;
  return `${MONTHS[m]} ${doy - MONTH_START[m]}`;
}
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
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

/** The more urgent of two tab alerts. */
const worstTone = (a?: Tone, b?: Tone): Tone | undefined => (a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : a ?? b);

/** Game HUD. Hidden with ?clean (QA shots). */
export function Hud() {
  const w = useWorldStore();
  const g = useGameStore();
  const [leftTab, setLeftTab] = useState<'build' | 'projects' | 'log'>('build');
  const [rightTab, setRightTab] = useState<'family' | 'supplies' | 'utilities' | 'land' | 'defense' | 'outside' | 'chronicle'>(() => g.hudFocus?.right ?? 'family');
  // Supplies holds the stores and, as a sub-tab, the Farm (it used to be a tab of its own)
  const [suppliesTab, setSuppliesTab] = useState<'stores' | 'farm'>(() => g.hudFocus?.supplies ?? 'stores');
  // picking a building on the map opens its project card (not while a build tool is armed: placing a row of things keeps the Build list up)
  const [quitAsk, setQuitAsk] = useState<string | null>(null);
  const [lastSel, setLastSel] = useState<string | null>(null);
  if (g.selected !== lastSel) { setLastSel(g.selected); if (g.selected && !g.tool) setLeftTab('projects'); }
  // a link elsewhere asked for a panel (hudFocus is taken once)
  const { hudFocus, focusHud } = g;
  useEffect(() => {
    if (!hudFocus) return;
    setRightTab(hudFocus.right);
    if (hudFocus.supplies) setSuppliesTab(hudFocus.supplies);
    focusHud(null);
  }, [hudFocus, focusHud]);
  if (new URLSearchParams(location.search).has('clean')) return null;
  const game = g.game;
  const cal = calendarOf(game.clock);
  const pending = onOrder(game);
  // what the plans still lack beyond stock + orders (bought in the Shop, grouped by use)
  const need = plansNeed(game);
  const needLines = plansNeedLines(game);
  // a dot on a tab that wants attention
  const warned = !!game.disaster.kind && game.clock.t >= game.disaster.warnAt;
  const daysFood = daysOfFood(game);
  const foodAlert: Tone | undefined = !game.food.fromStores && game.food.ateKcal < game.food.needKcal * 0.95 ? 'bad' : warned && (game.food.fromStores ? daysFood < 180 : daysFood < 30) ? 'warn' : undefined;
  const utilAlert: Tone | undefined = game.utilities.report.shortL > 0 ? 'bad' : game.utilities.hauling || game.utilities.report.shortKwh > 0.5 ? 'warn' : undefined;
  const defenseAlert: Tone | undefined = defenseTabAlert(game);
  const outsideAlert: Tone | undefined = game.clock.t >= game.disaster.hitAt && game.disaster.kind ? 'bad' : warned ? 'warn' : undefined;
  // fight wounds heal only with meds, a medic (skill 3+) or the bunker's medical bay
  const treating = game.stock.meds >= 0.1 || game.people.some((q, j) => !q.kid && game.personState[j]?.needs.died == null && q.skills.medic >= 3) || game.structures.some(st => st.kind === 'bunker_medical' && isFinished(st));
  const familyAlert: Tone | undefined = game.personState.some(ps => ps.needs.died == null && (ps.needs.health < 40 || ps.needs.hurt.length > 0)) ? 'bad' : game.personState.some(ps => ps.needs.died == null && ps.needs.hunger > 5000) ? 'warn' : undefined;
  const projectsAlert: Tone | undefined = game.structures.some(st => !isFinished(st) && holdReason(game, st)) || needsHookup(game).length > 0 ? 'warn' : undefined;

  return (
    <>
      {/* Top bar: date, time, money, speed */}
      <div style={{ ...panel, position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13.5, whiteSpace: 'nowrap' }}>
        <span>{dateLabel(cal.doy)}, {cal.year}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(hourOf(game.clock.t))}</span>
        {game.lineage.era > 1 && <span style={{ color: '#d8c08a' }} title={`The ${game.lineage.family} family: era ${game.lineage.era}`}>Era {roman(game.lineage.era)}</span>}
        <span style={{ fontWeight: 600, color: '#cfe0a8' }} title={`Checking. Net worth ${usd(netWorth(game))}`}>{usd(game.money)}</span>
        {(game.fin.debt?.owed ?? 0) > 0.5 && <span style={{ fontWeight: 600, color: game.fin.debt!.stage === 'card' ? TONE.warn : TONE.bad }} title={game.disaster.tracks.banks < 0.5 ? 'The banks are gone: nobody is collecting' : `Owed on the card at 24 %${game.fin.debt!.lien ? ', with a judgment lien on the land' : ''} (Shop & money → Accounts)`}>owe {usd(game.fin.debt!.owed)}</span>}
        <button style={btn()} title="Town, the catalog, your accounts, gold and silver" onClick={() => g.openShop(true)}>Shop & money</button>
        <button style={btn()} title="New game" onClick={() => g.openSetup(true, true)}>New</button>
        <span style={{ display: 'flex', gap: 3 }}>
          {SPEEDS.map(([s, label]) => <button key={s} style={btn(game.clock.speed === s)} onClick={() => g.setSpeed(s)}>{label}</button>)}
        </span>
      </div>

      {/* Left: build menu (groups) · projects under way · the log */}
      <div style={{ ...panel, position: 'fixed', left: 10, top: 10, width: 244, maxHeight: 'calc(100vh - 140px)', display: w.hudHidden ? 'none' : 'flex', flexDirection: 'column' }}>
        <Tabs tabs={[['build', 'Build'], ['projects', 'Projects', projectsAlert], ['log', 'Log']]} value={leftTab} set={setLeftTab} />
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
          {leftTab === 'build' && <BuildMenu showProjects={() => setLeftTab('projects')} />}

          {leftTab === 'projects' && <ProjectsTab />}

          {leftTab === 'log' && game.log.slice(-14).reverse().map((e, i) => <div key={i} style={{ padding: '3px 0', borderBottom: `1px solid ${LINE}`, opacity: 1 - i * 0.04 }}>{e.text}</div>)}
        </div>
        {!g.tool && g.stakedNote && <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}><Note tone="good">{g.stakedNote}</Note></div>}
        {g.tool && <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}>
          <Note tone={g.toolProblem ? 'warn' : undefined}>{g.toolProblem ?? (g.tool === 'fell' ? 'Point at a tree · click marks or unmarks · Esc stops' : g.tool.startsWith('fence:') ? 'Click corners · Shift-click the line for a vehicle gate (Shift+Alt: a pedestrian gate) · Enter lays it out · Backspace undoes · Esc cancels' : 'Click to stake it out (Shift-click to keep going) · R rotates · Esc cancels')}</Note>
        </div>}
      </div>

      {/* Right: the family, supplies, water & power, land, the outside world */}
      <div style={{ ...panel, position: 'fixed', right: 10, top: 10, width: 320, maxHeight: 'calc(100vh - 90px)', display: w.hudHidden ? 'none' : 'flex', flexDirection: 'column' }}>
        <Tabs tabs={[['family', 'Family', familyAlert], ['supplies', 'Supplies', worstTone(foodAlert, farmAlert(game))], ['utilities', 'Utilities', utilAlert], ['land', 'Land'], ['defense', 'Defense', defenseAlert], ['outside', 'Outside', outsideAlert], ['chronicle', 'Years']]} value={rightTab} set={setRightTab} />
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
          {rightTab === 'family' && <>
            {game.people.map((p, i) => {
              const st = game.personState[i], n = st?.needs;
              if (n?.left) return null;   // moved away (sim/newcomers.ts): not on the roll, noted under Newcomers
              const bar = (v: number, c: string, t: string) => <div title={t} style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${Math.max(0, v)}%`, height: '100%', background: c, borderRadius: 2 }} /></div>;
              const notes = n && n.died == null ? [n.hunger > 5000 ? 'hungry' : '', ...n.hurt.map(h => h.med ? `${h.what} (${h.med.care})` : h.trauma ? `${h.what}: ${treating ? 'being treated' : 'needs dressings and antibiotics'}` : h.what), n.dose > 0.05 ? `${n.dose.toFixed(2)} Sv` : ''].filter(Boolean).join(', ') : '';
              return <div key={p.id} style={{ padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#' + p.shirt.toString(16).padStart(6, '0'), marginRight: 6 }} />{fullName(p)}, {p.age}{p.rel && <span style={{ color: DIM, fontSize: 11 }}> · {kinTitle(p, game.people)}</span>}{p.origin && <span style={{ color: DIM, fontSize: 11 }}> · {originLabel(game, p)}</span>}{backgroundOf(p) && <span style={{ color: '#c9b27a', fontSize: 11 }}> · {BACKGROUND_NAME[backgroundOf(p)!]}</span>}</span>
                  <span style={{ color: DIM }}>{n?.taken ? 'Taken' : n?.left ? 'Left' : n?.died != null ? 'Died' : isAbsent(game, p.id) ? WHERE_TEXT[whereIs(game, p.id) as 'work'] : TASK_TEXT[st?.task ?? 'idle']}</span>
                </div>
                {n && n.died == null && <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: DIM, width: 34 }}>health</span>{bar(n.health, n.health > 60 ? '#9cc070' : n.health > 30 ? '#e0b050' : '#e06a50', `Health ${Math.round(n.health)}`)}
                  <span style={{ color: DIM, width: 36 }}>morale</span>{bar(n.morale, '#7aa0d0', `Morale ${Math.round(n.morale)}`)}
                </div>}
                {notes && <Note tone="warn">{notes}</Note>}
                <PersonInsight p={p} />
                {n && n.died == null && (p.conditions?.length ?? 0) > 0 && (() => {
                  const days = Math.floor(game.body.rx[p.id] ?? 30);
                  return <div style={{ fontSize: 11, color: days < 14 ? TONE.bad : days < 45 ? TONE.warn : DIM, marginTop: 2 }}>{p.conditions!.map(c => CONDITION[c].name).join(', ')}: {days > 0 ? `${days} days of ${p.conditions!.map(c => CONDITION[c].rx).join(' and ')}` : 'out of medicine'}</div>;
                })()}
              </div>;
            })}
            <WeekenderPanel />
            <DogsPanel game={game} />
            <KinPanel />
            <NewcomersPanel />
            <HousingPanel />
            <PeopleSection />
            <MedicalSection />
            <DailySection />
            {trialCamps(game).map(c => <Section key={c.id} title={`Camp outside the wall: ${c.title}`}>
              <Row label="On trial" value={`day ${Math.max(0, dayIndex(game.clock.t) - c.from)} of ${c.until - c.from}`} />
              <Row label="People" value={c.people.map(p => `${p.first}${p.kid ? ` (${p.age})` : ''}`).join(', ')} />
              <Row label="Their ration" value={`${campNeed(c).toLocaleString('en-US')} kcal/day from your stores${c.hungry ? ` · short ${c.hungry} days` : ''}`} />
              <Row label="Work put in" value={`${Math.round(c.worked)} h`} />
              {c.learned.map((l, k) => <Note key={k} tone="warn">{l}</Note>)}
              {!c.learned.length && <div style={{ fontSize: 11, color: DIM }}>Not family yet. You'll know them better by the end of the month.</div>}
            </Section>)}
            {game.people.some(p => p.conditions?.length) && <Section title="Medicine & household">
              {pharmacyOpen(game) ? <button style={{ ...btn(), width: '100%' }} title="Fill everyone's prescriptions three months past the month in hand (as far ahead as insurance covers)" onClick={() => g.stockUpRx()}>Fill prescriptions 90 days ahead</button>
                : <Note tone="warn">The pharmacy is shut: what's on hand is all there is.</Note>}
              <Row label="Hygiene supplies" value={game.disaster.tracks.stores >= 0.5 ? `bought with groceries · ${Math.floor(game.stock.hygiene)} put by` : `${Math.floor(game.stock.hygiene)} person-months left`} />
            </Section>}
            <Section title="Work and money">
              {game.disaster.tracks.banks > 0.5 && game.disaster.tracks.stores > 0.5 && <Row label="Household costs" value={`$${livingPerDay(game)}/day`} />}
              {game.people.filter((p, i) => p.job && !game.personState[i]?.needs.left).map(p => {
                const st = game.personState.find(x => x.id === p.id);
                const over = game.disaster.phase === 'impact' || game.disaster.phase === 'survival' || game.disaster.phase === 'over';
                return <div key={'job' + p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span><span style={{ color: DIM }}>{p.first}:</span> {over ? <s>{p.job!.title}</s> : st?.employed ? `${p.job!.title}, $${p.job!.wage}/day` : 'quit the job'}</span>
                  {!over && (st?.employed && quitAsk === p.id
                    ? <span style={{ display: 'flex', gap: 4 }}>
                        <button style={btn(true)} title={`Gives up $${p.job!.wage}/day; ${p.first} builds five more days a week`} onClick={() => { g.setEmployed(p.id, false); setQuitAsk(null); }}>Yes, quit</button>
                        <button style={btn()} onClick={() => setQuitAsk(null)}>Keep it</button>
                      </span>
                    : <button style={btn()} title={st?.employed ? `Quitting gives up $${p.job!.wage}/day but puts ${p.first} on the site five more days a week` : undefined} onClick={() => st?.employed ? setQuitAsk(p.id) : g.setEmployed(p.id, true)}>{st?.employed ? 'Quit' : 'Go back'}</button>)}
                </div>;
              })}
            </Section>
          </>}

          {rightTab === 'supplies' && <>
            <Tabs tabs={[['stores', 'Stores', foodAlert], ['farm', 'Farm', farmAlert(game)]]} value={suppliesTab} set={setSuppliesTab} />
            {suppliesTab === 'farm' && <FarmTab game={game} />}
            {suppliesTab === 'stores' && <>
            <PantryPanel game={game} />
            <ToolsPanel game={game} />
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
            <Section title="Hunting & fishing">
              {(['big', 'small', 'fish'] as const).map(c => <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0' }}>
                <span style={{ color: DIM, width: 96 }}>{cap(c === 'big' ? REGIONS[game.site.region].game.filter(x => ['elk', 'deer', 'moose', 'antelope', 'javelina'].includes(x)).slice(0, 2).join(', ') || 'Big game' : c === 'small' ? 'Rabbits, grouse' : REGIONS[game.site.region].game.filter(x => ['trout', 'bass', 'catfish', 'salmon', 'panfish'].includes(x)).slice(0, 2).join(', ') || 'Fish')}</span>
                <div style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${game.wild.abundance[c] * 100}%`, height: '100%', background: game.wild.abundance[c] < 0.4 ? TONE.bad : '#9cc070', borderRadius: 2 }} /></div>
              </div>)}
              {lawful(game) ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {(['deer', 'elk', 'small', 'fishing'] as License[]).filter(l => l !== 'elk' || REGIONS[game.site.region].game.includes('elk')).map(l => hasLicense(game, l)
                  ? <span key={l} style={{ fontSize: 11, color: TONE.good, padding: '2px 6px' }}>✓ {l === 'fishing' ? 'fishing' : l === 'small' ? 'small game' : `${l} tag`}</span>
                  : <button key={l} style={btn()} title={inSeason(game, l) ? 'In season now' : 'Out of season now'} onClick={() => g.money(d => buyLicense(d, l))}>{l === 'fishing' ? 'Fishing license' : l === 'small' ? 'Small game' : `${l[0].toUpperCase() + l.slice(1)} tag`} ${TAG_USD[l]}</button>)}
              </div> : <Note>No seasons, no wardens now. Everyone is hunting: the game is thinning out.</Note>}
              {game.wild.hotUntil >= Math.floor(game.clock.t) && <Note tone="bad">Fallout: game and fish read hot for months.</Note>}
              {game.stock.fishing_gear < 1 && game.site.creek && <Note>A creek full of {REGIONS[game.site.region].game.find(x => ['trout', 'bass', 'catfish', 'salmon', 'panfish'].includes(x)) ?? 'fish'}, and no fishing gear.</Note>}
            </Section>
            <Section title="Wildlife on the land">
              {populations(game).map(p => <Row key={p.sp} label={p.name} value={<span style={{ color: p.predator ? (p.count ? TONE.warn : DIM) : p.count < p.cap * 0.5 ? TONE.warn : undefined }}>{p.count} <span style={{ color: DIM }}>of ~{p.cap < 1 ? '<1' : Math.round(p.cap)}</span></span>} title={p.predator ? 'A predator: a danger to stock, dogs and kids if the place is careless; kept out by a wall that holds it; a good shot fills the freezer' : 'Counts follow the acres you own, the timber, open ground and water, and what has been hunted'} />)}
              <Note tone={predatorLine(game).ok ? 'good' : 'warn'}>Predators: {predatorLine(game).detail}</Note>
            </Section>
            <Section title="Food">
              {(() => {
                const f = game.food, d = daysOfFood(game);
                const warned = !!game.disaster.kind && game.clock.t >= game.disaster.warnAt;
                const short = warned && (f.fromStores ? d < 180 : d < 30);
                const perDay = game.people.reduce((a, p, i) => a + (game.personState[i]?.needs.died == null ? needOf(p) : 0), 0);
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
              {MATERIAL_IDS.filter(m => game.stock[m] > 0 || (pending[m] ?? 0) > 0 || (need[m] ?? 0) > 0).length === 0 && <Note>Empty. Buy materials in the Shop, or fell timber.</Note>}
              {MATERIAL_IDS.filter(m => game.stock[m] > 0 || (pending[m] ?? 0) > 0 || (need[m] ?? 0) > 0).map(m => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, padding: '1px 0' }}>
                  <span style={{ color: DIM, flex: 1 }}>{MATERIALS[m].name}</span>
                  {(need[m] ?? 0) > 0 && <span style={{ fontSize: 10.5, color: TONE.warn, border: `1px solid ${TONE.warn}`, borderRadius: 8, padding: '0 5px' }} title="The plans need more of this than you have or have on order">needs {qtyText(need[m]!)} more</span>}
                  <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{Math.floor(game.stock[m] + 1e-6)}{pending[m] ? <span style={{ color: DIM }}> +{pending[m]}</span> : null}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {needLines.length > 0
                  ? <button style={btn(true)} disabled={!!orderProblem(game, needLines)} title="Everything the plans still lack, in one order" onClick={() => g.order(needLines)}>Order what the plans need ({usd(orderCost(needLines, prices(game)))})</button>
                  : <Note>{game.structures.some(s => !isFinished(s)) || game.perimeter.some(r => !runFinished(r)) ? 'The plans have all they need.' : 'Nothing planned that needs materials.'}</Note>}
                <button style={btn()} title="Everything else is bought here, grouped by use: building, fencing, water, power, food, and so on" onClick={() => g.openShop(true)}>Buy materials in the Shop…</button>
              </div>
            </Section>
            </>}
          </>}

          {rightTab === 'utilities' && (() => {
            const r = game.utilities.report, up = game.disaster.tracks.grid > 0.5 && !stormOutage(game);
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
                {(() => { const pw = powerSummary(game); return <>
                  {(pw.solarKw > 0 || pw.batteryKwh > 0) && <Row label="Installed" value={`${pw.solarKw > 0 ? `${fmtKw(pw.solarKw)} kW solar` : 'no solar'}${pw.batteryKwh > 0 ? ` · ${Math.round(pw.batteryKwh)} kWh batteries` : ''}`} title="Nameplate: panels in kW (a 20 kW farm is 50 panels), batteries in kWh" />}
                  <Row label="Made / used" value={`${fmtKw(pw.madeKwh)} / ${fmtKw(pw.usedKwh)} kWh`} />
                  <Row label="Batteries" value={pw.batteryKwh > 0 ? `${Math.round(pw.storedKwh)} of ${Math.round(pw.batteryKwh)} kWh (${pw.batteryPct} %)` : 'none'} tone={pw.batteryKwh > 0 && pw.madeKwh > 0 && pw.storedKwh < 0.5 ? 'warn' : undefined} />
                  {pw.exportKwh >= 0.5 && <Row label="Sold to the grid" value={`${fmtKw(pw.exportKwh)} kWh · $${pw.creditUsd.toFixed(2)}`} title="Surplus solar sent back to the co-op while the grid is up (net metering, 5 cents a kWh)" />}
                  {pw.wastedKwh >= 1 && <Row label="Made, not stored" value={`${fmtKw(pw.wastedKwh)} kWh`} tone="warn" title="Power the sun made yesterday that nobody used and no battery took" />}
                  {pw.headline && <Note tone="warn">{pw.headline}</Note>}
                </>; })()}
                <Row label="Generator fuel" value={litersText(game.stock.fuel * FUEL_UNIT_L)} />
                {r.genKwh > 0.1 && <Note>The generator ran {Math.round(r.genKwh / 7 * 10) / 10} h: it carries about 1 km on a still night.</Note>}
                {r.shed.length > 0 && <Note tone="warn">Went without: {r.shed.map(id => KIT[game.structures.find(x => x.id === id)?.kind ?? '']?.name ?? '?').join(', ')}</Note>}
                {r.shortKwh > 0.5 && <Note tone="warn">Power ran short.</Note>}
              </Section>
              <Section title="Water (yesterday)">
                <Row label="In / used" value={`${Math.round(r.waterL)} / ${Math.round(r.useL)} L`} />
                <Row label="Stored" value={`${Math.round(r.storedL)} of ${storageCapacity(game).toLocaleString('en-US')} L`} />
                {irrigationStore(game).cap > 0 && <Row label="Pond (garden, fire)" value={`${Math.round(irrigationStore(game).have).toLocaleString('en-US')} of ${irrigationStore(game).cap.toLocaleString('en-US')} L`} title="Pond water waters the garden and fills the fire line; it is not drinking water. A reservoir counts as drinking water once the filtration shed or a filter is on the place." />}
                {game.stock.water_jugs >= 1 && <Row label="Drinking water put by" value={`${Math.floor(game.stock.water_jugs)} jugs (${Math.round(game.stock.water_jugs * JUG_L)} L)`} />}
                {storageCapacity(game) - r.storedL > 1000 && game.disaster.tracks.deliveries >= 0.5 && game.disaster.tracks.banks >= 0.5 && <button style={{ ...btn(), width: '100%', marginTop: 3 }} title="A tanker load from town: 15,000 L" onClick={() => g.money(d => orderTanker(d, storageCapacity(d)))}>Order a tanker load ($450)</button>}
                <Row label="Well depth here" value={`${game.site.gwDepth} m`} />
                {game.utilities.hauling && <Note tone="warn">{game.utilities.haulFar ? 'Hauling water a quarter mile from the creek on the neighbor\'s land: a well or cistern would end it.' : 'Hauling water from the creek by the bucket: a well or cistern would end it.'}</Note>}
                {r.shortL > 0 && <Note tone="bad">Water ran short.</Note>}
                {game.utilities.hauling && game.stock.water_filter < 0.01 && <Note tone="warn">{game.stock.firewood >= 0.05 ? 'Boiling the creek water (firewood): a filter would save the wood.' : 'Drinking the creek water untreated: giardia. Get a filter or boil it.'}</Note>}
                {game.site.gwQuality === 'arsenic' && game.stock.ro_system < 1 && <Note tone="warn">Arsenic in the well water: get reverse osmosis for drinking water.</Note>}
                {game.site.gwQuality === 'hard' && game.stock.softener < 1 && <Note>Hard water: scale wears the pump faster without a softener.</Note>}
              </Section>
              <FleetPanel />
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

          {rightTab === 'chronicle' && <Chronicle />}

          {rightTab === 'defense' && <DefenseTab />}

          {rightTab === 'outside' && <>
            <TakenSection />
            <ScavengeSection />
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
            {(game.gate.prisoners?.length ?? 0) > 0 && <Section title="Prisoners">
              {game.gate.prisoners!.map(p => (
                <div key={p.id} style={{ marginBottom: 6 }}>
                  <Row label={p.name} value={`${Math.floor(game.clock.t) - p.since} days`} title={`Wound ${Math.round(p.sev)} · trust ${Math.round(p.trust)}${p.talked ? ' · has talked' : ''}`} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => g.releasePrisoner(p.id)}>Let him go</button>
                    <button style={{ ...btn(), flex: 1, opacity: canJoin(game, p) ? 1 : 0.4 }} disabled={!canJoin(game, p)} title="After a month, healed, and once he trusts you (70+)" onClick={() => g.joinPrisoner(p.id)}>Let him join</button>
                  </div>
                </div>
              ))}
              <Note>Each eats about 2,200 kcal a day. Fewer adults to watch them, likelier they slip away.</Note>
            </Section>}
            {canRigMines(game) && <Section title="Mines">
              <Row label="Rigged on the approaches" value={Math.floor(game.stock.mines ?? 0)} title="They go off as raiders cross the band outside the line" />
              <button style={{ ...btn(), width: '100%' }} title="Four buried charges on pressure switches, from a hardware kit and a can of fuel" onClick={() => { const why = g.money(d => rigMines(d)); if (why) alert(why); }}>Rig 4 mines (1 hardware kit, 1 can of fuel)</button>
              <Note tone="warn">Anyone can step on them: neighbors, people coming to the gate for help, your own kids.</Note>
            </Section>}
            {(() => {
              const ex = exposure(game), o = game.opsec ?? { quietDeliveries: false, blackout: false };
              return <Section title="OPSEC">
                <Row label="Exposure" value={`${ex} / 100 · raids ×${raidPressure(game).toFixed(2)}`} tone={ex > 60 ? 'bad' : ex > 30 ? 'warn' : 'good'} title="How much the county knows you're prepared" />
                {topExposure(game).map(([k, v]) => <Row key={k} label={EXPOSURE_NAME[k]} value={`+${Math.round(v)}`} />)}
                <div style={{ display: 'flex', gap: 4, padding: '2px 0', flexWrap: 'wrap' }}>
                  <button style={btn(o.quietDeliveries)} title="Pick deliveries up in town: fewer people see the truck" onClick={() => g.setOpsec('quietDeliveries', !o.quietDeliveries)}>Pick up in town</button>
                </div>
              </Section>;
            })()}
            {game.disaster.kind && game.clock.t >= game.disaster.warnAt && <NeighborsSection />}
            <MarketSection />
            {game.clock.t >= game.disaster.hitAt && !moneyWorks(game) && (() => {
              const p = barterPrices(game);
              const rows: Array<[string, Good]> = [['Canned food (case)', 'canned'], ['Staples (25 kg)', 'staples'], ['Fuel (20 L)', 'fuel'], ['Meds (kit)', 'meds'], ['Firewood (rick)', 'firewood'], ['Seed (season)', 'seed'], ['Hygiene (month)', 'hygiene'], ['Silver coin', 'metal:silver_coin'], ['A day\'s labor', 'labor']];
              return <Section title="Trade with neighbors">
                <Note>Money is gone; goods change hands at what they're worth now (2025 dollars-equivalent). Friendly neighbors (allies) trade at par.</Note>
                {rows.map(([label, k]) => <Row key={k} label={label} value={`$${Math.round(p[k]).toLocaleString('en-US')}`} />)}
              </Section>;
            })()}
          </>}
        </div>
      </div>

      {/* the tool hint stays up while the panels are hidden */}
      {w.hudHidden && g.tool && <div style={{ ...panel, position: 'fixed', left: 10, top: 10, maxWidth: 300, fontSize: 12 }}>{g.toolProblem ?? (g.tool === 'fell' ? 'Point at a tree · click marks or unmarks · Esc stops' : 'Click to place · R rotates · Esc cancels')}</div>}

      {/* Bottom right: cameras, building view */}
      <div style={{ ...panel, position: 'fixed', right: 10, bottom: 34, padding: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
        {VIEWS.map(([v, label, tip]) => <button key={v} title={tip} style={btn(w.buildingView === v)} onClick={() => w.setBuildingView(v)}>{label}</button>)}
        <button title="Underground: see-through ground, bunker rooms cut open (U). It switches itself off when you put the bunker tool down." style={btn(w.underground)} onClick={() => w.setUnderground(!w.underground)}>Underground</button>
        <button title="Hide or show the side panels to see the whole map (H)" style={btn(w.hudHidden)} onClick={() => w.setHudHidden(!w.hudHidden)}>{w.hudHidden ? 'Show panels' : 'Hide panels'} (H)</button>
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
        <select value={w.quality} onChange={e => w.setQuality(e.target.value as Quality, true)} title="Graphics quality">
          {QUALITIES.map(x => <option key={x}>{x}</option>)}
        </select>
        <span style={{ opacity: 0.7 }}>Sightlines</span>
        {SIGHTS.map(([m, label, tip]) => <button key={m} title={tip} style={btn(w.sightMode === m)} onClick={() => w.setSightMode(m)}>{label}</button>)}
        <button style={btn(w.showBoundary)} title="Draw the property line on the ground (it also shows while you draw a fence or wall)" onClick={() => w.setShowBoundary(!w.showBoundary)}>Boundary</button>
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

const SOURCE_NAME = { radio: 'Radio', neighbor: 'Neighbor', trader: 'Trader', prisoner: 'Prisoner' } as const;
const KNOWN_TEXT = { nothing: 'no word yet', alive: 'seen alive', traded: 'traded on, down the road', dead: 'word is they\'re dead' } as const;

/** The taken: what the family has heard, and what they can do (sim/rescue.ts). */
function TakenSection() {
  const g = useGameStore();
  const game = g.game;
  const [team, setTeam] = useState<Record<string, string[]>>({});
  const [odds, setOdds] = useState<Record<string, number>>({});
  const [askAllies, setAskAllies] = useState(false);
  const allies = alliesFor(game);
  const allyN = allies.reduce((a, x) => a + x.n, 0);
  const open = openCaptives(game);
  const raid = game.rescue?.raid;
  const recent = (game.rescue?.captives ?? []).filter(c => c.closed && dayIndex(game.clock.t) - (c.closedDay ?? 0) < 14);
  if (!open.length && !recent.length && !raid) return null;
  const day = dayIndex(game.clock.t);
  const name = (id: string) => game.people.find(p => p.id === id)?.first ?? '?';
  return <Section title="Taken">
    {raid && <div style={{ marginBottom: 6 }}>
      <Note tone="warn">{raid.team.map(name).join(', ')} {raid.resolved ? 'on the way home' : raid.kind === 'trip' ? `on the road after ${name(raid.captive)}` : `gone after ${name(raid.captive)}`}{raid.allies?.length ? ', with the neighbors\' men' : ''}: back about day {raid.backDay - day <= 0 ? 'today' : `+${raid.backDay - day}`}. The place is held by {game.people.filter((p, i) => game.personState[i]?.needs.died == null && !raid.team.includes(p.id) && (!p.kid || p.age >= 15)).length} who can shoot.</Note>
    </div>}
    {open.map(c => {
      const child = game.people.find(p => p.id === c.pid);
      if (!child) return null;
      const lead = latestLead(c), age = lead ? leadAge(game, lead) : 0;
      const pickd = team[c.pid] ?? [];
      const can = game.people.filter(p => canGo(game, p));
      const why = raidProblem(game, c.pid, pickd);
      const staying = game.people.filter((p, i) => game.personState[i]?.needs.died == null && !pickd.includes(p.id) && !isAway(game, p.id));
      const out = raid?.captive === c.pid;
      return <div key={c.pid} style={{ marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${LINE}` }}>
        <Row label={<b style={{ color: '#eee' }}>{fullName(child)}, {child.age}</b>} value={`${day - c.day} days`} tone="bad" />
        <Note>Taken by {c.crew} · {KNOWN_TEXT[c.known]}</Note>
        {c.leads.slice(-3).reverse().map((l, i) => {
          const a = leadAge(game, l);
          return <div key={i} style={{ fontSize: 11.5, margin: '3px 0', opacity: i ? 0.6 : 1 }}>
            {l.far ? <><span style={{ color: a <= FAR_COLD ? TONE.warn : DIM }}>Far rumor, {a === 0 ? 'today' : `${a} days ago`}{a > FAR_COLD ? ' · cold' : ''}:</span> {l.where}, {l.km} km</>
              : <><span style={{ color: a <= LEAD_WARM ? TONE.good : a <= LEAD_COLD ? TONE.warn : DIM }}>{SOURCE_NAME[l.source]}, {a === 0 ? 'today' : `${a} days ago`}{a > LEAD_COLD ? ' · cold' : a > LEAD_WARM ? ' · cooling' : ''}:</span> {l.where}, {l.km} km · {l.count} of them{l.seenAlive ? ' · seen alive' : ''}</>}
          </div>;
        })}
        {!c.leads.length && <Note>No lead yet. A radio, the neighbors, a prisoner who talks: someone may hear something.</Note>}
        {!out && c.known !== 'traded' && <>
          {lead && age <= LEAD_COLD && <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11.5, color: DIM, marginBottom: 2 }}>Who goes to {lead.where}:</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {can.map(p => <button key={p.id} style={btn(pickd.includes(p.id))} title={`Health ${Math.round(game.personState.find(x => x.id === p.id)?.needs.health ?? 0)}`} onClick={() => { setTeam({ ...team, [c.pid]: pickd.includes(p.id) ? pickd.filter(x => x !== p.id) : [...pickd, p.id] }); setOdds({ ...odds, [c.pid]: -1 }); }}>{p.first}</button>)}
              {!can.length && <Note tone="warn">Nobody is fit to go.</Note>}
            </div>
            {allyN > 0 && <button style={{ ...btn(askAllies), width: '100%', marginTop: 4 }} title="Neighbors on the radio net who like you. Their men can be hurt or killed, and they'll hold it against you if it goes badly." onClick={() => { setAskAllies(!askAllies); setOdds({ ...odds, [c.pid]: -1 }); }}>{askAllies ? '✓ ' : ''}Ask the neighbors: {allies.map(a => `${a.name} (${a.n})`).join(', ')}</button>}
            {pickd.length > 0 && <Note tone="warn">Staying: {staying.map(p => p.first).join(', ') || 'nobody'} ({staying.filter(p => !p.kid || p.age >= 15).length} who can shoot). The place is lightly held for {lead.km > 25 ? 'four' : 'two'} days.</Note>}
            {pickd.length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              <button style={{ ...btn(), flex: 1 }} title="A guess from what the lead says: how many, and who you send" onClick={() => setOdds({ ...odds, [c.pid]: rescueOdds(game, c.pid, pickd, 40, askAllies) })}>{(odds[c.pid] ?? -1) >= 0 ? `Odds: about ${Math.round(odds[c.pid] * 10)} in 10` : 'Weigh the odds'}</button>
              <button style={{ ...btn(true), flex: 1, opacity: why ? 0.4 : 1 }} disabled={!!why} title={why ?? `They go tonight and hit the camp before dawn`} onClick={() => { const w = g.rescue(c.pid, pickd, askAllies); if (w) alert(w); else setTeam({ ...team, [c.pid]: [] }); }}>Go get {child.body === 'f' ? 'her' : 'him'}</button>
            </div>}
          </div>}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button style={{ ...btn(), flex: 1, opacity: lead && age <= LEAD_COLD && c.offerDue == null ? 1 : 0.4 }} title={c.offerDue != null ? 'Word has gone out: waiting for an answer' : 'Send word through whoever gave the lead that you will pay. Some crews answer.'} onClick={() => { const w = g.askRansom(c.pid); if (w) alert(w); }}>{c.offerDue != null ? 'Waiting for an answer' : 'Offer to pay'}</button>
            <button style={{ ...btn(), flex: 1 }} title="Stop looking. The family has to keep the others alive." onClick={() => { if (confirm(`Stop looking for ${child.first}?`)) { const w = g.giveUp(c.pid); if (w) alert(w); } }}>Give up</button>
          </div>
        </>}
        {!out && c.known === 'traded' && (() => {
          const fl = latestFarLead(c), warm = fl && leadAge(game, fl) <= FAR_COLD;
          const fuel = fl ? tripFuel(game, fl.km) : null, tw = tripProblem(game, c.pid, pickd);
          return <div style={{ marginTop: 4 }}>
            {!warm && <Note>Traded on, far off. Now and then a rumor comes over the radio, months apart.</Note>}
            {warm && fl && fuel && <>
              <div style={{ fontSize: 11.5, color: DIM, marginBottom: 2 }}>Drive to {fl.where} ({fl.km} km, {fuel.liters} L of fuel there and back, {2 * Math.ceil(fl.km / 150)} days{fuel.truck ? '' : ', no running truck'}). Who goes (up to 3):</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {can.map(p => <button key={p.id} style={btn(pickd.includes(p.id))} onClick={() => setTeam({ ...team, [c.pid]: pickd.includes(p.id) ? pickd.filter(x => x !== p.id) : [...pickd, p.id] })}>{p.first}</button>)}
              </div>
              {pickd.length > 0 && <Note tone="warn">Staying: {staying.map(p => p.first).join(', ') || 'nobody'}. A long shot: the rumor may be wrong, or they may be moved on.</Note>}
              <button style={{ ...btn(true), width: '100%', marginTop: 3, opacity: tw ? 0.4 : 1 }} disabled={!!tw} title={tw ?? 'Take the truck and the trade goods'} onClick={() => { const w = g.trip(c.pid, pickd); if (w) alert(w); else setTeam({ ...team, [c.pid]: [] }); }}>Take the truck</button>
            </>}
            <button style={{ ...btn(), width: '100%', marginTop: 4 }} onClick={() => { if (confirm(`Stop looking for ${child.first}?`)) g.giveUp(c.pid); }}>Give up</button>
          </div>;
        })()}
      </div>;
    })}
    {recent.map(c => <Note key={c.pid} tone={c.closed === 'home' ? 'good' : undefined}>{name(c.pid)}: {c.closed === 'home' ? 'home again' : c.closed === 'dead' ? 'gone' : 'no longer looking'}</Note>)}
  </Section>;
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const KIND_MARK: Record<string, string> = { era: '◆', birth: '✦', death: '✝', partner: '♥', coming: '▲', milestone: '★', retire: '·', home: '⌂' };

/** The long game: the family over the years, the eras, milestones and the dynasty score. */
function Chronicle() {
  const game = useGameStore(s => s.game);
  const L = game.lineage;
  const years = Math.floor(game.clock.t / 365);
  const living = game.people.filter((_, i) => game.personState[i]?.needs.died == null);
  const gens = new Set(living.filter(p => p.kin).map(p => p.gen ?? 1)).size;
  const born = game.people.filter(p => p.bornHere).length;
  const d = game.disaster;
  const now = L.settling ? 'the world settling' : d.kind && game.clock.t >= d.hitAt ? 'living through it' : d.kind && game.clock.t >= d.warnAt ? 'warning signs' : 'quiet';
  return <>
    <Section title={`The ${L.family} family`}>
      <Row label="On the place" value={years < 1 ? 'the first year' : `${years} year${years === 1 ? '' : 's'}`} />
      <Row label="Era" value={`${roman(L.era)} · ${now}`} />
      <Row label="Living here" value={`${living.length} · ${gens} generation${gens === 1 ? '' : 's'}`} />
      {born > 0 && <Row label="Born on the place" value={born} />}
      <Row label="Dynasty score" value={Math.round(L.points).toLocaleString('en-US')} title="A point for each person-year on the place, each era's grade, 25 for each child, and the milestones" />
    </Section>
    {L.eras.length > 0 && <Section title="Eras">
      {L.eras.map(e => <div key={e.n} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
        <span><span style={{ color: DIM }}>{roman(e.n)}</span> {e.name}</span>
        <span style={{ color: e.grade <= 'B' ? TONE.good : e.grade <= 'C' ? TONE.warn : TONE.bad }}>{e.grade} · {e.fate === 'full' ? 'came back' : e.fate === 'partial' ? 'thinner' : 'never back'}</span>
      </div>)}
    </Section>}
    <Section title={`Milestones ${L.milestones.length}/${MILESTONE_COUNT}`}>
      {L.milestones.length ? L.milestones.map(m => <div key={m} style={{ padding: '1px 0' }}><span style={{ color: '#d8c08a' }}>★</span> {MILESTONE_NAME[m]}</div>) : <Note>None yet. Get through the first winter.</Note>}
    </Section>
    <Section title="Chronicle">
      {L.chronicle.length === 0 && <Note>Births, deaths, weddings, the eras: it all goes here.</Note>}
      {L.chronicle.slice(-40).reverse().map((e, i) => <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: `1px solid ${LINE}` }}>
        <span style={{ color: DIM, width: 32, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{e.year}</span>
        <span style={{ color: e.kind === 'death' ? '#b8a8a0' : e.kind === 'era' ? '#d8c08a' : undefined }}>{KIND_MARK[e.kind]} {e.text}</span>
      </div>)}
    </Section>
  </>;
}
