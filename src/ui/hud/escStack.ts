/**
 * One ordered close stack for Esc (docs/UX_AUDIT.md 11.5), pure. One press closes one thing: the topmost layer that is up.
 *   tool > overlay (a decision, the recap, the welcome card) > window (Board, Shop, new game, schedule, a menu) > camera mode > view box > drawer
 * Layers the stack `owns` it closes itself (the welcome card, the View box, the drawer); for the others the layer's own handler
 * does the closing, and the stack only makes sure nothing underneath closes on the same press.
 */
export type EscLayer = 'tool' | 'overlay' | 'window' | 'camera' | 'view' | 'drawer';
export const ESC_ORDER: readonly EscLayer[] = ['tool', 'overlay', 'window', 'camera', 'view', 'drawer'];
export type EscSnapshot = Record<EscLayer, boolean>;
export const NO_ESC: EscSnapshot = { tool: false, overlay: false, window: false, camera: false, view: false, drawer: false };

/** The layer this press belongs to, or null when nothing is up. */
export function escTop(s: EscSnapshot): EscLayer | null {
  return ESC_ORDER.find(l => s[l]) ?? null;
}
/** Whether the stack closes the layer itself (true) or leaves it to the layer's own Esc handler (false). */
export const escOwns = (l: EscLayer): boolean => l === 'view' || l === 'drawer';
