import type { KeyboardCommand } from "../contracts/action";
import {
  DEFAULT_T9_CUSTOM_KEY_PREFERENCES,
  normalizeT9CustomKeyPreferencesValue,
  resolveT9CustomKeyCommandValue,
  type T9CustomKeyPreferences
} from "../contracts/preferences";
export { DEFAULT_T9_CUSTOM_KEY_PREFERENCES };
export type { T9CustomKeyActionMode, T9CustomKeyPreferences } from "../contracts/preferences";

export function normalizeT9CustomKeyPreferences(value: any): T9CustomKeyPreferences {
  return normalizeT9CustomKeyPreferencesValue(value);
}

export function resolveT9CustomKeyCommand(preferences: T9CustomKeyPreferences): KeyboardCommand {
  return resolveT9CustomKeyCommandValue(preferences);
}
