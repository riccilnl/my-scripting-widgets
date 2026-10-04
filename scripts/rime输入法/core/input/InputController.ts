import type { InputCommand } from "../../contracts/action";
import type { RimeProcessResult, RimeSnapshot } from "../rime/RimeEngine";
import { KEY_BACKSPACE, KEY_RETURN, KEY_SPACE } from "../rime/keys";

type InputState = {
  shifted: boolean;
  capsLocked: boolean;
  lastShiftTapAt: number;
};

type InputEffect = {
  snapshot: RimeSnapshot;
  shifted: boolean;
  capsLocked: boolean;
  lastShiftTapAt: number;
  insertText?: string;
  deleteBackward?: boolean;
};

type InputEnginePort = {
  peek(): RimeSnapshot;
  hasComposition(): boolean;
  processKey(keyCode: number, modifiers?: number): RimeProcessResult;
  clearComposition(): RimeSnapshot;
  toggleAsciiMode(): RimeSnapshot;
  readonly asciiMode: boolean;
};

function hasComposition(snapshot: RimeSnapshot): boolean {
  return Boolean(snapshot.context?.preedit ?? "");
}

export class InputController {
  constructor(private readonly engine: InputEnginePort) {}

  dispatch(command: InputCommand, state: InputState, nowMs = Date.now()): InputEffect {
    switch (command.type) {
      case "toggleShift": {
        let shifted: boolean;
        let capsLocked: boolean;
        if (state.capsLocked) {
          capsLocked = false;
          shifted = false;
        } else if (nowMs - state.lastShiftTapAt < 430) {
          capsLocked = true;
          shifted = true;
        } else {
          capsLocked = false;
          shifted = !state.shifted;
        }
        return {
          snapshot: this.engine.peek(),
          shifted,
          capsLocked,
          lastShiftTapAt: nowMs,
        };
      }

      case "toggleAscii": {
        if (this.engine.hasComposition()) this.engine.clearComposition();
        const snapshot = this.engine.toggleAsciiMode();
        return {
          snapshot,
          shifted: false,
          capsLocked: false,
          lastShiftTapAt: state.lastShiftTapAt,
        };
      }

      case "character": {
        const text = state.shifted || state.capsLocked
          ? command.text.toUpperCase()
          : command.text;
        // Frozen 4.6.24 semantics: English/ascii input bypasses Rime entirely.
        if (this.engine.asciiMode) {
          return {
            snapshot: this.engine.peek(),
            shifted: state.capsLocked ? true : false,
            capsLocked: state.capsLocked,
            lastShiftTapAt: state.lastShiftTapAt,
            insertText: text
          };
        }
        const result = this.engine.processKey(text.charCodeAt(0));
        return {
          snapshot: result,
          shifted: state.capsLocked ? true : false,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
          insertText: !result.consumed ? text : undefined
        };
      }

      case "insertDirect": {
        return {
          snapshot: this.engine.peek(),
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
          insertText: command.text
        };
      }

      case "insertLiteral": {
        const before = this.engine.peek();
        // Frozen pressSymbol/pressNumericDigit/T9 delimiter contract:
        // no live composition => host literal; live Chinese composition => Rime.
        if (this.engine.asciiMode || !hasComposition(before)) {
          return {
            snapshot: before,
            shifted: state.shifted,
            capsLocked: state.capsLocked,
            lastShiftTapAt: state.lastShiftTapAt,
            insertText: command.text
          };
        }
        const result = this.engine.processKey(command.text.charCodeAt(0));
        return {
          snapshot: result,
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
          insertText: !result.consumed ? command.text : undefined
        };
      }

      case "rimeText": {
        // Frozen configured-action contract: Chinese text is offered to Rime one
        // code point at a time. This also supports verified multi-character Wanxiang
        // shortcuts such as `onl`, `orc`, and `osj`. English remains direct.
        if (this.engine.asciiMode) {
          return {
            snapshot: this.engine.peek(),
            shifted: state.shifted,
            capsLocked: state.capsLocked,
            lastShiftTapAt: state.lastShiftTapAt,
            insertText: command.text
          };
        }

        let snapshot: RimeSnapshot | null = null;
        let fallback = "";
        for (const ch of command.text) {
          const result = this.engine.processKey(ch.charCodeAt(0));
          snapshot = result;
          if (!result.consumed) fallback += ch;
        }
        return {
          snapshot: snapshot ?? this.engine.peek(),
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
          insertText: fallback || undefined
        };
      }

      case "clearComposition": {
        return {
          snapshot: this.engine.clearComposition(),
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt
        };
      }

      case "space": {
        const before = this.engine.peek();
        if (this.engine.asciiMode || !hasComposition(before)) {
          return {
            snapshot: before,
            shifted: state.shifted,
            capsLocked: state.capsLocked,
            lastShiftTapAt: state.lastShiftTapAt,
            insertText: " "
          };
        }
        const result = this.engine.processKey(KEY_SPACE);
        return {
          snapshot: result,
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
          insertText: !result.consumed ? " " : undefined
        };
      }

      case "return": {
        if (this.engine.asciiMode) {
          return {
            snapshot: this.engine.peek(),
            shifted: state.shifted,
            capsLocked: state.capsLocked,
            lastShiftTapAt: state.lastShiftTapAt,
            insertText: "\n"
          };
        }
        const result = this.engine.processKey(KEY_RETURN);
        return {
          snapshot: result,
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
          insertText: !result.consumed ? "\n" : undefined
        };
      }

      case "backspace": {
        const before = this.engine.peek();
        if (this.engine.asciiMode || !hasComposition(before)) {
          return {
            snapshot: before,
            shifted: state.shifted,
            capsLocked: state.capsLocked,
            lastShiftTapAt: state.lastShiftTapAt,
            deleteBackward: true
          };
        }
        const result = this.engine.processKey(KEY_BACKSPACE);
        return {
          snapshot: result,
          shifted: state.shifted,
          capsLocked: state.capsLocked,
          lastShiftTapAt: state.lastShiftTapAt,
        };
      }
    }
  }
}
