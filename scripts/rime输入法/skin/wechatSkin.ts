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
    keyboardBackground: "rgba(220,223,229,1)",
    foreground: "rgba(20,20,22,0.96)",
    secondaryForeground: "rgba(60,60,67,0.62)",
    keyBackgrounds: {
      normal: "rgba(255,255,255,1)",
      system: "rgba(183,188,198,1)",
      accent: "rgba(87,204,111,1)"
    },
    candidateSelectedBackground: "rgba(255,255,255,0.94)"
  },
  dark: {
    keyboardBackground: "rgba(32,33,36,1)",
    foreground: "rgba(250,250,250,0.96)",
    secondaryForeground: "rgba(235,235,245,0.62)",
    keyBackgrounds: {
      normal: "rgba(82,83,87,1)",
      system: "rgba(57,58,61,1)",
      accent: "rgba(70,184,92,1)"
    },
    candidateSelectedBackground: "rgba(96,97,101,0.94)"
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
