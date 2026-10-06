import {
  CLIPBOARD_HISTORY_STORAGE_KEY,
  COMMON_PHRASES_STORAGE_KEY,
  normalizeClipboardHistoryValue,
  normalizeCommonPhraseCategoriesValue,
  prependClipboardHistoryValue,
  removeClipboardHistoryItemValue,
  visibleCommonPhraseCategoriesValue,
  type CommonPhraseCategory
} from "../../contracts/auxiliary";

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
}

function readShared(key: string): unknown {
  const storage = storageApi();
  if (!storage) return null;
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(key, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(key, SHARED_STORAGE_OPTIONS)
      : null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function writeShared(key: string, value: unknown): boolean {
  const storage = storageApi();
  if (!storage) return false;
  try {
    if (typeof storage.set === "function") {
      return storage.set(key, value, SHARED_STORAGE_OPTIONS) !== false;
    }
    if (typeof storage.setString === "function") {
      storage.setString(key, JSON.stringify(value), SHARED_STORAGE_OPTIONS);
      return true;
    }
  } catch {}
  return false;
}

export function loadClipboardHistory(): string[] {
  return normalizeClipboardHistoryValue(readShared(CLIPBOARD_HISTORY_STORAGE_KEY));
}

export function saveClipboardHistory(value: readonly string[]): string[] | null {
  const normalized = normalizeClipboardHistoryValue(value);
  return writeShared(CLIPBOARD_HISTORY_STORAGE_KEY, normalized) ? normalized : null;
}

export function prependClipboardHistory(items: readonly string[], text: string): string[] {
  return prependClipboardHistoryValue(items, text);
}

export function removeClipboardHistoryItem(items: readonly string[], text: string): string[] {
  return removeClipboardHistoryItemValue(items, text);
}

export function loadVisibleCommonPhraseCategories(): CommonPhraseCategory[] {
  return visibleCommonPhraseCategoriesValue(
    normalizeCommonPhraseCategoriesValue(readShared(COMMON_PHRASES_STORAGE_KEY))
  );
}

export function recordClipboardText(text: string): string[] | null {
  if (!text.trim()) return loadClipboardHistory();
  return saveClipboardHistory(prependClipboardHistory(loadClipboardHistory(), text));
}
