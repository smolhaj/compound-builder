import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { resumeRecap } from '../../sim/resumeRecap';

/** Leave the title screen and show "Where we left off" for the loaded save. */
export function continueGame(): void {
  const f = useFeelStore.getState(), g = useGameStore.getState();
  f.setRecap(resumeRecap(g.game), f.recapSpeed);
  f.setTitle(false);
}
