import type { KeyboardCommand, KeyGesture } from "./action";
import { resolveFunctionInstruction } from "./functionCommands";
import type { KeyFacePreferences } from "./keyface";
import {
  KEYBOARD_BODY_HEIGHT_MAX,
  KEYBOARD_BODY_HEIGHT_MIN,
  TOP_SURFACE_HEIGHT_MAX,
  TOP_SURFACE_HEIGHT_MIN,
  type KeyboardLayoutPreferences
} from "./layout";
import { DEFAULT_SKIN_ID, normalizeSkinId, type SkinId } from "./skin";

export type ChineseLayoutId = "t9" | "qwerty";
export type SchemePreferences = Record<ChineseLayoutId, string>;

export type ConfigurableKeyGesture = Exclude<KeyGesture, "tap">;
export type KeyGestureActionOverride = KeyboardCommand | null;
export type KeyGestureOverrides = Partial<Record<ConfigurableKeyGesture, KeyGestureActionOverride>>;
export type KeyActionPreferences = {
  t9: Record<string, KeyGestureOverrides>;
  qwerty: Record<string, KeyGestureOverrides>;
};

export type ToolbarToolId =
  | "cursor-left"
  | "line-start"
  | "select-all"
  | "cut"
  | "copy"
  | "paste"
  | "line-end"
  | "cursor-right"
  | "delete-all"
  | "restore-deleted"
  | "clipboard"
  | "common-phrases";

export type ToolbarPreferences = { items: ToolbarToolId[] };
export const MAX_TOOLBAR_ITEMS = 8;
export const DEFAULT_TOOLBAR_ITEMS: readonly ToolbarToolId[] = [
  "cursor-left",
  "line-start",
  "select-all",
  "cut",
  "copy",
  "paste",
  "line-end",
  "cursor-right"
];

export type T9CustomKeyActionMode = "auto" | "rime" | "direct";
export type T9CustomKeyPreferences = {
  label: string;
  action: string;
  mode: T9CustomKeyActionMode;
};

export const DEFAULT_T9_CUSTOM_KEY_PREFERENCES: T9CustomKeyPreferences = {
  label: "'",
  action: "'",
  mode: "auto"
};

export type RuntimeT9CustomKey = {
  label: string;
  command: KeyboardCommand;
};

export type FeedbackPreferences = {
  hapticsEnabled: boolean;
  keyPopupEnabled: boolean;
};

export type KeyboardSettingsValue = {
  skinId: SkinId;
  chineseLayout: ChineseLayoutId;
  schemes: SchemePreferences;
  keyFacePreferences: KeyFacePreferences;
  layoutPreferences: KeyboardLayoutPreferences;
  feedbackPreferences: FeedbackPreferences;
  actionPreferences: KeyActionPreferences;
  toolbarPreferences: ToolbarPreferences;
  t9CustomKeyPreferences: T9CustomKeyPreferences;
};

export type KeyboardRuntimeSettings = {
  skinId: SkinId;
  chineseLayout: ChineseLayoutId;
  schemes: SchemePreferences;
  keyFacePreferences: KeyFacePreferences;
  layoutPreferences: KeyboardLayoutPreferences;
  hapticsEnabled: boolean;
  keyPopupEnabled: boolean;
  actionPreferences: KeyActionPreferences;
  toolbarItems: ToolbarToolId[];
  t9CustomKey: RuntimeT9CustomKey;
};

const CONFIGURABLE_GESTURES: readonly ConfigurableKeyGesture[] = [
  "swipeUp",
  "swipeDown",
  "swipeLeft",
  "swipeRight",
  "longPress"
];

const TOOL_IDS = new Set<string>([
  "cursor-left",
  "line-start",
  "select-all",
  "cut",
  "copy",
  "paste",
  "line-end",
  "cursor-right",
  "delete-all",
  "restore-deleted",
  "clipboard",
  "common-phrases"
]);

const DEFAULT_SCHEMES: SchemePreferences = {
  t9: "wanxiang_t9",
  qwerty: ""
};

const DEFAULT_KEYFACE_PREFERENCES: KeyFacePreferences = {
  uppercaseLetterLabels: false,
  showActionHints: true,
  showSpaceLabel: true,
  spaceLabel: "万象"
};

const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  hapticsEnabled: true,
  keyPopupEnabled: true
};

export function emptyKeyActionPreferencesValue(): KeyActionPreferences {
  return { t9: {}, qwerty: {} };
}

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

export function normalizeKeyActionPreferencesValue(value: any): KeyActionPreferences {
  return {
    t9: normalizeLayoutOverrides(value?.t9),
    qwerty: normalizeLayoutOverrides(value?.qwerty)
  };
}

export function defaultToolbarPreferencesValue(): ToolbarPreferences {
  return { items: [...DEFAULT_TOOLBAR_ITEMS] };
}

