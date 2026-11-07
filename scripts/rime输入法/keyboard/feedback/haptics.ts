/**
 * iOS 27.2 diagnostic preview:
 * Suppress ALL script-originated haptics in the keyboard extension.
 *
 * Haptics.transient() uses an asynchronous native Core Haptics engine.
 * Even a resolved JS Promise does not establish that the physical event
 * has already played; no JS-side throttling can cancel native backlog.
 *
 * Do not edit the persisted feedback preference; it can be used again
 * when a verified immediate-feedback backend is available.
 */
export function playKeyboardHaptic(_enabled: boolean): void {
  // Deliberately no native Haptics, HapticEngine, or audio call.
}

export function disposeKeyboardHaptics(): void {
  // No native haptic resources are allocated in this preview.
}
