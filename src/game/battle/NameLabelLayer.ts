import * as THREE from 'three';
import { placeLabels, barHeight, getNames, getPips, pipFor, type LabelIn, type UnitStatus } from './nameLabels';
import { blockedBetween, type Box, type V3 } from './director';
import type { Actor } from './director';

const FONT = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';
const HEAD = 0.33;   // above the feet of a standing person (0.28 tall)
const _v = new THREE.Vector3();

/**
 * DOM labels over the defenders' heads in the raid cutscene. One fixed layer under the letterbox bars; each label is a pooled span moved by
 * transform and opacity only (no layout, no draw call). Occlusion by buildings and walls is tested every few frames and remembered.
 */
export class NameLabelLayer {
  private _root: HTMLDivElement;
  private _els = new Map<string, HTMLSpanElement>();
  private _blocked = new Map<string, boolean>();
  private _fell = new Map<string, number>();
  private _frame = 0;
  private _t = 0;

  constructor() {
    const r = document.createElement('div');
    r.setAttribute('data-testid', 'cutscene-names');
    r.style.cssText = 'position:fixed;inset:0;z-index:36;pointer-events:none;display:none;overflow:hidden';
    document.body.appendChild(r);
    this._root = r;
  }

  hide(): void { if (this._root.style.display !== 'none') { this._root.style.display = 'none'; this._els.forEach(e => e.remove()); this._els.clear(); this._blocked.clear(); this._fell.clear(); } }

  /** `names`: unit id to first name (defenders only). */
  update(dt: number, camera: THREE.PerspectiveCamera, actors: readonly Actor[], names: ReadonlyMap<string, string>, status: ReadonlyMap<string, UnitStatus>, boxes: readonly Box[], ground: (x: number, z: number) => number, canvas: HTMLElement): void {
    if (!getNames() || !names.size) { this.hide(); return; }
    this._root.style.display = 'block';
    this._t += dt; this._frame++;
    const rect = canvas.getBoundingClientRect(), W = rect.width, H = rect.height;
    camera.updateMatrixWorld();
    const eye: V3 = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const solid = boxes.filter(b => b.kind !== 'brush' && b.kind !== 'tree');
    const check = this._frame % 5 === 0;
    const ins: LabelIn[] = [], pips = getPips();
    for (const a of actors) {
      const name = names.get(a.id);
      if (!name || a.side !== 'home') continue;
      if (a.dead && !this._fell.has(a.id)) this._fell.set(a.id, this._t);
      const gy = ground(a.x, a.z), head: V3 = { x: a.x, y: gy + a.y + (a.dead ? 0.1 : HEAD), z: a.z };
      _v.set(head.x, head.y, head.z).project(camera);
      const depth = Math.hypot(head.x - eye.x, head.y - eye.y, head.z - eye.z);
      if (check || !this._blocked.has(a.id)) this._blocked.set(a.id, depth < 40 && blockedBetween(eye, head, solid, ground));
      ins.push({ id: a.id, name, sx: (_v.x * 0.5 + 0.5) * W + rect.left, sy: (-_v.y * 0.5 + 0.5) * H + rect.top, depth, front: _v.z < 1 && _v.z > -1, blocked: this._blocked.get(a.id) ?? false, dead: a.dead, deadFor: a.dead ? this._t - (this._fell.get(a.id) ?? this._t) : 0, gone: a.gone, pip: pips && status.has(a.id) });
    }
    const out = placeLabels(ins, { w: W, h: H, top: barHeight(H), bottom: barHeight(H) });
    const seen = new Set<string>();
    for (const o of out) {
      seen.add(o.id);
      let el = this._els.get(o.id);
      if (!el) {
        el = document.createElement('span');
        el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;display:flex;align-items:center;font-family:${FONT};font-weight:600;letter-spacing:0.3px;color:#9ccdf5;text-shadow:0 0 3px #000,0 1px 2px #000,0 0 6px rgba(0,0,0,0.8);will-change:transform,opacity`;
        const dot = document.createElement('i'); dot.style.cssText = 'display:inline-block;flex:none;font-style:normal;line-height:1;text-shadow:0 0 2px #000,0 0 3px #000';
        const tx = document.createElement('b'); tx.style.fontWeight = '600';
        el.append(dot, tx);
        this._root.appendChild(el); this._els.set(o.id, el);
      }
      const dot = el.firstChild as HTMLElement, tx = el.lastChild as HTMLElement;
      const st = status.get(o.id), pip = o.pipW > 0 && st ? pipFor(st) : null;
      dot.style.display = pip ? '' : 'none';
      if (pip) {
        dot.dataset.pip = pip.kind;
        const g = pip.cross ? '\u2020' : '\u25CF';
        if (dot.textContent !== g) dot.textContent = g;
        dot.style.color = pip.color; dot.style.marginRight = `${Math.round(o.size * 0.3)}px`; dot.style.fontSize = pip.cross ? '1.1em' : '1em';
      }
      if (tx.textContent !== o.text) tx.textContent = o.text;
      el.style.fontSize = `${o.size.toFixed(1)}px`;
      el.style.transform = `translate(${(rect.left + o.x - rect.left).toFixed(1)}px, ${o.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.opacity = o.opacity.toFixed(2);
      el.style.color = o.dim ? '#8ea3b8' : '#9ccdf5';
      el.style.display = '';
    }
    for (const [id, el] of this._els) if (!seen.has(id)) el.style.display = 'none';
  }

  dispose(): void { this._root.remove(); this._els.clear(); }
}
