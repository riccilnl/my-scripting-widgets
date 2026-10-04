import {
  DEFAULT_TOOLBAR_ITEMS,
  MAX_TOOLBAR_ITEMS,
  type ToolbarPreferences,
  type ToolbarToolId
} from "../contracts/preferences";
export { DEFAULT_TOOLBAR_ITEMS, MAX_TOOLBAR_ITEMS };
export type { ToolbarPreferences, ToolbarToolId } from "../contracts/preferences";

const TOOL_IDS = new Set<string>([
  "cursor-left",
  "line-start",
  "select-all",
  "cut",
  "copy",
  "paste",
  "line-end",
  "cursor-right",
  "delete-all",
  "restore-deleted",
  "clipboard",
  "common-phrases"
]);

export function defaultToolbarPreferences(): ToolbarPreferences {
  return { items: [...DEFAULT_TOOLBAR_ITEMS] };
}

export function normalizeToolbarPreferences(value: any): ToolbarPreferences {
  if (!Array.isArray(value?.items)) return defaultToolbarPreferences();
  const items: ToolbarToolId[] = [];
  const seen = new Set<string>();
  for (const raw of value.items) {
    if (typeof raw !== "string" || !TOOL_IDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    items.push(raw as ToolbarToolId);
    if (items.length >= MAX_TOOLBAR_ITEMS) break;
  }
  return { items };
}
export function appendToolbarTool(
  items: readonly ToolbarToolId[],
  id: ToolbarToolId
): ToolbarToolId[] {
  const normalized = normalizeToolbarPreferences({ items: [...items] }).items;
  if (!TOOL_IDS.has(id) || normalized.includes(id) || normalized.length >= MAX_TOOLBAR_ITEMS) {
    return normalized;
  }
  return [...normalized, id];
}

