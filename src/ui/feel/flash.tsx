/** Brief highlight for a row or tab the player just touched (store/feelStore.ts `flash`). */
import { useFeelStore } from '../../store/feelStore';

/** `1` while `key` is lit, else undefined: spread it as `data-flash`. */
export const useFlash = (key: string | undefined): '1' | undefined => useFeelStore(s => (key && s.flash[key] ? '1' : undefined));
