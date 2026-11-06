/** What to call the report card after a raid, by the clock it is read at (it said "The morning after" at 3:04 AM). `hour` is 0-24. */
export function afterLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h >= 21) return 'Later that night';
  if (h < 7) return 'First light';
  if (h < 12) return 'The morning after';
  if (h < 17) return 'The afternoon after';
  return 'The evening after';
}
