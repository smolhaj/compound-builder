const { page, shot, note, txt, port, shotWizard, out } = globalThis.A;
const click = async (re, o = {}) => { const b = page.getByRole('button', { name: re }); if (await b.count()) { if (!(await b.first().isEnabled())) return false; await b.first().click({ timeout: 4000, ...o }).catch(() => b.first().dispatchEvent('click')); return true; } return false; };
const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(400); };
const evalp = (f, a) => page.evaluate(f, a);
const frameCamp = (r = 26, pitch = 1.0, yaw = 0.3) => evalp(([r, p, y]) => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = r; cam.pitch = p; cam.yaw = y; }, [r, pitch, yaw]);
const closeDrawer = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };

// ---------- title and wizard ----------
await page.goto(`http://localhost:${port}/?new&lowrender&looktier=high`);
await page.getByText('1. Region').waitFor();
await page.waitForFunction(() => window.__cb?.qa?.lowrender);
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await shotWizard('1-region');
note('REGION TEXT ' + (await txt()).slice(0, 1200));
await page.getByRole('button', { name: /Mountain West/ }).first().click();
await page.getByRole('button', { name: 'Next', exact: true }).click();
await page.waitForTimeout(800);
await shotWizard('2-land');
note('LAND TEXT ' + (await txt()).slice(0, 1800));
const cards = page.locator('button', { hasText: /acres/ }).filter({ hasText: /Leaves \$/ });
if (await cards.count()) await cards.first().click();
await page.getByRole('button', { name: 'Next', exact: true }).click();
await page.waitForTimeout(800);
await shotWizard('3-family');
note('FAMILY TEXT ' + (await txt()).slice(0, 2500));
await page.getByRole('button', { name: /^Scenario/ }).click();
await page.getByRole('button', { name: '18 months', exact: true }).click().catch(() => {});
await page.getByRole('button', { name: 'Standard', exact: true }).click();
await page.waitForTimeout(500);
await shotWizard('4-mode');
await page.getByRole('button', { name: 'Buy it and start' }).click();
await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
await evalp(() => window.__cb.game.getState().setSpeed(0));
await page.waitForTimeout(1500);
await frameCamp();
await shot('01-start-hud');
note('START TEXT ' + (await txt()).slice(0, 1500));

// ---------- first moves ----------
if (await click(/Lay out a starter compound/)) { await page.waitForTimeout(800); await shot('02-starter-preview'); note('STARTER ' + (await txt()).slice(0, 900)); await click(/^Place all$/); await page.waitForTimeout(800); }
await shot('03-after-place');
await key('KeyB'); await shot('04-build-drawer'); await closeDrawer();
for (const [k, nm] of [['KeyF', 'people'], ['KeyS', 'supplies'], ['KeyT', 'utilities'], ['KeyL', 'land'], ['KeyD', 'defense'], ['KeyO', 'outside'], ['KeyP', 'projects'], ['KeyY', 'years'], ['KeyN', 'board']]) {
  await key(k); await page.waitForTimeout(500); await shot('05-drawer-' + nm); note('DRAWER ' + nm + ' ' + (await txt()).slice(0, 700)); await closeDrawer();
}
await key('KeyM'); await page.waitForTimeout(800); await shot('06-shop'); await closeDrawer();
// order, hire
await key('KeyS'); const ordered = await click(/Order what the plans need/); note('ordered ' + ordered); await closeDrawer();
const ids = await evalp(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => s.id));
for (const id of ids.slice(0, 5)) { await evalp(i => window.__cb.game.getState().select(i), id); await click(/Hire a crew/); }
await evalp(() => window.__cb.game.getState().select(null));
await evalp(() => window.__cb.game.getState().advance(3));
await frameCamp(20, 0.8, 0.5); await shot('07-construction-day3');
await evalp(() => window.__cb.game.getState().advance(25));
await frameCamp(22, 0.9, 0.4); await shot('08-day28');
note('DAY28 ' + (await txt()).slice(0, 900));

// ---------- views and overlays ----------
await click(/View settings/); await page.waitForTimeout(500); await shot('09-view-panel'); note('VIEW ' + (await txt()).slice(0, 600));
const w = await evalp(() => { const s = window.__cb.store.getState(); return Object.keys(s).filter(k => /^set/.test(k)).length; });
await evalp(() => window.__cb.store.getState().setBlueprint(true)); await page.waitForTimeout(600); await shot('10-blueprint');
await evalp(() => window.__cb.store.getState().setBlueprint(false));
for (const m of ['road', 'ridge', 'night']) { await evalp(m => window.__cb.store.getState().setSightMode(m), m); await page.waitForTimeout(500); await shot('11-sight-' + m); }
await evalp(() => window.__cb.store.getState().setSightMode('off'));
for (const m of ['high', 'lanes', 'water', 'sun', 'shade', 'fire']) { await evalp(m => window.__cb.store.getState().setTerrainMode(m), m); await page.waitForTimeout(500); await frameCamp(40, 1.1, 0.4); await shot('12-terrain-' + m); }
await evalp(() => window.__cb.store.getState().setTerrainMode('off'));
await evalp(() => window.__cb.store.getState().setWeakView(true)); await shot('13-weakspots'); await evalp(() => window.__cb.store.getState().setWeakView(false));
await click(/View settings/);
// ---------- eye level / scale / time of day / weather / quality ----------
await frameCamp(12, 0.5, 0.6); await shot('14-low-diorama');
await evalp(() => { const s = window.__cb.store.getState(); s.setPhoto(true); s.setTimeOfDay(19.2); });
await frameCamp(26, 0.9, 0.3); await shot('15-dusk');
await evalp(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(23); });
await shot('16-night');
await evalp(() => { const s = window.__cb.store.getState(); s.setTimeOfDay(10); s.setSeasonMode('winter'); s.setWeatherMode('snow'); });
await shot('17-winter-snow');
await evalp(() => { const s = window.__cb.store.getState(); s.setSeasonMode('auto'); s.setWeatherMode('rain'); s.setTimeOfDay(15); });
await shot('18-rain');
await evalp(() => { const s = window.__cb.store.getState(); s.setSeasonMode('fall'); s.setWeatherMode('clear'); s.setTimeOfDay(17); });
await shot('19-fall');
await evalp(() => { const s = window.__cb.store.getState(); s.setSeasonMode('auto'); s.setTimeOfDay(10); });
for (const q of ['low', 'medium']) { await evalp(q => window.__cb.store.getState().setQuality(q), q); await page.waitForTimeout(800); await frameCamp(26, 0.9, 0.3); await shot('20-quality-' + q); }
await evalp(() => window.__cb.store.getState().setQuality('high'));
// walk mode, eye level
await click(/^Walk$/); await page.waitForTimeout(1200); await shot('21-walk-mode');
await evalp(() => { const cb = window.__cb; cb.store.getState().setCameraMode('walk'); });
await page.waitForTimeout(800); await shot('22-walk-2');
await evalp(() => window.__cb.store.getState().setCameraMode('diorama'));
// hide panels
await key('KeyH'); await shot('23-hud-hidden'); await key('KeyH');
// viewports
for (const [vw, vh, nm] of [[1280, 720, '1280x720'], [1100, 700, '1100x700'], [390, 844, 'phone']]) {
  await page.setViewportSize({ width: vw, height: vh }); await page.waitForTimeout(1200); await frameCamp(26, 0.9, 0.3); await shot('24-vp-' + nm);
  await key('KeyB'); await page.waitForTimeout(600); await shot('24-vp-' + nm + '-build'); await closeDrawer();
}
await page.setViewportSize({ width: 1512, height: 860 });
note('DONE B');
