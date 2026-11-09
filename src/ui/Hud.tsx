import { MAX_QUESTIONS, QUESTIONS, QUESTION_NAME, type Question } from '../sim/interrogation';
import { flowLine } from '../sim/flow';
import { PlansOrderButton } from './hud/SpendConfirm';
import { useEffect, useRef, useState } from 'react';
import { EDGE, hudLayout, useBox } from './hudLayout';
import { unscripted } from '../sim/godMode';
import { TERRAIN_LEGEND, type TerrainMode } from '../game/terrain/TerrainOverlay';
import { stormOutage } from '../sim/weatherThreats';
import { fogLineFor } from '../sim/fogFx';
import { PersonInsight, PeopleSection, MedicalSection, ClassesSection } from './PeoplePanel';
import { DailySection } from './SchedulePanel';
import { DAILY_TASK_TEXT } from './dailyText';
import { useWorldStore, type BuildingView, type CameraMode, type FrameCap } from '../store/worldStore';
import { useGameStore } from '../store/gameStore';
import type { Quality } from '../engine/world/WorldScene';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import { WEATHER_MODES, type WeatherMode } from '../engine/world/weather/weatherState';
import { DogsPanel } from './DogsPanel';
import { CompoundBoardPanel } from './CompoundBoard';
import { WaveChip } from './WaveClock';
import { CollapseChip } from './CollapseChip';
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
import { CONDITION, pharmacyOpen, rxDaysOf } from '../sim/body';
import { netWorth } from '../sim/finance';
import { campNeed, trialCamps } from '../sim/trial';
import { JUG_L, orderTanker } from '../sim/water';
import { FleetPanel } from './FleetPanel';
import { buyLicense, hasLicense, inSeason, lawful, TAG_USD, type License } from '../sim/wildfood';
import { chimneyState, greenRicks, SEASON_DAYS, SWEEP_USD } from '../sim/upkeep';
import { countyWorks, premium, yearlyTax } from '../sim/paperwork';
import { altitudeClimate } from '../sim/climate';
import { LOT_NAME } from '../sim/lots';
import { roadClosedFor, winterRoadLine } from '../sim/slope';
import { roadLine } from '../sim/roadFx';
import { crossingLine } from '../sim/roadWildlife';
import { roadPlanOf } from '../sim/roadState';
import { SaveMenu } from './SaveMenu';
import { EntranceCard } from './hud/EntranceCard';
import { PlowNote } from './hud/PlowNote';
import { DRIVE_PER_FT, driveQuote, hookupProblem, POLE_PER_FT, powerQuote } from '../sim/improvements';
import { KIT } from '../game/buildkit/kit';
import { FUEL_UNIT_L, irrigationStore, storageCapacity } from '../sim/utilities';
import { litersText } from '../sim/format';
import { needsHookup } from '../sim/hookups';
import { HousingPanel } from './HousingPanel';
import { QuartersPanel } from './QuartersPanel';
import { bestShelter, doseRate, isNuclear, SHELTER_DAYS } from '../sim/nuclear';
import { DISASTERS, TRACKS, TRACK_NAME, type DisasterKind } from '../sim/disaster';
import { livingPerDay } from '../sim/engine';
import { roman } from '../sim/eras';
import { canRigMines, rigMines } from '../sim/battle';
import { canJoin } from '../sim/aftermath';
import { THREAT_NAME } from '../sim/threatState';
import { MILESTONE_COUNT, MILESTONE_NAME, PART_LABEL, generations } from '../sim/lineage';
import { daysOfFood, KCAL, needOf } from '../sim/needs';
import { starveWarning } from '../sim/starvation';
import { barterPrices, moneyWorks, type Good } from '../sim/barter';
import { MarketSection, NeighborsSection, RumorsSection, ScavengeSection } from './WorldPanels';
import { alliesFor, canGo, FAR_COLD, isAway, latestFarLead, latestLead, LEAD_COLD, LEAD_WARM, leadAge, openCaptives, raidProblem, rescueOdds, tripFuel, tripProblem } from '../sim/rescue';
import { EXPOSURE_NAME, exposure, raidPressure, topExposure } from '../sim/opsec';
import { acresOf, buyProblem, LAND_NAME, premiumOffer, priceOf } from '../sim/land';
import { runFinished } from '../sim/perimeter';
import { plansNeed, plansNeedLines } from '../sim/guidance';
import { populations, predatorLine } from '../sim/wildlife';
import { PantryPanel } from './PantryPanel';
import { FarmTab } from './FarmTab';
import { farmAlert } from '../sim/farmPlan';
import { fmtKw, powerSummary } from '../sim/powerReport';
import { ToolsPanel } from './ToolsPanel';
import { pluralize } from '../sim/words';
import { Clamp, Group, Hint, Note, Row, Section, Tabs } from './hud/common';
import { DIM, FS, LINE, TONE, btn, panel, usd, type Tone } from './hud/style';
import { planningHold } from '../sim/clockResume';
import { runOver } from '../sim/wipe';
import { BuildMenu } from './hud/BuildMenu';
import { ProjectsTab } from './hud/ProjectsTab';
import { DefenseTab } from './hud/DefenseTab';
import { defenseTabAlert } from './hud/defenseAlert';
import { CursorHint, LineToolBar, ToastLine, WelcomeCard } from './hud/Feedback';
import { getViolence, setViolence, type Violence } from '../game/battle/bloodFx';
import { getNames, setNames, getPips, setPips } from '../game/battle/nameLabels';
import { useFeelStore, saveRevealed, worldId } from '../store/feelStore';
import { visibleTabs, type RightTab } from '../sim/tabReveal';
import { caloriesText, feetText, gallonsText, kmText, lengthText } from '../sim/units';

const QUALITIES: Quality[] = ['high', 'medium', 'low'];

/** Raid cutscenes: blood and wounds shown (Graphic, the default) or left out (Restrained). Remembered on this device; the fall and the grief stay either way. */
function ViolenceSelect() {
  const [v, setV] = useState<Violence>(getViolence());
  return (
    <select value={v} onChange={e => { const x = e.target.value as Violence; setViolence(x); setV(x); }} title="Raid scenes: Graphic shows blood and wounds; Restrained leaves them out (the fall and the grief stay)" aria-label="Violence in raid scenes" data-testid="violence-select">
      <option value="graphic">Graphic</option><option value="restrained">Restrained</option>
    </select>
  );
}
/** Raid cutscenes: defenders' first names over their heads, and a small status pip beside each. Remembered on this device. */
function NamesSelect() {
  const [n, setN] = useState(getNames()), [p, setP] = useState(getPips());
  return (<>
    <select value={n ? 'on' : 'off'} onChange={e => { const on = e.target.value === 'on'; setNames(on); setN(on); }} title="Raid scenes: show each defender's first name over their head" aria-label="Names in raid scenes" data-testid="names-select">
      <option value="on">Names on</option><option value="off">Names off</option>
    </select>
    <select value={p ? 'on' : 'off'} onChange={e => { const on = e.target.value === 'on'; setPips(on); setP(on); }} title="Raid scenes: a small dot beside each name (green fine, amber wounded, red down, cross dead, gray held)" aria-label="Status pips in raid scenes" data-testid="pips-select">
      <option value="on">Status pips on</option><option value="off">Status pips off</option>
    </select>
  </>);
}
const SIGHTS: Array<['off' | 'road' | 'ridge' | 'night' | 'viewshed', string, string]> = [
  ['off', 'Off', 'No sightline overlay'], ['road', 'Road', 'How exposed each spot is to people on the county road'], ['ridge', 'Ridge', 'Seen from the high ground to the west'],
  ['night', 'Night', 'Where your lit windows give you away after dark'], ['viewshed', 'View from…', 'Click a spot to see what can be seen from there (Shift-click: from a 33 ft tower)']];
