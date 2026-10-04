import type { KeyFacePreferences } from "../contracts/keyface";
import { DEFAULT_SKIN_ID, normalizeSkinId, type SkinId } from "../contracts/skin";
import {
  KEYBOARD_BODY_HEIGHT_MAX,
  KEYBOARD_BODY_HEIGHT_MIN,
  TOP_SURFACE_HEIGHT_MAX,
  TOP_SURFACE_HEIGHT_MIN,
  type KeyboardLayoutPreferences
} from "../contracts/layout";
import type { ChineseLayoutId, SchemePreferences } from "../contracts/preferences";
export type { ChineseLayoutId, SchemePreferences } from "../contracts/preferences";
import {
  emptyKeyActionPreferences,
  normalizeKeyActionPreferences,
  type KeyActionPreferences
} from "./keyActionPreferences";
import {
  defaultToolbarPreferences,
  normalizeToolbarPreferences,
  type ToolbarPreferences
} from "./toolbarPreferences";
import {
  DEFAULT_T9_CUSTOM_KEY_PREFERENCES,
  normalizeT9CustomKeyPreferences,
  type T9CustomKeyPreferences
} from "./t9CustomKeyPreferences";


type FeedbackPreferences = {
  hapticsEnabled: boolean;
  keyPopupEnabled: boolean;
};

export type KeyboardSettings = {
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

const SETTINGS_STORAGE_KEY = "rime_input_method_settings_v1";
const SHARED_STORAGE_OPTIONS = { shared: true } as const;

const DEFAULT_KEYFACE_PREFERENCES: KeyFacePreferences = {
  uppercaseLetterLabels: false,
  showActionHints: true,
  showSpaceLabel: true,
  spaceLabel: "万象"
};

const DEFAULT_SCHEMES: SchemePreferences = {
  t9: "wanxiang_t9",
  // Empty means “follow the currently enabled/available qwerty main scheme”.
  // Once the user explicitly chooses one, the concrete schema id is stored.
  qwerty: ""
};

const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  hapticsEnabled: true,
  keyPopupEnabled: true
};

const DEFAULT_SETTINGS: KeyboardSettings = {
  skinId: DEFAULT_SKIN_ID,
  chineseLayout: "t9",
  schemes: { ...DEFAULT_SCHEMES },
  keyFacePreferences: { ...DEFAULT_KEYFACE_PREFERENCES },
  layoutPreferences: {},
  feedbackPreferences: { ...DEFAULT_FEEDBACK_PREFERENCES },
  actionPreferences: emptyKeyActionPreferences(),
  toolbarPreferences: defaultToolbarPreferences(),
  t9CustomKeyPreferences: { ...DEFAULT_T9_CUSTOM_KEY_PREFERENCES }
};

function storageApi(): any {
  return (globalThis as any).Storage;
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

function defaults(): KeyboardSettings {
  return {
    skinId: DEFAULT_SETTINGS.skinId,
    chineseLayout: DEFAULT_SETTINGS.chineseLayout,
    schemes: { ...DEFAULT_SCHEMES },
    keyFacePreferences: { ...DEFAULT_KEYFACE_PREFERENCES },
    layoutPreferences: {},
    feedbackPreferences: { ...DEFAULT_FEEDBACK_PREFERENCES },
    actionPreferences: emptyKeyActionPreferences(),
    toolbarPreferences: defaultToolbarPreferences(),
    t9CustomKeyPreferences: { ...DEFAULT_T9_CUSTOM_KEY_PREFERENCES }
  };
}

export function readKeyboardSettings(): KeyboardSettings {
  const storage = storageApi();
  if (!storage) return defaults();
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(SETTINGS_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(SETTINGS_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : null;
    if (raw == null) return defaults();
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      skinId: normalizeSkinId(value?.skinId),
      chineseLayout: normalizeChineseLayout(value?.chineseLayout),
      schemes: normalizeSchemes(value?.schemes),
      keyFacePreferences: normalizeKeyFacePreferences(value?.keyFacePreferences),
      layoutPreferences: normalizeLayoutPreferences(value?.layoutPreferences),
      feedbackPreferences: normalizeFeedbackPreferences(value?.feedbackPreferences),
      actionPreferences: normalizeKeyActionPreferences(value?.actionPreferences),
      toolbarPreferences: normalizeToolbarPreferences(value?.toolbarPreferences),
      t9CustomKeyPreferences: normalizeT9CustomKeyPreferences(value?.t9CustomKeyPreferences)
    };
  } catch {
    return defaults();
  }
}

export function writeKeyboardSettings(settings: KeyboardSettings): boolean {
  const storage = storageApi();
  if (!storage) return false;
  const normalized: KeyboardSettings = {
    skinId: normalizeSkinId(settings.skinId),
    chineseLayout: normalizeChineseLayout(settings.chineseLayout),
    schemes: normalizeSchemes(settings.schemes),
    keyFacePreferences: normalizeKeyFacePreferences(settings.keyFacePreferences),
    layoutPreferences: normalizeLayoutPreferences(settings.layoutPreferences),
    feedbackPreferences: normalizeFeedbackPreferences(settings.feedbackPreferences),
    actionPreferences: normalizeKeyActionPreferences(settings.actionPreferences),
    toolbarPreferences: normalizeToolbarPreferences(settings.toolbarPreferences),
    t9CustomKeyPreferences: normalizeT9CustomKeyPreferences(settings.t9CustomKeyPreferences)
  };
  try {
    if (typeof storage.set === "function") {
      return storage.set(SETTINGS_STORAGE_KEY, normalized, SHARED_STORAGE_OPTIONS) !== false;
    }
    if (typeof storage.setString === "function") {
      storage.setString(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(normalized),
        SHARED_STORAGE_OPTIONS
      );
      return true;
    }
  } catch {}
  return false;
}
