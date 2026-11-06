import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { Hud } from './ui/Hud';
import { LoadingScreen } from './ui/LoadingScreen';
import { PerfNotice } from './ui/PerfNotice';
import { SetupScreen } from './ui/SetupScreen';
import { ShopWindow } from './ui/ShopWindow';
import { SchedulePanel } from './ui/SchedulePanel';
import { Ticker } from './ui/Ticker';
import { BattleOverlay } from './ui/BattleOverlay';
import { GateCard } from './ui/GateCard';
import { CutsceneOverlay } from './ui/CutsceneOverlay';
import { ReportCard } from './ui/ReportCard';
import { DayCard } from './ui/DayCard';
import { TitleScreen } from './ui/feel/TitleScreen';
import { RecapCard } from './ui/feel/RecapCard';
import { PurchaseToast, MilestoneCard } from './ui/feel/PurchaseToast';
import { useOverlayPlan } from './ui/feel/useOverlayPlan';
import { startFeedback } from './ui/feel/feedbackWatcher';
import { useFeelStore } from './store/feelStore';
import { useGameStore } from './store/gameStore';
import { useWorldStore } from './store/worldStore';
import { loadGame, AUTOSAVE } from './sim/save/saveSystem';
import { newGame } from './sim/state';
import { makeLotSite } from './sim/lotListing';
import type { LotKind } from './sim/lots';
import { CLASSIC, type Acres } from './sim/site';
import type { RegionId } from './sim/regions';

/**
 * Boot: resume the autosave if there is one; `?seed=N` or `?new` starts a
 * fresh game instead (QA shots always pass a seed).
 */
export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    const q = new URLSearchParams(location.search);
    const fresh = q.has('seed') || q.has('new');
    (fresh ? Promise.resolve(null) : loadGame(AUTOSAVE)).then(saved => {
      // QA: ?lot=gorge&relief=9&acres=40&region=mountain_west&seed=3 starts a place on that lot archetype
      const lotKind = q.get('lot') as LotKind | null;
      const lotSite = lotKind ? makeLotSite({ kind: lotKind, relief: Number(q.get('relief') ?? 8), acres: Number(q.get('acres') ?? 40) as Acres, region: (q.get('region') ?? 'mountain_west') as RegionId, seed: Number(q.get('lotseed') ?? 3), outlier: q.has('outlier'), creek: q.has('lotcreek'), cutbank: q.has('lotcut'), flip: q.get('flip') === '-1' ? -1 : 1, elevM: Number(q.get('elev') ?? 2000) }) : null;
      // QA: ?region=plains (no lot) is the classic forty in that region; &drive puts the gravel drive in (the road works are drawn only once it is built)
      const regionSite = !lotSite && q.has('region') ? { ...CLASSIC, region: q.get('region') as RegionId, creek: !q.has('nocreek') } : null;
      const qaSite = lotSite ?? regionSite;
      if (qaSite && q.has('drive')) qaSite.improvements = { ...qaSite.improvements, drive: true };
      const game = saved ?? (qaSite ? newGame(useWorldStore.getState().seed, undefined, undefined, { site: qaSite }) : newGame(useWorldStore.getState().seed));
      if (!saved && q.has('bridgedown')) game.roadBridge = { down: true, due: null };   // QA: the bridge on the way in, brought down
      // a saved game is picked up paused: Continue shows "Where we left off" and the clock waits for the answer
      const resumeSpeed = saved ? saved.clock.speed : 0;
      if (saved && !fresh) game.clock = { ...game.clock, speed: 0 };
      useGameStore.getState().load(game);
      useFeelStore.getState().setRecap(null, resumeSpeed);
      if (q.has('new')) useGameStore.getState().openSetup(true);   // QA: straight to the new-game screen
      else if (!q.has('seed')) useFeelStore.getState().setTitle(true, !!saved);   // the title screen: Continue (if a save) and New game
      stop = startFeedback();
      setReady(true);
    });
    return () => { stop?.(); };
  }, []);
  const setup = useGameStore(s => s.setupOpen);
  const shop = useGameStore(s => s.shopOpen);
  const schedule = useGameStore(s => s.scheduleOpen);
  const raid = useGameStore(s => s.cutscene !== null);
  const title = useFeelStore(s => s.title);
  const plan = useOverlayPlan();
  // a new place (another seed or listing) is a new world
  const worldKey = useGameStore(s => `${s.game.seed}:${s.game.site.id}:${s.game.site.creek}:${s.game.site.lot?.kind ?? ''}${s.game.site.lot?.seed ?? ''}`);
  const clean = new URLSearchParams(location.search).has('clean');
  if (!ready) return null;
  return (
    <>
      <GameCanvas key={worldKey} />
      <LoadingScreen />
      <PerfNotice />
      {!raid && !title && <Hud />}
      {!clean && !raid && <PurchaseToast />}
      {!clean && !raid && plan.milestone && <MilestoneCard />}
      {!clean && !raid && <Ticker />}
      {!clean && !raid && <BattleOverlay />}
      {!clean && <CutsceneOverlay />}
      {!clean && plan.gate && <GateCard />}
      {!clean && plan.ending && <ReportCard />}
      {!clean && plan.dayCard && <DayCard />}
      {shop && !clean && !raid && <ShopWindow />}
      {schedule && !clean && <SchedulePanel />}
      {setup && !clean && <SetupScreen />}
      {!clean && plan.recap && <RecapCard />}
      {!clean && <TitleScreen />}
    </>
  );
}
