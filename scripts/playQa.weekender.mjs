import { playWith } from './playQa.generic.mjs';
/** Sweep 7: weekender, then bug-out or move in. */
export async function play(A) {
  const { page, note, click, shot, issue } = A;
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Send them on/, /^Turn them away/] : [/^Open the house/, /^Defend/, /^Hide/, /^Parley/, /^Warn off/], shotGate: r => r <= 2 };
  const moveIn = async () => {
    await click(/^Family$/); await page.waitForTimeout(300);
    const t = await page.evaluate(() => document.body.innerText); note('FAMILY TAB: ' + t.replace(/\n+/g, ' | ').slice(0, 700));
    await shot('weekender-family');
    if (await click(/Move in/)) { note('clicked Move in'); await page.waitForTimeout(400); await shot('moved-in'); } else issue('weekender: no Move in button at warning');
  };
  await playWith(A, {
    continues: 0, name: 'weekender', policy, winterAt: 330, logEvery: 60,
    wizard: { region: 'Pacific Northwest', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, extra: { lifestyle: 'Weekend getaway' } },
    stake: [['timber_cabin', 0, 3], ['garden', -5, 6], ['outhouse', -4, -3], ['root_cellar', 6, 6]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning', act: moveIn },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
