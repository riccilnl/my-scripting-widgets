import {
  resolveT9CustomKeyCommandValue,
  type KeyboardRuntimeSettings
} from "../../contracts/preferences";
import { readKeyboardSettings } from "../../settings/keyboardSettings";

/** Keyboard-only projection of the single normalized settings source. */
export function readKeyboardRuntimeSettings(): KeyboardRuntimeSettings {
  const settings = readKeyboardSettings();
  return {
    skinId: settings.skinId,
    chineseLayout: settings.chineseLayout,
    schemes: { ...settings.schemes },
    keyFacePreferences: { ...settings.keyFacePreferences },
    layoutPreferences: { ...settings.layoutPreferences },
    hapticsEnabled: settings.feedbackPreferences.hapticsEnabled,
    keyPopupEnabled: settings.feedbackPreferences.keyPopupEnabled,
    actionPreferences: settings.actionPreferences,
    toolbarItems: [...settings.toolbarPreferences.items],
    t9CustomKey: {
      label: settings.t9CustomKeyPreferences.label,
      command: resolveT9CustomKeyCommandValue(settings.t9CustomKeyPreferences)
    }
  };
}
