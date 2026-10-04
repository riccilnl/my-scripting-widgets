import type { KeyDefinition } from "../contracts/key";
import { emptyKeyActionPreferencesValue, type KeyActionPreferences } from "../contracts/preferences";
import { resolvedKeyActionMap } from "../keyboard/actions/defaultKeyActions";

const FROZEN_T9_KEYS = [
  { digit: "1", letters: "@./" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" }
] as const;

export const FROZEN_T9_ROWS = [
  FROZEN_T9_KEYS.slice(0, 3),
  FROZEN_T9_KEYS.slice(3, 6),
  FROZEN_T9_KEYS.slice(6, 9)
] as const;

export function t9Digit(
  digit: string,
  letters: string,
  preferences: KeyActionPreferences = emptyKeyActionPreferencesValue()
): KeyDefinition {
  const id = `t9-${digit}`;
  return {
    id,
    semantic: { kind: "t9", digit, letters },
    visualRole: "normal",
    actions: resolvedKeyActionMap(
      { type: "character", text: digit },
      preferences,
      "t9",
      id
    )
  };
}
