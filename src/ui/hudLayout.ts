/** Side-panel widths and the margin round them. */
import { useEffect, useState, type RefObject } from 'react';

export const LEFT_W = 244, RIGHT_W = 320, EDGE = 10, BOTTOM = 34;

/**
 * Where the top bar, the two side panels and the two bottom panels go so none sits under another: the bar wraps
 * within the window; the side panels stay beside it when it fits between them and drop below it otherwise; under
 * 760 px only one side panel shows at a time (a Build / Family switch), and the view panel stacks above the camera
 * panel whenever the two would meet. Pure numbers in, numbers out (tested in hudLayout.test.ts).
 */
export function hudLayout(vw: number, barW: number, barH: number, br = { w: 570, h: 40 }, bl = { w: 560, h: 40 }): { narrow: boolean; panelTop: number; leftW: number; rightW: number; switchTop: number; bottomReserve: number; viewBottom: number } {
  const narrow = vw < 760;
  const fits = !narrow && barH < 60 && barW <= vw - (LEFT_W + RIGHT_W + 2 * EDGE + 2 * 16);
  const below = EDGE + barH + 8;
  const stacked = vw < br.w + bl.w + 3 * EDGE;   // the two bottom panels would meet: stack them
  const viewBottom = stacked ? BOTTOM + br.h + 6 : BOTTOM;
  return {
    narrow, panelTop: fits ? EDGE : narrow ? below + 30 : below,
    leftW: Math.min(LEFT_W, vw - 2 * EDGE), rightW: Math.min(RIGHT_W, vw - 2 * EDGE), switchTop: below,
    // what the side panels leave clear at the bottom: the bottom panels (stacked when narrow, side by side otherwise)
    bottomReserve: stacked ? viewBottom + bl.h + 10 : Math.max(br.h, bl.h) + BOTTOM + 8,
    viewBottom,
  };
}

/** A box's size, kept current (window resize and the element's own changes) along with the window width. */
export function useBox(ref: RefObject<HTMLElement | null>): { vw: number; w: number; h: number } {
  const [b, setB] = useState({ vw: typeof window === 'undefined' ? 1280 : window.innerWidth, w: 700, h: 40 });
  useEffect(() => {
    const read = () => { const r = ref.current?.getBoundingClientRect(); setB(o => { const n = { vw: window.innerWidth, w: Math.round(r?.width ?? o.w), h: Math.round(r?.height ?? o.h) }; return n.vw === o.vw && n.w === o.w && n.h === o.h ? o : n; }); };
    read();
    window.addEventListener('resize', read);
    const ro = typeof ResizeObserver !== 'undefined' && ref.current ? new ResizeObserver(read) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => { window.removeEventListener('resize', read); ro?.disconnect(); };
  }, [ref]);
  return b;
}
