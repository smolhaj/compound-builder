/** Date and clock text for the HUD bars (shared by the Classic bar and layout A). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export function dateLabel(doy: number): string {
  let m = 11;
  while (m > 0 && doy <= MONTH_START[m]) m--;
  return `${MONTHS[m]} ${doy - MONTH_START[m]}`;
}
export const clock = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
export const seasonOfDoy = (doy: number): string => (doy >= 355 || doy < 80 ? 'Winter' : doy < 172 ? 'Spring' : doy < 264 ? 'Summer' : 'Fall');
