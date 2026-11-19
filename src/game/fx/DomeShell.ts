/**
 * Frost and heat bleaching on the dome shells' glazing (docs/design/climate_disasters.md section 6). The shells use their own shared materials
 * (`dome_glass`, `dome_polycarb`, `arcology`), so one write here changes every dome at once and touches no house window or greenhouse. A cold,
 * unheated shell goes milky white and rough; a heated one stays clear; a scorching sun bleaches the glass pale and a little hazy.
 *
 * No new meshes, no new uniforms: each call is a handful of colour, roughness and opacity writes, skipped unless the (quantized) inputs moved.
 * The inputs are plain 0-1 numbers, so the dome plant and the snow model can feed richer values later (sim/climateLook.shellFrostOf is the
 * simple one used now: outside air against inside air).
 */
import * as THREE from 'three';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';

interface Base { color: THREE.Color; rough: number; metal: number; opacity: number }
const IDS: readonly KitMaterialId[] = ['dome_glass', 'dome_polycarb', 'arcology'];
const MILK = new THREE.Color(0xeaf2f7), PALE = new THREE.Color(0xf3ecd3);
/** How far each shell material goes at full frost / full bleach: roughness target, opacity target. */
const FROST = { rough: 0.78, opacity: 0.66 }, BLEACH = { rough: 0.3, opacity: 0.42 };
const _base = new Map<KitMaterialId, Base>();
const _tmp = new THREE.Color();
let _frost = 0, _bleach = 0;

const q = (x: number): number => Math.round(Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)) * 64) / 64;

function baseOf(id: KitMaterialId): Base {
  let b = _base.get(id);
  if (!b) { const m = kitMaterial(id); b = { color: m.color.clone(), rough: m.roughness, metal: m.metalness, opacity: m.opacity }; _base.set(id, b); }
  return b;
}

/** Set the shell look: `frost` 0 (clear) to 1 (milky), `bleach` 0 to 1 (pale, hazy). Cheap; call every frame. */
export function setShellClimate(frost: number, bleach: number): void {
  const f = q(frost), b = q(bleach);
  if (f === _frost && b === _bleach) return;
  _frost = f; _bleach = b;
  for (const id of IDS) {
    const m = kitMaterial(id), base = baseOf(id);
    _tmp.copy(base.color).lerp(PALE, 0.7 * b).lerp(MILK, f);
    m.color.copy(_tmp);
    m.roughness = base.rough + (BLEACH.rough - base.rough) * b * (1 - f) + (FROST.rough - base.rough) * f;
    m.metalness = base.metal * (1 - 0.8 * f);
    m.opacity = base.opacity + (BLEACH.opacity - base.opacity) * b * (1 - f) + (FROST.opacity - base.opacity) * f;
  }
}

/** The values last written (tests and QA). */
export function shellClimateNow(): { frost: number; bleach: number } { return { frost: _frost, bleach: _bleach }; }
