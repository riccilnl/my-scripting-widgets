/**
 * Project-scoped contract matching Scripting TestFlight 3.2.2 TouchGestureEvent:
 * https://scriptingapp.github.io/TestFlight/guide/Changelog/3.2.2/Native%20Touch%20Events%20for%20Custom%20Keyboards/
 *
 * Root dts predates this API; use a typed JSX spread while keeping the local
 * payload fully checked until upstream declarations catch up.
 */
export type ScriptingNativeTouchEvent = {
  touchId: string;
  sequence: number;
  phase: "began" | "moved" | "ended" | "cancelled";
  startLocation: { x: number; y: number };
  location: { x: number; y: number };
  translation: { width: number; height: number };
  velocity: { width: number; height: number };
  timestamp: number;
  receivedAt: number;
  dispatchAt: number;
  reason?: string;
};

export type ScriptingNativeTouchProps = {
  enabled?: boolean;
  coordinateSpace?: "local";
  onEvent: (event: ScriptingNativeTouchEvent) => void;
};
export type ScriptingNativeTouchViewProps = {
  onTouchGesture: ScriptingNativeTouchProps;
};
