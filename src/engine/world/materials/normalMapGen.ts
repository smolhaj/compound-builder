/**
 * normalMapGen.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Procedural normal map generation for Three.js MeshStandardMaterial.
 *
 * STRATEGY: derive the normal map from the *same* Canvas that produced the
 * color texture.  We convert each pixel to luminance (a cheap height proxy),
 * then apply Sobel edge-detection kernels to approximate the surface gradient.
 * The gradient becomes the XY components of the normal; Z is reconstructed
 * so the vector stays unit-length.  The result is packed into the [0,1] range
 * used by the OpenGL/Three.js tangent-space normal map convention and returned
 * as a THREE.CanvasTexture ready to drop into `material.normalMap`.
 *
 * WHY NOT A SEPARATE HEIGHTMAP?
 *   For brick and stone, the color texture already encodes height implicitly
 *   (mortar is darker than the brick face → lower luminance → lower "height").
 *   Using the color source therefore gives free, consistent results with zero
 *   extra canvas draw calls.  If you later want finer control you can pass a
 *   dedicated grayscale heightmap canvas instead — the function signature is
 *   identical.
 *
 * THREE.JS COLOR-SPACE GOTCHA:
 *   Color (diffuse) textures must be tagged THREE.SRGBColorSpace so Three.js
 *   converts them to linear before lighting math.  Normal maps must NOT be
 *   tagged sRGB — they encode direction vectors, not perceptual colors.  The
 *   THREE.CanvasTexture returned here deliberately has colorSpace left at its
 *   default (THREE.NoColorSpace / linear), which is correct.
 *
 * GPU vs CPU:
 *   Run this ONCE per texture key and cache the result alongside the color
 *   texture.  The Sobel pass over a 256×256 canvas (~65 K pixels, 4 channels)
 *   takes < 2 ms on a modern CPU — imperceptible at load time.  There is no
 *   built-in Three.js utility for this; the GPU approach (render-to-texture via
 *   a ShaderMaterial Sobel pass) is only worthwhile for textures > 2048×2048
 *   or when you need real-time updates.
 */

import * as THREE from 'three';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a tangent-space normal map from a source Canvas via Sobel filtering.
 *
 * @param sourceCanvas  The HTMLCanvasElement that was used to paint the color
 *                      (or heightmap) texture.  Must not be cross-origin tainted.
 * @param strength      How "bumpy" the surface looks.  1.0 is physically neutral;
 *                      2–4 is good for brick/stone; 0.5–1.5 for smooth concrete.
 *                      Internally this scales the XY gradient before normalization,
 *                      which is equivalent to Three.js `normalScale` but baked in.
 *                      You still want a modest normalScale on the material itself
 *                      (see NORMAL_SCALE_PRESETS below) for runtime tuning.
 * @returns A THREE.CanvasTexture with wrapS/wrapT and repeat copied from the
 *          source, ready to assign to material.normalMap.
 */
