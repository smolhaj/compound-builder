import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { appendicitisPlan, birthRisk, careFor, dentalEmergency, lastShot, medicalDay, medicalOf, medicalWork, startCase, takeAntibiotics, tetanusCovered, vaccinate, waterSickness } from './medical';
import { liveDay } from './needs';
import { mulberry32 } from './rng';
import { hoursFor } from './skills';

function noHospital(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, medical: 0 };
  g.stock.canned = 60;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  for (const p of g.people) p.skills.medic = 0;
  return g;
}
const days = (g: GameState, n: number) => { for (let d = 0; d < n; d++) { g.clock.t += 1; medicalDay(g); } };
const dead = (g: GameState, i: number) => g.personState[i].needs.died != null;
function skilled(g: GameState) {
  g.people[1].skills.medic = 7;
  g.stock.surgical_kit = 1; g.stock.fish_antibiotics = 2; g.stock.meds = 4; g.stock.medical_books = 1;
  g.structures.push({ id: 'bay', kind: 'bunker_medical', x: 4, z: 4, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
}

describe('appendicitis with no hospital', () => {
  it('the odds: about half die with nothing; a skilled medic with a kit and the bay operates and most live', () => {
    const g = noHospital(2);
    expect(appendicitisPlan(g, g.people[0].id)).toEqual({ plan: 'none', pDeath: 0.5 });
    g.stock.fish_antibiotics = 1; g.people[1].skills.medic = 3;
    expect(appendicitisPlan(g, g.people[0].id).plan).toBe('antibiotics');
    expect(appendicitisPlan(g, g.people[0].id).pDeath).toBeLessThan(0.2);
    skilled(g);
    const sx = appendicitisPlan(g, g.people[0].id);
    expect(sx.plan).toBe('surgery');
    expect(sx.pDeath).toBeLessThan(0.08);
    g.disaster.tracks.medical = 1;
    expect(appendicitisPlan(g, g.people[0].id).plan).toBe('hospital');
  });

  it('played out: many die without care, few with a skilled medic, the kit and the bay', () => {
    let untreated = 0, cared = 0;
    const N = 80;
    for (let seed = 1; seed <= N; seed++) {
      const a = noHospital(seed), b = noHospital(seed);
      skilled(b);
      for (const g of [a, b]) { startCase(g, g.people[0].id, 'appendicitis', 50); days(g, 12); }
      if (dead(a, 0)) untreated++;
      if (dead(b, 0)) cared++;
    }
    expect(untreated / N).toBeGreaterThan(0.3);
    expect(untreated / N).toBeLessThan(0.7);
    expect(cared / N).toBeLessThan(0.15);
    expect(cared).toBeLessThan(untreated / 3);
  });

  it('surgery is practice: the medic gets better', () => {
    const g = noHospital(3);
    skilled(g);
    const total = () => { const m = g.people[1]; let h = g.learning!.xp[m.id]?.medic ?? 0; for (let l = 0; l < m.skills.medic; l++) h += hoursFor(l); return h; };
    const before = total();
    startCase(g, g.people[0].id, 'appendicitis', 50);
    days(g, 4);
    expect(total()).toBeGreaterThan(before + 20);
  });

  it('a patient can\'t be their own medic, and is off work', () => {
    const g = noHospital(4);
    g.people[0].skills.medic = 9;
    startCase(g, g.people[0].id, 'appendicitis', 50);
    expect(careFor(g, g.people[0].id).medic?.id).not.toBe(g.people[0].id);
    expect(medicalWork(g, g.people[0].id)).toBe(0);
  });
});

describe('teeth, bones, burns, nails, water', () => {
  it('an abscess with the dental kit and a little training: the tooth comes out; with nothing, pliers', () => {
    const g = noHospital(5);
    g.people[1].skills.medic = 3; g.stock.dental_kit = 1;
    dentalEmergency(g, g.people[0].id);
    days(g, 10);
    const c = medicalOf(g).cases.find(x => x.kind === 'abscess');
    expect(!c || c.care.includes('pulled') || c.care.includes('root')).toBe(true);
    const h = noHospital(5);
    h.people[1].skills.medic = 2; h.stock.meds = 0;
    dentalEmergency(h, h.people[0].id);
    const lines: string[] = [];
    for (let d = 0; d < 6; d++) { h.clock.t += 1; lines.push(...medicalDay(h)); }
    expect(lines.join(' ')).toMatch(/pliers|drained|spread/);
  });

  it('a broken leg: set and splinted, weeks off heavy work, then it knits', () => {
    const g = noHospital(6);
    g.people[1].skills.medic = 5; g.stock.meds = 2;
    startCase(g, g.people[0].id, 'fracture', 40, { bone: 'leg' });
    days(g, 2);
    const c = medicalOf(g).cases[0];
    expect(c.care).toMatch(/set by|splint/);
    expect(medicalWork(g, g.people[0].id)).toBeLessThan(0.3);
    const hurt = g.personState[0].needs.hurt.find(h => h.med === c.id)!;
    expect(hurt.what).toMatch(/broken leg.*weeks to go/);
    days(g, 60);
    expect(medicalOf(g).cases.some(x => x.kind === 'fracture')).toBe(false);
    expect(g.personState[0].needs.hurt.some(h => h.med === c.id)).toBe(false);
  });

  it('the hurt list runs its own course for medical cases (needs.ts leaves them to medical.ts)', () => {
    const g = noHospital(7);
    startCase(g, g.people[0].id, 'fracture', 30, { bone: 'wrist' });
    const sev = g.personState[0].needs.hurt[0].sev, meds = g.stock.meds;
    liveDay(g, 0.5);
    expect(g.personState[0].needs.hurt[0].sev).toBe(sev);
    expect(g.stock.meds).toBe(meds);
  });

  it('tetanus: kids are up to date; a booster at the clinic covers the adults', () => {
    const g = newGame(8);
    for (const p of g.people.filter(x => x.kid)) expect(tetanusCovered(g, p)).toBe(true);
    for (const p of g.people) expect(lastShot(g, p)).toBeLessThanOrEqual(g.clock.startYear);
    const due = g.people.filter(p => !tetanusCovered(g, p));
    if (due.length) { expect(vaccinate(g)).toBeNull(); for (const p of g.people) expect(tetanusCovered(g, p)).toBe(true); }
    expect(vaccinate(g)).toBe('everyone is up to date');
  });

  it('untreated tetanus is often fatal; sepsis without antibiotics kills most', () => {
    let tet = 0, sep = 0, sepAbx = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = noHospital(seed); startCase(a, a.people[0].id, 'tetanus', 75); days(a, 20); if (dead(a, 0)) tet++;
      const b = noHospital(seed); b.stock.meds = 0; startCase(b, b.people[0].id, 'sepsis', 85); days(b, 6); if (dead(b, 0)) sep++;
      const c = noHospital(seed); c.stock.fish_antibiotics = 1; c.people[1].skills.medic = 4; startCase(c, c.people[0].id, 'sepsis', 85); days(c, 6); if (dead(c, 0)) sepAbx++;
    }
    expect(tet).toBeGreaterThan(8);
    expect(sep).toBeGreaterThan(18);
    expect(sepAbx).toBeLessThan(sep / 2);
  });

  it('bad water is sometimes dysentery; fish antibiotics go a quarter bottle a course', () => {
    const g = noHospital(9);
    const r = mulberry32(3);
    const lines = Array.from({ length: 20 }, () => waterSickness(g, g.people[0].id, r));
    expect(lines.some(l => l.includes('dysentery'))).toBe(true);
    g.stock.fish_antibiotics = 1; g.stock.meds = 0;
    expect(takeAntibiotics(g)).toBe('fish');
    expect(g.stock.fish_antibiotics).toBeCloseTo(0.75);
  });

  it('cozy: nobody dies of it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'cozy' });
      g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
      g.disaster.tracks = { ...g.disaster.tracks, medical: 0 };
      startCase(g, g.people[0].id, 'appendicitis', 50);
      days(g, 30);
      expect(dead(g, 0)).toBe(false);
    }
  });
});

describe('childbirth', () => {
  it('a midwife or medic and the midwifery kit cut the risk to mother and baby', () => {
    const g = noHospital(10);
    const mom = g.people.find(p => p.body === 'f' && !p.kid) ?? g.people[0];
    const alone = birthRisk(g, mom);
    for (const p of g.people) if (p !== mom && !p.kid) p.skills.medic = 6;
    g.stock.midwifery_kit = 1;
    const helped = birthRisk(g, mom);
    expect(helped.baby).toBeLessThan(alone.baby * 0.7);
    expect(helped.mother).toBeLessThan(alone.mother * 0.7);
    g.disaster.tracks.medical = 1;
    expect(birthRisk(g, mom)).toEqual({ baby: 0, mother: 0 });
  });
});
