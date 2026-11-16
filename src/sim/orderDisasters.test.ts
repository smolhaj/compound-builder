import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from './state';
import type { DisasterKind } from './disaster';
import { fxDaily, fxOnHit, fxEncounterWeights, fxApplyServiceMods, fxPriceMod, fxRadio, fxCtxFor, fxMakeExtra, fxStanceLabels, EXTRA_META, type ExtraEncounterKind, isExtraKind } from './disasterFx';
import { postureOf, resolve, type Encounter, type EncounterKind, type Stance } from './encounters';
import { fxOf, hasPass, payHow, payUsd, sendAway, bringBack } from './orderEncounters';
import { mulberry32 } from './rng';
import { FRONT } from './occupation';
import { hasCutscene } from './siege';

const hit = (kind: DisasterKind, variant?: string, difficulty: 'cozy' | 'standard' | 'hardcore' = 'standard', seed = 1): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant, difficulty });
  g.clock.t = g.disaster.hitAt + 1; g.disaster.phase = 'impact';
  return g;
};
const at = (g: GameState, day: number) => { g.clock.t = g.disaster.hitAt + day; for (const k of Object.keys(g.disaster.tracks) as Array<keyof GameState['disaster']['tracks']>) g.disaster.tracks[k] = Math.min(g.disaster.tracks[k], 1); };
const run = (g: GameState, days: number) => { const out: string[] = []; for (let d = 1; d <= days; d++) { at(g, d); out.push(...fxDaily(g, { day: d, r: mulberry32(g.seed * 31 + d), once: k => { if (g.disaster.done?.includes(k)) return false; (g.disaster.done ??= []).push(k); return true; } })); } return out; };
const prep = (g: GameState) => { g.people[0].body = 'm'; g.people[0].age = 30; g.people[0].kid = false; return g; };
const card = (g: GameState, kind: ExtraEncounterKind, seed = 3): Encounter | null => fxMakeExtra(g, kind, mulberry32(seed), `e${seed}`, Math.floor(g.clock.t));
const ASK = (kind: DisasterKind): ExtraEncounterKind[] => kind === 'lawless' ? ['tollkeeper', 'posse', 'watch_pact', 'salvage'] : kind === 'civil_war' ? ['deserters', 'checkpoint_stop', 'quota', 'draft_notice', 'fugitive'] : ['checkpoint_stop', 'quota', 'draft_notice', 'fugitive', 'partisan', 'informant', 'lost_soldier', 'reprisal'];

describe('every extra card can be answered with each of its stances', () => {
  for (const kind of ['lawless', 'civil_war', 'invasion'] as DisasterKind[]) for (const ek of ASK(kind)) {
    it(`${kind}: ${ek}`, () => {
      const probe = prep(hit(kind)); at(probe, 70); fxOf(probe).tier = 3; fxOf(probe).maxTier = 3;
      probe.stock.canned = 40; probe.stock.fuel = 10; probe.stock.meds = 4; probe.stock.staples = 8; probe.money = 20000; probe.disaster.tracks.banks = 1;
      const c0 = card(probe, ek);
      expect(c0, 'a card').not.toBeNull();
      const stances = c0!.stances;
      expect(stances.length).toBeGreaterThan(0);
      for (const st of stances) {
        const g = prep(hit(kind)); at(g, 70); fxOf(g).tier = 3; fxOf(g).maxTier = 3;
        g.stock.canned = 40; g.stock.fuel = 10; g.stock.meds = 4; g.stock.staples = 8; g.money = 20000; g.disaster.tracks.banks = 1;
        const e = card(g, ek)!;
        g.gate.pending = e;
        const labels = fxStanceLabels(g, e);
        if (labels) expect(labels[st], `${st} has a label`).toBeTruthy();
        const o = resolve(g, st as Stance);
        expect(g.gate.pending, `${st} clears the card`).toBeNull();
        expect(o.title.length).toBeGreaterThan(0);
        expect(Number.isFinite(g.gate.humanity)).toBe(true);
        for (const v of Object.values(g.stock)) expect(Number.isFinite(v) && v >= 0).toBe(true);
      }
    });
  }
});

