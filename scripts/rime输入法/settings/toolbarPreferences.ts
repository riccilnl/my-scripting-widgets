import {
  DEFAULT_TOOLBAR_ITEMS,
  MAX_TOOLBAR_ITEMS,
  defaultToolbarPreferencesValue,
  normalizeToolbarPreferencesValue,
  type ToolbarPreferences,
  type ToolbarToolId
} from "../contracts/preferences";
export { DEFAULT_TOOLBAR_ITEMS, MAX_TOOLBAR_ITEMS };
export type { ToolbarPreferences, ToolbarToolId } from "../contracts/preferences";

export function defaultToolbarPreferences(): ToolbarPreferences {
  return defaultToolbarPreferencesValue();
}

export function normalizeToolbarPreferences(value: any): ToolbarPreferences {
  return normalizeToolbarPreferencesValue(value);
}

export function appendToolbarTool(
  items: readonly ToolbarToolId[],
  id: ToolbarToolId
): ToolbarToolId[] {
  return normalizeToolbarPreferencesValue({ items: [...items, id] }).items;
}
