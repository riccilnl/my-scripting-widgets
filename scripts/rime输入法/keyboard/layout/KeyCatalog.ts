import type { KeyboardCommand } from "../../contracts/action";
import type { KeyDefinition, KeyTextRole, KeyVisualRole } from "../../contracts/key";
import type { KeyActionHint, KeyActionHints } from "../../contracts/keyface";
import type { KeyActionPreferences, RuntimeT9CustomKey } from "../../contracts/preferences";
import { FROZEN_NUMERIC_DIGIT_ROWS } from "../../layout/numeric";
import { FROZEN_QWERTY_ROWS, qwertyLetter } from "../../layout/qwerty";
import { FROZEN_T9_ROWS, t9Digit } from "../../layout/t9";
import { backspaceActionMap, spaceActionMap } from "../actions/specialKeyActions";


function textHint(text: string): KeyActionHint {
  return { kind: "text", text };
}

function symbolHint(systemImage: string): KeyActionHint {
  return { kind: "symbol", systemImage };
}

function commandHint(command: KeyboardCommand | undefined): KeyActionHint | undefined {
  if (!command) return undefined;
  switch (command.type) {
    case "character":
    case "insertDirect":
    case "insertLiteral":
    case "rimeText": return textHint(command.text);
    case "backspace": return symbolHint("delete.left");
    case "space": return textHint("空格");
    case "return": return symbolHint("paperplane.fill");
    case "toggleAscii": return textHint("中/英");
    case "toggleShift": return textHint("⇧");
    case "clearComposition": return textHint("清");
    case "selectCandidateOnPage": return textHint(String(command.index + 1));
    case "backspaceSwipeUp": return textHint("删除");
    case "setSurface": return textHint(command.surface === "numeric" ? "123" : command.surface === "symbols" ? "符号" : "ABC");
    case "openClipboardHistory": return symbolHint("clipboard");
    case "openCommonPhrases": return symbolHint("text.bubble");
    case "moveCursor": return symbolHint(command.offset < 0 ? "arrow.left" : "arrow.right");
    case "moveLineStart": return symbolHint("text.line.first.and.arrowtriangle.forward");
    case "moveLineEnd": return symbolHint("text.line.last.and.arrowtriangle.forward");
    case "selectAll":
    case "toggleSelectAll": return symbolHint("selection.pin.in.out");
    case "cut": return symbolHint("scissors");
    case "copy": return symbolHint("doc.on.doc");
    case "paste": return symbolHint("doc.on.clipboard");
    case "deleteAll": return symbolHint("trash");
    case "restoreDeleted": return symbolHint("arrow.uturn.backward");
    case "nextKeyboard": return textHint("切换");
    case "keyboardHome": return symbolHint("house");
  }
}


function actionHints(definition: KeyDefinition): KeyActionHints {
  if (definition.semantic.kind !== "letter" && definition.semantic.kind !== "t9") return {};
  return {
    topLeft: commandHint(definition.actions.swipeUp),
    topRight: commandHint(definition.actions.swipeDown)
  };
}

export function actionKey(
  id: string,
  label: string | undefined,
  command: KeyboardCommand,
  visualRole: KeyVisualRole = "system",
  systemImage?: string,
  textRole: KeyTextRole = "function"
): KeyDefinition {
  return {
    id,
    semantic: systemImage
      ? { kind: "icon", systemImage }
      : { kind: "text", text: label ?? "", textRole },
    actions: { tap: command },
    visualRole
  };
}

export function characterKey(id: string, label: string, text = label): KeyDefinition {
  return {
    id,
    semantic: { kind: "text", text: label, textRole: "function" },
    actions: { tap: { type: "character", text } },
    visualRole: "normal"
  };
}

export function literalKey(
  id: string,
  label: string,
  text = label,
  textRole: KeyTextRole = "function"
): KeyDefinition {
  return {
    id,
    semantic: { kind: "text", text: label, textRole },
    actions: { tap: { type: "insertLiteral", text } },
    visualRole: "normal"
  };
}

export function spaceKey(
  id: string,
  allowsCustomLabel: boolean,
  options: { compositionActive: boolean; candidateCount: number; t9: boolean }
): KeyDefinition {
  return {
    id,
    semantic: { kind: "space", allowsCustomLabel },
    actions: spaceActionMap(options),
    visualRole: "normal"
  };
}

function shiftKey(): KeyDefinition {
  return {
    id: "shift",
    semantic: { kind: "shift" },
    actions: { tap: { type: "toggleShift" } },
    visualRole: "system"
  };
}

