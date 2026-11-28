/**
 * Keys that are not drawer hotkeys (those come from the drawer registry). Each row names the source file and the literal that
 * handles the key there; `keys.test.ts` fails if that literal disappears, so a rebound key cannot leave the manual wrong.
 */
export interface KeyRow { keys: string; does: string; file: string; token: string }

export const OTHER_KEYS: readonly KeyRow[] = [
  { keys: 'Esc', does: 'Close the top thing that is up: a tool, a card, a window, the camera mode, the View box, then the open drawer. One press closes one thing.', file: 'src/ui/hud/escStack.ts', token: 'ESC_ORDER' },
  { keys: 'Tab', does: 'Bring back the last drawer (or close the open one).', file: 'src/ui/hud/drawerHooks.ts', token: "e.code === 'Tab'" },
  { keys: 'M', does: 'Open or close the Shop and money.', file: 'src/ui/hud/drawerHooks.ts', token: "e.code === 'KeyM'" },
  { keys: 'V', does: 'Cycle the building view: Walls, Cutaway, X-ray.', file: 'src/game/GameCanvas.tsx', token: "e.code === 'KeyV'" },
  { keys: 'U', does: 'Underground view: see-through ground, bunker rooms cut open.', file: 'src/game/GameCanvas.tsx', token: "e.code === 'KeyU'" },
  { keys: 'H', does: 'Hide or show the panels to see the whole map.', file: 'src/game/GameCanvas.tsx', token: "e.code === 'KeyH'" },
  { keys: 'Arrow keys', does: 'Pan the Diorama camera.', file: 'src/game/DioramaCamera.ts', token: "'ArrowUp'" },
  { keys: 'R', does: 'While placing a building: rotate it (flip a yard).', file: 'src/game/PlacementTool.ts', token: "e.code === 'KeyR'" },
  { keys: 'S', does: 'While placing: drop the piece at the snap point under the pointer.', file: 'src/game/PlacementTool.ts', token: "e.code === 'KeyS'" },
  { keys: '+ and - (or [ and ])', does: 'While placing a dome: make it one step bigger or smaller.', file: 'src/game/PlacementTool.ts', token: "'BracketRight'" },
  { keys: '/', does: 'With the Build drawer open: jump to its search box.', file: 'src/ui/hud/BuildDrawer.tsx', token: "'Slash'" },
  { keys: 'Alt+L', does: 'Switch between the new layout and Classic.', file: 'src/ui/useLayout.ts', token: "'KeyL'" },
  { keys: 'W A S D, Space or E, C or Q', does: 'In the Walk and Fly cameras: move, rise, descend.', file: 'src/engine/world/camera/TourController.ts', token: "k.has('KeyW')" },
];
