import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { Hud } from './ui/Hud';
import { SetupScreen } from './ui/SetupScreen';
import { ShopWindow } from './ui/ShopWindow';
import { SchedulePanel } from './ui/SchedulePanel';
import { Ticker } from './ui/Ticker';
import { BattleOverlay } from './ui/BattleOverlay';
import { GateCard } from './ui/GateCard';
import { CutsceneOverlay } from './ui/CutsceneOverlay';
import { ReportCard } from './ui/ReportCard';
import { useGameStore } from './store/gameStore';
import { useWorldStore } from './store/worldStore';
import { loadGame, AUTOSAVE } from './sim/save/saveSystem';
import { newGame } from './sim/state';
import { makeLotSite } from './sim/lotListing';
import type { LotKind } from './sim/lots';
import type { Acres } from './sim/site';
import type { RegionId } from './sim/regions';

/**
 * Boot: resume the autosave if there is one; `?seed=N` or `?new` starts a
 * fresh game instead (QA shots always pass a seed).
 */
export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const fresh = q.has('seed') || q.has('new');
    (fresh ? Promise.resolve(null) : loadGame(AUTOSAVE)).then(saved => {
      // QA: ?lot=gorge&relief=9&acres=40&region=mountain_west&seed=3 starts a place on that lot archetype
      const lotKind = q.get('lot') as LotKind | null;
      const lotSite = lotKind ? makeLotSite({ kind: lotKind, relief: Number(q.get('relief') ?? 8), acres: Number(q.get('acres') ?? 40) as Acres, region: (q.get('region') ?? 'mountain_west') as RegionId, seed: Number(q.get('lotseed') ?? 3), outlier: q.has('outlier'), creek: q.has('lotcreek'), flip: q.get('flip') === '-1' ? -1 : 1, elevM: Number(q.get('elev') ?? 2000) }) : null;
      const game = saved ?? (lotSite ? newGame(useWorldStore.getState().seed, undefined, undefined, { site: lotSite }) : newGame(useWorldStore.getState().seed));
      useGameStore.getState().load(game);
      // no game to resume (and not a QA shot): the new-game screen
      if (!saved && (!q.has('seed') || q.has('new'))) useGameStore.getState().openSetup(true);
      setReady(true);
    });
  }, []);
  const setup = useGameStore(s => s.setupOpen);
  const shop = useGameStore(s => s.shopOpen);
  const schedule = useGameStore(s => s.scheduleOpen);
  const raid = useGameStore(s => s.cutscene !== null);
  // a new place (another seed or listing) is a new world
  const worldKey = useGameStore(s => `${s.game.seed}:${s.game.site.id}:${s.game.site.creek}:${s.game.site.lot?.kind ?? ''}${s.game.site.lot?.seed ?? ''}`);
  const clean = new URLSearchParams(location.search).has('clean');
  if (!ready) return null;
  return (
    <>
      <GameCanvas key={worldKey} />
      {!raid && <Hud />}
      {!clean && !raid && <Ticker />}
      {!clean && !raid && <BattleOverlay />}
      {!clean && <CutsceneOverlay />}
      {!clean && <GateCard />}
      {!clean && <ReportCard />}
      {shop && !clean && !raid && <ShopWindow />}
      {schedule && !clean && <SchedulePanel />}
      {setup && !clean && <SetupScreen />}
    </>
  );
}
