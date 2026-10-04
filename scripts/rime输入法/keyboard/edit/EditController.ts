import type { EditCommand } from "../../contracts/action";

export type EditEffectPort = {
  clipboardText?: (text: string) => void;
};

type SelectAllSnapshot = {
  text: string;
  cursorBefore: number;
};

/**
 * Owns host-text selection/replacement/deletion semantics.
 * Rime composition is deliberately outside this controller.
 */
export class KeyboardEditController {
  private activeSelectAll = false;
  private snapshot: SelectAllSnapshot | null = null;
  private deletedText = "";


  private setSelectAllActive(active: boolean) {
    this.activeSelectAll = active;
  }

  private clearSelectionState() {
    this.snapshot = null;
    this.setSelectAllActive(false);
  }

  private clearForExternalAction() {
    if (!this.activeSelectAll && !this.snapshot) return;
    this.clearSelectionState();
  }

  private selectedTextSnapshot(): string {
    const before = CustomKeyboard.textBeforeCursor ?? "";
    const after = CustomKeyboard.textAfterCursor ?? "";
    const joined = `${before}${after}`;
    return joined || CustomKeyboard.allText || "";
  }

  private deleteDeletableTextAroundCursor(): string {
    const text = this.selectedTextSnapshot();
    if (!text) return "";
    const before = CustomKeyboard.textBeforeCursor ?? "";
    const after = CustomKeyboard.textAfterCursor ?? "";
    const deleteCount = before.length + after.length || text.length;
    if (after.length > 0) CustomKeyboard.moveCursor(after.length);
    for (let index = 0; index < deleteCount; index += 1) {
      CustomKeyboard.deleteBackward();
    }
    return text;
  }

  consumeSelectionForReplacement() {
    if (!this.activeSelectAll && !this.snapshot) return;
    try {
      if (CustomKeyboard.selectedText) {
        CustomKeyboard.deleteBackward();
      } else {
        try {
          CustomKeyboard.setMarkedText("", 0, 0);
          CustomKeyboard.unmarkText();
        } catch {}
        this.deleteDeletableTextAroundCursor();
      }
    } catch {}
    this.clearSelectionState();
  }

  consumeSelectionForDeletion(): boolean {
    if (!this.activeSelectAll && !this.snapshot) return false;
    const selected = CustomKeyboard.selectedText;
    if (selected) {
      this.deletedText = selected;
      try { CustomKeyboard.deleteBackward(); } catch {}
      this.clearSelectionState();
      return true;
    }
    const deleted = this.deleteDeletableTextAroundCursor() || this.snapshot?.text || "";
    if (deleted) this.deletedText = deleted;
    this.clearSelectionState();
    return true;
  }

  insertTextReplacingSelectAll(text: string) {
    if (!text) return;
    this.consumeSelectionForReplacement();
    CustomKeyboard.insertText(text);
  }

  private textSnapshot(): string {
    return CustomKeyboard.allText || this.selectedTextSnapshot();
  }

  selectAll() {
    try {
      const text = this.textSnapshot();
      if (!text) {
        this.clearSelectionState();
        return;
      }
      this.snapshot = {
        text,
        cursorBefore: CustomKeyboard.textBeforeCursor?.length ?? 0
      };

      const keyboard = CustomKeyboard as any;
      if (typeof keyboard.selectAll === "function") {
        keyboard.selectAll();
        this.setSelectAllActive(true);
        return;
      }
      if (typeof keyboard.setSelectionRange === "function") {
        keyboard.setSelectionRange(0, CustomKeyboard.allText?.length ?? 0);
        this.setSelectAllActive(true);
        return;
      }
      if (typeof keyboard.selectText === "function") {
        keyboard.selectText(0, CustomKeyboard.allText?.length ?? 0);
        this.setSelectAllActive(true);
        return;
      }

      const after = CustomKeyboard.textAfterCursor?.length ?? 0;
      if (after > 0) CustomKeyboard.moveCursor(after);
      for (let index = 0; index < text.length; index += 1) {
        CustomKeyboard.deleteBackward();
      }
      CustomKeyboard.setMarkedText(text, 0, text.length);
      this.setSelectAllActive(true);
    } catch {
      this.clearSelectionState();
    }
  }

  cancelSelectAll() {
    try {
      const snapshot = this.snapshot;
      if (!snapshot) {
        this.clearSelectionState();
        return;
      }
      if (CustomKeyboard.selectedText === snapshot.text) {
        CustomKeyboard.insertText(snapshot.text);
        const cursorFromEnd = snapshot.text.length - snapshot.cursorBefore;
        if (cursorFromEnd !== 0) CustomKeyboard.moveCursor(-cursorFromEnd);
      } else {
        try { CustomKeyboard.unmarkText(); } catch {}
      }
    } catch {}
    this.clearSelectionState();
  }

