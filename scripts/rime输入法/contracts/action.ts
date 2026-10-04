export type SurfaceLayerId = "main" | "numeric" | "symbols";

export type KeyGesture =
  | "tap"
  | "swipeUp"
  | "swipeDown"
  | "swipeLeft"
  | "swipeRight"
  | "longPress";

export type InputCommand =
  | { type: "character"; text: string }
  | { type: "insertDirect"; text: string }
  | { type: "insertLiteral"; text: string }
  | { type: "rimeText"; text: string }
  | { type: "backspace" }
  | { type: "space" }
  | { type: "return" }
  | { type: "toggleAscii" }
  | { type: "toggleShift" }
  | { type: "clearComposition" };

export type CandidateCommand = {
  type: "selectCandidateOnPage";
  index: number;
};

export type ContextualCommand = {
  type: "backspaceSwipeUp";
};

export type SurfaceCommand =
  | { type: "setSurface"; surface: SurfaceLayerId }
  | { type: "openClipboardHistory" }
  | { type: "openCommonPhrases" };

export type EditCommand =
  | { type: "moveCursor"; offset: number }
  | { type: "moveLineStart" }
  | { type: "moveLineEnd" }
  | { type: "selectAll" }
  | { type: "toggleSelectAll" }
  | { type: "cut" }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "deleteAll" }
  | { type: "restoreDeleted" };

export type HostCommand =
  | EditCommand
  | { type: "nextKeyboard" }
  | { type: "keyboardHome" };

export type KeyboardCommand = InputCommand | CandidateCommand | ContextualCommand | SurfaceCommand | HostCommand;

export type KeyActionMap = {
  tap: KeyboardCommand;
  swipeUp?: KeyboardCommand;
  swipeDown?: KeyboardCommand;
  swipeLeft?: KeyboardCommand;
  swipeRight?: KeyboardCommand;
  longPress?: KeyboardCommand;
};
