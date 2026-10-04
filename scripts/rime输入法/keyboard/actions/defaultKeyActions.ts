import type { KeyActionMap, KeyboardCommand } from "../../contracts/action";
import type { ConfigurableKeyGesture, KeyActionPreferences } from "../../contracts/preferences";

export type ActionLayoutId = "t9" | "qwerty";

const QWERTY_SWIPE_UP_TEXT: Readonly<Record<string, string>> = {
  q: "1", w: "2", e: "3", r: "4", t: "5", y: "6", u: "7", i: "8", o: "9", p: "0",
  a: "、", s: "-", d: "=", f: "[", g: "]", h: "\\", j: "/", k: ":", l: '"',
  z: "\t", x: "[", c: "]", v: "<", b: ">", n: "!", m: "?"
};

const QWERTY_SWIPE_DOWN_TEXT: Readonly<Record<string, string>> = {
  q: "~", w: "@", e: "#", r: "$", t: "%", y: "^", u: "&", i: "*", o: "(", p: ")",
  a: "`", s: "_", d: "+", f: "{", g: "}", h: "|", j: ".", k: ";", l: "'",
  z: "V", x: "onl", c: "orc", v: "osj", b: "R", n: "N", m: "`"
};

function rimeText(text: string): KeyboardCommand {
  return { type: "rimeText", text };
}

export function defaultKeyGestureCommand(
  layout: ActionLayoutId,
  keyId: string,
  gesture: ConfigurableKeyGesture
): KeyboardCommand | undefined {
  if (layout === "t9") {
    if (gesture !== "swipeUp") return undefined;
    const match = /^t9-([1-9])$/.exec(keyId);
    return match ? { type: "insertDirect", text: match[1] } : undefined;
  }

  const match = /^letter-([a-z])$/.exec(keyId);
  if (!match) return undefined;
  const letter = match[1];
  if (gesture === "swipeUp") {
    const text = QWERTY_SWIPE_UP_TEXT[letter];
    return text == null ? undefined : rimeText(text);
  }
  if (gesture === "swipeDown") {
    const text = QWERTY_SWIPE_DOWN_TEXT[letter];
    if (text == null) return undefined;
    return letter === "j" ? { type: "insertDirect", text } : rimeText(text);
  }
  return undefined;
}

export function resolvedKeyGestureCommand(
  preferences: KeyActionPreferences,
  layout: ActionLayoutId,
  keyId: string,
  gesture: ConfigurableKeyGesture
): KeyboardCommand | undefined {
  const overrides = preferences[layout]?.[keyId];
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, gesture)) {
    return overrides[gesture] ?? undefined;
  }
  return defaultKeyGestureCommand(layout, keyId, gesture);
}

export function resolvedKeyActionMap(
  tap: KeyboardCommand,
  preferences: KeyActionPreferences,
  layout: ActionLayoutId,
  keyId: string
): KeyActionMap {
  const actions: KeyActionMap = { tap };
  const gestures: readonly ConfigurableKeyGesture[] = [
    "swipeUp",
    "swipeDown",
    "swipeLeft",
    "swipeRight",
    "longPress"
  ];
  for (const gesture of gestures) {
    const command = resolvedKeyGestureCommand(preferences, layout, keyId, gesture);
    if (command) actions[gesture] = command;
  }
  return actions;
}
