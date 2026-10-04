import type { KeyboardCommand } from "../../contracts/action";
import type { ToolbarToolId } from "../../contracts/preferences";
import type { ToolbarItem } from "./ToolbarStrip";

export type ToolbarToolDescriptor = {
  id: ToolbarToolId;
  title: string;
  systemImage: string;
  command: KeyboardCommand;
  opticalOffsetY?: number;
};

export const TOOLBAR_TOOL_CATALOG: readonly ToolbarToolDescriptor[] = [
  { id: "cursor-left", title: "光标左移", systemImage: "arrow.left", command: { type: "moveCursor", offset: -1 } },
  { id: "line-start", title: "行首", systemImage: "text.line.first.and.arrowtriangle.forward", command: { type: "moveLineStart" } },
  { id: "select-all", title: "全选", systemImage: "selection.pin.in.out", command: { type: "toggleSelectAll" } },
  { id: "cut", title: "剪切", systemImage: "scissors", command: { type: "cut" }, opticalOffsetY: 1 },
  { id: "copy", title: "复制", systemImage: "doc.on.doc", command: { type: "copy" } },
  { id: "paste", title: "粘贴", systemImage: "doc.on.clipboard", command: { type: "paste" } },
  { id: "line-end", title: "行尾", systemImage: "text.line.last.and.arrowtriangle.forward", command: { type: "moveLineEnd" } },
  { id: "cursor-right", title: "光标右移", systemImage: "arrow.right", command: { type: "moveCursor", offset: 1 } },
  { id: "delete-all", title: "清空", systemImage: "trash", command: { type: "deleteAll" } },
  { id: "restore-deleted", title: "恢复删除", systemImage: "arrow.uturn.backward", command: { type: "restoreDeleted" } },
  { id: "clipboard", title: "剪贴板", systemImage: "clipboard", command: { type: "openClipboardHistory" } },
  { id: "common-phrases", title: "常用语", systemImage: "text.bubble", command: { type: "openCommonPhrases" } }
];

const TOOL_BY_ID = new Map(TOOLBAR_TOOL_CATALOG.map((item) => [item.id, item] as const));

export function toolbarItemsForIds(ids: readonly ToolbarToolId[]): ToolbarItem[] {
  const result: ToolbarItem[] = [];
  for (const id of ids) {
    const item = TOOL_BY_ID.get(id);
    if (!item) continue;
    result.push({
      id: item.id,
      systemImage: item.systemImage,
      command: item.command,
      opticalOffsetY: item.opticalOffsetY
    });
  }
  return result;
}
