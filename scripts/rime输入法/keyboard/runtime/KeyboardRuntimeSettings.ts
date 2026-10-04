import type { KeyboardCommand } from "../../contracts/action";
import {
  KEYBOARD_BODY_HEIGHT_MAX,
  KEYBOARD_BODY_HEIGHT_MIN,
  TOP_SURFACE_HEIGHT_MAX,
  TOP_SURFACE_HEIGHT_MIN,
  type KeyboardLayoutPreferences
} from "../../contracts/layout";
import { resolveFunctionInstruction } from "../../contracts/functionCommands";
import { DEFAULT_SKIN_ID, normalizeSkinId } from "../../contracts/skin";
import {
  DEFAULT_T9_CUSTOM_KEY_PREFERENCES,
  DEFAULT_TOOLBAR_ITEMS,
  emptyKeyActionPreferencesValue,
  type ChineseLayoutId,
  type KeyboardRuntimeSettings,
  type KeyActionPreferences,
  type RuntimeT9CustomKey,
  type SchemePreferences,
  type ToolbarToolId
} from "../../contracts/preferences";

const SETTINGS_STORAGE_KEY = "rime_input_method_settings_v1";
const SHARED_STORAGE_OPTIONS = { shared: true } as const;
const DEFAULT_SCHEMES: SchemePreferences = { t9: "wanxiang_t9", qwerty: "" };

function storageApi(): any {
  return (globalThis as any).Storage;
}


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readLayoutPreferences(value: any): KeyboardLayoutPreferences {
  const keyboardBodyHeightOverride = typeof value?.keyboardBodyHeightOverride === "number" && Number.isFinite(value.keyboardBodyHeightOverride)
    ? clamp(value.keyboardBodyHeightOverride, KEYBOARD_BODY_HEIGHT_MIN, KEYBOARD_BODY_HEIGHT_MAX)
    : undefined;
  const topSurfaceHeightOverride = typeof value?.topSurfaceHeightOverride === "number" && Number.isFinite(value.topSurfaceHeightOverride)
    ? clamp(value.topSurfaceHeightOverride, TOP_SURFACE_HEIGHT_MIN, TOP_SURFACE_HEIGHT_MAX)
    : undefined;
  return {
    ...(keyboardBodyHeightOverride == null ? {} : { keyboardBodyHeightOverride }),
    ...(topSurfaceHeightOverride == null ? {} : { topSurfaceHeightOverride })
  };
}

function compileT9CustomKey(value: any): RuntimeT9CustomKey {
  const label = typeof value?.label === "string" ? value.label : DEFAULT_T9_CUSTOM_KEY_PREFERENCES.label;
  const action = typeof value?.action === "string" ? value.action : DEFAULT_T9_CUSTOM_KEY_PREFERENCES.action;
  const mode = value?.mode === "rime" || value?.mode === "direct" ? value.mode : "auto";
  let command: KeyboardCommand;
  if (mode === "direct") command = { type: "insertDirect", text: action };
  else if (mode === "rime") command = { type: "rimeText", text: action };
  else command = resolveFunctionInstruction(action)
    ?? (action === "'" ? { type: "insertLiteral", text: "'" } : { type: "rimeText", text: action });
  return { label, command };
}

function defaults(): KeyboardRuntimeSettings {
  return {
    skinId: DEFAULT_SKIN_ID,
    chineseLayout: "t9",
    schemes: { ...DEFAULT_SCHEMES },
    keyFacePreferences: {
      uppercaseLetterLabels: false,
      showActionHints: true,
      showSpaceLabel: true,
      spaceLabel: "万象"
    },
    layoutPreferences: {},
    hapticsEnabled: true,
    keyPopupEnabled: true,
    actionPreferences: emptyKeyActionPreferencesValue(),
    toolbarItems: [...DEFAULT_TOOLBAR_ITEMS],
    t9CustomKey: compileT9CustomKey(DEFAULT_T9_CUSTOM_KEY_PREFERENCES)
  };
}

export function readKeyboardRuntimeSettings(): KeyboardRuntimeSettings {
  const fallback = defaults();
  const storage = storageApi();
  if (!storage) return fallback;
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(SETTINGS_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(SETTINGS_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : null;
    if (raw == null) return fallback;
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return fallback;
    const chineseLayout: ChineseLayoutId = value.chineseLayout === "qwerty" ? "qwerty" : "t9";
    const keyFace = value.keyFacePreferences ?? {};
    const schemes = value.schemes ?? {};
    const toolbar = Array.isArray(value.toolbarPreferences?.items)
      ? value.toolbarPreferences.items.filter((item: unknown): item is ToolbarToolId => typeof item === "string").slice(0, 8)
      : fallback.toolbarItems;
    const actionPreferences: KeyActionPreferences = value.actionPreferences && typeof value.actionPreferences === "object"
      ? value.actionPreferences as KeyActionPreferences
      : fallback.actionPreferences;
    return {
      skinId: normalizeSkinId(value.skinId),
      chineseLayout,
      schemes: {
        t9: typeof schemes.t9 === "string" && schemes.t9.trim() ? schemes.t9.trim() : DEFAULT_SCHEMES.t9,
        qwerty: typeof schemes.qwerty === "string" ? schemes.qwerty.trim() : ""
      },
      keyFacePreferences: {
        uppercaseLetterLabels: keyFace.uppercaseLetterLabels === true,
        showActionHints: keyFace.showActionHints !== false,
        showSpaceLabel: keyFace.showSpaceLabel !== false,
        spaceLabel: typeof keyFace.spaceLabel === "string" ? keyFace.spaceLabel : fallback.keyFacePreferences.spaceLabel
      },
      layoutPreferences: readLayoutPreferences(value.layoutPreferences),
      hapticsEnabled: value.feedbackPreferences?.hapticsEnabled !== false,
      keyPopupEnabled: value.feedbackPreferences?.keyPopupEnabled !== false,
      actionPreferences,
      toolbarItems: toolbar,
      t9CustomKey: compileT9CustomKey(value.t9CustomKeyPreferences)
    };
  } catch {
    return fallback;
  }
}
