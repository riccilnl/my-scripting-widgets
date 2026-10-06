import type { KeyTextRole, KeyVisualRole } from "./key";
import type { KeyboardLayoutDefaults } from "./layout";

export type SkinId = "wechat" | "ios26" | "apple-classic" | "classic";
export const DEFAULT_SKIN_ID: SkinId = "wechat";

export function normalizeSkinId(value: unknown): SkinId {
  return value === "ios26" || value === "apple-classic" || value === "classic" || value === "wechat"
    ? value
    : DEFAULT_SKIN_ID;
}

type TextStyle = {
  fontSize: number;
  fontWeight?: "regular" | "medium" | "semibold";
};

type SkinTypography = {
  keys: Record<KeyTextRole, TextStyle>;
  candidate: TextStyle;
  status: TextStyle;
  keyHint: TextStyle;
  t9DigitHint: TextStyle;
  contentPanel: {
    row: TextStyle;
    sectionTitle: TextStyle;
  };
};

export type SkinShapeStyle = string | Record<string, unknown>;

export type SkinShadowStyle = {
  color: string;
  radius: number;
  x?: number;
  y?: number;
};

export type SkinColumnRule = {
  fraction: number;
  min: number;
  max: number;
};

export type SkinGeometry = {
  t9LeftColumn: SkinColumnRule;
  t9RightColumn: SkinColumnRule;
  numericLeftColumn: SkinColumnRule;
  numericRightColumn: SkinColumnRule;
};

export type SkinColors = {
  keyboardBackground: SkinShapeStyle;
  foreground: string;
  secondaryForeground: string;
  candidateForeground: string;
  candidateSelectedForeground: string;
  t9PinyinBackground: SkinShapeStyle;
  keyBackgrounds: Record<KeyVisualRole, SkinShapeStyle>;
  keyBackgroundOverrides?: Partial<Record<string, SkinShapeStyle>>;
  candidateSelectedBackground: SkinShapeStyle;
};

export type KeyboardSkin = {
  id: SkinId;
  layoutDefaults: KeyboardLayoutDefaults;
  geometry: SkinGeometry;
  keyVisualRoleOverrides?: Partial<Record<string, KeyVisualRole>>;
  typography: SkinTypography;
  light: SkinColors;
  dark: SkinColors;
  visuals: {
    keyCornerRadius: number;
    keyShadow?: SkinShadowStyle;
    iconSize: number;
    keyPressScale: number;
    keyPressOverlayOpacity: number;
    keyHintQwertyHorizontalInset: number;
    keyHintT9HorizontalInset: number;
    keyHintTopInset: number;
    keyHintSymbolSize: number;
    keyHintMinScaleFactor: number;
    keyPopupExtraWidth: number;
    keyPopupGap: number;
    keyPopupFontSize: number;
    keyPopupCornerRadius: number;
    keyPopupShadow?: SkinShadowStyle;
    toolbarIconSize: number;
    toolbarHorizontalInset: number;
    toolbarEdgeButtonWidth: number;
    toolbarHomeIconOffsetX: number;
    toolbarTrailingIconOffsetX: number;
    toolbarItemCellWidth: number;
    toolbarItemIconOffsetX: number;
    candidateItemSpacing: number;
    candidateMinTouchWidth: number;
    candidateSingleCharTouchWidth: number;
    candidateTextHorizontalPadding: number;
    candidateTextVerticalPadding: number;
    candidateSelectedCornerRadius: number;
    expandedCandidateItemSpacing: number;
    expandedCandidateHeight: number;
  };
};
