// Standalone audit contact sheet for perimeter runs: the real buildRun on a sloped lumpy ground with a 0.28-tall person for scale, rows = kinds, columns = 4 views.
//   ?kinds=split_rail,stone_wall  &shape=bend|ring|straight  &views=iso,top,eye,corner  &cw=380  &flat=1
import * as THREE from 'three';
import { buildRun } from '/src/game/perimeter/perimeterGeometry.ts';

const q = new URLSearchParams(location.search);
const kinds = (q.get('kinds') || 'split_rail').split(','), shape = q.get('shape') || 'bend', views = (q.get('views') || 'iso,top,eye,corner').split(',');
const CW = Number(q.get('cw') || 380), CH = Math.round(CW * 0.75), flat = q.get('flat') === '1', gateW = Number(q.get('gw') || 0.9), noGate = q.get('nogate') === '1';
const creek = q.get('creek') === '1';
const groundAt = (flat ? () => 0 : (x, z) => x * 0.03 + Math.sin(z * 0.55) * 0.035 + Math.sin(x * 0.7) * 0.02);
const groundC = creek ? (x, z) => groundAt(x, z) - 0.55 * Math.exp(-((x / 0.8) ** 2)) : groundAt;
const SHAPES = {
  straight: [[-6, 0], [5.3, 0]],
  bend: [[-6, 0], [4.3, 0], [4.3, -5.1], [0.2, -8.2]],
  odd: [[-6, 0], [0.1, 1.3], [3.4, 6.2], [-2.7, 8.8]],
  ring: [[-5, -4], [5.3, -4], [5.3, 3.7], [-5, 3.7], [-5, -4]],
};
const pts = SHAPES[shape];
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(views.length * CW, kinds.length * CH); renderer.setPixelRatio(1); renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8bccb);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x6a6a50, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(-8, 14, 9); scene.add(sun);
const gg = new THREE.PlaneGeometry(40, 40, 80, 80); gg.rotateX(-Math.PI / 2);
const gp = gg.getAttribute('position'); for (let i = 0; i < gp.count; i++) gp.setY(i, groundC(gp.getX(i), gp.getZ(i)));
gg.computeVertexNormals();
scene.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x6f8a4c, roughness: 1 })));
if (creek) { const w = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a6f9a, transparent: true, opacity: 0.7, roughness: 0.2 })); w.position.set(0, -0.2, 0); scene.add(w); }
const person = new THREE.Group();
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xd9642b })); body.position.y = 0.1; person.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe6bd98 })); head.position.y = 0.24; person.add(head);
const cam = new THREE.PerspectiveCamera(30, CW / CH, 0.02, 100);
let row = 0;
for (const kind of kinds) {
  const gates = noGate ? [] : [{ at: 3.0, w: gateW }];
  const run = { id: 'r1', kind, pts: pts.map(p => [...p]), gates, done: 1, hours: 1, supplied: true, finishedAt: 0 };
  const g = buildRun(run, groundC, 1e9, () => false, { hostKind: 'container_wall' });
  scene.add(g);
  const gx = (pts[0][0] + 3.0 * Math.sign(pts[1][0] - pts[0][0])), gz = pts[0][1];
  person.position.set(gx + 1.2, groundAt(gx + 1.2, gz + 0.5), gz + 0.5); scene.add(person);
  const cen = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length], c = pts[1], mid = [(pts[0][0] + pts[Math.min(2, pts.length - 1)][0]) / 2, (pts[0][1] + pts[Math.min(2, pts.length - 1)][1]) / 2];
  const V = {
    iso: { eye: [cen[0] - 4.5, 4.2, cen[1] + 8.5], at: [cen[0], 0.2, cen[1]], fov: 40 },
    top: { eye: [cen[0], 11, cen[1] + 0.1], at: [cen[0], 0, cen[1]], fov: 40 },
    eye: { eye: [gx - 2.2, groundAt(gx - 2.2, gz + 2.4) + 0.3, gz + 2.4], at: [gx + 1.0, groundAt(gx, gz) + 0.25, gz], fov: 45 },
    corner: { eye: [c[0] + 1.3, groundAt(c[0] + 1.3, c[1] + 1.3) + 0.55, c[1] + 1.5], at: [c[0], groundAt(c[0], c[1]) + 0.2, c[1]], fov: 45 },
    corner2: { eye: [c[0] - 1.6, groundAt(c[0] - 1.6, c[1] - 1.6) + 0.5, c[1] - 1.6], at: [c[0], groundAt(c[0], c[1]) + 0.2, c[1]], fov: 45 },
    cross: { eye: [-3.2, 0.9, 3.6], at: [0, 0.1, 0], fov: 45 },
    gate: { eye: [gx + 0.3, groundAt(gx, gz + 2.6) + 0.35, gz + 2.6], at: [gx, groundAt(gx, gz) + 0.25, gz], fov: 42 },
  };
  views.forEach((vn, col) => {
    const v = V[vn]; cam.fov = v.fov; cam.updateProjectionMatrix(); cam.position.set(...v.eye); cam.lookAt(...v.at);
    renderer.setViewport(col * CW, (kinds.length - 1 - row) * CH, CW, CH); renderer.setScissor(col * CW, (kinds.length - 1 - row) * CH, CW, CH);
    renderer.render(scene, cam);
  });
  scene.remove(g); g.traverse(o => o.geometry?.dispose());
  row++;
}
window.__done = true;
