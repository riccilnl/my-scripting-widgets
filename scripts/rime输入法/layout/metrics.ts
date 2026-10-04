import {
  DEFAULT_KEYBOARD_LAYOUT,
  KEYBOARD_BODY_HEIGHT_MAX,
  KEYBOARD_BODY_HEIGHT_MIN,
  TOP_SURFACE_HEIGHT_MAX,
  TOP_SURFACE_HEIGHT_MIN,
  type KeyboardLayoutDefaults,
  type KeyboardLayoutPreferences
} from "../contracts/layout";
import type { SkinColumnRule, SkinGeometry } from "../contracts/skin";

export const KEYBOARD_METRICS = {
  sidePadding: 4,
  keySpacing: 5,
  rowSpacing: 6,
  bottomPadding: 6
} as const;

export type ResolvedKeyboardLayout = {
  keyboardBodyHeight: number;
  topSurfaceHeight: number;
  requestedHeight: number;
};

export type KeyboardMetrics = {
  width: number;
  sidePadding: number;
  keySpacing: number;
  rowSpacing: number;
  keyHeight: number;
  candidateHeight: number;
  letterWidth: number;
  secondRowInset: number;
  secondRowLetterWidth: number;
  shiftWidth: number;
  thirdRowLetterWidth: number;
  bottom: {
    numbers: number;
    comma: number;
    space: number;
    mode: number;
    enter: number;
  };
  t9: {
    leftWidth: number;
    rightWidth: number;
    centerWidth: number;
    keyWidth: number;
    panelHeight: number;
    bottomNumbersWidth: number;
    bottomCommaWidth: number;
    bottomSpaceWidth: number;
    bottomModeWidth: number;
    enterOverlayHeight: number;
  };
  numeric: {
    leftWidth: number;
    rightWidth: number;
    centerWidth: number;
    keyWidth: number;
  };
  bodyHeight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveColumnWidth(width: number, rule: SkinColumnRule): number {
  const min = Math.max(0, finiteOr(rule.min, 0));
  const max = Math.max(min, finiteOr(rule.max, width));
  const fraction = clamp(finiteOr(rule.fraction, 0), 0, 1);
  return clamp(width * fraction, min, max);
}

export function resolveKeyboardLayout(
  preferences: KeyboardLayoutPreferences,
  skinDefaults: KeyboardLayoutDefaults
): ResolvedKeyboardLayout {
  const defaultBodyHeight = clamp(
    finiteOr(skinDefaults.keyboardBodyHeight, DEFAULT_KEYBOARD_LAYOUT.keyboardBodyHeight),
    KEYBOARD_BODY_HEIGHT_MIN,
    KEYBOARD_BODY_HEIGHT_MAX
  );
  const defaultTopHeight = clamp(
    finiteOr(skinDefaults.topSurfaceHeight, DEFAULT_KEYBOARD_LAYOUT.topSurfaceHeight),
    TOP_SURFACE_HEIGHT_MIN,
    TOP_SURFACE_HEIGHT_MAX
  );
  const keyboardBodyHeight = clamp(
    finiteOr(preferences.keyboardBodyHeightOverride, defaultBodyHeight),
    KEYBOARD_BODY_HEIGHT_MIN,
    KEYBOARD_BODY_HEIGHT_MAX
  );
  const topSurfaceHeight = clamp(
    finiteOr(preferences.topSurfaceHeightOverride, defaultTopHeight),
    TOP_SURFACE_HEIGHT_MIN,
    TOP_SURFACE_HEIGHT_MAX
  );
  return {
    keyboardBodyHeight,
    topSurfaceHeight,
    requestedHeight:
      keyboardBodyHeight + topSurfaceHeight +
      KEYBOARD_METRICS.rowSpacing + KEYBOARD_METRICS.bottomPadding
  };
}

export function resolveKeyboardMetrics(
  availableWidth: number,
  layout: ResolvedKeyboardLayout,
  geometry: SkinGeometry
): KeyboardMetrics {
  const sidePadding = KEYBOARD_METRICS.sidePadding;
  const keySpacing = KEYBOARD_METRICS.keySpacing;
  const rowSpacing = KEYBOARD_METRICS.rowSpacing;
  const width = Math.max(240, availableWidth - sidePadding * 2);

  const keyHeight = clamp(
    (layout.keyboardBodyHeight - rowSpacing * 3) / 4,
    26,
    66
  );
  const candidateHeight = layout.topSurfaceHeight;

  const letterWidth = (width - keySpacing * 9) / 10;
  const secondRowInset = Math.max(
    0,
    (width - letterWidth * 9 - keySpacing * 8) / 2
  );
  const secondRowLetterWidth = Math.max(
    20,
    (width - secondRowInset * 2 - keySpacing * 8) / 9
  );
  const baseShiftWidth = Math.max(
    letterWidth * 1.45,
    (width - letterWidth * 7 - keySpacing * 8) / 2
  );
  const shiftWidth = clamp(baseShiftWidth, letterWidth * 1.08, width * 0.22);
  const thirdRowLetterWidth = Math.max(
    20,
    (width - shiftWidth * 2 - keySpacing * 8) / 7
  );

  const actionWidth = clamp(width * 0.19, 52, 82);
  const baseNumbers = actionWidth;
  const baseComma = clamp(width * 0.105, 32, 40);
  const baseMode = baseComma;
  const baseEnter = actionWidth;
  const minSpace = Math.max(58, width * 0.24);
  const requestedFixed = baseNumbers + baseComma + baseMode + baseEnter + keySpacing * 4;
  const overflow = Math.max(0, requestedFixed + minSpace - width);
  const shrinkable = Math.max(1, baseNumbers + baseComma + baseMode + baseEnter);
  const shrink = Math.max(0.72, 1 - overflow / shrinkable);
  const numbers = baseNumbers * shrink;
  const comma = baseComma * shrink;
  const mode = baseMode * shrink;
  const enter = baseEnter * shrink;
  const space = Math.max(
    minSpace,
    width - numbers - comma - mode - enter - keySpacing * 4
  );

  const t9LeftWidth = resolveColumnWidth(width, geometry.t9LeftColumn);
  const t9RightWidth = resolveColumnWidth(width, geometry.t9RightColumn);
  const t9CenterWidth = width - t9LeftWidth - t9RightWidth - keySpacing * 2;
  const t9KeyWidth = (t9CenterWidth - keySpacing * 2) / 3;
  const t9PanelHeight = keyHeight * 3 + rowSpacing * 2;
  const t9BottomNumbersWidth = t9LeftWidth;
  const t9BottomCommaWidth = comma + 6;
  const t9BottomModeWidth = mode + 6;
  const t9BottomSpaceWidth = Math.max(
    44,
    width - t9BottomNumbersWidth - t9BottomCommaWidth -
      t9BottomModeWidth - t9RightWidth - keySpacing * 4
  );
  const t9EnterOverlayHeight = keyHeight * 2 + rowSpacing;

  const numericLeftWidth = resolveColumnWidth(width, geometry.numericLeftColumn);
  const numericRightWidth = resolveColumnWidth(width, geometry.numericRightColumn);
  const numericCenterWidth = width - numericLeftWidth - numericRightWidth - keySpacing * 2;
  const numericKeyWidth = (numericCenterWidth - keySpacing * 2) / 3;

  return {
    width,
    sidePadding,
    keySpacing,
    rowSpacing,
    keyHeight,
    candidateHeight,
    letterWidth,
    secondRowInset,
    secondRowLetterWidth,
    shiftWidth,
    thirdRowLetterWidth,
    bottom: { numbers, comma, space, mode, enter },
    t9: {
      leftWidth: t9LeftWidth,
      rightWidth: t9RightWidth,
      centerWidth: t9CenterWidth,
      keyWidth: t9KeyWidth,
      panelHeight: t9PanelHeight,
      bottomNumbersWidth: t9BottomNumbersWidth,
      bottomCommaWidth: t9BottomCommaWidth,
      bottomSpaceWidth: t9BottomSpaceWidth,
      bottomModeWidth: t9BottomModeWidth,
      enterOverlayHeight: t9EnterOverlayHeight
    },
    numeric: {
      leftWidth: numericLeftWidth,
      rightWidth: numericRightWidth,
      centerWidth: numericCenterWidth,
      keyWidth: numericKeyWidth
    },
    bodyHeight: keyHeight * 4 + rowSpacing * 3
  };
}
