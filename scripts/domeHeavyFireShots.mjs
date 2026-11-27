// Heavy weapons against the sealed Arcology dome: still frames only (docs/ux/arcology-heavy-fire). Visual only: HeavyFx flashes, streaks, puffs and sparks that fade.
//   flock /tmp/cb.lock node scripts/domeHeavyFireShots.mjs <outDir> [port] [names,...]    (W, H, DSF, NIGHT env)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5996), only = (process.argv[4] || '').split(',').filter(Boolean);
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), DSF = Number(process.env.DSF || 1), KIND = 'dome_arcology';
mkdirSync(out + '/dialogue', { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  page.setDefaultTimeout(900000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?seed=7&clean&lowrender=0.9&region=mountain_west&acres=40&relief=0&lotseed=8`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 300000 });
  await page.evaluate(() => window.__cb.store.getState().setQuality?.('high', true));
  const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__cb.qa.renderNow()); await page.waitForTimeout(200); };
  const info = await page.evaluate(async KIND => {
    const cb = window.__cb, G = cb.game, w = cb.world; G.getState().setSpeed(0);
    G.setState(s => ({ game: { ...s.game, money: 900_000_000 } }));
    const y = w.access.yard;
    (await import('/src/game/buildkit/domeBuildings.ts')).setDoorLook('open');
    const sp = cb.tool.findSpot(KIND, y.x - 2.5, y.z - 1.5, 1, 14);
    G.getState().plan(KIND, sp[0], sp[1], 1);
    const st = G.getState().game.structures.at(-1);
    G.setState(s => { const g = structuredClone(s.game); for (const q of g.structures) { q.stage = 99; q.done = 0; q.finishedAt = 0; q.supplied = true; } return { game: g }; });
    { const live = await import('/src/sim/dome/live.ts'); G.setState(s => { const g = structuredClone(s.game); const ref = live.domeOf(g, st.id); if (ref) { const o = live.ownState(g, ref); o.dust = 0; o.co2ppm = 500; } return { game: g }; }); }
    cb.store.getState().setHudHidden?.(true);
    return { id: st.id };
  }, KIND);
  // the kill zone is open ground in play; here foliage that the camera would sit in is hidden (QA only)
  await page.evaluate(() => { const w = window.__cb.world; for (const k of ['forest', 'sage', 'willow', 'rocks', 'farTrees', 'cover']) try { w[k].visible = false; } catch (e) { console.error(k, e.message); } });
  await frames(4);
  const dm = await page.evaluate(async id => { const s = await import('/src/sim/dome/standing.ts'); const d = s.domesOf(window.__cb.game.getState().game).find(x => x.id === id); const a = d.airlocks.find(l => l.role === 'vehicle'); return { r: d.r, x: d.x, z: d.z, a: a ? { angle: a.angle } : null, people: window.__cb.game.getState().game.people.map(p => p.id), sealedLook: d.tier }; }, info.id);
  lap(JSON.stringify(dm));
  const gd = (x, z) => page.evaluate(([x, z]) => window.__cb.world.groundAt(x, z), [x, z]);
  const R = dm.r, A = dm.a.angle;
  const dirOf = ang => [Math.sin(ang), Math.cos(ang)];
  const at = (ang, rho) => { const u = dirOf(ang); return [dm.x + u[0] * rho, dm.z + u[1] * rho]; };
  const pose = async (e, l, fov = 55) => { const ge = await gd(e[0], e[2]), gl = await gd(l[0], l[2]); await page.evaluate(([e, l, fov]) => { window.__cb.qa.pose = { x: e[0], y: e[1], z: e[2], lx: l[0], ly: l[1], lz: l[2], fov }; }, [[e[0], ge + e[1], e[2]], [l[0], gl + l[1], l[2]], fov]); };
  await page.evaluate(() => {
    // the in-page kit: a synthetic sealed scene (no sim), the weapons, the stepping
    window.__hf = {
      async setup(units, night) {
        const bs = (await import('/src/store/battleStore.ts')).useBattleStore, b = window.__cb.battle;
        bs.getState().endBattle(); b.stop(); b.hold = false;
        const L = id => ({ style: 'crew', role: 'soldier', torch: false, tone: Number(id.slice(1)) });
        bs.getState().playBattle({ night, sealed: true, units: units.map(u => ({ id: u.id, side: u.side, x: u.x, z: u.z, personId: u.personId, civilian: u.civ, look: u.side === 'raider' ? L(u.id) : undefined, armor: u.side === 'raider' ? { plate: true, soft: false, helmet: true } : undefined })), events: [], duration: 99999 });
        await new Promise(r => { const t = () => (b.playing ? r() : setTimeout(t, 30)); t(); });
        b.hold = true; window.__props = {}; b._rings.visible = false; b._pips.visible = false;
        // face the raiders at the dome: rot is toward the center of the home units
      },
      prop(id, type, x, z, yaw, y = 0) {
        const cb = window.__cb, b = cb.battle;
        return import('/src/game/battle/HeavyFx.ts').then(m => {
          const o = type === 'tank' ? m.buildTank() : type === 'vbied' ? m.buildBombTruck() : type === 'drone' ? m.buildDrone() : m.buildWeapon(type);
          o.position.set(x, cb.world.groundAt(x, z) + y, z); o.rotation.y = yaw; b.heavy.prop(o); window.__props[id] = o; o.updateMatrixWorld(true);
          return true;
        });
      },
      muzzle(id) { const o = window.__props[id]; o.updateMatrixWorld(true); const m = o.userData.muzzle; return (m ? o.userData.turret.localToWorld(m.clone()) : o.localToWorld(new window.__cb.THREE.Vector3(0, 0.02, 0.06))).toArray(); },
      fire(kind, f, a, n, d = 0) { const T = window.__cb.THREE; window.__cb.battle.heavy.fire(kind, new T.Vector3(...f), new T.Vector3(...a), new T.Vector3(...n), d); },
      step(secs) { const b = window.__cb.battle; b.hold = false; for (let t = 0; t < secs; t += 1 / 60) b.update(1 / 60); b.hold = true; return b.heavy.impacts; },
      stepImpact(count, extra) { const b = window.__cb.battle; b.hold = false; let t = 0; while (b.heavy.impacts < count && t < 4) { b.update(1 / 60); t += 1 / 60; } for (let s = 0; s < extra; s += 1 / 60) b.update(1 / 60); b.hold = true; return b.heavy.impacts; },
      reset() { const b = window.__cb.battle; b.hold = false; b.heavy.end(); b.stop(); window.__cb.qa.pose = null; b.hold = false; },
      clearFx() { window.__cb.battle.heavy.clearFx(); },
      units() { return window.__cb.battle.actors(); },
    };
  });
  const set = js => page.evaluate(js => new Function('cb', js)(window.__cb), js);
  const shot = async name => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('high')); await page.screenshot({ path: `${out}/${name}.png` }); lap(name); };
  // the household stands inside, near the shell on the side of the strike, calm and unarmed
  const household = (ang) => dm.people.slice(0, 3).map((id, i) => { const [x, z] = at(ang + (i - 1) * 0.045, R - 3.6 - (i % 2) * 0.5); return { id: 'h' + i, side: 'home', x, z, personId: id, civ: true }; });
  const crew = (ang, rho, n) => Array.from({ length: n }, (_, i) => { const [x, z] = at(ang + (i - (n - 1) / 2) * 0.035, rho + (i % 2) * 0.5); return { id: 'r' + i, side: 'raider', x, z }; });
  const runs = {
    // each: weapon kind, strike angle, shooter distance from the shell, impact height, camera shots
    rpg: { kind: 'rpg', ang: A + 1.4, d: 7, h: 1.5, prop: 'rpg', t: 0.04, after: 0.2 },
    tank: { kind: 'tank', ang: A + 1.9, d: 10, h: 1.7, prop: 'tank', after: 0.22 },
    hmg: { kind: 'hmg', ang: A + 2.4, d: 7, h: 1.3, prop: 'hmg', after: 0.15 },
    amr: { kind: 'amr', ang: A + 2.2, d: 8, h: 0.5, prop: 'amr', after: 0.1 },
    mortar: { kind: 'mortar', ang: A + 3.3, d: 9, h: 0.3, prop: 'mortar', after: 0.25 },
    thermite: { kind: 'thermite', ang: A + 3.7, d: 2.0, h: 0.5, after: 0.9 },
    drone: { kind: 'drone', ang: A + 4.2, d: 3, h: 1.6, prop: 'drone', after: 0.2 },
    charge: { kind: 'charge', ang: A - 0.0, d: 5, h: 0.35, gate: true, after: 0.2 },
    vbied: { kind: 'vbied', ang: A, d: 3, h: 0.5, cd: 9, gate: true, prop: 'vbied', after: 0.35 },
  };
  // DIALOGUE=1: caption-card frames (the cutscene's letterbox, bold speaker, quoted line) from the real dome line pools (sim/raidLinesDome.ts), at the strike
  const DIALOGUE = !!process.env.DIALOGUE;
  const DLG = {
    rpg: [{ cam: 'crew', file: '01-rpg-direct-hit-hit-it-again', lines: [['r1', 'dome_heavy_rpg', 'any', 0], ['r0', 'dome_heavy_rpg', 'any', 1]] }, { cam: 'inside', file: '07-never-seen-and-household', lines: [['r2', 'dome_never_seen', 'any', 0], ['h0', 'dome_react_heavy', 'civ', 1]] }],
    tank: [{ cam: 'crew', file: '02-tank-should-have-gone-through', lines: [['r2', 'dome_heavy_tank', 'any', 0], ['r0', 'dome_heavy_tank', 'leader', 0]] }, { cam: 'wide', file: '08-we-should-leave', lines: [['r3', 'dome_leave', 'any', 2], ['r0', 'dome_leave', 'leader', 0]] }],
    hmg: [{ cam: 'crew', file: '03-rounds-bouncing', lines: [['r1', 'dome_heavy_mg', 'any', 0], ['r0', 'dome_heavy_mg', 'leader', 0]] }],
    mortar: [{ cam: 'crew', file: '04-young-one-is-it-glass', lines: [['r2', 'dome_heavy_mortar', 'any', 0], ['r4', 'dome_young_asks', 'young', 2]] }],
    charge: [{ cam: 'wide', file: '05-curse-then-leader-goes-quiet', lines: [['r2', 'dome_heavy_charge', 'hard', 0], ['r0', 'dome_quiet', 'leader', 0]] }],
    vbied: [{ cam: 'wide', file: '06-where-is-the-damage', lines: [['r0', 'dome_heavy_vbied', 'leader', 0], ['r1', 'dome_heavy_vbied', 'any', 0]] }],
  };

  const caption = async (lines) => {
    const res = await page.evaluate(async (lines) => {
      const L = await import('/src/sim/raidLinesDome.ts'), D = await import('/src/sim/raidDialogue.ts'), B = await import('/src/sim/dome/domeBeats.ts'), cb = window.__cb;
      const people = cb.game.getState().game.people;
      return lines.map(([who, ctx, v, i]) => {
        const side = who.startsWith('h') ? 'defender' : 'raider', t = L.DOME_LINES[side][ctx][v][i];
        const name = side === 'raider' ? (who === 'r0' ? 'Their leader' : 'Raider') : (people[Number(who.slice(1))]?.first ?? 'Resident');
        return { name, home: side === 'defender', text: D.contract(B.shellWording(t, 'arcology')), ctx };
      });
    }, lines);
    await page.evaluate((res) => {
      document.getElementById('__cap')?.remove();
      const BAR = 'clamp(54px, 12vh, 120px)', FONT = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
      const d = document.createElement('div'); d.id = '__cap';
      const bar = 'position:fixed;left:0;right:0;background:#050504;z-index:2147483000;pointer-events:none;color:#efe6d4;font-family:' + FONT + ';';
      const lab = 'font-size:11px;letter-spacing:2.2px;text-transform:uppercase;opacity:.6;font-family:system-ui,sans-serif;';
      d.innerHTML = `<div style="${bar}top:0;height:${BAR};display:flex;align-items:center;justify-content:space-between;padding:0 clamp(16px,4vw,48px)"><div><div style="${lab}">${window.__dlgLight}</div><div style="font-size:clamp(22px,4.2vh,38px);letter-spacing:1px;line-height:1.1">${window.__dlgClock}</div></div><div style="text-align:center"><div style="${lab}">The raid</div><div style="font-size:clamp(14px,2.4vh,20px)">At the shell</div></div><div style="width:120px"></div></div>`
        + `<div style="${bar}bottom:0;height:${BAR};display:flex;flex-direction:column;justify-content:center;padding:0 clamp(16px,8vw,120px);text-align:center"><div style="font-size:clamp(13px,2.2vh,19px);line-height:1.3">${res.map((l, i, a) => `<div style="opacity:${0.55 + 0.45 * (i + 1) / a.length}"><b style="color:${l.home ? '#9ccdf5' : '#ff8d7c'};font-weight:600">${l.name}: </b><span>“${l.text}”</span></div>`).join('')}</div></div>`;
      document.body.appendChild(d);
    }, res);
    return res;
  };
  const sel = n => !only.length || only.some(o => n.startsWith(o));
  const night = !!process.env.NIGHT;
  await set(`const s = cb.store.getState(); s.setTimeOfDay(${night ? 21.5 : 15.5}); s.setBuildingView('full'); s.setSeasonMode?.('summer'); s.setWeatherMode('clear');`);
  if (night) await page.evaluate(() => window.__cb.game.setState(st => { const g = structuredClone(st.game); g.utilities.lit = ['x']; return { game: g }; }));
  for (const [name, r] of Object.entries(runs)) {
    if (!sel(name)) continue;
    const ang = r.ang, u = dirOf(ang), tn = [u[1], -u[0]];
    const rimR = R + (r.gate ? 0.6 : 0);          // (the gate plane stands a little out of the shell line)
    const P = [dm.x + u[0] * rimR, null, dm.z + u[1] * rimR]; P[1] = (await gd(P[0], P[2])) + r.h;
    const sh = at(ang, R + r.d), shY = await gd(sh[0], sh[1]);
    const units = [...household(ang), ...crew(ang, R + r.d + 1.2, r.kind === 'vbied' ? 3 : 6).map(c => ({ ...c, x: c.x + u[0] * 0.0, z: c.z }))];
    await page.evaluate(([units, night]) => window.__hf.setup(units, night), [units, night]);
    const yaw = Math.atan2(-u[0], -u[1]);          // facing the dome
    let from = [sh[0], shY + 0.22, sh[1]];
    if (r.prop === 'tank') { await page.evaluate(([x, z, yaw]) => window.__hf.prop('t', 'tank', x, z, yaw), [sh[0], sh[1], yaw]); from = await page.evaluate(() => window.__hf.muzzle('t')); }
    else if (r.prop === 'vbied') { await page.evaluate(([x, z, yaw]) => window.__hf.prop('t', 'vbied', x, z, yaw), [sh[0], sh[1], yaw]); from = [sh[0], shY + 0.1, sh[1]]; }
    else if (r.prop === 'drone') { from = [sh[0] + u[0] * -1.6, shY + 1.5, sh[1] + u[1] * -1.6]; await page.evaluate(([x, y, z, yaw]) => window.__hf.prop('t', 'drone', x, z, yaw, y), [from[0], from[1] - shY, from[2], yaw]); }
    else if (r.prop) { await page.evaluate(([x, z, yaw, k]) => window.__hf.prop('t', k, x, z, yaw, 0.17), [sh[0], sh[1], yaw, r.prop]); from = await page.evaluate(() => window.__hf.muzzle('t')); }
    const nrm = [u[0], 0, u[1]];
    const ctr = [dm.x, dm.z], mid = [(sh[0] + P[0]) / 2, (sh[1] + P[2]) / 2], insideAt = (k, lat = 0) => [P[0] - u[0] * k + tn[0] * lat, P[2] - u[1] * k + tn[1] * lat];
    const camShots = {
      wide: () => pose([ctr[0] + u[0] * (R + r.d + 6) + tn[0] * 3, 3.2, ctr[1] + u[1] * (R + r.d + 6) + tn[1] * 3], [mid[0] - u[0] * 1.5, 1.0, mid[1] - u[1] * 1.5], 62),
      close: () => pose([P[0] + u[0] * (r.cd || 2.4) + tn[0] * (r.cd ? r.cd * 0.7 : 1.8), r.h + (r.cd ? r.cd * 0.4 : 1.0), P[2] + u[1] * (r.cd || 2.4) + tn[1] * (r.cd ? r.cd * 0.7 : 1.8)], [P[0], r.h, P[2]], 55),
      inside: () => pose([insideAt(6.0, 0.3)[0], 0.55, insideAt(6.0, 0.3)[1]], [P[0], r.h + 0.2, P[2]], 58),
      crew: () => DIALOGUE ? pose([sh[0] + u[0] * 3.4 + tn[0] * 1.3, 0.95, sh[1] + u[1] * 3.4 + tn[1] * 1.3], [sh[0] * 0.45 + P[0] * 0.55, 0.9, sh[1] * 0.45 + P[2] * 0.55], 62) : pose([sh[0] + u[0] * 2.6 + tn[0] * 1.1, 0.55, sh[1] + u[1] * 2.6 + tn[1] * 1.1], [P[0], r.h * 0.8, P[2]], 52),
      aerial: () => pose([sh[0] + u[0] * 4 + tn[0] * 4, 9, sh[1] + u[1] * 4 + tn[1] * 4], [mid[0] - u[0] * 1, 0.2, mid[1] - u[1] * 1], 58),
    };
    const wanted = (process.env.CAMS || 'wide,close,inside,aerial').split(',');
    // before: the same spot, no effect yet
    if (!DIALOGUE && (name === 'rpg' || name === 'tank')) { await camShots.close(); await frames(1); await shot(`before-${name}-spot`); }
    await page.evaluate(([k, f, a, n]) => window.__hf.fire(k, f, a, n, 0), [r.kind, from, P, nrm]);
    if (r.kind === 'hmg') await page.evaluate(() => window.__hf.step(0.3));
    else if (r.kind === 'thermite') await page.evaluate(() => window.__hf.step(0.5));
    else await page.evaluate(([after]) => window.__hf.stepImpact(1, after), [r.after]);
    lap(name + ' impacts ' + await page.evaluate(() => window.__cb.battle.heavy.impacts));
    if (DIALOGUE) {
      await page.evaluate(([n]) => { window.__dlgLight = n ? 'Night' : 'Day'; window.__dlgClock = n ? '21:30' : '15:30'; }, [night]);
      for (const d of DLG[name] || []) { await camShots[d.cam](); const got = await caption(d.lines); lap(JSON.stringify(got.map(g => g.name + ': ' + g.text))); lap('probe ' + JSON.stringify(await page.evaluate(() => { const c = document.getElementById('__cap'); const r = c?.firstElementChild?.getBoundingClientRect(); const e = document.elementFromPoint(640, 690); return { has: !!c, r: r && [r.x, r.y, r.width, r.height], el: e?.tagName + '#' + e?.id, ch: c?.children.length, vw: innerWidth, vh: innerHeight }; }))); await shot('dialogue/' + d.file); await page.evaluate(() => document.getElementById('__cap')?.remove()); }
      await page.evaluate(() => window.__hf.reset());
      continue;
    }
    for (const c of wanted) { await camShots[c](); await shot(`${name}-${c}${night ? '-night' : ''}`); }
    if (name === 'rpg' || name === 'tank') {
      // after: the smoke gone, the same spot unmarked
      await page.evaluate(() => { window.__hf.step(9); window.__hf.clearFx(); });
      await camShots.close(); await frames(1); await shot(`after-${name}-spot`);
    }
    await page.evaluate(() => window.__hf.reset());
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
