/**
 * A plausible raid for testing the playback without the battle sim: alarm,
 * lights, four residents to posts, six raiders from one edge, shots, a mine,
 * a wound, the raiders flee. Pure (seeded by the inputs).
 */
import type { Battle, BattleEvent, BattleUnit } from '../../sim/battleTypes';

export interface DemoStructure { kind: string; x: number; z: number }
export interface DemoPerson { id: string; kid?: boolean }

export function demoBattle(structures: readonly DemoStructure[], people: readonly DemoPerson[], center?: { x: number; z: number }): Battle {
  const c = center ?? (structures.length
    ? { x: structures.reduce((a, s) => a + s.x, 0) / structures.length, z: structures.reduce((a, s) => a + s.z, 0) / structures.length }
    : { x: 40, z: 40 });
  const tower = structures.find(s => /tower/i.test(s.kind));
  const adults = people.filter(p => !p.kid).slice(0, 4);
  while (adults.length < 4) adults.push({ id: `demo-home-${adults.length}` });
  const units: BattleUnit[] = [];
  const ev: BattleEvent[] = [];
  const posts: Array<{ x: number; z: number; y?: number; post: BattleUnit['post'] }> = [
    tower ? { x: tower.x, z: tower.z, y: 0.9, post: 'tower' } : { x: c.x + 2, z: c.z + 3, y: 0.9, post: 'tower' },
    { x: c.x - 3, z: c.z + 4, post: 'wall' },
    { x: c.x + 4, z: c.z + 4, post: 'sandbags' },
    { x: c.x, z: c.z + 2, post: 'building' },
  ];
  adults.forEach((p, i) => {
    const id = `h${i}`;
    units.push({ id, side: 'home', personId: p.id, x: c.x + (i - 1.5) * 0.6, z: c.z - 0.5, post: posts[i].post, y: 0 });
    ev.push({ t: 1.5 + i * 0.3, kind: 'move', unit: id, x: posts[i].x, z: posts[i].z, y: posts[i].y });
  });
  // raiders from the +z edge
  for (let i = 0; i < 6; i++) {
    const id = `r${i}`;
    units.push({ id, side: 'raider', x: c.x + (i - 2.5) * 2.2, z: c.z + 28 + (i % 2) * 1.5 });
    ev.push({ t: 0.5 + i * 0.2, kind: 'move', unit: id, x: c.x + (i - 2.5) * 1.6, z: c.z + 12 });
    // bound by pairs between cover: one pair moves while the other crouches and fires
    ev.push({ t: 4 + (i % 2) * 1.5, kind: 'cover', unit: id, x: c.x + (i - 2.5) * 1.6 + 0.3, z: c.z + 11 });
    ev.push({ t: 7 + (i % 2) * 1.4, kind: 'cover', unit: id, x: c.x + (i - 2.5) * 1.3, z: c.z + 8 });
  }
  ev.push({ t: 0, kind: 'alarm', what: 'dog' });
  ev.push({ t: 0.3, kind: 'say', text: 'The dog is going off — movement at the gate.' });
  ev.push({ t: 1.0, kind: 'lights' });
  ev.push({ t: 1.2, kind: 'say', text: 'Raid! 6 at the gate.' });
  let t = 5;
  for (let k = 0; k < 14; k++) {
    const from = `h${k % 4}`, to = `r${(k * 5) % 6}`;
    ev.push({ t, kind: 'shot', from, to, hit: k % 5 === 4, auto: k % 3 === 0 });
    ev.push({ t: t + 0.4, kind: 'shot', from: `r${k % 6}`, to: `h${(k + 1) % 4}`, hit: false });
    t += 0.7;
  }
  ev.push({ t: 9.5, kind: 'mine', x: c.x - 1.6, z: c.z + 9, hits: ['r1'] });
  ev.push({ t: 9.6, kind: 'wound', unit: 'r1', sev: 0.8 });
  ev.push({ t: 9.8, kind: 'say', text: 'Mine at the drive! One down.' });
  // a grenade at the wall post, a rocket at the tower (it is wrecked), the tower man falls back
  ev.push({ t: 10.2, kind: 'throw', from: 'r0', x: posts[1].x + 0.4, z: posts[1].z + 0.6, what: 'grenade' });
  ev.push({ t: 11.2, kind: 'explosion', x: posts[1].x + 0.4, z: posts[1].z + 0.6, radius: 0.5, hits: [] });
  ev.push({ t: 12.0, kind: 'rocket', from: 'r5', x: posts[0].x, z: posts[0].z, y: 0.9 });
  ev.push({ t: 12.1, kind: 'say', text: 'RPG! Get off the tower!' });
  ev.push({ t: 11.6, kind: 'move', unit: 'h0', x: posts[0].x - 1.5, z: posts[0].z - 1.5, y: 0 });
  ev.push({ t: 12.9, kind: 'explosion', x: posts[0].x, z: posts[0].z, y: 0.9, radius: 0.8, hits: [], wrecks: 'post' });
  ev.push({ t: 13.3, kind: 'cover', unit: 'h1', x: c.x - 2, z: c.z + 1.5 });
  ev.push({ t: 13.4, kind: 'say', text: 'Fall back to the house!' });
  ev.push({ t: 11, kind: 'wound', unit: 'h2', sev: 0.3 });
  ev.push({ t: 11.2, kind: 'say', text: 'I\'m hit — just a graze, keep firing!' });
  ev.push({ t: 12.5, kind: 'death', unit: 'r4' });
  ev.push({ t: 15, kind: 'say', text: 'They\'re pulling back!' });
  for (let i = 0; i < 6; i++) if (i !== 4) ev.push({ t: 15 + i * 0.2, kind: 'flee', unit: `r${i}` });
  ev.push({ t: 19, kind: 'end', result: 'repelled' });
  ev.push({ t: 19, kind: 'say', text: 'Raid repelled.' });
  ev.sort((a, b) => a.t - b.t);
  return { night: true, units, events: ev, duration: 20 };
}