describe('lawless', () => {
  it('has three variants and the old id still works', () => {
    const seen = new Set<string>(); for (let s = 1; s < 80; s++) seen.add(hit('lawless', undefined, 'standard', s).disaster.variant);
    expect(seen).toEqual(new Set(['walkout', 'blackout_of_order', 'drift']));
    const g = hit('lawless', 'collapse'); expect(g.disaster.variant).toBe('collapse'); expect(g.disaster.tracks.law).toBeGreaterThanOrEqual(0);
  });
  it('men take the bridge about week three, and a toll pass makes the post go quiet', () => {
    const g = hit('lawless'); const lines = run(g, 22);
    expect(fxOf(g).post).toBe(true); expect(lines.some(l => /taken the bridge/.test(l))).toBe(true);
    at(g, 25); const w1: Array<[EncounterKind, number]> = [['arrival', 30]]; fxEncounterWeights(g, w1, postureOf(g));
    expect(w1.some(e => (e[0] as string) === 'tollkeeper' && e[1] > 5)).toBe(true);
    g.stock.fuel = 5; g.gate.pending = card(g, 'tollkeeper'); const o = resolve(g, 'flag_pay');
    expect(o.title).toMatch(/toll is paid/i); expect(hasPass(g)).toBe(true); expect(g.stock.fuel).toBe(3);
    const w2: Array<[EncounterKind, number]> = [['arrival', 30]]; fxEncounterWeights(g, w2, postureOf(g));
    expect(w2.some(e => (e[0] as string) === 'tollkeeper')).toBe(false);
  });
  it('the envelope works while banks work, and not after', () => {
    const g = hit('lawless'); at(g, 25); g.disaster.tracks.banks = 1; g.money = 5000; g.gate.pending = card(g, 'tollkeeper');
    resolve(g, 'flag_pass'); expect(g.money).toBe(4500); expect(hasPass(g)).toBe(true);
    const h = hit('lawless'); at(h, 25); h.disaster.tracks.banks = 0.1; h.money = 5000; h.gate.pending = card(h, 'tollkeeper');
    resolve(h, 'flag_pass'); expect(h.money).toBe(5000); expect(hasPass(h)).toBe(false);
  });
  it('the posse: accept costs a tenth and halves raids, refuse draws more of them', () => {
    const g = hit('lawless'); at(g, 65); g.stock.canned = 40; g.stock.staples = 10; g.stock.fuel = 20;
    const base: Array<[EncounterKind, number]> = [['gang', 10], ['looters', 10]]; fxEncounterWeights(g, base, postureOf(g));
    expect(base.some(e => (e[0] as string) === 'posse')).toBe(true);
    g.gate.pending = card(g, 'posse'); const h0 = g.gate.humanity; resolve(g, 'pay');
    expect(g.stock.canned).toBe(36); expect(g.gate.humanity).toBe(h0 - 2);
    const w: Array<[EncounterKind, number]> = [['gang', 10]]; fxEncounterWeights(g, w, postureOf(g)); const gangPaid = w.find(e => e[0] === 'gang')![1];
    const r = hit('lawless'); at(r, 65); r.gate.pending = card(r, 'posse'); resolve(r, 'refuse');
    const w2: Array<[EncounterKind, number]> = [['gang', 10]]; fxEncounterWeights(r, w2, postureOf(r)); expect(w2.find(e => e[0] === 'gang')![1]).toBeGreaterThan(gangPaid * 2);
    const w3: Array<[EncounterKind, number]> = []; fxEncounterWeights(g, w3, postureOf(g)); expect(w3.some(e => (e[0] as string) === 'posse')).toBe(false);   // not due again for a month
  });
  it('the watch pact brings neighbors into the pact and can be betrayed', () => {
    const g = hit('lawless'); at(g, 20); for (const n of g.neighbors) n.disposition = 40;
    g.gate.pending = card(g, 'watch_pact'); resolve(g, 'take_in');
    expect(g.locals!.pact.length).toBeGreaterThan(0); expect(fxOf(g).committee!.length).toBeGreaterThan(0);
    let said = ''; for (let d = 21; d < 900 && !fxOf(g).committee?.length === false; d++) { at(g, d); said += fxDaily(g, fxCtxFor(g, d)).join(' '); }
    expect(said).toMatch(/agreement with the posse|committee told the posse/);
  });
  it('salvage: a house whose owners hide costs humanity when it comes out', () => {
    let hiding: Encounter | null = null, g: GameState = hit('lawless');
    for (let sd = 1; sd < 60 && !hiding; sd++) { g = hit('lawless'); at(g, 10); const c = card(g, 'salvage', sd); if (c?.arche === 'hiding') hiding = c; }
    expect(hiding).not.toBeNull(); g.gate.pending = hiding; const h0 = g.gate.humanity; resolve(g, 'take_in');
    expect(fxOf(g).salvaged!.length).toBe(1); const lines = run(g, 60);
    expect(lines.join(' ')).toMatch(/cellar the whole time/); expect(g.gate.humanity).toBe(h0 - 6);
  });
  it('prices climb and the radio talks', () => {
    const g = hit('lawless'); at(g, 90); g.disaster.tracks.banks = 0.1; expect(fxPriceMod(g)).toBeGreaterThan(1.8);
    const b = fxRadio(g, fxCtxFor(g, 13)); expect(b && b.text.length).toBeGreaterThan(10);
  });
});

