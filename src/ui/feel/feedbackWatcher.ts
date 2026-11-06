/**
 * Watches the game store and answers the player: a purchase toast, a brief highlight on the row or tab it touched, a card for a
 * milestone, and the right-hand tab reveals. All of it is UI state (store/feelStore.ts); it never changes the game.
 */
import { useGameStore } from '../../store/gameStore';
import { loadRevealed, loadShown, saveRevealed, saveShown, useFeelStore, worldId } from '../../store/feelStore';
import { celebrations, coalesce, diffAction } from '../../sim/feedbackDiff';
import { revealTabs, type RightTab } from '../../sim/tabReveal';
import { dayIndex, type GameState } from '../../sim/state';
import { holdFactor, takeMute } from './quiet';

const TOAST_MS = 6000;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;
let world = '';
let shown = new Set<string>();

/** Take a game as the start of a world: the tabs it already deserves are shown without a "new" dot, milestones already earned are not announced. */
export function initWorld(g: GameState): void {
  world = worldId(g);
  shown = new Set(loadShown(world));
  const open = revealTabs(new Set(loadRevealed(world)), g);
  saveRevealed(world, open);
  useFeelStore.setState({ revealed: [...open], fresh: [], toast: null, cards: [] });
}

function reveal(g: GameState): void {
  const f = useFeelStore.getState();
  const cur = new Set<RightTab>(f.revealed);
  const now = revealTabs(cur, g);
  if (now.size === cur.size) return;
  const added = [...now].filter(t => !cur.has(t));
  saveRevealed(world, now);
  useFeelStore.setState({ revealed: [...now], fresh: [...new Set([...f.fresh, ...added])] });
}

let stopPrev: (() => void) | null = null;

/** Start watching (a second call replaces the first: StrictMode mounts twice). Returns the stop function. */
export function startFeedback(): () => void {
  stopPrev?.();
  (window as unknown as Record<string, unknown>).__feel = useFeelStore;   // QA: shots read the UI state
  takeMute();   // (the load that brought this game in is over)
  initWorld(useGameStore.getState().game);
  const unsub = useGameStore.subscribe(s => s.game, (next, prev) => {
    const mute = takeMute();
    if (mute || worldId(next) !== world) { initWorld(next); return; }
    const f = useFeelStore.getState();
    const acted = prev.clock.t === next.clock.t;
    // the tab reveals are looked at when the player acts and once a day (not every frame)
    const dayRolled = dayIndex(next.clock.t) !== dayIndex(prev.clock.t);
    if (acted || dayRolled) reveal(next);
    if (acted) {
      const evs = diffAction(prev, next);
      if (evs.length) {
        const t = coalesce(f.toast, evs, Math.round(next.money), Date.now(), ++toastId);
        f.setToast(t);
        f.lightUp(evs.flatMap(e => e.flash));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => useFeelStore.getState().setToast(null), TOAST_MS * holdFactor());
        // buying reveals what it touches (a defense purchase shows Defense)
        reveal(next);
      }
    }
    // milestones come on the clock as well as on a click
    if (next.lineage.milestones.length !== prev.lineage.milestones.length || dayRolled || next.gate.waves?.n !== prev.gate.waves?.n || next.gate.pending !== prev.gate.pending) {
      const cards = celebrations(prev, next, shown);
      if (cards.length) {
        for (const c of cards) shown.add(c.id);
        saveShown(world, shown);
        f.pushCards(cards);
        f.lightUp(cards.flatMap(c => c.flash));
      }
    }
  });
  stopPrev = () => { unsub(); clearTimeout(toastTimer); };
  return stopPrev;
}