export function generateNormalMap(
  sourceCanvas: HTMLCanvasElement,
  strength = 2.0,
): THREE.CanvasTexture {
  const { width, height } = sourceCanvas;

  // ── 1. Read source pixels ──────────────────────────────────────────────────
  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) throw new Error('generateNormalMap: cannot get 2d context from sourceCanvas');

  // getImageData returns pixels in device pixel order (sRGB on most browsers).
  // For normal-map purposes we only need relative luminance gradients, so the
  // slight non-linearity from sRGB → linear is acceptable and saves a costly
  // per-pixel gamma decode.
  const srcData = srcCtx.getImageData(0, 0, width, height).data; // Uint8ClampedArray

  // ── 2. Compute luminance for every pixel ──────────────────────────────────
  // Using the BT.709 perceptual weights.  Stored as Float32 to keep the Sobel
  // convolution free of integer clamping artefacts.
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = srcData[i * 4]     / 255;
    const g = srcData[i * 4 + 1] / 255;
    const b = srcData[i * 4 + 2] / 255;
    // BT.709 luma coefficients
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // ── 3. Sobel convolution ──────────────────────────────────────────────────
  //
  // The Sobel operator approximates the image gradient with two 3×3 kernels:
  //
  //        Gx (horizontal slope)         Gy (vertical slope)
  //      ┌─────────────────────┐       ┌──────────────────┐
  //      │ -1   0  +1          │       │ -1  -2  -1       │
  //      │ -2   0  +2          │       │  0   0   0       │
  //      │ -1   0  +1          │       │ +1  +2  +1       │
  //      └─────────────────────┘       └──────────────────┘
  //
  // Applied to luminance, Gx encodes "does brightness increase to the right?"
  // and Gy encodes "does brightness increase downward?".  A surface that is
  // brighter on the right is higher on the right → it tilts left → the normal
  // tilts right → positive X component in tangent space.
  //
  // Convention: OpenGL tangent-space normals have:
  //   R → tangent (X, pointing right in UV space)
  //   G → bitangent (Y, pointing up in UV space)
  //   B → surface normal (Z, pointing out of the face)
  //
  // Three.js MeshStandardMaterial uses this convention by default.

  const nmCanvas = document.createElement('canvas');
  nmCanvas.width  = width;
  nmCanvas.height = height;
  const nmCtx = nmCanvas.getContext('2d', { willReadFrequently: true })!;
  const nmImg = nmCtx.createImageData(width, height);
  const dst   = nmImg.data;

  /**
   * Sample luminance with wrap-around boundary handling. Every texture this
   * feeds is a RepeatWrapping tile, so the kernel wraps too — clamping left a
   * flat seam line at each tile boundary.
   */
  const L = (px: number, py: number): number => {
    const cx = (px + width) % width;
    const cy = (py + height) % height;
    return lum[cy * width + cx];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // ── Sobel Gx ─────────────────────────────────────────────────────────
      // Weights:  top-left, top-center, top-right
      //           mid-left,           mid-right
      //           bot-left, bot-center, bot-right
      const gx =
        -1 * L(x - 1, y - 1) +  0 * L(x, y - 1) + 1 * L(x + 1, y - 1) +
        -2 * L(x - 1, y    ) +  0 * L(x, y    ) + 2 * L(x + 1, y    ) +
        -1 * L(x - 1, y + 1) +  0 * L(x, y + 1) + 1 * L(x + 1, y + 1);

      // ── Sobel Gy ─────────────────────────────────────────────────────────
      // Note the sign: +1 at the bottom row means "higher there" which tilts
      // the normal upward (+Y in UV space, stored in G channel).
      const gy =
        -1 * L(x - 1, y - 1) + -2 * L(x, y - 1) + -1 * L(x + 1, y - 1) +
         0 * L(x - 1, y    ) +   0 * L(x, y    ) +  0 * L(x + 1, y    ) +
         1 * L(x - 1, y + 1) +  2 * L(x, y + 1) +  1 * L(x + 1, y + 1);

      // ── Reconstruct normal vector ─────────────────────────────────────────
      // The gradient (gx, gy) tells us how steeply the surface tilts in X/Y.
      // We scale by `strength` to exaggerate or flatten the bumpiness, then
      // set Z = 1.0 so normalization pushes the result toward the face normal
      // for flat regions and toward the edge tangent for steep transitions.
      //
      // This is the "height-field to normal" formula:
      //   N = normalize( (-strength * gx, -strength * gy, 1) )
      //
      // The negation of gx/gy flips the gradient so that brighter (higher)
      // regions produce outward-tilting normals (consistent with bump maps
      // where white = up).
      const nx = -strength * gx;
      const ny = -strength * gy;
      const nz =  1.0;

      // Normalize to unit vector
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const ux = nx / len;
      const uy = ny / len;
      const uz = nz / len;

      // ── Pack into [0, 255] range ──────────────────────────────────────────
      // The standard encoding maps [-1, +1] → [0, 255]:
      //   encoded = floor( (component * 0.5 + 0.5) * 255 + 0.5 )
      // A flat surface (0, 0, 1) encodes to (128, 128, 255) — the familiar
      // "flat normal map" blue color.
      const i = (y * width + x) * 4;
      dst[i]     = Math.round((ux * 0.5 + 0.5) * 255); // R → X (tangent)
      dst[i + 1] = Math.round((uy * 0.5 + 0.5) * 255); // G → Y (bitangent)
      dst[i + 2] = Math.round((uz * 0.5 + 0.5) * 255); // B → Z (surface normal)
      dst[i + 3] = 255;                                  // A → fully opaque
    }
  }

  nmCtx.putImageData(nmImg, 0, 0);

  // ── 4. Build CanvasTexture ────────────────────────────────────────────────
  const tex = new THREE.CanvasTexture(nmCanvas);

  // Normal maps are direction data → must stay in linear space.
  // THREE.NoColorSpace is the default; setting it explicitly documents intent.
  tex.colorSpace = THREE.NoColorSpace;

  // Repeat/wrap should mirror whatever was set on the corresponding color texture
  // so the bumps line up with the bricks/stones.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Caller should copy the color texture's repeat onto this texture too:
  //   normalTex.repeat.copy(colorTex.repeat);
  // We set a safe default of (1, 1) (no repeat) so the texture isn't broken
  // if the caller forgets; the _getNormalTex helpers below handle repeat.

  return tex;
}