export function normalizeToolbarPreferencesValue(value: any): ToolbarPreferences {
  if (!Array.isArray(value?.items)) return defaultToolbarPreferencesValue();
  const items: ToolbarToolId[] = [];
  const seen = new Set<string>();
  for (const raw of value.items) {
    if (typeof raw !== "string" || !TOOL_IDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    items.push(raw as ToolbarToolId);
    if (items.length >= MAX_TOOLBAR_ITEMS) break;
  }
  return { items };
}

export function normalizeT9CustomKeyPreferencesValue(value: any): T9CustomKeyPreferences {
  return {
    label: typeof value?.label === "string"
      ? value.label
      : DEFAULT_T9_CUSTOM_KEY_PREFERENCES.label,
    action: typeof value?.action === "string"
      ? value.action
      : DEFAULT_T9_CUSTOM_KEY_PREFERENCES.action,
    mode: value?.mode === "rime" || value?.mode === "direct"
      ? value.mode
      : "auto"
  };
}

export function resolveT9CustomKeyCommandValue(preferences: T9CustomKeyPreferences): KeyboardCommand {
  if (preferences.mode === "direct") return { type: "insertDirect", text: preferences.action };
  if (preferences.mode === "rime") return { type: "rimeText", text: preferences.action };
  const instruction = resolveFunctionInstruction(preferences.action);
  if (instruction) return instruction;
  if (preferences.action === "'") return { type: "insertLiteral", text: "'" };
  return { type: "rimeText", text: preferences.action };
}

function normalizeChineseLayout(value: unknown): ChineseLayoutId {
  return value === "qwerty" ? "qwerty" : "t9";
}

function normalizeSchemeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSchemes(value: any): SchemePreferences {
  return {
    t9: normalizeSchemeId(value?.t9) || DEFAULT_SCHEMES.t9,
    qwerty: normalizeSchemeId(value?.qwerty)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeOptionalHeight(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(Math.round(value), min, max)
    : undefined;
}

function normalizeLayoutPreferences(value: any): KeyboardLayoutPreferences {
  const keyboardBodyHeightOverride = normalizeOptionalHeight(
    value?.keyboardBodyHeightOverride,
    KEYBOARD_BODY_HEIGHT_MIN,
    KEYBOARD_BODY_HEIGHT_MAX
  );
  const topSurfaceHeightOverride = normalizeOptionalHeight(
    value?.topSurfaceHeightOverride,
    TOP_SURFACE_HEIGHT_MIN,
    TOP_SURFACE_HEIGHT_MAX
  );
  return {
    ...(keyboardBodyHeightOverride == null ? {} : { keyboardBodyHeightOverride }),
    ...(topSurfaceHeightOverride == null ? {} : { topSurfaceHeightOverride })
  };
}

function normalizeFeedbackPreferences(value: any): FeedbackPreferences {
  return {
    hapticsEnabled: value?.hapticsEnabled !== false,
    keyPopupEnabled: value?.keyPopupEnabled !== false
  };
}

function normalizeKeyFacePreferences(value: any): KeyFacePreferences {
  return {
    uppercaseLetterLabels: value?.uppercaseLetterLabels === true,
    showActionHints: value?.showActionHints !== false,
    showSpaceLabel: value?.showSpaceLabel !== false,
    spaceLabel: typeof value?.spaceLabel === "string"
      ? value.spaceLabel
      : DEFAULT_KEYFACE_PREFERENCES.spaceLabel
  };
}

export function defaultKeyboardSettingsValue(): KeyboardSettingsValue {
  return {
    skinId: DEFAULT_SKIN_ID,
    chineseLayout: "t9",
    schemes: { ...DEFAULT_SCHEMES },
    keyFacePreferences: { ...DEFAULT_KEYFACE_PREFERENCES },
    layoutPreferences: {},
    feedbackPreferences: { ...DEFAULT_FEEDBACK_PREFERENCES },
    actionPreferences: emptyKeyActionPreferencesValue(),
    toolbarPreferences: defaultToolbarPreferencesValue(),
    t9CustomKeyPreferences: { ...DEFAULT_T9_CUSTOM_KEY_PREFERENCES }
  };
}

export function normalizeKeyboardSettingsValue(value: any): KeyboardSettingsValue {
  const fallback = defaultKeyboardSettingsValue();
  if (!value || typeof value !== "object") return fallback;
  return {
    skinId: normalizeSkinId(value.skinId),
    chineseLayout: normalizeChineseLayout(value.chineseLayout),
    schemes: normalizeSchemes(value.schemes),
    keyFacePreferences: normalizeKeyFacePreferences(value.keyFacePreferences),
    layoutPreferences: normalizeLayoutPreferences(value.layoutPreferences),
    feedbackPreferences: normalizeFeedbackPreferences(value.feedbackPreferences),
    actionPreferences: normalizeKeyActionPreferencesValue(value.actionPreferences),
    toolbarPreferences: normalizeToolbarPreferencesValue(value.toolbarPreferences),
    t9CustomKeyPreferences: normalizeT9CustomKeyPreferencesValue(value.t9CustomKeyPreferences)
  };
}
