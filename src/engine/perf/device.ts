import { pickStartTier, type DeviceInfo, type Tier } from './qualityAuto';

/** What the browser says about this device (never throws; missing fields are left out). */
export function readDevice(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const info: DeviceInfo = { cores: nav.hardwareConcurrency || undefined, memoryGB: nav.deviceMemory, dpr: window.devicePixelRatio };
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      info.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* hidden or blocked: the tier stays a guess from cores and memory */ }
  return info;
}

/** The tier to start on when the player has not chosen one. Automation (the QA harness) keeps the old Medium so shots do not change. */
export function autoStartTier(): Tier {
  if (navigator.webdriver) return 'medium';
  return pickStartTier(readDevice());
}
