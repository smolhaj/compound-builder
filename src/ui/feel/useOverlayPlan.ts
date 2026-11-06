import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { overlayPlan, type OverlayPlan } from '../../sim/overlayQueue';

/** Which of the cards over the map is up right now (sim/overlayQueue.ts). */
export function useOverlayPlan(): OverlayPlan {
  const title = useFeelStore(s => s.title), recap = useFeelStore(s => s.recap !== null), milestones = useFeelStore(s => s.cards.length);
  const setup = useGameStore(s => s.setupOpen), cutscene = useGameStore(s => s.cutscene);
  const ending = useGameStore(s => !!s.game.ending && !s.game.ending.continued);
  const decision = useGameStore(s => !!(s.game.gate.pending || s.game.gate.card || s.game.gate.aftermath));
  const dayCard = useGameStore(s => s.dayCard !== null);
  return overlayPlan({ title, setup, ending, cutscene: cutscene ? (cutscene.phase === 'prompt' ? 'prompt' : 'playing') : 'none', decision, dayCard, recap, milestones });
}