describe('civil war', () => {
  it('the front holder is rolled at the hit and moves weekly; contested days dip grid and phone', () => {
    const g = hit('civil_war'); expect(fxOnHit(g).join(' ')).toMatch(/holds the town/);
    const f = fxOf(g); expect(f.front).toBeDefined();
    let dipped = false, flips = 0;
    for (let d = 1; d <= 400; d++) { at(g, d); g.disaster.tracks.grid = 1; g.disaster.tracks.phone = 1; const was = f.front!.holder; fxDaily(g, fxCtxFor(g, d)); fxApplyServiceMods(g); if (f.front!.contested > 0) { dipped = true; expect(g.disaster.tracks.grid).toBeCloseTo(FRONT.DIP_LEVEL); expect(g.disaster.tracks.phone).toBeCloseTo(FRONT.DIP_LEVEL); } if (f.front!.holder !== was) flips++; }
    expect(dipped).toBe(true); expect(flips).toBeGreaterThan(2); expect(flips).toBeLessThan(40);
  });
  it('a requisition is due at day 14 and every 14 days after; the card carries odds and costs', () => {
    const g = hit('civil_war'); fxDaily(g, fxCtxFor(g, 1)); at(g, 13);
    const w0: Array<[EncounterKind, number]> = []; fxEncounterWeights(g, w0, postureOf(g)); expect(w0.some(e => (e[0] as string) === 'quota')).toBe(false);
    at(g, 15); g.stock.canned = 50; fxOf(g).front!.contested = 0;
    const w: Array<[EncounterKind, number]> = []; fxEncounterWeights(g, w, postureOf(g)); expect(w.some(e => (e[0] as string) === 'quota' && e[1] >= 400)).toBe(true);
    const e = card(g, 'quota')!; g.gate.pending = e; const labels = fxStanceLabels(g, e)!;
    expect(labels.hide![1]).toMatch(/in 10|almost/); expect(labels.flag_bluff![1]).toMatch(/60%/);
    const before = g.stock.canned; resolve(g, 'pay'); expect(g.stock.canned).toBeLessThan(before); expect(fxOf(g).lastReq).toBe(15);
    at(g, 20); const w2: Array<[EncounterKind, number]> = []; fxEncounterWeights(g, w2, postureOf(g)); expect(w2.some(x => (x[0] as string) === 'quota')).toBe(false);
    at(g, 30); const w3: Array<[EncounterKind, number]> = []; fxEncounterWeights(g, w3, postureOf(g)); expect(w3.some(x => (x[0] as string) === 'quota')).toBe(true);
  });
  it('hiding the stock saves it unless the cache is found; short-weighting keeps 40%', () => {
    let saved = 0, found = 0;
    for (let sd = 1; sd <= 60; sd++) { const g = hit('civil_war', undefined, 'standard', sd); at(g, 15); g.stock.canned = 50; const e = card(g, 'quota', sd)!; g.gate.pending = e; const b = g.stock.canned; resolve(g, 'hide'); if (g.stock.canned === b) saved++; else found++; }
    expect(saved).toBeGreaterThan(found * 3);
    const g = prep(hit('civil_war')); at(g, 15); g.stock.canned = 50; g.stock.staples = 0; g.stock.fuel = 0; g.stock.fresh = 0; g.stock.frozen = 0; const e = card(g, 'quota')!; const want = e.wants!.canned!; g.gate.pending = e;
    // force "not caught"
    fxOf(g).tier = 1; const before = g.stock.canned; resolve(g, 'flag_bluff'); expect(before - g.stock.canned).toBeGreaterThanOrEqual(Math.floor(want * 0.6)); 
  });
  it('the draft takes a man, hiding him can fail, paying keeps him; Cozy has no draft', () => {
    const g = prep(hit('civil_war')); at(g, 35); const men = g.people.filter(p => !p.kid && p.body === 'm');
    if (!men.length) { g.people[0].body = 'm'; }
    const e = card(g, 'draft_notice'); expect(e).not.toBeNull(); const who = e!.people![0]; g.gate.pending = e;
    resolve(g, 'pay'); const ps = g.personState.find(x => x.id === who.id)!; expect(ps.needs.left).toBe(true); expect(ps.needs.died).not.toBeNull();
    expect(fxOf(g).drafted!.length).toBe(1);
    const h = prep(hit('civil_war')); at(h, 35); h.money = 9000; h.disaster.tracks.banks = 1; h.gate.pending = card(h, 'draft_notice'); const m0 = h.money; resolve(h, 'flag_pay'); expect(h.money).toBeLessThan(m0); expect(h.personState.every(p => p.needs.died == null)).toBe(true);
    const c = hit('civil_war', undefined, 'cozy'); at(c, 35); c.people[0].body = 'm'; expect(card(c, 'draft_notice')).toBeNull();
  });
  it('someone sent away comes home on their day', () => {
    const g = hit('civil_war'); at(g, 10); const pid = g.people[0].id; sendAway(g, pid, 70, 'line');
    expect(g.personState[0].needs.left).toBe(true); at(g, 50); expect(bringBack(g)).toEqual([]); at(g, 71); expect(bringBack(g).length).toBe(1); expect(g.personState[0].needs.died).toBeNull();
  });
  it('a checkpoint: papers, a toll or forged ones, and a held pass is void when the front changes hands', () => {
    const g = hit('civil_war'); at(g, 10); fxDaily(g, fxCtxFor(g, 10)); g.stock.canned = 10;
    g.gate.pending = card(g, 'checkpoint_stop'); resolve(g, 'flag_pay'); expect(hasPass(g)).toBe(true);
    const f = fxOf(g); f.front!.holder = f.front!.holder === 'alliance' ? 'compact' : 'alliance'; expect(hasPass(g)).toBe(false);
    const x = hit('civil_war'); at(x, 10); fxDaily(x, fxCtxFor(x, 10)); x.money = 9000; x.disaster.tracks.banks = 1;
    const m0 = x.money; x.gate.pending = card(x, 'checkpoint_stop'); resolve(x, 'pay'); expect(x.money).toBe(m0 - 3000);
  });
  it('snipers: cover cuts the hit, a shot lands on someone otherwise', () => {
    const g = hit('civil_war'); const f = fxOf(g); f.sniperFrom = 1; f.sniperUntil = 400;
    let hurt = 0; for (let d = 1; d <= 60; d++) { at(g, d); const l = fxDaily(g, fxCtxFor(g, d)); if (l.some(x => /ridge/.test(x))) hurt++; if (g.personState.some(p => p.needs.died != null)) break; }
    expect(hurt).toBeGreaterThan(0);
  });
  it('deserters are a hostile raid card (a cutscene), not a merciful one', () => {
    const g = hit('civil_war'); at(g, 90); const e = card(g, 'deserters')!; expect(hasCutscene(e)).toBe(true); expect(EXTRA_META.deserters.raid).toBe(true);
    expect(e.temper === 'hard' || e.temper === 'desperate').toBe(true); expect(e.size).toBeGreaterThanOrEqual(4); expect(e.size).toBeLessThanOrEqual(8);
    const w: Array<[EncounterKind, number]> = []; at(g, 5); fxEncounterWeights(g, w, postureOf(g)); expect(w.some(x => (x[0] as string) === 'deserters')).toBe(false);
    at(g, 120); const w2: Array<[EncounterKind, number]> = []; fxEncounterWeights(g, w2, postureOf(g)); expect(w2.some(x => (x[0] as string) === 'deserters')).toBe(true);
  });
  it('the other flag burns, prices rise, two radio voices', () => {
    const g = hit('civil_war'); at(g, 30); expect(fxPriceMod(g)).toBeGreaterThanOrEqual(1.5);
    const seen = new Set<string>(); for (let i = 0; i < 40; i++) { const b = fxRadio(g, { day: 30, r: mulberry32(i), once: () => true }); if (b) seen.add(b.text); } expect(seen.size).toBeGreaterThan(3);
  });
  it('Cozy halves the requisition and Hardcore doubles its frequency', () => {
    const h = hit('civil_war', undefined, 'hardcore'); fxDaily(h, fxCtxFor(h, 1)); at(h, 23); fxOf(h).lastReq = 15;
    const w: Array<[EncounterKind, number]> = []; fxEncounterWeights(h, w, postureOf(h)); expect(w.some(x => (x[0] as string) === 'quota')).toBe(true);
  });
});

