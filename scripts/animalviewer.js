// Standalone turntable contact sheet for the farm animals: the real LivestockRenderer, one animal per breed row, four angles, a neutral lit ground.
//   &hz=1.5&hy=1.1 head position in model metres, for view=headside|face
//   ?kind=cow|steer|goat|sheep|pig|rabbit|hen|deer|elk|...|dog_lab (any wildlife / dog model id)  &rooster=1  &pose=stand|walk|run|graze|alert|sit|lie  &adorn=1 (antlers, beard)  &lod=0..2  &q=high|medium|low  &ph=0.6  &cw=360  &person=1  &breeds=0,1  &view=side,front,rear,top
import * as THREE from 'three';
import { LivestockRenderer, UNIT } from '/src/game/livestock/LivestockRenderer.ts';
import { modelFor, modelOf } from '/src/game/livestock/animalModels.ts';
import { FigureLayer, FIG_POSE } from '/src/engine/world/people/figureKit.ts';
import { AnimalBatches } from '/src/game/livestock/animalBatches.ts';
import { isWildModel, wildModelOf } from '/src/game/wildlife/wildModels.ts';
import { pickPersonaWear } from '/src/engine/world/people/crowdWear.ts';

const q = new URLSearchParams(location.search);
const kind = q.get('kind') || 'cow', rooster = q.get('rooster') === '1', pose = q.get('pose') || 'stand', lod = Number(q.get('lod') || 0), quality = q.get('q') || 'high';
const CW = Number(q.get('cw') || 360), CH = Math.round(CW * 0.72), ph = Number(q.get('ph') || 0.6);
const phs = q.get('phs') ? q.get('phs').split(',').map(Number) : null;
const views = phs ? phs.map(() => q.get('view') || 'side') : (q.get('view') || 'side,front,rear,top').split(',');
const wild = isWildModel(kind);
const model = wild ? wildModelOf(kind) : modelOf(modelFor(kind, rooster ? 'rooster' : 'x'));
const nb = model.spec.breeds.length;
const breeds = q.get('breeds') ? q.get('breeds').split(',').map(Number) : [...Array(nb).keys()];
const person = q.get('person') === '1';
const HZ = Number(q.get('hz') || 0) * UNIT, HY = Number(q.get('hy') || 0) * UNIT;   // head position (m, model frame) for the headside / face close-ups

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(views.length * CW, breeds.length * CH); renderer.setPixelRatio(1);
renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8bccb);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x6a6a50, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(-0.7, 1, 0.6); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x6f8a4c, roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const grid = new THREE.GridHelper(4, 40, 0x5c7a3c, 0x5c7a3c); grid.position.y = 0.0004; grid.material.opacity = 0.25; grid.material.transparent = true; scene.add(grid);

const stock = wild ? null : new LivestockRenderer(scene); stock?.setQuality(quality);
const wb = wild ? new AnimalBatches(scene, 8, 'wild', wildModelOf) : null; wb?.setQuality(quality);
const adorn = Number(q.get('adorn') ?? 1);
let fig = null;
if (person) {
  fig = new FigureLayer(scene, 1, 'person');
  let s = 7; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const w = pickPersonaWear(rnd, 'resident', { season: 'summer', team: null }); w.hasPack = false; fig.setWear(0, w);
}
const cam = new THREE.PerspectiveCamera(24, CW / CH, 0.02, 30);
const H = model.withers * UNIT, L = model.length * UNIT, D = Math.max(L * 3.0, H * 5);
const VIEWS = {
  side: { eye: [-D, H * 0.6, 0.0], at: [0, H * 0.5, 0.0], up: [0, 1, 0], fov: 24 },
  front: { eye: [-D * 0.62, H * 0.9, D * 0.8], at: [0, H * 0.5, 0], up: [0, 1, 0], fov: 24 },
  rear: { eye: [D * 0.62, H * 0.9, -D * 0.8], at: [0, H * 0.5, 0], up: [0, 1, 0], fov: 24 },
  top: { eye: [0, D * 1.5, 0.001], at: [0, 0, 0], up: [0, 0, 1], fov: 24 },
  head: { eye: [-D * 0.28, H * 1.0, D * 0.4], at: [0, H * 0.7, L * 0.38], up: [0, 1, 0], fov: 24 },
  leg: { eye: [-D * 0.36, H * 0.3, L * 0.28], at: [0, H * 0.22, L * 0.26], up: [0, 1, 0], fov: 24 },
  legback: { eye: [-D * 0.36, H * 0.3, -L * 0.28], at: [0, H * 0.22, -L * 0.28], up: [0, 1, 0], fov: 24 },
  headside: { eye: [-D * 0.3, HY * 1.0, HZ], at: [0, HY * 0.95, HZ], up: [0, 1, 0], fov: 24 },
  face: { eye: [-D * 0.2, HY * 1.05, HZ + D * 0.3], at: [0, HY * 0.9, HZ], up: [0, 1, 0], fov: 24 },
  eye: { eye: [-D * 0.5, 0.17, D * 0.7], at: [0, H * 0.5, 0], up: [0, 1, 0], fov: 38 },
};
breeds.forEach((b, r) => {
  const rate = pose === 'walk' ? 1 : 0, gr = pose === 'graze' ? 1 : 0;
  if (fig) fig.setPose(0, { x: 0.42, y: 0, z: 0.05, rot: -Math.PI / 2, scale: 1, pose: FIG_POSE.STAND, phase: 0, amp: 0 }), fig.commit(1, true);
  views.forEach((vn, c) => {
    if (wb) {
      wb.begin();
      const P = { walk: { gait: 1 }, run: { gait: 1.25 }, graze: { graze: 1 }, alert: { alert: 1 }, sit: { graze: 1 }, lie: { lie: 1 } }[pose] || {};
      wb.put({ id: kind, breed: b, x: 0, y: 0, z: 0, rot: 0, phase: phs ? phs[c] : ph, gait: P.gait ?? 0, graze: P.graze ?? 0, seed: 0.31 + b * 0.17, tone: 0.5, size: 1, adorn, lie: P.lie ?? 0, alert: P.alert ?? 0, wag: pose === 'stand' ? 0 : 0, li: lod });
      wb.flush(0.4);
    } else stock.preview([{ kind, breed: b, rooster, x: 0, z: 0, rot: 0, gait: rate, phase: phs ? phs[c] : ph, graze: gr, seed: 0.31 + b * 0.17 }], lod);
    const v = VIEWS[vn] || VIEWS.side;
    cam.fov = v.fov; cam.aspect = CW / CH; cam.position.set(...v.eye); cam.up.set(...v.up); cam.lookAt(...v.at); cam.updateProjectionMatrix();
    const x = c * CW, y = (breeds.length - 1 - r) * CH;
    renderer.setViewport(x, y, CW, CH); renderer.setScissor(x, y, CW, CH);
    renderer.render(scene, cam);
  });
});
window.__done = true;
window.__info = { tris: 0, withers: model.withers, breeds: model.spec.breeds.map(b => b.name) };
