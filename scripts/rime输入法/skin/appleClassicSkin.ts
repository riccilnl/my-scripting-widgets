import { DEFAULT_KEYBOARD_LAYOUT } from "../contracts/layout";
import type { KeyboardSkin } from "../contracts/skin";

/** Classic iPhone keyboard-inspired skin for the pre-Liquid-Glass visual era. */
export const APPLE_CLASSIC_SKIN: KeyboardSkin = {
  id: "apple-classic",
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
    keyboardBackground: "rgba(209,211,218,1)",
    foreground: "rgba(0,0,0,0.92)",
    secondaryForeground: "rgba(60,60,67,0.68)",
    keyBackgrounds: {
      normal: "rgba(255,255,255,1)",
      system: "rgba(174,179,188,1)",
      accent: "rgba(0,122,255,1)"
    },
    candidateSelectedBackground: "rgba(255,255,255,0.96)"
  },
  dark: {
    keyboardBackground: "rgba(28,28,30,1)",
    foreground: "rgba(255,255,255,0.94)",
    secondaryForeground: "rgba(235,235,245,0.60)",
    keyBackgrounds: {
      normal: "rgba(99,99,102,1)",
      system: "rgba(58,58,60,1)",
      accent: "rgba(10,132,255,1)"
    },
    candidateSelectedBackground: "rgba(99,99,102,0.96)"
  },
  visuals: {
    keyCornerRadius: 6,
    keyShadow: { color: "rgba(0,0,0,0.34)", radius: 0.7, x: 0, y: 1 },
    iconSize: 20,
    keyPressScale: 0.985,
    keyPressOverlayOpacity: 0.12,
    keyHintQwertyHorizontalInset: 7,
    keyHintT9HorizontalInset: 8,
    keyHintTopInset: 7,
    keyHintSymbolSize: 11,
    keyHintMinScaleFactor: 0.45,
    keyPopupExtraWidth: 22,
    keyPopupGap: 5,
    keyPopupFontSize: 36,
    keyPopupCornerRadius: 7,
    keyPopupShadow: { color: "rgba(0,0,0,0.30)", radius: 1.5, x: 0, y: 1 },
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
