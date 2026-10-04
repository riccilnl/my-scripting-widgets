import type { KeyDefinition } from "../contracts/key";
import { emptyKeyActionPreferencesValue, type KeyActionPreferences } from "../contracts/preferences";
import { resolvedKeyActionMap } from "../keyboard/actions/defaultKeyActions";

export const FROZEN_QWERTY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"]
] as const;

export function qwertyLetter(
  text: string,
  preferences: KeyActionPreferences = emptyKeyActionPreferencesValue()
): KeyDefinition {
  const id = `letter-${text}`;
  return {
    id,
    semantic: { kind: "letter", text },
    visualRole: "normal",
    actions: resolvedKeyActionMap(
      { type: "character", text },
      preferences,
      "qwerty",
      id
    )
  };
}
