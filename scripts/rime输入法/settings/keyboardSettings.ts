import {
  defaultKeyboardSettingsValue,
  normalizeKeyboardSettingsValue,
  type KeyboardSettingsValue
} from "../contracts/preferences";
export type { ChineseLayoutId, SchemePreferences } from "../contracts/preferences";

export type KeyboardSettings = KeyboardSettingsValue;

const SETTINGS_STORAGE_KEY = "rime_input_method_settings_v1";
const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
}

export function readKeyboardSettings(): KeyboardSettings {
  const storage = storageApi();
  if (!storage) return defaultKeyboardSettingsValue();
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(SETTINGS_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(SETTINGS_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : null;
    if (raw == null) return defaultKeyboardSettingsValue();
    return normalizeKeyboardSettingsValue(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return defaultKeyboardSettingsValue();
  }
}

export function writeKeyboardSettings(settings: KeyboardSettings): boolean {
  const storage = storageApi();
  if (!storage) return false;
  const normalized = normalizeKeyboardSettingsValue(settings);
  try {
    if (typeof storage.set === "function") {
      return storage.set(SETTINGS_STORAGE_KEY, normalized, SHARED_STORAGE_OPTIONS) !== false;
    }
    if (typeof storage.setString === "function") {
      storage.setString(SETTINGS_STORAGE_KEY, JSON.stringify(normalized), SHARED_STORAGE_OPTIONS);
      return true;
    }
  } catch {}
  return false;
}
