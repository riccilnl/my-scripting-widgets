/**
 * Subtle tick-style keyboard feedback through Scripting's synchronous
 * selection feedback helper; avoid the heavier impact sensation. Do not use asynchronous effects or
 * retain/restart a Core Haptics player: late native playback must not be
 * queued behind typing.
 */
const MIN_FEEDBACK_INTERVAL_MS = 48;
let lastFeedbackAt = 0;

export function playKeyboardHaptic(enabled: boolean): void {
  if (!enabled) return;
  const now = Date.now();
  if (lastFeedbackAt && now - lastFeedbackAt < MIN_FEEDBACK_INTERVAL_MS) return;
  // HapticFeedback is a Scripting global; do not import it from "scripting".
  try {
    if (typeof HapticFeedback?.selection !== "function") return;
    HapticFeedback.selection();
    lastFeedbackAt = now;
  } catch {
    // A missing/failed native feedback must never interrupt keyboard input.
  }
}

export function disposeKeyboardHaptics(): void {
  lastFeedbackAt = 0;
}