// ─── Recommended normalScale values per surface type ─────────────────────────
//
// `normalScale` is a Vector2 that multiplies the XY components of the sampled
// normal AFTER they are unpacked from the texture.  Setting it to (1, 1) uses
// whatever bumpiness the texture encodes at face value.  Values above 1 amplify;
// values below 1 flatten.
//
// Why set it on the material AND encode strength in the texture?
//   • `strength` in generateNormalMap bakes the gradient exaggeration into the
//     texture permanently — good for getting the overall bump "shape" right.
//   • `normalScale` on the material is a cheap runtime multiplier that can be
//     animated, quality-scaled, or tweaked per instance without re-generating
//     the texture.  Use it for fine-tuning.
//
// Empirical recommendations for building materials viewed at isometric range:
export const NORMAL_SCALE_PRESETS = {
  /** Deep mortar joints; strong perpendicular edges between bricks. */
  brick:    new THREE.Vector2(0.75, 0.75),   // r15: 1.2 shimmered at eye level
  /** Irregular stone blocks with rounded edges and pits. */
  stone:    new THREE.Vector2(1.5, 1.5),
  /** Smooth poured concrete with subtle aggregate noise. */
  concrete: new THREE.Vector2(0.6, 0.6),
  /** Fired clay roof tiles with pronounced ridges. */
  roofTile: new THREE.Vector2(1.0, 1.0),
} as const;

// ─── Strength presets (baked into the texture) ───────────────────────────────
//
// These control how aggressively the Sobel gradient is scaled inside
// generateNormalMap.  Higher values give steeper virtual geometry from the same
// color source.
export const STRENGTH_PRESETS = {
  brick:    3.0,   // deep mortar channels → punchy gradient
  stone:    4.0,   // larger irregular blocks → strongest gradient needed
  concrete: 1.0,   // near-flat noise → low strength to avoid artificial facets
  roofTile: 2.5,   // tile ridges are mid-depth
} as const;

// Strengths for textures that ship a dedicated grayscale height canvas
// (BuildingRenderer paints mortar joints / bevels / slate butts explicitly),
// whose gradients are clean steps rather than color noise.
export const HEIGHT_STRENGTH_PRESETS = {
  brick:    2.2,
  stone:    2.6,
  concrete: 1.4,
  roofTile: 1.8,
} as const;

// ─── Drop-in cache helpers (mirrors _getCachedTex pattern in BuildingRenderer) ─

const _nmCache = new Map<string, THREE.CanvasTexture>();

function _getCachedNM(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = _nmCache.get(key);
  if (!t) { t = make(); _nmCache.set(key, t); }
  return t;
}

/**
 * Generate and cache a normal map derived from the given color canvas.
 * The cache key is the same key used for the color texture so the two are
 * always in sync.
 *
 * @param colorKey     The key used for the corresponding color texture in _texCache.
 * @param colorCanvas  The source canvas (same one that produced the color texture).
 * @param strength     Sobel exaggeration (use STRENGTH_PRESETS).
 * @param repeat       UV repeat to copy from the color texture.
 */
export function getCachedNormalMap(
  colorKey: string,
  colorCanvas: HTMLCanvasElement,
  strength: number,
  repeat: THREE.Vector2,
): THREE.CanvasTexture {
  return _getCachedNM(`nm_${colorKey}`, () => {
    const t = generateNormalMap(colorCanvas, strength);
    t.repeat.copy(repeat);
    return t;
  });
}

// ─── Extended material factory with normal map support ───────────────────────

/**
 * Like `getTexMat` in BuildingRenderer but also wires up the normal map.
 * Drop-in replacement:
 *
 *   // Before:
 *   getTexMat(_getWallTex(style, palette.wall), 0.8, 0)
 *
 *   // After:
 *   getTexMatWithNormal(style, palette.wall, 0.8, 0)
 */
export function makeTexMatWithNormal(
  colorTex: THREE.CanvasTexture,
  normalTex: THREE.CanvasTexture,
  normalScale: THREE.Vector2,
  roughness = 0.8,
  metalness = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color:       0xffffff,
    map:         colorTex,
    normalMap:   normalTex,
    normalScale: normalScale,
    roughness,
    metalness,
  });
}
