import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { planningHold } from '../../sim/clockResume';
import { useWorldStore } from '../../store/worldStore';
import { useFeltStore } from '../../store/feltStore';
import { feltCardPending, hitMomentUp } from '../../sim/felt/state';
import { hitFor } from '../../sim/felt/hitMoment';
import { overlayPlan, type OverlayPlan } from '../../sim/overlayQueue';

/** Which of the cards over the map is up right now (sim/overlayQueue.ts). */
export function useOverlayPlan(): OverlayPlan {
  const title = useFeelStore(s => s.title), recap = useFeelStore(s => s.recap !== null), milestones = useFeelStore(s => s.cards.length);
  const setup = useGameStore(s => s.setupOpen), cutscene = useGameStore(s => s.cutscene);
  const ending = useGameStore(s => !!s.game.ending && !s.game.ending.continued);
  const decision = useGameStore(s => !!(s.game.gate.pending || s.game.gate.card || s.game.gate.aftermath));
  const planning = useGameStore(s => planningHold(s.tool, s.planOpen));
  const dayCard = useGameStore(s => s.dayCard !== null);
  const feltCard = useGameStore(s => feltCardPending(s.game));
  const hasHit = useGameStore(s => !!hitFor(s.game.disaster.kind));
  const board = useWorldStore(w => w.boardOpen);
  const { hitShown, skipHit } = useFeltStore();
  const hitMoment = hitMomentUp(useGameStore(s => s.dayCard), hitShown, skipHit, hasHit);
  const welcome = useGameStore(s => s.welcome && useWorldStore.getState().layout === 'a');
  return overlayPlan({ title, setup, ending, cutscene: cutscene ? (cutscene.phase === 'prompt' ? 'prompt' : 'playing') : 'none', decision, dayCard, recap, milestones, planning, hitMoment, feltCard, board, welcome });
}
