import type { KeyActionMap, KeyboardCommand, KeyGesture } from "../../contracts/action";
import type { TouchIntentResolution } from "./TouchIntentMachine";

export function commandForKeyGesture(
  actions: KeyActionMap,
  gesture: KeyGesture
): KeyboardCommand | null {
  return actions[gesture] ?? null;
}

export function commandForTouchResolution(
  actions: KeyActionMap,
  resolution: TouchIntentResolution
): KeyboardCommand | null {
  if (resolution.type !== "gesture") return null;
  return commandForKeyGesture(actions, resolution.gesture);
}
