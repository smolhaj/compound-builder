/**
 * The shots tooling's lighting / weather presets (one place, shared by the QA scripts).
 *   import { LOOKS, applyLook } from './lookPresets.mjs';  await applyLook(page, 'misty');
 *
 *   clear     10:00, mid-August, forced clear weather   (the long-standing default look)
 *   misty     07:00, mid-October, forced fog: valley fog bank under the camp, low cloud, cool overcast light
 *   overcast  11:00, November, overcast: soft light, cool grade, cloud on the ridgelines
 *   drizzle   09:00, October, rain: fine rain, damp ground, cloud on the ridges
 *   dusk      19:00, mid-September, clear
 * Scripts that set the weather themselves keep doing so; `applyLook` is for the ones that take `--look`.
 * `?lowrender` draws no weather unless the page opts in (`__cb.qa.weather = true`), which `applyLook` does for every look but `clear`.
 */
export const LOOKS = {
  clear: { tod: 10, doy: 226, mode: 'clear', season: 'summer' },
  misty: { tod: 7, doy: 288, mode: 'fog', season: 'fall' },
  overcast: { tod: 11, doy: 315, mode: 'overcast', season: 'fall' },
  drizzle: { tod: 9, doy: 292, mode: 'rain', season: 'fall' },
  dusk: { tod: 19, doy: 258, mode: 'clear', season: 'fall' },
};

/** Set a look on a loaded page (sim paused is the caller's business). Returns the preset. */
export async function applyLook(page, name = 'clear', over = {}) {
  const look = { ...(LOOKS[name] ?? LOOKS.clear), ...over };
  await page.evaluate(p => {
    const cb = window.__cb, s = cb.store.getState();
    if (p.mode !== 'clear') cb.qa.weather = true;
    s.setWeatherMode(p.mode); s.setSeasonMode(p.season); s.setDayOfYear(p.doy); s.setTimeOfDay(p.tod);
  }, look);
  // the weather layer and the valley fog ease in over some seconds: step them rather than wait
  await page.evaluate(p => { const { weather, valley } = window.__cb; if (!weather?.sim) return; for (let i = 0; i < 14; i++) weather.sim.update(5, p.season === 'summer' ? 'summer' : 'fall', p.tod, p.mode); valley?.snap?.(); }, look);
  return look;
}
