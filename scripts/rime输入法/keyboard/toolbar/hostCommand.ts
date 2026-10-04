import type { EditCommand, HostCommand, KeyboardCommand } from "../../contracts/action";

export type HostCommandPort = {
  edit: (command: EditCommand) => void;
  nextKeyboard: () => void;
  dismissToHome: () => void;
};

export function isEditCommand(command: KeyboardCommand): command is EditCommand {
  return command.type === "moveCursor" ||
    command.type === "moveLineStart" ||
    command.type === "moveLineEnd" ||
    command.type === "selectAll" ||
    command.type === "toggleSelectAll" ||
    command.type === "cut" ||
    command.type === "copy" ||
    command.type === "paste" ||
    command.type === "deleteAll" ||
    command.type === "restoreDeleted";
}

export function isHostCommand(command: KeyboardCommand): command is HostCommand {
  return isEditCommand(command) ||
    command.type === "nextKeyboard" ||
    command.type === "keyboardHome";
}

export function executeHostCommand(command: HostCommand, port: HostCommandPort) {
  if (isEditCommand(command)) {
    port.edit(command);
    return;
  }
  switch (command.type) {
    case "nextKeyboard":
      port.nextKeyboard();
      return;
    case "keyboardHome":
      port.dismissToHome();
      return;
  }
}