  toggleSelectAll() {
    if (this.activeSelectAll) this.cancelSelectAll();
    else this.selectAll();
  }

  private clearForCursorMove(offset = 0): boolean {
    if (!this.activeSelectAll && !this.snapshot) return false;
    try {
      const snapshot = this.snapshot;
      if (snapshot) {
        CustomKeyboard.insertText(snapshot.text);
        if (offset < 0) CustomKeyboard.moveCursor(-snapshot.text.length);
      } else {
        try { CustomKeyboard.unmarkText(); } catch {}
      }
    } catch {}
    this.clearSelectionState();
    return true;
  }

  moveCursor(offset: number) {
    if (this.clearForCursorMove(offset)) return;
    try { CustomKeyboard.moveCursor(offset); } catch {}
  }

  moveLineStart() {
    if (this.clearForCursorMove(-1)) return;
    try {
      const before = CustomKeyboard.textBeforeCursor ?? "";
      const lastLineFeed = before.lastIndexOf("\n");
      const lastCarriageReturn = before.lastIndexOf("\r");
      const lastLineBreak = Math.max(lastLineFeed, lastCarriageReturn);
      const distance = before.length - lastLineBreak - 1;
      if (distance > 0) CustomKeyboard.moveCursor(-distance);
    } catch {}
  }

  moveLineEnd() {
    if (this.clearForCursorMove(1)) return;
    try {
      const after = CustomKeyboard.textAfterCursor ?? "";
      const lineFeed = after.indexOf("\n");
      const carriageReturn = after.indexOf("\r");
      const distances = [lineFeed, carriageReturn].filter((value) => value >= 0);
      const distance = distances.length > 0 ? Math.min(...distances) : after.length;
      if (distance > 0) CustomKeyboard.moveCursor(distance);
    } catch {}
  }

  async copy(effects?: EditEffectPort) {
    try {
      const text = CustomKeyboard.selectedText ?? "";
      if (!text) return;
      await Pasteboard.setString(text);
      try { effects?.clipboardText?.(text); } catch {}
      this.clearForExternalAction();
    } catch {}
  }

  async cut(effects?: EditEffectPort) {
    try {
      const text = CustomKeyboard.selectedText ?? "";
      if (!text) return;
      await Pasteboard.setString(text);
      try { effects?.clipboardText?.(text); } catch {}
      this.deletedText = text;
      this.clearForExternalAction();
      CustomKeyboard.deleteBackward();
    } catch {}
  }

  async paste(effects?: EditEffectPort) {
    try {
      const text = await Pasteboard.getString();
      if (!text) return;
      try { effects?.clipboardText?.(text); } catch {}
      this.insertTextReplacingSelectAll(text);
    } catch {}
  }

  rememberDeletedText(text: string) {
    if (text) this.deletedText = text;
  }

  deleteAll() {
    try {
      if (this.activeSelectAll || this.snapshot) {
        this.consumeSelectionForDeletion();
        return;
      }
      if (CustomKeyboard.selectedText) {
        this.deletedText = CustomKeyboard.selectedText;
        CustomKeyboard.deleteBackward();
        this.clearSelectionState();
        return;
      }
      const text = this.selectedTextSnapshot();
      if (!text) {
        this.clearForExternalAction();
        return;
      }
      this.clearForExternalAction();
      this.deletedText = text;
      this.deleteDeletableTextAroundCursor();
    } catch {}
  }

  restoreDeleted() {
    if (!this.deletedText) return;
    this.insertTextReplacingSelectAll(this.deletedText);
  }

  execute(command: EditCommand, effects?: EditEffectPort) {
    switch (command.type) {
      case "moveCursor":
        this.moveCursor(command.offset);
        return;
      case "moveLineStart":
        this.moveLineStart();
        return;
      case "moveLineEnd":
        this.moveLineEnd();
        return;
      case "selectAll":
        this.selectAll();
        return;
      case "toggleSelectAll":
        this.toggleSelectAll();
        return;
      case "copy":
        void this.copy(effects);
        return;
      case "cut":
        void this.cut(effects);
        return;
      case "paste":
        void this.paste(effects);
        return;
      case "deleteAll":
        this.deleteAll();
        return;
      case "restoreDeleted":
        this.restoreDeleted();
        return;
    }
  }
}
