/**
 * A keyboard key tap must not queue Core Haptics players or wait for engine
 * startup. Some iOS keyboard extensions defer native playback and then replay
 * a burst of previously scheduled start(0) calls.
 *
 * Use only one native transient at a time. Additional taps while the native
 * callback is pending are deliberately silent rather than accumulated.
 */
const MIN_HAPTIC_INTERVAL_MS = 45;

let pending = false;
let lastTriggeredAt = 0;
let generation = 0;

export function prepareKeyboardHaptics(_enabled: boolean) {
  // No retained CHHapticEngine, player pool, or reset/startAsync callbacks.
}

export function disposeKeyboardHaptics() {
  generation += 1;
  pending = false;
  lastTriggeredAt = 0;
}

export function playKeyboardHaptic(enabled: boolean) {
  if (!enabled || pending) return;
  const now = Date.now();
  if (lastTriggeredAt && now - lastTriggeredAt < MIN_HAPTIC_INTERVAL_MS) return;

  const haptics = (globalThis as any).Haptics;
  if (!haptics || typeof haptics.transient !== "function" ||
      haptics.supportsHaptics === false) return;

  const token = generation;
  lastTriggeredAt = now;
  try {
    const result = haptics.transient(0.56, 0.56);
    if (result && typeof result.then === "function") {
      pending = true;
      // Never enqueue retries or late playback after a delayed native result.
      void Promise.resolve(result).then(
        () => { if (generation === token) pending = false; },
        () => { if (generation === token) pending = false; }
      );
    }
  } catch {
    // Native haptic failure must not stop the keyboard input path.
  }
}
