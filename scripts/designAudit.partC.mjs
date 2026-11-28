// Part C: sightlines with settle time, eye level, time of day, quality tiers, the report card (forced). Every stage is guarded so one miss does not lose the queue slot.
const { page, shot, note, txt, port } = globalThis.A;
const safe = async (name, f) => { try { await f(); } catch (e) { note(`STAGE ${name} failed: ${String(e.message).slice(0, 120)}`); } };
const click = async (re, wait = 20000) => { const b = page.getByRole('button', { name: re }).first(); try { await b.waitFor({ timeout: wait }); if (!(await b.isEnabled())) return false; await b.click({ timeout: 5000 }); return true; } catch { return false; } };
const evalp = (f, a) => page.evaluate(f, a);
const frameCamp = (r = 26, pitch = 1.0, yaw = 0.3) => evalp(([r, p, y]) => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = r; cam.pitch = p; cam.yaw = y; }, [r, pitch, yaw]);
const settle = async (ms = 6000) => { for (let i = 0; i < ms / 1000; i++) { await evalp(() => window.__cb.qa.renderNow()).catch(() => {}); await page.waitForTimeout(1000); } };
const set = (o) => evalp(o => { const s = window.__cb.store.getState(); if (o.photo !== undefined) s.setPhoto(o.photo); if (o.t !== undefined) s.setTimeOfDay(o.t); if (o.season) s.setSeasonMode(o.season); if (o.weather) s.setWeatherMode(o.weather); if (o.q) s.setQuality(o.q); if (o.sight) s.setSightMode(o.sight); }, o);

await page.goto(`http://localhost:${port}/?new&lowrender&looktier=high`);
await page.getByText('1. Region').waitFor();
await page.waitForFunction(() => window.__cb?.qa?.lowrender);
await evalp(() => { try { localStorage.clear(); } catch {} });
await page.getByRole('button', { name: /Mountain West/ }).first().click();
await page.getByRole('button', { name: 'Next', exact: true }).click();
const cards = page.locator('button', { hasText: /acres/ }).filter({ hasText: /Leaves \$/ });
if (await cards.count()) await cards.first().click();
await page.getByRole('button', { name: 'Next', exact: true }).click();
await page.getByRole('button', { name: /^Scenario/ }).click();
await page.getByRole('button', { name: '18 months', exact: true }).click().catch(() => {});
await page.getByRole('button', { name: 'Standard', exact: true }).click();
await page.getByRole('button', { name: 'Buy it and start' }).click();
await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
await evalp(() => window.__cb.game.getState().setSpeed(0));
await page.waitForTimeout(1500);
await safe('starter', async () => { await click(/Lay out a starter compound/); await click(/^Place all$/); await page.waitForTimeout(1000); await page.keyboard.press('Escape'); });
await safe('order', async () => { await page.keyboard.press('KeyS'); await click(/Order what the plans need/, 8000); await page.keyboard.press('Escape'); });
await safe('crews', async () => {
  const ids = await evalp(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => s.id));
  for (const id of ids.slice(0, 5)) { await evalp(i => window.__cb.game.getState().select(i), id); await click(/Hire a crew/, 3000); }
  await evalp(() => window.__cb.game.getState().select(null));
});
await safe('advance', async () => { await evalp(() => window.__cb.game.getState().advance(14)); });
await set({ photo: true, t: 10.5, season: 'summer', weather: 'clear' });
await frameCamp(26, 0.9, 0.3);
await safe('noon', async () => { await settle(5000); await shot('c01-summer-noon'); });
await safe('road', async () => { await set({ sight: 'road' }); await settle(12000); await shot('c02-sight-road'); });
await safe('ridge', async () => { await set({ sight: 'ridge' }); await settle(12000); await shot('c03-sight-ridge'); await set({ sight: 'off' }); });
await safe('eye1', async () => { await frameCamp(2.6, 0.12, 0.8); await settle(4000); await shot('c04-eye-level-a'); });
await safe('eye2', async () => { await frameCamp(2.6, 0.12, 2.4); await settle(4000); await shot('c05-eye-level-b'); });
await safe('golden', async () => { await set({ t: 18.6 }); await frameCamp(22, 0.7, 0.5); await settle(8000); await shot('c06-golden-hour'); });
await safe('night', async () => { await set({ t: 21.5 }); await settle(8000); await shot('c07-night'); });
await safe('fall', async () => { await set({ t: 10.5, season: 'fall', weather: 'rain' }); await settle(12000); await shot('c08-fall-rain'); });
for (const q of ['low', 'medium', 'high']) await safe('q-' + q, async () => { await set({ weather: 'clear', season: 'summer', t: 10.5, q }); await frameCamp(14, 0.55, 0.4); await settle(9000); await shot('c09-quality-' + q); });
await safe('report', async () => {
  await set({ photo: false });
  await evalp(() => { const G = window.__cb.game, g = structuredClone(G.getState().game); g.ending = { kind: 'wipe', day: Math.floor(g.clock.t), continued: false }; G.setState({ game: g }); });
  await settle(4000); await shot('c10-report-card-forced'); note('REPORT ' + (await txt()).slice(0, 1500));
});
note('loop end');