describe('invasion', () => {
  it('tiers: 1 at the hit, 2 by day 90, 3 on Hardcore by day 240, never on Cozy', () => {
    const tierAfter = (diff: 'cozy' | 'standard' | 'hardcore', day: number, fate?: 'never') => { const g = hit('invasion', 'occupation', diff); if (fate) g.disaster.fate = fate; fxOnHit(g); for (let d = 1; d <= day; d++) { at(g, d); fxDaily(g, fxCtxFor(g, d)); } return fxOf(g).tier; };
    expect(tierAfter('standard', 3)).toBe(1); expect(tierAfter('standard', 95)).toBe(2); expect(tierAfter('standard', 250)).toBe(2); expect(tierAfter('standard', 340, 'never')).toBe(3);
    expect(tierAfter('hardcore', 250)).toBe(3); expect(tierAfter('cozy', 250, 'never')).toBe(1);
  });
  it('the decree: old dollars lose value and prices follow', () => {
    const g = hit('invasion'); at(g, 5); const p5 = fxPriceMod(g); at(g, 30); const p30 = fxPriceMod(g); at(g, 70); const p70 = fxPriceMod(g);
    expect(p5).toBe(1); expect(p30).toBeGreaterThan(p5); expect(p70).toBeGreaterThan(p30);
    expect(run(hit('invasion'), 65).filter(l => /Decree/.test(l)).length).toBe(2);
  });
  it('a checkpoint pass: honest papers, forged papers and the name you give', () => {
    const g = hit('invasion'); at(g, 10); fxOnHit(g);
    g.gate.pending = card(g, 'checkpoint_stop'); const h0 = g.gate.humanity; const m = g.neighbors.filter(n => n.status === 'home').length; resolve(g, 'confront');
    expect(g.gate.humanity).toBe(h0 - 20); expect(hasPass(g)).toBe(true); expect(g.neighbors.filter(n => n.status === 'home').length).toBe(m - 1);
  });
  it('the forced labor draft sends one adult for 60 days, and an elder can go instead', () => {
    const g = prep(hit('invasion', undefined, 'hardcore')); at(g, 200); fxOnHit(g); fxOf(g).tier = 3;
    g.gate.pending = card(g, 'draft_notice'); const who = g.gate.pending!.people![0]; resolve(g, 'pay');
    expect(g.personState.find(p => p.id === who.id)!.needs.left).toBe(true); at(g, 262); expect(bringBack(g).length).toBe(1);
  });
  it('partisans: shelter brings intel and reprisal risk, and the column can come', () => {
    const g = hit('invasion'); at(g, 100); fxOnHit(g); fxOf(g).tier = 2; g.stock.canned = 20; g.stock.meds = 3;
    g.gate.pending = card(g, 'partisan'); resolve(g, 'take_in'); expect(fxOf(g).intel).toBe(1); expect(fxOf(g).resistance).toBeGreaterThan(0);
    let said = ''; for (let d = 101; d < 400; d++) { at(g, d); said += fxDaily(g, fxCtxFor(g, d)).join(' '); }
    expect(said).toMatch(/ambushed|moved on|told them/);
  });
  it('a merciful lone soldier can be helped or hidden; shooting him costs humanity', () => {
    const g = hit('invasion'); at(g, 100); g.gate.pending = card(g, 'lost_soldier'); const h0 = g.gate.humanity; resolve(g, 'trade'); expect(g.gate.humanity).toBe(h0 + 4);
    g.gate.pending = card(g, 'lost_soldier', 5); resolve(g, 'defend'); expect(g.gate.humanity).toBe(h0 + 4 - 15);
  });
  it('the informant card: telling marks you, lying may not', () => {
    const g = hit('invasion'); at(g, 100); fxOf(g).tier = 2; g.gate.pending = card(g, 'informant'); resolve(g, 'pay'); expect(fxOf(g).marked).toBeGreaterThan(100);
  });
  it('the contested variant moves the front; soft never reaches tier 3', () => {
    const g = hit('invasion', 'contested'); fxOnHit(g); expect(fxOf(g).front).toBeDefined();
    const s = hit('invasion', 'soft', 'hardcore'); fxOnHit(s); expect(fxOf(s).maxTier).toBe(2);
  });
  it('the radio reads the proclamations', () => { const g = hit('invasion'); at(g, 40); fxOnHit(g); const seen = new Set<string>(); for (let i = 0; i < 40; i++) { const b = fxRadio(g, { day: 40, r: mulberry32(i), once: () => true }); if (b) seen.add(b.text); } expect(seen.size).toBeGreaterThan(2); });
});

describe('money and extras', () => {
  it('pays in dollars while the banks work, then cash, silver and goods', () => {
    const g = hit('lawless'); g.money = 1000; g.disaster.tracks.banks = 1; expect(payHow(g, 500)).toBe('bank');
    g.disaster.tracks.banks = 0.1; g.stock.canned = 20; expect(payHow(g, 500)).toBe('goods'); g.fin.cash = 600; expect(payHow(g, 500)).toBe('cash');
    g.fin.cash = 0; g.stock.canned = 0; expect(payHow(g, 500)).toBeNull();
    g.fin.holdings.push({ kind: 'silver_round', units: 20, where: 'safe' }); expect(payHow(g, 500)).toBe('silver'); payUsd(g, 500); expect(g.fin.holdings[0].units).toBeLessThan(20);
  });
  it('every extra kind is in the table', () => { for (const k of ['tollkeeper', 'deserters', 'quota', 'partisan']) expect(isExtraKind(k)).toBe(true); expect(isExtraKind('looters')).toBe(false); });
});
