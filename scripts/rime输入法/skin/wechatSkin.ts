import { DEFAULT_KEYBOARD_LAYOUT } from "../contracts/layout";
import type { KeyboardSkin } from "../contracts/skin";

/**
 * WeChat Keyboard-inspired skin for Chinese T9.
 * Keeps the custom Rime/T9 interaction model while matching WeChat Keyboard's
 * narrow left selector, larger three-key center, and independent right action rail.
 */
export const WECHAT_SKIN: KeyboardSkin = {
  id: "wechat",
  layoutDefaults: { ...DEFAULT_KEYBOARD_LAYOUT },
  geometry: {
    t9LeftColumn: { fraction: 0.158, min: 50, max: 62 },
    t9RightColumn: { fraction: 0.18, min: 58, max: 74 },
    numericLeftColumn: { fraction: 0.158, min: 50, max: 62 },
    numericRightColumn: { fraction: 0.18, min: 58, max: 74 }
  },
  keyVisualRoleOverrides: {
    "enter": "accent",
    "t9-enter": "accent",
    "numeric-enter": "accent"
  },
  typography: {
    keys: {
      letter: { fontSize: 26, fontWeight: "regular" },
      t9Letters: { fontSize: 21, fontWeight: "regular" },
      numeric: { fontSize: 23, fontWeight: "regular" },
      function: { fontSize: 16, fontWeight: "regular" },
      mode: { fontSize: 14, fontWeight: "medium" },
      candidate: { fontSize: 20, fontWeight: "regular" }
    },
    candidate: { fontSize: 20, fontWeight: "regular" },
    status: { fontSize: 13, fontWeight: "regular" },
    keyHint: { fontSize: 10, fontWeight: "regular" },
    t9DigitHint: { fontSize: 11, fontWeight: "regular" },
    contentPanel: {
      row: { fontSize: 16, fontWeight: "regular" },
      sectionTitle: { fontSize: 15, fontWeight: "semibold" }
    }
  },
  light: {
    keyboardBackground: "rgba(208,211,216,1)",
    foreground: "rgba(0,0,0,1)",
    secondaryForeground: "rgba(153,153,153,1)",
    candidateForeground: "rgba(66,66,66,1)",
    candidateSelectedForeground: "rgba(24,172,102,1)",
    t9PinyinBackground: "rgba(252,252,254,1)",
    keyBackgrounds: {
      normal: "rgba(252,252,254,1)",
      system: "rgba(183,188,196,1)",
      accent: "rgba(99,194,111,1)"
    },
    candidateSelectedBackground: "rgba(249,250,251,1)"
  },
  dark: {
    keyboardBackground: "rgba(44,44,44,1)",
    foreground: "rgba(253,253,253,1)",
    secondaryForeground: "rgba(174,174,174,1)",
    candidateForeground: "rgba(254,254,254,1)",
    candidateSelectedForeground: "rgba(0,230,142,1)",
    t9PinyinBackground: "rgba(101,101,101,1)",
    keyBackgrounds: {
      normal: "rgba(101,101,101,1)",
      system: "rgba(60,60,60,1)",
      accent: "rgba(0,177,117,1)"
    },
    candidateSelectedBackground: "rgba(103,103,103,1)"
  },
  visuals: {
    keyCornerRadius: 7,
    keyShadow: {
      color: "rgba(0,0,0,0.18)",
      radius: 0.7,
      x: 0,
      y: 1
    },
    iconSize: 20,
    keyPressScale: 0.982,
    keyPressOverlayOpacity: 0.10,
    keyHintQwertyHorizontalInset: 7,
    keyHintT9HorizontalInset: 8,
    keyHintTopInset: 6,
    keyHintSymbolSize: 11,
    keyHintMinScaleFactor: 0.45,
    keyPopupExtraWidth: 20,
    keyPopupGap: 5,
    keyPopupFontSize: 35,
    keyPopupCornerRadius: 8,
    keyPopupShadow: {
      color: "rgba(0,0,0,0.20)",
      radius: 1.5,
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
    candidateMinTouchWidth: 58,
    candidateSingleCharTouchWidth: 44,
    candidateTextHorizontalPadding: 8,
    candidateTextVerticalPadding: 3,
    candidateSelectedCornerRadius: 7,
    expandedCandidateItemSpacing: 8,
    expandedCandidateHeight: 48
  }
};
