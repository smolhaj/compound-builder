import type { WorldScene } from '../engine/world/WorldScene';

/**
 * Let the browser paint and handle input between two heavy stages of the boot (the loading screen only moves if the
 * main thread comes up for air). A hidden tab gets no animation frames, so the wait is capped.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise(ok => {
    let done = false;
    const go = () => { if (!done) { done = true; setTimeout(ok, 0); } };
    requestAnimationFrame(go);
    setTimeout(go, 80);
  });
}

/**
 * Start compiling every shader the scene needs now (`renderer.compile` issues the links; with KHR_parallel_shader_compile the browser
 * does them on its compile threads), then wait, yielding, until the programs report ready: instead of one blocking link per material on
 * the first frame that shows it. (three's own `compileAsync` throws on a material with no program and then never resolves.)
 * Capped, and never fatal: the first frame compiles whatever is left.
 */
export async function warmShaders(ws: WorldScene, capMs = 20000): Promise<void> {
  try {
    ws.renderer.compile(ws.scene, ws.camera);
    const progs = (ws.renderer.info.programs ?? []) as unknown as Array<{ isReady?: () => boolean }>;
    const t0 = performance.now();
    while (performance.now() - t0 < capMs && progs.some(p => p.isReady && !p.isReady())) await new Promise(ok => setTimeout(ok, 25));
  } catch { /* the first frame compiles it */ }
}
