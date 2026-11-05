import { writeFileSync, readFileSync } from 'node:fs';
/** Sweep 12: save/load round trips mid-raid, mid-card, mid-cutscene; old, corrupt and mutated saves. */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, click, out, scanText } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await page.evaluate(() => window.__cb.game.getState().advance(30));
  const lawless = () => page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.disaster.tracks.law = 0.05; g.gate.next = Math.floor(g.clock.t) + 1; g.gate.pending = null; return { game: g, cutscene: null }; }));
  const snap = () => page.evaluate(() => { const gs = window.__cb.game.getState(), g = gs.game; return { day: Math.floor(g.clock.t), money: Math.round(g.money), people: g.people.length, structs: g.structures.length, pend: g.gate.pending?.kind ?? null, aft: !!g.gate.aftermath, card: !!g.gate.card, cut: gs.cutscene?.phase ?? null, speed: g.clock.speed }; });
  const exportTo = async name => {
    if (!(await page.getByRole('button', { name: 'Export save' }).count())) { await click(/^Save$/); await page.waitForTimeout(250); }
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: 'Export save' }).click({ timeout: 4000 })]).catch(e => { issue(`export ${name} failed: ${e.message.slice(0, 100)}`); return [null]; });
    if (!dl) return null; const p = `${out}/${name}.json`; await dl.saveAs(p); return p;
  };
  const importFrom = async (p, tag) => {
    if (!(await page.locator('input[type=file]').count())) { await click(/^Save$/); await page.waitForTimeout(250); }
    await page.locator('input[type=file]').setInputFiles(p); await page.waitForTimeout(700);
    const t = await page.evaluate(() => document.body.innerText); const m = t.match(/(Replace|not a|newer|damaged|invalid|could not|incomplete|too big)[^\n]{0,120}/i);
    note(`import ${tag}: ${m ? m[0] : 'NO MESSAGE'}`); return t;
  };
  // trigger a raid prompt
  let s;
  for (let tries = 0; tries < 8; tries++) {
    await lawless(); await click(/^▶▶▶$/);
    await page.evaluate(() => { const G = window.__cb.game; for (let i = 0; i < 4000; i++) { G.getState().tick(0.25); const x = G.getState(); if (x.game.clock.speed === 0 || x.cutscene) break; } });
    s = await snap(); if (s.pend || s.cut) break;
  }
  note('raid state ' + JSON.stringify(s)); if (!(s.pend || s.cut)) { issue('saveload: could not provoke a raid'); return; }
  await shot('mid-raid');
  const a = await snap(); const p1 = await exportTo('midraid');
  if (p1) {
    const j = JSON.parse(readFileSync(p1, 'utf8')); note('export keys ' + Object.keys(j).slice(0, 8));
    // new game then import
    await wizard({ region: 'Pacific Northwest', difficulty: 'Cozy', lotPick: 'first', mode: 'Surprise' });
    await importFrom(p1, 'midraid'); await click(/^Replace$/); await page.waitForTimeout(800);
    const b = await snap(); note('after midraid import ' + JSON.stringify(b));
    for (const k of ['day', 'money', 'people', 'structs', 'pend', 'aft', 'card']) if (a[k] !== b[k]) issue(`mid-raid import mismatch ${k}: ${a[k]} vs ${b[k]}`);
    if (a.pend && !b.pend && !b.cut) issue('mid-raid import lost the pending raid card');
    await shot('after-midraid-import'); await scanText('after import mid raid');
    // can we answer it?
    const btns = await page.getByRole('button').allInnerTexts(); note('buttons after import: ' + btns.join(' / ').slice(0, 300));
    await click(/^Open the house|^Hide|^Defend|^Parley|^Take them in|^Send them on|^Watch$/); await page.waitForTimeout(500);
    for (let i = 0; i < 30; i++) { const c = await st(); note(`  clear step ${i}: ` + JSON.stringify({ p: c.pendKind, cut: c.cutscene, aft: c.aftermath, card: c.card, speed: c.speed })); if (!c.pending && !c.cutscene && !c.aftermath && !c.card) break; await click(/^Skip scene$|^Skip( all)?$|^Continue|Pick up the pieces|See to the drive|Carry on|Treat|Bury|Leave/); await page.waitForTimeout(250); }
    const c = await st(); note('after answering imported raid ' + JSON.stringify({ pending: c.pending, cut: c.cutscene, speed: c.speed, day: c.day }));
    if (c.pending || c.cutscene) issue('imported mid-raid save: raid could not be cleared');
    // mutated saves
    const base = j;
    const mut = (name, f) => { const o = JSON.parse(JSON.stringify(base)); f(o); writeFileSync(`${out}/${name}.json`, JSON.stringify(o)); return `${out}/${name}.json`; };
    const root = o => o;
    const variants = [
      ['v1-old', o => { const r = o; if (typeof r.version === 'number') r.version = 1; if (r.game?.version) r.game.version = 1; }],
      ['no-people', o => { delete root(o).people; }],
      ['nan-money', o => { root(o).money = null; }],
      ['no-clock', o => { delete root(o).clock; }],
      ['empty-structs', o => { root(o).structures = []; }],
      ['neg-money', o => { root(o).money = -5e9; }],
    ];
    for (const [n, f] of variants) {
      const p = mut(n, f); const t = await importFrom(p, n);
      if (/Replace/.test(t)) { await click(/^Replace$/); await page.waitForTimeout(800); const x = await st().catch(() => null); note(`  ${n} loaded: ${JSON.stringify(x && { day: x.day, money: x.money, alive: x.alive })}`); await scanText('after import ' + n); await shot('imp-' + n); if (x && (x.money < -1e8)) issue(`mutated save ${n}: absurd money ${x.money} accepted silently`); }
      else await click(/^Cancel$/);
      await page.keyboard.press('Escape');
    }
  }
  // autosave persistence: reload mid-card
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  for (let tries = 0; tries < 8; tries++) { await lawless(); await click(/^▶▶▶$/); await page.evaluate(() => { const G = window.__cb.game; for (let i = 0; i < 4000; i++) { G.getState().tick(0.25); const x = G.getState(); if (x.game.clock.speed === 0 || x.cutscene) break; } }); s = await snap(); if (s.pend || s.cut) break; }
  const pre = await snap(); note('pre-reload ' + JSON.stringify(pre)); await page.waitForTimeout(3000);
  await page.goto(`http://localhost:${new URL(page.url()).port}/?lowrender`); await page.waitForTimeout(7000);
  const ok = await page.evaluate(() => !!window.__cb?.game).catch(() => false);
  if (!ok) { issue('reload mid-card: no game'); return; }
  const post = await snap(); note('post-reload ' + JSON.stringify(post)); await shot('after-reload-midcard');
  if (pre.pend && !post.pend && !post.cut) issue(`reload mid-card lost the card (pre ${pre.pend}/${pre.cut}, post ${post.pend}/${post.cut})`);
  if (Math.abs(post.day - pre.day) > 3) issue(`reload day ${pre.day} -> ${post.day}`);
}
