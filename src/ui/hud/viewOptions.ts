/** The building-view and camera-mode choices, shared by the Classic toolbar and the layout A action bar. */
import type { BuildingView, CameraMode } from '../../store/worldStore';

export const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];
export const CAMERA_TIP: Record<CameraMode, string> = { diorama: 'Orbit view from above: drag to turn, wheel to zoom, right-drag to pan', walk: 'Walk the place at eye level (WASD)', fly: 'Fly over it (WASD, Space / C for up and down)', cinematic: 'A slow tour of the buildings' };
export const VIEWS: Array<[BuildingView, string, string]> = [['full', 'Walls', 'Show buildings whole, roofs on (V cycles the three views)'], ['cutaway', 'Cutaway', 'Cut the walls at waist height and lift the roofs to see the rooms inside (V)'], ['xray', 'X-ray', 'See-through walls and roof: rooms, pipes and wiring (V)']];
