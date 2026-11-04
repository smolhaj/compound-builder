/** Hands-on: Save menu export/import (good, corrupt, newer), card + clock resume (running / paused). */
import { writeFileSync, readFileSync } from 'node:fs';
export async function play(A) {
  const { page, st, shot, note, issue, wizard, handleGate, click, out } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  await page.evaluate(() => window.__cb.game.getState().advance(40));
  const snap = () => page.evaluate(() => { const g = window.__cb.game.getState().game; return { day: Math.floor(g.clock.t), money: Math.round(g.money), people: g.people.length, names: g.personState.length, structs: g.structures.length, seed: g.seed }; });
  const a = await snap(); note('before export ' + JSON.stringify(a));
  await click(/^Save$/); await page.waitForTimeout(300); await shot('save-menu');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export save' }).click()]);
  const path = `${out}/export.json`; await dl.saveAs(path); note('exported ' + dl.suggestedFilename());
  // fresh game
  await wizard({ region: 'Pacific Northwest', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  const b = await snap(); note('fresh game ' + JSON.stringify(b));
  const doImport = async (p, tag) => {
    if (!(await page.locator('input[type=file]').count())) { await click(/^Save$/); await page.waitForTimeout(200); }
    await page.locator('input[type=file]').setInputFiles(p); await page.waitForTimeout(600);
    const t = await page.evaluate(() => document.body.innerText); const m = t.match(/(Replace|not a|newer|corrupt|invalid|could|version|wrong)[^\n]{0,160}/i);
    note(`import ${tag}: msg=${m ? m[0] : 'none'}`); await shot('import-' + tag);
    return t;
  };
  await doImport(path, 'good');
  await click(/^Replace$/); await page.waitForTimeout(800);
  const c = await snap(); note('after import ' + JSON.stringify(c));
  if (JSON.stringify(c) !== JSON.stringify(a)) issue('import state mismatch ' + JSON.stringify(c) + ' vs ' + JSON.stringify(a));
  await shot('imported');
  writeFileSync(`${out}/corrupt.json`, readFileSync(path, 'utf8').slice(0, 5000));
  await doImport(`${out}/corrupt.json`, 'corrupt'); await click(/^Cancel$/);
  writeFileSync(`${out}/garbage.json`, '{"hello":1}');
  await doImport(`${out}/garbage.json`, 'garbage'); await click(/^Cancel$/);
  const j = JSON.parse(readFileSync(path, 'utf8')); note('export top keys ' + Object.keys(j).slice(0, 8).join(','));
  const bump = o => { if (typeof o.version === 'number') o.version += 5; if (o.game?.version != null) o.game.version += 5; if (typeof o.v === 'number') o.v += 5; return o; };
  writeFileSync(`${out}/newer.json`, JSON.stringify(bump(j)));
  await doImport(`${out}/newer.json`, 'newer'); await click(/^Cancel$/);
  await page.keyboard.press('Escape');
  // ---- card + clock resume
  const lawless = () => page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.disaster.tracks.law = 0.05; g.gate.next = Math.floor(g.clock.t) + 1; g.gate.pending = null; return { game: g, cutscene: null }; }));
  const tickUntilStop = () => page.evaluate(() => { const G = window.__cb.game; for (let i = 0; i < 4000; i++) { G.getState().tick(0.25); const s = G.getState(); if (s.game.clock.speed === 0 || s.cutscene) break; } const s = G.getState(); return { speed: s.game.clock.speed, pending: s.game.gate.pending?.kind ?? null, cut: s.cutscene?.phase ?? null, resumeTo: s.resumeTo }; });
  const pol = { stance: () => [/^Open the house/, /^Take them in/, /^Hide/, /^Parley/, /^Warn off/], shotGate: () => false };
  for (const mode of ['running', 'paused']) {
    let ok = false;
    for (let tries = 0; tries < 6 && !ok; tries++) {
      await lawless();
      if (mode === 'running') { await click(/^▶▶▶$/); } else { await click(/^❚❚$/); await page.evaluate(() => { window.__cb.game.setState(s => { const g = structuredClone(s.game); g.clock.speed = 0; g.gate.pending = { id: 'qaP', kind: 'refugees', day: Math.floor(g.clock.t), title: 'QA', dossier: ['QA'], size: 3, armed: false, strength: 3, wants: { canned: 1 }, stances: ['hide', 'parley', 'trade', 'warn'] }; return { game: g, cutscene: null, resumeTo: null }; }); window.__cb.game.getState().advance(0.001); }); }
      let r;
      if (mode === 'running') r = await tickUntilStop(); else { r = await page.evaluate(() => { const s = window.__cb.game.getState(); return { speed: s.game.clock.speed, pending: s.game.gate.pending?.kind ?? null, cut: s.cutscene?.phase ?? null, resumeTo: s.resumeTo }; }); }
      note(`${mode} gate arrival: ` + JSON.stringify(r));
      if (!r.pending && !r.cut) continue;
      ok = true;
      const s0 = await st(); await handleGate(s0, pol);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => { const G = window.__cb.game; G.getState().tick(0.25); G.getState().tick(0.25); const s = G.getState(); return { speed: s.game.clock.speed, resumeTo: s.resumeTo, open: !!(s.cutscene || s.game.gate.pending || s.game.gate.aftermath || s.game.gate.card) }; });
      note(`${mode} after answering: ` + JSON.stringify(after));
      const wantSpeed = mode === 'running' ? 3 : 0;
      if (after.open) note('another card opened immediately; result inconclusive');
      else if (after.speed !== wantSpeed) issue(`clock after ${mode} card = ${after.speed}, wanted ${wantSpeed}`);
      await shot('after-card-' + mode);
    }
    if (!ok) issue('could not provoke a gate for ' + mode);
  }
}
