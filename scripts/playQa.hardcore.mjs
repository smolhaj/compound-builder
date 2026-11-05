import { playWith } from './playQa.generic.mjs';
export async function play(A) {
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Turn them away/, /^Warn off/] : [/^Hide/, /^Parley/, /^Pay/, /^Warn off/, /^Defend/], shotGate: r => r <= 2 };
  const s = await playWith(A, {
    name: 'hardcore', policy, winterAt: 330, logEvery: 60,
    wizard: { region: 'Desert Southwest', difficulty: 'Hardcore', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } },
    stake: [['timber_cabin', 0, 3], ['garden', -5, 6], ['outhouse', -4, -3]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning', step: 7 },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 20, step: 3, shot: 'after-hit' },
      { name: 'survival', until: s => s.day > (s.hit ?? 0) + 900, shot: 'survival', step: 5 },
    ],
  });
  const { page, note, shot, click, issue, st } = A;
  if (s.ending) {
    await page.waitForTimeout(500);
    const btns = await page.getByRole('button').allInnerTexts(); note('ending buttons: ' + btns.join(' / ').slice(0, 400));
    await shot('report-card');
    const t = await page.evaluate(() => document.body.innerText); note('report text: ' + t.replace(/\n+/g, ' | ').slice(0, 1500));
    if (await click(/^New$/)) { await page.waitForTimeout(800); await shot('new-after-ending'); note('after New: setupOpen=' + (await st()).setup); }
    else issue('no New button visible at the ending');
  }
}
