// Standalone audit sheet for the drive: planRoad + the real buildRoadWorks (culverts, fords, bridges, retaining faces, cattle guard) on a synthetic ground, with a 0.28 person.
//   ?cases=plains:wet,mountain_west:hill  &views=struct,struct2,top  &cw=420  &seed=5
import * as THREE from 'three';
import { buildRoadWorks } from '/src/game/region/roadWorks.ts';
import { planRoad } from '/src/sim/roadPlan.ts';

const q = new URLSearchParams(location.search);
const cases = (q.get('cases') || 'plains:wet').split(',').map(c => c.split(':')), views = (q.get('views') || 'struct,struct2,top').split(','), CW = Number(q.get('cw') || 420), CH = Math.round(CW * 0.75), seed = Number(q.get('seed') || 5);
const creek = { zAt: () => 36, waterY: () => 0.6, halfWidth: 0.7 };
const GR = {
  flat: { h: () => 1 }, hill: { h: x => 1 + (67 - x) * 0.2 },
  wet: { h: (_x, z) => (Math.abs(z - 36) < 1.2 ? 0.7 : 1), creek },
  spur: { h: (x, z) => 1 + 3.5 * Math.exp(-(((x - 45) / 2) ** 2)) * (z > 20 && z < 44 ? 1 : 0) },
  rough: { h: (x, z) => 1 + Math.sin(x * 0.4) * 0.25 + Math.cos(z * 0.5) * 0.2 + (67 - x) * 0.05 },
};
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(views.length * CW, cases.length * CH); renderer.setPixelRatio(1); renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8bccb);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x6a6a50, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(-20, 30, 20); scene.add(sun);
const person = new THREE.Group();
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xd9642b })); body.position.y = 0.1; person.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe6bd98 })); head.position.y = 0.24; person.add(head);
const cam = new THREE.PerspectiveCamera(35, CW / CH, 0.02, 300);
let row = 0;
for (const [region, gn] of cases) {
  const ground = GR[gn];
  const p = planRoad({ region, seed, ground, rect: { x0: 0, z0: 0, x1: 67, z1: 67 }, frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, county: () => 70.4, roadHalf: 0.5, yard: [30, 50] });
  const gg = new THREE.PlaneGeometry(76, 76, 150, 150); gg.rotateX(-Math.PI / 2); gg.translate(33.5, 0, 33.5);
  const pos = gg.getAttribute('position'); for (let i = 0; i < pos.count; i++) pos.setY(i, ground.h(pos.getX(i), pos.getZ(i)));
  gg.computeVertexNormals();
  const gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x6f8a4c, roughness: 1 })); scene.add(gm);
  let wm = null; if (ground.creek) { wm = new THREE.Mesh(new THREE.PlaneGeometry(76, 1.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a6f9a, transparent: true, opacity: 0.75 })); wm.position.set(33.5, 0.6, 36); scene.add(wm); }
  const g = buildRoadWorks(p, ground.h, { built: true, surface: new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 1 }), track: new THREE.MeshStandardMaterial({ color: 0x7a6a50 }), driveW: 0.55, natural: (x, z) => ground.h(x, z) });
  scene.add(g);
  const st = p.structures.find(s => s.kind !== 'cattle_guard') || p.structures[0];
  const sx = st ? st.x : 50, sz = st ? st.z : 36, sy = ground.h(sx, sz);
  person.position.set(sx + 0.6, ground.h(sx + 0.6, sz + 1.4), sz + 1.4); scene.add(person);
  console.log(region, gn, p.structures.map(s => s.kind).join(','));
  const V = {
    struct: { eye: [sx - 2.4, sy + 1.3, sz + 3.8], at: [sx, sy, sz], fov: 40 },
    struct2: { eye: [sx + 3.4, sy + 0.5, sz - 2.6], at: [sx, sy, sz], fov: 45 },
    low: { eye: [sx - 1.6, sy + 0.3, sz + 1.2], at: [sx + 0.4, sy + 0.1, sz], fov: 55 },
    top: { eye: [sx, sy + 12, sz + 0.1], at: [sx, sy, sz], fov: 40 },
    whole: { eye: [-6, 60, 90], at: [40, 0, 34], fov: 40 },
  };
  views.forEach((vn, col) => {
    const v = V[vn]; cam.fov = v.fov; cam.updateProjectionMatrix(); cam.position.set(...v.eye); cam.lookAt(...v.at);
    renderer.setViewport(col * CW, (cases.length - 1 - row) * CH, CW, CH); renderer.setScissor(col * CW, (cases.length - 1 - row) * CH, CW, CH);
    renderer.render(scene, cam);
  });
  scene.remove(g, gm, person); if (wm) scene.remove(wm);
  g.traverse(o => o.geometry?.dispose()); gg.dispose();
  row++;
}
window.__done = true;
