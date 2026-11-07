import type { KeyboardCommand } from "../../contracts/action";

/**
 * Rime not yet initialized: never leak a Chinese T9 digit or unfinished pinyin
 * into the host text field. Only explicitly literal operations are safe during
 * startup. After a confirmed startup failure, the UI switches to ASCII and
 * ordinary QWERTY character taps become safe too.
 */
export function executeUnreadyInputFallback(
  command: KeyboardCommand,
  failed: boolean,
  host: { insertText: (text: string) => void; deleteBackward: () => void; }
): boolean {
  switch (command.type) {
    case "insertDirect":
    case "insertLiteral":
      if (command.text) host.insertText(command.text);
      return true;
    case "space":
      host.insertText(" ");
      return true;
    case "return":
      host.insertText("\n");
      return true;
    case "backspace":
      host.deleteBackward();
      return true;
    case "character":
      if (!failed) return false;
      if (command.text) host.insertText(command.text);
      return true;
    case "rimeText":
      // Configured Rime shortcuts are not necessarily literal text.
      return false;
    default:
      return false;
  }
}
