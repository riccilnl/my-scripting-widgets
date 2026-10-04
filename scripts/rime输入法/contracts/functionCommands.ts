import type { KeyboardCommand } from "./action";

const ENTRIES: readonly (readonly [string, KeyboardCommand])[] = [
  ["{left}", { type: "moveCursor", offset: -1 }],
  ["{right}", { type: "moveCursor", offset: 1 }],
  ["{home}", { type: "moveLineStart" }],
  ["{end}", { type: "moveLineEnd" }],
  ["{selectAll}", { type: "selectAll" }],
  ["{toggleSelectAll}", { type: "toggleSelectAll" }],
  ["{cut}", { type: "cut" }],
  ["{copy}", { type: "copy" }],
  ["{paste}", { type: "paste" }],
  ["{deleteAll}", { type: "deleteAll" }],
  ["{restoreDeleted}", { type: "restoreDeleted" }],
  ["{clearComposition}", { type: "clearComposition" }],
  ["{backspace}", { type: "backspace" }],
  ["{space}", { type: "space" }],
  ["{return}", { type: "return" }],
  ["{toggleAscii}", { type: "toggleAscii" }],
  ["{main}", { type: "setSurface", surface: "main" }],
  ["{numeric}", { type: "setSurface", surface: "numeric" }],
  ["{symbols}", { type: "setSurface", surface: "symbols" }],
  ["{nextKeyboard}", { type: "nextKeyboard" }],
  ["{keyboardHome}", { type: "keyboardHome" }],
  ["{clipboardHistory}", { type: "openClipboardHistory" }],
  ["{commonPhrases}", { type: "openCommonPhrases" }]
];

const BY_INSTRUCTION = new Map<string, KeyboardCommand>(ENTRIES);
const BY_SIGNATURE = new Map<string, string>();

function signature(command: KeyboardCommand): string {
  if (command.type === "moveCursor") return `${command.type}:${command.offset}`;
  if (command.type === "setSurface") return `${command.type}:${command.surface}`;
  return command.type;
}

for (const [instruction, command] of ENTRIES) {
  BY_SIGNATURE.set(signature(command), instruction);
}

export function resolveFunctionInstruction(value: string): KeyboardCommand | null {
  return BY_INSTRUCTION.get(value.trim()) ?? null;
}

export function functionInstructionForCommand(command: KeyboardCommand | null | undefined): string | null {
  return command ? BY_SIGNATURE.get(signature(command)) ?? null : null;
}
