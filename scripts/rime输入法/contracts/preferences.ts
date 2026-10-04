import type { KeyboardCommand, KeyGesture } from "./action";
import type { KeyFacePreferences } from "./keyface";
import type { KeyboardLayoutPreferences } from "./layout";
import type { SkinId } from "./skin";

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

export function emptyKeyActionPreferencesValue(): KeyActionPreferences {
  return { t9: {}, qwerty: {} };
}
