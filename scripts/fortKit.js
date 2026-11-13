// Standalone audit contact sheet for kit pieces (towers, bunkers, wells, tanks, solar...): the real buildLayers, finished, on a translucent ground slab (so underground rooms show), a 0.28 person for scale.
//   ?ids=watchtower_wood,well_hand  &views=iso,back,top,eye  &cw=360  &under=1 (ground 25% opaque)
import * as THREE from 'three';
import { KIT } from '/src/game/buildkit/kit.ts';
import { buildLayers } from '/src/game/buildkit/buildings.ts';
import { showStage } from '/src/game/buildkit/shell.ts';

const q = new URLSearchParams(location.search);
const ids = (q.get('ids') || 'well_hand').split(','), views = (q.get('views') || 'iso,back,top,eye').split(',');
const cut = q.get('cut') === '1';
const CW = Number(q.get('cw') || 360), CH = Math.round(CW * 0.8), under = q.get('under') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(views.length * CW, ids.length * CH); renderer.setPixelRatio(1); renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
if (cut) { renderer.localClippingEnabled = true; renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.02)]; }
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8bccb);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x6a6a50, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(-8, 14, 9); scene.add(sun);
const slab = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f8a4c, roughness: 1, transparent: under, opacity: under ? 0.28 : 1, depthWrite: !under }));
slab.position.y = -0.002; scene.add(slab);
const person = new THREE.Group();
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xd9642b })); body.position.y = 0.1; person.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe6bd98 })); head.position.y = 0.24; person.add(head);
const cam = new THREE.PerspectiveCamera(30, CW / CH, 0.02, 100);
let row = 0;
for (const id of ids) {
  const def = KIT[id];
  const g = buildLayers(def, 3); showStage(g, 5, 0);
  if (cut) g.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.side = THREE.DoubleSide; });
  scene.add(g);
  const bb = new THREE.Box3().setFromObject(g); const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  const R = Math.max(sz.x, sz.z, sz.y * 0.8, 0.8);
  const hw = def.cellsX * 0.5 / 2, hd = def.cellsZ * 0.5 / 2;
  person.position.set(hw + 0.12, 0, hd + 0.15); scene.add(person);
  const V = {
    cutiso: { eye: [c.x - R * 0.9, R * 1.1 + 0.3, c.z + R * 2.0], at: [c.x, Math.max(0.2, c.y * 0.6), c.z], fov: 34 },
    cutlow: { eye: [c.x + R * 0.8, 0.45, c.z + R * 1.8], at: [c.x, Math.max(0.2, c.y * 0.5), c.z], fov: 38 },
    iso: { eye: [c.x - R * 1.4, R * 1.1 + 0.2, c.z + R * 1.9], at: [c.x, c.y * 0.8, c.z], fov: 32 },
    back: { eye: [c.x + R * 1.4, R * 1.0 + 0.2, c.z - R * 1.9], at: [c.x, c.y * 0.8, c.z], fov: 32 },
    top: { eye: [c.x, R * 3.2 + 0.4, c.z + 0.01], at: [c.x, 0, c.z], fov: 32 },
    side: { eye: [c.x - R * 2.6, Math.max(0.1, sz.y * 0.4), c.z + 0.01], at: [c.x, c.y * 0.9, c.z], fov: 32 },
    eye: { eye: [hw + 0.12 - 0.9 * Math.max(0.5, R * 0.5), 0.3, hd + 0.15 + 0.9 * Math.max(0.5, R * 0.5)], at: [c.x, Math.min(0.45, sz.y * 0.5), c.z], fov: 55 },
  };
  views.forEach((vn, col) => {
    const v = V[vn]; cam.fov = v.fov; cam.updateProjectionMatrix(); cam.position.set(...v.eye); cam.lookAt(...v.at);
    renderer.setViewport(col * CW, (ids.length - 1 - row) * CH, CW, CH); renderer.setScissor(col * CW, (ids.length - 1 - row) * CH, CW, CH);
    renderer.render(scene, cam);
  });
  scene.remove(g); g.traverse(o => o.geometry?.dispose());
  row++;
}
window.__done = true;