function backspaceKey(id: string): KeyDefinition {
  return {
    id,
    semantic: { kind: "icon", systemImage: "delete.left" },
    actions: backspaceActionMap(),
    visualRole: "system"
  };
}


function t9CustomKey(preferences: RuntimeT9CustomKey): KeyDefinition {
  return {
    id: "t9-delimiter",
    semantic: { kind: "text", text: preferences.label, textRole: "function" },
    actions: { tap: preferences.command },
    visualRole: "normal"
  };
}

function modeKey(id: string): KeyDefinition {
  return {
    id,
    semantic: { kind: "mode" },
    actions: { tap: { type: "toggleAscii" } },
    visualRole: "system"
  };
}

export type KeyboardKeyCatalog = {
  actionHintsByKeyId: Readonly<Record<string, KeyActionHints>>;
  qwertyRows: readonly (readonly KeyDefinition[])[];
  qwerty: {
    shift: KeyDefinition;
    backspace: KeyDefinition;
    numbers: KeyDefinition;
    comma: KeyDefinition;
    mode: KeyDefinition;
    enter: KeyDefinition;
  };
  t9Rows: readonly (readonly KeyDefinition[])[];
  t9: {
    symbols: KeyDefinition;
    numeric: KeyDefinition;
    mode: KeyDefinition;
    backspace: KeyDefinition;
    delimiter: KeyDefinition;
    enter: KeyDefinition;
  };
  numericRows: readonly (readonly KeyDefinition[])[];
  numeric: {
    symbols: KeyDefinition;
    abc: KeyDefinition;
    zero: KeyDefinition;
    backspace: KeyDefinition;
    dot: KeyDefinition;
    equal: KeyDefinition;
    enter: KeyDefinition;
  };
  symbols: {
    numbers: KeyDefinition;
    backspace: KeyDefinition;
  };
};

/**
 * Builds the key definitions whose command bindings cannot change during one
 * keyboard-extension lifetime. Settings are read once at mount, so recreating
 * these objects for every candidate/preedit render is pure allocation churn.
 */
export function createKeyboardKeyCatalog(
  actionPreferences: KeyActionPreferences,
  t9CustomKeyPreferences: RuntimeT9CustomKey
): KeyboardKeyCatalog {
  const qwertyRows = FROZEN_QWERTY_ROWS.map((row) =>
    row.map((ch) => qwertyLetter(ch, actionPreferences))
  );
  const t9Rows = FROZEN_T9_ROWS.map((row) =>
    row.map((item) => t9Digit(item.digit, item.letters, actionPreferences))
  );
  const actionHintsByKeyId: Record<string, KeyActionHints> = {};
  for (const definition of [...qwertyRows.flat(), ...t9Rows.flat()]) {
    actionHintsByKeyId[definition.id] = actionHints(definition);
  }

  return {
    actionHintsByKeyId,
    qwertyRows,
    qwerty: {
      shift: shiftKey(),
      backspace: backspaceKey("backspace"),
      numbers: actionKey("numbers", "123", { type: "setSurface", surface: "numeric" }),
      comma: characterKey("comma", ","),
      mode: modeKey("mode"),
      enter: actionKey("enter", undefined, { type: "return" }, "system", "paperplane.fill")
    },
    t9Rows,
    t9: {
      symbols: actionKey("t9-symbols", "符号", { type: "setSurface", surface: "symbols" }),
      numeric: actionKey("t9-numeric", "123", { type: "setSurface", surface: "numeric" }),
      mode: modeKey("t9-mode"),
      backspace: backspaceKey("t9-backspace"),
      delimiter: t9CustomKey(t9CustomKeyPreferences),
      enter: actionKey("t9-enter", undefined, { type: "return" }, "system", "paperplane.fill")
    },
    numericRows: FROZEN_NUMERIC_DIGIT_ROWS.map((row) =>
      row.map((value) => literalKey(`numeric-${value}`, value, value, "numeric"))
    ),
    numeric: {
      symbols: actionKey("numeric-symbols", "符号", { type: "setSurface", surface: "symbols" }),
      abc: actionKey("numeric-abc", "ABC", { type: "setSurface", surface: "main" }),
      zero: literalKey("numeric-0", "0", "0", "numeric"),
      backspace: backspaceKey("numeric-backspace"),
      dot: literalKey("numeric-dot", "."),
      equal: literalKey("numeric-equal", "="),
      enter: actionKey("numeric-enter", undefined, { type: "return" }, "system", "paperplane.fill")
    },
    symbols: {
      numbers: actionKey("symbol-numbers", "123", { type: "setSurface", surface: "numeric" }),
      backspace: backspaceKey("symbol-backspace")
    }
  };
}
