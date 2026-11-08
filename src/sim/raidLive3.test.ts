/** Defender panic, heroics and last words in live fights (tied to the person's makeup), and the fields exposed on units for the scene. */
import { describe, expect, it } from 'vitest';
import { planBattle } from './battle';
import { gateDay, resolve, type Encounter } from './encounters';
import { stageRaid } from './raidCutscene';
import { dayIndex, SAVE_VERSION } from './state';
import { migrate } from './save/migrations';
import type { GameState } from './state';
import { CREWS, opts, place, problems } from './raidTestKit';
import type { BattleEvent } from './battleTypes';

const evs = <K extends BattleEvent['kind']>(b: { events: BattleEvent[] }, k: K) => b.events.filter(e => e.kind === k) as Array<Extract<BattleEvent, { kind: K }>>;

describe('the people in the fight', () => {
  it('every defender with a person carries traits on the unit; kin point at units that are in the fight', () => {
    const g = place(2, 'standard', 'container'), b = planBattle(g, 8, 5, opts(CREWS[1]));
    const homes = b.units.filter(u => u.side === 'home' && u.personId);
    expect(homes.length).toBeGreaterThan(0);
    for (const u of homes) {
      expect(u.traits).toBeDefined();
      expect(['freezes', 'steady', 'heroic']).toContain(u.traits!.courage);
      for (const k of u.traits!.kin) if (k.unit) expect(b.units.some(x => x.id === k.unit)).toBe(true);
    }
    expect(b.units.filter(u => u.side === 'raider').every(u => !u.traits)).toBe(true);
  });
  it('last words are spoken by the person who is dying, name the people they love, and never by anyone else', () => {
    let said = 0, named = 0;
    for (let i = 0; i < 90; i++) {
      const g = place(1 + (i % 9), 'standard', i % 2 ? 'armed' : 'container'), o = opts(CREWS[(i % 3) + 1]), b = planBattle(g, 9, 100 + i, o);
      expect(problems(g, b, o)).toEqual([]);
      for (const e of evs(b, 'say').filter(x => x.ctx === 'last_words')) {
        said++;
        expect(e.who).toBeDefined();
        const u = b.units.find(x => x.id === e.who)!;
        expect(u.side).toBe('home');
        expect(b.events.some(d => d.kind === 'death' && d.unit === e.who)).toBe(true);
        if (u.traits!.kin.some(k => e.text.includes(k.name))) named++;
      }
    }
    expect(said).toBeGreaterThan(8); expect(named).toBeGreaterThan(0);
  });
  it('panic is real and tied to the person: more of the green freeze than of the steady, and a frozen defender does not shoot while frozen', () => {
    let panics = 0, frozenShots = 0;
    const byCourage: Record<string, number> = { freezes: 0, steady: 0, heroic: 0 };
    for (let i = 0; i < 120; i++) {
      const g = place(1 + (i % 9), 'hardcore', 'armed'), b = planBattle(g, 10, 300 + i, opts(CREWS[2]));
      for (const e of evs(b, 'panic')) {
        panics++; byCourage[b.units.find(u => u.id === e.unit)!.traits!.courage]++;
        if (e.how === 'freeze') frozenShots += b.events.filter(s => s.kind === 'shot' && s.from === e.unit && s.t > e.t + 1.0 && s.t < e.t + e.secs - 0.5).length;
      }
    }
    expect(panics).toBeGreaterThan(5);
    expect(byCourage.freezes + byCourage.steady).toBeGreaterThanOrEqual(byCourage.heroic);
    expect(frozenShots).toBe(0);
  });
  it('heroes step in: a drag or a cover for the wounded, an avenging charge for their own', () => {
    const acts: Record<string, number> = {};
    for (let i = 0; i < 140; i++) {
      const g = place(1 + (i % 9), 'standard', 'armed'), b = planBattle(g, 9, 500 + i, opts(CREWS[1]));
      for (const e of evs(b, 'heroic')) { acts[e.act] = (acts[e.act] ?? 0) + 1; expect(b.units.find(u => u.id === e.unit)!.side).toBe('home'); }
      expect(b.raid!.moments === undefined || b.raid!.moments.every(m => b.units.some(u => u.id === m.unit))).toBe(true);
    }
    expect(Object.values(acts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

const flagged = (g: GameState, kind: 'militia' | 'gang' | 'requisition' = 'militia', temper: 'desperate' | 'hard' = 'hard'): Encounter => {
  const e = { id: 'f1', kind, day: 5, title: 'A crew', dossier: [], size: 7, armed: true, strength: 80, wants: { canned: 5, fuel: 2 }, stances: ['hide', 'parley', 'defend', 'flag_pay', ...(kind === 'militia' ? ['flag_pass'] : []), 'flag_bluff', 'flag_shoot'], temper, opener: { kind: 'demand' } } as Encounter;
  g.gate.pending = e; return e;
};

describe('the man under the white flag: accept, refuse, bluff, shoot', () => {
  it('the card offers the choices (passage only from the disciplined)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 300 && seen < 6; seed++) {
      const g = place(1 + (seed % 9), 'standard', 'armed'); g.gate.day = -1; g.gate.next = dayIndex(g.clock.t); g.gate.pending = null; g.seed = seed; g.disaster.tracks = { ...g.disaster.tracks, law: 0 };
      const e = gateDay(g);
      if (e?.opener?.kind !== 'demand') continue;
      seen++; expect(e.stances).toEqual(expect.arrayContaining(['flag_pay', 'flag_bluff', 'flag_shoot', 'defend']));
      expect(e.stances.includes('flag_pass')).toBe(e.kind === 'militia' || e.kind === 'patrol');
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('letting them pass costs nothing and starts no fight', () => {
    const g = place(2, 'standard', 'container'); flagged(g); const canned = g.stock.canned;
    const o = resolve(g, 'flag_pass'); expect(o.title).toBe('They passed through'); expect(g.stock.canned).toBe(canned); expect(g.gate.battle).toBeUndefined();
  });
  it('a bluff works more often from a hard-looking, well-armed place with a good talker, and a called bluff is a fight against an angrier crew', () => {
    const run = (layout: 'bare' | 'container_gate', talker: number) => { let ok = 0, fights = 0; for (let i = 0; i < 100; i++) { const g = place(1 + (i % 8), 'standard', layout); g.people.forEach(p => { if (!p.kid) p.skills.negotiator = talker; }); flagged(g); g.gate.pending!.day = 5 + i; const o = resolve(g, 'flag_bluff'); if (o.title === 'They backed off') ok++; else if (g.gate.battle) fights++; } return { ok, fights }; };
    const strong = run('container_gate', 9), weak = run('bare', 0);
    expect(strong.ok).toBeGreaterThan(weak.ok); expect(weak.fights).toBeGreaterThan(20);
  });
  it('shooting the envoy costs humanity and a man off the crew, and the crew is nearly always enraged; some run', () => {
    let ran = 0, fought = 0;
    for (let i = 0; i < 80; i++) {
      const g = place(1 + (i % 8), 'standard', 'container'); const e = flagged(g, 'militia'); e.day = 5 + i; const h0 = g.gate.humanity;
      const o = resolve(g, 'flag_shoot');
      expect(g.gate.humanity).toBeLessThanOrEqual(h0 - 10 + 1); expect(o.lines.join(' ')).toMatch(/white flag/);
      if (o.title === 'They ran') ran++; else if (g.gate.battle) { fought++; expect(g.gate.battle.units.filter(u => u.side === 'raider').length).toBeLessThanOrEqual(6); }
    }
    expect(ran).toBeGreaterThan(0); expect(fought).toBeGreaterThan(30);
  });
  it('refusing and fighting sometimes meets an angrier crew; an angry crew is harder to break', () => {
    let angrier = 0;
    for (let i = 0; i < 60; i++) { const g = place(1 + (i % 8), 'standard', 'container'); const e = flagged(g, 'gang', 'hard'); e.day = 5 + i; const o = resolve(g, 'defend'); if (o.lines.some(l => /angrier/.test(l))) angrier++; }
    expect(angrier).toBeGreaterThan(5);
    let breaks = 0, breaksAngry = 0;
    for (let i = 0; i < 80; i++) { const g = place(1 + (i % 8), 'standard', 'container'); const a = planBattle(g, 8, 900 + i, opts(CREWS[1])), b = planBattle(g, 8, 900 + i, { ...opts(CREWS[1]), angry: true }); if (a.result === 'fled' || a.result === 'repelled') breaks++; if (b.result === 'fled' || b.result === 'repelled') breaksAngry++; }
    expect(breaksAngry).toBeLessThanOrEqual(breaks);
  });
});

describe('scouts the watch spotted: drive off, capture, ignore, prepare', () => {
  const scouted = (seed: number): { g: GameState; e: Encounter } => {
    const g = place(1 + (seed % 8), 'standard', 'container_gate');
    const e = { id: `s${seed}`, kind: 'gang', day: 5 + seed, title: 'A gang', dossier: [], size: 8, armed: true, strength: 90, wants: { canned: 5 }, stances: ['defend'], temper: 'hard', opener: { kind: 'scouts', spotted: true } } as Encounter;
    g.gate.pending = e; return { g, e };
  };
  it('ignoring them leaves the crew knowing the weak side; preparing is half a warning; the others take the intel away', () => {
    const intel = (plan?: 'drive_off' | 'capture' | 'ignore' | 'prepare') => { let n = 0, fights = 0; for (let i = 0; i < 60; i++) { const { g } = scouted(i); const st = stageRaid(g, 'defend', undefined, undefined, plan), b = st.staged.gate.battle; if (b?.raid?.opener?.kind === 'scouts') { fights++; if (b.raid.opener.intel) n++; } } return { n, fights }; };
    const ignore = intel('ignore'), prep = intel('prepare'), drive = intel('drive_off');
    expect(ignore.n).toBe(ignore.fights); expect(ignore.fights).toBeGreaterThan(30);
    expect(prep.n).toBeLessThan(prep.fights); expect(prep.n).toBeGreaterThan(5);
    expect(drive.n).toBe(0);
  });
  it('driving them off costs six rounds and sometimes ends it before it starts; capturing takes a prisoner you can question and leaves the crew short', () => {
    let deterred = 0, spent = 0, prisoners = 0, short = 0;
    for (let i = 0; i < 80; i++) {
      const { g } = scouted(i), r0 = g.armory.ammo['556'] ?? 0;
      const st = stageRaid(g, 'defend', undefined, undefined, 'drive_off');
      if (st.outcome.title === 'They thought better of it') deterred++;
      if ((st.staged.armory.ammo['556'] ?? 0) <= r0 - 6) spent++;
      const { g: g2 } = scouted(i), st2 = stageRaid(g2, 'defend', undefined, undefined, 'capture');
      if ((st2.staged.gate.prisoners?.length ?? 0) > 0) { prisoners++; if (st2.staged.gate.battle) short += st2.staged.gate.battle.units.filter(u => u.side === 'raider').length <= 6 ? 1 : 0; }
    }
    expect(deterred).toBeGreaterThan(3); expect(spent).toBeGreaterThan(60); expect(prisoners).toBeGreaterThan(5); expect(short).toBeGreaterThan(0);
  });
  it('preparing readies the family at once', () => {
    let faster = 0;
    for (let i = 0; i < 40; i++) {
      const a = scouted(i), b = scouted(i);
      const x = stageRaid(a.g, 'defend', undefined, undefined, 'ignore').staged.gate.battle, y = stageRaid(b.g, 'defend', undefined, undefined, 'prepare').staged.gate.battle;
      if (!x || !y) continue;
      const first = (bt: typeof x) => bt.events.find(e => e.kind === 'shot' && e.from.startsWith('h_'))?.t ?? 99;
      if (first(y) <= first(x)) faster++;
    }
    expect(faster).toBeGreaterThan(15);
  });
});

describe('save v89', () => {
  it('an old save (v88) migrates and a prisoner without questions can be asked', () => {
    const old = JSON.parse(JSON.stringify(place(2, 'standard', 'armed'))); old.version = 88; old.gate.prisoners = [{ id: 'pr9', name: 'Cole', since: 0, sev: 5, talked: false, trust: 20 }];
    const g = migrate(old); expect(g.version).toBe(SAVE_VERSION); expect(SAVE_VERSION).toBe(89);
    expect(g.gate.prisoners![0].asked).toBeUndefined();
  });
});
