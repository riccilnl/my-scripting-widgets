import type {
  ConfigurableKeyGesture,
  KeyActionPreferences,
  KeyGestureActionOverride,
  KeyGestureOverrides
} from "../contracts/preferences";
import {
  emptyKeyActionPreferencesValue,
  normalizeKeyActionPreferencesValue
} from "../contracts/preferences";
export type {
  ConfigurableKeyGesture,
  KeyActionPreferences,
  KeyGestureActionOverride,
  KeyGestureOverrides
} from "../contracts/preferences";

export function emptyKeyActionPreferences(): KeyActionPreferences {
  return emptyKeyActionPreferencesValue();
}

export function normalizeKeyActionPreferences(value: any): KeyActionPreferences {
  return normalizeKeyActionPreferencesValue(value);
}

export function hasKeyGestureOverride(
  preferences: KeyActionPreferences,
  layout: "t9" | "qwerty",
  keyId: string,
  gesture: ConfigurableKeyGesture
): boolean {
  const key = preferences[layout]?.[keyId];
  return Boolean(key && Object.prototype.hasOwnProperty.call(key, gesture));
}

export function keyGestureOverride(
  preferences: KeyActionPreferences,
  layout: "t9" | "qwerty",
  keyId: string,
  gesture: ConfigurableKeyGesture
): KeyGestureActionOverride | undefined {
  const key = preferences[layout]?.[keyId];
  if (!key || !Object.prototype.hasOwnProperty.call(key, gesture)) return undefined;
  return key[gesture];
}

export function withKeyGestureOverride(
  preferences: KeyActionPreferences,
  layout: "t9" | "qwerty",
  keyId: string,
  gesture: ConfigurableKeyGesture,
  override: KeyGestureActionOverride | undefined
): KeyActionPreferences {
  const next: KeyActionPreferences = {
    t9: { ...preferences.t9 },
    qwerty: { ...preferences.qwerty }
  };
  const layoutOverrides = { ...next[layout] };
  const keyOverrides: KeyGestureOverrides = { ...(layoutOverrides[keyId] ?? {}) };

  if (override === undefined) delete keyOverrides[gesture];
  else keyOverrides[gesture] = override;

  if (Object.keys(keyOverrides).length) layoutOverrides[keyId] = keyOverrides;
  else delete layoutOverrides[keyId];

  next[layout] = layoutOverrides;
  return next;
}
