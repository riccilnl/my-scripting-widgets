import type { KeyActionMap } from "./action";

export type KeyTextRole =
  | "letter"
  | "t9Letters"
  | "numeric"
  | "function"
  | "mode"
  | "candidate";

export type KeyVisualRole = "normal" | "system" | "accent";

type KeySemantic =
  | { kind: "letter"; text: string }
  | { kind: "t9"; digit: string; letters: string }
  | { kind: "text"; text: string; textRole?: KeyTextRole }
  | { kind: "icon"; systemImage: string }
  | { kind: "shift" }
  | { kind: "space"; allowsCustomLabel?: boolean }
  | { kind: "mode" };

export type KeyDefinition = {
  id: string;
  semantic: KeySemantic;
  visualRole: KeyVisualRole;
  actions: KeyActionMap;
};

export type KeyFaceModel = {
  centerText?: string;
  centerImage?: string;
  centerTextRole: KeyTextRole;
  topLeftText?: string;
  topRightText?: string;
  bottomRightText?: string;
  topLeftActive?: boolean;
  topRightActive?: boolean;
  bottomRightActive?: boolean;
  centerFontSizeOverride?: number;
  bottomRightFontSize?: number;
};
