/** Side-panel widths and the margin round them. */
export const LEFT_W = 244, RIGHT_W = 320, EDGE = 10;

/**
 * Where the top bar and the two side panels go so none sits under another: the bar wraps within the window; the
 * panels stay beside it when it fits between them and drop below it otherwise; under 760 px only one panel shows
 * at a time (a Build / Family switch). Pure numbers in, numbers out (tested in hudLayout.test.ts).
 */
export function hudLayout(vw: number, barW: number, barH: number): { narrow: boolean; panelTop: number; leftW: number; rightW: number; switchTop: number } {
  const narrow = vw < 760;
  const fits = !narrow && barH < 60 && barW <= vw - (LEFT_W + RIGHT_W + 2 * EDGE + 2 * 16);
  const below = EDGE + barH + 8;
  return { narrow, panelTop: fits ? EDGE : narrow ? below + 30 : below, leftW: Math.min(LEFT_W, vw - 2 * EDGE), rightW: Math.min(RIGHT_W, vw - 2 * EDGE), switchTop: below };
}

