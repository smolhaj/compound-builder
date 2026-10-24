import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { Hud } from './ui/Hud';
import { SetupScreen } from './ui/SetupScreen';
import { Ticker } from './ui/Ticker';
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
      if (!saved && !q.has('seed')) useGameStore.getState().openSetup(true);
      setReady(true);
    });
  }, []);
  const setup = useGameStore(s => s.setupOpen);
  const clean = new URLSearchParams(location.search).has('clean');
  if (!ready) return null;
  return (
    <>
      <GameCanvas />
      <Hud />
      {!clean && <Ticker />}
      {setup && !clean && <SetupScreen />}
    </>
  );
}
