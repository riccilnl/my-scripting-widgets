import type { KeyboardCommand } from "../contracts/action";
import type {
  ConfigurableKeyGesture,
  KeyActionPreferences,
  KeyGestureActionOverride,
  KeyGestureOverrides
} from "../contracts/preferences";
export type {
  ConfigurableKeyGesture,
  KeyActionPreferences,
  KeyGestureActionOverride,
  KeyGestureOverrides
} from "../contracts/preferences";

const CONFIGURABLE_GESTURES: readonly ConfigurableKeyGesture[] = [
  "swipeUp",
  "swipeDown",
  "swipeLeft",
  "swipeRight",
  "longPress"
];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function normalizeCommand(value: any): KeyboardCommand | undefined {
  if (!value || typeof value !== "object" || !isString(value.type)) return undefined;
  switch (value.type) {
    case "character":
    case "insertDirect":
    case "insertLiteral":
    case "rimeText":
      return isString(value.text) ? { type: value.type, text: value.text } : undefined;
    case "backspace":
    case "space":
    case "return":
    case "toggleAscii":
    case "toggleShift":
    case "clearComposition":
    case "moveLineStart":
    case "moveLineEnd":
    case "selectAll":
    case "toggleSelectAll":
    case "cut":
    case "copy":
    case "paste":
    case "deleteAll":
    case "restoreDeleted":
    case "nextKeyboard":
    case "keyboardHome":
    case "openClipboardHistory":
    case "openCommonPhrases":
      return { type: value.type };
    case "moveCursor":
      return Number.isFinite(value.offset)
        ? { type: "moveCursor", offset: value.offset }
        : undefined;
    case "setSurface":
      return value.surface === "main" || value.surface === "numeric" || value.surface === "symbols"
        ? { type: "setSurface", surface: value.surface }
        : undefined;
    default:
      return undefined;
  }
}

function normalizeLayoutOverrides(value: any): Record<string, KeyGestureOverrides> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, KeyGestureOverrides> = {};
  for (const [keyId, rawGestures] of Object.entries(value)) {
    if (!rawGestures || typeof rawGestures !== "object") continue;
    const gestures: KeyGestureOverrides = {};
    for (const gesture of CONFIGURABLE_GESTURES) {
      if (!Object.prototype.hasOwnProperty.call(rawGestures, gesture)) continue;
      const raw = (rawGestures as any)[gesture];
      if (raw === null) {
        gestures[gesture] = null;
        continue;
      }
      const command = normalizeCommand(raw);
      if (command) gestures[gesture] = command;
    }
    if (Object.keys(gestures).length) result[keyId] = gestures;
  }
  return result;
}

export function emptyKeyActionPreferences(): KeyActionPreferences {
  return { t9: {}, qwerty: {} };
}

export function normalizeKeyActionPreferences(value: any): KeyActionPreferences {
  return {
    t9: normalizeLayoutOverrides(value?.t9),
    qwerty: normalizeLayoutOverrides(value?.qwerty)
  };
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
