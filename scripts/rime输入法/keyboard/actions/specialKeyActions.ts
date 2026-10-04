import type { KeyActionMap } from "../../contracts/action";

export function backspaceActionMap(): KeyActionMap {
  return {
    tap: { type: "backspace" },
    swipeLeft: { type: "clearComposition" },
    swipeUp: { type: "backspaceSwipeUp" },
    swipeDown: { type: "restoreDeleted" }
  };
}

export function spaceActionMap(options: {
  compositionActive: boolean;
  candidateCount: number;
  t9: boolean;
}): KeyActionMap {
  const actions: KeyActionMap = {
    tap: { type: "space" }
  };
  if (options.compositionActive) {
    if (options.candidateCount > 1) actions.swipeUp = { type: "selectCandidateOnPage", index: 1 };
    if (options.candidateCount > 2) actions.swipeDown = { type: "selectCandidateOnPage", index: 2 };
  } else if (options.t9) {
    actions.swipeUp = { type: "insertDirect", text: "0" };
  }
  return actions;
}


export function resolveBackspaceSwipeUp(hasComposition: boolean) {
  return hasComposition
    ? ({ type: "clearComposition" } as const)
    : ({ type: "deleteAll" } as const);
}
