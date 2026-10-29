import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FigureLayer, FIG_POSE, FIG_SCALE } from './figureKit';

/** Where a point of the figure (figure units) ends up in the world for instance i. */
function place(layer: FigureLayer, i: number, p: THREE.Vector3): THREE.Vector3 {
  const m = new THREE.Matrix4().fromArray(layer.mesh.instanceMatrix.array as Float32Array, i * 16);
  return p.clone().applyMatrix4(m);
}

describe('figure poses: lying down', () => {
  const layer = new FigureLayer(new THREE.Scene(), 4, 'test');
  const head = new THREE.Vector3(0, 0.5, 0), feet = new THREE.Vector3(0, 0, 0), chest = new THREE.Vector3(0, 0.4, 0.05);

  it('an upright figure has its head up; a pitch of -PI / 2 lays it on its back, head toward -z, face up', () => {
    layer.setPose(0, { x: 5, y: 1, z: 7, rot: 0, scale: 1, pose: FIG_POSE.STAND, phase: 0, amp: 0 });
    layer.setPose(1, { x: 5, y: 1, z: 7, rot: 0, scale: 1, pose: FIG_POSE.STAND, phase: 0, amp: 0, pitch: -Math.PI / 2 });
    const up = place(layer, 0, head), lying = place(layer, 1, head), face = place(layer, 1, chest);
    expect(up.y).toBeCloseTo(1 + 0.5 * FIG_SCALE, 4);
    expect(lying.y).toBeCloseTo(1, 4);                              // the head is no longer above the feet
    expect(lying.z).toBeCloseTo(7 - 0.5 * FIG_SCALE, 4);            // it is toward -z
    expect(face.y).toBeGreaterThan(1);                              // the front of the chest faces up
    expect(place(layer, 1, feet).z).toBeCloseTo(7, 4);              // the feet stay at the origin
  });

  it('the turn (rot) is applied after the pitch: the head points along the turned -z', () => {
    layer.setPose(2, { x: 0, y: 0, z: 0, rot: Math.PI / 2, scale: 1, pose: FIG_POSE.STAND, phase: 0, amp: 0, pitch: -Math.PI / 2 });
    const h = place(layer, 2, head);
    // a quarter turn about y sends -z to -x
    expect(h.x).toBeCloseTo(-0.5 * FIG_SCALE, 4);
    expect(Math.abs(h.z)).toBeLessThan(1e-4);
  });

  it('a figure with no pitch is unchanged', () => {
    layer.setPose(3, { x: 1, y: 2, z: 3, rot: 0.7, scale: 0.8, pose: FIG_POSE.STAND, phase: 0, amp: 0 });
    const a = Array.from((layer.mesh.instanceMatrix.array as Float32Array).slice(48, 64));
    layer.setPose(3, { x: 1, y: 2, z: 3, rot: 0.7, scale: 0.8, pose: FIG_POSE.STAND, phase: 0, amp: 0, pitch: 0 });
    expect(Array.from((layer.mesh.instanceMatrix.array as Float32Array).slice(48, 64))).toEqual(a);
  });
});
