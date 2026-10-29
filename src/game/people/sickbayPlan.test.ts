import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { newGame, type GameState } from '../../sim/state';
import { freshNeeds } from '../../sim/needs';
import type { Person } from '../../sim/family';
import { FIG_POSE } from '../../engine/world/people/figureKit';
import { bedPatients, figureScale, sickbayPlan, type BedSlot } from './sickbayPlan';
import { buildLayers, KIT } from '../buildkit/buildings';
import { M } from '../buildkit/interior';
import type { SickSlot } from '../buildkit/shell';

const slot = (key: string, o: Partial<BedSlot> = {}): BedSlot => ({ key, bay: false, x: 10, y: 0.6, z: 20, fx: 0, fz: 1, sx: 1, sz: 0, floorY: 0.5, openA: true, openB: true, ...o });
const game = (): GameState => newGame(5);
const addPerson = (g: GameState, id: string, kid = false, age = 35): Person => {
  const base = g.people[0];
  const q: Person = { ...structuredClone(base), id, first: id, kid, age, job: undefined };
  delete q.partner; delete q.parents; delete q.conditions;
  g.people.push(q); g.personState.push({ id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  return q;
};
const sick = (g: GameState, i: number, sev: number, task = 'sleep') => { g.personState[i].needs.hurt.push({ what: 'a fever', sev }); g.personState[i].task = task as never; };

describe('the sickbay: who is put to bed', () => {
  it('nobody is in bed when nobody is badly hurt or ill', () => {
    const g = game();
    expect(bedPatients(g)).toEqual([]);
    expect(sickbayPlan(g, [slot('a')]).size).toBe(0);
  });

  it('the badly hurt or ill who are resting lie down, worst first; those at work do not', () => {
    const g = game();
    sick(g, 0, 35); sick(g, 1, 60, 'leisure'); sick(g, 2, 70, 'garden');
    g.personState[3].needs.health = 30; g.personState[3].task = 'sleep';
    const ids = bedPatients(g).map(p => g.people[p.i].id);
    expect(ids).toEqual([g.people[1].id, g.people[0].id, g.people[3].id]);   // (a person run down with no wound ranks below a wound at 35)
    expect(ids).not.toContain(g.people[2].id);
  });

  it('a patient lies on the mattress on their back, head to the head of the bed, kids smaller', () => {
    const g = game();
    sick(g, 0, 50);
    const m = sickbayPlan(g, [slot('a')]);
    const p = m.get(g.people[0].id)!;
    expect(p.role).toBe('patient');
    expect(p.pitch).toBeCloseTo(-Math.PI / 2);
    expect(p.pose).toBe(FIG_POSE.STAND);
    // the bed runs along z (head toward -z): the figure's turn is the foot direction (+z = 0), and it lies centered on the bed
    expect(p.rot).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeGreaterThan(20);              // the feet end is toward the foot of the bed
    expect(p.z).toBeLessThan(20 + 0.28);
    expect(p.y).toBeGreaterThan(0.6);
    expect(p.y).toBeLessThan(0.7);
    const kid = addPerson(g, 'Kit', true, 6);
    sick(g, g.people.length - 1, 80);
    const m2 = sickbayPlan(g, [slot('a'), slot('b', { x: 14 })]);
    expect(m2.get('Kit')!.scale).toBe(figureScale(kid));
    expect(m2.get('Kit')!.scale).toBeLessThan(1);
    // the kid is worse off and gets the first bed
    expect(m2.get('Kit')!.bed).toBe('a');
  });

  it('the medic stands at the bedside on a clear side, facing the bed, one arm out', () => {
    const g = game();
    sick(g, 0, 50); g.personState[1].task = 'medic';
    const m = sickbayPlan(g, [slot('a')]);
    const med = m.get(g.people[1].id)!;
    expect(med.role).toBe('medic');
    expect(med.pose).toBe(FIG_POSE.REACH);
    expect(med.y).toBe(0.5);                                 // on the floor
    expect(Math.abs(med.x - 10)).toBeGreaterThan(0.1);        // beside the bed, not on it
    expect(Math.abs(med.x - 10)).toBeLessThan(0.25);
    // facing the bed: side A is +x so the medic looks toward -x
    expect(Math.sin(med.rot)).toBeLessThan(-0.9);
    // with side A blocked, the other side
    const m2 = sickbayPlan(g, [slot('a', { openA: false })]);
    expect(m2.get(g.people[1].id)!.x).toBeLessThan(10);
    expect(Math.sin(m2.get(g.people[1].id)!.rot)).toBeGreaterThan(0.9);
    // both blocked: no one stands there (the medic keeps to the door)
    expect(sickbayPlan(g, [slot('a', { openA: false, openB: false })]).has(g.people[1].id)).toBe(false);
  });

  it('the patient is never their own medic, and a medic with nobody to tend is left to the door', () => {
    const g = game();
    sick(g, 0, 50, 'medic');                // resting? no: on medic duty, so not in bed
    expect(sickbayPlan(g, [slot('a')]).size).toBe(0);
    const g2 = game();
    g2.personState[1].task = 'medic';
    expect(sickbayPlan(g2, [slot('a')]).size).toBe(0);
  });

  it('serious cases go to the bunker\'s medical corner, the rest to the home, the corner when the home is full', () => {
    const g = game();
    sick(g, 0, 40); sick(g, 1, 70); sick(g, 2, 35);
    const slots = [slot('home:0', { x: 1 }), slot('bay:0', { x: 2, bay: true }), slot('bay:1', { x: 3, bay: true })];
    const m = sickbayPlan(g, slots);
    expect(m.get(g.people[1].id)!.bed).toBe('bay:0');
    expect(m.get(g.people[0].id)!.bed).toBe('home:0');
    expect(m.get(g.people[2].id)!.bed).toBe('bay:1');
    // no beds at all: nobody is moved
    expect(sickbayPlan(g, []).size).toBe(0);
    // one bed for three: the worst gets it
    expect(sickbayPlan(g, [slot('home:0')]).size).toBe(1);
    expect([...sickbayPlan(g, [slot('home:0')]).keys()]).toEqual([g.people[1].id]);
  });
});

describe('the beds the buildings mark', () => {
  const slots = (kind: string) => buildLayers(KIT[kind]).userData.sickSlots as SickSlot[];

  it('the farmhouse has a sickbay cot, the cabin its bed, the bunker\'s medical corner two beds', () => {
    expect(slots('farmhouse').length).toBeGreaterThanOrEqual(1);
    expect(slots('timber_cabin').length).toBe(1);
    expect(slots('bunker_medical').length).toBe(2);
    expect(slots('log_house').length).toBeGreaterThanOrEqual(1);
    expect(slots('cottage').length).toBeGreaterThanOrEqual(1);
  });

  it('a slot is the middle of a mattress: about 0.58 m up, a unit foot vector along the bed and a side vector across it', () => {
    for (const kind of ['farmhouse', 'timber_cabin', 'bunker_medical']) for (const s of slots(kind)) {
      const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
      expect(len(s.foot)).toBeCloseTo(1, 3);
      expect(len(s.side)).toBeCloseTo(1, 3);
      expect(Math.abs(s.foot[0] * s.side[0] + s.foot[1] * s.side[1] + s.foot[2] * s.side[2])).toBeLessThan(1e-3);
      expect(Math.abs(s.foot[1])).toBeLessThan(1e-3);          // level
      expect(s.o[1]).toBeGreaterThan(0.5 * M);
      expect(s.o[1]).toBeLessThan(1.4);
    }
  });

  it('the slots are not drawn as geometry', () => {
    expect(buildLayers(KIT.farmhouse).children.some(m => m.name.includes('sick_slot'))).toBe(false);
  });

  it('the farmhouse cot sits in the parlor with its head to the right wall', () => {
    const s = slots('farmhouse')[0];
    // the head end is at +x (the foot vector points to -x), the bed lies along x
    expect(Math.abs(s.foot[0])).toBeGreaterThan(0.99);
    expect(s.foot[0]).toBeLessThan(0);
    expect(s.o[2]).toBeGreaterThan(0.4);        // in the front half of the house
  });
});
