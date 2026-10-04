export type KeyboardLayoutDefaults = {
  keyboardBodyHeight: number;
  topSurfaceHeight: number;
};

export type KeyboardLayoutPreferences = {
  keyboardBodyHeightOverride?: number;
  topSurfaceHeightOverride?: number;
};

// These are structural safety bounds, not skin values. A skin may choose any
// default inside the range; user overrides are clamped here before runtime.
export const KEYBOARD_BODY_HEIGHT_MIN = 240;
export const KEYBOARD_BODY_HEIGHT_MAX = 282;
export const TOP_SURFACE_HEIGHT_MIN = 34;
export const TOP_SURFACE_HEIGHT_MAX = 64;

// Matches the accepted 0.3.8 geometry: 4 × 60pt keys + 3 × 6pt row gaps,
// plus a 56pt shared toolbar/candidate surface.
export const DEFAULT_KEYBOARD_LAYOUT: KeyboardLayoutDefaults = {
  keyboardBodyHeight: 258,
  topSurfaceHeight: 56
};
