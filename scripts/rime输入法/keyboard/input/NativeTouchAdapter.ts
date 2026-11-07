/**
 * Scripting 3.2.2 native onTouchGesture bridge for iOS 18+.
 * Exactly one finger owns a key. Cancellation and safety expiry NEVER commit.
 * The JS timer only restores key UI if the platform drops ended/cancelled.
 */
import type { ScriptingNativeTouchEvent } from "./ScriptingNativeTouchTypes";

export type NativeKeyTouchEvent = ScriptingNativeTouchEvent;

export const NATIVE_TOUCH_SAFETY_MS = 1800;

export function createNativeTouchAdapter(callbacks: {
  began: (event: NativeKeyTouchEvent) => void;
  moved: (event: NativeKeyTouchEvent) => void;
  ended: (event: NativeKeyTouchEvent) => void;
  cancelled: () => void;
}, releaseAfterMs = NATIVE_TOUCH_SAFETY_MS) {
  let activeTouchId: string | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function stopTimer() {
    if (safetyTimer !== null) clearTimeout(safetyTimer);
    safetyTimer = null;
  }

  function cancel() {
    if (activeTouchId === null) return;
    activeTouchId = null;
    stopTimer();
    callbacks.cancelled();
  }

  function receive(event: NativeKeyTouchEvent) {
    if (disposed || !event || !event.touchId) return;
    if (event.phase === "began") {
      if (activeTouchId !== null) return;
      activeTouchId = event.touchId;
      safetyTimer = setTimeout(cancel, releaseAfterMs);
      try {
        callbacks.began(event);
      } catch (error) {
        cancel();
        throw error;
      }
      return;
    }
    // Another finger never releases or commits the primary one.
    if (activeTouchId !== event.touchId) return;
    if (event.phase === "moved") {
      callbacks.moved(event);
      return;
    }
    if (event.phase === "cancelled") {
      cancel();
      return;
    }
    if (event.phase === "ended") {
      activeTouchId = null;
      stopTimer();
      callbacks.ended(event);
    }
  }

  function dispose() {
    disposed = true;
    activeTouchId = null;
    stopTimer();
  }

  return { receive, dispose };
}
