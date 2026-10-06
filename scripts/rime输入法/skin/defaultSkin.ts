import { DEFAULT_KEYBOARD_LAYOUT } from "../contracts/layout";
import type { KeyboardSkin } from "../contracts/skin";

export const DEFAULT_SKIN: KeyboardSkin = {
  id: "classic",
  layoutDefaults: { ...DEFAULT_KEYBOARD_LAYOUT },
  geometry: {
    t9LeftColumn: { fraction: 0.15, min: 36, max: 68 },
    t9RightColumn: { fraction: 0.17, min: 44, max: 86 },
    numericLeftColumn: { fraction: 0.14, min: 36, max: 66 },
    numericRightColumn: { fraction: 0.18, min: 44, max: 84 }
  },
  typography: {
    keys: {
      letter: { fontSize: 27, fontWeight: "regular" },
      t9Letters: { fontSize: 22, fontWeight: "regular" },
      numeric: { fontSize: 24, fontWeight: "regular" },
      function: { fontSize: 16, fontWeight: "regular" },
      mode: { fontSize: 14, fontWeight: "medium" },
      candidate: { fontSize: 20, fontWeight: "regular" }
    },
    candidate: { fontSize: 20, fontWeight: "regular" },
    status: { fontSize: 13, fontWeight: "regular" },
    keyHint: { fontSize: 10, fontWeight: "regular" },
    t9DigitHint: { fontSize: 12, fontWeight: "medium" },
    contentPanel: {
      row: { fontSize: 16, fontWeight: "regular" },
      sectionTitle: { fontSize: 15, fontWeight: "semibold" }
    }
  },
  light: {
    keyboardBackground: "rgba(210,213,219,1)",
    foreground: "rgba(0,0,0,0.92)",
    secondaryForeground: "rgba(60,60,67,0.68)",
    candidateForeground: "rgba(0,0,0,0.92)",
    candidateSelectedForeground: "rgba(0,0,0,0.92)",
    t9PinyinBackground: "rgba(255,255,255,1)",
    keyBackgrounds: {
      normal: "rgba(255,255,255,1)",
      system: "rgba(172,177,186,1)",
      accent: "rgba(0,122,255,1)"
    },
    candidateSelectedBackground: "rgba(255,255,255,1)"
  },
  dark: {
    keyboardBackground: "rgba(0,0,0,0)",
    foreground: "rgba(255,255,255,0.94)",
    secondaryForeground: "rgba(235,235,245,0.62)",
    candidateForeground: "rgba(255,255,255,0.94)",
    candidateSelectedForeground: "rgba(255,255,255,0.94)",
    t9PinyinBackground: "rgba(82,82,85,1)",
    keyBackgrounds: {
      normal: "rgba(82,82,85,1)",
      system: "rgba(58,58,60,1)",
      accent: "rgba(10,132,255,1)"
    },
    candidateSelectedBackground: "rgba(82,82,85,1)"
  },
  visuals: {
    keyCornerRadius: 6,
    iconSize: 20,
    keyPressScale: 0.965,
    keyPressOverlayOpacity: 0.16,
    keyHintQwertyHorizontalInset: 7,
    keyHintT9HorizontalInset: 8,
    keyHintTopInset: 7,
    keyHintSymbolSize: 11,
    keyHintMinScaleFactor: 0.45,
    keyPopupExtraWidth: 18,
    keyPopupGap: 6,
    keyPopupFontSize: 36,
    keyPopupCornerRadius: 6,
    toolbarIconSize: 20,
    toolbarHorizontalInset: 8,
    toolbarEdgeButtonWidth: 42,
    toolbarHomeIconOffsetX: -2,
    toolbarTrailingIconOffsetX: 2,
    toolbarItemCellWidth: 46,
    toolbarItemIconOffsetX: -2,
    candidateItemSpacing: 10,
    candidateMinTouchWidth: 62,
    candidateSingleCharTouchWidth: 44,
    candidateTextHorizontalPadding: 8,
    candidateTextVerticalPadding: 3,
    candidateSelectedCornerRadius: 6,
    expandedCandidateItemSpacing: 8,
    expandedCandidateHeight: 48
  }
};
