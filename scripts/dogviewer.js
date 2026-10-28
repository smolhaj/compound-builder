import * as THREE from 'three';
import { DogRenderer } from '/src/game/people/DogRenderer.ts';
import { FigureLayer, FIG_POSE } from '/src/engine/world/people/figureKit.ts';
import { pickPersonaWear } from '/src/engine/world/people/crowdWear.ts';

const q = new URLSearchParams(location.search);
const breed = q.get('breed') || 'shepherd', tone = Number(q.get('tone') || 0), sheet = q.get('sheet') || 'poses';
const COLS = 3, CW = Number(q.get('cw') || 420), CH = Math.round(CW * 290 / 420);
const POSES = [
  { name: 'stand', stance: 'stand' }, { name: 'sit', stance: 'sit' }, { name: 'lie', stance: 'lie' },
  { name: 'trot', stance: 'stand', moving: true, phase: 0.9 }, { name: 'alert', stance: 'alert' },
];
const dog = { id: 'd1', name: 'Test', breed, tone, sex: 'm', trait: 'loyal', born: -900, health: 100, hunger: 5, thirst: 0, mood: 80, play: 50, exercise: 50, training: 40, vax: 0, worms: 0, sick: null, injury: null, bonds: {}, caretaker: null, guard: false, fixed: false, due: null, heat: 0, mourning: 0, done: {}, starved: 0, died: null };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
const rows = sheet === 'one' ? 1 : POSES.length;
renderer.setSize(COLS * CW, rows * CH); renderer.setPixelRatio(1);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9c4d6);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x6a6a50, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(-0.6, 1, 0.5); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x6f8f4a, roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const grid = new THREE.GridHelper(2, 40, 0x5c7a3c, 0x5c7a3c); grid.position.y = 0.0005; grid.material.opacity = 0.25; grid.material.transparent = true; scene.add(grid);

const dogs = new DogRenderer(scene);
const fig = new FigureLayer(scene, 1, 'person');
let s = 7; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const w = pickPersonaWear(rnd, 'resident', { season: 'summer', team: null }); w.hasPack = false;
fig.setWear(0, w);
fig.setPose(0, { x: 0, y: 0, z: 0.42, rot: Math.PI, scale: 1, pose: FIG_POSE.STAND, phase: 0, amp: 0 }); fig.commit(1, true);

const cam = new THREE.PerspectiveCamera(24, CW / CH, 0.05, 20);
const VIEWS = [
  q.get('close') ? { eye: [-0.62, 0.08, 0.02], at: [0, 0.08, 0.02], up: [0, 1, 0], fov: 30 } : { eye: [-1.25, 0.12, 0.2], at: [0, 0.12, 0.2], up: [0, 1, 0], fov: 30 },          // side (the dog faces right)
  q.get('close') ? { eye: [-0.4, 0.2, 0.5], at: [0, 0.07, 0.04], up: [0, 1, 0], fov: 34 } : { eye: [-0.62, 0.24, 0.86], at: [0, 0.08, 0.24], up: [0, 1, 0], fov: 34 },  // three-quarter front
  q.get('close') ? { eye: [0, 0.6, 0.03], at: [0, 0, 0.03], up: [1, 0, 0], fov: 34 } : { eye: [0, 1.0, 0.2], at: [0, 0, 0.2], up: [1, 0, 0], fov: 34 },                // top
];
const rowsList = sheet === 'one' ? [POSES.find(p => p.name === (q.get('pose') || 'stand'))] : POSES;
rowsList.forEach((p, r) => {
  dogs.preview([{ dog, x: 0, z: 0, rot: 0, stance: p.stance, moving: p.moving, phase: p.phase }]);
  VIEWS.forEach((v, c) => {
    cam.fov = v.fov || 24; cam.position.set(...v.eye); cam.up.set(...v.up); cam.lookAt(...v.at); cam.updateProjectionMatrix();
    const x = c * CW, y = (rowsList.length - 1 - r) * CH;
    renderer.setViewport(x, y, CW, CH); renderer.setScissor(x, y, CW, CH);
    renderer.render(scene, cam);
  });
});
window.__done = true;
