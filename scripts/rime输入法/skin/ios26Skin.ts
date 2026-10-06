import { DEFAULT_KEYBOARD_LAYOUT } from "../contracts/layout";
import type { KeyboardSkin } from "../contracts/skin";

/**
 * iOS 26 Chinese-keyboard-inspired skin.
 * Keeps the existing input model intact while moving the visible T9 column
 * rhythm and system-material styling closer to the native keyboard.
 */
export const IOS26_SKIN: KeyboardSkin = {
  id: "ios26",
  layoutDefaults: { ...DEFAULT_KEYBOARD_LAYOUT },
  geometry: {
    t9LeftColumn: { fraction: 0.19, min: 58, max: 82 },
    t9RightColumn: { fraction: 0.19, min: 58, max: 82 },
    numericLeftColumn: { fraction: 0.17, min: 50, max: 74 },
    numericRightColumn: { fraction: 0.19, min: 58, max: 82 }
  },
  typography: {
    keys: {
      letter: { fontSize: 27, fontWeight: "medium" },
      t9Letters: { fontSize: 20, fontWeight: "medium" },
      numeric: { fontSize: 24, fontWeight: "medium" },
      function: { fontSize: 16, fontWeight: "regular" },
      mode: { fontSize: 14, fontWeight: "medium" },
      candidate: { fontSize: 21, fontWeight: "regular" }
    },
    candidate: { fontSize: 21, fontWeight: "regular" },
    status: { fontSize: 13, fontWeight: "regular" },
    keyHint: { fontSize: 10, fontWeight: "regular" },
    t9DigitHint: { fontSize: 11, fontWeight: "medium" },
    contentPanel: {
      row: { fontSize: 16, fontWeight: "regular" },
      sectionTitle: { fontSize: 15, fontWeight: "semibold" }
    }
  },
  light: {
    keyboardBackground: "regularMaterial",
    foreground: "rgba(0,0,0,0.94)",
    secondaryForeground: "rgba(60,60,67,0.62)",
    candidateForeground: "rgba(0,0,0,0.94)",
    candidateSelectedForeground: "rgba(0,0,0,0.94)",
    t9PinyinBackground: "rgba(255,255,255,0.96)",
    keyBackgrounds: {
      normal: "rgba(255,255,255,0.96)",
      system: "rgba(184,189,199,0.96)",
      accent: "rgba(0,122,255,0.96)"
    },
    candidateSelectedBackground: "rgba(255,255,255,0.74)"
  },
  dark: {
    keyboardBackground: "regularMaterial",
    foreground: "rgba(255,255,255,0.96)",
    secondaryForeground: "rgba(235,235,245,0.62)",
    candidateForeground: "rgba(255,255,255,0.96)",
    candidateSelectedForeground: "rgba(255,255,255,0.96)",
    t9PinyinBackground: "rgba(92,92,96,0.94)",
    keyBackgrounds: {
      normal: "rgba(92,92,96,0.94)",
      system: "rgba(60,60,64,0.94)",
      accent: "rgba(10,132,255,0.96)"
    },
    candidateSelectedBackground: "rgba(118,118,122,0.70)"
  },
  visuals: {
    keyCornerRadius: 8,
    keyShadow: {
      color: "rgba(0,0,0,0.22)",
      radius: 0.8,
      x: 0,
      y: 1
    },
    iconSize: 20,
    keyPressScale: 0.975,
    keyPressOverlayOpacity: 0.10,
    keyHintQwertyHorizontalInset: 7,
    keyHintT9HorizontalInset: 8,
    keyHintTopInset: 6,
    keyHintSymbolSize: 11,
    keyHintMinScaleFactor: 0.45,
    keyPopupExtraWidth: 24,
    keyPopupGap: 4,
    keyPopupFontSize: 36,
    keyPopupCornerRadius: 9,
    keyPopupShadow: {
      color: "rgba(0,0,0,0.24)",
      radius: 2,
      x: 0,
      y: 1
    },
    toolbarIconSize: 20,
    toolbarHorizontalInset: 8,
    toolbarEdgeButtonWidth: 42,
    toolbarHomeIconOffsetX: -2,
    toolbarTrailingIconOffsetX: 2,
    toolbarItemCellWidth: 46,
    toolbarItemIconOffsetX: -2,
    candidateItemSpacing: 8,
    candidateMinTouchWidth: 62,
    candidateSingleCharTouchWidth: 44,
    candidateTextHorizontalPadding: 8,
    candidateTextVerticalPadding: 3,
    candidateSelectedCornerRadius: 8,
    expandedCandidateItemSpacing: 8,
    expandedCandidateHeight: 48
  }
};
