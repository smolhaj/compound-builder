import { playWith } from './playQa.generic.mjs';
/**
 * Homestead polish playtest: a normal (non-dome) start, the starter compound, extras, a wall, seasons with eye-level and overhead frames,
 * a raid and its cutscene, and taking people in toward a hamlet.
 *   flock /tmp/cb.lock node scripts/playQa.mjs hometown <outDir> [port]
 */
export async function play(A) {
  const { page, note, issue, shot, click, st } = A;
  const eye = async tag => {
    await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; const p = cb.game.getState().game.personState.find(x => x.needs.died == null); cb.cam.target.set(c.x + 2.2, 0.14, c.z + 2.2); cb.cam.radius = 2.4; cb.cam.pitch = 0.1; cb.cam.yaw = 0.8; });
    await page.waitForTimeout(300); await shot(tag + '-eye');
  };
  const above = async tag => { await A.frameCamp(); await page.waitForTimeout(300); await shot(tag + '-above'); };
  let seasons = 0, lastSeason = -1, homes = 0;
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' || c.pendKind === 'kin' || c.pendKind === 'shelter' ? [/^Take them in/, /^Open the house/, /^Give notice and move in/] : c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Defend/, /^Parley/, /^Hold/, /^Hide/], shotGate: r => r <= 2 };
  const fortify = async () => {
    const r = await page.evaluate(() => {
      const cb = window.__cb, G = cb.game, geo = cb.store.getState().siteGeo ?? {}, out = {};
      try { out.fortify = G.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 3, towerKind: 'watchtower_wood', passage: false, rings: 1 }); } catch (e) { out.err = String(e.stack ?? e).slice(0, 300); }
      return out;
    });
    note('fortify ' + JSON.stringify(r));
  };
  const lawless = async () => { await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.disaster.tracks.law = 0.05; g.gate.next = Math.floor(g.clock.t) + 3; return { game: g }; })); };
  const more = async () => {
    const placed = await A.stake([['timber_cabin', -12 + 5 * (homes % 4), 12 + 7 * Math.floor(homes / 4)]]); homes++; note('more home ' + placed);
  };
  await playWith(A, {
    name: 'hometown', policy, logEvery: 90,
    wizard: { region: 'Upper Midwest', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' },
    stake: [['timber_cabin', 0, 3], ['garden', -5, 6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3], ['well_drilled', 3, -6], ['solar_array', -8, -4], ['battery_shed', -10, 0]],
    each: async (s, it) => {
      if (it % 3 === 0 && s.day > 20) { const r = await page.evaluate(() => { const g = window.__cb.game.getState().game; return JSON.stringify({ solar: g.structures.filter(x => x.kind === 'solar_array').map(x => ({ id: x.id, fin: x.finishedAt, st: x.stage, hp: x.hp ?? x.health ?? null })), nstruct: g.structures.length }); }); note('SOLAR d' + s.day + ' ' + r); }
      const season = Math.floor((s.day % 365) / 91);
      if (season !== lastSeason && s.day > 20) { lastSeason = season; seasons++; if (seasons <= 8) { await above('s' + seasons + '-d' + s.day); if (seasons % 2 === 1) await eye('s' + seasons); } }
      if (it % 6 === 3 && homes < 5 && s.money > 40000) await more();
      if (s.day > 120 && s.day < 140 && it % 2 === 0) await fortify();
      if (s.day > 200 && s.day < 215) await lawless();
    },
    phases: [
      { name: 'year1', until: s => s.day >= 365, shot: 'y1' },
      { name: 'year2', until: s => s.day >= 730, shot: 'y2' },
      { name: 'year3', until: s => s.day >= 1095, shot: 'y3' },
    ],
  });
  const lg = await page.evaluate(() => window.__cb.game.getState().game.log.filter(l => /solar|panel|storm|hail|wind|fire|demol|removed|scrap/i.test(l.text)).slice(-40).map(l => l.text).join('\n'));
  note('LOG ' + lg);
  const s = await st(); note('final ' + JSON.stringify(s));
  const stage = await page.evaluate(() => document.body.innerText.match(/(Homestead|Compound|Hamlet|Walled village)/)?.[0]);
  note('stage text ' + stage);
}
