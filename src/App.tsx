import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { Hud } from './ui/Hud';
import { SetupScreen } from './ui/SetupScreen';
import { ShopWindow } from './ui/ShopWindow';
import { Ticker } from './ui/Ticker';
import { GateCard } from './ui/GateCard';
import { ReportCard } from './ui/ReportCard';
import { useGameStore } from './store/gameStore';
import { useWorldStore } from './store/worldStore';
import { loadGame, AUTOSAVE } from './sim/save/saveSystem';
import { newGame } from './sim/state';

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
      const game = saved ?? newGame(useWorldStore.getState().seed);
      useGameStore.getState().load(game);
      // no game to resume (and not a QA shot): the new-game screen
      if (!saved && (!q.has('seed') || q.has('new'))) useGameStore.getState().openSetup(true);
      setReady(true);
    });
  }, []);
  const setup = useGameStore(s => s.setupOpen);
  const shop = useGameStore(s => s.shopOpen);
  // a new place (another seed or listing) is a new world
  const worldKey = useGameStore(s => `${s.game.seed}:${s.game.site.id}:${s.game.site.creek}`);
  const clean = new URLSearchParams(location.search).has('clean');
  if (!ready) return null;
  return (
    <>
      <GameCanvas key={worldKey} />
      <Hud />
      {!clean && <Ticker />}
      {!clean && <GateCard />}
      {!clean && <ReportCard />}
      {shop && !clean && <ShopWindow />}
      {setup && !clean && <SetupScreen />}
    </>
  );
}
