import type { KeyboardCommand } from "../contracts/action";
import {
  DEFAULT_T9_CUSTOM_KEY_PREFERENCES,
  type T9CustomKeyPreferences
} from "../contracts/preferences";
import { resolveFunctionInstruction } from "./functionInstructions";
export { DEFAULT_T9_CUSTOM_KEY_PREFERENCES };
export type { T9CustomKeyActionMode, T9CustomKeyPreferences } from "../contracts/preferences";

export function normalizeT9CustomKeyPreferences(value: any): T9CustomKeyPreferences {
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

/**
 * Compiles the settings-facing text syntax into the formal KeyboardCommand
 * contract once when the keyboard catalog is created. Runtime dispatch never
 * interprets legacy action strings.
 */
export function resolveT9CustomKeyCommand(
  preferences: T9CustomKeyPreferences
): KeyboardCommand {
  if (preferences.mode === "direct") {
    return { type: "insertDirect", text: preferences.action };
  }
  if (preferences.mode === "rime") {
    return { type: "rimeText", text: preferences.action };
  }

  const instruction = resolveFunctionInstruction(preferences.action);
  if (instruction) return instruction;

  // Preserve the verified frozen delimiter transaction for the default key:
  // no composition => host literal; live composition => Rime.
  if (preferences.action === "'") {
    return { type: "insertLiteral", text: "'" };
  }

  return { type: "rimeText", text: preferences.action };
}