const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];
const CAMERA_TIP: Record<CameraMode, string> = { diorama: 'Orbit view from above: drag to turn, wheel to zoom, right-drag to pan', walk: 'Walk the place at eye level (WASD)', fly: 'Fly over it (WASD, Space / C for up and down)', cinematic: 'A slow tour of the buildings' };
const VIEWS: Array<[BuildingView, string, string]> = [['full', 'Walls', 'Show buildings whole, roofs on (V cycles the three views)'], ['cutaway', 'Cutaway', 'Cut the walls at waist height and lift the roofs to see the rooms inside (V)'], ['xray', 'X-ray', 'See-through walls and roof: rooms, pipes and wiring (V)']];
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
  /** The parcel whose purchase is waiting for a second click (acreage, price and what is left are shown first). */
  const [landAsk, setLandAsk] = useState<string | null>(null);
  // layout: the top bar's size and the window's width decide where the panels sit (hudLayout)
  const barRef = useRef<HTMLDivElement>(null), brRef = useRef<HTMLDivElement>(null), blRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [boardOpen, setBoardOpen] = useState(false);
  const bar = useBox(barRef), br = useBox(brRef), blBox = useBox(blRef, w.viewOpen);
  const bl = w.viewOpen ? blBox : { w: 0, h: 0 };
  const lay = hudLayout(bar.vw, bar.w, bar.h, br, bl);
  const [lastSel, setLastSel] = useState<string | null>(null);
  if (g.selected !== lastSel) { setLastSel(g.selected); if (g.selected && !g.tool) setLeftTab('projects'); }
  // a link elsewhere asked for a panel: each request is a new object, so a changed one is taken once (state adjusted while rendering, as for the selection above)
  const [lastFocus, setLastFocus] = useState<typeof g.hudFocus>(g.hudFocus);
  if (g.hudFocus !== lastFocus) {
    setLastFocus(g.hudFocus);
    if (g.hudFocus) { setRightTab(g.hudFocus.right); if (g.hudFocus.supplies) setSuppliesTab(g.hudFocus.supplies); }
  }
  // First-hour HUD (sim/tabReveal.ts): right-hand tabs appear as they become relevant; "Show all tabs" brings them all back
  const feel = useFeelStore();
  const revealedSet = new Set<RightTab>(feel.revealed);
  const shownTabs = new Set(visibleTabs(revealedSet, !feel.firstHourHud || feel.showAll));
  // a tab that was asked for (a link, a Next-step card) is shown and stays shown
  const missingKey = revealedSet.has(rightTab) ? '' : rightTab;
  useEffect(() => {
    if (!missingKey) return;
    const f = useFeelStore.getState(), all = [...new Set([...f.revealed, missingKey as RightTab])];
    saveRevealed(worldId(useGameStore.getState().game), all);
    useFeelStore.setState({ revealed: all });
  }, [missingKey]);
  useEffect(() => { useFeelStore.getState().seeTab(rightTab); }, [rightTab]);
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
      <ToastLine />
      <CursorHint />
      <LineToolBar />
      <WelcomeCard />
      {/* Top bar: date, time, money, speed */}
      <div ref={barRef} style={{ ...panel, position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px 12px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', fontSize: 13.5, width: 'max-content', maxWidth: 'calc(100vw - 20px)', boxSizing: 'border-box', zIndex: 3 }}>
        <span>{dateLabel(cal.doy)}, {cal.year}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(hourOf(game.clock.t))}</span>
        {game.lineage.era > 1 && <span style={{ color: '#d8c08a' }} title={`The ${game.lineage.family} family: era ${game.lineage.era}`}>Era {roman(game.lineage.era)}</span>}
        <CollapseChip onOpen={() => setBoardOpen(true)} />
        <WaveChip onClick={() => setBoardOpen(true)} />
        <span style={{ fontWeight: 600, color: '#cfe0a8' }} title={`Checking. Net worth ${usd(netWorth(game))}`}>{usd(game.money)}</span>
        {(game.fin.debt?.owed ?? 0) >= 25 && <span style={{ fontWeight: 600, color: game.fin.debt!.stage === 'card' ? TONE.warn : TONE.bad }} title={game.disaster.tracks.banks < 0.5 ? 'The banks are gone: nobody is collecting' : `Owed on the card at 24 %${game.fin.debt!.lien ? ', with a judgment lien on the land' : ''} (Shop & money → Accounts)`}>owe {usd(game.fin.debt!.owed)}</span>}
        <button style={btn()} title="Town, the catalog, your accounts, gold and silver" onClick={() => g.openShop(true)}>Shop & money</button>
        {(() => { const over = !!game.ending && !game.ending.continued; return <button disabled={over} style={over ? { ...btn(), opacity: 0.4, cursor: 'default', pointerEvents: 'none' } : btn()} title={over ? 'Use the report card to start a new game' : 'New game'} onClick={() => g.openSetup(true, true)}>New</button>; })()}
        <SaveMenu />
        <span style={{ display: 'flex', gap: 3 }}>
          {SPEEDS.map(([s, label]) => <button key={s} style={btn(game.clock.speed === s)} onClick={() => g.setSpeed(s)}>{label}</button>)}
        </span>
        {game.clock.speed > 0 && planningHold(g.tool, g.planOpen) && <span data-testid="planning-hint" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', color: '#e8e0c8', background: 'rgba(20,22,18,0.8)', borderRadius: 4, padding: '1px 8px', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }} title="The clock holds while you place or draw something, or look over the starter plan. It picks up at the same speed when you put the tool away.">Paused while planning</span>}
      </div>

      {/* Left: build menu (groups) · projects under way · the log */}
      {lay.narrow && !w.hudHidden && <div style={{ position: 'fixed', left: EDGE, top: lay.switchTop, display: 'flex', gap: 4, zIndex: 2 }}>
        <button style={btn(side === 'left')} onClick={() => setSide('left')}>Build</button>
        <button style={btn(side === 'right')} onClick={() => setSide('right')}>Family</button>
      </div>}
      <div style={{ ...panel, position: 'fixed', left: EDGE, top: lay.panelTop, width: lay.leftW, boxSizing: 'border-box', maxHeight: `calc(100vh - ${lay.panelTop + lay.bottomReserve}px)`, display: w.hudHidden || (lay.narrow && side !== 'left') ? 'none' : 'flex', flexDirection: 'column' }}>
        <Tabs tabs={[['build', 'Build'], ['projects', 'Projects', projectsAlert], ['log', 'Log']]} value={leftTab} set={setLeftTab} />
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
          {leftTab === 'build' && <BuildMenu showProjects={() => setLeftTab('projects')} />}

          {leftTab === 'projects' && <ProjectsTab />}

          {leftTab === 'log' && game.log.slice(-14).reverse().map((e, i) => <div key={i} style={{ padding: '3px 0', borderBottom: `1px solid ${LINE}`, opacity: 1 - i * 0.04 }}><Clamp text={e.text}><span style={{ color: i === 0 ? '#eee' : undefined }}>{e.text}</span></Clamp></div>)}
        </div>
        {g.spendAsk && <div style={{ border: `1px solid ${TONE.warn}`, borderRadius: 6, padding: '4px 6px', marginTop: 6, fontSize: FS.small }}>
          {g.spendAsk.cannot
            ? <div>{g.spendAsk.cannot}</div>
            : <div>The {g.spendAsk.kind.replace(/_/g, ' ')} books a {usd(g.spendAsk.cost)} county permit fee. That leaves {usd(Math.max(0, g.spendAsk.after))}, under the {usd(g.spendAsk.reserve)} to live on.</div>}
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {!g.spendAsk.cannot && <button style={btn(true)} onClick={() => g.answerSpend(true)}>Do it anyway</button>}
            <button style={btn()} onClick={() => g.answerSpend(false)}>{g.spendAsk.cannot ? 'OK' : 'Keep a reserve'}</button>
          </div>
        </div>}
        {!g.tool && g.stakedNote && <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}><Note tone="good">{g.stakedNote}</Note></div>}
        {g.tool && <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}>
          <Note tone={g.toolProblem ? 'warn' : undefined}>{g.toolProblem ?? (g.tool === 'fell' ? 'Point at a tree · click marks or unmarks · Esc stops' : g.tool.startsWith('fence:') ? 'Click corners · Shift-click the line for a vehicle gate (Shift+Alt: a pedestrian gate) · Enter lays it out · Backspace undoes · Esc cancels' : 'Click to stake it out (Shift-click to keep going) · R rotates · Esc cancels')}</Note>
        </div>}
      </div>

      {/* Right: the family, supplies, water & power, land, the outside world */}
      <div style={{ ...panel, position: 'fixed', right: lay.narrow ? 'auto' : EDGE, left: lay.narrow ? EDGE : 'auto', top: lay.panelTop, width: lay.rightW, boxSizing: 'border-box', maxHeight: `calc(100vh - ${lay.panelTop + lay.bottomReserve}px)`, display: w.hudHidden || (lay.narrow && side !== 'right') ? 'none' : 'flex', flexDirection: 'column' }}>
        <Tabs tabs={(([['family', 'Family', familyAlert], ['supplies', 'Supplies', worstTone(foodAlert, farmAlert(game))], ['utilities', 'Utilities', utilAlert], ['land', 'Land'], ['defense', 'Defense', defenseAlert], ['outside', 'Outside', outsideAlert], ['chronicle', 'Years']]) as Array<[RightTab, string, Tone?]>)
          .filter(([id]) => shownTabs.has(id) || id === rightTab).map(([id, label, alert]): [RightTab, string, Tone?, boolean?] => [id, label, alert, feel.fresh.includes(id) && id !== rightTab])} value={rightTab} set={setRightTab} />
        {feel.firstHourHud && <button data-testid="show-all-tabs" onClick={() => feel.setShowAll(!feel.showAll)} title={feel.showAll ? 'Hide the tabs that have nothing to show yet' : 'Tabs appear as they become useful. Show every tab now.'} style={{ alignSelf: 'flex-end', background: 'transparent', border: 0, color: DIM, cursor: 'pointer', fontSize: FS.fine, padding: '0 2px 4px', marginTop: -4, textDecoration: 'underline' }}>{feel.showAll ? 'Hide unused tabs' : 'Show all tabs'}</button>}
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
                {n && n.died == null && game.disaster.difficulty === 'cozy' && starveWarning(p.first, n.starved ?? 0) && <Note tone="bad">{starveWarning(p.first, n.starved ?? 0)}.</Note>}
                <PersonInsight p={p} />
                {n && n.died == null && (p.conditions?.length ?? 0) > 0 && (() => {
                  const days = rxDaysOf(game, p);
                  return <div style={{ fontSize: 11, color: days < 14 ? TONE.bad : days < 45 ? TONE.warn : DIM, marginTop: 2 }}>{p.conditions!.map(c => CONDITION[c].name).join(', ')}: {days > 0 ? `${pluralize(days, 'day')} of ${p.conditions!.map(c => CONDITION[c].rx).join(' and ')}` : 'out of medicine'}</div>;
                })()}
              </div>;
            })}
            <WeekenderPanel />
            <DogsPanel game={game} />
            <KinPanel />
            <NewcomersPanel />
            <HousingPanel />
            <QuartersPanel />
            <PeopleSection />
            {!runOver(game) && <MedicalSection />}
            <ClassesSection />
            {!runOver(game) && <DailySection />}
            {trialCamps(game).map(c => <Section key={c.id} title={`Camp outside the wall: ${c.title}`}>
              <Row label="On trial" value={`day ${Math.max(0, dayIndex(game.clock.t) - c.from)} of ${c.until - c.from}`} />
              <Row label="People" value={c.people.map(p => `${p.first}${p.kid ? ` (${p.age})` : ''}`).join(', ')} />
              <Row label="Their ration" value={`${caloriesText(campNeed(c))} a day from your supplies${c.hungry ? ` · short ${pluralize(c.hungry, 'day')}` : ''}`} />
              <Row label="Work put in" value={`${Math.round(c.worked)} h`} />
              {c.learned.map((l, k) => <Note key={k} tone="warn">{l}</Note>)}
              {!c.learned.length && <div style={{ fontSize: 11, color: DIM }}>Not family yet. You'll know them better by the end of the month.</div>}
            </Section>)}
            {!runOver(game) && game.people.some(p => p.conditions?.length) && <Section title="Medicine & household">
              {pharmacyOpen(game) ? <button style={{ ...btn(), width: '100%' }} title="Fill everyone's prescriptions three months beyond the current month (as far ahead as insurance covers)" onClick={() => g.stockUpRx()}>Fill prescriptions 90 days ahead</button>
                : <Note tone="warn">The pharmacy is shut: what's on hand is all there is.</Note>}
              <Row label="Hygiene supplies" value={game.disaster.tracks.stores >= 0.5 ? `bought with groceries · ${Math.floor(game.stock.hygiene)} on hand` : `${Math.floor(game.stock.hygiene)} person-months left`} />
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
            <Group id="sup-keeping" title="Keeping" defaultOpen={false} extra={`rotate ${game.shelf.rotate ? 'on' : 'off'} · traps ${game.shelf.traps > 0 ? 'set' : game.stock.traps >= 1 ? 'boxed' : 'none'}`}>
              {KEPT.filter(k => game.stock[k] > 0.05).map(k => {
                const kp = keeping(game, k), yrs = (d: number) => d >= 365 ? `${(d / 365).toFixed(1)} yr` : `${Math.round(d / 30)} mo`;
                return <Row key={k} label={MATERIALS[k].name} value={<span style={{ color: TONE[kp.tone === 'good' ? 'good' : kp.tone] }}>{yrs(kp.age)} old / keeps {yrs(kp.life)}</span>} />;
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ color: DIM }}>Rotate the pantry: {game.shelf.rotate ? 'yes' : 'no'}</span>
                <button style={btn()} title="Eat what you store: the oldest comes off the shelf, the grocery run replaces it (keeps your food fresh while town is open)" onClick={() => g.setRotate(!game.shelf.rotate)}>{game.shelf.rotate ? 'Stop' : 'Rotate'}</button>
              </div>
              <Row label="Mouse traps" value={game.shelf.traps > 0 ? `set (${pluralize(game.shelf.traps, 'day')})` : game.stock.traps >= 1 ? 'a box in the shed' : <span style={{ color: TONE.warn }}>none: mice in the pantry</span>} />
              {game.stock.fuel > 0 && game.stock.stabilizer < Math.ceil(game.stock.fuel / 10) && <Note tone="warn">The gas has no stabilizer: it goes stale in about six months.</Note>}
            </Group>
            <Group id="sup-hunt" title="Hunting & fishing" defaultOpen={false} extra={`${(['big', 'small', 'fish'] as const).filter(c => game.wild.abundance[c] < 0.4).length ? 'game is thin' : 'game is plentiful'}`}>
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
            </Group>
            <Group id="sup-wild" title="Wildlife on the land" defaultOpen={false} extra={predatorLine(game).ok ? 'predators: ok' : 'predators: watch'}>
              {populations(game).map(p => <Row key={p.sp} label={p.name} value={<span style={{ color: p.predator ? (p.count ? TONE.warn : DIM) : p.count < p.cap * 0.5 ? TONE.warn : undefined }}>{p.count} <span style={{ color: DIM }}>of ~{p.cap < 1 ? '<1' : Math.round(p.cap)}</span></span>} title={p.predator ? 'A predator: a danger to stock, dogs and kids if the place is careless; kept out by a wall that holds it; a good shot fills the freezer' : 'Counts follow the acres you own, the timber, open ground and water, and what has been hunted'} />)}
              <Note tone={predatorLine(game).ok ? 'good' : 'warn'}>Predators: {predatorLine(game).detail}</Note>
            </Group>
            <Section title="Food">
              {(() => {
                const f = game.food, d = daysOfFood(game);
                const warned = !!game.disaster.kind && game.clock.t >= game.disaster.warnAt;
                const short = warned && (f.fromStores ? d < 180 : d < 30);
                const perDay = game.people.reduce((a, p, i) => a + (game.personState[i]?.needs.died == null ? needOf(p) : 0), 0);
                const lines = [{ material: 'staples' as MaterialId, qty: Math.max(1, Math.ceil(90 * perDay / KCAL.staples)) }];
                const why = orderProblem(game, lines);
                return <>
                  <Row label="Food on hand" value={d === Infinity ? '—' : d >= 365 ? `${pluralize((d / 365).toFixed(1), 'year')}` : `${Math.floor(d)} ${Math.floor(d) === 1 ? 'day' : 'days'}`} tone={short ? 'warn' : undefined} />
                  {f.producedKcal > 0 && <Row label="Grown yesterday" value={`${caloriesText(f.producedKcal)}`} />}
                  {!f.fromStores && <Row label="Ate / needed" value={`${Math.round(f.ateKcal).toLocaleString('en-US')} / ${Math.round(f.needKcal).toLocaleString('en-US')}`} tone={f.ateKcal < f.needKcal * 0.95 ? 'bad' : undefined} />}
                  {f.fromStores && <Hint more="Stock canned food and bulk staples for when the stores close.">Groceries come from town for now.</Hint>}
                  {short && <>
                    <Note tone="warn">{f.fromStores ? 'The warning signs are out: if the stores close, this is all there is.' : 'The trucks are running: buy food while you can.'}</Note>
                    <button style={{ ...btn(!why), width: '100%' }} disabled={!!why} title={why ?? undefined} onClick={() => g.order(lines)}>Order three months of staples ({usd(orderCost(lines, prices(game)))})</button>
                  </>}
                </>;
              })()}
            </Section>
            <Section title="Stockpile">
              {MATERIAL_IDS.filter(m => game.stock[m] > 0 || (pending[m] ?? 0) > 0 || (need[m] ?? 0) > 0).length === 0 && <Note>Empty: buy in the Shop or fell timber.</Note>}
              {MATERIAL_IDS.filter(m => game.stock[m] > 0 || (pending[m] ?? 0) > 0 || (need[m] ?? 0) > 0).map(m => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, padding: '1px 0' }}>
                  <span style={{ color: DIM, flex: 1 }}>{MATERIALS[m].name}</span>
                  {(need[m] ?? 0) > 0 && <span style={{ fontSize: 10.5, color: TONE.warn, border: `1px solid ${TONE.warn}`, borderRadius: 8, padding: '0 5px' }} title="The plans need more of this than you have or have on order">needs {qtyText(need[m]!)} more</span>}
                  <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{Math.floor(game.stock[m] + 1e-6)}{pending[m] ? <span style={{ color: DIM }}> +{pending[m]}</span> : null}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {needLines.length > 0
                  ? <PlansOrderButton lines={needLines} style={{ width: 'auto' }} />
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
                <Row label="Firewood, seasoned" value={`${Math.floor(game.stock.firewood)} face cord${Math.floor(game.stock.firewood) === 1 ? '' : 's'}`} />
                {gr > 0 && <Row label="Green, seasoning" value={`${Math.round(gr * 10) / 10} face cords · next ready in ${pluralize(next, 'day')}`} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ color: DIM }}>Chimney: <span style={{ color: ch === 'dirty' ? TONE.bad : ch === 'building up' ? TONE.warn : TONE.good }}>{ch}</span></span>
                  {ch !== 'clean' && <button style={btn(ch === 'dirty')} title="Creosote builds up with every face cord burned (green wood three times as fast); a dirty flue can catch fire" onClick={() => g.sweep()}>{game.disaster.tracks.stores >= 0.5 && game.disaster.tracks.banks >= 0.5 ? `Sweep it ($${SWEEP_USD})` : 'Sweep it ourselves'}</button>}
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
                  <Row label="Batteries" value={pw.batteryKwh > 0 ? `${Math.round(pw.storedKwh)} of ${Math.round(pw.batteryKwh)} kWh (${pw.batteryPct}%)` : 'none'} tone={pw.batteryKwh > 0 && pw.madeKwh > 0 && pw.storedKwh < 0.5 ? 'warn' : undefined} />
                  {pw.exportKwh >= 0.5 && <Row label="Sold to the grid" value={`${fmtKw(pw.exportKwh)} kWh · $${pw.creditUsd.toFixed(2)}`} title="Surplus solar sent back to the co-op while the grid is up (net metering, 5 cents a kWh)" />}
                  {pw.wastedKwh >= 1 && <Row label="Made, not stored" value={`${fmtKw(pw.wastedKwh)} kWh`} tone="warn" title="Power the sun made yesterday that nobody used and no battery took" />}
                  {pw.headline && <Note tone="warn">{pw.headline}</Note>}
                </>; })()}
                <Row label="Generator fuel" value={litersText(game.stock.fuel * FUEL_UNIT_L)} />
                {r.genKwh > 0.1 && <Note>The generator ran {Math.round(r.genKwh / 7 * 10) / 10} h: it carries about half a mile on a still night.</Note>}
                {r.shed.length > 0 && <Note tone="warn">Went without: {r.shed.map(id => KIT[game.structures.find(x => x.id === id)?.kind ?? '']?.name ?? '?').join(', ')}</Note>}
                {r.shortKwh > 0.5 && <Note tone="warn">Power ran short.</Note>}
              </Section>
              <Section title="Water (yesterday)">
                <Row label="In / used" value={`${gallonsText(r.waterL)} / ${gallonsText(r.useL)}`} />
                <Row label="Stored" value={`${gallonsText(r.storedL)} of ${gallonsText(storageCapacity(game))}`} />
                {irrigationStore(game).cap > 0 && <Row label="Pond (garden, fire)" value={`${gallonsText(irrigationStore(game).have)} of ${gallonsText(irrigationStore(game).cap)}`} title="Pond water waters the garden and fills the fire line; it is not drinking water. A reservoir counts as drinking water once the filtration shed or a filter is on the place." />}
                {game.stock.water_jugs >= 1 && <Row label="Drinking water stored" value={`${Math.floor(game.stock.water_jugs)} jugs (${gallonsText(game.stock.water_jugs * JUG_L)})`} />}
                {storageCapacity(game) - r.storedL > 1000 && game.disaster.tracks.deliveries >= 0.5 && game.disaster.tracks.banks >= 0.5 && <button style={{ ...btn(), width: '100%', marginTop: 3 }} title="A tanker load from town: 3,960 gal" onClick={() => g.money(d => orderTanker(d, storageCapacity(d)))}>Order a tanker load ($450)</button>}
                <Row label="Well depth here" value={`${feetText(game.site.gwDepth)}`} />
                {game.utilities.hauling && <Note tone="warn">{game.utilities.haulFar ? 'Hauling water a quarter mile from the creek on the neighbor\'s land: a well or cistern would end it.' : 'Hauling water from the creek by the bucket: a well or cistern would end it.'}</Note>}
                {r.shortL > 0 && <Note tone="bad">Water ran short.</Note>}
                {flowLine(game) && <Note>{flowLine(game)}</Note>}
                {game.utilities.hauling && game.stock.water_filter < 0.01 && <Note tone="warn">{game.stock.firewood >= 0.05 ? 'Boiling the creek water (firewood): a filter would save the wood.' : 'Drinking the creek water untreated: giardia. Get a filter or boil it.'}</Note>}
                {game.site.gwQuality === 'arsenic' && game.stock.ro_system < 1 && <Note tone="warn">Arsenic in the well water: get reverse osmosis for drinking water.</Note>}
                {game.site.gwQuality === 'hard' && game.stock.softener < 1 && <Note>Hard water: scale wears the pump faster without a softener.</Note>}
              </Section>
              <FleetPanel />
            </>;
          })()}

          {rightTab === 'land' && <>
            <Section title="The place">
              <Row label="Home place" value={`${pluralize(game.site.acres, 'acre')}`} />
              <Row label="Region" value={REGIONS[game.site.region].name} />
              {game.site.lot && (() => {
                const a = altitudeClimate(game.site), wr = winterRoadLine(game);
                return <>
                  <Row label="Ground" value={`${LOT_NAME[game.site.lot.kind]}, ${feetText(game.site.lot.elevM)}`} />
                  {a && <Row label="Frost-free" value={`${pluralize(a.season, 'day')}${a.season !== a.seasonRegion ? ` (the region's usual: ${a.seasonRegion})` : ''}`} />}
                  {a && a.notes.length > 0 && <Hint more={a.notes.map(t => <div key={t} style={{ marginBottom: 2 }}>{t}</div>)}>{a.notes[0].length > 70 ? `${a.notes[0].slice(0, 68).replace(/[ ,;:]+\S*$/, '')}…` : a.notes[0]}{a.notes.length > 1 ? ` (+${a.notes.length - 1} more notes)` : ''}</Hint>}
                  {wr && <Clamp text={wr}><span style={{ color: roadClosedFor(game) > 0 ? TONE.warn : undefined }}>{roadClosedFor(game) > 0 ? `Road closed by snow for ${roadClosedFor(game)} more day${roadClosedFor(game) === 1 ? '' : 's'}. ` : ''}{wr}</span></Clamp>}
                </>;
              })()}
              {(['power', 'drive'] as const).map(what => {
                const imp = game.site.improvements, have = what === 'power' ? imp.power : imp.drive, due = game.siteJobs[what];
                const dq = what === 'drive' ? driveQuote(imp, game.site, game.seed) : null, q = dq ?? powerQuote(imp, game.site), why = hookupProblem(game, what);
                const plan = dq?.plan;
                const label = what === 'power' ? 'Power' : 'Drive';
                return have ? <Row key={what} label={label} value={what === 'power' ? 'On the grid' : 'Gravel'} />
                  : due !== null ? <Row key={what} label={label} value={`coming in ${pluralize(Math.max(1, Math.ceil(due - game.clock.t)), 'day')}`} />
                  : <div key={what} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ color: DIM }}>{label}: <span style={{ color: TONE.warn }}>{what === 'power' ? `${imp.poleFt.toLocaleString('en-US')} ft to the pole` : `none (${(plan ? plan.lengthFt : imp.driveFt).toLocaleString('en-US')} ft)`}</span></span>
                      <button style={btn(!why)} disabled={!!why} title={why ?? (what === 'power' ? `The co-op runs the line ($${POLE_PER_FT}/ft + transformer), about ${pluralize(Math.round(q.days / 7), 'week')}` : plan ? `${plan.lines.map(l => `${l.label}: ${usd(l.usd)}`).join('; ')}. About ${pluralize(q.days, 'day')}` : `12 ft gravel and a culvert ($${DRIVE_PER_FT}/ft), about ${pluralize(q.days, 'day')}`)} onClick={() => g.hookup(what)}>{what === 'power' ? 'Run the line' : 'Lay the drive'} · {usd(q.usd)}</button>
                    </div>;
              })}
              <Clamp text={`The way in: ${roadLine(game)}.`}>The way in: {roadLine(game)}.{game.site.lot && (() => { const cl = crossingLine(roadPlanOf(game)); return cl ? ` ${cl}` : ''; })()}</Clamp>
              <EntranceCard />
              <PlowNote game={game} />
              {(game.roadside ?? []).length > 0 && <Note tone="warn">{game.roadside.length === 1 ? 'A load is' : `${game.roadside.length} loads are`} at the road: about {Math.round(game.roadside.reduce((a, r) => a + r.hours - r.done, 0))} h of carrying before the rest of the building goes on. A gravel drive ends this.</Note>}
              {!game.site.improvements.power && !game.utilities.grid && <Note>No power at the place: run the line, or go solar or a generator.</Note>}
              {game.land.parcels.some(p => p.owner === 'you') && <Row label="Bought since" value={`${pluralize(game.land.parcels.filter(p => p.owner === 'you').reduce((a, p) => a + acresOf(p.rect), 0), 'acre')}`} />}
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
                      : <button style={btn(!why)} disabled={!!why} title={why ?? `Buy ${pluralize(acresOf(p.rect), 'acre')} of land next door`} onClick={() => setLandAsk(landAsk === p.id ? null : p.id)}>Buy {pluralize(acresOf(p.rect), 'acre')} · {usd(priceOf(game, p))}</button>}
                  </div>
                  {landAsk === p.id && p.owner !== 'you' && !why && <div role="alertdialog" aria-label="Confirm the land purchase" style={{ border: `1px solid ${TONE.warn}`, borderRadius: 6, padding: '5px 7px', margin: '4px 0', fontSize: FS.small }}>
                    <div><b>Buy {pluralize(acresOf(p.rect), 'acre')} of {LAND_NAME[p.kind]}</b> from {n ? n.name : 'the owner'} for <b>{usd(priceOf(game, p))}</b>?</div>
                    <div style={{ color: DIM, marginTop: 2 }}>You have {usd(game.money)}; that leaves {usd(game.money - priceOf(game, p))}. Land cannot be sold back.</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button style={btn(true)} onClick={() => {
                        const price = priceOf(game, p), acres = acresOf(p.rect), rect = p.rect, left = game.money - price;
                        const bad = g.buy(p.id); setLandAsk(null);
                        if (bad) { g.showToast(`Could not buy the land: ${bad}.`); return; }
                        g.showToast(`Bought ${pluralize(acres, 'acre')} of ${LAND_NAME[p.kind]} for ${usd(price)}. ${usd(left)} left.`);
                        w.flashLand(rect);
                      }}>Buy it for {usd(priceOf(game, p))}</button>
                      <button style={btn()} onClick={() => setLandAsk(null)}>Not now</button>
                    </div>
                  </div>}
                  <div style={{ fontSize: 11, color: DIM }}>{pluralize(acresOf(p.rect), 'acre')} of {LAND_NAME[p.kind]}{p.owner === 'you' ? '' : ` · ${n ? n.name : '?'}`}{p.forSale && p.owner !== 'you' ? <span style={{ color: TONE.warn }}> · for sale</span> : null}{p.ring === 2 && p.owner !== 'you' ? <span style={{ color: DIM }}> · farther out, more expensive</span> : null}{premiumOffer(game, p) ? <span style={{ color: TONE.warn }} title="Not for sale. A cash offer 60% over the asking price would tempt him.">{' · cash offer, +60%'}</span> : null}</div>
                </div>;
              })}
            </Section>
          </>}

          {rightTab === 'chronicle' && <Chronicle />}

          {rightTab === 'defense' && <DefenseTab />}

          {rightTab === 'outside' && <>
            <TakenSection />
            <ScavengeSection />
            <RumorsSection />
            {unscripted(game.disaster.mode) && !game.disaster.kind && <FreeBuild />}
            {!(game.disaster.phase === 'warning' || (game.disaster.kind && game.clock.t >= game.disaster.warnAt)) && !(unscripted(game.disaster.mode) && !game.disaster.kind) && <Hint more="Watch the news ticker, the prices and the neighbors: the warning signs show there first.">All quiet.</Hint>}
            {(game.disaster.phase === 'warning' || (game.disaster.kind && game.clock.t >= game.disaster.warnAt)) && (
              <Section title="Outside world">
                {game.disaster.tracks.deliveries <= 0.25 ? <Note tone="bad">No deliveries: the yard and the stores are shut</Note>
                  : prices(game) > 1.02 && <Note tone="warn">Prices up {Math.round((prices(game) - 1) * 100)}%</Note>}
                {isNuclear(game) && (() => {
                  const h = (game.clock.t - game.disaster.hitAt) * 24, rate = doseRate(game.disaster.variant, h) * 1000, [pf, where] = bestShelter(game);
                  return <>
                    <Row label="Outside" value={`${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} mSv/h`} tone={rate > 10 ? 'bad' : rate > 1 ? 'warn' : 'good'} />
                    {h < SHELTER_DAYS * 24 && <Row label="Sheltering" value={`${where} (PF ${Math.round(pf).toLocaleString('en-US')})`} />}
                    {h < SHELTER_DAYS * 24 && <Note>Out to work in {pluralize(Math.ceil(SHELTER_DAYS - h / 24), 'day')} (by then it's a hundredth of day one)</Note>}
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
                  <Row label={p.name} value={`${pluralize(Math.floor(game.clock.t) - p.since, 'day')}`} title={`Wound ${Math.round(p.sev)} · trust ${Math.round(p.trust)}${p.talked ? ' · has talked' : ''}`} />
                  <Questioning id={p.id} asked={p.asked ?? []} hurt={!!p.hurtTwice} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => g.releasePrisoner(p.id)}>Let him go</button>
                    <button style={{ ...btn(), flex: 1, opacity: canJoin(game, p) ? 1 : 0.4 }} disabled={!canJoin(game, p)} title="After a month, healed, and once he trusts you (70+)" onClick={() => g.joinPrisoner(p.id)}>Let him join</button>
                  </div>
                </div>
              ))}
              <Hint more="Fewer adults to watch them, more likely they slip away.">Each eats about 2,200 Calories a day.</Hint>
            </Section>}
            {canRigMines(game) && <Section title="Mines">
              <Row label="Rigged on the approaches" value={Math.floor(game.stock.mines ?? 0)} title="They go off as raiders cross the band outside the line" />
              <button style={{ ...btn(), width: '100%' }} title="Four buried charges on pressure switches, from a hardware kit and a can of fuel" onClick={() => { const why = g.money(d => rigMines(d)); if (why) alert(why); }}>Rig 4 mines (1 hardware kit, 1 can of fuel)</button>
              <Hint tone="warn" more="Neighbors, people coming to the gate for help, your own kids.">Anyone can step on them.</Hint>
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
              const rows: Array<[string, Good]> = [['Canned food (case)', 'canned'], ['Staples (55 lb)', 'staples'], ['Fuel (5.3 gal)', 'fuel'], ['Meds (kit)', 'meds'], ['Firewood (face cord)', 'firewood'], ['Seed (season)', 'seed'], ['Hygiene (month)', 'hygiene'], ['Silver coin', 'metal:silver_coin'], ['A day\'s labor', 'labor']];
              return <Section title="Trade with neighbors">
                <Hint more="Goods change hands at what they're worth now (2025 dollars-equivalent). Friendly neighbors (allies) trade at par.">Money is gone: trade is goods for goods.</Hint>
                {rows.map(([label, k]) => <Row key={k} label={label} value={`$${Math.round(p[k]).toLocaleString('en-US')}`} />)}
              </Section>;
            })()}
          </>}
        </div>
      </div>

      {/* the tool hint stays up while the panels are hidden */}
      {w.hudHidden && g.tool && <div style={{ ...panel, position: 'fixed', left: 10, top: 10, maxWidth: 300, fontSize: 12 }}>{g.toolProblem ?? (g.tool === 'fell' ? 'Point at a tree · click marks or unmarks · Esc stops' : 'Click to place · R rotates · Esc cancels')}</div>}

      {boardOpen && <CompoundBoardPanel top={Math.max(lay.panelTop, lay.switchTop)} bottom={lay.bottomReserve} narrow={lay.narrow} onClose={() => setBoardOpen(false)} onSide={setSide} />}

      {/* Bottom right: cameras, building view */}
      <div ref={brRef} style={{ ...panel, position: 'fixed', right: EDGE, bottom: 34, padding: 4, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 'calc(100vw - 20px)', boxSizing: 'border-box' }}>
        <button title="The clipboard in the safe room: power, water, food, defense, morale, threats and what waits on you, one page" style={btn(boardOpen)} onClick={() => setBoardOpen(!boardOpen)}>Board</button>
        <button data-testid="view-toggle" title="View options: season and weather look, graphics quality, frame rate, sightline and terrain overlays, blueprint, property line, photo mode" style={btn(w.viewOpen)} onClick={() => w.setViewOpen(!w.viewOpen)}>View{w.viewOpen ? ' ▾' : ' ▸'}</button>
        {VIEWS.map(([v, label, tip]) => <button key={v} title={tip} style={btn(w.buildingView === v)} onClick={() => w.setBuildingView(v)}>{label}</button>)}
        <button title="Underground: see-through ground, bunker rooms cut open (U). It switches itself off when you put the bunker tool down." style={btn(w.underground)} onClick={() => w.setUnderground(!w.underground)}>Underground</button>
        <button title="Hide or show the side panels to see the whole map (H)" style={btn(w.hudHidden)} onClick={() => w.setHudHidden(!w.hudHidden)}>{w.hudHidden ? 'Show panels' : 'Hide panels'} (H)</button>
        <span style={{ width: 1, height: 18, background: '#555', margin: '0 3px' }} />
        {CAMERAS.map(([m, label]) => <button key={m} title={CAMERA_TIP[m]} style={btn(w.cameraMode === m)} onClick={() => w.setCameraMode(m)}>{label}</button>)}
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

      {/* Bottom left: view (season / weather / quality / photo mode); opened from the View button below */}
      {w.viewOpen && <div ref={blRef} style={{ ...panel, position: 'fixed', left: EDGE, bottom: lay.viewBottom, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 'min(560px, calc(100vw - 20px))', boxSizing: 'border-box' }}>
        <select value={w.seasonMode} onChange={e => w.setSeasonMode(e.target.value as SeasonMode)} title="Season look">
          {SEASON_MODES.map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={w.weatherMode} onChange={e => w.setWeatherMode(e.target.value as WeatherMode)} title="Weather">
          {WEATHER_MODES.map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={w.quality} onChange={e => { w.setQuality(e.target.value as Quality, true); w.setPerfNotice(null); }} title="Graphics quality (Low: no shadows or post-processing; Medium: soft shadows; High: adds ambient occlusion and a sharper pixel ratio)" aria-label="Graphics quality">
          {QUALITIES.map(x => <option key={x}>{x}</option>)}
        </select>
        <ViolenceSelect />
        <NamesSelect />
        <select value={w.frameCap} onChange={e => w.setFrameCap(Number(e.target.value) as FrameCap)} title="Frame-rate cap: 60 is smooth and halves the work on a 120 Hz display" aria-label="Frame-rate cap">
          <option value={60}>60 fps</option><option value={30}>30 fps</option><option value={0}>uncapped</option>
        </select>
        <button style={btn(w.showPerf)} title="Show frames per second, frame time and draw calls" onClick={() => w.setShowPerf(!w.showPerf)}>FPS</button>
        {w.showPerf && w.quality !== 'high' && <button style={btn(false)} title="Switch to High graphics (remembered). If it runs slowly the game steps back down by itself." onClick={() => { w.setQuality('high', true); w.setPerfNotice(null); }}>Try High</button>}
        {w.showPerf && w.perfStats && (
          <span data-testid="perf-readout" style={{ fontVariantNumeric: 'tabular-nums', color: w.perfStats.ms > w.perfStats.budgetMs ? '#f88' : w.perfStats.ms > 22 ? '#fd6' : '#8d8' }} title="frames per second, smoothed frame time against the 40 ms budget, draw calls, triangles">
            {w.perfStats.fps.toFixed(0)} fps · {w.perfStats.ms.toFixed(1)} / {w.perfStats.budgetMs} ms · {w.perfStats.calls} calls · {(w.perfStats.tris / 1000).toFixed(0)}k tris
          </span>
        )}
        <span style={{ opacity: 0.7 }}>Sightlines</span>
        {SIGHTS.map(([m, label, tip]) => <button key={m} title={tip} style={btn(w.sightMode === m)} onClick={() => w.setSightMode(m)}>{label}</button>)}
        <span style={{ opacity: 0.7 }}>Terrain</span>
        <button style={btn(w.terrainMode === 'off')} title="Hide the terrain overlay" onClick={() => w.setTerrainMode('off')}>Off</button>
        {(Object.keys(TERRAIN_LEGEND) as Array<Exclude<TerrainMode, 'off'>>).map(m => <button key={m} title={TERRAIN_LEGEND[m].tip} style={btn(w.terrainMode === m)} onClick={() => w.setTerrainMode(m)}>{TERRAIN_LEGEND[m].label}</button>)}
        {w.terrainMode !== 'off' && <div style={{ flexBasis: '100%', fontSize: 11.5, opacity: 0.85 }}>{TERRAIN_LEGEND[w.terrainMode].legend}</div>}
        {w.terrainMode === 'shade' && w.shadeReadout && <div data-testid="shade-readout" style={{ flexBasis: '100%', fontSize: 11.5, color: '#bcd', display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>{w.shadeReadout.length ? w.shadeReadout.map(l => <span key={l}>{l}</span>) : <span>Nothing to site yet: place a solar array or a garden bed and its shade shows here.</span>}</div>}
        {(w.terrainMode !== 'off' || w.sightMode !== 'off') && (() => { const t = fogLineFor(g.game, w.dayOfYear, w.timeOfDay, w.weatherMode); return t ? <div data-testid="fog-readout" style={{ flexBasis: '100%', fontSize: 11.5, color: '#bcd' }} title="Valley fog and low cloud (sim/fog.ts): it cuts what a watch, a camera or a night-vision tube sees; thermal sees through it. The same fog is drawn in the valley.">{t}</div> : null; })()}
        <button data-testid="blueprint-toggle" style={btn(w.blueprint)} title="Blueprint view: names and roles of the buildings, rings, gates, towers and tunnels, with the defense readouts" onClick={() => w.setBlueprint(!w.blueprint)}>Blueprint</button>
        {w.blueprint && w.blueprintReadout && (() => { const r = w.blueprintReadout; return <div data-testid="blueprint-readout" style={{ flexBasis: '100%', fontSize: 11.5, color: '#bcd', display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
          {r.radiation && <span data-testid="radiation-readout" style={{ flexBasis: '100%', color: '#ffd27a' }} title="Protection factor (PF) divides the dose: PF 10 means a tenth. Every building and bunker room shows its own under its name.">☢ {r.radiation}</span>}
          <span title="The Defense tab's score">Defense <b>{r.score}</b> {r.label}</span>
          <span title="How hard the walls, gates and bars stop a crew">Line holds {r.barrierPct}%</span>
          <span title="How likely it is that a crew is seen before it reaches the wall">Chance of seeing a crew coming: {r.detectionPct}%</span>
          <span>{r.rings} ring{r.rings === 1 ? '' : 's'} · {r.gates} gate{r.gates === 1 ? '' : 's'} · {r.towers} tower{r.towers === 1 ? '' : 's'}</span>
          <span title="Ways in, from the lay of the land (Terrain: Lanes)">{r.lanes} lane{r.lanes === 1 ? '' : 's'}{r.laneHardness !== null ? ` · best going ×${r.laneHardness}` : ''}{r.chokeHeld ? ' · choke held' : ''}</span>
          <span title="How far each kind of watch sees in today's fog; thermal sees through it">Sight: eye {lengthText(r.sight.eye)} · camera {lengthText(r.sight.camera)} · night vision {lengthText(r.sight.nvg)} · thermal {lengthText(r.sight.thermal)}</span>
        </div>; })()}
        <button style={btn(w.showBoundary)} title="Draw the property line on the ground (it also shows while you draw a fence or wall)" onClick={() => w.setShowBoundary(!w.showBoundary)}>Boundary</button>
        <button style={btn(w.photo)} onClick={() => w.setPhoto(!w.photo)}>Photo</button>
        {w.photo && <>
          <span>{clock(w.timeOfDay)}</span>
          <input type="range" min={0} max={24} step={0.05} value={w.timeOfDay} onChange={e => w.setTimeOfDay(+e.target.value)} />
          <span>{dateLabel(w.dayOfYear)}</span>
          <input type="range" min={1} max={365} step={1} value={w.dayOfYear} onChange={e => w.setDayOfYear(+e.target.value)} />
        </>}
      </div>}
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
        <Row label={<b style={{ color: '#eee' }}>{fullName(child)}, {child.age}</b>} value={`${pluralize(day - c.day, 'day')}`} tone="bad" />
        <Note>Taken by {c.crew} · {KNOWN_TEXT[c.known]}</Note>
        {c.leads.slice(-3).reverse().map((l, i) => {
          const a = leadAge(game, l);
          return <div key={i} style={{ fontSize: 11.5, margin: '3px 0', opacity: i ? 0.6 : 1 }}>
            {l.far ? <><span style={{ color: a <= FAR_COLD ? TONE.warn : DIM }}>Far rumor, {a === 0 ? 'today' : `${pluralize(a, 'day')} ago`}{a > FAR_COLD ? ' · cold' : ''}:</span> {l.where}, {kmText(l.km)}</>
              : <><span style={{ color: a <= LEAD_WARM ? TONE.good : a <= LEAD_COLD ? TONE.warn : DIM }}>{SOURCE_NAME[l.source]}, {a === 0 ? 'today' : `${pluralize(a, 'day')} ago`}{a > LEAD_COLD ? ' · cold' : a > LEAD_WARM ? ' · cooling' : ''}:</span> {l.where}, {kmText(l.km)} · {l.count} of them{l.seenAlive ? ' · seen alive' : ''}</>}
          </div>;
        })}
        {!c.leads.length && <Note>No lead yet. A radio, the neighbors, a prisoner who talks: someone may hear something.</Note>}
        {!out && c.known !== 'traded' && <>
          {lead && age <= LEAD_COLD && <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11.5, color: DIM, marginBottom: 2 }}>Who goes to {lead.where}:</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {can.map(p => <button key={p.id} style={btn(pickd.includes(p.id))} title={`Health ${Math.round(game.personState.find(x => x.id === p.id)?.needs.health ?? 0)}`} onClick={() => { setTeam({ ...team, [c.pid]: pickd.includes(p.id) ? pickd.filter(x => x !== p.id) : [...pickd, p.id] }); setOdds({ ...odds, [c.pid]: -1 }); }}>{p.first}</button>)}
              {!can.length && <Note tone="warn">Nobody is well enough to go.</Note>}
            </div>
            {allyN > 0 && <button style={{ ...btn(askAllies), width: '100%', marginTop: 4 }} title="Neighbors on the radio net who like you. Their men can be hurt or killed, and they'll hold it against you if it goes badly." onClick={() => { setAskAllies(!askAllies); setOdds({ ...odds, [c.pid]: -1 }); }}>{askAllies ? '✓ ' : ''}Ask the neighbors: {allies.map(a => `${a.name} (${a.n})`).join(', ')}</button>}
            {pickd.length > 0 && <Note tone="warn">Staying: {staying.map(p => p.first).join(', ') || 'nobody'} ({staying.filter(p => !p.kid || p.age >= 15).length} who can shoot). The place is lightly held for {pluralize(lead.km > 25 ? 'four' : 'two', 'day')}.</Note>}
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
              <div style={{ fontSize: 11.5, color: DIM, marginBottom: 2 }}>Drive to {fl.where} ({kmText(fl.km)}, {gallonsText(fuel.liters)} of fuel there and back, {pluralize(2 * Math.ceil(fl.km / 150), 'day')}{fuel.truck ? '' : ', no running truck'}). Who goes (up to 3):</div>
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
const KIND_MARK: Record<string, string> = { era: '◆', birth: '✦', death: '✝', partner: '♥', coming: '▲', milestone: '★', retire: '·', home: '⌂', threat: '▼', bond: '✧' };

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
      {L.threat && <Row label={THREAT_NAME[L.threat.kind]} value={L.threat.kind === 'hard_winter' ? 'coming' : 'this year'} title="A small yearly threat while the world has not come back (long game). Cozy has none." />}
      {born > 0 && <Row label="Born on the place" value={born} />}
      <Row label="Dynasty score" value={Math.round(L.points).toLocaleString('en-US')} title={Object.entries(L.parts ?? {}).filter(([, v]) => v >= 1).map(([k, v]) => `${PART_LABEL[k] ?? k}: ${Math.round(v)}`).join('\n') || "A point for each person-year on the place, each era's grade, 25 for each child, the milestones, strangers taken in, the size of the place and a place that feeds itself"} />
    </Section>
    <Section title="Generations">
      {generations(game).map(g => <div key={g.gen} style={{ padding: '2px 0' }} title={g.people.map(p => `${p.name}${p.parents.length ? ` (child of ${p.parents.join(' and ')})` : ''}`).join('\n')}>
        <span style={{ color: DIM }}>{roman(g.gen)}</span>{' '}
        {g.people.map((p, i) => <span key={p.id} style={{ color: p.alive ? (p.role === 'heir' ? '#d8c08a' : undefined) : '#8a807a' }}>{i ? ', ' : ''}{p.alive ? '' : '✝ '}{p.name} {p.age}</span>)}
      </div>)}
      {(L.wards ?? []).length > 0 && <div style={{ padding: '2px 0', color: '#d8c08a' }} title="With no grown person left, a neighbor household took the children in. The place is held for them and comes to the eldest at 18.">Away with {game.neighbors.find(n => n.id === L.wards[0].by)?.name ?? 'a neighbor'}: {L.wards.map(w => `${w.person.first} ${w.person.age}`).join(', ')}</div>}
      <Hint more="Gold are the place's own grown children: the heirs. Skills pass to the children when a parent dies; the house, land and supplies stay one household's.">Gold names are the heirs.</Hint>
    </Section>
    {L.eras.length > 0 && <Section title="Eras">
      {L.eras.map(e => <div key={e.n} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
        <span title={e.headline}><span style={{ color: DIM }}>{roman(e.n)}</span> {e.name}</span>
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

/** Questioning a prisoner (sim/interrogation.ts): three questions, kindly or harshly. The answer shows under the buttons and is in the log. */
function Questioning({ id, asked, hurt }: { id: string; asked: readonly Question[]; hurt: boolean }) {
  const ask = useGameStore(s => s.askPrisoner);
  const [harsh, setHarsh] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  if (asked.length >= MAX_QUESTIONS || hurt) return said.length ? <div style={{ fontSize: 11.5, opacity: 0.8, margin: '3px 0' }}>{said.join(' ')}</div> : null;
  return <div style={{ margin: '3px 0' }} data-testid={`questioning-${id}`}>
    <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
      {QUESTIONS.map(q => <button key={q} style={{ ...btn(), flex: 1, fontSize: 11, opacity: asked.includes(q) ? 0.4 : 1 }} disabled={asked.includes(q)} title={harsh ? 'Harsh: he talks more, half of it is what you want to hear. Humanity -4.' : 'Kind: he talks less, and it is true. Humanity +1.'} onClick={() => setSaid(ask(id, q, harsh ? 'harsh' : 'kind'))}>{QUESTION_NAME[q]}</button>)}
    </div>
    <label style={{ fontSize: 11, opacity: 0.8 }}><input type="checkbox" checked={harsh} onChange={e => setHarsh(e.target.checked)} /> Harsh (rope and cold): more answers, less true, -4 humanity</label>
    {said.length > 0 && <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{said.join(' ')}</div>}
  </div>;
}
