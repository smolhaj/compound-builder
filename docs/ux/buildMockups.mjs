/**
 * Writes the three layout mockups (layoutA.html, layoutB.html, layoutC.html) as self-contained 1512x860 pages, and the "today" reference (layoutToday.html).
 * Render them with docs/ux/renderMockups.mjs. Static HTML and CSS only: no game code, no external assets.
 */
import { writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;

const I = {   // 16x16 glyphs, stroke-only, drawn here (no assets)
  coin: '<circle cx="8" cy="8" r="6"/><path d="M8 4v8M5.5 6.5h4a1.5 1.5 0 010 3h-3"/>',
  food: '<path d="M8 14V6M8 6c-2-1-3-3-3-4 2 0 3 2 3 4zM8 6c2-1 3-3 3-4-2 0-3 2-3 4zM8 10c-2-1-3-3-3-4M8 10c2-1 3-3 3-4"/>',
  water: '<path d="M8 2s4 4.5 4 7.5a4 4 0 01-8 0C4 6.5 8 2 8 2z"/>',
  power: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
  def: '<path d="M8 1.5l5 2v4c0 3.5-2.5 6-5 7-2.5-1-5-3.5-5-7v-4z"/>',
  heart: '<path d="M8 14S2 10 2 6a3 3 0 016-1 3 3 0 016 1c0 4-6 8-6 8z"/>',
  fuel: '<path d="M3 14V3h6v11M3 8h6M9 6l3 1v5a1 1 0 002 0V6l-2-2"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
  bell: '<path d="M4 11V7a4 4 0 018 0v4l1 1.5H3zM6.5 14h3"/>',
  menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
  build: '<path d="M2 13l6-6M9 3l4 4-2 2-4-4zM2 13l2 1 1-2"/>',
  proj: '<path d="M2 3h12v10H2zM2 6.5h12M5 9.5h3"/>',
  people: '<circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5M11 3a2.5 2.5 0 010 5M12 10c2 .5 2.5 2 2.5 4"/>',
  box: '<path d="M2 5l6-3 6 3v7l-6 3-6-3zM2 5l6 3 6-3M8 8v7"/>',
  land: '<path d="M1 12l4-6 3 4 2-3 5 5zM1 14h14"/>',
  out: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>',
  years: '<path d="M3 2h10v12H3zM6 5h4M6 8h4M6 11h2"/>',
  board: '<rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 2V1h4v1M5.5 6h5M5.5 9h5M5.5 12h3"/>',
  shop: '<path d="M2 6l1-3h10l1 3M2 6h12v8H2zM6 14v-4h4v4"/>',
  log: '<path d="M3 2h10v12H3zM5.5 5h5M5.5 8h5M5.5 11h3"/>',
  eye: '<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>',
  cam: '<path d="M2 5h3l1-2h4l1 2h3v8H2z"/><circle cx="8" cy="9" r="2.5"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  dot: '<circle cx="8" cy="8" r="3"/>',
  road: '<path d="M5 14L7 2M11 14L9 2M8 4v1.5M8 8v1.5M8 12v1"/>',
};
const ic = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1512px;height:860px;overflow:hidden;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#eee}
:root{--panel:rgba(20,22,18,.82);--edge:rgba(255,255,255,.10);--dim:rgba(238,238,238,.64);--accent:#d8c9a0;--good:#a8d080;--warn:#f0c070;--bad:#f08060}
.scene{position:absolute;inset:0;background:linear-gradient(#9fb8c9 0%,#c9d3c6 38%,#8d9a6a 38.1%,#6c7b4b 100%);overflow:hidden}
.scene svg{position:absolute;inset:0;width:100%;height:100%}
.p{position:absolute;background:var(--panel);border:1px solid var(--edge);border-radius:10px;backdrop-filter:blur(2px)}
.row{display:flex;align-items:center;gap:8px}.sp{flex:1}
.ic{flex:none;vertical-align:middle}
.dim{color:var(--dim)}.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;border:1px solid var(--edge);background:#34372e;color:#eee;font:inherit}
.btn.on{background:var(--accent);color:#1c1d18;border-color:var(--accent)}
.btn.pri{background:var(--accent);color:#1c1d18;font-weight:600}
.chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid var(--edge);font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.chip.warn{border-color:var(--warn);color:var(--warn)}.chip.bad{border-color:var(--bad);color:var(--bad);background:rgba(160,40,30,.22)}.chip.good .ic{color:var(--good)}
.chip small{font-weight:400;color:var(--dim);font-size:11px}
.h{font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--dim);font-weight:600}
.hov{position:absolute;background:#262920;border:1px solid var(--accent);border-radius:8px;padding:8px 10px;width:250px;box-shadow:0 6px 18px rgba(0,0,0,.5);z-index:9}
.hov b{display:block;margin-bottom:3px}
.bar{height:5px;border-radius:3px;background:#3a3d34;overflow:hidden}.bar i{display:block;height:100%;background:var(--good)}
.sec{border-top:1px solid var(--edge);padding:6px 0}
.tag{font-size:10.5px;padding:1px 6px;border-radius:9px;background:rgba(255,255,255,.1);color:var(--dim)}
.note{position:absolute;font:600 12px system-ui;background:#e9d36b;color:#2a2410;border-radius:4px;padding:2px 7px;z-index:20;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.ticker{position:absolute;left:0;right:0;bottom:0;height:26px;background:rgba(36,20,16,.86);display:flex;align-items:center;gap:26px;padding:0 12px;font-size:12.5px;white-space:nowrap;overflow:hidden}
kbd{font:11px ui-monospace,monospace;background:#3a3d34;border:1px solid var(--edge);border-radius:4px;padding:0 5px;color:var(--dim)}
`;

const SCENE = `<div class="scene"><svg viewBox="0 0 1512 860" preserveAspectRatio="none">
<path d="M0 330 C200 280 380 320 560 300 S980 250 1200 300 S1440 290 1512 270 V420 H0z" fill="#7f8f62"/>
<path d="M0 360 C260 330 520 380 800 350 S1300 330 1512 350 V860 H0z" fill="#6c7b4b"/>
<path d="M0 640 C300 600 700 660 1000 620 S1400 600 1512 640 V860 H0z" fill="#627040"/>
<g stroke="#4b3f2a" stroke-width="3" fill="none" opacity=".8"><path d="M430 520 H1010 M430 520 V700 H1010 M1010 520 V700" stroke-dasharray="14 5"/></g>
<g><rect x="560" y="540" width="190" height="110" fill="#b79a6f"/><path d="M548 542 L655 480 L762 542z" fill="#7b4a36"/><rect x="640" y="590" width="26" height="60" fill="#4d3a28"/><rect x="590" y="568" width="30" height="24" fill="#cfe3ee"/><rect x="690" y="568" width="30" height="24" fill="#cfe3ee"/></g>
<g><rect x="820" y="580" width="110" height="70" fill="#a68a63"/><path d="M810 582 L875 540 L940 582z" fill="#5f6a52"/></g>
<g><rect x="470" y="590" width="60" height="50" fill="#9aa08f"/><rect x="455" y="582" width="90" height="12" fill="#6a705f"/></g>
<g fill="#35502b"><circle cx="300" cy="500" r="40"/><circle cx="360" cy="470" r="34"/><circle cx="1130" cy="480" r="44"/><circle cx="1210" cy="520" r="36"/><circle cx="210" cy="640" r="46"/></g>
<g fill="#2b3a1f"><rect x="296" y="520" width="8" height="40"/><rect x="1126" y="500" width="8" height="46"/></g>
<rect x="600" y="700" width="14" height="30" fill="#3d4f7a" rx="3"/><circle cx="607" cy="695" r="6" fill="#e6c9a3"/>
<rect x="690" y="720" width="14" height="30" fill="#7a3d3d" rx="3"/><circle cx="697" cy="715" r="6" fill="#e6c9a3"/>
<path d="M0 760 C400 720 900 780 1512 730" stroke="#8b7b5a" stroke-width="40" fill="none" opacity=".6"/>
</svg></div>`;

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${SCENE}${body}</body></html>`;

// ---------- shared pieces ----------
const speed = `<span class="row" style="gap:3px"><span class="btn" style="padding:0 8px">❚❚</span><span class="btn on" style="padding:0 8px">▶</span><span class="btn" style="padding:0 8px">▶▶</span><span class="btn" style="padding:0 8px">▶▶▶</span></span>`;
const goalChip = (x, y) => `<div class="p" style="left:${x}px;top:${y}px;width:300px;padding:8px 10px"><div class="row"><span class="h" style="white-space:nowrap">Goal 2 of 6</span><span class="sp"></span><span class="dim" style="font-size:13px;letter-spacing:2px"><b class="good">●●</b><b style="color:var(--accent)">◐</b>○○○</span></div>
<div style="margin:3px 0 6px;font-weight:600">Drill or dig a well</div><div class="row"><span class="btn pri">Order what the plans need</span><span class="dim" style="font-size:11.5px">about 4 days</span></div></div>`;
const familyRows = `
<div class="row" style="padding:3px 0"><b style="width:74px">Dana</b><div class="bar sp"><i style="width:92%"></i></div><div class="bar" style="width:70px"><i style="width:70%;background:var(--warn)"></i></div><span class="dim" style="width:64px;text-align:right">Building</span></div>
<div class="row" style="padding:3px 0"><b style="width:74px">Marcus</b><div class="bar sp"><i style="width:100%"></i></div><div class="bar" style="width:70px"><i style="width:84%"></i></div><span class="dim" style="width:64px;text-align:right">Chores</span></div>
<div class="row" style="padding:3px 0"><b style="width:74px">Ellie, 9</b><div class="bar sp"><i style="width:88%"></i></div><div class="bar" style="width:70px"><i style="width:91%"></i></div><span class="dim" style="width:64px;text-align:right">School</span></div>
<div class="row" style="padding:3px 0"><b style="width:74px">Jo, 14</b><div class="bar sp"><i style="width:34%;background:var(--bad)"></i></div><div class="bar" style="width:70px"><i style="width:40%;background:var(--bad)"></i></div><span class="bad" style="width:64px;text-align:right">Hurt</span></div>`;
const FOOT = (txt, left = 10) => `<div class="note" style="left:${left}px;bottom:84px">${txt}</div>`;
const tickerLine = `<div class="ticker"><b class="dim" style="font-size:11px;letter-spacing:.8px">NEWS</b><span class="warn" style="font-weight:600">Grid operator warns of rolling outages</span><span class="dim">Radio: gas stations out of fuel on Route 9</span><span class="dim">Neighbor says the pharmacy closed</span></div>`;

// ---------- Today (reference, same state) ----------
const today = page('Today', `
<div class="p row" style="left:50%;top:10px;transform:translateX(-50%);padding:6px 10px;gap:12px;font-size:13.5px;white-space:nowrap"><span>Apr 15, 2027</span><span>09:42</span><span class="warn">Collapse in ~38 d</span><span class="dim">Wave: none</span><b style="color:#cfe0a8">$187,420</b><span class="btn">Shop &amp; money</span><span class="btn">New</span><span class="btn">Save</span>${speed}</div>
<div class="p" style="left:10px;top:56px;width:244px;bottom:96px;padding:8px 10px;overflow:hidden"><div class="row" style="margin-bottom:6px"><span class="btn on">Build</span><span class="btn">Projects</span><span class="btn">Log</span></div>
<div style="border:1px solid var(--accent);border-radius:8px;padding:6px 8px;margin-bottom:6px"><div class="h">Get operational</div><div>2 of 6 · Drill or dig a well</div><span class="btn pri" style="margin-top:4px">Order what the plans need</span><div class="dim" style="font-size:11.5px;margin-top:3px">Why this matters... about 4 days...</div></div>
<div style="border:1px solid var(--edge);border-radius:8px;padding:6px 8px;margin-bottom:6px"><div class="h">Next steps</div><div style="margin:3px 0"><b>Put in a gravel drive</b> <span class="btn" style="height:22px;float:right">Stake it</span></div><div class="dim" style="font-size:11.5px;clear:both">24 hours of materials wait at the road...</div><div style="margin:3px 0;border-top:1px solid var(--edge);padding-top:3px"><b>Plant a garden</b></div></div>
<div class="sec h">Long-term goals <span class="dim">1/4 · 0/3</span></div><div class="sec h">Home &amp; work</div><div class="sec h">Food</div><div class="sec h">Water &amp; power</div><div class="sec h">Pipes &amp; cables</div><div class="sec h">Underground</div><div class="sec h">Perimeter</div><div class="sec h">Woods</div></div>
<div class="p" style="right:10px;top:56px;width:320px;bottom:96px;padding:8px 10px;overflow:hidden"><div class="row" style="flex-wrap:wrap;gap:4px;margin-bottom:6px"><span class="btn on">Family</span><span class="btn">Supplies</span><span class="btn">Utilities</span><span class="btn">Land</span><span class="btn">Defense</span><span class="btn">Outside</span><span class="btn">Years</span></div>
${familyRows}<div class="sec h">Weekend plan · Dogs · Kin · Newcomers · House rules · Road · Housing · Quarters · People · Medical · Classes · Daily · Work and money</div></div>
<div class="p row" style="right:10px;bottom:34px;padding:4px;gap:4px"><span class="btn">Board</span><span class="btn">View ▸</span><span class="btn on">Walls</span><span class="btn">Cutaway</span><span class="btn">X-ray</span><span class="btn">Underground</span><span class="btn">Hide panels (H)</span><span class="dim">|</span><span class="btn on">Diorama</span><span class="btn">Walk</span><span class="btn">Fly</span><span class="btn">Tour</span></div>
${tickerLine}${FOOT('TODAY (reference): same state as A, B and C')}`);

// ---------- A: minimal top bar, contextual drawers, bottom action bar ----------
const hovFood = `<div class="hov" style="left:520px;top:50px"><b>Food: 41 days</b><div class="dim">Pantry 41 d, garden not yet bearing. Family of 4.</div><div class="bar" style="margin:6px 0"><i style="width:55%"></i></div><div class="row"><span class="btn pri" style="height:24px">Add 30 days</span><span class="dim" style="font-size:11px">opens Supplies</span></div></div>`;
const A = page('Layout A', `
<div class="p row" style="left:50%;top:8px;transform:translateX(-50%);padding:5px 8px;gap:6px;white-space:nowrap">
 <span style="font-weight:600;padding:0 4px">Apr 15 · 09:42</span>${speed}<span style="width:1px;height:20px;background:var(--edge)"></span>
 <span class="chip good">${ic('coin')}$187k</span><span class="chip good">${ic('food')}41 d</span><span class="chip warn">${ic('water')}6 d</span><span class="chip good">${ic('power')}2.1 kW</span><span class="chip">${ic('fuel')}12 d</span><span class="chip good">${ic('heart')}Good</span><span class="chip warn">${ic('def')}Exposed</span>
 <span style="width:1px;height:20px;background:var(--edge)"></span><span class="chip warn">Collapse ~38 d</span><span class="btn">${ic('bell')}3</span><span class="btn">${ic('menu')}</span></div>
${hovFood}
${goalChip(10, 56)}
<div class="p" style="right:10px;top:56px;width:360px;max-height:520px;padding:10px 12px"><div class="row" style="margin-bottom:6px"><b style="font-size:15px">${ic('people')} People</b><span class="sp"></span><span class="dim">4 here</span><span class="btn" style="height:24px">✕</span></div>${familyRows}
<div class="sec"><div class="h" style="margin-bottom:3px">Today</div><div class="row"><span class="chip bad">Jo is hurt</span><span class="btn" style="height:24px">Treat</span></div></div>
<div class="sec row" style="flex-wrap:wrap;gap:4px"><span class="tag">Work and money</span><span class="tag">Medical</span><span class="tag">Kin</span><span class="tag">Dogs</span><span class="tag">Quarters</span><span class="tag">Classes</span><span class="tag">Schedule</span></div></div>
<div class="p row" style="right:10px;bottom:34px;padding:5px 8px;gap:4px;white-space:nowrap">
 <span class="btn on">${ic('build')}Build <kbd>B</kbd></span><span class="btn">${ic('proj')}Projects <span class="tag">2</span></span><span class="btn on" style="background:#4b4f40;color:#eee;border-color:var(--accent)">${ic('people')}People</span><span class="btn">${ic('box')}Supplies</span><span class="btn">${ic('power')}Utilities <span class="tag" style="background:var(--warn);color:#222">!</span></span><span class="btn">${ic('land')}Land</span><span class="btn">${ic('def')}Defense</span><span class="btn">${ic('out')}Outside</span><span class="btn">${ic('years')}Years</span>
 <span style="width:1px;height:20px;background:var(--edge)"></span><span class="btn">${ic('board')}Board</span><span class="btn">${ic('shop')}Shop</span><span class="btn">${ic('log')}Log</span>
 <span style="width:1px;height:20px;background:var(--edge)"></span><span class="btn">${ic('eye')}Look ▾</span><span class="btn">${ic('cam')}Diorama ▾</span></div>
<div class="p" style="left:10px;top:156px;width:300px;padding:6px 10px;font-size:12px"><span class="h">Feed</span> <span class="warn" style="font-weight:600">Grid operator warns of rolling outages</span><div class="dim" style="font-size:11.5px;white-space:nowrap;overflow:hidden">Radio: gas stations out of fuel on Route 9 · 3 more</div></div>
${FOOT('A: minimal top resource bar, one drawer at a time, bottom action bar')}
<div class="note" style="left:50%;top:66px;transform:translateX(-50%);margin-left:-60px;display:none"></div>
`.replace('<div class="ticker">', '<div class="ticker">'));

// ---------- B: keep left/right, one Compound window with collapsible sections ----------
const sect = (icn, name, chips, open, body = '') => `<div style="border-top:1px solid var(--edge);padding:6px 0"><div class="row"><span class="dim">${open ? '▾' : '▸'}</span>${ic(icn)}<b>${name}</b><span class="sp"></span>${chips}</div>${open ? `<div style="padding:5px 0 2px 22px">${body}</div>` : ''}</div>`;
const B = page('Layout B', `
<div class="p row" style="left:50%;top:8px;transform:translateX(-50%);padding:5px 10px;gap:10px;white-space:nowrap"><b>Apr 15, 2027 · 09:42</b>${speed}<span style="width:1px;height:20px;background:var(--edge)"></span><span class="chip good">${ic('coin')}$187,420</span><span class="chip warn">Collapse ~38 d</span><span class="btn">${ic('shop')}Shop</span><span class="btn">${ic('menu')}Menu ▾</span></div>
<div class="p" style="left:10px;top:56px;width:264px;max-height:700px;padding:8px 10px"><div class="row" style="margin-bottom:6px"><span class="btn on">Build</span><span class="btn">Projects <span class="tag">2</span></span><span class="btn">Log</span></div>
<div style="border:1px solid var(--accent);border-radius:8px;padding:7px 9px;margin-bottom:8px"><div class="row"><span class="h">Goal 2 of 6</span><span class="sp"></span><span class="dim" style="font-size:11px">+ 2 next steps</span></div><div style="font-weight:600;margin:3px 0 5px">Drill or dig a well</div><span class="btn pri">Order what the plans need</span></div>
<div class="row" style="margin-bottom:4px"><span class="chip" style="height:26px;flex:1">${ic('search')}<span class="dim" style="font-weight:400">Find a building...</span></span></div>
${['Home &amp; work', 'Food', 'Water &amp; power', 'Perimeter'].map((t, i) => `<div class="row" style="padding:5px 0;border-top:1px solid var(--edge)"><span class="dim">${i === 0 ? '▾' : '▸'}</span><b>${t}</b></div>${i === 0 ? `<div style="padding-left:18px">${['Timber cabin|$18,400', 'Farmhouse|$41,000', 'Tool shed|$2,900', 'Garage|$6,200'].map(x => `<div class="row" style="padding:2px 0"><span>${x.split('|')[0]}</span><span class="sp"></span><span class="dim">${x.split('|')[1]}</span></div>`).join('')}</div>` : ''}`).join('')}
<div class="row" style="padding:5px 0;border-top:1px solid var(--edge)"><span class="dim">▸</span><span class="dim">Advanced: pipes, underground, footpaths, woods</span></div></div>
<div class="p" style="right:10px;top:56px;width:400px;max-height:700px;padding:8px 12px;overflow:hidden"><div class="row" style="margin-bottom:6px"><b style="font-size:15px">Compound</b><span class="sp"></span><span class="chip good" style="height:24px">Day 12</span><span class="btn" style="height:24px">Board</span></div>
<div class="row" style="flex-wrap:wrap;gap:5px;margin-bottom:6px"><span class="chip good">${ic('food')}41 d</span><span class="chip warn">${ic('water')}6 d</span><span class="chip good">${ic('power')}2.1 kW</span><span class="chip">${ic('fuel')}12 d</span><span class="chip good">${ic('heart')}Good</span><span class="chip warn">${ic('def')}Exposed</span></div>
<div class="p" style="position:static;background:rgba(216,201,160,.1);border-color:var(--accent);padding:6px 8px;margin-bottom:4px"><span class="h">Needs you</span> <span class="bad" style="font-weight:600">Jo is hurt</span> <span class="btn" style="height:22px;float:right">Treat</span><div class="dim" style="font-size:11.5px">Water: 6 days stored. <u>Add a cistern</u></div></div>
${sect('people', 'Family', '<span class="chip bad" style="height:22px">1 hurt</span><span class="dim">4</span>', true, familyRows)}
${sect('box', 'Supplies', '<span class="dim">food 41 d · fuel 12 d</span>', false)}${sect('power', 'Utilities', '<span class="warn">water 6 d</span>', false)}${sect('def', 'Defense', '<span class="warn">Exposed</span>', false)}${sect('land', 'Land &amp; paperwork', '', false)}${sect('out', 'Outside &amp; radio', '<span class="dim">3 heard</span>', false)}${sect('years', 'Years', '', false)}</div>
<div class="p row" style="left:290px;bottom:34px;padding:4px;gap:4px"><span class="btn on">Walls</span><span class="btn">Cutaway</span><span class="btn">X-ray</span><span class="btn">${ic('eye')}Overlays ▾</span><span class="btn">Hide panels (H)</span><span class="dim">|</span><span class="btn on">Diorama</span><span class="btn">Walk</span><span class="btn">Fly</span><span class="btn">Tour</span></div>
${tickerLine}${FOOT('B: left/right kept, one Compound window with sections', 290)}`);

// ---------- C: icon dock + hover cards + command palette ----------
const dockBtn = (n, label, val, tone = '', on = false) => `<div style="width:64px;text-align:center;padding:4px 0;border-radius:8px;${on ? 'background:rgba(216,201,160,.18);outline:1px solid var(--accent)' : ''}"><div class="${tone}" style="height:20px">${ic(n, 20)}</div><div style="font-size:11px;color:var(--dim)">${label}</div><div class="${tone}" style="font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;height:16px">${val}</div></div>`;
const C = page('Layout C', `
<div class="p row" style="left:50%;top:8px;transform:translateX(-50%);padding:5px 10px;gap:10px;white-space:nowrap"><b>Apr 15 · 09:42</b>${speed}<span class="chip good">${ic('coin')}$187k</span><span class="chip warn">Collapse ~38 d</span><span class="btn">${ic('search')}Search or command <kbd>Ctrl K</kbd></span><span class="btn">${ic('menu')}</span></div>
${goalChip(10, 56)}
<div class="p" style="right:10px;top:56px;width:230px;padding:8px 10px"><div class="h" style="margin-bottom:4px">Needs you</div><div class="row" style="padding:2px 0"><span class="bad">●</span> Jo is hurt <span class="sp"></span><span class="btn" style="height:22px">Treat</span></div><div class="row" style="padding:2px 0"><span class="warn">●</span> Water: 6 days <span class="sp"></span><span class="btn" style="height:22px">Fix</span></div><div class="row" style="padding:2px 0"><span class="warn">●</span> Drive: 24 h waiting</div></div>
<div class="p trans" style="left:50%;top:150px;transform:translateX(-50%);width:560px;padding:10px;z-index:12;border-color:var(--accent);box-shadow:0 10px 30px rgba(0,0,0,.55)"><div class="row chip" style="height:34px;border-radius:8px;width:100%;font-weight:400">${ic('search')}<span>def</span><span style="width:1px;height:16px;background:var(--accent);margin-left:-5px"></span></div>
<div class="h" style="margin:8px 0 3px">Go to</div><div class="row" style="padding:5px 8px;border-radius:6px;background:rgba(216,201,160,.16)">${ic('def')}<b>Defense</b><span class="dim">panel</span><span class="sp"></span><kbd>D</kbd></div><div class="row" style="padding:5px 8px">${ic('def')}Defense: upgrade the walls<span class="sp"></span><span class="dim">panel section</span></div>
<div class="h" style="margin:8px 0 3px">Build</div><div class="row" style="padding:5px 8px">${ic('build')}Defensive berm<span class="sp"></span><span class="dim">$3,100 · 40 h</span></div><div class="row" style="padding:5px 8px">${ic('build')}Gate house<span class="sp"></span><span class="dim">$12,800 · 90 h</span></div>
<div class="h" style="margin:8px 0 3px">Do</div><div class="row" style="padding:5px 8px">${ic('shop')}Order what the plans need<span class="sp"></span><span class="dim">$4,260</span></div></div>
<div class="p row" style="left:50%;bottom:34px;transform:translateX(-50%);padding:5px 8px;gap:2px;white-space:nowrap">
 ${dockBtn('build', 'Build', 'B', '', false)}${dockBtn('proj', 'Projects', '2')}${dockBtn('people', 'People', '4', 'bad', true)}${dockBtn('food', 'Food', '41 d', 'good')}${dockBtn('water', 'Water', '6 d', 'warn')}${dockBtn('power', 'Power', '2.1 kW', 'good')}${dockBtn('def', 'Defense', 'Exposed', 'warn')}${dockBtn('land', 'Land', '')}${dockBtn('out', 'Outside', '3')}${dockBtn('board', 'Board', '')}${dockBtn('years', 'Years', '')}${dockBtn('log', 'Log', '')}${dockBtn('eye', 'Look', '')}${dockBtn('cam', 'Camera', '')}</div>
<div class="hov" style="left:556px;bottom:112px;width:280px"><b>Water: 6 days stored</b><div class="dim">Hand pump works. The well gives 40 gal a day; the family uses 55. No cistern yet.</div><div class="bar" style="margin:6px 0"><i style="width:30%;background:var(--warn)"></i></div><div class="row"><span class="btn pri" style="height:24px">Add a cistern</span><span class="btn" style="height:24px">Open Utilities</span></div></div>
<div class="p" style="left:10px;bottom:34px;width:262px;padding:6px 10px;font-size:12px;white-space:nowrap;overflow:hidden"><span class="h">Feed</span> <span class="warn" style="font-weight:600">Grid operator warns of rolling outages</span></div>
${FOOT('C: icon dock with number chips, hover cards, Ctrl K palette')}`);

writeFileSync(here + 'layoutToday.html', today); writeFileSync(here + 'layoutA.html', A); writeFileSync(here + 'layoutB.html', B); writeFileSync(here + 'layoutC.html', C);
console.log('wrote 4 mockups');
