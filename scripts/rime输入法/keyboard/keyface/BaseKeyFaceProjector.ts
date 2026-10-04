import type { KeyDefinition, KeyFaceModel } from "../../contracts/key";
import type { KeyFacePreferences } from "../../contracts/keyface";

type BaseKeyFaceRuntimeState = {
  shifted: boolean;
  capsLocked: boolean;
  asciiMode: boolean;
};

export function projectBaseKeyFace(
  definition: KeyDefinition,
  runtime: BaseKeyFaceRuntimeState,
  preferences: KeyFacePreferences
): KeyFaceModel {
  const semantic = definition.semantic;
  switch (semantic.kind) {
    case "letter":
      return {
        centerText: runtime.shifted || runtime.capsLocked || preferences.uppercaseLetterLabels
          ? semantic.text.toUpperCase()
          : semantic.text.toLowerCase(),
        centerTextRole: "letter",
        centerFontSizeOverride: runtime.shifted || runtime.capsLocked || preferences.uppercaseLetterLabels ? 24 : 27
      };

    case "t9":
      return {
        // The digit corners in frozen 4.6.24 are action hints, not base T9 faces.
        centerText: preferences.uppercaseLetterLabels
          ? semantic.letters.toUpperCase()
          : semantic.letters.toLowerCase(),
        centerTextRole: "t9Letters",
        centerFontSizeOverride: semantic.letters.length > 3 ? 20 : 22
      };

    case "text":
      return {
        centerText: semantic.text,
        centerTextRole: semantic.textRole ?? "function"
      };

    case "icon":
      return {
        centerImage: semantic.systemImage,
        centerTextRole: "function"
      };

    case "shift":
      return {
        centerImage: runtime.capsLocked
          ? "capslock.fill"
          : runtime.shifted
          ? "shift.fill"
          : "shift",
        centerTextRole: "function"
      };

    case "space": {
      const customLabel = semantic.allowsCustomLabel !== false && preferences.showSpaceLabel
        ? preferences.spaceLabel
        : undefined;
      return {
        centerImage: "space",
        centerTextRole: "function",
        bottomRightText: customLabel,
        bottomRightFontSize: customLabel == null
          ? undefined
          : customLabel.length > 4
          ? 8
          : customLabel.length > 2
          ? 10
          : 12
      };
    }

    case "mode":
      return {
        // Language state is the key's primary face, not a pair of corner badges.
        centerText: runtime.asciiMode ? "英" : "中",
        centerTextRole: "mode"
      };
  }
}
