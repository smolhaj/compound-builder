/** Hands-on pass 1: wizard -> Lay out a starter compound -> Place all -> Order -> a year. */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, run, scanText, click } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  let s = await st(); note('start ' + JSON.stringify(s));
  await shot('start');
  const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
  note('HUD: ' + (await txt()).slice(0, 900));
  const ok = await click(/Lay out a starter compound/);
  note('layout clicked ' + ok);
  await page.waitForTimeout(800); await shot('starter-preview');
  note('PREVIEW: ' + (await txt()).slice(0, 1200));
  const placed = await click(/^Place all/);
  note('placed all ' + placed);
  await page.waitForTimeout(500); await shot('placed');
  s = await st(); note('after place ' + JSON.stringify(s));
  note('after place HUD: ' + (await txt()).slice(0, 1500));
  const ord = page.getByRole('button', { name: /Order what the plans need/ });
  note('order buttons ' + await ord.count());
  if (await ord.count()) { await ord.first().click(); await page.waitForTimeout(500); await shot('order-clicked'); note('ORDER: ' + (await txt()).slice(0, 300)); }
  note('hired ' + await A.hireAll());
  const op = async tag => { await page.getByRole('button', { name: 'Build', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(150); const t = await txt(); const m = t.match(/GET OPERATIONAL.*?(NEXT STEPS|LONG-TERM)/); note(tag + ' OP: ' + (m ? m[0].slice(0,420) : t.slice(0, 300))); const f = t.match(/Stock some food[^|]*\|[^|]*/); note(tag + ' foodNudge: ' + (f ? f[0] : 'none')); };
  const policy = { stance: () => [/^Open the house/, /^Defend/, /^Take them in/, /^Parley/, /^Hide/], shotGate: () => false };
  let last = -99;
  s = await run({ until: x => x.day >= 365, policy, step: 5, label: 'year', hook: async (x, it) => {
    if (it % 2 === 0) { await A.orderPlans(); if (x.built < x.planned) await A.hireAll(); }
    if (x.day - last >= 60) { last = x.day; note(`day ${x.day} $${x.money} built ${x.built}/${x.planned} alive ${x.alive}`); await op('d' + x.day); if (x.day >= 120 && !globalThis.__s1) { globalThis.__s1 = 1; await shot('day120'); } }
  } });
  note('end ' + JSON.stringify(s)); await op('end'); await shot('end-year');
}
