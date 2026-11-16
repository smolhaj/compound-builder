/** What the hit moment is doing right now, for the canvas (FL1 plays the cinematic in React; FL2's frame loop reads this to nudge the camera and flash the weather). */
export interface HitLive { flash: number; tint: [number, number, number] | null; bearing?: 'fire' | 'war' | 'town' | 'road' | number | null }
let live: HitLive | null = null;
export const setHitLive = (h: HitLive | null): void => { live = h; };
export const getHitLive = (): HitLive | null => live;
