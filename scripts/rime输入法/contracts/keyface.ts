export type KeyFacePreferences = {
  uppercaseLetterLabels: boolean;
  showActionHints: boolean;
  showSpaceLabel: boolean;
  spaceLabel: string;
};

export type KeyActionHint =
  | { kind: "text"; text: string }
  | { kind: "symbol"; systemImage: string };

export type KeyActionHints = {
  topLeft?: KeyActionHint;
  topRight?: KeyActionHint;
};
